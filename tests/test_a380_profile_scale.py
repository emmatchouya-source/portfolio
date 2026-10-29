"""Independent slope audit, wind-relative glidepath and faithful local projection."""
import json
import math
import sys
from playwright.sync_api import sync_playwright,expect
from test_a380_lab import server,ARTIFACTS
from test_a380_trajectory import seek


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1512,'height':1080},accept_downloads=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/?scenario=full&view=3d',wait_until='domcontentloaded')
        page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#flightTimeline').max>100",timeout=180000)
        expect(page.locator('.version')).to_contain_text('v1.3.')
        values=page.evaluate('''async()=>{
          const {profileCamera}=await import('./trajectory.js?v=1.3.3');
          const {simulate}=await import('./model.js?v=1.3.3'),{scenarioConfig}=await import('./scenarios.js?v=1.3.3');
          const tables=await(await fetch('./data/project.json')).json(),c=scenarioConfig('full',tables.area),cases=[];
          const projected=[];
          for(const [w,h] of [[1084,515],[360,365]])for(const zoom of [.5,1,8])for(const angle of [-5,-3,0,3,5.3]){
            const camera=profileCamera([72,0,2],w,h,120/zoom),a=camera.project([72,0,2]),b=camera.project([72+5,0,2+5*Math.tan(angle*Math.PI/180)]);
            projected.push({w,h,zoom,angle,measured:Math.atan2(a[1]-b[1],b[0]-a[0])*180/Math.PI});
          }
          for(const wind of [-10,0,10]){
            const r=simulate({...c,wind},undefined,tables,5);
            if(!r.feasible)throw Error('wind case rejected: '+r.reasons);
            cases.push({wind,c:{approachAngle:c.approachAngle,departureRoc:c.departureRoc,descentRoc:c.descentRoc},
              rows:r.rows.filter(p=>['initial-climb','departure-climb','descent','approach'].includes(p.phase)),phases:r.phases});
          }
          return {projected,cases};
        }''')
        # Independent Python checks of projected angles and finite-difference trajectory geometry.
        for q in values['projected']:assert abs(q['angle']-q['measured'])<1e-10,q
        audit=[]
        for case in values['cases']:
            rows=case['rows'];approach=[q for q in rows if q['phase']=='approach']
            secant=math.degrees(math.atan2(approach[-1]['h']-approach[0]['h'],1000*(approach[-1]['x']-approach[0]['x'])))
            assert abs(secant+case['c']['approachAngle'])<1e-6,(case['wind'],secant)
            for q in approach:
                assert abs(math.degrees(math.atan2(q['roc'],q['gs']))+case['c']['approachAngle'])<1e-10
                assert abs(q['roc']-q['tas']*math.sin(q['gamma']))<1e-9
            for a,b in zip(rows,rows[1:]):
                if a['phase']!=b['phase']:continue
                angle=math.degrees(math.atan2(b['h']-a['h'],1000*(b['x']-a['x'])))
                assert abs(angle)<12,(a['phase'],angle)
            audit.append({'wind_m_s':case['wind'],'approach_ground_deg':secant,
              'max_climb_ground_deg':max(math.degrees(math.atan2(q['roc'],q['gs'])) for q in rows if 'climb' in q['phase']),
              'max_descent_ground_deg':min(math.degrees(math.atan2(q['roc'],q['gs'])) for q in rows if q['phase']=='descent')})
        (ARTIFACTS/'profile-angle-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
        print('Faithful projection:',len(values['projected']),'angles + 3 independent trajectory/wind audits PASS',flush=True)
        with page.expect_download() as event:page.locator('#exportStudy').click()
        before=json.loads(event.value.path().read_text(encoding='utf-8'))
        phases={q['phase']:q for q in before['result']['baseline']['phases']}
        expect(page.locator('#flightExaggeration')).to_have_value('1')
        # Reproduce the reported auto -> global profile transition: it must not restore x114.
        page.locator('#flightCamera').select_option('side')
        expect(page.locator('#flightExaggeration')).to_have_value('1')
        expect(page.locator('#flightScaleWarning')).to_be_hidden()
        page.locator('#flightAmplify').click()
        assert float(page.locator('#flightExaggeration').input_value())>1
        expect(page.locator('#flightScaleWarning')).to_be_visible()
        page.locator('#flightTrueScale').click()
        expect(page.locator('#flightCamera')).to_have_value('profile')
        expect(page.locator('#flightExaggeration')).to_have_value('1')
        expect(page.locator('#flightExaggeration')).to_be_disabled()
        expect(page.locator('#flightScaleWarning')).to_be_hidden()
        page.locator('#flightCanvas').scroll_into_view_if_needed();page.wait_for_timeout(100)
        frame=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
        page.locator('#flightCanvas').focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(100)
        assert frame!=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()'),'profile arrows must pan the faithful view'
        page.locator('#flightResetCamera').click()
        for phase in ['initial-climb','approach','flare']:
            interval=phases[phase];seek(page,(interval['startSeconds']+interval['endSeconds'])/2)
            page.locator('#flightCanvas').scroll_into_view_if_needed();page.wait_for_timeout(150)
            if phase=='approach':expect(page.locator('#flightSlopeNote')).to_contain_text('-3,00°')
            page.locator('#trajectory').screenshot(path=str(ARTIFACTS/f'profile-faithful-{phase}.png'))
            page.locator('#flightCanvas').screenshot(path=str(ARTIFACTS/f'profile-faithful-{phase}-canvas.png'))
        with page.expect_download() as event:page.locator('#exportStudy').click()
        after=json.loads(event.value.path().read_text(encoding='utf-8'))
        assert before['result']==after['result'],'camera must not modify performance results'
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#flightCanvas').scroll_into_view_if_needed();page.wait_for_timeout(150)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        page.locator('#trajectory').screenshot(path=str(ARTIFACTS/'profile-faithful-mobile.png'))
        assert not errors,errors
        browser.close()
    print('True scale, explicit exaggeration, local profile, result invariance and mobile: PASS',flush=True)


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
