import {G,clamp,add,sub,scale,dot,norm,unit,cross,wrap,conj,mul,rotate,integrate,euler,fromAxes,random} from './math.js';
import {frame,geometry,wrench} from './airframes.js';

export const DT=1/240;
export const DEFAULTS=Object.freeze({
  airframe:'quad-x', hAspect:1.5, mass:1.5, arm:.23, thrust:9, inertia:[.022,.022,.040], motorTau:.045, yawRatio:.018,
  drag:.12, wind:1.5, gust:.6, windDirection:35, noise:1,
  posP:1.3, velP:2.5, velI:.35, attP:5, rateP:18, rateI:8, rateD:.12,
  tilt:30, speed:3, altitude:5, radius:6, fence:35, ceiling:20, batteryMah:5200,
  mission:'square', feedback:'estimate', seed:42
});
export const PRESETS={
  micro:{mass:.25,arm:.10,thrust:1.8,inertia:[.0007,.0007,.0012],motorTau:.025,batteryMah:850},
  standard:{mass:1.5,arm:.23,thrust:9,inertia:[.022,.022,.040],motorTau:.045,batteryMah:5200},
  heavy:{mass:4,arm:.38,thrust:24,inertia:[.12,.12,.20],motorTau:.065,batteryMah:12000}
};
export function config(input={}) {
  const c={...DEFAULTS,...input,inertia:[...(input.inertia||DEFAULTS.inertia)]};
  const count=frame(c.airframe).positions.length;
  if(!Number.isFinite(c.hAspect)||c.hAspect<1||c.hAspect>3)throw Error('Rapport longueur/largeur H invalide (1 à 3).');
  const ranges={mass:[.1,10],arm:[.07,.7],thrust:[.5,80],motorTau:[.01,.2],yawRatio:[.005,.05],drag:[0,1],wind:[0,12],gust:[0,6],windDirection:[0,360],noise:[0,3],posP:[.1,4],velP:[.1,8],velI:[0,2],attP:[.5,12],rateP:[1,45],rateI:[0,25],rateD:[0,.5],tilt:[5,45],speed:[.5,8],altitude:[1,15],radius:[2,12],fence:[20,60],ceiling:[16,30],batteryMah:[200,25000],seed:[0,4294967295]};
  for(const [k,[lo,hi]] of Object.entries(ranges)) if(!Number.isFinite(c[k])||c[k]<lo||c[k]>hi) throw Error(`Paramètre invalide : ${k} (${lo} à ${hi}).`);
  if(c.inertia.length!==3||c.inertia.some(v=>!Number.isFinite(v)||v<.0001||v>2)) throw Error('Inerties invalides.');
  if(c.inertia.some((v,i)=>v>c.inertia[(i+1)%3]+c.inertia[(i+2)%3])) throw Error('Inerties non physiques : chaque inertie doit être inférieure à la somme des deux autres.');
  if(!['hover','square','circle','eight','waypoints'].includes(c.mission)||!['estimate','truth'].includes(c.feedback)) throw Error('Mission ou retour de commande invalide.');
  if(c.thrust*count<c.mass*G*1.3) throw Error('Poussée insuffisante : rapport poussée/poids minimal 1,3.');
  const extent=c.mission==='circle'?2*c.radius:c.mission==='square'?Math.SQRT2*c.radius:c.mission==='eight'?1.12*c.radius:0;
  if(extent>c.fence-2)throw Error('Le circuit dépasse la zone de vol : réduis sa dimension ou agrandis le rayon de la zone.');
  return c;
}

