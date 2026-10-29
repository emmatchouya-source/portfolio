// Presentation only: never changes trajectory samples or performance results.
export function sceneView(view,phase){
  if(view!=='auto')return view;
  if(['takeoff-roll','rotation','initial-climb'].includes(phase))return 'departure';
  if(['approach','flare','landing-roll'].includes(phase))return 'arrival';
  return 'follow';
}
export const localView=view=>['follow','profile','departure','arrival'].includes(view);
const WINDOWS={'takeoff-roll':6000,rotation:6000,'initial-climb':12000,'departure-climb':40000,cruise:60000,descent:40000,approach:12000,flare:6000,'landing-roll':6000};
function stepWindow(base,track,point,view){
  const event=track?.events?.find(e=>e.finite&&point?.seconds>=e.seconds&&point.seconds<=e.endSeconds);
  if(!event||!['follow','profile'].includes(view))return base;
  const target=Math.max(12000,Math.min(2000000,(event.endX-event.x)*1000*2.4));
  const fraction=(point.seconds-event.seconds)/(event.endSeconds-event.seconds||1);
  const u=Math.max(0,Math.min(1,fraction/.15,(1-fraction)/.15));
  return base+(target-base)*u*u*(3-2*u);
}
export function localWindowMetres(track,point,view){
  if(!track?.airport)return stepWindow(60000,track,point,view);
  const phases=track.phases||[],time=point?.seconds||0;
  const index=phases.findIndex((phase,i)=>time>=phase.startSeconds&&(time<phase.endSeconds||i===phases.length-1));
  const phase=phases[index]?.phase??point?.phase;
  if(view==='departure'&&!['takeoff-roll','rotation','initial-climb'].includes(phase))return 6000;
  if(view==='arrival'&&!['approach','flare','landing-roll'].includes(phase))return 12000;
  const target=WINDOWS[phase]??60000,previous=WINDOWS[phases[index-1]?.phase]??target;
  if(index<1)return stepWindow(target,track,point,view);
  // Deterministic transition in simulated time, including scrubbing and exports.
  const interval=phases[index],duration=Math.min(180,(interval.endSeconds-interval.startSeconds)*.35);
  const u=duration>0?Math.max(0,Math.min(1,(time-interval.startSeconds)/duration)):1;
  return stepWindow(previous+(target-previous)*u*u*(3-2*u),track,point,view);
}
export function automaticVerticalFactor(view,distanceKm,heightMetres,width,height){
  return 1;
}

// Fit the complete bounds with one uniform scale, including portrait viewports.
export function missionCameraFit(points,yaw,elevation,width,height){
  const min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
  const center=min.map((v,i)=>(v+max[i])/2),cy=Math.cos(yaw),sy=Math.sin(yaw),ce=Math.cos(elevation),se=Math.sin(elevation);
  const forward=[-ce*cy,-ce*sy,-se],right=[-sy,cy,0],up=[-se*cy,-se*sy,ce],tanV=Math.tan(.63/2),tanH=tanV*Math.max(1,width)/Math.max(1,height);
  const horizontalMargin=Math.max(.4,Math.min(.78,1-180/Math.max(1,width)));
  const verticalMargin=Math.max(.2,Math.min(.55,2*(.47*height-130)/Math.max(1,height)));
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  let radius=1;
  for(const point of points){const d=point.map((v,i)=>v-center[i]),depth=dot(d,forward);
    radius=Math.max(radius,Math.abs(dot(d,right))/(tanH*horizontalMargin)-depth,Math.abs(dot(d,up))/(tanV*verticalMargin)-depth,1-depth);
  }
  return {center,radius,span:Math.max(1,(max[0]-min[0])*1.3,(max[2]-min[2])*width/Math.max(1,height)*1.8)};
}
