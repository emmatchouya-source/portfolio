"""Camera interpretation, geometric guides and all full-flight views."""
import json
import math
import sys
from playwright.sync_api import sync_playwright, expect
from test_a380_lab import server, ARTIFACTS
from test_a380_trajectory import seek


def main(base):
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge', headless=True)
        try:
            page=browser.new_page(viewport={'width':1512,'height':1080},accept_downloads=True)
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(base+'/projets/a380-lab/?view=3d',wait_until='domcontentloaded')
            page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#flightTimeline').max>100",timeout=180000)
            canvas=page.locator('#flightCanvas');canvas.scroll_into_view_if_needed()
            with page.expect_download() as event:page.locator('#exportStudy').click()
            before=json.loads(event.value.path().read_text(encoding='utf-8'))
            canvas.scroll_into_view_if_needed()
            for phase in before['result']['baseline']['phases']:
                seek(page,(phase['startSeconds']+phase['endSeconds'])/2)
                expect(canvas).to_have_attribute('data-vertical-factor','1')
                expect(canvas).to_have_attribute('data-aircraft-render','3d-model')
                page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/('view-'+phase['phase']+'.png')))
            page.locator('#flightProfileView').click()
            expect(page.locator('#flightCamera')).to_have_value('profile')
            expect(page.locator('#flightExaggeration')).to_be_enabled()
            page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'view-true-profile.png'))
            page.locator('#flightFitMission').click()
            expect(canvas).to_have_attribute('data-mission-fits','true')
            expect(canvas).to_have_attribute('data-aircraft-render','position-marker')
            page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'view-global-profile.png'))
            page.locator('#flightFollowView').click()
            expect(page.locator('#flightCamera')).to_have_value('auto')
            expect(canvas).to_have_attribute('data-frame','local')
            page.locator('#flightFitMission').click()
            page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'view-entire-mission.png'))
            values=page.evaluate('''async()=>{
              const {perspectiveCamera,profileCamera}=await import('./trajectory.js?v=1.5.2');
              const {profileGuides,projectedScale,profilePlot}=await import('./scene-guides.js?v=1.5.2');
              const samples=[];
              for(const [w,h] of [[1120,515],[350,410]])for(const length of [6000,60000,4500000]){
                const scale=240/length,position=[120,0,8000*scale],radius=110,elevation=.28;
                const eye=[120,-radius*Math.cos(elevation),position[2]+radius*Math.sin(elevation)];
                const camera=perspectiveCamera(eye,position,w,h);
                const a=camera.project(position),b=camera.project([position[0]+1000*scale,0,position[2]]);
                const ruler=projectedScale(camera,position,scale);
                const end=camera.project([position[0]+ruler.metres*scale,0,position[2]]);
                const ctx=document.createElement('canvas').getContext('2d'),texts=[];
                ctx.fillText=(text)=>texts.push(text);
                const profile=profileCamera(position,w,h,120),plot=profilePlot(w,h);
                const grid=profileGuides(ctx,profile,w,h,{origin:0,scale,groundAltitude:0,altitudeBounds:[0,8000]});
                const origin=profile.project([0,0,0]),x=profile.project([scale,0,0]),z=profile.project([0,0,scale]);
                samples.push({level:[a,b],ruler,measuredRuler:Math.hypot(end[0]-a[0],end[1]-a[1]),grid,
                  equalAxes:[Math.hypot(x[0]-origin[0],x[1]-origin[1]),Math.hypot(z[0]-origin[0],z[1]-origin[1])],texts,plot});
              }
              return samples;
            }''')
            for sample in values:
                assert abs(sample['level'][0][1]-sample['level'][1][1])<1e-8, sample
                assert abs(sample['ruler']['pixels']-sample['measuredRuler'])<1e-8, sample
                assert math.isclose(*sample['equalAxes'],rel_tol=1e-8),sample
                assert '500\u202f000' not in sample['texts'],sample
            for width in [390,768]:
                page.set_viewport_size({'width':width,'height':844})
                canvas.scroll_into_view_if_needed()
                page.locator('#flightProfileView').click();page.locator('#flightFitMission').click()
                expect(canvas).to_have_attribute('data-mission-fits','true')
                box=page.locator('.flight-viewport').bounding_box()
                for button in page.locator('.flight-view-shortcuts button').all():
                    inner=button.bounding_box()
                    assert inner['x']>=box['x'] and inner['x']+inner['width']<=box['x']+box['width']
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/('view-mobile-'+str(width)+'.png')))
            with page.expect_download() as event:page.locator('#exportStudy').click()
            after=json.loads(event.value.path().read_text(encoding='utf-8'))
            assert before['result']==after['result']
            assert not errors,errors
            print('Scene views: 9 phases, 6 camera/guide audits, 3 direct views, mobile/tablet and unchanged results PASS',flush=True)
        finally:
            browser.close()


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