export function allocate(c, total, torque,g=geometry(c)) {
  const command=[total,...torque],raw=g.mix.map(row=>dot(row,command));
  return {forces:raw.map(f=>clamp(f,0,c.thrust)),saturated:raw.some(f=>f<0||f>c.thrust)};
}
export class Controller {
  constructor(c){this.c=c;this.geometry=geometry(c);this.iv=[0,0,0];this.ir=[0,0,0];this.prev=[0,0,0];this.der=[0,0,0];this.saturated=false;}
  update(s, target, dt) {
    const c=this.c;
    let vd=add(scale(sub(target.p,s.p),c.posP),target.v);
    const speed=norm(vd); if(speed>c.speed)vd=scale(vd,c.speed/speed);
    const ev=sub(vd,s.v);
    if(!this.saturated)this.iv=this.iv.map((v,i)=>clamp(v+ev[i]*dt,-3,3));
    let acc=add(add(scale(ev,c.velP),scale(this.iv,c.velI)),target.a);
    acc[2]=clamp(acc[2],-G*.6,G); const maxH=Math.max(.1,G+acc[2])*Math.tan(c.tilt*Math.PI/180), h=Math.hypot(acc[0],acc[1]);
    if(h>maxH){acc[0]*=maxH/h;acc[1]*=maxH/h;}
    const f=scale(add(acc,[0,0,G]),c.mass), zd=unit(f), xc=[Math.cos(target.yaw),Math.sin(target.yaw),0], yd=unit(cross(zd,xc)), xd=cross(yd,zd);
    const qd=fromAxes(xd,yd,zd), qe=mul(conj(s.q),qd), wr=scale(qe.slice(1),2*c.attP*(qe[0]>=0?1:-1)).map(v=>clamp(v,-3,3));
    const er=sub(wr,s.w);
    this.der=this.der.map((v,i)=>v+.2*((s.w[i]-this.prev[i])/dt-v)); this.prev=[...s.w];
    if(!this.saturated)this.ir=this.ir.map((v,i)=>clamp(v+er[i]*dt,-.6,.6));
    const gyro=cross(s.w,s.w.map((v,i)=>v*c.inertia[i]));
    const torque=er.map((v,i)=>c.inertia[i]*(c.rateP*v+c.rateI*this.ir[i]-c.rateD*this.der[i])+gyro[i]);
    const total=clamp(dot(f,rotate(s.q,[0,0,1])),0,this.geometry.count*c.thrust), out=allocate(c,total,torque,this.geometry);
    this.saturated=out.saturated;
    return {...out,total,torque,qd};
  }
}

export class Sensors {
  constructor(c){this.c=c;this.rng=random(c.seed);this.gpsTime=-1;this.baroTime=-1;this.magTime=-1;this.rangeTime=-1;this.gpsAge=0;this.gpsAvailable=true;this.gps={p:[0,0,0],v:[0,0,0]};this.baro=0;this.range=0;this.mag=[1,0,.45];this.magYaw=0;this.accel=[0,0,G];this.gyro=[0,0,0];this.counts={gps:0,baro:0,mag:0,range:0};}
  n(s){return this.rng()*s*this.c.noise;}
  sample(s,t,dropout) {
    this.gyro=s.w.map((v,i)=>v+this.n(.002)+[.0005,-.0003,.0004][i]*this.c.noise);
    this.accel=rotate(conj(s.q),add(s.acc,[0,0,G])).map(v=>v+this.n(.025));
    this.gpsAvailable=!dropout;
    if(!dropout&&t-this.gpsTime>=.1-1e-8){this.gps={p:s.p.map(v=>v+this.n(.12)),v:s.v.map(v=>v+this.n(.04))};this.gpsTime=t;this.counts.gps++;}
    this.gpsAge=t-this.gpsTime;
    if(t-this.baroTime>=.04-1e-8){this.baro=s.p[2]+this.n(.06);this.baroTime=t;this.counts.baro++;}
    if(t-this.magTime>=.02-1e-8){this.mag=rotate(conj(s.q),[1,0,.45]).map(v=>v+this.n(.006));this.magTime=t;this.counts.mag++;}
    if(t-this.rangeTime>=.04-1e-8){const z=rotate(s.q,[0,0,1])[2];this.range=s.p[2]<12&&z>.7?Math.max(0,s.p[2]/z+this.n(.015)):null;this.rangeTime=t;this.counts.range++;}
  }
}

