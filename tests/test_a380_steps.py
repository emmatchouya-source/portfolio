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
        page.goto(base+'/projets/a380-lab/?view=3d', wait_until='domcontentloaded')
        complete(page)
        expect(page.locator('#flightProfile')).to_have_value('baseline')
        # Two configured climbs, but deliberately no climbs allowed in the optimizer.
        page.locator('[name=steps]').select_option('2')
        page.locator('summary').click()
        for name,value in {'minMach':'.59','maxMach':'.6','minAltitude':'8000','maxAltitude':'8000'}.items():
            page.locator('[name='+name+']').fill(value)
        page.locator('[name=maxSteps]').select_option('0')
        expect(page.locator('#flightPending')).to_be_visible()
        page.locator('#flightRecalculate').click()
        complete(page)
        expect(page.locator('#flightPending')).to_be_hidden()
        expect(page.locator('#flightProfile')).to_have_value('baseline')
        expect(page.locator('#flightProfileNote')).to_contain_text('2 montée(s)')
        expect(page.locator('#flightStages button')).to_have_count(3)
        with page.expect_download() as event:
            page.locator('#exportStudy').click()
        study=json.loads(event.value.path().read_text(encoding='utf-8'))
        reference=study['result']['baseline']
        assert reference['feasible'], reference.get('reasons')
        assert reference['profile']['steps']==2
        assert study['result']['best']['profile']['steps']==0
        transitions=[(a,b) for a,b in zip(reference['rows'],reference['rows'][1:]) if a['h']!=b['h']]
        assert len(transitions)==2
        seek(page,transitions[0][1]['seconds']-2)
        page.locator('#flightCanvas').scroll_into_view_if_needed()
        page.locator('#flightSpeed').select_option('60')
        page.locator('#flightPlay').click()
        page.wait_for_function("document.querySelector('#flightAltitude').textContent==='8\\u202f600'")
        page.locator('#flightPlay').click()
        for i,(a,b) in enumerate(transitions):
            assert a['seconds']==b['seconds']
            seek(page,b['seconds']-.001)
            expect(page.locator('#flightAltitude')).to_have_text(format(int(a['h']),',').replace(',','\u202f'))
            before=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
            page.locator('#flightStages button').nth(i+1).click()
            expect(page.locator('#flightAltitude')).to_have_text(format(int(b['h']),',').replace(',','\u202f'))
            expect(page.locator('#flightStage')).to_contain_text('Palier '+str(i+2)+' / 3')
            page.wait_for_timeout(80)
            assert before!=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
        with page.expect_download() as event:
            page.locator('#flightCSV').click()
        rows=list(csv.DictReader(io.StringIO(event.value.path().read_text(encoding='utf-8'))))
        assert {float(r['altitude_m']) for r in rows}=={8000,8600,9200}
        page.locator('#flightCamera').select_option('side')
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
        print('Step climbs PASS: configured default, 8000/8600/9200 m, exact transitions, canvas, CSV, optimizer distinction, recalculation, mobile, infeasible fallback', flush=True)
        browser.close()


if __name__=='__main__':
    if len(sys.argv)>1:
        main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:
            main(base)
