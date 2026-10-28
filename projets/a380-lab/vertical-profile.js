// Prescribed C2 altitude path. Forces and fuel required to fly it are solved separately.
// x is horizontal ground distance in metres. No instantaneous height changes.
export function verticalPlan(c,profile,atmosphere){
  const end=c.distance*1000,climbs=[];
  const starts=profile.climbStarts??[c.climbStart1/100,c.climbStart2/100].slice(0,profile.steps);
  if(starts.length!==profile.steps||starts.some((v,i)=>!Number.isFinite(v)||v<=0||v>=1||(i&&v<=starts[i-1])))throw Error('Positions des montées invalides.');
  for(let i=0;i<profile.steps;i++){
    const from=profile.altitude+i*c.stepHeight,to=from+c.stepHeight;
    const vmax=profile.mach*Math.max(atmosphere(from,c.disa).a,atmosphere(to,c.disa).a);
    // max(s')=15/8; gs <= Vmax + wind. Thus hdot never exceeds climbRate.
    const length=1.875*c.stepHeight*(vmax+c.wind)/c.climbRate,start=starts[i]*end,finish=start+length;
    if(length<=0||finish>=end||(i&&start<=climbs[i-1].end))throw Error('Montées trop longues : chevauchement ou palier final absent. Réduisez leur hauteur ou avancez leur départ.');
    climbs.push({start,end:finish,from,to,length,index:i});
  }
  const plan={altitude:profile.altitude,climbs,end};
  const breaks=[0,end,...climbs.flatMap(e=>[e.start,e.end])];
  // Split integration at the ISA lapse-rate discontinuity too.
  for(const e of climbs)if(e.from<11000&&e.to>11000){
    let lo=e.start,hi=e.end;for(let i=0;i<50;i++){const x=(lo+hi)/2;if(verticalAt(plan,x).h<11000)lo=x;else hi=x;}
    breaks.push((lo+hi)/2);
  }
  plan.breaks=breaks.sort((a,b)=>a-b);return plan;
}
export function verticalAt(plan,x){
  let h=plan.altitude;
  for(const e of plan.climbs){
    if(x>=e.end){h=e.to;continue;}
    if(x<e.start)break;
    const u=Math.max(0,Math.min(1,(x-e.start)/e.length)),dh=e.to-e.from;
    return {h:e.from+dh*u*u*u*(10+u*(-15+6*u)),slope:dh/e.length*30*u*u*(1-u)*(1-u),
      curvature:dh/(e.length*e.length)*60*u*(1-u)*(1-2*u),phase:'climb',climbIndex:e.index};
  }
  return {h,slope:0,curvature:0,phase:'cruise',climbIndex:null};
}
export function pathMotion(c,mach,path,atmosphere){
  const a=atmosphere(path.h,c.disa),tas=mach*a.a,s=path.slope;
  const argument=s*c.wind/(tas*Math.sqrt(1+s*s));
  if(Math.abs(argument)>1)throw Error('Vent incompatible avec la pente de montée.');
  const gamma=Math.atan(s)+Math.asin(argument),gs=tas*Math.cos(gamma)+c.wind;
  const vh=(path.temperatureGradient??(path.h<11000?-.0065:0))*tas/(2*a.T);
  const roc=s*gs,accel=vh*roc;
  const gammaDot=gs*(path.curvature*gs-vh*s*(Math.sin(gamma)-s*Math.cos(gamma)))/(tas*(Math.cos(gamma)+s*Math.sin(gamma)));
  const normalAccel=tas*gammaDot,loadFactor=Math.cos(gamma)+normalAccel/9.80665;
  if(Math.abs(gamma)>8*Math.PI/180||loadFactor<.8||loadFactor>1.2)throw Error('Transition hors limites d’étude : pente ±8°, facteur de charge 0,8–1,2.');
  return {...path,gamma,gammaDot,gs,roc,accel,normalAccel,loadFactor};
}
