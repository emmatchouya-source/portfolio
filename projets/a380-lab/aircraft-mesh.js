// Shared illustrative four-engine aircraft geometry. No aerodynamic calculations.
export function aircraftMesh(){
  const faces=[],ring=(x,r)=>Array.from({length:12},(_,i)=>[x,Math.cos(i*Math.PI/6)*r,Math.sin(i*Math.PI/6)*r*1.12]);
  const body=[[6.7,.03],[5.8,.46],[4.6,.72],[-3.8,.72],[-5.7,.4],[-6.6,.04]].map(([x,r])=>ring(x,r));
  for(let i=1;i<body.length;i++)for(let j=0;j<12;j++)faces.push({points:[body[i-1][j],body[i-1][(j+1)%12],body[i][(j+1)%12],body[i][j]],color:'#eaf2f6'});
  for(const sign of [-1,1]){
    const wing=[[1.6,sign*.5,-.12],[-1.5,sign*8.5,.28],[-2.9,sign*8.2,.28],[-2.9,sign*.7,-.12]];
    faces.push({points:wing,color:'#bed1dc'});
    // Match the two triangles used by the renderer, including wing dihedral.
    const wingHeight=(x,y)=>{
      for(const [a,b,c] of [[wing[0],wing[1],wing[2]],[wing[0],wing[2],wing[3]]]){
        const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
        const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det;
        const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det;
        if(u>=-1e-9&&v>=-1e-9&&u+v<=1+1e-9)return u*a[2]+v*b[2]+(1-u-v)*c[2];
      }
      throw new Error('Pylon attachment lies outside the wing');
    };
    faces.push({points:[[-4.5,sign*.45,.25],[-5.6,sign*3.1,.55],[-6.4,sign*3.05,.55],[-5.9,sign*.4,.25]],color:'#b4cdd7'});
    for(const [x,y] of [[1.1,2.9],[-.2,5.6]]){
      const engine=`${sign<0?'left':'right'}-${y<4?'inner':'outer'}`,z=-.65;
      const a=ring(x,.37).map(p=>[p[0],p[1]+sign*y,p[2]+z]),b=ring(x-1.9,.28).map(p=>[p[0],p[1]+sign*y,p[2]+z]);
      for(let j=0;j<12;j++)faces.push({points:[a[j],a[(j+1)%12],b[(j+1)%12],b[j]],color:'#98b7c9',part:'engine-nacelle',engine});
      faces.push({points:a,color:'#193649',part:'engine-nacelle',engine});
      // A solid swept pylon overlaps both surfaces slightly, so the engine
      // remains attached from every angle. Dimensions are illustrative.
      const top=[[-.65,-.09],[-1.65,-.09],[-1.65,.09],[-.65,.09]]
        .map(([dx,dy])=>[x+dx,sign*y+dy,wingHeight(x+dx,sign*y+dy)+.025]);
      const bottom=[[-.4,-.09],[-1.6,-.09],[-1.6,.09],[-.4,.09]]
        .map(([dx,dy])=>[x+dx,sign*y+dy,z+(.37+.09*dx/1.9)*1.12-Math.abs(dy)*1.12*Math.tan(Math.PI/12)-.025]);
      const pylon={color:'#afc5d1',part:'engine-pylon',engine};
      faces.push({...pylon,points:top},{...pylon,points:[...bottom].reverse()});
      for(let j=0;j<4;j++)faces.push({...pylon,points:[top[j],top[(j+1)%4],bottom[(j+1)%4],bottom[j]]});
    }
  }
  faces.push({points:[[-4.4,0,.48],[-5.6,0,3],[-6.5,0,3],[-6.4,0,.4]],color:'#219b8c'});
  // Six glazing panes follow the actual faceted nose surface. A single flat
  // windshield cuts through the convex fuselage and disappears under depth testing.
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  for(const [j,u0,u1,front,back] of [[1,.08,.48,.13,.68],[1,.54,.94,.09,.61],
    [2,.06,.94,.1,.57],[3,.06,.94,.1,.57],[4,.06,.46,.09,.61],[4,.52,.92,.13,.68]]){
    const a=body[1][j],b=body[1][j+1],d=body[2][j];
    const u=b.map((v,i)=>v-a[i]),v=d.map((q,i)=>q-a[i]);
    const n=[v[1]*u[2]-v[2]*u[1],v[2]*u[0]-v[0]*u[2],v[0]*u[1]-v[1]*u[0]],length=Math.hypot(...n);
    const surface=(angle,t)=>mix(mix(body[1][j],body[1][j+1],angle),mix(body[2][j],body[2][j+1],angle),t)
      .map((p,i)=>p+.012*n[i]/length);
    faces.push({points:[surface(u0,front),surface(u1,front),surface(u1,back),surface(u0,back)],color:'#203b52',part:'cockpit-glass'});
  }
  return faces;
}
