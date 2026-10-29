"""Mission workbench: disclosures, form validation, provenance, export and mobile layout."""
import json
import sys
from playwright.sync_api import sync_playwright, expect
from test_a380_lab import server, ARTIFACTS


def completed(page):
    page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#status').textContent.includes('profils explorés')", timeout=180000)


def main(base):
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width':1512, 'height':1080}, accept_downloads=True)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/?scenario=verification', wait_until='domcontentloaded')
        completed(page)
        expect(page.locator('.version')).to_have_text('v1.4.1')
        expect(page.locator('#configurationPanel')).to_have_attribute('open', '')
        expect(page.locator('#qualification > summary')).to_be_visible()
        expect(page.locator('#qualification .qualification-body')).to_be_hidden()
        assert page.locator('h1').count() == 1
        expect(page.locator('h1')).to_have_text('A380 — Analyse de mission')
        # Readable result band and full-width primary graph, independent of copy.
        assert page.locator('#profileChart').bounding_box()['width'] > page.locator('#overview').bounding_box()['width']*.95
        assert page.locator('#kpis article').first.evaluate('el=>getComputedStyle(el).borderTopWidth') == '0px'
        page.locator('#aircraftHeroPause').click()
        page.screenshot(path=str(ARTIFACTS/'workbench-desktop.png'))
        page.locator('#overview').screenshot(path=str(ARTIFACTS/'workbench-results.png'))
        with page.expect_download() as event:
            page.locator('#exportStudy').click()
        study = json.loads(event.value.path().read_text(encoding='utf-8'))
        assert abs(study['result']['baseline']['burn']-49801.884)<.1
        assert abs(study['result']['best']['burn']-36157.754)<.1
        assert study['qualification']['flightValidated'] is False
        # New provenance link opens its tab before native fragment navigation.
        page.locator('.project-link').click()
        expect(page.get_by_role('tab', name='Méthode & validation')).to_have_attribute('aria-selected', 'true')
        expect(page.locator('#projectStory')).to_be_visible()
        expect(page.locator('#projectStory')).to_contain_text('Lina Seghilani')
        page.get_by_role('tab', name='Synthèse', exact=True).click()
        page.locator('#qualification > summary').click()
        expect(page.locator('#qualification .qualification-body')).to_be_visible()
        page.locator('#qualification > summary').click()
        # Invalid hidden input must be exposed by native validation before focus.
        wind = page.locator('[name=wind]')
        wind.evaluate("el=>{el.value=100;el.dispatchEvent(new Event('input',{bubbles:true}));}")
        page.locator('#run').click()
        expect(page.locator('#missionConditions')).to_have_attribute('open', '')
        expect(wind).to_be_focused()
        wind.fill('0')
        page.locator('#missionConditions > summary').click()
        # Compact layout starts with the form collapsed; the model still computes.
        mobile = browser.new_context(viewport={'width':390, 'height':844}, is_mobile=True)
        mp = mobile.new_page()
        mp.on('pageerror', lambda e: errors.append(str(e)))
        mp.goto(base+'/projets/a380-lab/', wait_until='domcontentloaded')
        completed(mp)
        expect(mp.locator('#studyForm')).to_be_hidden()
        expect(mp.locator('#configurationPanel > summary')).to_be_visible()
        assert not mp.locator('#configurationPanel').evaluate('el=>el.open')
        mp.screenshot(path=str(ARTIFACTS/'workbench-mobile.png'))
        mp.locator('#configurationPanel > summary').click()
        expect(mp.locator('#studyScenario')).to_be_visible()
        mp.locator('#searchSettings > summary').click()
        mp.locator('[name=ci]').fill('170')
        mp.locator('#run').click()
        completed(mp)
        expect(mp.locator('[name=ci]')).to_have_value('170')
        mp.locator('#configurationPanel > summary').click()
        for tab in ['Synthèse', 'Trajectoire 3D', 'Domaine de vol', 'Modèle & données', 'Méthode & validation']:
            mp.get_by_role('tab', name=tab, exact=True).click()
            assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), tab
        mp.get_by_role('tab', name='Trajectoire 3D', exact=True).click()
        mp.locator('#flightCanvas').scroll_into_view_if_needed()
        expect(mp.locator('#flightPlay')).to_be_enabled()
        mp.locator('#trajectory').screenshot(path=str(ARTIFACTS/'workbench-trajectory-mobile.png'))
        for width in [360, 650, 768, 900, 1240, 1512]:
            page.set_viewport_size({'width':width, 'height':1000})
            expect(page.locator('#configurationPanel')).to_have_js_property('open', width>820)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), width
        # The collapsed qualification remains present in the printable dossier.
        page.emulate_media(media='print')
        page.pdf(path=str(ARTIFACTS/'workbench-report.pdf'), format='A4', print_background=True)
        import pymupdf
        with pymupdf.open(ARTIFACTS/'workbench-report.pdf') as pdf:
            text=' '.join(' '.join(p.get_text().split()) for p in pdf)
        assert 'pas des économies garanties' in text
        assert not errors, errors
        print('Workbench: desktop/mobile, all tabs, hidden-field validation, provenance, print, export, unchanged numerical results PASS', flush=True)
        browser.close()


if __name__ == '__main__':
    if len(sys.argv)>1:
        main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:
            main(base)
