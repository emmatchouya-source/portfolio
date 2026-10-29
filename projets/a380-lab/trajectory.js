// Playback samples the computed cruise trajectory; it never integrates new dynamics.
import {verticalAt} from './vertical-profile.js?v=1.5.0';
export function prepareTrajectory(result,label){
  if(!result?.feasible||!Array.isArray(result.rows)||result.rows.length<2)return null;
  const rows=result.rows;
  if(rows.some((p,i)=>['seconds','x','h','mass','burn','mach','tas','gs','flow'].some(k=>!Number.isFinite(p[k]))||
    (i&&(p.seconds<rows[i-1].seconds||p.x<rows[i-1].x))))return null;
  const events=(result.climbs||[]).map(e=>({seconds:e.startSeconds,endSeconds:e.endSeconds,x:e.start/1000,endX:e.end/1000,from:e.from,to:e.to,
    index:rows.findIndex(p=>p.seconds>=e.endSeconds),finite:true,duration:e.duration,burn:e.burn}));
  for(let i=1;i<rows.length;i++)if(rows[i].seconds===rows[i-1].seconds&&rows[i].h!==rows[i-1].h)
    events.push({seconds:rows[i].seconds,x:rows[i].x,from:rows[i-1].h,to:rows[i].h,index:i});
  const stride=Math.max(1,Math.floor(rows.length/1600)),renderRows=rows.filter((p,i)=>i%stride===0||i===rows.length-1||(i&&p.phase!==rows[i-1].phase));
  return {label,rows,renderRows,events,vertical:result.vertical,airport:result.airport,phases:result.phases,waypoints:result.waypoints,seconds:rows.at(-1).seconds,distance:rows.at(-1).x};
}
export function sampleTrajectory(track,seconds){
  if(!track||!Number.isFinite(seconds))return null;
  const rows=track.rows,t=Math.max(rows[0].seconds,Math.min(track.seconds,seconds));
  // Upper bound chooses the POST-step sample at duplicate timestamps. No ramp is invented.
  let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].seconds<=t)lo=mid+1;else hi=mid;}
  const index=Math.max(0,lo-1),a=rows[index],b=rows[Math.min(index+1,rows.length-1)];
  const u=b.seconds>a.seconds?(t-a.seconds)/(b.seconds-a.seconds):0,p={...a,seconds:t};
  for(const key of ['x','h','mass','burn','mach','tas','gs','flow','thrust','available','cl','cd','alpha','stab','n1','n1c','gamma','roc','loadFactor','visualPitch','acceleration','brakeForce','normal'])
    if(Number.isFinite(a[key])&&Number.isFinite(b[key]))p[key]=a[key]+u*(b[key]-a[key]);
  if(track.vertical){const path=verticalAt(track.vertical,p.x*1000);p.h=path.h;p.phase=path.phase;}
  p.y=0;p.z=p.h;p.xMetres=p.x*1000;p.leg=track.events.filter(e=>(e.endSeconds??e.seconds)<=t).length;
  return p;
}
export function playbackCSV(track,version,model){
  const headers=['time_s','longitudinal_m','lateral_m','altitude_m','mach','tas_m_s','groundspeed_m_s','mass_kg','fuel_burn_kg','alpha_deg','stabilizer_deg','vertical_speed_m_s','flight_path_deg','phase','thrust_N','fuel_flow_kg_s','profile','model_status','version'];
  const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
  return [headers.join(','),...track.rows.map(p=>[p.seconds,p.x*1000,0,p.h,p.mach,p.tas,p.gs,p.mass,p.burn,p.alpha??'',p.stab??'',p.roc??0,(p.gamma??0)*180/Math.PI,p.phase??'cruise',p.thrust??'',p.flow,track.label,model,version]
    .map(v=>typeof v==='number'?v.toPrecision(12):quote(v)).join(','))].join('\r\n');
}
export const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
export function perspectiveCamera(eye,target,width,height){
  const forward=unit(sub(target,eye)),right=unit(cross(forward,[0,0,1])),up=cross(right,forward);
  const lens=height/(2*Math.tan(.63/2));
  return {eye,forward,right,up,lens,near:.5,project:p=>{const d=sub(p,eye),depth=dot(d,forward);return depth>.5?[width/2+lens*dot(d,right)/depth,height*.53-lens*dot(d,up)/depth,depth]:null;}};
}
export function profileCamera(center,width,height,span){
  const pixels=width/span,eye=[center[0],-10000,center[2]];
  return {eye,forward:[0,1,0],right:[1,0,0],up:[0,0,1],lens:pixels,near:.5,orthographic:true,
    project:p=>[width/2+pixels*(p[0]-center[0]),height*.53-pixels*(p[2]-center[2]),p[1]-eye[1]]};
}
