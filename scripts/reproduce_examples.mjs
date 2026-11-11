// Recompute examples exclusively from the numerical code and public data in this repository.
// node scripts/reproduce_examples.mjs [--write]
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {optimize} from '../projets/a380-lab/optimizer.js';
import {simulate,validateTables} from '../projets/a380-lab/model.js';
import {scenarioConfig} from '../projets/a380-lab/scenarios.js';
import {Simulation,DT} from '../projets/drone-lab/core.js';
import {DEMO_CONFIG,demoState,beforeDemoStep,afterDemoStep,demoSummary} from '../projets/drone-lab/demo.js';

const root=new URL('../',import.meta.url);
const inputs=['model.js','project-model.js','mission.js','optimizer.js','scenarios.js','airport-config.js','trajectory.js','vertical-profile.js','data/project.json'];
const hashes={};for(const path of inputs)hashes[path]=createHash('sha256').update((await readFile(new URL('projets/a380-lab/'+path,root),'utf8')).replaceAll('\r\n','\n')).digest('hex');
const tables=validateTables(JSON.parse(await readFile(new URL('projets/a380-lab/data/project.json',root),'utf8')));
const config=scenarioConfig('verification',tables.area),r=optimize(config,tables);
const slim=m=>({profile:m.profile,burnKg:m.burn,seconds:m.seconds,finalMassKg:m.finalMass,remainingFuelKg:m.remainingFuel,minThrustMargin:m.minThrustMargin});
if(!r.baseline.feasible||!r.best?.feasible)throw Error('Reference must be feasible');
const report=simulate(scenarioConfig('report',tables.area),undefined,tables,5,false);
if(report.feasible)throw Error('500 t must not be made feasible artificially');
const example={schema:'a380-public-example/v1',scenario:'verification',scope:'cruise-only / reconstructed academic model / not flight validated',reproduce:'node scripts/reproduce_examples.mjs --write',sourceSha256:hashes,config,reference:slim(r.baseline),bestExplored:slim(r.best),gainPercent:100*(1-r.best.burn/r.baseline.burn),count:r.count,feasibleCount:r.feasibleCount,rejected500t:report.reasons};
const dest=new URL('projets/a380-lab/data/reference-example.json',root);
if(process.argv.includes('--write')){await writeFile(dest,JSON.stringify(example,null,2)+'\n');}
else{
  const saved=JSON.parse(await readFile(dest,'utf8'));
  function equivalent(a,b){if(typeof a==='number'&&typeof b==='number')return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a));if(a&&b&&typeof a==='object'&&typeof b==='object')return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equivalent(a[k],b[k]));return a===b;}
  if(!equivalent(saved,example))throw Error('Versioned example differs. Inspect numerical inputs before regenerating.');
}
console.log('A380',JSON.stringify(example));
const sim=new Simulation(DEMO_CONFIG),state=demoState();sim.start();
while(!state.done){beforeDemoStep(sim,state);sim.step(DT);afterDemoStep(sim,state);}
console.log('DroneLab',JSON.stringify(demoSummary(sim,state)));
console.log('PASS: versioned A380 example, 500 t rejection and deterministic guided simulation');
