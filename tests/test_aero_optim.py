"""Reproduce the public scenario, check an independent Breguet integral and UI regressions."""
import hashlib
import json
import math
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright, expect
from test_a380_lab import server

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'.test-artifacts'

def main(base,record=False):
    ART.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000})
        errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/aero-optim/')
        page.locator('#referenceDemo').click()
        page.wait_for_function("!document.querySelector('#runOpt').disabled && document.querySelector('#optStatus').textContent.includes('Terminé')",timeout=120000)
        r=page.evaluate('({params:readParams(),options:readOpt(),base:heat.base,opt:heat.opt})')
        assert r['base']['feasible'] and r['opt']['feasible']
        gain=100*(r['opt']['val']/r['base']['val']-1)
        assert abs(gain-30.9503849998566)<.001,gain
        assert abs(r['opt']['val']-2046.6119985867592)<.001
        assert r['opt']['Vs0']<=r['options']['VsMax'] and r['opt']['roc0']>=r['options']['ROCmin']
        assert abs(r['opt']['AR']-14)<1e-6 and abs(r['opt']['b']-16.5)<1e-6
        # Analytical constant-CL propeller Breguet range; independent of the midpoint sum.
        for k in ['base','opt']:
            c=r[k];m0=c['m'];m1=m0-r['params']['fuel']*(1-r['params']['reserve']/100)
            exact=r['params']['etap']*c['LD']/(r['params']['bsfc']/3.6e6*9.80665)*math.log(m0/m1)/1000
            assert abs(c['val']/exact-1)<2e-6,(k,c['val'],exact)
        # Independent scalar evaluation checks the fixed point reached by eight JS iterations.
        def wing(c):
            o=r['options']
            return .036*(c['S']*10.7639)**.758*(r['params']['fuel']*2.20462)**.0035*c['AR']**.6*50**.006*.6**.04*(100*o['tc'])**-.3*(o['Nz']*c['m']*2.20462)**.49/2.20462
        base_wing=wing(r['base']);opt_wing=wing(r['opt'])
        assert abs(r['base']['wingMass']-base_wing)<1e-8
        assert abs(r['opt']['m']-(r['base']['m']-base_wing+opt_wing))<.001
        record_data={'schema':'aero-public-example/v1','scope':'synthetic generic monomotor / not flight validated','sourceSha256':hashlib.sha256((ROOT/'projets/aero-optim/index.html').read_text(encoding='utf-8').replace('\r\n','\n').encode()).hexdigest(),**r,'gainPercent':gain}
        dest=ROOT/'projets/aero-optim/reference-example.json'
        if record:dest.write_text(json.dumps(record_data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        else:
            saved=json.loads(dest.read_text(encoding='utf-8'))
            assert saved['sourceSha256']==record_data['sourceSha256'],'Source changed: inspect before recording again'
            assert abs(saved['opt']['val']-r['opt']['val'])<.001
            assert saved['params']==r['params'] and saved['options']==r['options']
        (ART/'aero-verification.json').write_text(json.dumps(record_data,indent=2),encoding='utf-8')
        expect(page.locator('#optResult')).to_contain_text('Masse aile estimée')
        expect(page.locator('#optResult')).to_contain_text('Traînée en début')
        expect(page.locator('#applyOpt')).to_be_enabled()
        page.locator('#b').fill('12')
        expect(page.locator('#applyOpt')).to_be_disabled()
        page.locator('#hmin').fill('6000');page.locator('#hmax').fill('1000')
        page.locator('#runOpt').click()
        expect(page.locator('#optStatus')).to_contain_text('Contraintes invalides')
        rejected=page.evaluate("""()=>{const p={...PRESETS.c172};return [{m:0},{fuel:1200},{reserve:100},{h:Infinity},{bsfc:0},{etap:1.5},{S:NaN},{h:-1}].every(bad=>!validParams({...p,...bad}));}""")
        assert rejected
        page.locator('#referenceDemo').click()
        page.wait_for_function("!document.querySelector('#runOpt').disabled",timeout=120000)
        page.locator('#VsMax').fill('1');page.locator('#runOpt').click()
        page.wait_for_function("!document.querySelector('#runOpt').disabled",timeout=120000)
        expect(page.locator('#optStatus')).to_contain_text('Aucune configuration')
        expect(page.locator('#applyOpt')).to_be_disabled()
        for width in [1440,768,390,360]:
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
        page.get_by_role('tab',name='Optimisation',exact=True).focus();page.keyboard.press('ArrowRight')
        expect(page.get_by_role('tab',name='Sensibilité',exact=True)).to_have_attribute('aria-selected','true')
        assert not errors,errors
        print(json.dumps({'gainPercent':gain,'reference':r['base'],'solution':r['opt']},ensure_ascii=False),flush=True)
        print('PASS: reproducible AeroOptim, Breguet reference, mass closure, constraints, stale results, invalid cases, keyboard and 4 widths',flush=True)
        browser.close()

if __name__=='__main__':
    with server() as base:main(base,'--record' in sys.argv)
