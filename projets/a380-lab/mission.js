import {validateAirportConfig} from './airport-config.js?v=1.3.5';
const G=9.80665,RAD=Math.PI/180,RHO0=1.225;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const u=clamp(x);return u*u*u*(10+u*(-15+6*u));};
const groundCache=new Map();
export function boundaryCurve(a,b,va,vb,T){
  const r=b-a-va*T,v=(vb-va)*T,A=10*r-4*v,B=-15*r+7*v,C=6*r-3*v;
  return t=>{const u=clamp(t/T);return {value:a+va*T*u+A*u**3+B*u**4+C*u**5,
    rate:va+(3*A*u*u+4*B*u**3+5*C*u**4)/T,accel:(6*A*u+12*B*u*u+20*C*u**3)/(T*T)};};
}
export function rk4Step(state,t,dt,derivative){
  const k1=derivative(t,state),k2=derivative(t+dt/2,state.map((v,i)=>v+dt*k1[i]/2));
  const k3=derivative(t+dt/2,state.map((v,i)=>v+dt*k2[i]/2)),k4=derivative(t+dt,state.map((v,i)=>v+dt*k3[i]));
  return state.map((v,i)=>v+dt*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
}
function rootStep(state,t,dt,derivative,event){
  let lo=0,hi=dt;const sign=Math.sign(event(state,t));
  for(let i=0;i<36;i++){const mid=(lo+hi)/2,s=rk4Step(state,t,mid,derivative);if(Math.sign(event(s,t+mid))===sign)lo=mid;else hi=mid;}
  const h=(lo+hi)/2;return {state:rk4Step(state,t,h,derivative),dt:h};
}
function airportEngine(c,a,mach){return 4*c.thrustSL*a.delta**.7*(1-.25*mach)*c.airportPower;}
function stageRow(c,x,t,m,p){return {x:x/1000,seconds:t,mass:m,burn:c.mass-m,model:'airport-parametric',...p};}
function takeoff(c,dt,atmosphere){
  const key=JSON.stringify([c,dt]);if(groundCache.has(key))return groundCache.get(key);
  const a=atmosphere(c.depElevation,c.disa),vs=Math.sqrt(2*c.mass*G/(a.rho*c.area*c.takeoffClMax));
  const vr=1.1*vs,clLift=c.takeoffClMax/(1.2**2),rows=[],events=[];
  let state=[0,0,c.mass],t=0,rotation=null;
  const point=(time,s)=>{
    const [x,u,m]=s,tas=Math.max(0,u-c.wind),q=.5*a.rho*tas*tas;
    const blend=rotation===null?0:smooth((time-rotation)/c.rotationTime),cl=.3+(clLift-.3)*blend;
    const lift=q*c.area*cl,drag=q*c.area*(c.takeoffCd0+c.airportHighLiftK*cl*cl),normal=Math.max(0,m*G-lift);
    const thrust=airportEngine(c,a,tas/a.a),flow=Math.max(c.airportIdleFlow,thrust*c.airportTsfc*1e-6);
    const acceleration=(thrust-drag-c.rollingMu*normal)/m;
    return {h:c.depElevation,tas,mach:tas/a.a,gs:u,roc:0,gamma:0,flow,thrust,available:thrust/c.airportPower,q,cl,cd:drag/(q*c.area||1),drag,lift,normal,
      clMargin:c.takeoffClMax-cl,thrustMargin:1-c.airportPower,phase:rotation===null?'takeoff-roll':'rotation',visualPitch:8*blend,
      acceleration,groundForceResidualN:thrust-drag-c.rollingMu*normal-m*acceleration};
  };
  const derivative=(time,s)=>{const p=point(time,s);return [s[1],p.acceleration,-p.flow];};
  rows.push(stageRow(c,0,0,c.mass,point(0,state)));
  for(let i=0;i<Math.ceil(600/dt);i++){
    const before=point(t,state);if(before.acceleration<=0)throw Error('Décollage : accélération insuffisante.');
    let step=dt,next=rk4Step(state,t,step,derivative);
    if(rotation===null&&next[1]-c.wind>=vr){const event=rootStep(state,t,dt,derivative,s=>s[1]-c.wind-vr);next=event.state;step=event.dt;}
    if(rotation!==null&&point(t+step,next).lift>=next[2]*G){
      const event=rootStep(state,t,step,derivative,(s,time)=>point(time,s).lift-s[2]*G);next=event.state;step=event.dt;
      state=next;t+=step;rows.push(stageRow(c,state[0],t,state[2],point(t,state)));
      if(state[0]>c.tora)throw Error(`Décollage : roulage ${Math.round(state[0])} m supérieur à la TORA ${c.tora} m.`);
      const result={rows,events:[...events,{kind:'liftoff',seconds:t,x:state[0]/1000,h:c.depElevation}],state,t,vs,vr,liftoffTAS:state[1]-c.wind,groundRollM:state[0]};
      if(groundCache.size>12)groundCache.clear();groundCache.set(key,result);return result;
    }
    state=next;t+=step;
    if(rotation===null&&state[1]-c.wind>=vr-1e-7){rotation=t;events.push({kind:'rotation',seconds:t,x:state[0]/1000,h:c.depElevation});}
    rows.push(stageRow(c,state[0],t,state[2],point(t,state)));
    if(state[0]>c.tora)throw Error(`Décollage : TORA ${c.tora} m dépassée avant l’envol.`);
    if(c.mass-state[2]>c.fuel-c.reserve)throw Error('Décollage : réserve carburant entamée.');
  }
  throw Error('Décollage : envol non atteint en 600 s.');
}
function airKinematics(segment,t,wind,atmosphere,c){
  const H=segment.height(t),V=segment.speed(t),h=H.value,tas=V.value;
  if(tas<=0||Math.abs(H.rate)>=tas)throw Error(`${segment.phase} : vitesse incompatible avec la trajectoire.`);
  const gamma=Math.asin(H.rate/tas),gs=tas*Math.cos(gamma)+wind;
  const gammaDot=(H.accel*tas-H.rate*V.rate)/(tas*tas*Math.cos(gamma));
  const normalAccel=tas*gammaDot,loadFactor=Math.cos(gamma)+normalAccel/G,a=atmosphere(h,c.disa);
  if(gs<=30||Math.abs(gamma)>12*RAD||loadFactor<.8||loadFactor>1.2)throw Error(`${segment.phase} : pente, vitesse sol ou facteur de charge hors limites d’étude.`);
  return {h,tas,gs,gamma,gammaDot,roc:H.rate,accel:V.rate,normalAccel,loadFactor,mach:tas/a.a,...a};
}
function airPoint(c,segment,t,m,atmosphere){
  const p=airKinematics(segment,t,c.wind,atmosphere,c),u=clamp(t/segment.duration),q=.5*p.rho*p.tas*p.tas;
  const landing=['descent','approach','flare'].includes(segment.phase);
  const clean=landing?1-smooth((u-.45)/.55):smooth((u-.05)/.4);
  const blend=segment.phase==='departure-climb'?clean:segment.phase==='descent'?clean:0;
  const clMax=blend*c.airportCleanClMax+(1-blend)*(landing?c.landingClMax:c.takeoffClMax);
  const cd0=blend*c.airportCleanCd0+(1-blend)*(landing?c.landingCd0:c.takeoffCd0);
  const k=blend*c.airportCleanK+(1-blend)*c.airportHighLiftK;
  const cl=m*(G*Math.cos(p.gamma)+p.normalAccel)/(q*c.area);
  let cd=cd0+k*cl*cl,drag=q*c.area*cd,thrust=drag+m*(G*Math.sin(p.gamma)+p.accel);
  const extra=Math.max(0,c.airportIdleThrust-thrust),capacity=c.airportSpeedbrakeCd*q*c.area;
  if(extra>capacity+1e-6)throw Error(`${segment.phase} : descente/décélération trop forte pour le ralenti et les aérofreins configurés.`);
  drag+=extra;cd+=extra/(q*c.area);thrust+=extra;
  const available=airportEngine(c,p,p.mach),flow=Math.max(c.airportIdleFlow,thrust*c.airportTsfc*1e-6);
  if(cl>clMax+1e-6)throw Error(`${segment.phase} : portance insuffisante (CL ${cl.toFixed(2)} > ${clMax.toFixed(2)}).`);
  if(thrust>available*c.thrustLimit+1e-5)throw Error(`${segment.phase} : poussée nécessaire supérieure à la limite basse vitesse configurée.`);
  if(thrust< -1e-6||!Number.isFinite(flow))throw Error(`${segment.phase} : propulsion non physique.`);
  const energyResidualW=(thrust-drag)*p.tas-m*(G*p.roc+p.tas*p.accel);
  return {...p,q,cl,cd,drag,thrust,axialThrust:thrust,available,flow,tsfc:flow/Math.max(1,thrust),clMargin:clMax-cl,thrustMargin:1-thrust/available,
    energyResidualW,phase:segment.phase,visualPitch:segment.phase==='initial-climb'?(segment.visualPitchStart??8)+(8-(segment.visualPitchStart??8))*smooth(u):segment.phase==='departure-climb'?8*(1-smooth(u)):segment.phase==='flare'?6*smooth(u):0};
}
function createPlan(c,profile,liftoffTAS,atmosphere,liftoffPitch=8){
  const h0=c.depElevation,h1=profile.altitude,finalH=h1+profile.steps*c.stepHeight;
  if(h1<=h0+500||finalH<=c.arrElevation+800)throw Error('Altitude de croisière trop basse par rapport aux aéroports.');
  const vc=profile.mach*atmosphere(h1,c.disa).a,ve=profile.mach*atmosphere(finalH,c.disa).a;
  const vap=c.approachEAS*Math.sqrt(RHO0/atmosphere(c.arrElevation,c.disa).rho),angle=c.approachAngle*RAD;
  // The approach setting is a ground-referenced glidepath. Wind changes the
  // required air-path angle and vertical speed, not the runway approach slope.
  const windRatio=c.wind*Math.sin(angle)/vap;
  if(Math.abs(windRatio)>=1)throw Error('Approche : vent incompatible avec la pente au sol.');
  const sink=vap*Math.sin(-angle-Math.asin(windRatio));
  if(-sink>c.descentRoc)throw Error('Le taux de descente maximal est inférieur au taux requis en approche.');
  const transitionTime=240/c.departureRoc,vTransition=Math.min(vc,liftoffTAS*1.25);
  const transition={phase:'initial-climb',duration:transitionTime,height:boundaryCurve(h0,h0+120,0,c.departureRoc,transitionTime),speed:boundaryCurve(liftoffTAS,vTransition,0,0,transitionTime),visualPitchStart:liftoffPitch};
  const upTime=Math.max(1.875*(h1-h0-120)/c.departureRoc,1.875*Math.abs(vc-vTransition)/.3);
  const downTime=Math.max(1.875*(finalH-c.arrElevation-300)/c.descentRoc,1.875*Math.abs(ve-vap)/.4);
  const departure={phase:'departure-climb',duration:upTime,height:boundaryCurve(h0+120,h1,c.departureRoc,0,upTime),speed:boundaryCurve(vTransition,vc,0,0,upTime)};
  const descent={phase:'descent',duration:downTime,height:boundaryCurve(finalH,c.arrElevation+300,0,sink,downTime),speed:boundaryCurve(ve,vap,0,0,downTime)};
  const approachTime=(300-12)/(-sink),thresholdTime=(300-15.24)/(-sink);
  const approach={phase:'approach',duration:approachTime,height:t=>({value:c.arrElevation+300+sink*t,rate:sink,accel:0}),speed:()=>({value:vap,rate:0,accel:0}),thresholdTime};
  const flareTime=24/(-sink),flare={phase:'flare',duration:flareTime,height:boundaryCurve(c.arrElevation+12,c.arrElevation,sink,0,flareTime),speed:boundaryCurve(vap,vap*1.2/1.3,0,0,flareTime)};
  return {departure:[transition,departure],arrival:[descent,approach,flare],vap};
}
function integrateAir(c,segment,initial,dt,atmosphere,trace=true){
  // state: horizontal distance, mass, excess-thrust work, potential work, kinetic work.
  let state=[initial.x,initial.mass,0,0,0],t=0,maxRoc=0,maxCL=0,minThrustMargin=1,maxEnergyResidual=0,threshold=null;
  const rows=[];let lastTraceTime=-Infinity;
  const traceInterval=['departure-climb','descent'].includes(segment.phase)?Math.max(2,dt):dt;
  const point=(time,s)=>airPoint(c,segment,time,s[1],atmosphere);
  const derivative=(time,s)=>{const p=point(time,s);return [p.gs,-p.flow,(p.thrust-p.drag)*p.tas,s[1]*G*p.roc,s[1]*p.tas*p.accel];};
  const push=()=>{const p=point(t,state);maxRoc=Math.max(maxRoc,p.roc);maxCL=Math.max(maxCL,p.cl);minThrustMargin=Math.min(minThrustMargin,p.thrustMargin);maxEnergyResidual=Math.max(maxEnergyResidual,Math.abs(p.energyResidualW)/(state[1]*G*p.tas));if(trace&&(t-lastTraceTime>=traceInterval-1e-8||Math.abs(t-segment.duration)<1e-8||Math.abs(t-segment.thresholdTime)<1e-8)){rows.push(stageRow(c,state[0],initial.seconds+t,state[1],p));lastTraceTime=t;}};
  push();
  const breaks=[segment.duration];if(segment.thresholdTime)breaks.unshift(segment.thresholdTime);
  for(const boundary of breaks){
    while(t<boundary-1e-9){const step=Math.min(dt,boundary-t);state=rk4Step(state,t,step,derivative);t=Math.min(boundary,t+step);push();if(c.mass-state[1]>c.fuel-c.reserve)throw Error(`${segment.phase} : réserve carburant entamée.`);}
    if(segment.thresholdTime&&Math.abs(t-segment.thresholdTime)<1e-7)threshold={seconds:initial.seconds+t,x:state[0]/1000,h:c.arrElevation+15.24,mass:state[1]};
  }
  return {rows,x:state[0],mass:state[1],seconds:initial.seconds+t,maxRoc,maxCL,minThrustMargin,maxEnergyResidual,workJ:state[2],potentialJ:state[3],kineticJ:state[4],threshold};
}
function geometryDistance(c,segment,dt,atmosphere,until=segment.duration){
  let x=0,t=0;const f=time=>airKinematics(segment,time,c.wind,atmosphere,c).gs;
  const breaks=segment.thresholdTime&&segment.thresholdTime<until?[segment.thresholdTime,until]:[until];
  for(const end of breaks)while(t<end-1e-9){const d=Math.min(dt,end-t);x+=d/6*(f(t)+4*f(t+d/2)+f(t+d));t=Math.min(end,t+d);}
  return x;
}
function landing(c,initial,dt,atmosphere){
  const rows=[],a=atmosphere(c.arrElevation,c.disa);let state=[initial.x,initial.gs,initial.mass,0],t=0;
  const initialCL=initial.cl;
  const point=(time,s)=>{
    const [x,u,m]=s,tas=Math.max(0,u-c.wind),q=.5*a.rho*tas*tas,cl=.2+(initialCL-.2)*(1-smooth(time));
    const lift=q*c.area*cl,normal=Math.max(0,m*G-lift),cd=c.landingCd0+c.airportHighLiftK*cl*cl,drag=q*c.area*cd;
    const brakeForce=c.brakeMu*smooth(time-c.brakeDelay)*normal,rolling=c.rollingMu*normal,thrust=c.airportIdleThrust;
    const acceleration=(thrust-drag-brakeForce-rolling)/m;
    return {h:c.arrElevation,tas,mach:tas/a.a,gs:Math.max(0,u),roc:0,gamma:0,q,cl,cd,lift,normal,drag,thrust,available:airportEngine(c,a,tas/a.a),flow:c.airportIdleFlow,
      phase:'landing-roll',acceleration,brakeForce,clMargin:c.landingClMax-cl,thrustMargin:1-thrust/airportEngine(c,a,tas/a.a),visualPitch:6*(1-smooth(time/2)),groundForceResidualN:thrust-drag-brakeForce-rolling-m*acceleration};
  };
  const derivative=(time,s)=>{const p=point(time,s);return [Math.max(0,s[1]),p.acceleration,-p.flow,p.brakeForce*Math.max(0,s[1])];};
  rows.push(stageRow(c,state[0],initial.seconds,state[2],point(0,state)));
  for(let i=0;i<Math.ceil(600/dt);i++){
    let step=dt,next=rk4Step(state,t,step,derivative),done=next[1]<=0;
    if(done){const event=rootStep(state,t,step,derivative,s=>s[1]);next=event.state;step=event.dt;next[1]=0;}
    state=next;t+=step;rows.push(stageRow(c,state[0],initial.seconds+t,state[2],point(t,state)));
    if(state[0]-initial.thresholdX>c.lda)throw Error(`Atterrissage : LDA ${c.lda} m dépassée avant l’arrêt.`);
    if(c.mass-state[2]>c.fuel-c.reserve)throw Error('Atterrissage : réserve carburant entamée.');
    if(done){if(c.brakeEnergyLimit&&state[3]>c.brakeEnergyLimit*1e6)throw Error('Atterrissage : énergie des freins supérieure à la limite renseignée.');return {rows,x:state[0],mass:state[2],seconds:initial.seconds+t,brakeEnergyJ:state[3],rollM:state[0]-initial.x,distanceFromThresholdM:state[0]-initial.thresholdX};}
  }
  throw Error('Atterrissage : arrêt non atteint en 600 s.');
}
export function simulateFullMission(c,profile,tables,dxKm,trace,api){
  let failurePhase='Configuration du vol complet';
  try{
    validateAirportConfig(c);
    if(![c.mass,c.fuel,c.reserve,c.distance,c.wind,c.disa,c.area,profile.altitude,profile.mach,profile.steps].every(Number.isFinite)||c.mass<=c.fuel||c.fuel<=c.reserve||c.distance<=0)throw Error('Paramètres de mission non finis ou incohérents.');
    const dtAir=Math.max(.125,Math.min(5,dxKm/10)),dtGround=Math.max(.025,Math.min(.5,dxKm/50));
    failurePhase='Décollage';const ground=takeoff(c,dtGround,api.atmosphere),plan=createPlan(c,profile,ground.liftoffTAS,api.atmosphere,ground.rows.at(-1).visualPitch);
    failurePhase='Montée initiale';let departure={x:ground.state[0],mass:ground.state[2],seconds:ground.t};const departureParts=[];
    for(const segment of plan.departure){departure=integrateAir(c,segment,departure,dtAir,api.atmosphere,trace);departureParts.push(departure);}
    const screenH=c.depElevation+15.24;let lo=0,hi=plan.departure[0].duration;
    for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(plan.departure[0].height(mid).value<screenH)lo=mid;else hi=mid;}
    const screenTime=(lo+hi)/2,screenDistance=ground.state[0]+geometryDistance(c,plan.departure[0],dtAir,api.atmosphere,screenTime);
    if(screenDistance>c.toda)throw Error(`Décollage : distance à 15,24 m (${Math.round(screenDistance)} m) supérieure à la TODA ${c.toda} m.`);
    // Arrival kinematics are prescribed independently of mass. This closes the route
    // before integrating cruise, without guessing the landing fuel or landing mass.
    const arrivalToThreshold=geometryDistance(c,plan.arrival[0],dtAir,api.atmosphere)+geometryDistance(c,plan.arrival[1],dtAir,api.atmosphere,plan.arrival[1].thresholdTime);
    const cruiseDistanceM=c.distance*1000-departure.x-arrivalToThreshold;
    if(cruiseDistanceM<1000)throw Error('Distance insuffisante pour le décollage, la montée, la descente et l’approche configurés.');
    const cruiseConfig={...c,missionMode:0,mass:departure.mass,fuel:c.fuel-(c.mass-departure.mass),distance:cruiseDistanceM/1000,maxMinutes:0};
    failurePhase='Croisière';const cruise=api.simulateCruise(cruiseConfig,profile,tables,dxKm,trace);
    if(!cruise.feasible)return {...cruise,lastPoint:cruise.lastPoint?{...cruise.lastPoint,positionKm:cruise.lastPoint.positionKm+departure.x/1000}:undefined,failurePhase,fullMission:true,reasons:cruise.reasons.map(x=>'Croisière : '+x)};
    let cursor={x:departure.x+cruiseDistanceM,mass:cruise.finalMass,seconds:departure.seconds+cruise.seconds},threshold=null;
    const airborne=[...departureParts],phases=[],rows=[],waypoints=[{kind:'start',seconds:0,x:0,h:c.depElevation},...ground.events];
    const append=list=>{if(!trace)return;for(const row of list){if(rows.length&&Math.abs(row.seconds-rows.at(-1).seconds)<1e-7)rows[rows.length-1]=row;else rows.push(row);}};
    const addPhase=(phase,start,end)=>phases.push({phase,startSeconds:start.seconds,endSeconds:end.seconds,startX:start.x/1000,endX:end.x/1000,burn:start.mass-end.mass,duration:end.seconds-start.seconds});
    const rotationRow=ground.rows.find(p=>p.phase==='rotation');
    append(ground.rows);addPhase('takeoff-roll',{x:0,mass:c.mass,seconds:0},{x:rotationRow.x*1000,mass:rotationRow.mass,seconds:rotationRow.seconds});
    addPhase('rotation',{x:rotationRow.x*1000,mass:rotationRow.mass,seconds:rotationRow.seconds},{x:ground.state[0],mass:ground.state[2],seconds:ground.t});
    let depStart={x:ground.state[0],mass:ground.state[2],seconds:ground.t};
    departureParts.forEach((part,i)=>{append(part.rows);addPhase(plan.departure[i].phase,depStart,part);depStart=part;});
    waypoints.push({kind:'top-of-climb',seconds:departure.seconds,x:departure.x/1000,h:profile.altitude});
    append(cruise.rows.map(p=>({...p,x:p.x+departure.x/1000,seconds:p.seconds+departure.seconds,burn:c.mass-p.mass,model:tables?.schema==='a380-project/v1'?'project-cruise':tables?'imported-cruise':'parametric-cruise'})));
    addPhase('cruise',departure,cursor);waypoints.push({kind:'top-of-descent',seconds:cursor.seconds,x:cursor.x/1000,h:profile.altitude+profile.steps*c.stepHeight});
    for(const segment of plan.arrival){failurePhase=segment.phase;const start=cursor,part=integrateAir(c,segment,start,dtAir,api.atmosphere,trace);append(part.rows);airborne.push(part);addPhase(segment.phase,start,part);cursor=part;if(part.threshold)threshold=part.threshold;}
    if(!threshold||Math.abs(threshold.x*1000-c.distance*1000)>.1)throw Error('Fermeture de distance au seuil non convergée.');
    const rhoArrival=api.atmosphere(c.arrElevation,c.disa).rho,vsLanding=Math.sqrt(2*threshold.mass*G/(rhoArrival*c.area*c.landingClMax));
    if(plan.vap<1.3*vsLanding-1e-6)throw Error('Approche : vitesse inférieure à 1,3 fois la vitesse de décrochage du modèle.');
    if(c.landingMassLimit&&cursor.mass>c.landingMassLimit)throw Error('Masse à l’atterrissage supérieure à la limite renseignée.');
    waypoints.push({kind:'threshold',...threshold},{kind:'touchdown',seconds:cursor.seconds,x:cursor.x/1000,h:c.arrElevation});
    const endAir=trace?cursor.rows.at(-1):airPoint(c,plan.arrival[2],plan.arrival[2].duration,cursor.mass,api.atmosphere);
    failurePhase='Freinage';const stop=landing(c,{...cursor,gs:endAir.gs,cl:endAir.cl,thresholdX:threshold.x*1000},dtGround,api.atmosphere);
    append(stop.rows);addPhase('landing-roll',cursor,stop);waypoints.push({kind:'stopped',seconds:stop.seconds,x:stop.x/1000,h:c.arrElevation});
    const burn=c.mass-stop.mass,remainingFuel=c.fuel-burn,reserveMargin=remainingFuel-c.reserve;
    if(reserveMargin<0)throw Error('Vol complet : réserve finale entamée.');
    if(c.maxMinutes&&stop.seconds>c.maxMinutes*60)throw Error('Vol complet : durée maximale dépassée.');
    const workJ=cruise.energy.workJ+airborne.reduce((s,p)=>s+p.workJ,0),potentialJ=cruise.energy.potentialJ+airborne.reduce((s,p)=>s+p.potentialJ,0),kineticJ=cruise.energy.kineticJ+airborne.reduce((s,p)=>s+p.kineticJ,0);
    const result={...cruise,fullMission:true,rows,profile,burn,seconds:stop.seconds,finalMass:stop.mass,remainingFuel,reserveMargin,co2:3.16*burn,score:0,vertical:null,
      cruiseConfig,cruiseMaxRoc:cruise.maxRoc,cruiseMaxCL:cruise.maxCL,cruiseEmissions:cruise.emissions,emissions:{co:null,nox:null,hc:null},phases,waypoints,
      climbs:cruise.climbs.map(e=>({...e,start:e.start+departure.x,end:e.end+departure.x,startSeconds:e.startSeconds+departure.seconds,endSeconds:e.endSeconds+departure.seconds})),
      maxRoc:Math.max(cruise.maxRoc,...airborne.map(p=>p.maxRoc)),maxCL:Math.max(cruise.maxCL,...airborne.map(p=>p.maxCL)),minThrustMargin:Math.min(cruise.minThrustMargin,...airborne.map(p=>p.minThrustMargin)),
      energy:{workJ,potentialJ,kineticJ,residualJ:workJ-potentialJ-kineticJ,maxNormalizedResidual:Math.max(cruise.energy.maxNormalizedResidual,...airborne.map(p=>p.maxEnergyResidual))},
      airport:{modelStatus:'parametric-low-speed/unvalidated',flatRunways:true,reversers:false,screenHeightM:15.24,rotationTAS:ground.vr,liftoffTAS:ground.liftoffTAS,stallTakeoffTAS:ground.vs,approachTAS:plan.vap,stallLandingTAS:vsLanding,
        takeoffRollM:ground.groundRollM,takeoffToScreenM:screenDistance,toraMarginM:c.tora-ground.groundRollM,todaMarginM:c.toda-screenDistance,landingFromThresholdM:stop.distanceFromThresholdM,landingRollM:stop.rollM,ldaMarginM:c.lda-stop.distanceFromThresholdM,brakeEnergyMJ:stop.brakeEnergyJ/1e6,landingMass:cursor.mass,cruiseDistanceKm:cruiseDistanceM/1000,thresholdClosureM:threshold.x*1000-c.distance*1000,
        limitations:['Hypothèses basse vitesse éditables, non issues d’un AFM A380','Pistes horizontales, vent uniforme, aucun moteur en panne','Pas de V1, V2, distance accélération-arrêt ou distance réglementaire majorée','Pas de modèle d’aquaplanage, d’inverseurs ou de température des freins']}};
    result.score=api.score(result,c);return result;
  }catch(e){return {feasible:false,fullMission:true,failurePhase,reasons:[`${failurePhase} : ${e.message}`],profile};}
}
