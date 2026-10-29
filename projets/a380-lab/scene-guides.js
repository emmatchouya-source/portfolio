// Presentation guides. Distances are measured in the trajectory's local frame.
export function niceInterval(value){
  const decade=10**Math.floor(Math.log10(Math.max(1e-9,value))),unit=value/decade;
  return (unit<=1?1:unit<=2?2:unit<=5?5:10)*decade;
}
const number=value=>(Object.is(value,-0)?0:value).toLocaleString('fr-FR',{maximumFractionDigits:2});
export const profilePlot=(width,height)=>({left:64,right:width-100,top:width<500?140:110,bottom:height-150});

// An X/Z profile is an engineering plot, not an edge-on perspective floor.
// Both sets of grid lines use the SAME physical interval and pixels/metre.
export function profileGuides(ctx,camera,width,height,{origin,scale,groundAltitude,altitudeBounds}){
  const {left,right,top,bottom}=profilePlot(width,height);
  if(right<=left||bottom<=top)return;
  const zero=camera.project([0,0,0]),pixelsPerMetre=camera.lens*scale;
  const spacing=niceInterval(85/pixelsPerMetre);
  const minX=origin+(left-zero[0])/pixelsPerMetre,maxX=origin+(right-zero[0])/pixelsPerMetre;
  const minH=groundAltitude+(zero[1]-bottom)/pixelsPerMetre,maxH=groundAltitude+(zero[1]-top)/pixelsPerMetre;
  ctx.save();ctx.font='10px Consolas, monospace';ctx.lineWidth=1;
  ctx.strokeStyle='#54717e';ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke();
  const stroke=(a,b)=>{ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();};
  for(let x=Math.ceil(minX/spacing)*spacing;x<=maxX;x+=spacing){
    const px=zero[0]+(x-origin)*pixelsPerMetre;
    ctx.strokeStyle='#294653';stroke([px,top],[px,bottom]);
    ctx.fillStyle='#a8bfca';ctx.textAlign='center';ctx.fillText(number(x/1000),px,bottom+16);
  }
  for(let altitude=Math.ceil(minH/spacing)*spacing;altitude<=maxH;altitude+=spacing){
    // A transcontinental profile must not suggest altitudes of 500–1000 km.
    if(altitudeBounds&&(altitude<altitudeBounds[0]||altitude>altitudeBounds[1]))continue;
    const py=zero[1]-(altitude-groundAltitude)*pixelsPerMetre;
    ctx.strokeStyle=altitude===groundAltitude?'#66858e':'#294653';stroke([left,py],[right,py]);
    ctx.fillStyle='#a8bfca';ctx.textAlign='right';ctx.fillText(number(altitude),left-8,py+3);
  }
  ctx.fillStyle='#b5cad3';ctx.textAlign='left';ctx.fillText('Altitude (m)',left,top-12);
  ctx.textAlign='right';ctx.fillText('Distance depuis le départ (km)',right,bottom+33);
  ctx.restore();
  return {pixelsPerMetre,spacing};
}

// Reference length at the aircraft's position, projected by the actual camera.
// It is deliberately not called a screen-wide scale in a perspective view.
export function projectedScale(camera,position,worldUnitsPerMetre,targetPixels=90){
  const a=camera.project(position),b=camera.project([position[0]+worldUnitsPerMetre,position[1],position[2]]);
  if(!a||!b)return null;
  const pixelsPerMetre=Math.hypot(a[0]-b[0],a[1]-b[1]);
  if(pixelsPerMetre<1e-9)return null;
  const metres=niceInterval(targetPixels/pixelsPerMetre);
  const end=camera.project([position[0]+metres*worldUnitsPerMetre,position[1],position[2]]);
  if(!end)return null;
  return {metres,pixels:Math.hypot(end[0]-a[0],end[1]-a[1])};
}
