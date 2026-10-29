"""Manual vertical scale in every camera, physical tick labels and result invariance."""
import json
import sys
from playwright.sync_api import sync_playwright, expect
from test_a380_lab import server, ARTIFACTS


def main(base):
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        try:
            page=browser.new_page(viewport={'width':1512,'height':1080},accept_downloads=True)
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(base+'/projets/a380-lab/?view=3d',wait_until='domcontentloaded')
            page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#flightTimeline').max>100",timeout=180000)
            canvas=page.locator('#flightCanvas');canvas.scroll_into_view_if_needed()
            with page.expect_download() as event:page.locator('#exportStudy').click()
            before=json.loads(event.value.path().read_text(encoding='utf-8'))
            slider=page.locator('#flightExaggeration')
            def scale(factor):
                slider.evaluate('(el,factor)=>{el.value=factor;el.dispatchEvent(new Event("input"));}',factor)
                expect(slider).to_have_value(str(factor))
                expect(canvas).to_have_attribute('data-vertical-factor',str(factor))
            for view in ['auto','orbit','follow','profile','departure','arrival','top','side']:
                page.locator('#flightCamera').select_option(view)
                expect(slider).to_be_enabled()
                for factor in [1,8,165,400]:
                    scale(factor)
                    if factor>1:expect(page.locator('#flightScaleWarning')).to_be_visible()
                    else:expect(page.locator('#flightScaleWarning')).to_be_hidden()
                page.locator('#flightResetCamera').click()
                expect(slider).to_have_value('400')
                page.locator('#flightAutoScale').click()
                expect(slider).to_have_value('1')
            scale(165)
            for view in ['profile','side','follow','auto']:
                page.locator('#flightCamera').select_option(view)
                expect(canvas).to_have_attribute('data-vertical-factor','165')
                page.locator('#flightFitMission').click()
                expect(canvas).to_have_attribute('data-vertical-factor','165')
                expect(canvas).to_have_attribute('data-mission-fits','true')
                expect(page.locator('#flightFraming')).to_contain_text('165')
            page.locator('#flightProfileView').click()
            expect(slider).to_have_value('165')
            page.locator('#flightFitMission').click()
            ARTIFACTS.mkdir(parents=True,exist_ok=True)
            page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'profile-global-exaggeration-165.png'))
            probes=page.evaluate('''async()=>{
              const {profileCamera}=await import('./trajectory.js?v=1.5.2');
              const {profileGuides,profilePlot}=await import('./scene-guides.js?v=1.5.2');
              const probes=[];
              for(const [width,height] of [[1120,515],[350,410]])for(const factor of [1,8,165,400])for(const groundAltitude of [0,250]){
                const scale=.004,span=Math.max(120,10000*scale*factor*2),camera=profileCamera([0,0,4000*scale*factor],width,height,span);
                const plot=profilePlot(width,height),labels=[],ctx=document.createElement('canvas').getContext('2d');
                ctx.fillText=(text,x,y)=>{if(x===plot.left-8)labels.push({text,x,y});};
                profileGuides(ctx,camera,width,height,{origin:0,scale,groundAltitude,exaggeration:factor,altitudeBounds:[groundAltitude,10000]});
                for(const label of labels){
                  const altitude=Number(label.text.replace(/[\\s\\u202f\\u00a0]/g,'').replace(',','.'));
                  const actual=camera.project([0,0,(altitude-groundAltitude)*scale*factor]);
                  probes.push({factor,groundAltitude,altitude,drawnY:label.y,expectedY:actual[1]+3});
                }
              }
              return probes;
            }''')
            assert len(probes)>=16,len(probes)
            for probe in probes:assert abs(probe['drawnY']-probe['expectedY'])<1e-7,probe
            page.set_viewport_size({'width':390,'height':844})
            canvas.scroll_into_view_if_needed();scale(80)
            page.locator('.flight-viewport').screenshot(path=str(ARTIFACTS/'profile-mobile-exaggeration-80.png'))
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            page.locator('#flightTrueScale').click()
            expect(slider).to_have_value('1')
            expect(slider).to_be_enabled()
            expect(page.locator('#flightScaleWarning')).to_be_hidden()
            with page.expect_download() as event:page.locator('#exportStudy').click()
            after=json.loads(event.value.path().read_text(encoding='utf-8'))
            assert before['result']==after['result']
            assert not errors,errors
            print('Exaggeration: 8 cameras × 4 factors, persistence,',len(probes),'physical altitude tick probes, mobile and unchanged results PASS',flush=True)
        finally:
            browser.close()


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