export class Estimator {
  constructor(){this.p=[0,0,0];this.v=[0,0,0];this.q=[1,0,0,0];this.w=[0,0,0];this.last={gps:0,baro:0,mag:0,range:0};}
  update(sensor,dt){
    let correction=[0,0,0];
    // Gravity correction is deliberately weak: sustained acceleration biases a complementary AHRS.
    if(Math.abs(norm(sensor.accel)-G)<.3)correction=scale(cross(unit(sensor.accel),rotate(conj(this.q),[0,0,1])),.12);
    this.w=[...sensor.gyro]; this.q=integrate(this.q,add(this.w,correction),dt);
    if(sensor.counts.mag!==this.last.mag){
      const world=rotate(this.q,sensor.mag), err=-Math.atan2(world[1],world[0]);
      this.q=integrate(this.q,scale(rotate(conj(this.q),[0,0,1]),err*.5),.02);
    }
    const aw=sub(rotate(this.q,sensor.accel),[0,0,G]);
    this.p=add(this.p,add(scale(this.v,dt),scale(aw,.5*dt*dt)));this.v=add(this.v,scale(aw,dt));
    if(sensor.counts.gps!==this.last.gps){
      this.p=this.p.map((v,i)=>v+.2*(sensor.gps.p[i]-v));
      this.v=this.v.map((v,i)=>v+.45*(sensor.gps.v[i]-v));
    }
    if(sensor.counts.baro!==this.last.baro)this.p[2]+=.15*(sensor.baro-this.p[2]);
    if(sensor.counts.range!==this.last.range&&sensor.range!==null){const h=sensor.range*rotate(this.q,[0,0,1])[2];this.p[2]+=.2*(h-this.p[2]);}
    this.last={...sensor.counts};
    return this;
  }
}

export function route(c,waypoints=[]){
  const r=c.radius,z=c.altitude;
  if(c.mission==='waypoints')return waypoints.map(p=>[p[0],p[1],p[2]]);
  if(c.mission==='square')return [[0,0,z],[r,0,z],[r,r,z],[0,r,z],[0,0,z]];
  return [[0,0,z]];
}

