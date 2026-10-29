"""Configured step climbs must be the default 3D track, independently of optimization."""
import csv
import io
import json
import sys
from playwright.sync_api import sync_playwright, expect
from test_a380_lab import server, ARTIFACTS
from test_a380_trajectory import seek


def complete(page):
    page.wait_for_function("document.querySelector('#errorDialog').open || (!document.querySelector('#run').disabled && document.querySelector('#status').textContent.includes('profils explorés'))", timeout=180000)
    expect(page.locator('#errorDialog')).not_to_be_visible()


def main(base):
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge', headless=True)
        page=browser.new_page(viewport={'width':1512,'height':1080}, accept_downloads=True)
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/?view=3d&scenario=climbs', wait_until='domcontentloaded')
        complete(page)
        expect(page.locator('#studyScenario')).to_have_value('climbs')
        expect(page.locator('#flightProfile')).to_have_value('baseline')
        # Two configured climbs, but deliberately no climbs allowed in the optimizer.
        page.locator('[name=steps]').select_option('2')
        page.locator('#searchSettings > summary').click()
        for name,value in {'minMach':'.59','maxMach':'.6','minAltitude':'8000','maxAltitude':'8000'}.items():
            page.locator('[name='+name+']').fill(value)
        page.locator('[name=maxSteps]').select_option('0')
        expect(page.locator('#flightPending')).to_be_visible()
        page.locator('#flightRecalculate').click()
        complete(page)
        expect(page.locator('#flightPending')).to_be_hidden()
        expect(page.locator('#flightProfile')).to_have_value('baseline')
        expect(page.locator('#flightProfileNote')).to_contain_text('2 montée(s)')
        expect(page.locator('#flightStages button')).to_have_count(5)
        with page.expect_download() as event:
            page.locator('#exportStudy').click()
        study=json.loads(event.value.path().read_text(encoding='utf-8'))
        reference=study['result']['baseline']
        assert reference['feasible'], reference.get('reasons')
        assert reference['profile']['steps']==2
        assert study['result']['best']['profile']['steps']==0
        transitions=reference['climbs']
        assert len(transitions)==2
        assert study['qualification']['flightValidated'] is False
        assert all(b['seconds']>a['seconds'] for a,b in zip(reference['rows'],reference['rows'][1:]))
        seek(page,(transitions[0]['startSeconds']+transitions[0]['endSeconds'])/2)
        page.locator('#flightCanvas').scroll_into_view_if_needed()
        page.locator('#flightSpeed').select_option('60')
        before_time=float(page.locator('#flightTimeline').input_value())
        page.locator('#flightPlay').click()
        page.wait_for_function('(t)=>Number(document.querySelector("#flightTimeline").value)>t+5',arg=before_time)
        page.locator('#flightPlay').click()
        for i,e in enumerate(transitions):
            assert e['duration']>0 and e['burn']>0
            page.get_by_role('button',name='Montée '+str(i+1)+' · milieu',exact=True).click()
            altitude=float(page.locator('#flightAltitude').inner_text().replace('\u202f',''))
            assert e['from']<altitude<e['to']
            assert float(page.locator('#flightROC').inner_text().replace(',','.'))>0
            expect(page.locator('#flightStage')).to_contain_text('Montée vers le palier '+str(i+2))
            before=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
            page.get_by_role('button',name='Palier '+str(i+2)+' · '+format(int(e['to']),',').replace(',','\u202f')+' m',exact=True).click()
            expect(page.locator('#flightAltitude')).to_have_text(format(int(e['to']),',').replace(',','\u202f'))
            expect(page.locator('#flightStage')).to_contain_text('Palier '+str(i+2)+' / 3')
            page.wait_for_timeout(80)
            assert before!=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
        with page.expect_download() as event:
            page.locator('#flightCSV').click()
        rows=list(csv.DictReader(io.StringIO(event.value.path().read_text(encoding='utf-8'))))
        assert {8000,8600,9200}<={float(r['altitude_m']) for r in rows}
        assert any(8000<float(r['altitude_m'])<8600 and float(r['vertical_speed_m_s'])>0 for r in rows)
        assert max(float(r['vertical_speed_m_s']) for r in rows)<=1.27
        expect(page.locator('#flightClimbAudit tbody tr')).to_have_count(2)
        page.locator('#flightCamera').select_option('side')
        page.get_by_role('button',name='Montée 2 · milieu',exact=True).click()
        page.locator('#trajectory').screenshot(path=str(ARTIFACTS/'3d-configured-steps.png'))
        page.locator('#flightProfile').select_option('recommended')
        expect(page.locator('#flightProfileNote')).to_contain_text('0 montée(s)')
        expect(page.locator('#flightProfileNote')).to_contain_text('configuré 2')
        expect(page.locator('#flightStages button')).to_have_count(1)
        seek(page,study['result']['best']['seconds'])
        expect(page.locator('#flightAltitude')).to_have_text('8\u202f000')
        page.locator('#flightProfile').select_option('baseline')
        expect(page.locator('#flightAltitude')).to_have_text('9\u202f200')
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#trajectory').screenshot(path=str(ARTIFACTS/'3d-configured-steps-mobile.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        # A rejected configured profile must remain rejected, with an explicit fallback.
        page.locator('[name=mach]').fill('.89')
        page.locator('#flightRecalculate').click()
        complete(page)
        expect(page.locator('#flightProfile')).to_have_value('recommended')
        assert page.locator('#flightProfile option[value=baseline]').evaluate('el=>el.disabled')
        expect(page.locator('#flightProfileNote')).to_contain_text('configuré est non admissible')
        assert not errors, errors
        print('Finite climbs UI PASS: configured default, smooth heights, animated climb, ROC/pitch telemetry, duration/fuel audit, CSV, optimizer distinction, recalculation, mobile, infeasible fallback', flush=True)
        browser.close()


if __name__=='__main__':
    if len(sys.argv)>1:
        main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:
            main(base)
