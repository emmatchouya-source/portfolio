"""Public content, navigation, local assets, mobile views and contact draft (no email sent)."""
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
import json
from playwright.sync_api import sync_playwright,expect
from test_a380_lab import server,ARTIFACTS

ROOT=Path(__file__).resolve().parents[1]
PAGES=['/','/contact.html','/projets/3dexperience/','/projets/essais/','/projets/a380-lab/','/projets/drone-lab/','/projets/aero-optim/','/projets/a380-lab/documentation.html','/projets/drone-lab/documentation.html','/projets/aero-optim/documentation.html']

def luminance(rgb):
    def f(x):
        x=x/255
        return x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4
    return sum(w*f(c) for w,c in zip([.2126,.7152,.0722],rgb))

def main(base):
    ARTIFACTS.mkdir(exist_ok=True,parents=True)
    results=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000})
        errors=[];failed=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:failed.append({'status':r.status,'url':r.url}) if r.url.startswith(base) and r.status>=400 else None)
        for path in PAGES:
            page.goto(base+path,wait_until='domcontentloaded')
            for width in [1440,768,390,360]:
                page.set_viewport_size({'width':width,'height':1000})
                page.wait_for_timeout(120)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(path,width)
                results.append({'page':path,'width':width,'overflow':False})
            # Capture both end sizes; visual inspection happens separately.
            label=path.strip('/').replace('/','-').replace('.html','') or 'home'
            page.screenshot(path=str(ARTIFACTS/f'audit-{label}-mobile.png'),full_page=True)
            page.screenshot(path=str(ARTIFACTS/f'audit-{label}-mobile-viewport.png'))
            page.set_viewport_size({'width':1440,'height':1000})
            page.screenshot(path=str(ARTIFACTS/f'audit-{label}-desktop.png'),full_page=True)
            page.screenshot(path=str(ARTIFACTS/f'audit-{label}-desktop-viewport.png'))
        page.goto(base+'/')
        order=page.locator('.projects>article').evaluate_all('(els)=>els.map(e=>e.id)')
        assert order==['p-3dx','p-essais','a380Project','p-dronelab','p-aero','p-hexa'],order
        assert page.locator('.hero .flow-card').count()==0
        assert page.locator('#ecoulement #flow').count()==1
        page.locator('.flow-discovery>summary').click()
        page.locator('#alpha').fill('10');page.locator('#alpha').dispatch_event('input')
        page.locator('#flowMoreBtn').click()
        expect(page.locator('#flowMore')).to_be_visible()
        assert 'NaN' not in page.locator('#flowMore').inner_text()
        for id in ['fCl','fCd','fRe']:
            assert page.locator('#'+id).inner_text().strip(),id
        page.locator('[data-f=live]').click()
        assert page.locator('.mx tbody tr:visible').count()==3
        page.locator('[data-f=all]').click()
        assert page.locator('.mx tbody tr:visible').count()==11
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#menuBtn').click();expect(page.locator('#menuBtn')).to_have_attribute('aria-expanded','true')
        page.keyboard.press('Escape');expect(page.locator('#menuBtn')).to_have_attribute('aria-expanded','false')
        for theme in ['light','dark']:
            page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
            page.screenshot(path=str(ARTIFACTS/f'audit-home-{theme}-mobile.png'),full_page=True)
        # Internal links retain ordinary navigation; no forced new tab.
        assert page.locator('.hero a[href="contact.html"]').get_attribute('target') is None
        page.goto(base+'/contact.html')
        page.locator('button[type=submit]').click()
        expect(page.locator('#err')).to_contain_text('Indiquez')
        expect(page.locator('#nom')).to_be_focused()
        uri=page.evaluate('(args)=>buildMailDraft(...args)',['Éloïse & Marc','R&D','Poste système','Bonjour ?\nEssai #1 + suite'])
        parts=urlsplit(uri);args=parse_qs(parts.query)
        assert parts.scheme=='mailto' and parts.path=='Emmatchouya@gmail.com'
        assert args['subject']==['Poste système — Éloïse & Marc (R&D)']
        assert args['body']==['Bonjour ?\nEssai #1 + suite\n\nÉloïse & Marc\nR&D']
        assert page.locator('form').inner_text().find('ouvre votre messagerie')>=0
        # Contrast of white primary-button text at both ends of the gradient.
        contrast=[(1.05)/(luminance(c)+.05) for c in [(33,76,201),(8,121,111)]]
        assert min(contrast)>=4.5,contrast
        assert not errors,errors
        assert not failed,failed
        report={'views':results,'localHttpFailures':failed,'javascriptErrors':errors,'primaryButtonContrast':contrast,'contact':'draft URI and empty-form validation tested; no external mail client opened','projectOrder':order}
        (ARTIFACTS/'portfolio-ui.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print('PASS: 40 page/width combinations, screenshots, project order, retained Joukowski, proof filters, mobile menu, contact encoding and local assets',flush=True)
        browser.close()

if __name__=='__main__':
    with server() as base:main(base)
