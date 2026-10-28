import {VERSION} from './model.js';
import {prepareTrajectory,sampleTrajectory,playbackCSV,clamp,perspectiveCamera,dot,cross} from './trajectory.js';
const $=id=>document.getElementById(id),RAD=Math.PI/180;
const f=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const clock=s=>{const t=Math.round(s);return [Math.floor(t/3600),Math.floor(t/60)%60,t%60].map(v=>String(v).padStart(2,'0')).join(':');};
const TEAL='#6ae0bf';
const put=(id,text)=>{const el=$(id);if(el.textContent!==text)el.textContent=text;};
function save(name,data,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function aircraftMesh(){
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
const MESH=aircraftMesh();
function shaded(color,normal){
  const n=Math.hypot(...normal)||1,light=clamp(.72+.27*Math.abs(dot(normal,[-.3,-.4,.86]))/n,.6,1);
  return '#'+[1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*light).toString(16).padStart(2,'0')).join('');
}
export class TrajectoryPlayer {
  constructor(){
    this.canvas=$('flightCanvas');this.ctx=this.canvas.getContext('2d');this.tracks={};this.active=null;this.time=0;this.playing=false;
    this.visible=false;this.onScreen=false;this.frame=0;this.lastFrame=0;this.stale=false;this.view='orbit';this.zoom=1;this.yaw=-1.1;this.elevation=.48;this.pan=[0,0];this.points=new Map();
    $('flightPlay').onclick=()=>this.toggle();$('flightRestart').onclick=()=>this.seek(0,true);
    $('flightTimeline').oninput=e=>this.seek(Number(e.target.value));
    $('flightProfile').onchange=e=>{this.pause();this.active=this.tracks[e.target.value];this.time=Math.min(this.time,this.active?.seconds||0);this.sync();this.invalidate();};
    $('flightCamera').onchange=e=>this.preset(e.target.value);
    $('flightCompare').onchange=()=>this.invalidate();
    $('flightExaggeration').oninput=()=>{this.sync();this.invalidate();};
    $('flightResetCamera').onclick=()=>this.preset(this.view);
    document.querySelectorAll('[data-flight-control]').forEach(b=>b.onclick=()=>this.cameraControl(b.dataset.flightControl));
    $('flightImage').onclick=()=>this.image();$('flightCSV').onclick=()=>{if(this.active)save('a380-trajectoire-3d.csv',playbackCSV(this.active,VERSION,this.model),'text/csv;charset=utf-8');};
    this.canvas.addEventListener('keydown',e=>{
      const action={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down','+':'in','=':'in','-':'out',r:'reset',R:'reset'}[e.key];
      if(action){e.preventDefault();this.cameraControl(action);}else if(e.code==='Space'){e.preventDefault();this.toggle();}
    });
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
    this.canvas.addEventListener('pointerdown',e=>{this.points.set(e.pointerId,[e.clientX,e.clientY]);this.canvas.setPointerCapture(e.pointerId);this.dragPan=e.shiftKey||e.button===2;});
    this.canvas.addEventListener('pointermove',e=>{
      const old=this.points.get(e.pointerId);if(!old)return;
      const others=[...this.points.entries()].filter(([id])=>id!==e.pointerId);
      if(others.length){const p=others[0][1],before=Math.hypot(old[0]-p[0],old[1]-p[1]),after=Math.hypot(e.clientX-p[0],e.clientY-p[1]);if(before>4)this.zoom=clamp(this.zoom*after/before,.5,8);}
      else if(this.dragPan){this.pan[0]=clamp(this.pan[0]-(e.clientX-old[0])*.15/this.zoom,-200,200);this.pan[1]=clamp(this.pan[1]+(e.clientY-old[1])*.15/this.zoom,-100,100);}
      else{this.yaw-=(e.clientX-old[0])*.007;this.elevation=clamp(this.elevation+(e.clientY-old[1])*.005,.035,1.54);}
      this.points.set(e.pointerId,[e.clientX,e.clientY]);this.invalidate();
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(event,e=>this.points.delete(e.pointerId));
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=clamp(this.zoom*Math.exp(-e.deltaY*.001),.5,8);this.invalidate();},{passive:false});
    new ResizeObserver(()=>this.invalidate()).observe(this.canvas);
    new IntersectionObserver(entries=>{this.onScreen=entries[0].isIntersecting;if(!this.onScreen)this.pause();else this.invalidate();},{threshold:.05}).observe(this.canvas);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
    this.sync();
  }
  setStudy(result,snapshot){
    this.pause();this.snapshot=snapshot;
    this.tracks={recommended:prepareTrajectory(result.best,'Recommandé'),baseline:prepareTrajectory(result.baseline,'Référence')};
    this.model=snapshot.tables?.schema==='a380-project/v1'?'project-data/reconstructed-unvalidated':snapshot.tables?'user-supplied/unvalidated':'parametric-demonstration/unvalidated';
    this.active=this.tracks.recommended||this.tracks.baseline;this.time=0;this.stale=false;
    for(const option of $('flightProfile').options)option.disabled=!this.tracks[option.value];
    $('flightProfile').value=this.tracks.recommended?'recommended':'baseline';
    const all=Object.values(this.tracks).filter(Boolean);
    this.distance=Math.max(1,...all.map(t=>t.distance));this.height=Math.max(10000,...all.flatMap(t=>t.rows.map(p=>p.h)));
    $('flightExaggeration').value=String(clamp(Math.round(this.distance*1000/this.height/4),1,400));
    $('flightExample').hidden=Boolean(this.active)||!$('verificationCase');
    this.preset('orbit');this.sync();this.invalidate();
  }
  setStale(value){this.stale=value;this.sync();}
  setVisible(value){this.visible=value;if(!value)this.pause();else this.invalidate();}
  pause(){this.playing=false;this.lastFrame=0;this.sync();}
  toggle(){
    if(!this.active||!this.visible||document.hidden)return;
    if(!this.onScreen)this.canvas.scrollIntoView({block:'center'});
    if(this.playing){this.pause();return;}
    if(this.time>=this.active.seconds)this.time=0;
    this.playing=true;this.lastFrame=0;this.sync();this.invalidate();
  }
  seek(time,pause=false){if(pause)this.pause();this.time=clamp(time,0,this.active?.seconds||0);this.lastFrame=0;this.sync();this.invalidate();}
  preset(view){this.view=view;$('flightCamera').value=view;this.pan=[0,0];this.zoom=1;this.yaw=-1.1;this.elevation=.48;
    if(view==='top'){this.yaw=-Math.PI/2;this.elevation=1.53;}
    if(view==='side'){this.yaw=-Math.PI/2;this.elevation=.045;}
    if(view==='follow'){this.yaw=-2.35;this.elevation=.3;}
    this.invalidate();
  }
  cameraControl(action){
    if(action==='reset'){this.preset(this.view);return;}
    if(action==='in')this.zoom=clamp(this.zoom*1.25,.5,8);if(action==='out')this.zoom=clamp(this.zoom/1.25,.5,8);
    if(action==='left')this.yaw+=.15;if(action==='right')this.yaw-=.15;
    if(action==='up')this.elevation=clamp(this.elevation+.1,.035,1.54);if(action==='down')this.elevation=clamp(this.elevation-.1,.035,1.54);
    this.invalidate();
  }
  sync(){
    const active=this.active,point=sampleTrajectory(active,this.time),has=Boolean(point);
    for(const id of ['flightPlay','flightRestart','flightTimeline','flightProfile','flightCSV'])$(id).disabled=!has;
    put('flightPlay',this.playing?'Ⅱ Pause':'▶ Lire');$('flightPlay').setAttribute('aria-pressed',String(this.playing));
    $('flightTimeline').max=String(active?.seconds||1);$('flightTimeline').value=String(this.time);
    $('flightTimeline').setAttribute('aria-valuetext',has?`${clock(this.time)} sur ${clock(active.seconds)}, altitude ${f(point.h)} mètres`:'Aucune trajectoire admissible');
    $('flightTime').textContent=has?`${clock(this.time)} / ${clock(active.seconds)}`:'— / —';
    $('flightScale').textContent=`Altitude ×${$('flightExaggeration').value} · avion agrandi`;
    $('flightScaleValue').textContent='×'+$('flightExaggeration').value;
    $('flightEmpty').hidden=has;
    put('flightState',this.stale?'Paramètres modifiés · lecture de la dernière étude calculée':!has?'Aucune trajectoire admissible':this.playing?'Lecture en cours':this.time>=active.seconds?'Trajectoire terminée':'Lecture en pause');
    $('flightState').classList.toggle('stale',this.stale);
    const values={Distance:point?.x,Altitude:point?.h,Mach:point?.mach,TAS:point?point.tas*3.6:null,Mass:point?point.mass/1000:null,Fuel:point?point.burn/1000:null,Alpha:point?.alpha,Stab:point?.stab};
    for(const [key,value] of Object.entries(values))put('flight'+key,value==null?'—':f(value,['Mach','Alpha','Stab'].includes(key)?3:['Mass','Fuel'].includes(key)?2:0));
    put('flightStage',has?`Palier ${point.leg+1} / ${active.events.length+1} · écart latéral 0 m`:'Calculer un profil admissible pour lancer la lecture.');
    $('flightAttitudeNote').textContent=point?.alpha==null?'Attitude non calculée dans ce mode : avion présenté horizontalement.':'Attitude affichée : incidence équilibrée du modèle ; roulis et cap constants.';
    $('flightModel').textContent=this.snapshot?(this.model.startsWith('project')?'Projet MGA803 · modèle reconstruit':this.model.startsWith('parametric')?'Modèle paramétrique · démonstration':'Tables de croisière importées'):'En attente de calcul';
    $('flightCompare').disabled=!this.tracks.recommended||!this.tracks.baseline;
  }
  invalidate(){if(!this.frame&&this.visible)this.frame=requestAnimationFrame(t=>this.draw(t));}
  draw(timestamp){
    this.frame=0;if(!this.visible)return;
    if(this.playing){
      const dt=this.lastFrame?clamp((timestamp-this.lastFrame)/1000,0,.2):0;this.lastFrame=timestamp;
      this.time=Math.min(this.active.seconds,this.time+dt*Number($('flightSpeed').value));
      if(this.time>=this.active.seconds)this.playing=false;
      this.sync();
    }
    const r=this.canvas.getBoundingClientRect(),w=r.width,h=r.height;if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2),c=this.ctx;
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
    c.setTransform(dpr,0,0,dpr,0,0);
    const scale=240/((this.distance||4569)*1000),exaggeration=Number($('flightExaggeration').value);
    const world=p=>[p.x*1000*scale,0,p.h*scale*exaggeration],point=sampleTrajectory(this.active,this.time);
    const focus=this.view==='follow'&&point?world(point):[120,0,(this.height||13000)*scale*exaggeration*.45];
    focus[0]+=this.pan[0];focus[2]+=this.pan[1];
    const verticalExtent=(this.height||13000)*scale*exaggeration;
    const radius=(this.view==='follow'?65:Math.max(260,240*h/w*1.8,verticalExtent*1.85))/this.zoom;
    const eye=focus.map((v,i)=>v+[radius*Math.cos(this.elevation)*Math.cos(this.yaw),radius*Math.cos(this.elevation)*Math.sin(this.yaw),radius*Math.sin(this.elevation)][i]);
    const camera=perspectiveCamera(eye,focus,w,h),project=camera.project;
    const line=(points,color,width=1,dash=[])=>{
      c.beginPath();let open=false;for(const p of points){const a=project(p);if(!a){open=false;continue;}if(open)c.lineTo(a[0],a[1]);else{c.moveTo(a[0],a[1]);open=true;}}
      c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.setLineDash([]);
    };
    const polygon=(points,fill,stroke)=>{const a=points.map(project);if(a.some(p=>!p))return;c.beginPath();a.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.45;c.stroke();}};
    const label=(p,text,color='#94b1c2',align='left')=>{const a=project(p);if(!a||a[0]<10||a[0]>w-12||a[1]<70||a[1]>h-65||(a[0]>w-90&&a[1]>h-240))return;c.fillStyle=color;c.font='11px Consolas, monospace';c.textAlign=align;c.fillText(text,a[0]+5,a[1]-7);c.textAlign='left';};
    const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#102337');sky.addColorStop(.6,'#173549');sky.addColorStop(1,'#102b39');c.fillStyle=sky;c.fillRect(0,0,w,h);
    polygon([[-60,-90,0],[300,-90,0],[300,90,0],[-60,90,0]],'#16313b');
    for(let x=-40;x<=280;x+=20)line([[x,-90,0],[x,90,0]],x%60===0?'#365361':'#24424e');
    for(let y=-80;y<=80;y+=20)line([[-40,y,0],[280,y,0]],y===0?'#4c727d':'#24424e',1);
    if(this.view!=='follow'){
      for(let i=0;i<=4;i++){const x=i*60;label([x,-30,0],f((this.distance||4569)*i/4)+' km');}
      label([0,-42,0],'DISTANCE LONGITUDINALE','#a1bac8');
    }
    if(this.active){
      const tracks=$('flightCompare').checked?Object.values(this.tracks).filter(Boolean):[this.active];
      for(const track of tracks){
        const selected=track===this.active;
        line(track.rows.map(world),selected?'#78adab':'#7f94aa',selected?1.7:1.2,selected?[]:[5,5]);
        for(const event of track.events){
          const a=world({x:event.x,h:event.from}),b=world({x:event.x,h:event.to});line([a,b],selected?'#f1bb6a':'#8394aa',2,[3,4]);
          const eventScreen=project(b),aircraftScreen=project(world(point));
          if(selected&&this.view!=='follow'&&eventScreen&&aircraftScreen&&Math.hypot(eventScreen[0]-aircraftScreen[0],eventScreen[1]-aircraftScreen[1])>140)label(b,'Δh '+f(event.to-event.from)+' m · Δt 0 s','#f1bb6a');
        }
      }
      const trail=this.active.rows.filter(p=>p.seconds<=this.time).map(world);trail.push(world(point));line(trail,TEAL,3);
      const pos=world(point),ground=[pos[0],0,0];line([ground,pos],'#74c6b266',1,[4,5]);
      const groundScreen=project(ground);if(groundScreen){c.fillStyle='#00000035';c.beginPath();c.ellipse(groundScreen[0],groundScreen[1],16,5,0,0,2*Math.PI);c.fill();}
      if(this.view!=='follow'){label(world(this.active.rows[0]),'DÉBUT',TEAL);label(world(this.active.rows.at(-1)),'FIN',TEAL,'right');}
      const pitch=(point.alpha||0)*RAD,cp=Math.cos(pitch),sp=Math.sin(pitch);
      const transform=v=>[pos[0]+v[0]*cp-v[2]*sp,pos[1]+v[1],pos[2]+v[0]*sp+v[2]*cp];
      const faces=MESH.map(face=>{const points=face.points.map(transform);return {...face,points,depth:points.reduce((sum,p)=>sum+(project(p)?.[2]||0),0)/points.length};}).sort((a,b)=>b.depth-a.depth);
      for(const face of faces){const [a,b,d]=face.points,normal=cross(b.map((v,i)=>v-a[i]),d.map((v,i)=>v-a[i]));polygon(face.points,shaded(face.color,normal),'#25465655');}
      const p=project(pos);if(p){c.strokeStyle='#6ae0bf70';c.beginPath();c.arc(p[0],p[1],this.view==='follow'?65:22,0,Math.PI*2);c.stroke();c.fillStyle='#b7e9de';c.font='11px Consolas, monospace';c.fillText('A380 · '+f(point.h)+' m',clamp(p[0]+(this.view==='follow'?-40:28),12,w-130),p[1]-(this.view==='follow'?82:26));}
      const z=(this.height||13000)*scale*exaggeration;
      if(this.view!=='follow'){
        line([[0,22,0],[0,22,z]],'#698f9e',1,[3,5]);
        const bottom=project([0,22,0]),top=project([0,22,z]);
        if(bottom&&top&&Math.hypot(top[0]-bottom[0],top[1]-bottom[1])>90)for(let i=0;i<=3;i++)label([0,22,z*i/3],f((this.height||13000)*i/3)+' m');
        else label([0,22,z],'Altitude max. '+f(this.height||13000)+' m');
      }
    }
    // View orientation uses the same camera basis as the aircraft and trajectory.
    const cx=w-50,cy=h-45;c.font='10px Consolas, monospace';
    for(const [v,name,col] of [[[1,0,0],'X','#9dbdd3'],[[0,1,0],'Y','#80c9b5'],[[0,0,1],'Z','#f1bb6a']]){
      const dx=dot(v,camera.right)*28,dy=-dot(v,camera.up)*28;c.strokeStyle=col;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+dx,cy+dy);c.stroke();c.fillStyle=col;c.fillText(name,cx+dx+3,cy+dy-3);
    }
    c.fillStyle='#90adbd';c.font='10px Consolas, monospace';c.fillText('REPÈRE LOCAL · SOL SCHÉMATIQUE',18,h-16);
    if(this.playing)this.invalidate();
  }
  image(){
    if(!this.visible)return;
    this.pause();this.draw(performance.now());
    const canvas=document.createElement('canvas');canvas.width=this.canvas.width;canvas.height=this.canvas.height+120;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#102337';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(this.canvas,0,0);
    const point=sampleTrajectory(this.active,this.time);ctx.fillStyle='#e3eef4';ctx.font='16px Consolas, monospace';
    ctx.fillText(`A380 Cruise Lab ${VERSION} | ${$('flightModel').textContent}`,20,this.canvas.height+28);
    ctx.fillText(`${this.active?.label||'Aucune trajectoire'} | ${clock(this.time)} | ${f(point?.x)} km | ${f(point?.h)} m | ${$('flightScale').textContent}`,20,this.canvas.height+55);
    ctx.fillText('Croisière longitudinale ; montées instantanées ; modèle non validé en vol.',20,this.canvas.height+82);
    canvas.toBlob(blob=>{if(blob)save('a380-trajectoire-3d.png',blob,'image/png');},'image/png');
  }
}
