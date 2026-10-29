"""3D playback: step timing, physical coordinates, controls, exports and model feasibility."""
import csv
import io
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from test_a380_lab import server, ARTIFACTS


def seek(page,seconds):
    page.locator('#flightTimeline').evaluate('(el,t)=>{el.value=t;el.dispatchEvent(new Event("input",{bubbles:true}));}',seconds)


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        context=browser.new_context(viewport={'width':1512,'height':1080},has_touch=True,accept_downloads=True)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/?model=parametric&view=3d',wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('#status').textContent.includes('profils explorés')",timeout=120000)
        expect(page.get_by_role('tab',name='Trajectoire 3D')).to_have_attribute('aria-selected','true')
        page.locator('#flightCanvas').scroll_into_view_if_needed()
        page.wait_for_function('document.querySelector("#flightCanvas").width>300')
        checks=page.evaluate("""async()=>{
          const t=await import('./trajectory.js'),m=await import('./model.js');
          const checks=[],test=(name,pass)=>{if(!pass)throw Error(name);checks.push(name);};
          const row=(seconds,x,h,burn)=>({seconds,x,h,burn,mass:500000-burn,mach:.75,tas:220,gs:220,flow:1});
          const track=t.prepareTrajectory({feasible:true,rows:[row(0,0,10000,0),row(100,10,10000,100),row(100,10,10600,100),row(200,20,10600,200)]},'Test');
          test('step event preserved',track.events.length===1&&track.events[0].seconds===100);
          test('no premature climb',t.sampleTrajectory(track,99.999).h===10000);
          test('post-step at exact timestamp',t.sampleTrajectory(track,100).h===10600);
          test('no interpolated climb after step',t.sampleTrajectory(track,100.001).h===10600);
          test('continuous mass across instant step',t.sampleTrajectory(track,100).mass===499900);
          test('linear time/distance interpolation',t.sampleTrajectory(track,50).x===5);
          test('physical metres retained',t.sampleTrajectory(track,50).xMetres===5000&&t.sampleTrajectory(track,50).z===10000);
          test('lateral position zero',t.sampleTrajectory(track,50).y===0);
          test('start clamp',t.sampleTrajectory(track,-10).seconds===0);
          test('end clamp',t.sampleTrajectory(track,1000).seconds===200);
          test('invalid time rejected',t.sampleTrajectory(track,NaN)===null);
          test('infeasible profile not animated',t.prepareTrajectory({feasible:false,rows:track.rows},'Bad')===null);
          test('invalid row order rejected',t.prepareTrajectory({feasible:true,rows:[track.rows[3],track.rows[0]]},'Bad')===null);
          const c=t.perspectiveCamera([0,-10,5],[0,0,0],800,400),center=c.project([0,0,0]);
          test('camera optical centre',Math.abs(center[0]-400)<1e-9&&Math.abs(center[1]-212)<1e-9);
          test('camera orthogonal basis',Math.abs(t.dot(c.right,c.up))<1e-12&&Math.abs(t.dot(c.right,c.forward))<1e-12);
          test('camera points forward',c.project([0,-20,10])===null);
          test('correct horizontal orientation',c.project([1,0,0])[0]>center[0]);
          const csv=t.playbackCSV(track,'1.1.0','test');test('step coordinates exported',csv.includes('10600.0000000'));
          const result=m.simulate({...m.DEFAULT,steps:2});const real=t.prepareTrajectory(result,'Reference');
          const point=t.sampleTrajectory(real,result.seconds);
          test('mission final state reproduced',point.x===result.rows.at(-1).x&&point.mass===result.finalMass&&point.burn===result.burn);
          test('all real climbs have continuous intermediate heights',real.events.every(e=>e.endSeconds>e.seconds&&t.sampleTrajectory(real,(e.seconds+e.endSeconds)/2).h>e.from&&t.sampleTrajectory(real,(e.seconds+e.endSeconds)/2).h<e.to));
          return {checks};
        }""")
        print('Trajectory numerical checks:',len(checks['checks']),flush=True)
        # Capture the exact study once; playback and scene changes must not change its numbers.
        with page.expect_download() as event:
            page.locator('#exportStudy').click()
        event.value.save_as(ARTIFACTS/'3d-study.json')
        study=json.loads((ARTIFACTS/'3d-study.json').read_text(encoding='utf-8'))
        expect(page.locator('#flightProfile')).to_have_value('baseline')
        page.locator('#flightProfile').select_option('recommended')
        selected=study['result']['best']
        seek(page,selected['seconds'])
        expect(page.locator('#flightDistance')).to_have_text('4\u202f569')
        assert 'terminée' in page.locator('#flightState').inner_text()
        with page.expect_download() as event:
            page.locator('#flightCSV').click()
        event.value.save_as(ARTIFACTS/'trajectory-3d.csv')
        rows=list(csv.DictReader(io.StringIO((ARTIFACTS/'trajectory-3d.csv').read_text(encoding='utf-8'))))
        assert all(float(r['lateral_m'])==0 for r in rows)
        assert abs(float(rows[-1]['longitudinal_m'])-4569000)<1e-6
        assert abs(float(rows[-1]['fuel_burn_kg'])-selected['burn'])<1e-5
        seek(page,selected['seconds']/2)
        page.locator('#flightCanvas').scroll_into_view_if_needed()
        page.wait_for_timeout(200)
        page.locator('#flightCanvas').screenshot(path=str(ARTIFACTS/'3d-overview.png'))
        prior=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
        point_before=[page.locator('#flight'+k).inner_text() for k in ['Distance','Altitude','Fuel']]
        page.locator('#flightCanvas').focus()
        page.keyboard.press('ArrowLeft')
        page.wait_for_timeout(100)
        assert prior!=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
        assert point_before==[page.locator('#flight'+k).inner_text() for k in ['Distance','Altitude','Fuel']]
        page.locator('#flightExaggeration').evaluate('el=>{el.value=1;el.dispatchEvent(new Event("input"));}')
        expect(page.locator('#flightScale')).to_contain_text('×1 ')
        assert point_before==[page.locator('#flight'+k).inner_text() for k in ['Distance','Altitude','Fuel']]
        # Playback, pause, rewind and automatic pause on tab departure.
        page.locator('#flightRestart').click()
        page.locator('#flightSpeed').select_option('1200')
        page.locator('#flightPlay').click()
        page.wait_for_function('Number(document.querySelector("#flightTimeline").value)>50')
        page.locator('#flightPlay').click()
        expect(page.locator('#flightPlay')).to_have_attribute('aria-pressed','false')
        stopped=float(page.locator('#flightTimeline').input_value())
        page.wait_for_timeout(150)
        assert stopped==float(page.locator('#flightTimeline').input_value())
        page.locator('#flightPlay').click()
        page.get_by_role('tab',name='Synthèse').click()
        expect(page.locator('#flightPlay')).to_have_attribute('aria-pressed','false')
        page.get_by_role('tab',name='Trajectoire 3D').click()
        page.locator('#flightProfile').select_option('baseline')
        expect(page.locator('#flightProfile')).to_have_value('baseline')
        page.locator('#flightCamera').select_option('follow')
        page.locator('#flightCanvas').scroll_into_view_if_needed()
        page.wait_for_timeout(150)
        page.locator('#flightCanvas').screenshot(path=str(ARTIFACTS/'3d-follow.png'))
        with page.expect_download() as event:
            page.locator('#flightImage').click()
        event.value.save_as(ARTIFACTS/'3d-capture.png')
        assert (ARTIFACTS/'3d-capture.png').stat().st_size>10000
        for camera in ['top','side','orbit']:
            page.locator('#flightCamera').select_option(camera)
            page.wait_for_timeout(60)
        page.locator('#missionConditions > summary').click()
        page.locator('[name=wind]').fill('5')
        expect(page.locator('#flightState')).to_contain_text('Paramètres modifiés')
        # Source model: no fictitious flight for rejected 500 t case, then exercise the real 300 t trace.
        page.goto(base+'/projets/a380-lab/?view=3d&scenario=report',wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('#status').textContent.includes('Aucun profil')",timeout=120000)
        expect(page.locator('#flightEmpty')).to_be_visible()
        expect(page.locator('#flightPlay')).to_be_disabled()
        page.locator('#flightExample').click()
        page.wait_for_function("!document.querySelector('#run').disabled",timeout=180000)
        expect(page.locator('#flightEmpty')).to_be_hidden()
        expect(page.locator('#flightPlay')).to_be_enabled()
        assert page.locator('#flightAlpha').inner_text()!='—'
        page.locator('#flightCamera').select_option('follow')
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#flightCanvas').scroll_into_view_if_needed()
        page.wait_for_timeout(200)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        page.locator('#trajectory').screenshot(path=str(ARTIFACTS/'3d-mobile.png'))
        # Actual touch pointers exercise pinch without synthetic pointer capture errors.
        cdp=context.new_cdp_session(page)
        box=page.locator('#flightCanvas').bounding_box()
        x=box['x']+box['width']/2;y=box['y']+box['height']/2
        before=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x-25,'y':y,'id':1},{'x':x+25,'y':y,'id':2}]})
        cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x-55,'y':y,'id':1},{'x':x+55,'y':y,'id':2}]})
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        page.wait_for_timeout(100)
        assert before!=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
        assert not errors,errors
        (ARTIFACTS/'3d-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
        print('3D browser PASS: synchronized telemetry, camera, zoom/pinch, playback, pause, profile comparison, PNG/CSV, source infeasible/feasible, mobile',flush=True)
        browser.close()


if __name__=='__main__':
    import sys
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as url:main(url)
