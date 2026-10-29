// Shared illustrative four-engine aircraft geometry. No aerodynamic calculations.
export function aircraftMesh(){
  const faces=[],ring=(x,r)=>Array.from({length:12},(_,i)=>[x,Math.cos(i*Math.PI/6)*r,Math.sin(i*Math.PI/6)*r*1.12]);
  const body=[[6.7,.03],[5.8,.46],[4.6,.72],[-3.8,.72],[-5.7,.4],[-6.6,.04]].map(([x,r])=>ring(x,r));
  for(let i=1;i<body.length;i++)for(let j=0;j<12;j++)faces.push({points:[body[i-1][j],body[i-1][(j+1)%12],body[i][(j+1)%12],body[i][j]],color:'#eaf2f6'});
  for(const sign of [-1,1]){
    faces.push({points:[[1.6,sign*.5,-.12],[-1.5,sign*8.5,.28],[-2.9,sign*8.2,.28],[-2.9,sign*.7,-.12]],color:'#bed1dc'});
    faces.push({points:[[-4.5,sign*.45,.25],[-5.6,sign*3.1,.55],[-6.4,sign*3.05,.55],[-5.9,sign*.4,.25]],color:'#b4cdd7'});
    for(const [x,y] of [[1.1,2.9],[-.2,5.6]]){
      const a=ring(x,.37).map(p=>[p[0],p[1]+sign*y,p[2]-.85]),b=ring(x-1.9,.28).map(p=>[p[0],p[1]+sign*y,p[2]-.85]);
      for(let j=0;j<12;j++)faces.push({points:[a[j],a[(j+1)%12],b[(j+1)%12],b[j]],color:'#98b7c9'});
      faces.push({points:a,color:'#193649'});
    }
  }
  faces.push({points:[[-4.4,0,.48],[-5.6,0,3],[-6.5,0,3],[-6.4,0,.4]],color:'#219b8c'});
  faces.push({points:[[5.9,-.37,.27],[5.2,-.58,.42],[5.2,.58,.42],[5.9,.37,.27]],color:'#203b52'});
  return faces;
}
