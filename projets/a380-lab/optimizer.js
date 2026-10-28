import {simulate,speedStudy,score,selfCheck,validateConfig} from './model.js';
const axis=(lo,hi,step)=>{const a=[];for(let x=lo;x<hi-1e-8;x+=step)a.push(+x.toFixed(6));a.push(hi);return a;};
function paretoOf(list) {
  const sorted=list.filter(r=>r.feasible).sort((a,b)=>a.seconds-b.seconds||a.burn-b.burn);
  let best=Infinity;return sorted.filter(r=>{if(r.burn<best-1e-5){best=r.burn;return true;}return false;});
}
const slim=r=>{const {rows,...rest}=r;return rest;};
export function optimize(c,tables=null,onProgress=()=>{}) {
  validateConfig(c,tables);
  const machs=axis(c.minMach,c.maxMach,.01),heights=axis(c.minAltitude,c.maxAltitude,250);
  const results=[],heat=[],failures={}, baseline=simulate(c,undefined,tables,5);
  const candidates=[];
  for(let n=0;n<=c.maxSteps;n++)for(const h of heights)if(h+n*c.stepHeight<=c.ceiling)for(const m of machs)candidates.push({mach:m,altitude:h,steps:n});
  // Keep any feasible reference profile in the candidate set: never report a worse recommendation.
  if(c.mach>=c.minMach&&c.mach<=c.maxMach&&c.altitude>=c.minAltitude&&c.altitude<=c.maxAltitude&&c.steps<=c.maxSteps)candidates.push({mach:c.mach,altitude:c.altitude,steps:c.steps});
  candidates.forEach((profile,i)=>{
    const r=simulate(c,profile,tables,40,false);
    if(r.feasible) results.push(r);else for(const reason of r.reasons)failures[reason]=(failures[reason]||0)+1;
    if(!profile.steps&&heights.includes(profile.altitude)&&machs.includes(profile.mach)) heat.push({mach:profile.mach,altitude:profile.altitude,burn:r.burn??null,reasons:r.reasons});
    if(i%100===0) onProgress({phase:'Exploration du domaine',value:Math.round(i/candidates.length*70)});
  });
  if(!results.length) return {baseline,best:null,heat,failures,count:candidates.length,feasibleCount:0,speeds:speedStudy(c,tables),checks:selfCheck(),pareto:[]};
  results.sort((a,b)=>score(a,c)-score(b,c));
  const refined=[];
  // Refine around the best coarse result for EACH number of steps.
  for(let n=0;n<=c.maxSteps;n++) {
    const center=results.find(r=>r.profile.steps===n);if(!center) continue;
    for(const h of axis(Math.max(c.minAltitude,center.profile.altitude-250),Math.min(c.maxAltitude,c.ceiling-n*c.stepHeight,center.profile.altitude+250),50))
      for(const m of axis(Math.max(c.minMach,center.profile.mach-.01),Math.min(c.maxMach,center.profile.mach+.01),.001)) {
        const r=simulate(c,{mach:m,altitude:h,steps:n},tables,10,false);if(r.feasible)refined.push(r);
      }
    onProgress({phase:'Affinement et vérification',value:75+n*5});
  }
  const all=results.concat(refined).sort((a,b)=>score(a,c)-score(b,c));
  let best=null;
  // Final ranking uses a single integration step, including the baseline.
  const verified=[];
  for(const r of all.slice(0,30)) {
    const v=simulate(c,r.profile,tables,5,true);if(v.feasible) verified.push(v);
  }
  if(baseline.feasible&&c.mach>=c.minMach&&c.mach<=c.maxMach&&c.altitude>=c.minAltitude&&c.altitude<=c.maxAltitude&&c.steps<=c.maxSteps)verified.push(baseline);
  verified.sort((a,b)=>score(a,c)-score(b,c));best=verified[0]||null;
  const frontier=paretoOf(results), selected=frontier.filter((_,i)=>i===0||i===frontier.length-1||i%Math.max(1,Math.floor(frontier.length/32))===0);
  const pareto=paretoOf(selected.map(r=>simulate(c,r.profile,tables,5,false))).map(slim);
  const convergence=best?simulate(c,best.profile,tables,2.5,false):null;
  const sensitivity=[];
  if(best&&!tables)for(const [key,label] of [['cd0','Traînée parasite'],['k','Traînée induite'],['tsfc','Consommation spécifique']]) {
    const low=simulate({...c,[key]:c[key]*.9},best.profile,null,10,false),high=simulate({...c,[key]:c[key]*1.1},best.profile,null,10,false);
    sensitivity.push({key,label,low:low.feasible?low.burn:null,high:high.feasible?high.burn:null});
  }
  onProgress({phase:'Analyse terminée',value:100});
  const checks=selfCheck();
  if(tables?.schema==='a380-project/v1'&&best){
    checks.push({name:'Projet : résidus force / moment < 10⁻⁸ sur la trajectoire',pass:best.rows.every(p=>Math.abs(p.trimForceResidual)<1e-8&&Math.abs(p.trimMomentResidual)<1e-8)});
    checks.push({name:'Projet : régime corrigé dans le domaine retenu',pass:best.rows.every(p=>p.n1c>=c.n1Min&&p.n1c<=c.n1Max&&Math.abs(p.n1-p.n1c*Math.sqrt(p.theta))<1e-8)});
  }
  return {baseline,best,heat,failures,count:candidates.length+refined.length,feasibleCount:results.length+refined.length,
    speeds:speedStudy(c,tables),checks,pareto,sensitivity,
    convergence:convergence?.feasible?{coarseKm:5,fineKm:2.5,deltaKg:Math.abs(best.burn-convergence.burn),relative:Math.abs(best.burn-convergence.burn)/convergence.burn}:null,
    search:{coarseMach:.01,coarseAltitude:250,fineMach:.001,fineAltitude:50,integrator:'RK4',finalStepKm:5,stepTransitions:'instantaneous/equal-distance',globalGuarantee:false}};
}
