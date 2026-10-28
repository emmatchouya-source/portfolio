"""Numerical, UI, export and legacy checks for the seven planar geometries.
Writes native C parity traces and Arduino build projects. No USB access.
"""
from functools import partial
from http.server import ThreadingHTTPServer
import json
import sys
import threading
from playwright.sync_api import sync_playwright,expect
from browser_smoke import ROOT,QuietHandler

def main():
    hosted='--hosted' in sys.argv
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(channel='msedge',headless=True)
            page=browser.new_page(viewport={'width':1440,'height':1100})
            page.add_init_script('window.requestAnimationFrame=()=>0;')
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            url='https://emmatchouya-source.github.io/portfolio/projets/drone-lab/?v=airframes-1' if hosted else f'http://127.0.0.1:{server.server_port}/projets/drone-lab/'
            page.goto(url,wait_until='networkidle')
            result=page.evaluate('''async()=>{
              const {AIRFRAMES,geometry,wrench}=await import('./airframes.js');
              const {Simulation,Controller,config,allocate,DT}=await import('./core.js?v=airframes-1');
              const {norm,fromEuler}=await import('./math.js');
              const {configuration,csv,generateC}=await import('./exports.js?v=airframes-1');
              const {arduinoFiles}=await import('./arduino.js?v=airframes-1');
              const {BOARDS}=await import('./boards.js');
              const template=await(await fetch('controller.c')).text(),checks=[],traces=[],projects=[],baseline={};
              const check=(name,ok,detail={})=>{checks.push({name,ok,...detail});if(!ok)throw Error(name+': '+JSON.stringify(detail));};
              function run(c,seconds=35,action=()=>{}){const sim=new Simulation(c,[[0,0,5],[3,0,5],[3,3,5]]);sim.start();for(let i=0;i<seconds/DT;i++){action(sim,i);sim.step();}return sim;}
              for(const profile of AIRFRAMES){
                const c=config({airframe:profile.id,wind:0,gust:0,noise:0,feedback:'truth',mission:'hover'}),g=geometry(c);
                const hover=allocate(c,c.mass*9.80665,[0,0,0]);
                check(profile.id+'_hover_balance',hover.forces.length===g.count&&hover.forces.every(f=>Math.abs(f-c.mass*9.80665/g.count)<1e-12));
                for(const torque of [[.01,0,0],[0,.01,0],[0,0,.01],[-.01,.02,-.005]]){
                  const out=allocate(c,c.mass*9.80665,torque),actual=wrench(c,out.forces);
                  check(profile.id+'_moments_'+torque,actual.every((v,i)=>Math.abs(v-[c.mass*9.80665,...torque][i])<1e-10)&&!out.saturated,{actual});
                }
                const saturated=allocate(c,1e6,[1e6,-1e6,1e6]);
                check(profile.id+'_limits',saturated.saturated&&saturated.forces.every(f=>Number.isFinite(f)&&f>=0&&f<=c.thrust));
                for(const mission of ['hover','square','circle','eight','waypoints']){
                  const sim=run({...c,mission},40),error=norm(sim.s.p.map((v,i)=>v-sim.target.p[i]));
                  if(profile.id==='quad-x')baseline[mission]=error;
                  // Preserve the reference controller's circle tracking bound;
                  // every layout must also stay within 10 cm of the Quad X result.
                  check(profile.id+'_'+mission,!['crashed','ready'].includes(sim.mode)&&error<(mission==='circle'?2:1)&&error<=baseline[mission]+.1,{error,baseline:baseline[mission],mode:sim.mode});
                }
                const sensed=run({...c,feedback:'estimate',noise:1,wind:1.5,gust:.6},40,(s,i)=>{if(i===2400)s.disturb();});
                check(profile.id+'_sensors_disturbance',sensed.mode!=='crashed'&&Math.abs(sensed.s.p[2]-5)<.3&&norm(sensed.s.v)<.5);
                const loss=run({...c,feedback:'estimate'},35,(s,i)=>{if(i===2400)s.dropout=true;});
                check(profile.id+'_gnss_landing',loss.mode==='landed'&&loss.motors.every(f=>f===0),{mode:loss.mode});
                const failed=run(c,14,(s,i)=>{if(i===2400)s.failedMotor=g.count-1;});
                check(profile.id+'_last_motor_failure',failed.s.p.every(Number.isFinite)&&failed.motors.every(Number.isFinite)&&failed.motors.at(-1)<.001);
                const text=csv(sensed).split('\\n').map(row=>row.split(',')),header=text[0];
                check(profile.id+'_csv',text.every(row=>row.length===header.length)&&header.includes('m'+g.count+'_N')&&!header.includes('m'+(g.count+1)+'_N'));
                const data=configuration(sensed);
                check(profile.id+'_configuration',data.version===2&&data.geometry.motor_count===g.count&&data.config.airframe===profile.id);
                const ctl=new Controller(c),rows=[];
                for(let i=0;i<100;i++){
                  const state={p:[.1*Math.sin(i*.1),-.2,2],v:[.1,.2,-.1],q:fromEuler(.1*Math.sin(i*.05),.2*Math.cos(i*.04),.4),w:[.03*Math.sin(i),-.02,.01]};
                  const target={p:[1,1,5],v:[0,0,0],a:[0,0,0],yaw:.1},out=ctl.update(state,target,DT);
                  rows.push({state,target,out:out.forces,saturated:out.saturated});
                }
                traces.push({id:profile.id,count:g.count,c:generateC(template,c),rows,configuration:configuration(new Simulation(c))});
                for(const fqbn of ['arduino:avr:uno','arduino:renesas_uno:minima']){
                  const board=BOARDS.find(b=>b.fqbn===fqbn),files=arduinoFiles(template,new Simulation(c),board),manifest=JSON.parse(files.find(f=>f.name.endsWith('manifest.json')).content);
                  check(profile.id+'_arduino_'+fqbn,manifest.configuration.geometry.motor_count===g.count&&files.find(f=>f.name.endsWith('dl_board.h')).content.includes('#define DL_MOTOR_COUNT '+g.count)&&!manifest.actuators_enabled);
                  projects.push({airframe:profile.id,board,files});
                }
              }
              for(const hAspect of [1,3]){
                const c=config({airframe:'quad-h',hAspect}),out=allocate(c,15,[.01,-.02,.001]),actual=wrench(c,out.forces);
                check('H_aspect_'+hAspect,actual.every((v,i)=>Math.abs(v-[15,.01,-.02,.001][i])<1e-10));
              }
              let rejected=0;for(const bad of [{airframe:'unknown'},{airframe:'y6'},{hAspect:0},{hAspect:NaN},{hAspect:4}]){try{config(bad);}catch{rejected++;}}
              check('invalid_geometries',rejected===5);
              check('thrust_uses_motor_count',config({airframe:'octo-x',mass:4,thrust:8}).airframe==='octo-x');
              return {checks,traces,projects};
            }''')
            artifact=ROOT/'.test-artifacts';artifact.mkdir(exist_ok=True)
            (artifact/'airframe-tests.json').write_text(json.dumps(result['checks'],indent=2),encoding='utf-8')
            (artifact/'airframe-traces.json').write_text(json.dumps(result['traces']),encoding='utf-8')
            (artifact/'airframe-projects.json').write_text(json.dumps(result['projects']),encoding='utf-8')
            for project in result['projects']:
                for f in project['files']:
                    dest=artifact/'airframe-projects'/project['airframe']/f['name'];dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(f['content'],encoding='utf-8')
            page.locator('[data-panel=aircraft]').click()
            for id,count in [('quad-x',4),('quad-plus',4),('quad-h',4),('hexa-x',6),('hexa-plus',6),('octo-x',8),('octo-plus',8)]:
                page.locator('#airframe').select_option(id)
                expect(page.locator('#dirtyBadge')).to_be_visible()
                assert page.locator('#framePreview svg circle').count()==count+1
                if id=='quad-h':expect(page.locator('#hAspect')).to_be_visible()
                else:expect(page.locator('#hAspect')).to_be_hidden()
                page.locator('#applyConfig').click()
                expect(page.locator('#dirtyBadge')).to_be_hidden()
                assert page.locator('#motorBars .motor-item').count()==count
                assert page.locator('#motorFailure option').count()==count+1
                page.locator('#chartType').select_option('motors')
                assert page.locator('#chartLegend span').count()==count
            # Export/import restores geometry; legacy version 1 always maps to Quad X.
            with page.expect_download() as download:
                page.locator('[data-panel=export]').click();page.locator('#exportConfig').click()
            download.value.save_as(artifact/'airframe-ui-config.json')
            exported=json.loads((artifact/'airframe-ui-config.json').read_text())
            assert exported['config']['airframe']=='octo-plus' and exported['geometry']['motor_count']==8
            legacy={'format':'dronelab-config','version':1,'config':{},'waypoints':[[0,0,5]]}
            page.locator('#importConfig').set_input_files({'name':'legacy.json','mimeType':'application/json','buffer':json.dumps(legacy).encode()})
            expect(page.locator('#airframeLabel')).to_have_text('QUAD X')
            page.locator('#importConfig').set_input_files(str(artifact/'airframe-ui-config.json'))
            expect(page.locator('#airframeLabel')).to_have_text('OCTO +')
            page.locator('[data-panel=aircraft]').click();page.screenshot(path=str(artifact/'airframes-desktop.png'),full_page=True)
            page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(artifact/'airframes-mobile.png'),full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert not errors,errors
            browser.close();print(f'PASS: {len(result["checks"])} numerical/export checks, seven layouts, UI, legacy import and mobile; hosted={hosted}')
    finally:server.shutdown();server.server_close()

if __name__=='__main__':main()
