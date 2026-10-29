import {projectFlight,validateProject} from './project-model.js?v=1.4.0';
import {verticalPlan,verticalAt,pathMotion} from './vertical-profile.js?v=1.4.0';
import {AIRPORT_DEFAULTS,AIRPORT_LIMITS,validateAirportConfig} from './airport-config.js?v=1.4.0';
import {simulateFullMission} from './mission.js?v=1.4.0';
// SI throughout: m, s, kg, N, K. No aircraft operational data are implied.
export const VERSION = '1.4.0';
export const G = 9.80665, R = 287.05287, GAMMA = 1.4;
export const DEFAULT = Object.freeze({
  distance:4569, mass:500000, fuel:120000, reserve:15000, wind:0, disa:0,
  mach:.75, altitude:10668, steps:0, stepHeight:600,
  minMach:.60, maxMach:.89, minAltitude:9000, maxAltitude:12500,
  ceiling:13100, maxSteps:2, maxMinutes:0, clMax:1.0, thrustLimit:.95,
  ci:160, objective:'fuel', area:859, cd0:.016, k:.042,
  waveMach:.78, waveK:20, tsfc:15.5, thrustSL:352900,cgOffset:0,n1Min:50,n1Max:110,
  climbRate:2.54,climbStart1:35,climbStart2:70,optimizeClimbs:1,
  ...AIRPORT_DEFAULTS,
});
export const LIMITS = {
  distance:[100,15000], mass:[300000,575000], fuel:[1000,250000], reserve:[0,100000],
  wind:[-80,80], disa:[-30,30], mach:[.5,.89], altitude:[8000,13100], steps:[0,2],
  stepHeight:[100,1500], minMach:[.5,.89], maxMach:[.5,.89],
  minAltitude:[8000,13100], maxAltitude:[8000,13100], ceiling:[8000,13100],
  maxSteps:[0,2], maxMinutes:[0,1500], clMax:[.3,1.5], thrustLimit:[.5,1], ci:[0,1000],
  area:[700,950], cd0:[.008,.04], k:[.02,.09], waveMach:[.65,.87],
  waveK:[0,100], tsfc:[8,30], thrustSL:[250000,450000],cgOffset:[-3,3],n1Min:[40,80],n1Max:[90,110],
  climbRate:[.5,10],climbStart1:[5,90],climbStart2:[10,95],optimizeClimbs:[0,1],
  ...AIRPORT_LIMITS,
};
export function upgradeConfig(c){
  const out={...c};for(const k of ['climbRate','climbStart1','climbStart2','optimizeClimbs',...Object.keys(AIRPORT_DEFAULTS)])if(!Object.hasOwn(out,k))out[k]=DEFAULT[k];return out;
}
export function validateConfig(c, tables=null) {
  c=upgradeConfig(c);
  validateAirportConfig(c);
  for (const [key,[lo,hi]] of Object.entries(LIMITS)) {
    if(!c.missionMode&&Object.hasOwn(AIRPORT_LIMITS,key))continue;
    if (!Number.isFinite(c[key]) || c[key]<lo || c[key]>hi) throw Error(`${key} : valeur attendue entre ${lo} et ${hi}.`);
  }
  for (const k of ['steps','maxSteps','optimizeClimbs']) if (!Number.isInteger(c[k])) throw Error('Nombre de paliers et choix d’optimisation entiers requis.');
  if(c.steps===2&&c.climbStart2<=c.climbStart1)throw Error('La seconde montée doit commencer après la première.');
  if (!['fuel','time','econ'].includes(c.objective)) throw Error('Objectif inconnu.');
  if(c.fuel>=c.mass || c.reserve>=c.fuel) throw Error('Carburant < masse initiale et réserve < carburant requis.');
  if(c.minMach>=c.maxMach || c.minAltitude>c.maxAltitude || c.maxAltitude>c.ceiling) throw Error('Bornes de recherche incohérentes.');
  if(c.altitude+c.steps*c.stepHeight>c.ceiling) throw Error('Le profil de référence dépasse le plafond de l’étude.');
  if(tables && tables.schema!=='a380-project/v1' && c.disa!==0) throw Error('Les tables importées sont définies en ISA : régler ΔISA à 0 K.');
  if(tables && Math.abs(c.area-tables.area)>1e-6) throw Error('La surface doit correspondre à la référence des tables importées.');
  return c;
}
export function atmosphere(h, disa=0) {
  if(!Number.isFinite(h)||h<0||h>20000||!Number.isFinite(disa)||disa< -30||disa>30) throw Error('Atmosphère hors domaine.');
  const t11=216.65, p11=101325*Math.pow(t11/288.15,G/(R*.0065));
  const standardT=h<=11000?288.15-.0065*h:t11;
  const p=h<=11000?101325*Math.pow(standardT/288.15,G/(R*.0065)):p11*Math.exp(-G*(h-11000)/(R*t11));
  const T=standardT+disa;
  return {T,p,rho:p/(R*T),a:Math.sqrt(GAMMA*R*T),theta:T/288.15,delta:p/101325};
}
function bracket(axis,x) {
  const eps=1e-9;
  if(x<axis[0]-eps || x>axis.at(-1)+eps || !Number.isFinite(x)) throw Error('Hors domaine des tables importées.');
  let i=0; while(i<axis.length-2 && axis[i+1]<x) i++;
  return [i,Math.max(0,Math.min(1,(x-axis[i])/(axis[i+1]-axis[i])))];
}
export function interpolate(xs,ys,values,x,y) {
  const [i,u]=bracket(xs,x),[j,v]=bracket(ys,y);
  return (1-u)*((1-v)*values[i][j]+v*values[i][j+1])+u*((1-v)*values[i+1][j]+v*values[i+1][j+1]);
}
export function validateTables(t) {
  if(t?.schema==='a380-project/v1')return validateProject(t);
  if(!t || t.schema!=='a380-cruise-tables/v1') throw Error('Schéma attendu : a380-cruise-tables/v1.');
  if(typeof t.name!=='string'||!t.name.trim()||t.name.length>160||typeof t.source!=='string'||!t.source.trim()||t.source.length>2000) throw Error('Nom et provenance des tables requis.');
  if(!Number.isFinite(t.area)||t.area<700||t.area>950) throw Error('Surface de référence invalide.');
  const axis=(a,name,lo,hi)=>{
    if(!Array.isArray(a)||a.length<2||a.length>100||a.some((v,i)=>!Number.isFinite(v)||v<lo||v>hi||(i&&v<=a[i-1]))) throw Error(`Axe ${name} invalide : valeurs strictement croissantes requises.`);
  };
  axis(t.mach,'Mach',.5,.89); axis(t.cl,'CL',.05,1.5); axis(t.altitude,'altitude',8000,13100);
  const matrix=(a,n,m,name,lo,hi)=>{
    if(!Array.isArray(a)||a.length!==n||a.some(row=>!Array.isArray(row)||row.length!==m||row.some(v=>!Number.isFinite(v)||v<lo||v>hi))) throw Error(`Matrice ${name} invalide (${n} × ${m}).`);
  };
  matrix(t.cd,t.mach.length,t.cl.length,'CD',.001,.3);
  matrix(t.tsfc,t.mach.length,t.altitude.length,'TSFC',.000001,.0001);
  matrix(t.maxThrust,t.mach.length,t.altitude.length,'poussée totale',10000,2000000);
  return t;
}
export function flightPoint(c,mass,h,mach,tables=null,motion={}) {
  if(tables?.schema==='a380-project/v1')return {...projectFlight(c,mass,h,mach,tables,atmosphere,interpolate,motion),...motion};
  const a=atmosphere(h,c.disa), tas=mach*a.a, gs=motion.gs??tas+c.wind,gamma=motion.gamma||0;
  const q=.5*a.rho*tas*tas, cl=mass*(G*Math.cos(gamma)+(motion.normalAccel||0))/(q*c.area);
  let cd,tsfc,available;
  if(tables) {
    cd=interpolate(tables.mach,tables.cl,tables.cd,mach,cl);
    tsfc=interpolate(tables.mach,tables.altitude,tables.tsfc,mach,h);
    available=interpolate(tables.mach,tables.altitude,tables.maxThrust,mach,h);
  } else {
    cd=c.cd0+c.k*cl*cl+c.waveK*Math.pow(Math.max(0,mach-c.waveMach),4);
    tsfc=c.tsfc*1e-6*Math.sqrt(a.T/216.65)*(1+.6*(mach-.75)+2*Math.pow(mach-.75,2));
    available=4*c.thrustSL*Math.pow(a.delta,.7)*(1-.25*mach);
  }
  const drag=q*c.area*cd,thrust=drag+mass*(G*Math.sin(gamma)+(motion.accel||0)), flow=thrust*tsfc;
  const reasons=[];
  if(gs<=30) reasons.push('Vitesse sol ≤ 30 m/s');
  if(cl>c.clMax) reasons.push('Limite de CL dépassée');
  if(thrust>available*c.thrustLimit) reasons.push('Marge de poussée insuffisante');
  if(h>c.ceiling) reasons.push('Plafond de l’étude dépassé');
  if(thrust<=0||flow<=0)reasons.push('Poussée ou débit non positif dans le domaine de vol.');
  return {h,mach,mass,...a,tas,gs,q,cl,cd,drag,axialThrust:thrust,thrust,available,tsfc,flow,...motion,
    sr:gs/flow/1000, thrustMargin:1-thrust/available, clMargin:c.clMax-cl,
    feasible:!reasons.length,reasons};
}
export function score(result,c) {
  return c.objective==='time'?result.seconds:c.objective==='econ'?result.burn+c.ci*result.seconds/60:result.burn;
}
// RK4 for mass AND time on horizontal ground distance. C2 finite climbs are flown
// using tangential/normal force balance; every RK stage is checked.
export function simulate(c,profile={mach:c.mach,altitude:c.altitude,steps:c.steps},tables=null,dxKm=10,trace=true) {
  if(!Number.isFinite(dxKm)||dxKm<=0)return {feasible:false,reasons:['Pas d’intégration strictement positif requis.'],profile};
  c=upgradeConfig(c);
  if(c.missionMode)return simulateFullMission(c,profile,tables,dxKm,trace,{atmosphere,simulateCruise:simulate,score});
  if(![c.distance,c.mass,c.fuel,c.reserve,c.wind,c.disa,c.stepHeight,c.climbRate,profile.altitude,profile.mach].every(Number.isFinite)||c.distance<=0||c.mass<=0||c.climbRate<=0)
    return {feasible:false,reasons:['Paramètres de mission non finis ou non physiques.'],profile};
  let mass=c.mass, seconds=0,x=0, minThrustMargin=1,minClMargin=Infinity;
  let maxCL=0,maxThrust=0;
  const emissions={co:0,nox:0,hc:0};
  const rows=[], reasons=new Set();
  const minClimbIntervals=Math.max(32,Math.ceil(160/dxKm));
  const end=c.distance*1000,dry=c.mass-c.fuel;
  let plan,climbs,temperatureGradient,maxRoc=0,maxEnergyResidual=0,workJ=0,potentialJ=0,kineticJ=0;
  const state=(m,position)=>{
    const path={...verticalAt(plan,position),temperatureGradient},motion=pathMotion(c,profile.mach,path,atmosphere);
    const p=flightPoint(c,m,path.h,profile.mach,tables,motion);
    if(['h','tas','gs','q','cl','cd','thrust','available','flow','roc','gamma'].some(k=>!Number.isFinite(p[k])))throw Error('État de vol non fini : vérifier les données du modèle.');
    p.positionKm=position/1000;
    for(const r of p.reasons) reasons.add(r);
    if(m<=0) reasons.add('Masse non physique');
    minThrustMargin=Math.min(minThrustMargin,p.thrustMargin); minClMargin=Math.min(minClMargin,p.clMargin);
    maxCL=Math.max(maxCL,p.cl);maxThrust=Math.max(maxThrust,p.thrust);
    maxRoc=Math.max(maxRoc,p.roc);
    p.energyResidualW=(p.axialThrust-p.drag)*p.tas-m*(G*p.roc+p.tas*p.accel);
    maxEnergyResidual=Math.max(maxEnergyResidual,Math.abs(p.energyResidualW)/(m*G*p.tas));
    return p;
  };
  try {
    if(!Number.isInteger(profile.steps)||profile.steps<0||profile.steps>2)throw Error('Nombre de montées invalide.');
    plan=verticalPlan(c,profile,atmosphere);climbs=plan.climbs.map(e=>({...e}));
    const push=p=>{if(trace)rows.push({x:x/1000,seconds,burn:c.mass-mass,...p});};
    push(state(mass,0));
    for(let segment=1;segment<plan.breaks.length;segment++) {
      const boundary=plan.breaks[segment],mid=(x+boundary)/2;
      temperatureGradient=verticalAt(plan,mid).h<11000?-.0065:0;
      const climb=climbs.find(e=>mid>=e.start&&mid<e.end);
      if(climb&&x===climb.start){climb.startSeconds=seconds;climb.startMass=mass;}
      while(x<boundary-1e-6) {
        // Resolve every climb with >= 32 intervals, even in the coarse optimizer.
        const dx=Math.min(dxKm*1000,boundary-x,climb?climb.length/minClimbIntervals:Infinity),p1=state(mass,x);
        if(!p1.feasible) return {feasible:false,reasons:[...reasons],profile,lastPoint:p1};
        const k1=-p1.flow/p1.gs,p2=state(mass+dx*k1/2,x+dx/2),k2=-p2.flow/p2.gs;
        const p3=state(mass+dx*k2/2,x+dx/2),k3=-p3.flow/p3.gs;
        const p4=state(mass+dx*k3,x+dx),k4=-p4.flow/p4.gs;
        if(reasons.size)return {feasible:false,reasons:[...reasons],profile,lastPoint:[p1,p2,p3,p4].find(p=>!p.feasible)};
        const stages=[p1,p2,p3,p4],integral=fn=>dx/6*stages.reduce((s,p,i)=>s+[1,2,2,1][i]*fn(p),0);
        for(const key of Object.keys(emissions)){
          if(emissions[key]===null||stages.some(p=>p.ei?.[key]==null))emissions[key]=null;
          else emissions[key]+=integral(p=>p.ei[key]*p.flow/p.gs);
        }
        workJ+=integral(p=>(p.axialThrust-p.drag)*p.tas/p.gs);
        potentialJ+=integral(p=>p.mass*G*p.roc/p.gs);kineticJ+=integral(p=>p.mass*p.tas*p.accel/p.gs);
        mass+=dx*(k1+2*k2+2*k3+k4)/6; seconds+=integral(p=>1/p.gs); x=Math.min(boundary,x+dx);
        if(mass<dry+c.reserve-1e-6) return {feasible:false,reasons:['Réserve carburant entamée'],profile};
        const last=state(mass,x);if(!last.feasible)return {feasible:false,reasons:[...reasons],profile,lastPoint:last};push(last);
      }
      if(climb&&Math.abs(x-climb.end)<1e-5){climb.endSeconds=seconds;climb.duration=seconds-climb.startSeconds;climb.burn=climb.startMass-mass;climb.endMass=mass;}
    }
    if(c.maxMinutes && seconds/60>c.maxMinutes+1e-9) reasons.add('Durée maximale dépassée');
    const burn=c.mass-mass;
    const result={feasible:!reasons.size,reasons:[...reasons],profile,burn,seconds,finalMass:mass,
      remainingFuel:mass-dry,reserveMargin:mass-dry-c.reserve,co2:3.16*burn,
      minThrustMargin,minClMargin,maxCL,maxThrust,rows,emissions,climbs,vertical:plan,maxRoc,
      energy:{workJ,potentialJ,kineticJ,residualJ:workJ-potentialJ-kineticJ,maxNormalizedResidual:maxEnergyResidual},
      integration:{method:'RK4/mass-time-energy',stepKm:dxKm,minClimbIntervals}};
    result.score=score(result,c);
    return result;
  } catch(e) { return {feasible:false,reasons:[e.message],profile}; }
}
export function speedStudy(c,tables=null) {
  const points=[];
  const machs=[];
  for(let m=c.minMach;m<c.maxMach-1e-10;m+=.001)machs.push(m);
  machs.push(c.maxMach);
  for(const mach of machs) {
    try { const p=flightPoint(c,c.mass,c.altitude,mach,tables); if(p.feasible) points.push(p); } catch { /* Domain holes stay holes. */ }
  }
  if(!points.length) return {points:[],mrc:null,lrc:null,econ:null};
  const mrc=points.reduce((a,b)=>b.sr>a.sr?b:a),target=.99*mrc.sr;
  // High-speed root by bisection. If not reachable, report unavailable.
  let lrc=null;
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i];
    if(a.mach>=mrc.mach && b.mach-a.mach<.00101 && a.sr>=target && b.sr<=target) {
      let lo=a.mach,hi=b.mach;
      for(let n=0;n<30;n++) {const m=(lo+hi)/2,p=flightPoint(c,c.mass,c.altitude,m,tables); if(p.sr>target) lo=m;else hi=m;}
      lrc=flightPoint(c,c.mass,c.altitude,(lo+hi)/2,tables);break;
    }
  }
  const econ=points.reduce((a,b)=>(b.flow+c.ci/60)/b.gs<(a.flow+c.ci/60)/a.gs?b:a);
  return {points,mrc,lrc,econ};
}
export function selfCheck() {
  const a=atmosphere(11000),p=flightPoint(DEFAULT,500000,10668,.75);
  return [
    {name:'ISA : ρ au niveau de la mer',pass:Math.abs(atmosphere(0).rho-1.225)<.0001},
    {name:'ISA : pression à 11 km ≈ 22 632 Pa',pass:Math.abs(a.p-22632.04)<.1},
    {name:'Équilibre réduit : L = mg, T = D',pass:Math.abs(p.q*DEFAULT.area*p.cl-500000*G)<1e-6},
    {name:'Conversion : kg/s → kg/h',pass:Math.abs(p.flow*3600/p.thrust-p.tsfc*3600)<1e-12},
    {name:'Interpolation bilinéaire : champ affine',pass:Math.abs(interpolate([0,1],[0,1],[[0,2],[3,5]],.3,.4)-1.7)<1e-12},
  ];
}
