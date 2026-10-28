"""Source model smoke/numerical QA; independent reference added below."""
import json
import math
from pathlib import Path
import numpy as np
from scipy.interpolate import RegularGridInterpolator
from scipy.optimize import root, brentq
from playwright.sync_api import sync_playwright
from test_a380_lab import server, ARTIFACTS


def independent_trim(data, point, config):
    """SciPy HYBR and explicit vector moments, independent of JS Newton solver."""
    wb, ht = data['surfaces']['wb'], data['surfaces']['ht']
    grids = {key: {k: RegularGridInterpolator((s['alpha'], s['mach']), s[k], bounds_error=True)
                    for k in ['cl', 'cd'] + (['cm'] if key == 'wb' else [])}
             for key, s in [('wb', wb), ('ht', ht)]}
    q, mass, mach = point['q'], point['mass'], point['mach']
    phi = math.radians(2)
    delta = config['cgOffset']

    def residual(state, full=False):
        alpha, stab = state
        ar = math.radians(alpha)
        eps = math.radians(1.18 + .37 * alpha)
        ah = alpha - math.degrees(eps) + stab
        cw = {k: float(g((alpha, mach))) for k, g in grids['wb'].items()}
        ch = {k: float(g((ah, mach))) for k, g in grids['ht'].items()}
        lift = [q * wb['Sref'] * cw['cl'], q * ht['Sref'] * (ch['cl'] * math.cos(eps) - ch['cd'] * math.sin(eps))]
        drag = [q * wb['Sref'] * cw['cd'], q * ht['Sref'] * (ch['cd'] * math.cos(eps) + ch['cl'] * math.sin(eps))]
        thrust = sum(drag) / math.cos(ar + phi)
        moment = q * wb['Sref'] * wb['Cref'] * cw['cm']
        locations = [[-delta, 0, 0], [ht['Xcg'] - wb['Xcg'] - delta, 0, ht['Zcg'] - wb['Zcg']]]
        for location, l, d in zip(locations, lift, drag):
            force = [d * math.cos(ar) - l * math.sin(ar), 0, l * math.cos(ar) + d * math.sin(ar)]
            moment += np.cross(location, force)[1]
        for x, z in [(-1.7, -.5), (-6, -1.6)]:
            force = [-thrust / 2 * math.cos(phi), 0, thrust / 2 * math.sin(phi)]
            moment += np.cross([x - delta, 0, z], force)[1]
        r = [(sum(lift) + thrust * math.sin(ar + phi) - mass * 9.80665) / (mass * 9.80665),
             moment / (q * wb['Sref'] * wb['Cref'])]
        return (thrust, r) if full else r

    solution = root(residual, [point['alpha'], point['stab']], method='hybr', tol=1e-11)
    assert solution.success or max(abs(np.array(residual(solution.x)))) < 1e-10
    thrust, _ = residual(solution.x, True)
    assert np.max(abs(solution.x - [point['alpha'], point['stab']])) < 1e-5
    assert abs(thrust - point['thrust']) < .1
    if point['feasible']:
        engine = data['engine']
        poly = lambda p, n: sum(v * n ** int(k[0]) * mach ** int(k[1]) for k, v in p.items())
        n1 = brentq(lambda n: poly(engine['thrustPolynomial'], n) * engine['thrustRefN'] - thrust / (4 * point['delta']),
                    config['n1Min'], config['n1Max'], xtol=1e-11)
        flow = 4 * poly(engine['flowPolynomial'], n1) * engine['flowMultiplier'] * engine['flowRefKgS'] * point['delta'] * math.sqrt(point['theta'])
        assert abs(n1 - point['n1c']) < 1e-5
        assert abs(flow - point['flow']) < 1e-6


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width':1512,'height':1080})
        page.goto(url + '/index.html', wait_until='domcontentloaded')
        values = page.evaluate("""async () => {
          const m=await import('./projets/a380-lab/model.js'),pm=await import('./projets/a380-lab/project-model.js');
          const data=m.validateTables(await (await fetch('./projets/a380-lab/data/project.json')).json());
          const config={...m.DEFAULT,area:data.area};
          const points=[];for(const mass of [300000,350000,400000,500000])for(const mach of [.67,.75,.85,.89])try{points.push(m.flightPoint(config,mass,10668,mach,data));}catch(e){points.push({mach,mass,error:e.message,trim:pm.projectTrim(config,mass,mach,.5*m.atmosphere(10668).rho*(mach*m.atmosphere(10668).a)**2,data,m.interpolate)});}
          const mission=m.simulate(config,undefined,data,20,true);
          const lowConfig={...config,mass:300000,altitude:8000,mach:.6,minAltitude:8000,maxAltitude:9500,minMach:.5,maxMach:.8};
          const lowPoint=m.flightPoint(lowConfig,lowConfig.mass,8000,.6,data),lowMission=m.simulate(lowConfig,undefined,data,10,true);
          if(pm.referenceIndex([.1,.2],[0,1],.15)!==null)throw Error('Zero emission index must stay unavailable');
          if(pm.referenceIndex([.1,.2],[1,2],.25)!==null)throw Error('Emission extrapolation must be rejected');
          return {points,config,mission,lowConfig,lowPoint,lowMission,polynomials:{fn95:pm.polynomial(data.engine.thrustPolynomial,95,.8),wf95:pm.polynomial(data.engine.flowPolynomial,95,.8)*2}};
        }""")
        print('500 t audit:',values['mission']['reasons'],flush=True)
        print('300 t check:',{k:v for k,v in values['lowMission'].items() if k not in ['rows','lastPoint']},flush=True)
        ARTIFACTS.mkdir(exist_ok=True,parents=True)
        (ARTIFACTS/'project-results.json').write_text(json.dumps(values,indent=2),encoding='utf-8')
        for point in values['points']:
            if 'error' not in point:
                assert abs(point['trimForceResidual'])<1e-8
                assert abs(point['trimMomentResidual'])<1e-8
        data=json.loads((Path(__file__).resolve().parents[1]/'projets/a380-lab/data/project.json').read_text(encoding='utf-8'))
        for point in values['points']:
            independent_trim(data,point,values['config'])
        independent_trim(data,values['lowPoint'],values['lowConfig'])
        assert values['lowMission']['feasible'],values['lowMission'].get('reasons')
        assert not values['mission']['feasible']
        assert abs(values['polynomials']['fn95']-.4063312749816)<1e-12
        assert abs(values['polynomials']['wf95']-.3532071094669761)<1e-12
        print('17 independent SciPy trim solutions + engine inversion: PASS',flush=True)
        page.goto(url+'/projets/a380-lab/',wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('#status').textContent.includes('profils explorés') || document.querySelector('#status').textContent.includes('Aucun profil')",timeout=300000)
        print('Project UI:',page.locator('#status').inner_text(),flush=True)
        assert page.locator('#modelTag').inner_text()=='Projet MGA803'
        assert 'Aucun profil' in page.locator('#status').inner_text()
        assert '422,7' in page.locator('#constraints').inner_text()
        page.locator('#verificationCase').click()
        page.wait_for_function("!document.querySelector('#run').disabled",timeout=300000)
        print('300 t optimization:',page.locator('#status').inner_text(),flush=True)
        assert 'profils explorés' in page.locator('#status').inner_text()
        page.screenshot(path=str(ARTIFACTS/'project-desktop.png'),full_page=True)
        with page.expect_download() as download:
            page.locator('#exportStudy').click()
        download.value.save_as(ARTIFACTS/'project-study.json')
        study=json.loads((ARTIFACTS/'project-study.json').read_text(encoding='utf-8'))
        assert study['result']['checks'][-1]['pass'] and study['result']['checks'][-2]['pass']
        assert study['modelStatus']=='project-data/reconstructed-unvalidated'
        assert study['result']['convergence']['relative']<1e-6
        page.get_by_role('tab',name='Modèle & données').click()
        page.locator('#importData').set_input_files(ARTIFACTS/'project-study.json')
        page.wait_for_function("document.querySelector('#dataStatus').textContent.includes('Tables chargées')")
        assert page.locator('#modelTag').inner_text()=='Projet MGA803'
        assert page.locator('[name=cgOffset]').is_enabled()
        assert page.locator('[name=disa]').is_enabled()
        page.set_viewport_size({'width':390,'height':844})
        for tab in ['Synthèse','Domaine de vol','Modèle & données','Méthode & validation']:
            page.get_by_role('tab',name=tab).click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),tab
        page.get_by_role('tab',name='Synthèse').click()
        page.screenshot(path=str(ARTIFACTS/'project-mobile.png'),full_page=True)
        print('Project source, failed/feasible cases, optimization, >2 MB round-trip, mobile: PASS',flush=True)
        browser.close()


if __name__=='__main__':
    with server() as base:
        main(base)
