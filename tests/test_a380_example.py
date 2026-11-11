"""The static example must reload its own model, and must not silently use a fallback."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from test_a380_lab import server,ARTIFACTS

ROOT=Path(__file__).resolve().parents[1]

def completed(page):
    page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#status').textContent.includes('profils explorés')",timeout=180000)

def main(base):
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(accept_downloads=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/?model=parametric')
        completed(page)
        expect(page.locator('#modelTag')).to_have_text('Paramétrique')
        page.locator('#loadReferenceExample').click()
        completed(page)
        expect(page.locator('#modelTag')).to_have_text('Projet MGA803')
        expect(page.locator('#studyScenario')).to_have_value('verification')
        expect(page.locator('[name=missionMode]')).to_have_value('0')
        with page.expect_download() as e:page.locator('#exportStudy').click()
        study=json.loads(e.value.path().read_text(encoding='utf-8'))
        saved=json.loads((ROOT/'projets/a380-lab/data/reference-example.json').read_text(encoding='utf-8'))
        assert study['config']==saved['config']
        assert study['tables']['schema']=='a380-project/v1'
        assert abs(study['result']['baseline']['burn']-saved['reference']['burnKg'])<.001
        assert abs(study['result']['best']['burn']-saved['bestExplored']['burnKg'])<.001
        page.route('**/data/project.json',lambda route:route.abort())
        page.locator('#loadReferenceExample').click()
        expect(page.locator('#status')).to_contain_text('Exemple non recalculé')
        expect(page.locator('#errorDialog')).to_be_visible()
        expect(page.locator('#modelTag')).to_have_text('Projet MGA803')
        assert not errors,errors
        print('PASS: example resets model/config after parametric study, matches versioned result and rejects unavailable data without substituting a model',flush=True)
        browser.close()

if __name__=='__main__':
    with server() as base:main(base)
