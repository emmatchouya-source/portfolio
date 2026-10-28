"""Full mission physics, independent runway ODEs and browser regression."""
import csv
import io
import json
import math
import sys
from pathlib import Path
import numpy as np
from scipy.integrate import solve_ivp
from scipy.interpolate import BPoly
from playwright.sync_api import sync_playwright,expect
from test_a380_lab import server,ARTIFACTS
from test_a380_trajectory import seek

G=9.80665


def atmosphere(h,disa):
    t=max(216.65,288.15-.0065*h)
    p11=101325*(216.65/288.15)**(G/(287.05287*.0065))
    p=101325*(t/288.15)**(G/(287.05287*.0065)) if h<=11000 else p11*math.exp(-G*(h-11000)/(287.05287*216.65))
    return {'rho':p/(287.05287*(t+disa)),'delta':p/101325,'a':math.sqrt(1.4*287.05287*(t+disa))}


BLEND=BPoly.from_derivatives([0,1],[[0,0,0],[1,0,0]])
def smooth(x):return float(BLEND(max(0,min(1,x))))


def check_runways_independently(c,r):
    a=atmosphere(c['depElevation'],c['disa'])
    vr=1.1*math.sqrt(2*c['mass']*G/(a['rho']*c['area']*c['takeoffClMax']))
    def roll(t,y,rotation=None):
        x,u,m=y;v=max(0,u-c['wind']);q=.5*a['rho']*v*v
        cl=.3+(c['takeoffClMax']/1.2**2-.3)*(0 if rotation is None else smooth((t-rotation)/c['rotationTime']))
        lift=q*c['area']*cl;drag=q*c['area']*(c['takeoffCd0']+c['airportHighLiftK']*cl*cl)
        thrust=4*c['thrustSL']*a['delta']**.7*(1-.25*v/a['a'])*c['airportPower']
        flow=max(c['airportIdleFlow'],thrust*c['airportTsfc']*1e-6)
        return [u,(thrust-drag-c['rollingMu']*max(0,m*G-lift))/m,-flow]
    def rotation_event(t,y):return y[1]-c['wind']-vr
    rotation_event.terminal=True
    first=solve_ivp(roll,(0,300),[0,0,c['mass']],events=rotation_event,method='DOP853',rtol=1e-12,atol=1e-9)
    assert first.t_events[0].size
    start=first.t[-1]
    def liftoff_event(t,y):
        cl=.3+(c['takeoffClMax']/1.2**2-.3)*smooth((t-start)/c['rotationTime'])
        return .5*a['rho']*max(0,y[1]-c['wind'])**2*c['area']*cl-y[2]*G
    liftoff_event.terminal=True
    second=solve_ivp(lambda t,y:roll(t,y,start),(start,start+100),first.y[:,-1],events=liftoff_event,method='DOP853',rtol=1e-12,atol=1e-9,max_step=.1)
    assert second.t_events[0].size
    assert abs(second.y[0,-1]-r['airport']['takeoffRollM'])<.02
    phase=r['phases'][1]
    assert abs(second.t[-1]-phase['endSeconds'])<.002
    assert abs(c['mass']-second.y[2,-1]-sum(p['burn'] for p in r['phases'][:2]))<.01
    # Independent rollout from the actual touchdown state, including changing lift,
    # brake delay, fuel mass loss and brake work. No JS integration stages are reused.
    td=next(w for w in r['waypoints'] if w['kind']=='touchdown')
    point=min(r['rows'],key=lambda p:abs(p['seconds']-td['seconds']))
    a=atmosphere(c['arrElevation'],c['disa']);initial_cl=point['cl']
    def braking(t,y):
        x,u,m,e=y;v=max(0,u-c['wind']);q=.5*a['rho']*v*v
        cl=.2+(initial_cl-.2)*(1-smooth(t));normal=max(0,m*G-q*c['area']*cl)
        drag=q*c['area']*(c['landingCd0']+c['airportHighLiftK']*cl*cl)
        brake=c['brakeMu']*smooth(t-c['brakeDelay'])*normal
        return [max(0,u),(c['airportIdleThrust']-drag-brake-c['rollingMu']*normal)/m,-c['airportIdleFlow'],brake*max(0,u)]
    def stop(t,y):return y[1]
    stop.terminal=True
    solution=solve_ivp(braking,(0,300),[td['x']*1000,point['gs'],point['mass'],0],events=stop,method='DOP853',rtol=1e-12,atol=1e-8,max_step=.05)
    assert solution.t_events[0].size
    assert abs(solution.y[0,-1]-r['rows'][-1]['x']*1000)<.03
    assert abs(solution.y[3,-1]/1e6-r['airport']['brakeEnergyMJ'])<.003
    assert abs(solution.y[2,-1]-r['finalMass'])<.01


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1512,'height':1080},accept_downloads=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/index.html',wait_until='domcontentloaded')
        values=page.evaluate("""async()=>{
          const m=await import('./projets/a380-lab/model.js?v=1.3.0'),s=await import('./projets/a380-lab/scenarios.js?v=1.3.0'),o=await import('./projets/a380-lab/optimizer.js?v=1.3.0');
          const tables=await(await fetch('./projets/a380-lab/data/project.json')).json(),c=s.scenarioConfig('full',tables.area),r=m.simulate(c,undefined,tables,5),checks=[];
          const test=(name,pass)=>{if(!pass)throw Error(name);checks.push(name);};
          test('source cruise plus low-speed phases feasible',r.feasible);
          test('starts at rest at departure elevation',r.rows[0].gs===0&&r.rows[0].h===c.depElevation);
          test('ends at rest at arrival elevation',r.rows.at(-1).gs===0&&r.rows.at(-1).h===c.arrElevation);
          test('mass and fuel closure',Math.abs(c.mass-r.finalMass-r.burn)<1e-8&&Math.abs(r.remainingFuel-(c.fuel-r.burn))<1e-8);
          test('phase fuel closure',Math.abs(r.phases.reduce((s,p)=>s+p.burn,0)-r.burn)<1e-6);
          test('phase time closure',Math.abs(r.phases.reduce((s,p)=>s+p.duration,0)-r.seconds)<1e-7);
          test('no cruise fuel duplication',Math.abs(r.cruiseConfig.mass-(c.mass-r.phases.slice(0,4).reduce((s,p)=>s+p.burn,0)))<1e-7);
          test('monotonic ground distance and time',r.rows.every((p,i,a)=>!i||(p.seconds>a[i-1].seconds&&p.x>=a[i-1].x)));
          test('no instantaneous altitude jumps',r.rows.every((p,i,a)=>!i||Math.abs(p.h-a[i-1].h)/(p.seconds-a[i-1].seconds)<25));
          test('closure at arrival threshold',Math.abs(r.airport.thresholdClosureM)<.1);
          test('runway margins positive',r.airport.toraMarginM>0&&r.airport.todaMarginM>0&&r.airport.ldaMarginM>0);
          test('initial climb fuel counted',r.phases.find(p=>p.phase==='departure-climb').burn>0);
          test('flare included',r.phases.some(p=>p.phase==='flare'&&p.duration>0));
          test('noncruise emissions unavailable',r.emissions.nox===null&&r.cruiseEmissions.nox>0);
          test('airborne power balance',r.energy.maxNormalizedResidual<1e-7);
          const fine=m.simulate(c,undefined,tables,2.5,false);
          test('full mission convergence '+JSON.stringify({fuelKg:r.burn-fine.burn,timeS:r.seconds-fine.seconds,reason:fine.reasons}),Math.abs(r.burn-fine.burn)<.1&&Math.abs(r.seconds-fine.seconds)<.05);
          for(const [name,patch] of [['short takeoff runway',{tora:500}],['short takeoff distance',{tora:1000,toda:1000}],['short landing runway',{lda:500}],['brake energy limit',{brakeEnergyLimit:1}],['landing mass limit',{landingMassLimit:200000}],['reserve',{reserve:70000}],['route too short',{distance:100}],['approach too slow',{approachEAS:50}]]){
            const q=m.simulate({...c,...patch},undefined,tables,10,false);test('reject '+name,!q.feasible&&q.reasons.length>0);
          }
          const tail=m.simulate({...c,wind:10},undefined,tables,10,false),head=m.simulate({...c,wind:-10},undefined,tables,10,false);
          test('tailwind increases takeoff distance',tail.feasible&&tail.airport.takeoffRollM>r.airport.takeoffRollM);
          test('headwind reduces takeoff distance',head.feasible&&head.airport.takeoffRollM<r.airport.takeoffRollM);
          test('tailwind increases landing distance',tail.airport.landingFromThresholdM>r.airport.landingFromThresholdM);
          const wet=m.simulate({...c,brakeMu:.1},undefined,tables,10,false);test('lower friction increases landing roll',wet.feasible&&wet.airport.landingRollM>r.airport.landingRollM);
          const hot=m.simulate({...c,depElevation:1500,disa:20},undefined,tables,10,false);test('high hot airport increases takeoff roll',hot.feasible&&hot.airport.takeoffRollM>r.airport.takeoffRollM);
          const elevated=m.simulate({...c,arrElevation:1000},undefined,tables,10,true);test('arrival altitude preserved',elevated.feasible&&elevated.rows.at(-1).h===1000);
          test('nonfinite mass rejected',!m.simulate({...c,mass:NaN},undefined,tables,10,false).feasible);
          const opt=o.optimize({...c,minMach:.60,maxMach:.61,minAltitude:8000,maxAltitude:8000});
          test('optimizer uses full mission',opt.best.fullMission&&opt.best.phases.length===9&&opt.checks.every(x=>x.pass));
          test('best not worse than baseline',opt.best.score<=opt.baseline.score+1e-6);
          return {c,r,checks,summary:{burn:r.burn,seconds:r.seconds,airport:r.airport}};
        }""")
        check_runways_independently(values['c'],values['r'])
        (ARTIFACTS/'full-mission-verification.json').write_text(json.dumps(values['summary'],ensure_ascii=False,indent=2),encoding='utf-8')
        print('Full mission:',len(values['checks']),'physical checks + independent DOP853 takeoff/landing PASS',flush=True)
        page.goto(base+'/projets/a380-lab/?scenario=full&view=3d',wait_until='domcontentloaded')
        page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#status').textContent.includes('profils explorés')",timeout=300000)
        expect(page.locator('#studyScenario')).to_have_value('full')
        expect(page.locator('[name=missionMode]')).to_have_value('1')
        expect(page.locator('#airportQuick')).to_be_visible()
        expect(page.locator('#flightCamera')).to_have_value('auto')
        expect(page.locator('#flightSpeed')).to_have_value('auto')
        expect(page.locator('#flightPhaseAudit tbody tr')).to_have_count(9)
        expect(page.locator('#flightStage')).to_contain_text('Accélération sur piste')
        with page.expect_download() as event:page.locator('#exportStudy').click()
        study_path=ARTIFACTS/'full-mission-study.json';event.value.save_as(study_path)
        study=json.loads(study_path.read_text(encoding='utf-8'));r=study['result']['baseline']
        assert r['fullMission'] and r['airport']['modelStatus']=='parametric-low-speed/unvalidated'
        flare=next(p for p in r['phases'] if p['phase']=='flare')
        seek(page,flare['startSeconds']-.1)
        page.locator('#flightCanvas').scroll_into_view_if_needed()
        page.locator('#flightPlay').click()
        page.wait_for_function("document.querySelector('#flightStage').textContent.includes('Arrondi')")
        page.locator('#flightPlay').click()
        assert float(page.locator('#flightTimeline').input_value())<flare['startSeconds']+1
        for name,phase in [('Rotation','rotation'),('Approche','approach'),('Arrondi','flare'),('Freinage sur piste','landing-roll')]:
            page.locator('#flightStages').get_by_role('button',name=name,exact=True).click()
            expect(page.locator('#flightStage')).to_contain_text(name)
            selected=next(p for p in r['phases'] if p['phase']==phase)
            seek(page,(selected['startSeconds']+selected['endSeconds'])/2)
            assert float(page.locator('#flightFuel').inner_text().replace('\u202f','').replace(',','.'))>0
            page.locator('#flightCanvas').scroll_into_view_if_needed();page.wait_for_timeout(80)
            if phase in ['rotation','flare']:page.locator('#trajectory').screenshot(path=str(ARTIFACTS/('full-'+phase+'.png')))
        page.get_by_role('button',name='Arrêt final',exact=True).click()
        expect(page.locator('#flightTAS')).to_have_text('0')
        expect(page.locator('#flightAltitude')).to_have_text('0')
        with page.expect_download() as event:page.locator('#flightCSV').click()
        rows=list(csv.DictReader(io.StringIO(event.value.path().read_text(encoding='utf-8'))))
        assert {'takeoff-roll','rotation','initial-climb','departure-climb','cruise','descent','approach','flare','landing-roll'}<={p['phase'] for p in rows}
        page.get_by_role('tab',name='Synthèse',exact=True).click()
        expect(page.locator('#airportSummary')).to_be_visible()
        assert 'DURÉE DU VOL COMPLET' in page.locator('#kpis').inner_text()
        page.get_by_role('tab',name='Modèle & données').click()
        page.locator('#importData').set_input_files(study_path)
        expect(page.locator('#errorDialog')).not_to_be_visible()
        expect(page.locator('[name=missionMode]')).to_have_value('1')
        page.set_viewport_size({'width':390,'height':844})
        for tab in ['Synthèse','Trajectoire 3D','Modèle & données']:
            page.get_by_role('tab',name=tab,exact=True).click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),tab
        page.get_by_role('tab',name='Trajectoire 3D',exact=True).click()
        page.locator('#trajectory').screenshot(path=str(ARTIFACTS/'full-mobile.png'))
        assert not errors,errors
        print('Full mission UI PASS: preset, 3D phases/cameras, runway budget, totals, CSV/JSON, import, mobile',flush=True)
        browser.close()


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
