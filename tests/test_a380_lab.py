"""A380 numerical and browser regression checks. Run: python -X utf8 tests/test_a380_lab.py"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import math
import sys

from playwright.sync_api import sync_playwright, expect
from scipy.integrate import solve_ivp

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / '.test-artifacts' / 'a380'


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextmanager
def server():
    http = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{http.server_port}'
    finally:
        http.shutdown()
        thread.join()
        http.server_close()


def reference_mission(config, profile):
    from a380_reference import reference_mission as independent
    return independent(config,profile)


def main(base_url=None):
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        context = browser.new_context(viewport={'width': 1512, 'height': 1080}, accept_downloads=True)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base_url + '/projets/a380-lab/?model=parametric', wait_until='networkidle')
        page.wait_for_function("document.querySelector('#status').textContent.includes('profils explorés')", timeout=120000)
        print('Initial:', page.locator('#status').inner_text(), flush=True)
        assert page.locator('#kpis').inner_text().find('NaN') == -1
        page.screenshot(path=str(ARTIFACTS / 'desktop.png'), full_page=True)

        numeric = page.evaluate("""async () => {
          const m=await import('./model.js'),o=await import('./optimizer.js'),c={...m.DEFAULT};
          const checks=[];const test=(name,value)=>{if(!value)throw Error(name);checks.push(name);};
          test('self checks',m.selfCheck().every(x=>x.pass));
          test('ISA temperature 11 km',Math.abs(m.atmosphere(11000).T-216.65)<1e-10);
          test('ISA continuous tropopause',Math.abs(m.atmosphere(11000-.0001).p-m.atmosphere(11000+.0001).p)<.001);
          test('ISA density 20 km',Math.abs(m.atmosphere(20000).rho-.0880347)<.000001);
          const base=m.simulate(c),head=m.simulate({...c,wind:-30}),tail=m.simulate({...c,wind:30});
          test('baseline feasible',base.feasible);
          test('mass conservation',Math.abs(base.finalMass+base.burn-c.mass)<1e-8);
          test('fuel reserve accounting',Math.abs(base.remainingFuel-(c.fuel-base.burn))<1e-8);
          test('CO2 factor',base.co2===base.burn*3.16);
          test('headwind penalty',head.burn>base.burn&&head.seconds>base.seconds);
          test('tailwind benefit',tail.burn<base.burn&&tail.seconds<base.seconds);
          test('reserve enforced',!m.simulate({...c,fuel:20000,reserve:19000}).feasible);
          test('CL enforced',!m.simulate({...c,clMax:.3}).feasible);
          test('thrust enforced',!m.simulate({...c,thrustLimit:.01}).feasible);
          test('duration enforced',!m.simulate({...c,maxMinutes:1}).feasible);
          const stepped=m.simulate(c,{mach:.75,altitude:10000,steps:2},null,7);
          test('climb end 1 exact',stepped.rows.some(r=>Math.abs(r.x-stepped.climbs[0].end/1000)<1e-8&&r.h===10600));
          test('climb end 2 exact',stepped.rows.some(r=>Math.abs(r.x-stepped.climbs[1].end/1000)<1e-8&&r.h===11200));
          test('end distance exact',Math.abs(stepped.rows.at(-1).x-c.distance)<1e-9);
          const speeds=m.speedStudy(c),faster=m.speedStudy({...c,ci:500});
          test('LRC exists',Boolean(speeds.lrc));
          test('LRC high speed root',speeds.lrc.mach>speeds.mrc.mach);
          test('LRC 99 percent SR',Math.abs(speeds.lrc.sr/speeds.mrc.sr-.99)<1e-9);
          test('ECON responds to CI',faster.econ.mach>=speeds.econ.mach);
          test('CI zero MRC',m.speedStudy({...c,ci:0}).econ.mach===speeds.mrc.mach);
          test('speed study exact upper bound',m.speedStudy({...c,minMach:.7501,maxMach:.7502}).points.at(-1).mach===.7502);
          let rejected=0;for(const patch of [{mass:NaN},{minMach:.85,maxMach:.6},{fuel:c.mass},{steps:.5},{maxAltitude:14000},{reserve:c.fuel}])try{m.validateConfig({...c,...patch});}catch{rejected++;}
          test('invalid config rejected',rejected===6);
          const t={schema:'a380-cruise-tables/v1',name:'Test affine',source:'Synthetic numerical test',area:859,mach:[.5,.89],cl:[.1,1.5],altitude:[8000,13100],cd:[[.03,.04],[.04,.05]],tsfc:[[.00001,.000015],[.000015,.00002]],maxThrust:[[800000,500000],[700000,400000]]};
          m.validateTables(t);test('imported flight point',m.flightPoint(c,500000,10000,.75,t).feasible);
          let outside=false;try{m.interpolate([0,1],[0,1],[[0,1],[1,2]],1.001,.5)}catch{outside=true}test('no extrapolation',outside);
          for(const patch of [{mach:[.8,.7]},{cd:[[.02],[.02]]},{tsfc:[[0,0],[0,0]]},{source:''}]){let bad=false;try{m.validateTables({...t,...patch});}catch{bad=true;}test('invalid table rejected '+JSON.stringify(patch),bad);}
          test('table ISA constraint',!m.simulate({...c,altitude:9000,mach:.5},undefined,{...t,cl:[.1,.2]}).feasible);
          const domain={...c,minMach:.70,maxMach:.78,minAltitude:10000,maxAltitude:11000,maxSteps:2};
          const opt=o.optimize(domain);test('optimizer feasible',opt.best.feasible);
          test('optimizer improves baseline',opt.best.score<=opt.baseline.score+1e-6);
          test('optimizer bounds',opt.best.profile.mach>=domain.minMach&&opt.best.profile.mach<=domain.maxMach&&opt.best.profile.altitude>=domain.minAltitude&&opt.best.profile.altitude<=domain.maxAltitude);
          test('optimizer convergence',opt.convergence.relative<1e-7);
          test('optimizer infeasible domain',o.optimize({...domain,clMax:.3}).best===null);
          test('frontier ordered',opt.pareto.every((r,i,a)=>!i||(r.seconds>=a[i-1].seconds&&r.burn<a[i-1].burn)));
          test('heatmap regular grid only',!opt.heat.some(p=>p.altitude===c.altitude));
          for(const objective of ['time','econ']) {
            const small={...domain,minMach:.74,maxMach:.78,minAltitude:10000,maxAltitude:10250,maxSteps:1,objective};
            const q=o.optimize(small);test('objective '+objective,q.best.feasible&&q.best.score<=q.baseline.score);
          }
          return {checks,config:c,profile:stepped.profile,stepped:{burn:stepped.burn,seconds:stepped.seconds},baseline:{burn:base.burn,seconds:base.seconds},opt:{profile:opt.best.profile,burn:opt.best.burn,convergence:opt.convergence}};
        }""")
        for key, profile in [('baseline', {'mach': .75, 'altitude': 10668, 'steps': 0}), ('stepped', numeric['profile'])]:
            fuel, seconds = reference_mission(numeric['config'], profile)
            assert abs(fuel - numeric[key]['burn']) < .02, (fuel, numeric[key])
            assert abs(seconds - numeric[key]['seconds']) < .01
        print('Numerical checks:', len(numeric['checks']), '+ 2 independent scipy DOP853 integrations', flush=True)
        (ARTIFACTS / 'numeric-results.json').write_text(json.dumps(numeric, indent=2, ensure_ascii=False), encoding='utf-8')

        # Export/import must recreate the same numerical study, not trust embedded results.
        with page.expect_download() as event:
            page.locator('#exportStudy').click()
        study_file = ARTIFACTS / 'exported-study.json'
        event.value.save_as(study_file)
        study = json.loads(study_file.read_text(encoding='utf-8'))
        assert study['schema'] == 'a380-study/v1'
        assert study['result']['best']['feasible']
        with page.expect_download() as event:
            page.locator('#exportCSV').click()
        csv_file = ARTIFACTS / 'trajectory.csv'
        event.value.save_as(csv_file)
        assert len(csv_file.read_text().splitlines()) > 100
        page.get_by_role('tab', name='Modèle & données').click()
        with page.expect_download() as event:
            page.locator('#template').click()
        table_file = ARTIFACTS / 'example-tables.json'
        event.value.save_as(table_file)
        page.locator('#importData').set_input_files(table_file)
        expect(page.locator('#modelTag')).to_have_text('Tables importées')
        assert page.locator('[name=area]').is_disabled()
        page.get_by_role('button', name='Analyser & optimiser').click()
        page.wait_for_function("!document.querySelector('#run').disabled", timeout=120000)
        assert 'profils explorés' in page.locator('#status').inner_text()
        assert 'Tables de croisière importées' in page.locator('#modelNotice').inner_text()
        page.locator('#importData').set_input_files(study_file)
        expect(page.locator('#modelTag')).to_have_text('Paramétrique')
        page.locator('#run').click()
        page.wait_for_function("!document.querySelector('#run').disabled", timeout=120000)
        with page.expect_download() as event:
            page.locator('#exportStudy').click()
        repeat_file = ARTIFACTS / 'repeat.json'
        event.value.save_as(repeat_file)
        repeat = json.loads(repeat_file.read_text(encoding='utf-8'))
        assert abs(repeat['result']['best']['burn'] - study['result']['best']['burn']) < 1e-7
        # Invalid data cannot replace the valid model or run arbitrary markup.
        bad_file = ARTIFACTS / 'bad.json'
        bad_file.write_text('{"schema":"a380-cruise-tables/v1"}', encoding='utf-8')
        page.locator('#importData').set_input_files(bad_file)
        expect(page.locator('#errorDialog')).to_be_visible()
        page.get_by_role('button', name='Compris').click()
        assert page.locator('#modelTag').inner_text() == 'Paramétrique'
        page.get_by_role('tab', name='Méthode & validation').click()
        page.evaluate("() => {window.print=()=>{window.printedStudy=document.querySelector('#printMetadata').textContent;};}")
        page.locator('#printReport').click()
        assert 'Modèle paramétrique de démonstration' in page.evaluate('window.printedStudy')
        page.pdf(path=str(ARTIFACTS / 'report-preview.pdf'), format='A4', print_background=True)
        # Heatmap is keyboard operable and marks results stale until explicitly recalculated.
        page.get_by_role('tab', name='Domaine de vol').click()
        cell = page.locator('.heat-cell').first
        cell.focus()
        cell.press('ArrowRight')
        page.keyboard.press('Enter')
        assert 'Référence sélectionnée' in page.locator('#heatSelection').inner_text()
        assert 'Paramètres modifiés' in page.locator('#status').inner_text()
        page.screenshot(path=str(ARTIFACTS / 'envelope.png'), full_page=True)
        page.get_by_role('tab', name='Méthode & validation').click()
        assert page.locator('#validation .failed').count() == 0
        page.screenshot(path=str(ARTIFACTS / 'validation.png'), full_page=True)
        # Mobile layout and all tabs: no horizontal document overflow.
        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, device_scale_factor=1)
        mp = mobile.new_page()
        mp.on('pageerror', lambda e: errors.append(str(e)))
        mp.goto(base_url + '/projets/a380-lab/?model=parametric', wait_until='networkidle')
        mp.wait_for_function("!document.querySelector('#run').disabled", timeout=120000)
        for tab in ['Synthèse', 'Domaine de vol', 'Modèle & données', 'Méthode & validation']:
            mp.get_by_role('tab', name=tab).click()
            assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), tab
        mp.get_by_role('tab', name='Synthèse').click()
        mp.screenshot(path=str(ARTIFACTS / 'mobile.png'), full_page=True)
        # Infeasible scenario must clear recommendation and retain clear diagnostics.
        page.locator('summary').click()
        page.locator('[name=clMax]').fill('.3')
        page.locator('#run').click()
        page.wait_for_function("!document.querySelector('#run').disabled", timeout=120000)
        page.get_by_role('tab', name='Synthèse').click()
        assert 'Aucun profil admissible' in page.locator('#status').inner_text()
        assert 'Modifiez le domaine' in page.locator('#recommendation').inner_text()
        assert not errors, errors
        print('Browser: desktop/mobile, tabs/keyboard, JSON/CSV, table import, round-trip, invalid/infeasible cases PASS', flush=True)
        browser.close()


if __name__ == '__main__':
    if len(sys.argv) > 1:
        main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:
            main(base)
