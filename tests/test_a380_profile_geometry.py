"""Real visual angles, complete-mission zoom and independently fitted camera bounds."""
import json
import math
import sys
from playwright.sync_api import sync_playwright, expect
from test_a380_lab import server, ARTIFACTS


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1512,'height':1080},accept_downloads=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/?view=3d',wait_until='domcontentloaded')
        page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#flightTimeline').max>100",timeout=180000)
        canvas=page.locator('#flightCanvas');canvas.scroll_into_view_if_needed()
        before=None
        with page.expect_download() as event:page.locator('#exportStudy').click()
        before=json.loads(event.value.path().read_text(encoding='utf-8'))
        canvas.scroll_into_view_if_needed();canvas.focus()
        for _ in range(40):page.keyboard.press('-')
        expect(page.locator('#flightCamera')).to_have_value('auto')
        expect(canvas).to_have_attribute('data-mission-fits','true')
        assert float(canvas.get_attribute('data-zoom'))<.5
        expect(page.locator('#flightExaggeration')).to_have_value('1')
        page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'faithful-entire-mission-auto.png'))
        page.locator('#flightResetCamera').click()
        expect(canvas).to_have_attribute('data-frame','local')
        page.locator('#flightFitMission').click()
        expect(page.locator('#flightCamera')).to_have_value('auto')
        expect(canvas).to_have_attribute('data-mission-fits','true')
        page.locator('#flightCamera').select_option('side')
        expect(page.locator('#flightExaggeration')).to_have_value('1')
        expect(canvas).to_have_attribute('data-mission-fits','true')
        page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'faithful-global-profile.png'))
        values=page.evaluate('''async()=>{
          const {geometricProfile,phaseProfileCharts}=await import('./profile-panels.js?v=1.5.1');
          const {missionCameraFit}=await import('./scene-framing.js?v=1.5.1');
          const {perspectiveCamera}=await import('./trajectory.js?v=1.5.1');
          const {simulate}=await import('./model.js?v=1.5.1'),{scenarioConfig}=await import('./scenarios.js?v=1.5.1');
          const host=document.createElement('div');host.id='angleAudit';host.style='width:100%;';document.body.append(host);
          const angles=[];
          for(const slope of [-5,-3,-.4,0,.4,3,5])for(const length of [1000,150000,4500000]){
            const rows=[{x:0,h:8000},{x:length/1000,h:8000+length*Math.tan(slope*Math.PI/180)}];
            host.innerHTML=geometricProfile(rows,[],'Audit');
            const svg=host.querySelector('svg'),points=[...svg.querySelector('polyline').points];
            angles.push({expected:slope,measured:Math.atan2(points[0].y-points[1].y,points[1].x-points[0].x)*180/Math.PI});
            if(svg.dataset.scaleX!==svg.dataset.scaleZ)throw Error('anisotropic plot');
          }
          const bounds=[[0,0,0],[4500000,0,0],[0,0,15000],[4500000,0,15000]],fits=[];
          for(const [w,h] of [[1084,515],[350,410]])for(const yaw of [-2.35,-1.1,-Math.PI/2,.2])for(const elevation of [.035,.24,.48,1.53]){
            const fit=missionCameraFit(bounds,yaw,elevation,w,h),r=fit.radius;
            const eye=fit.center.map((v,i)=>v+[r*Math.cos(elevation)*Math.cos(yaw),r*Math.cos(elevation)*Math.sin(yaw),r*Math.sin(elevation)][i]);
            const camera=perspectiveCamera(eye,fit.center,w,h);
            fits.push({w,h,points:bounds.map(camera.project)});
          }
          const tables=await(await fetch('./data/project.json')).json();
          const result=simulate({...scenarioConfig('full',tables.area),steps:2},undefined,tables,5);
          if(!result.feasible)throw Error('step-climb fixture rejected: '+result.reasons);
          host.innerHTML=phaseProfileCharts(result);
          if(!host.textContent.includes('Montée par palier 1')||!host.textContent.includes('Montée par palier 2'))throw Error('step detail missing');
          return {angles,fits,stepClimbs:result.climbs.length};
        }''')
        for q in values['angles']:assert abs(q['expected']-q['measured'])<1e-3,q
        for case in values['fits']:
            for point in case['points']:
                assert point and 0<=point[0]<=case['w'] and 0<=point[1]<=case['h'],case
        page.locator('#angleAudit').screenshot(path=str(ARTIFACTS/'faithful-phase-profiles.png'))
        page.locator('#angleAudit').evaluate('el=>el.remove()')
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#flightCamera').select_option('auto');canvas.scroll_into_view_if_needed()
        page.locator('#flightFitMission').click()
        expect(canvas).to_have_attribute('data-mission-fits','true')
        page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'faithful-mission-mobile.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        with page.expect_download() as event:page.locator('#exportStudy').click()
        after=json.loads(event.value.path().read_text(encoding='utf-8'))
        assert before['result']==after['result']
        assert not errors,errors
        (ARTIFACTS/'profile-geometry-audit.json').write_text(json.dumps(values,indent=2),encoding='utf-8')
        print('Faithful geometry:',len(values['angles']),'angle probes,',len(values['fits']),'camera fits, full mission zoom, 2 real step-climb details, unchanged results and mobile PASS',flush=True)
        browser.close()


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