export class Simulation {
  constructor(input={},waypoints=[]){
    this.c=config(input);this.waypoints=waypoints.map(p=>[...p]);
    if(this.waypoints.some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))||Math.hypot(p[0],p[1])>this.c.fence-2||p[2]<1||p[2]>this.c.ceiling-1))throw Error('Point de passage hors des limites.');
    if(this.c.mission==='waypoints'&&!this.waypoints.length)throw Error('Ajoute au moins un point de passage.');
    this.s={p:[0,0,0],v:[0,0,0],q:[1,0,0,0],w:[0,0,0],acc:[0,0,0]};
    this.sensors=new Sensors(this.c);this.estimate=new Estimator();this.controller=new Controller(this.c);
    this.t=0;this.mode='ready';this.phase='Au sol';this.target={p:[0,0,0],v:[0,0,0],a:[0,0,0],yaw:0};
    this.geometry=geometry(this.c);this.motors=Array(this.geometry.count).fill(0);this.command=[...this.motors];this.energy=0;this.battery=1;this.voltage=16.8;this.current=0;
    this.dropout=false;this.failedMotor=-1;this.events=[];this.history=[];this.trail=[];this.route=route(this.c,this.waypoints);this.waypoint=0;this.dwell=0;this.missionTime=null;
    this.metrics={samples:0,sumError2:0,maxError:0,saturation:0};this.hold=[0,0,this.c.altitude];this.reason='';this.landed=false;
    this.sensors.sample(this.s,0,false);
  }
  log(msg){if(this.events.length>200)this.events.shift();this.events.push({t:this.t,message:msg});}
  start(){if(this.mode!=='ready')return;this.mode='mission';this.log('Mission lancée · '+this.geometry.profile.name);}
  land(reason='Atterrissage demandé'){if(['ready','landed','crashed'].includes(this.mode))return;this.mode='land';this.hold=[...this.estimate.p];this.reason=reason;this.log(reason);}
  rtl(reason='Retour au point de départ'){if(['ready','landed','crashed'].includes(this.mode))return;this.mode='rtl';this.reason=reason;this.log(reason);}
  holdPosition(){if(!['mission','rtl','hold'].includes(this.mode))return;this.hold=[...this.estimate.p];this.mode='hold';this.log('Maintien de position');}
  resume(){if(this.mode==='hold'){this.mode='mission';this.log('Mission reprise');}}
  disturb(){this.s.v=add(this.s.v,[1.4,-.8,.3]);this.s.w=add(this.s.w,[.5,-.35,.2]);this.log('Impulsion : Δv et Δω appliqués');}
  guidance(dt){
    const c=this.c, e=this.estimate;
    const at=p=>({p:[...p],v:[0,0,0],a:[0,0,0],yaw:0});
    if(this.mode==='ready')return at([0,0,0]);
    if(this.mode==='hold'){this.phase='Maintien';return at(this.hold);}
    if(this.mode==='rtl'){
      this.phase='Retour';
      if(Math.hypot(e.p[0],e.p[1])<.45&&Math.hypot(e.v[0],e.v[1])<.5)this.land('Retour terminé · descente');
      else return at([0,0,Math.max(2,c.altitude)]);
    }
    if(this.mode==='land'){
      this.phase='Atterrissage';this.hold[2]=Math.max(-.2,this.hold[2]-.55*dt);
      return at(this.hold);
    }
    if(this.missionTime===null){
      this.phase='Décollage';
      if(Math.abs(e.p[2]-c.altitude)<.3&&norm(e.v)<.5)this.dwell+=dt;else this.dwell=0;
      if(this.dwell>1){this.missionTime=this.t;this.dwell=0;this.log('Altitude atteinte · trajectoire');}
      return at([0,0,c.altitude]);
    }
    this.phase='Trajectoire'; const t=this.t-this.missionTime,r=c.radius,w=c.speed/(r*(c.mission==='eight'?Math.SQRT2:1));
    if(c.mission==='circle')return {p:[r*Math.sin(w*t),r*(1-Math.cos(w*t)),c.altitude],v:[r*w*Math.cos(w*t),r*w*Math.sin(w*t),0],a:[-r*w*w*Math.sin(w*t),r*w*w*Math.cos(w*t),0],yaw:0};
    if(c.mission==='eight')return {p:[r*Math.sin(w*t),r*.5*Math.sin(2*w*t),c.altitude],v:[r*w*Math.cos(w*t),r*w*Math.cos(2*w*t),0],a:[-r*w*w*Math.sin(w*t),-2*r*w*w*Math.sin(2*w*t),0],yaw:0};
    if(c.mission==='hover')return at([0,0,c.altitude]);
    const p=this.route[this.waypoint];
    if(norm(sub(e.p,p))<.4&&norm(e.v)<.5)this.dwell+=dt;else this.dwell=0;
    if(this.dwell>1){this.dwell=0;if(this.waypoint<this.route.length-1){this.waypoint++;this.log(`Point ${this.waypoint+1}/${this.route.length}`);}else{this.mode='hold';this.hold=[...p];this.log('Mission terminée · maintien de position');}}
    return at(p);
  }
  step(dt=DT){
    if(['landed','crashed'].includes(this.mode))return;
    const s=this.s,c=this.c;this.t+=dt;
    if(!['ready','land'].includes(this.mode)){
      if(this.sensors.gpsAge>1.2)this.land('GNSS indisponible · atterrissage');
      else if(this.failedMotor>=0)this.land('Panne moteur · atterrissage tenté');
      else if(this.mode!=='rtl'){
        if(this.battery<.2)this.rtl('Batterie faible · retour');
        else if(Math.hypot(...this.estimate.p.slice(0,2))>c.fence||this.estimate.p[2]>c.ceiling)this.rtl('Limite de vol dépassée · retour');
      }
    }
    if(this.battery<.08&&!['ready','land'].includes(this.mode))this.land('Batterie critique · descente');
    this.target=this.guidance(dt);
    const active=this.mode!=='ready', feedback=c.feedback==='truth'?s:this.estimate;
    if(active){const out=this.controller.update(feedback,this.target,dt);this.command=out.forces;}else this.command.fill(0);
    const voltageFactor=clamp((this.voltage/16.8)**2,.65,1);
    this.motors=this.motors.map((v,i)=>v+(i===this.failedMotor?0:this.command[i]*voltageFactor-v)*(1-Math.exp(-dt/c.motorTau)));
    if(this.failedMotor>=0)this.motors[this.failedMotor]*=Math.exp(-dt/c.motorTau);
    const [total,...torque]=wrench(c,this.motors,this.geometry);
    const gyro=cross(s.w,s.w.map((v,i)=>v*c.inertia[i]));
    const dw=torque.map((v,i)=>(v-gyro[i]-.002*s.w[i])/c.inertia[i]);
    s.w=add(s.w,scale(dw,dt));s.q=integrate(s.q,s.w,dt);
    const dir=c.windDirection*Math.PI/180, ws=c.wind+c.gust*(.6*Math.sin(this.t*1.7)+.4*Math.sin(this.t*3.1));
    this.wind=[ws*Math.cos(dir),ws*Math.sin(dir),0];const rel=sub(s.v,this.wind), drag=scale(rel,-c.drag*norm(rel));
    s.acc=add(scale(add(rotate(s.q,[0,0,total]),drag),1/c.mass),[0,0,-G]);
    s.p=add(s.p,add(scale(s.v,dt),scale(s.acc,.5*dt*dt)));s.v=add(s.v,scale(s.acc,dt));
    if(s.p[2]<0){
      const impact=-s.v[2], tilt=Math.acos(clamp(rotate(s.q,[0,0,1])[2],-1,1));
      s.p[2]=0;s.v=[s.v[0]*.95,s.v[1]*.95,Math.max(0,s.v[2])];s.acc=[0,0,0];
      if(active&&this.t>1&&(impact>3||tilt>Math.PI/3)){this.mode='crashed';this.phase='Collision';this.log('Collision au sol · simulation arrêtée');}
      else if(this.mode==='land'&&this.hold[2]<.1){this.mode='landed';this.phase='Au sol';this.landed=true;this.log('Atterrissage terminé');}
    }
    if(['crashed','landed'].includes(this.mode)){this.motors.fill(0);this.command.fill(0);}
    this.current=active?1.2+this.motors.reduce((a,f)=>a+.5*Math.max(0,f)**1.5,0):.2;
    this.energy+=this.current*dt/3600;this.battery=clamp(1-this.energy/(c.batteryMah/1000),0,1);this.voltage=14+2.8*this.battery-.015*this.current;
    this.sensors.sample(s,this.t,this.dropout);this.estimate.update(this.sensors,dt);
    if(!s.p.concat(s.v,s.q,s.w,this.estimate.p,this.estimate.q).every(Number.isFinite)){this.mode='crashed';this.phase='Erreur numérique';this.motors.fill(0);this.command.fill(0);this.log('État non fini · arrêt');return;}
    const error=norm(sub(this.target.p,s.p));
    if(active){this.metrics.samples++;this.metrics.sumError2+=error*error;this.metrics.maxError=Math.max(this.metrics.maxError,error);if(this.controller.saturated)this.metrics.saturation++;}
    const sampleIndex=Math.round(this.t/DT);
    if(sampleIndex%12===0){
      const angles=euler(s.q);this.history.push({t:this.t,p:[...s.p],v:[...s.v],angles,estimated:[...this.estimate.p],target:[...this.target.p],motors:[...this.motors],error,battery:this.battery,mode:this.mode,gyro:[...this.sensors.gyro],accel:[...this.sensors.accel],gps:[...this.sensors.gps.p],baro:this.sensors.baro,gpsAge:this.sensors.gpsAge});
      if(this.history.length>12000)this.history.shift();this.trail.push([...s.p]);if(this.trail.length>2400)this.trail.shift();
    }
  }
  get rms(){return Math.sqrt(this.metrics.sumError2/(this.metrics.samples||1));}
}
