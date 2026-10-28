"""Regression: default startup is feasible; the original 500 t study remains explicit and recoverable."""
from pathlib import Path
import json
import sys
from playwright.sync_api import sync_playwright,expect
from test_a380_lab import server,ARTIFACTS


def completed(page):
    page.wait_for_function("!document.querySelector('#run').disabled && (document.querySelector('#status').textContent.includes('profils explorés') || document.querySelector('#status').textContent.includes('Aucun profil'))",timeout=180000)


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1512,'height':1080},accept_downloads=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/',wait_until='domcontentloaded')
        completed(page)
        expect(page.locator('#studyScenario')).to_have_value('verification')
        expect(page.locator('[name=mass]')).to_have_value('300000')
        expect(page.locator('[name=minAltitude]')).to_have_value('8000')
        expect(page.locator('#feasibilityNotice')).to_be_hidden()
        assert 'profils explorés' in page.locator('#status').inner_text()
        assert not page.locator('#status').evaluate('el=>el.classList.contains("error")')
        expect(page.locator('#flightPlay')).to_be_enabled()
        print('Default startup:',page.locator('#status').inner_text(),flush=True)
        checks=page.evaluate("""async()=>{
          const s=await import('./scenarios.js'),m=await import('./model.js');
          const data=await(await fetch('./data/project.json')).json(),v=s.scenarioConfig('verification',data.area);
          if(s.identifyScenario(v)!=='verification')throw Error('Verification identification');
          if(s.identifyScenario({...v,wind:5})!=='custom')throw Error('Custom input identification');
          if(s.identifyScenario(s.scenarioConfig('report',data.area))!=='report')throw Error('Report identification');
          m.validateConfig(v,data);if(!m.simulate(v,undefined,data,20,false).feasible)throw Error('Default verification must be feasible');
          if(m.simulate(s.scenarioConfig('report',data.area),undefined,data,20,false).feasible)throw Error('Do not silently relax original report');
          return ['scenario identity','custom identity','original report preserved','verification feasible','report remains rejected'];
        }""")
        page.screenshot(path=str(ARTIFACTS/'startup-default.png'),full_page=True)
        page.get_by_role('tab',name='Trajectoire 3D').click()
        page.locator('#flightPlay').click()
        page.wait_for_function('Number(document.querySelector("#flightTimeline").value)>10')
        page.locator('#flightPlay').click()
        # Selecting the report must actually switch the preset despite the form input event.
        page.locator('#studyScenario').select_option('report')
        completed(page)
        expect(page.locator('#studyScenario')).to_have_value('report')
        expect(page.locator('[name=mass]')).to_have_value('500000')
        expect(page.locator('#feasibilityNotice')).to_be_visible()
        expect(page.locator('#feasibilityDetail')).to_contain_text('422,7 kN')
        expect(page.locator('#feasibilityDetail')).to_contain_text('218,1 kN')
        expect(page.locator('#recoverScenario')).to_be_visible()
        expect(page.locator('#flightPlay')).to_be_disabled()
        with page.expect_download() as download:
            page.locator('#exportStudy').click()
        download.value.save_as(ARTIFACTS/'startup-report.json')
        study=json.loads((ARTIFACTS/'startup-report.json').read_text(encoding='utf-8'))
        assert study['scenario']=='report' and study['config']['mass']==500000 and study['result']['best'] is None
        page.get_by_role('tab',name='Synthèse').click()
        page.screenshot(path=str(ARTIFACTS/'startup-diagnostic.png'),full_page=True)
        # Recovery resets ALL study constraints, including a deliberately impossible CL limit.
        page.locator('summary').click();page.locator('[name=clMax]').fill('.3')
        page.locator('#recoverScenario').click();completed(page)
        expect(page.locator('#studyScenario')).to_have_value('verification')
        expect(page.locator('[name=clMax]')).to_have_value('1')
        expect(page.locator('#feasibilityNotice')).to_be_hidden()
        expect(page.locator('#flightPlay')).to_be_enabled()
        # Imported reports keep their settings; default startup never automatically restores a failed study.
        page.get_by_role('tab',name='Modèle & données').click()
        page.locator('#importData').set_input_files(ARTIFACTS/'startup-report.json')
        expect(page.locator('#studyScenario')).to_have_value('report')
        expect(page.locator('[name=mass]')).to_have_value('500000')
        expect(page.locator('#status')).to_contain_text('Paramètres modifiés')
        page.locator('#run').click();completed(page)
        expect(page.locator('#feasibilityNotice')).to_be_visible()
        page.reload(wait_until='domcontentloaded');completed(page)
        expect(page.locator('#studyScenario')).to_have_value('verification')
        expect(page.locator('#feasibilityNotice')).to_be_hidden()
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        page.screenshot(path=str(ARTIFACTS/'startup-mobile.png'),full_page=True)
        assert not errors,errors
        print('Startup PASS:',checks,'+ 3D, preset switch, explicit diagnostic, full recovery, report import, reload, mobile',flush=True)
        browser.close()


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
