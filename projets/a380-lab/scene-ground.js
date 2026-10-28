// Rendering helpers only: all positions remain in the trajectory's local frame.
export function clipSegment(a,b,camera){
  const depth=p=>p.reduce((sum,v,i)=>sum+(v-camera.eye[i])*camera.forward[i],0),near=camera.near+.00001;
  const da=depth(a),db=depth(b);
  if(da<near&&db<near)return [];
  const intersect=()=>a.map((v,i)=>v+(b[i]-v)*(near-da)/(db-da));
  return [da<near?intersect():a,db<near?intersect():b];
}

export function clipPolygon(points,camera){
  const depth=p=>p.reduce((sum,v,i)=>sum+(v-camera.eye[i])*camera.forward[i],0),near=camera.near+.00001,out=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=depth(a),db=depth(b);
    if(da>=near)out.push(a);
    if((da>=near)!==(db>=near))out.push(a.map((v,j)=>v+(b[j]-v)*(near-da)/(db-da)));
  }
  return out;
}

export function clipScreenSegment(a,b,width,height){
  let enter=0,leave=1;
  for(const [axis,limit] of [[0,width],[1,height]]){
    const delta=b[axis]-a[axis];
    if(Math.abs(delta)<1e-12){if(a[axis]<0||a[axis]>limit)return [];continue;}
    let lo=-a[axis]/delta,hi=(limit-a[axis])/delta;
    if(lo>hi)[lo,hi]=[hi,lo];enter=Math.max(enter,lo);leave=Math.min(leave,hi);
    if(enter>leave)return [];
  }
  return [enter,leave].map(t=>[Math.max(0,Math.min(width,a[0]+t*(b[0]-a[0]))),Math.max(0,Math.min(height,a[1]+t*(b[1]-a[1])))]);
}

export function clipScreenPolygon(points,width,height){
  let result=points;
  for(const [axis,limit,sign] of [[0,0,1],[0,width,-1],[1,0,1],[1,height,-1]]){
    const next=[];
    for(let i=0;i<result.length;i++){
      const a=result[i],b=result[(i+1)%result.length],da=sign*(a[axis]-limit),db=sign*(b[axis]-limit);
      if(da>=0)next.push(a);
      if((da>=0)!==(db>=0))next.push([a[0]+(b[0]-a[0])*da/(da-db),a[1]+(b[1]-a[1])*da/(da-db)]);
    }
    result=next;
  }
  return result;
}

export function groundScreenPolygon(camera,width,height){
  if(camera.orthographic){
    const y=Math.max(0,camera.project([camera.eye[0],0,0])[1]);
    return y>=height?[]:[[0,y],[width,y],[width,height],[0,height]];
  }
  // Clip the screen by the infinite ground horizon, rather than projecting a finite slab.
  const rayZ=p=>camera.forward[2]+(p[0]-width/2)*camera.right[2]/camera.lens+(height*.53-p[1])*camera.up[2]/camera.lens;
  const corners=[[0,0],[width,0],[width,height],[0,height]],out=[];
  for(let i=0;i<4;i++){
    const a=corners[i],b=corners[(i+1)%4],da=rayZ(a),db=rayZ(b);
    if(da<=0)out.push(a);
    if((da<=0)!==(db<=0))out.push(a.map((v,j)=>v+(b[j]-v)*da/(da-db)));
  }
  return out;
}

function niceSpacing(value){
  const decade=10**Math.floor(Math.log10(Math.max(1,value))),u=value/decade;
  return (u<=1?1:u<=2?2:u<=5?5:10)*decade;
}

export function groundGrid({origin,scale,focus,eye,radius}){
  const extent=Math.max(radius*5,Math.abs(eye[2])*6,60),spacing=niceSpacing(extent/(20*scale));
  const cx=origin+focus[0]/scale,cy=focus[1]/scale,reach=extent/scale;
  const xmin=Math.floor((cx-reach)/spacing)*spacing,xmax=Math.ceil((cx+reach)/spacing)*spacing;
  const ymin=Math.floor((cy-reach)/spacing)*spacing,ymax=Math.ceil((cy+reach)/spacing)*spacing;
  const segments=[],labels=[];
  for(let x=xmin;x<=xmax+spacing*.01;x+=spacing){
    const local=(x-origin)*scale;
    segments.push({points:[[local,ymin*scale,0],[local,ymax*scale,0]],axis:false});
    labels.push({point:[local,-spacing*scale*.6,0],metres:x});
  }
  for(let y=ymin;y<=ymax+spacing*.01;y+=spacing)segments.push({points:[[(xmin-origin)*scale,y*scale,0],[(xmax-origin)*scale,y*scale,0]],axis:y===0});
  return {segments,labels,spacing};
}
