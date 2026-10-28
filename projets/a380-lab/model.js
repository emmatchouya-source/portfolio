import {projectFlight,validateProject} from './project-model.js';
// SI throughout: m, s, kg, N, K. No aircraft operational data are implied.
export const VERSION = '1.1.2';
export const G = 9.80665, R = 287.05287, GAMMA = 1.4;
export const DEFAULT = Object.freeze({
  distance:4569, mass:500000, fuel:120000, reserve:15000, wind:0, disa:0,
  mach:.75, altitude:10668, steps:0, stepHeight:600,
  minMach:.60, maxMach:.89, minAltitude:9000, maxAltitude:12500,
  ceiling:13100, maxSteps:2, maxMinutes:0, clMax:1.0, thrustLimit:.95,
  ci:160, objective:'fuel', area:859, cd0:.016, k:.042,
  waveMach:.78, waveK:20, tsfc:15.5, thrustSL:352900,cgOffset:0,n1Min:50,n1Max:110,
});
export const LIMITS = {
  distance:[100,15000], mass:[300000,575000], fuel:[1000,250000], reserve:[0,100000],
  wind:[-80,80], disa:[-30,30], mach:[.5,.89], altitude:[8000,13100], steps:[0,2],
  stepHeight:[100,1500], minMach:[.5,.89], maxMach:[.5,.89],
  minAltitude:[8000,13100], maxAltitude:[8000,13100], ceiling:[8000,13100],
  maxSteps:[0,2], maxMinutes:[0,1500], clMax:[.3,1.5], thrustLimit:[.5,1], ci:[0,1000],
  area:[700,950], cd0:[.008,.04], k:[.02,.09], waveMach:[.65,.87],
  waveK:[0,100], tsfc:[8,30], thrustSL:[250000,450000],cgOffset:[-3,3],n1Min:[40,80],n1Max:[90,110],
};
export function validateConfig(c, tables=null) {
  for (const [key,[lo,hi]] of Object.entries(LIMITS)) {
    if (!Number.isFinite(c[key]) || c[key]<lo || c[key]>hi) throw Error(`${key} : valeur attendue entre ${lo} et ${hi}.`);
  }
  for (const k of ['steps','maxSteps']) if (!Number.isInteger(c[k])) throw Error('Nombre de paliers entier requis.');
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
export function flightPoint(c,mass,h,mach,tables=null) {
  if(tables?.schema==='a380-project/v1')return projectFlight(c,mass,h,mach,tables,atmosphere,interpolate);
  const a=atmosphere(h,c.disa), tas=mach*a.a, gs=tas+c.wind;
  const q=.5*a.rho*tas*tas, cl=mass*G/(q*c.area);
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
  const thrust=q*c.area*cd, flow=thrust*tsfc;
  const reasons=[];
  if(gs<=30) reasons.push('Vitesse sol ≤ 30 m/s');
  if(cl>c.clMax) reasons.push('Limite de CL dépassée');
  if(thrust>available*c.thrustLimit) reasons.push('Marge de poussée insuffisante');
  if(h>c.ceiling) reasons.push('Plafond de l’étude dépassé');
  return {h,mach,mass,...a,tas,gs,q,cl,cd,thrust,available,tsfc,flow,
    sr:gs/flow/1000, thrustMargin:1-thrust/available, clMargin:c.clMax-cl,
    feasible:!reasons.length,reasons};
}
export function score(result,c) {
  return c.objective==='time'?result.seconds:c.objective==='econ'?result.burn+c.ci*result.seconds/60:result.burn;
}
// RK4 on dm/dx=-WF/VGS. Steps are instant, at equal ground-distance fractions.
// Every RK stage is checked. These are sampled constraints, not a continuous proof.
export function simulate(c,profile={mach:c.mach,altitude:c.altitude,steps:c.steps},tables=null,dxKm=10,trace=true) {
  let mass=c.mass, seconds=0,x=0, minThrustMargin=1,minClMargin=Infinity;
  let maxCL=0,maxThrust=0;
  const emissions={co:0,nox:0,hc:0};
  const rows=[], reasons=new Set();
  const end=c.distance*1000, chunk=end/(profile.steps+1), dry=c.mass-c.fuel;
  const state=(m,h)=>{
    const p=flightPoint(c,m,h,profile.mach,tables);
    for(const r of p.reasons) reasons.add(r);
    if(m<=0) reasons.add('Masse non physique');
    minThrustMargin=Math.min(minThrustMargin,p.thrustMargin); minClMargin=Math.min(minClMargin,p.clMargin);
    maxCL=Math.max(maxCL,p.cl);maxThrust=Math.max(maxThrust,p.thrust);
    return p;
  };
  try {
    for(let leg=0;leg<=profile.steps;leg++) {
      const h=profile.altitude+leg*c.stepHeight, boundary=leg===profile.steps?end:(leg+1)*chunk;
      const first=state(mass,h);
      if(trace) rows.push({x:x/1000,seconds,burn:c.mass-mass,...first});
      while(x<boundary-1e-6) {
        const dx=Math.min(dxKm*1000,boundary-x),p1=state(mass,h);
        if(!p1.feasible) return {feasible:false,reasons:[...reasons],profile,lastPoint:p1};
        const k1=-p1.flow/p1.gs,p2=state(mass+dx*k1/2,h),k2=-p2.flow/p2.gs;
        const p3=state(mass+dx*k2/2,h),k3=-p3.flow/p3.gs;
        const p4=state(mass+dx*k3,h),k4=-p4.flow/p4.gs;
        for(const key of Object.keys(emissions)){
          const stages=[p1,p2,p3,p4];
          if(emissions[key]===null||stages.some(p=>p.ei?.[key]==null))emissions[key]=null;
          else emissions[key]+=dx/6*stages.reduce((s,p,i)=>s+[1,2,2,1][i]*p.ei[key]*p.flow/p.gs,0);
        }
        mass+=dx*(k1+2*k2+2*k3+k4)/6; seconds+=dx/p1.gs; x+=dx;
        if(reasons.size) return {feasible:false,reasons:[...reasons],profile};
        if(mass<dry+c.reserve-1e-6) return {feasible:false,reasons:['Réserve carburant entamée'],profile};
        const last=state(mass,h);
        if(trace) rows.push({x:x/1000,seconds,burn:c.mass-mass,...last});
      }
    }
    if(c.maxMinutes && seconds/60>c.maxMinutes+1e-9) reasons.add('Durée maximale dépassée');
    const burn=c.mass-mass;
    const result={feasible:!reasons.size,reasons:[...reasons],profile,burn,seconds,finalMass:mass,
      remainingFuel:mass-dry,reserveMargin:mass-dry-c.reserve,co2:3.16*burn,
      minThrustMargin,minClMargin,maxCL,maxThrust,rows,emissions};
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
