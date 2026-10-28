"""Physical and independent numerical verification of finite cruise climbs."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from a380_reference import reference_mission
from test_a380_lab import server,ARTIFACTS
from test_a380_project import independent_trim


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1512,'height':1080},accept_downloads=True)
        page.goto(base+'/index.html',wait_until='domcontentloaded')
        data=page.evaluate("""async()=>{
          const m=await import('./projets/a380-lab/model.js?v=1.2.0'),v=await import('./projets/a380-lab/vertical-profile.js?v=1.2.0'),o=await import('./projets/a380-lab/optimizer.js?v=1.2.0');
          const t=await(await fetch('./projets/a380-lab/data/project.json')).json();
          const checks=[],test=(n,x)=>{if(!x)throw Error(n);checks.push(n)},cases=[];
          for(const patch of [{steps:0},{steps:1},{steps:2},{steps:2,wind:30,disa:10},{steps:2,wind:-30,disa:-10},{steps:1,altitude:10800}]){
            const c={...m.DEFAULT,...patch},profile={mach:c.mach,altitude:c.altitude,steps:c.steps};
            const r=m.simulate(c,profile,null,2.5),fine=m.simulate(c,profile,null,.625);
            test('feasible '+JSON.stringify(patch),r.feasible);
            test('strict time/distance '+JSON.stringify(patch),r.rows.every((p,i,a)=>!i||(p.seconds>a[i-1].seconds&&p.x>a[i-1].x)));
            test('mass closure '+JSON.stringify(patch),Math.abs(r.finalMass+r.burn-c.mass)<1e-8);
            test('power balance '+JSON.stringify(patch),r.energy.maxNormalizedResidual<1e-10);
            test('positive climb work '+JSON.stringify(patch),!c.steps||r.energy.potentialJ>0);
            test('rate constraint '+JSON.stringify(patch),r.maxRoc<=c.climbRate*(1+1e-10));
            test('convergence '+JSON.stringify(patch),Math.abs(r.burn-fine.burn)<.01&&Math.abs(r.seconds-fine.seconds)<.01);
            for(const e of r.climbs){
              test('finite duration/fuel',e.duration>0&&e.burn>0&&e.end>e.start);
              const a=v.verticalAt(r.vertical,e.start),b=v.verticalAt(r.vertical,e.end),mid=v.verticalAt(r.vertical,(e.start+e.end)/2);
              test('C2 endpoint conditions',Math.abs(a.slope)<1e-12&&Math.abs(a.curvature)<1e-12&&Math.abs(b.slope)<1e-12&&Math.abs(b.curvature)<1e-12);
              test('intermediate height',mid.h>e.from&&mid.h<e.to);
            }
            cases.push({config:c,profile,result:{burn:r.burn,seconds:r.seconds,energy:r.energy,climbs:r.climbs}});
          }
          const c={...m.DEFAULT,mass:300000,altitude:8000,mach:.6,steps:2,area:t.area,climbRate:1.27},source=m.simulate(c,undefined,t,2.5);
          test('source finite mission feasible',source.feasible);
          test('source force/energy balance',source.energy.maxNormalizedResidual<1e-7);
          test('source engine margin',source.rows.every(p=>p.thrust<=p.available*c.thrustLimit*(1+1e-8)));
          test('source 500 t still rejected',!m.simulate({...m.DEFAULT,area:t.area},undefined,t).feasible);
          test('reject insufficient climb thrust',!m.simulate({...c,climbRate:10},undefined,t).feasible);
          test('reject overlapping climbs',!m.simulate({...c,distance:100,climbRate:.5},undefined,t).feasible);
          test('reject unfinished climb',!m.simulate({...c,distance:100,climbStart2:95},undefined,t).feasible);
          test('old config upgrade',m.validateConfig(Object.fromEntries(Object.entries(c).filter(([k])=>!k.startsWith('climb')&&k!=='optimizeClimbs'))).climbRate===m.DEFAULT.climbRate);
          test('reject nonfinite distance',!m.simulate({...c,distance:NaN}).feasible);
          test('reject nonfinite model',!m.simulate({...c,cd0:NaN},undefined,null).feasible);
          test('reject zero integration step',!m.simulate(c,undefined,t,0).feasible);
          const opt=o.optimize({...c,minMach:.59,maxMach:.60,minAltitude:8000,maxAltitude:8000,maxSteps:1,optimizeClimbs:1});
          test('optimizer finite physics',opt.best.feasible&&opt.search.stepTransitions.startsWith('finite'));
          test('energy checks passed',opt.checks.every(x=>x.pass));
          return {checks,cases,sourceConfig:c,sourcePoints:source.rows.filter(p=>p.phase==='climb').filter((_,i)=>i%8===0),sourceSummary:{burn:source.burn,seconds:source.seconds,climbs:source.climbs,energy:source.energy},optimized:opt.best.profile};
        }""")
        for case in data['cases']:
            burn,seconds=reference_mission(case['config'],case['profile'])
            assert abs(burn-case['result']['burn'])<.01,(burn,case)
            assert abs(seconds-case['result']['seconds'])<.01,(seconds,case)
        source=json.loads((Path(__file__).resolve().parents[1]/'projets/a380-lab/data/project.json').read_text(encoding='utf-8'))
        for point in data['sourcePoints']:
            independent_trim(source,point,data['sourceConfig'])
        (ARTIFACTS/'finite-climb-verification.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
        print('Finite climb checks:',len(data['checks']),'PASS; 6 independent DOP853 missions;',len(data['sourcePoints']),'independent HYBR trims and engine inversions',flush=True)
        print('Source 300 t:',data['sourceSummary'],flush=True)
        browser.close()


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
