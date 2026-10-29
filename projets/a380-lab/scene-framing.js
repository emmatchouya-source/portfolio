// Presentation only: never changes trajectory samples or performance results.
export function sceneView(view,phase){
  if(view!=='auto')return view;
  if(['takeoff-roll','rotation','initial-climb'].includes(phase))return 'departure';
  if(['approach','flare','landing-roll'].includes(phase))return 'arrival';
  return 'follow';
}
export const localView=view=>['follow','profile','departure','arrival'].includes(view);
const WINDOWS={'takeoff-roll':6000,rotation:6000,'initial-climb':12000,'departure-climb':40000,cruise:60000,descent:40000,approach:12000,flare:6000,'landing-roll':6000};
export function localWindowMetres(track,point,view){
  if(!track?.airport)return 60000;
  const phases=track.phases||[],time=point?.seconds||0;
  const index=phases.findIndex((phase,i)=>time>=phase.startSeconds&&(time<phase.endSeconds||i===phases.length-1));
  const phase=phases[index]?.phase??point?.phase;
  if(view==='departure'&&!['takeoff-roll','rotation','initial-climb'].includes(phase))return 6000;
  if(view==='arrival'&&!['approach','flare','landing-roll'].includes(phase))return 12000;
  const target=WINDOWS[phase]??60000,previous=WINDOWS[phases[index-1]?.phase]??target;
  if(index<1)return target;
  // Deterministic transition in simulated time, including scrubbing and exports.
  const interval=phases[index],duration=Math.min(180,(interval.endSeconds-interval.startSeconds)*.35);
  const u=duration>0?Math.max(0,Math.min(1,(time-interval.startSeconds)/duration)):1;
  return previous+(target-previous)*u*u*(3-2*u);
}
export function automaticVerticalFactor(view,distanceKm,heightMetres,width,height){
  // Local views preserve geometry. A mission-wide view is a schematic overview:
  // allocate a readable vertical extent without applying that factor to local flight.
  if(!['orbit','side'].includes(view))return 1;
  const ratio=Math.max(.08,Math.min(.24,.24*Math.max(1,height)/Math.max(1,width)));
  const factor=distanceKm*1000/Math.max(500,heightMetres)*ratio;
  return Number.isFinite(factor)?Math.max(1,Math.min(200,Math.round(factor))):1;
}
