"""Phase-dependent camera framing, faithful local scale and integrated scale controls."""
import json
import sys
from playwright.sync_api import sync_playwright, expect
from test_a380_lab import server, ARTIFACTS
from test_a380_trajectory import seek


def ready(page):
    page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#flightTimeline').max>100", timeout=180000)
    page.locator('#flightCanvas').scroll_into_view_if_needed()
    page.wait_for_function("document.querySelector('#flightCanvas').dataset.frame==='local'")


def export(page):
    with page.expect_download() as event:
        page.locator('#exportStudy').click()
    return json.loads(event.value.path().read_text(encoding='utf-8'))


def contained(inner, outer):
    return inner['x']>=outer['x'] and inner['y']>=outer['y'] and inner['x']+inner['width']<=outer['x']+outer['width'] and inner['y']+inner['height']<=outer['y']+outer['height']


def main(base):
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge', headless=True)
        page=browser.new_page(viewport={'width':1512, 'height':1080}, accept_downloads=True)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/?view=3d&scenario=verification',wait_until='domcontentloaded')
        ready(page)
        canvas=page.locator('#flightCanvas')
        expect(page.locator('#flightCamera')).to_have_value('auto')
        expect(canvas).to_have_attribute('data-view','follow')
        expect(canvas).to_have_attribute('data-vertical-factor','1')
        expect(page.locator('#flightAutoScale')).to_have_attribute('aria-pressed','true')
        assert contained(page.locator('.flight-scale-control').bounding_box(),page.locator('.flight-viewport').bounding_box())
        page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'auto-framing-cruise-default.png'))
        before=export(page)
        page.locator('#flightCamera').select_option('orbit')
        expect(page.locator('#flightScaleWarning')).to_be_hidden()
        expect(canvas).to_have_attribute('data-vertical-factor','1')
        page.locator('#flightExaggeration').evaluate("el=>{el.value=165;el.dispatchEvent(new Event('input'));}")
        expect(page.locator('#flightAutoScale')).to_have_attribute('aria-pressed','false')
        expect(canvas).to_have_attribute('data-vertical-factor','165')
        page.locator('#flightAutoScale').click()
        expect(page.locator('#flightAutoScale')).to_have_attribute('aria-pressed','true')
        page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'auto-framing-global.png'))
        page.locator('#flightCamera').select_option('auto')
        expect(page.locator('#flightExaggeration')).to_have_value('1')
        expect(page.locator('#flightScaleWarning')).to_be_hidden()
        assert before['result']==export(page)['result']
        print('Cruise-only startup: local true scale, global auto scale, manual override and overlay PASS',flush=True)
        page.goto(base+'/projets/a380-lab/?view=3d&scenario=full',wait_until='domcontentloaded')
        ready(page)
        study=export(page)
        phases=study['result']['baseline']['phases']
        expected={'takeoff-roll':6000,'rotation':6000,'initial-climb':12000,'departure-climb':40000,'cruise':60000,'descent':40000,'approach':12000,'flare':6000,'landing-roll':6000}
        audit=[]
        for phase in phases:
            seek(page,(phase['startSeconds']+phase['endSeconds'])/2)
            expect(canvas).to_have_attribute('data-vertical-factor','1')
            expect(canvas).to_have_attribute('data-frame','local')
            page.wait_for_function('(n)=>Math.abs(Number(document.querySelector("#flightCanvas").dataset.windowMetres)-n)<.001',arg=expected[phase['phase']])
            audit.append({'phase':phase['phase'],'referenceWindowMetres':float(canvas.get_attribute('data-window-metres'))})
            if phase['phase'] in ['rotation','cruise','approach','flare']:
                page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/('auto-framing-'+phase['phase']+'.png')))
        # Independent continuity audit at every phase boundary; no camera jumps.
        continuity=page.evaluate('''async(phases)=>{
          const {localWindowMetres,sceneView,automaticVerticalFactor}=await import('./scene-framing.js?v=1.4.1');
          const track={airport:{},phases},checks=[];
          for(let i=1;i<phases.length;i++){
            const t=phases[i].startSeconds;
            const a=localWindowMetres(track,{seconds:t-1e-4,phase:phases[i-1].phase},'follow');
            const b=localWindowMetres(track,{seconds:t+1e-4,phase:phases[i].phase},'follow');
            if(Math.abs(a-b)>.001)throw Error('framing discontinuity');checks.push({t,a,b});
          }
          for(const view of ['follow','profile','departure','arrival','top'])for(const distance of [100,4569,15000])
            if(automaticVerticalFactor(view,distance,10000,1084,515)!==1)throw Error('local scale distorted');
          for(const distance of [100,4569,15000])for(const height of [1000,8000,13000])for(const width of [350,1084]){
            const factor=automaticVerticalFactor('orbit',distance,height,width,515);
            if(factor!==1)throw Error('global scale distorted');
          }
          if(sceneView('auto','cruise')!=='follow'||sceneView('auto','flare')!=='arrival'||sceneView('auto','rotation')!=='departure')throw Error('phase camera');
          return checks;
        }''',phases)
        cruise=next(phase for phase in phases if phase['phase']=='cruise')
        seek(page,(cruise['startSeconds']+cruise['endSeconds'])/2)
        page.set_viewport_size({'width':390,'height':844})
        canvas.scroll_into_view_if_needed()
        expect(canvas).to_have_attribute('data-vertical-factor','1')
        assert contained(page.locator('.flight-scale-control').bounding_box(),page.locator('.flight-viewport').bounding_box())
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'auto-framing-mobile.png'))
        assert study['result']==export(page)['result']
        assert not errors,errors
        (ARTIFACTS/'auto-framing-audit.json').write_text(json.dumps({'phases':audit,'continuity':continuity},indent=2),encoding='utf-8')
        print('Phase scales: 9 phases, 8 continuous boundaries, real local proportions, invariant results and mobile PASS',flush=True)
        browser.close()


if __name__=='__main__':
    if len(sys.argv)>1:
        main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:
            main(base)
