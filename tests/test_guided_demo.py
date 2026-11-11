"""Deterministic guided protocol, independent RMS calculation and browser controls."""
import json
from playwright.sync_api import sync_playwright,expect
from test_a380_lab import server,ARTIFACTS

def main(base):
    ARTIFACTS.mkdir(exist_ok=True,parents=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/drone-lab/')
        result=page.evaluate('''async()=>{
          const {Simulation,DT}=await import('./core.js?v=airframes-1');
          const {DEMO_CONFIG,demoState,beforeDemoStep,afterDemoStep,demoSummary}=await import('./demo.js');
          function run(){const sim=new Simulation(DEMO_CONFIG),state=demoState();sim.start();let sum=0,n=0,impulses=0;
            while(!state.done){const before=state.injected;beforeDemoStep(sim,state);if(!before&&state.injected)impulses++;
              sim.step(DT);afterDemoStep(sim,state);
              if(sim.mode==='mission'&&sim.missionTime!==null){sum+=sim.s.p.reduce((s,x,i)=>s+(x-sim.target.p[i])**2,0);n++;}
            }
            const r=demoSummary(sim,state);if(Math.abs(Math.sqrt(sum/n)-r.trackingRmsM)>1e-12)throw Error('Independent RMS mismatch');
            if(impulses!==1)throw Error('Exactly one impulse required');
            if(sim.history.some(row=>row.motors.some(f=>f<0||f>sim.c.thrust)))throw Error('Motor bound');
            return r;
          }
          const a=run(),b=run();if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Determinism');return a;
        }''')
        assert abs(result['seconds']-40)<1e-8
        assert abs(result['trackingRmsM']-.19862760884453964)<1e-9
        assert abs(result['postImpulsePeakErrorM']-.9115712676207872)<1e-9
        assert abs(result['recoverySeconds']-2.7375)<.005
        assert result['saturationPercent']==0 and result['mode']=='mission'
        page.locator('#startDemo').click()
        page.wait_for_function("document.querySelector('#demoResults').dataset.report",timeout=60000)
        ui=json.loads(page.locator('#demoResults').get_attribute('data-report'))
        assert ui==result
        expect(page.locator('#demoStatus')).to_contain_text('Démonstration terminée')
        page.locator('#play').click();page.wait_for_timeout(300)
        expect(page.locator('#demoResults')).to_be_hidden()
        page.locator('#startDemo').click();page.locator('#play').click()
        t=page.locator('#elapsed').inner_text();page.wait_for_timeout(200)
        assert page.locator('#elapsed').inner_text()==t
        page.locator('#startDemo').click();page.wait_for_timeout(400)
        page.locator('#disturb').click()
        expect(page.locator('#demoStatus')).to_contain_text('Démonstration quittée')
        expect(page.locator('#demoResults')).to_be_hidden()
        for width in [1440,768,390,360]:
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
        assert not errors,errors
        (ARTIFACTS/'guided-demo.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False),flush=True)
        print('PASS: guided demo, exactly one impulse, deterministic seed, independent RMS, motor bounds, live UI parity, pause, manual exit and 4 widths',flush=True)
        browser.close()

if __name__=='__main__':
    with server() as base:main(base)
