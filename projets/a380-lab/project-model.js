// Project-data model. X aft, Z up; positive pitching moment is nose-up.
// Geometry references come from the source .history files, not a guessed 25% MAC.
const RAD=Math.PI/180,G=9.80665;
export function validateProject(t){
  if(t.schema!=='a380-project/v1'||typeof t.name!=='string'||t.name.length>160||typeof t.source!=='string'||t.source.length>2000)throw Error('Métadonnées du projet invalides.');
  for(const key of ['wb','ht']){
    const s=t.surfaces?.[key];if(!s)throw Error('Surface OpenVSP absente.');
    for(const k of ['alpha','mach'])if(!Array.isArray(s[k])||s[k].length<2||s[k].length>100||s[k].some((v,i)=>!Number.isFinite(v)||(i&&v<=s[k][i-1])))throw Error('Axe OpenVSP invalide.');
    if(s.alpha[0]<-30||s.alpha.at(-1)>30||s.mach[0]<0||s.mach.at(-1)>1)throw Error('Domaine OpenVSP invalide.');
    for(const k of ['cl','cd',...(key==='wb'?['cm']:[])])if(!Array.isArray(s[k])||s[k].length!==s.alpha.length||s[k].some(row=>!Array.isArray(row)||row.length!==s.mach.length||row.some(v=>!Number.isFinite(v)||Math.abs(v)>10)))throw Error('Matrice OpenVSP invalide.');
    for(const k of ['Sref','Cref','Xcg','Zcg'])if(!Number.isFinite(s[k])||Math.abs(s[k])>1000)throw Error('Géométrie OpenVSP invalide.');
    if(s.Sref<=0||s.Cref<=0)throw Error('Surface ou corde non positive.');
  }
  if(t.area!==t.surfaces.wb.Sref||t.area<700||t.area>950)throw Error('Surface du projet incohérente.');
  for(const name of ['thrustPolynomial','flowPolynomial']){
    const allowed=['00','01','02','03','10','11','12','13','20','21','22','23','30','31','32','40','41','50'];
    const p=t.engine?.[name];if(!p||Object.keys(p).length!==18||Object.entries(p).some(([k,v])=>!allowed.includes(k)||!Number.isFinite(v)||Math.abs(v)>10))throw Error('Polynôme moteur invalide.');
  }
  for(const [key,lo,hi] of [['thrustRefN',250000,450000],['flowRefKgS',1,5],['flowMultiplier',1,2]])if(!Number.isFinite(t.engine[key])||t.engine[key]<lo||t.engine[key]>hi)throw Error('Référence moteur invalide.');
  if(t.engine.pressureExponent!==1||t.engine.temperatureExponent!==.5)throw Error('La correction de ce modèle doit utiliser x = 1 et y = 0,5.');
  const e=t.emissions;
  if(e){
    if(e.uid!=='18RR082')throw Error('UID moteur non pris en charge pour les émissions du projet.');
    for(const key of ['flowKgS','coGKg','noxGKg','hcGKg'])if(!Array.isArray(e[key])||e[key].length!==4||e[key].some(v=>!Number.isFinite(v)||v<0))throw Error('Table d’émissions invalide.');
    if(e.flowKgS.some((v,i)=>v<=0||(i&&v<=e.flowKgS[i-1])))throw Error('Débits d’émissions non croissants.');
  }
  return t;
}
export function polynomial(coefficients,x,y){let value=0;for(const [key,p] of Object.entries(coefficients))value+=p*x**Number(key[0])*y**Number(key[1]);return value;}
const engineCache=new WeakMap();
function engineCurve(t,mach){
  if(!engineCache.has(t))engineCache.set(t,new Map());const cache=engineCache.get(t);
  if(cache.has(mach))return cache.get(mach);
  const series=poly=>Array.from({length:6},(_,i)=>Object.entries(poly).filter(([k])=>Number(k[0])===i).reduce((s,[k,v])=>s+v*mach**Number(k[1]),0));
  const value={fn:series(t.engine.thrustPolynomial),wf:series(t.engine.flowPolynomial)};cache.set(mach,value);return value;
}
const horner=(p,x)=>p.reduceRight((v,c)=>v*x+c,0);
export function projectTrim(c,mass,mach,q,t,interpolate,motion={}){
  const wb=t.surfaces.wb,ht=t.surfaces.ht,weight=mass*G,phi=2*RAD;
  const gamma=motion.gamma||0,axial=mass*(G*Math.sin(gamma)+(motion.accel||0));
  const normal=mass*(G*Math.cos(gamma)+(motion.normalAccel||0));
  const coefficients=(s,k,a)=>interpolate(s.alpha,s.mach,s[k],a,mach);
  const evaluate=(alpha,stab)=>{
    if(alpha<wb.alpha[0]||alpha>wb.alpha.at(-1)||Math.abs(stab)>15)throw Error('Équilibrage hors domaine α / stabilisateur.');
    const ar=alpha*RAD,eps=(1.18+.37*alpha)*RAD,ah=alpha-eps/RAD+stab;
    const clw=coefficients(wb,'cl',alpha),cdw=coefficients(wb,'cd',alpha),cmw=coefficients(wb,'cm',alpha);
    const clh=coefficients(ht,'cl',ah),cdh=coefficients(ht,'cd',ah);
    const clhr=clh*Math.cos(eps)-cdh*Math.sin(eps),cdhr=cdh*Math.cos(eps)+clh*Math.sin(eps);
    const cl=clw+ht.Sref/wb.Sref*clhr,cd=cdw+ht.Sref/wb.Sref*cdhr;
    const lift=q*wb.Sref*cl,drag=q*wb.Sref*cd,thrust=(drag+axial)/Math.cos(ar+phi);
    const wbZ=q*wb.Sref*(clw*Math.cos(ar)+cdw*Math.sin(ar));
    const htZ=q*ht.Sref*(clhr*Math.cos(ar)+cdhr*Math.sin(ar));
    const htX=q*ht.Sref*(cdhr*Math.cos(ar)-clhr*Math.sin(ar));
    const moment=q*wb.Sref*wb.Cref*cmw+c.cgOffset*wbZ
      +(ht.Zcg-wb.Zcg)*htX-(ht.Xcg-wb.Xcg-c.cgOffset)*htZ
      +thrust/2*((.5+1.6)*Math.cos(phi)+(1.7+6+2*c.cgOffset)*Math.sin(phi));
    return {alpha,stab,cl,cd,lift,drag,thrust,moment,
      f:(lift+thrust*Math.sin(ar+phi)-normal)/weight,g:moment/(q*wb.Sref*wb.Cref)};
  };
  let alpha=Math.max(-1,Math.min(12,(weight/(q*wb.Sref)-.02)/.095)),stab=-3,p;
  for(let iteration=0;iteration<25;iteration++){
    p=evaluate(alpha,stab);if(Math.max(Math.abs(p.f),Math.abs(p.g))<1e-8)return {...p,iterations:iteration+1};
    const da=.001,ps=evaluate(alpha,stab+da),pa=evaluate(alpha+da,stab);
    const a=(pa.f-p.f)/da,b=(ps.f-p.f)/da,d=(pa.g-p.g)/da,e=(ps.g-p.g)/da,det=a*e-b*d;
    if(Math.abs(det)<1e-12)throw Error('Équilibrage singulier.');
    const dx=(-p.f*e+b*p.g)/det,dy=(d*p.f-a*p.g)/det;
    let accepted=false;
    for(let scale=1;scale>=1/128;scale/=2){try{
      const candidate=evaluate(alpha+scale*dx,stab+scale*dy);
      if(Math.hypot(candidate.f,candidate.g)<Math.hypot(p.f,p.g)){alpha+=scale*dx;stab+=scale*dy;accepted=true;break;}
    }catch{/* Damped Newton remains inside supplied tables. */}}
    if(!accepted)throw Error('Équilibrage non convergé dans le domaine.');
  }
  throw Error('Équilibrage : limite de 25 itérations.');
}
export function referenceIndex(axis,values,x){
  if(x<axis[0]||x>axis.at(-1))return null;
  let i=0;while(i<axis.length-2&&axis[i+1]<x)i++;
  if(values[i]<=0||values[i+1]<=0)return null;
  const u=Math.log(x/axis[i])/Math.log(axis[i+1]/axis[i]);
  return Math.exp(Math.log(values[i])*(1-u)+Math.log(values[i+1])*u);
}
export function projectFlight(c,mass,h,mach,t,atmosphere,interpolate,motion={}){
  const a=atmosphere(h,c.disa),tas=mach*a.a,gs=motion.gs??tas+c.wind,q=.5*a.rho*tas*tas;
  const trim=projectTrim(c,mass,mach,q,t,interpolate,motion),curve=engineCurve(t,mach),engine=t.engine;
  const fn=n=>horner(curve.fn,n)*engine.thrustRefN;
  const target=trim.thrust/(4*a.delta),lo=c.n1Min,hi=c.n1Max;
  const min=fn(lo),max=fn(hi);
  const key=`${lo}/${hi}`;
  if(!curve[key]){
    let previous=min;
    for(let i=1;i<=70;i++){const next=fn(lo+(hi-lo)*i/70);if(!Number.isFinite(next)||next<=previous)throw Error('Polynôme de poussée non monotone dans le domaine choisi.');previous=next;}
    curve[key]=true;
  }
  // Monotonicity is established algebraically/numerically in source validation tests.
  if(target<Math.max(0,min)||target>max)return {h,mach,mass,...a,tas,gs,q,cl:trim.cl,cd:trim.cd,thrust:trim.thrust,available:4*max*a.delta,
    flow:0,tsfc:0,sr:0,thrustMargin:1-trim.thrust/(4*max*a.delta),clMargin:c.clMax-trim.cl,
    alpha:trim.alpha,stab:trim.stab,drag:trim.drag,axialThrust:trim.thrust*Math.cos((trim.alpha+2)*RAD),trimForceResidual:trim.f,trimMomentResidual:trim.g,
    feasible:false,reasons:['Poussée hors domaine N1 corrigé du projet.']};
  let l=lo,r=hi;
  for(let i=0;i<26;i++){const n=(l+r)/2;if(fn(n)<target)l=n;else r=n;}
  const n1c=(l+r)/2,n1=n1c*Math.sqrt(a.theta);
  const correctedFlow=horner(curve.wf,n1c)*engine.flowMultiplier*engine.flowRefKgS;
  const flow=4*correctedFlow*a.delta*Math.sqrt(a.theta),available=4*max*a.delta;
  if(flow<=0||trim.cd<=0)throw Error('Propulsion ou traînée non physique.');
  const reasons=[];
  if(gs<=30)reasons.push('Vitesse sol ≤ 30 m/s');
  if(trim.cl>c.clMax)reasons.push('Limite de CL dépassée');
  if(trim.thrust>available*c.thrustLimit)reasons.push('Marge de poussée insuffisante');
  if(h>c.ceiling)reasons.push('Plafond de l’étude dépassé');
  let ei=null;
  if(t.emissions){
    const e=t.emissions,wref=correctedFlow*(1+.2*mach*mach)*a.theta**4.3;
    const psat=610.7*10**(7.5*(a.T-273.15)/(a.T-35.85)),omega=.62197058*.8*psat/(a.p-.8*psat);
    const co=referenceIndex(e.flowKgS,e.coGKg,wref),nox=referenceIndex(e.flowKgS,e.noxGKg,wref),hc=referenceIndex(e.flowKgS,e.hcGKg,wref);
    const factor=a.theta**3.3/a.delta**1.02;
    ei={co:co===null?null:co*factor/1000,nox:nox===null?null:nox/Math.sqrt(factor)*Math.exp(-19*(omega-.00634))/1000,hc:hc===null?null:hc*factor/1000,referenceFlow:wref};
  }
  return {h,mach,mass,...a,tas,gs,q,cl:trim.cl,cd:trim.cd,thrust:trim.thrust,available,
    flow,tsfc:flow/trim.thrust,sr:gs/flow/1000,thrustMargin:1-trim.thrust/available,clMargin:c.clMax-trim.cl,
    alpha:trim.alpha,stab:trim.stab,drag:trim.drag,axialThrust:trim.thrust*Math.cos((trim.alpha+2)*RAD),n1,n1c,trimForceResidual:trim.f,trimMomentResidual:trim.g,trimIterations:trim.iterations,ei,
    feasible:!reasons.length,reasons};
}
