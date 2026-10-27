"""DroneLab physics, regression and UI checks in the installed Edge browser.
Run: python tests/browser_smoke.py
No external web requests or JavaScript dependencies are required.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='msedge', headless=True)
            page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            url = f'http://127.0.0.1:{server.server_port}/projets/drone-lab/'
            page.goto(url, wait_until='networkidle')
            page.wait_for_selector('#mass', state='attached')
            results = page.evaluate('''async () => {
              const {Simulation,Controller,config,PRESETS,DT,allocate}=await import('./core.js');
              const {norm,sub,G,fromEuler}=await import('./math.js');
              const {csv,configuration,generateC}=await import('./exports.js');
              const checks=[];
              const check=(name,ok,detail)=>{checks.push({name,ok,...detail});};
              function run(c={},seconds=60,action=null){const sim=new Simulation(c);sim.start();for(let i=0;i<seconds/DT;i++){if(action)action(sim,i);sim.step();}return sim;}
              const nominal={wind:0,gust:0,noise:0,feedback:'truth',mission:'hover'};
              let s=run(nominal,30);
              check('ideal_hover',Math.abs(s.s.p[2]-5)<.12&&norm(s.s.v)<.1,{p:s.s.p,v:s.s.v,mode:s.mode});
              for(const mission of ['hover','square','circle','eight']){
                s=run({mission},90);
                const tail=s.history.filter(r=>r.t>60),rms=Math.sqrt(tail.reduce((v,r)=>v+r.error*r.error,0)/tail.length);
                check(mission+'_sensors',s.mode!=='crashed'&&rms<1.5&&Math.abs(norm(s.s.q)-1)<1e-6,{rms,p:s.s.p,mode:s.mode,est:norm(sub(s.s.p,s.estimate.p))});
              }
              for(const [name,preset] of Object.entries(PRESETS)){
                s=run({...preset,mission:'hover'},35);
                check('preset_'+name,s.mode!=='crashed'&&Math.abs(s.s.p[2]-5)<.5,{p:s.s.p,mode:s.mode});
              }
              s=run({mission:'hover'},40,(s,i)=>{if(i===240*20)s.disturb();});
              check('disturbance_recovery',norm(sub(s.s.p,[0,0,5]))<.6&&norm(s.s.v)<.4,{p:s.s.p,v:s.s.v});
              s=run({mission:'hover'},50,(s,i)=>{if(i===240*20)s.dropout=true;});
              check('gnss_loss_landing',s.mode==='landed'&&s.events.some(e=>e.message.includes('GNSS indisponible')),{p:s.s.p,mode:s.mode,events:s.events});
              s=run({mission:'hover'},45,(s,i)=>{if(i===240*20)s.land();});
              check('controlled_landing',s.mode==='landed'&&s.motors.every(f=>f===0),{mode:s.mode,p:s.s.p});
              s=run({mission:'square'},65,(s,i)=>{if(i===240*25)s.rtl();});
              check('rtl_landing',s.mode==='landed'&&Math.hypot(...s.s.p.slice(0,2))<1,{mode:s.mode,p:s.s.p});
              s=run({mission:'circle'},50,(s,i)=>{if(i===240*20)s.rtl();if(i===240*21)s.dropout=true;});
              check('gnss_loss_during_rtl',s.events.some(e=>e.message.includes('GNSS indisponible'))&&['landed','land'].includes(s.mode),{mode:s.mode});
              s=run({mission:'hover'},30,(s,i)=>{if(i===240*15)s.battery=.19;});
              check('low_battery_rtl',s.events.some(e=>e.message.includes('Batterie faible')),{mode:s.mode});
              s=run({mission:'hover'},20,(s,i)=>{if(i===240*10)s.s.p[0]=40;});
              check('geofence_detected',s.events.some(e=>e.message.includes('Limite de vol')),{mode:s.mode});
              s=run({mission:'hover'},30,(s,i)=>{if(i===240*20)s.failedMotor=0;});
              check('motor_failure_reported',s.events.some(e=>e.message.includes('Panne moteur'))&&['land','landed','crashed'].includes(s.mode),{mode:s.mode});
              const a=run({mission:'hover',seed:12},12),b=run({mission:'hover',seed:12},12);
              check('deterministic_seed',JSON.stringify(a.history)===JSON.stringify(b.history),{});
              const alloc=allocate(config(),G*1.5,[0,0,0]);
              check('hover_allocation',alloc.forces.every(f=>Math.abs(f-G*1.5/4)<1e-9)&&!alloc.saturated,{});
              const out=allocate(config(),1000,[20,-30,4]);check('actuator_limits',out.saturated&&out.forces.every(f=>f>=0&&f<=9),{});
              let rejected=0;for(const bad of [{mass:NaN},{mass:-1},{inertia:[1,2]},{mass:10,thrust:1},{speed:Infinity}]){try{config(bad);}catch{rejected++;}}
              check('invalid_configuration_rejected',rejected===5,{rejected});
              const lines=csv(a).split('\\n').map(r=>r.split(','));check('csv_schema',lines.length>2&&lines.every(r=>r.length===lines[0].length),{rows:lines.length,columns:lines[0].length});
              const c=generateC(await (await fetch('controller.c')).text(),config({mass:2,thrust:12}));check('c_export_configuration',c.includes('2.000000000000000')&&c.includes('dl_step'),{});
              // Expose numerical traces to the optional native C parity test.
              const ctl=new Controller(config()),trace=[];
              for(let i=0;i<100;i++){
                const state={p:[.1*Math.sin(i*.1),-.2,2],v:[.1,.2,-.1],q:fromEuler(.1*Math.sin(i*.05),.2*Math.cos(i*.04),.4),w:[.03*Math.sin(i),-.02,.01]};
                const target={p:[1,1,5],v:[0,0,0],a:[0,0,0],yaw:.1};
                trace.push({state,target,out:ctl.update(state,target,DT).forces});
              }
              return {checks,trace};
            }''')
            for check in results['checks']:
                print(json.dumps(check, ensure_ascii=False))
            artifact = ROOT / '.test-artifacts'
            artifact.mkdir(exist_ok=True)
            (artifact / 'controller-trace.json').write_text(json.dumps(results['trace']), encoding='utf-8')
            page.get_by_role('button', name='Appliquer et réinitialiser').click()
            assert page.locator('#toast').inner_text().startswith('Configuration appliquée'), 'Valid default configuration must apply'
            page.get_by_role('button', name='Drone', exact=True).click()
            for preset in ['micro', 'heavy', 'standard']:
                page.locator('#preset').select_option(preset)
                page.get_by_role('button', name='Appliquer et réinitialiser').click()
                assert page.locator('#toast').inner_text().startswith('Configuration appliquée'), f'{preset} must apply: ' + page.locator('#toast').inner_text()
            page.get_by_role('button', name='Mission', exact=True).click()
            page.get_by_role('button', name='Lancer la mission').click()
            page.wait_for_timeout(1200)
            assert page.get_by_role('button', name='Pause').is_visible()
            page.get_by_role('button', name='Pause').click()
            before = page.locator('#elapsed').inner_text()
            page.wait_for_timeout(250)
            assert page.locator('#elapsed').inner_text() == before, 'Pause must stop simulation time'
            page.get_by_role('button', name='Drone', exact=True).click()
            page.locator('#mass').fill('-1')
            page.get_by_role('button', name='Appliquer et réinitialiser').click()
            assert page.locator('#toast.error').is_visible(), 'Invalid mass must be rejected'
            page.get_by_role('button', name='Rétablir les paramètres initiaux').click()
            page.get_by_role('button', name='Exports', exact=True).click()
            with page.expect_download() as event:
                page.locator('#exportC').click()
            exported = event.value
            exported.save_as(artifact / 'dronelab_controller.c')
            assert 'dl_step' in (artifact / 'dronelab_controller.c').read_text(encoding='utf-8')
            page.get_by_role('button', name='Mission', exact=True).click()
            page.screenshot(path=str(artifact / 'desktop.png'), full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            page.wait_for_timeout(150)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
            page.screenshot(path=str(artifact / 'mobile.png'), full_page=True)
            assert not errors, errors
            failures = [c for c in results['checks'] if not c['ok']]
            assert not failures, json.dumps(failures, ensure_ascii=False, indent=2)
            print(f"PASS: {len(results['checks'])} numerical checks + browser controls, C download, mobile layout, no JS errors")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()
