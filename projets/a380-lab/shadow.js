// Illustrative directional sunlight shared by the aircraft shading and ground shadow.
// Aircraft size is enlarged in this view; this is not a photometric simulation.
export const SUN_DIRECTION=[-.3,-.4,.86];

export function shadowFootprint(faces,{center,groundZ,heightMetres,worldScale}){
  const height=Math.max(0,heightMetres)*worldScale;
  return faces.map(face=>face.points.map(p=>{
    // Use true height above the local ground, independent of vertical exaggeration.
    const aboveGround=Math.max(0,height+p[2]-center[2]);
    return [p[0]-SUN_DIRECTION[0]/SUN_DIRECTION[2]*aboveGround,
      p[1]-SUN_DIRECTION[1]/SUN_DIRECTION[2]*aboveGround,groundZ];
  }));
}

export function drawGroundShadow(ctx,mask,faces,geometry,project,width,height,dpr){
  const agl=Math.max(0,geometry.heightMetres);
  // Contrast attenuation is a display choice, avoiding a dark marker at cruise altitude.
  const opacity=.32/(1+(agl/600)**2);
  if(opacity<.008)return;
  const polygons=shadowFootprint(faces,geometry).map(points=>points.map(project)).filter(points=>points.every(Boolean));
  if(!polygons.length)return;
  if(mask.width!==ctx.canvas.width||mask.height!==ctx.canvas.height){mask.width=ctx.canvas.width;mask.height=ctx.canvas.height;}
  const m=mask.getContext('2d');m.setTransform(1,0,0,1,0,0);m.clearRect(0,0,mask.width,mask.height);m.scale(dpr,dpr);
  // Union opaque faces first: overlapping wings/fuselage must not darken the shadow.
  m.fillStyle='#000';m.beginPath();
  for(const points of polygons){
    const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
    // One nonzero-winding fill gives a union, including anti-aliased shared edges.
    const contour=area<0?[...points].reverse():points;
    contour.forEach((p,i)=>i?m.lineTo(p[0],p[1]):m.moveTo(p[0],p[1]));m.closePath();
  }
  m.fill('nonzero');
  const footprint=shadowFootprint([{points:[geometry.center]}],geometry)[0][0];
  const a=project(footprint),b=project([footprint[0],footprint[1]+agl*geometry.worldScale*.00465,footprint[2]]);
  const blur=a&&b?Math.min(24,Math.max(.65,Math.hypot(a[0]-b[0],a[1]-b[1]))):.65;
  ctx.save();ctx.globalAlpha=opacity;ctx.filter=`blur(${blur}px)`;ctx.drawImage(mask,0,0,width,height);ctx.restore();
}
