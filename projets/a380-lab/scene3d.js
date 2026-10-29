import {aircraftMesh} from './aircraft-mesh.js?v=1.4.0';
import {VERSION} from './model.js?v=1.4.0';
import {prepareTrajectory,sampleTrajectory,playbackCSV,clamp,perspectiveCamera,profileCamera,dot} from './trajectory.js?v=1.4.0';
import {PHASE_LABELS} from './airport-config.js?v=1.4.0';
import {phaseBudget} from './airport-report.js?v=1.4.0';
import {drawGroundShadow} from './shadow.js?v=1.4.0';
import {DepthMeshRenderer} from './depth-mesh.js?v=1.4.0';
import {clipSegment,clipPolygon,clipScreenSegment,clipScreenPolygon,groundScreenPolygon,groundGrid} from './scene-ground.js?v=1.4.0';
const $=id=>document.getElementById(id),RAD=Math.PI/180;
const f=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const clock=s=>{const t=Math.round(s);return [Math.floor(t/3600),Math.floor(t/60)%60,t%60].map(v=>String(v).padStart(2,'0')).join(':');};
const TEAL='#6ae0bf';
const put=(id,text)=>{const el=$(id);if(el.textContent!==text)el.textContent=text;};
function save(name,data,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
const MESH=aircraftMesh();
export class TrajectoryPlayer {
  constructor(){
    this.canvas=$('flightCanvas');this.ctx=this.canvas.getContext('2d');this.tracks={};this.active=null;this.time=0;this.playing=false;
    this.shadowMask=document.createElement('canvas');
    this.meshRenderer=new DepthMeshRenderer({onRestore:()=>this.invalidate()});
    this.visible=false;this.onScreen=false;this.frame=0;this.lastFrame=0;this.stale=false;this.view='orbit';this.zoom=1;this.yaw=-1.1;this.elevation=.48;this.pan=[0,0];this.points=new Map();
    $('flightPlay').onclick=()=>this.toggle();$('flightRestart').onclick=()=>this.seek(0,true);
    $('flightTimeline').oninput=e=>this.seek(Number(e.target.value));
    $('flightProfile').onchange=e=>{this.pause();this.active=this.tracks[e.target.value];this.time=Math.min(this.time,this.active?.seconds||0);this.profileDetails();this.sync();this.invalidate();};
    $('flightCamera').onchange=e=>this.preset(e.target.value);
    $('flightCompare').onchange=()=>this.invalidate();
    $('flightExaggeration').oninput=()=>{this.sync();this.invalidate();};
    $('flightTrueScale').onclick=()=>{this.preset('profile');};
    $('flightAmplify').onclick=()=>{if(this.view==='profile')this.preset('side');$('flightExaggeration').value=String(clamp(Math.round(this.distance*1000/this.height/4),2,400));this.sync();this.invalidate();};
    $('flightResetCamera').onclick=()=>this.preset(this.view);
    document.querySelectorAll('[data-flight-control]').forEach(b=>b.onclick=()=>this.cameraControl(b.dataset.flightControl));
    $('flightImage').onclick=()=>this.image();$('flightCSV').onclick=()=>{if(this.active)save('a380-trajectoire-3d.csv',playbackCSV(this.active,VERSION,this.model),'text/csv;charset=utf-8');};
    this.canvas.addEventListener('keydown',e=>{
      const action={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down','+':'in','=':'in','-':'out',r:'reset',R:'reset'}[e.key];
      if(action){e.preventDefault();this.cameraControl(action);}else if(e.code==='Space'){e.preventDefault();this.toggle();}
    });
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
    this.canvas.addEventListener('pointerdown',e=>{this.points.set(e.pointerId,[e.clientX,e.clientY]);this.canvas.setPointerCapture(e.pointerId);this.dragPan=this.view==='profile'||e.shiftKey||e.button===2;});
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
    this.active=this.tracks.baseline||this.tracks.recommended;this.time=0;this.stale=false;
    for(const option of $('flightProfile').options)option.disabled=!this.tracks[option.value];
    $('flightProfile').value=this.tracks.baseline?'baseline':'recommended';
    const all=Object.values(this.tracks).filter(Boolean);
    for(const option of $('flightCamera').options)if(['auto','departure','arrival'].includes(option.value))option.disabled=!this.active?.airport;
    $('flightSpeed').value=this.active?.airport?'auto':'300';
    this.distance=Math.max(1,...all.map(t=>t.distance));this.height=Math.max(10000,...all.flatMap(t=>t.rows.map(p=>p.h)));
    $('flightExaggeration').value='1';
    $('flightExample').hidden=Boolean(this.active)||!$('verificationCase');
    this.referenceFailure=(result.baseline?.reasons?.join(' ; ')||'Contraintes du modèle non respectées').replace(/[.\s]+$/,'');
    const failed=result.baseline?.lastPoint;
    if(failed)this.referenceFailure+=` (à ${f(failed.h)} m, ${f(failed.positionKm,1)} km : ${f(failed.thrust/1000,1)} kN requis, ${f(failed.available*snapshot.config.thrustLimit/1000,1)} kN autorisés par la marge d’étude)`;
    this.profileDetails();this.preset(this.active?.airport?'auto':'orbit');this.sync();this.invalidate();
  }
  profileDetails(){
    const active=this.active,c=this.snapshot.config,configured=this.tracks.baseline===active;
    const name=configured?'Profil configuré (référence)':'Profil optimisé (recommandé)';
    $('flightProfileNote').textContent=active?`${name} : ${active.events.length} montée(s), de ${f(active.rows[0].h)} à ${f(active.rows.at(-1).h)} m. `+(configured?'Les montées suivent les paramètres appliqués.':this.tracks.baseline?`Vous avez configuré ${c.steps} montée(s) dans la référence ; l’optimisation choisit son propre nombre de montées, dans la limite de ${c.maxSteps}.`:`Le profil configuré est non admissible : ${this.referenceFailure}. Seul le profil optimisé est disponible.`):`Profil configuré non admissible : ${this.referenceFailure}.`;
    if(active?.airport)$('flightProfileNote').textContent=`${name} : vol complet, du roulage à l’arrêt. ${active.events.length} montée(s) de croisière. Phases basse vitesse paramétriques non validées A380 ; les distances de piste ne sont pas des distances réglementaires.`;
    $('flightPhaseAudit').innerHTML=active?.phases?'<h4>Durée et carburant par phase du profil suivi</h4>'+phaseBudget(active.phases):'';
    $('flightPhaseAudit').hidden=!active?.phases;
    const table=$('flightClimbAudit');table.replaceChildren();
    if(active?.events.length){
      const heading=document.createElement('p');heading.className='hint';heading.textContent='Montées : distance, durée et carburant effectivement intégrés (carburant total sur la transition).';table.append(heading);
      const el=document.createElement('table');el.innerHTML='<thead><tr><th>Montée</th><th>Altitudes (m)</th><th>Départ / fin (km)</th><th>Durée</th><th>Carburant (kg)</th></tr></thead><tbody></tbody>';
      active.events.forEach((e,i)=>{const tr=el.tBodies[0].insertRow();[i+1,`${f(e.from)} → ${f(e.to)}`,`${f(e.x,1)} / ${f(e.endX,1)}`,clock(e.duration),f(e.burn,1)].forEach(text=>{tr.insertCell().textContent=text;});});table.append(el);
    }
    const container=$('flightStages');container.replaceChildren();
    if(active?.airport){
      const camera=phase=>['takeoff-roll','rotation','initial-climb'].includes(phase)?'departure':['approach','flare','landing-roll'].includes(phase)?'arrival':phase==='cruise'?'orbit':'follow';
      for(const phase of active.phases){const button=document.createElement('button');button.className='compact';button.textContent=PHASE_LABELS[phase.phase]??phase.phase;button.onclick=()=>{this.preset(camera(phase.phase));this.seek(phase.startSeconds,true);};container.append(button);}
      const stop=document.createElement('button');stop.className='compact';stop.textContent='Arrêt final';stop.onclick=()=>{this.preset('arrival');this.seek(active.seconds,true);};container.append(stop);
    }else if(active)for(const [i,p] of [active.rows[0],...active.events.map(e=>active.rows[e.index])].entries()){
      const button=document.createElement('button');button.className='compact';button.textContent=`Palier ${i+1} · ${f(p.h)} m`;
      button.onclick=()=>this.seek(p.seconds,true);container.append(button);
      if(i<active.events.length){const event=active.events[i],climb=document.createElement('button');climb.className='compact';climb.textContent=`Montée ${i+1} · milieu`;climb.onclick=()=>this.seek((event.seconds+(event.endSeconds??event.seconds))/2,true);container.append(climb);}
    }
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
  seek(time,pause=false){if(pause)this.pause();const end=this.active?.seconds||0;this.time=clamp(time,0,end);if(end-this.time<1e-6)this.time=end;this.lastFrame=0;this.sync();this.invalidate();}
  preset(view){
    if(view!==this.view||view==='profile')$('flightExaggeration').value='1';
    this.view=view;$('flightCamera').value=view;this.pan=[0,0];this.zoom=1;this.yaw=-1.1;this.elevation=.48;
    if(view==='top'){this.yaw=-Math.PI/2;this.elevation=1.53;}
    if(view==='side'){this.yaw=-Math.PI/2;this.elevation=.045;}
    if(view==='profile'){this.yaw=-Math.PI/2;this.elevation=0;}
    if(view==='follow'){this.yaw=-2.35;this.elevation=.3;}
    this.sync();this.invalidate();
  }
  cameraControl(action){
    if(action==='reset'){this.preset(this.view);return;}
    if(this.view==='profile'&&['left','right','up','down'].includes(action)){
      if(action==='left')this.pan[0]-=5/this.zoom;if(action==='right')this.pan[0]+=5/this.zoom;
      if(action==='up')this.pan[1]+=3/this.zoom;if(action==='down')this.pan[1]-=3/this.zoom;
      this.invalidate();return;
    }
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
    const factor=Number($('flightExaggeration').value),groundAngle=point&&point.gs>1?Math.atan2(point.roc||0,point.gs)/RAD:null;
    $('flightScale').textContent=`Altitude ×${factor} · ${this.view==='profile'?'profil fidèle':factor>1?'angles amplifiés':'échelles identiques'} · avion agrandi`;
    $('flightScale').classList.toggle('stale',factor>1);
    $('flightScaleWarning').hidden=factor===1;
    $('flightScaleWarning').textContent=`Altitude amplifiée ×${factor} : les angles dessinés sont déformés. Utilisez « Profil local fidèle » pour juger les pentes.`;
    $('flightExaggeration').disabled=this.view==='profile';
    $('flightSlopeNote').textContent=groundAngle===null?'Pente au sol : — (avion arrêté).':`Pente au sol calculée : ${f(groundAngle,2)}° (${f(Math.tan(groundAngle*RAD)*100,2)} %) · pente air γ : ${f((point.gamma||0)/RAD,2)}°. ${this.view==='profile'?'Projection de profil sans perspective, mêmes échelles horizontale et verticale.':'La perspective peut modifier l’angle apparent ; le profil local fidèle conserve les pentes.'}`;
    $('flightScaleValue').textContent='×'+$('flightExaggeration').value;
    $('flightEmpty').hidden=has;
    put('flightState',this.stale?'Paramètres modifiés · lecture de la dernière étude calculée':!has?'Aucune trajectoire admissible':this.playing?'Lecture en cours':this.time>=active.seconds?'Trajectoire terminée':'Lecture en pause');
    $('flightState').classList.toggle('stale',this.stale);
    $('flightPending').hidden=!this.stale;
    const values={Distance:point?.x,Altitude:point?.h,Mach:point?.mach,TAS:point?point.tas*3.6:null,Mass:point?point.mass/1000:null,Fuel:point?point.burn/1000:null,Alpha:point?.alpha,Stab:point?.stab,ROC:point?.roc,Gamma:point?point.gamma*180/Math.PI:null,Thrust:point?point.thrust/1000:null,Flow:point?.flow};
    for(const [key,value] of Object.entries(values))put('flight'+key,value==null?'—':f(value,['Mach','Alpha','Stab'].includes(key)?3:['Mass','Fuel','ROC','Gamma','Flow','Thrust'].includes(key)?2:0));
    put('flightStage',has?active.airport?`${PHASE_LABELS[point.phase]??point.phase} · écart latéral 0 m`:`${point.phase==='climb'?'Montée vers le palier '+(point.leg+2):'Palier '+(point.leg+1)} / ${active.events.length+1} · écart latéral 0 m`:'Calculer un profil admissible pour lancer la lecture.');
    $('flightAttitudeNote').textContent=point?.alpha==null?'Assiette affichée : pente de vol ; incidence non calculée dans ce mode.':'Assiette affichée : pente de vol + incidence équilibrée ; roulis et cap constants.';
    if(point?.model==='airport-parametric')$('flightAttitudeNote').textContent='Basse vitesse : rotation et arrondi illustratifs ; l’incidence et l’équilibre des moments ne sont pas identifiés. La position, la vitesse, les forces et le carburant proviennent du calcul.';
    $('flightModel').textContent=this.snapshot?(this.model.startsWith('project')?'Projet MGA803 · modèle reconstruit':this.model.startsWith('parametric')?'Modèle paramétrique · démonstration':'Tables de croisière importées'):'En attente de calcul';
    if(active?.airport)$('flightModel').textContent+=' + basses vitesses paramétriques';
    $('flightCompare').disabled=!this.tracks.recommended||!this.tracks.baseline;
  }
  invalidate(){if(!this.frame&&this.visible)this.frame=requestAnimationFrame(t=>this.draw(t));}
  draw(timestamp){
    this.frame=0;if(!this.visible)return;
    if(this.playing){
      const dt=this.lastFrame?clamp((timestamp-this.lastFrame)/1000,0,.2):0;this.lastFrame=timestamp;
      const automatic=$('flightSpeed').value==='auto',phase=sampleTrajectory(this.active,this.time)?.phase;
      const rate=automatic?({'takeoff-roll':2,rotation:1,'initial-climb':5,'departure-climb':120,cruise:300,climb:120,descent:120,approach:10,flare:1,'landing-roll':2}[phase]??300):Number($('flightSpeed').value);
      const boundary=automatic?this.active.phases?.find(p=>p.endSeconds>this.time+1e-7)?.endSeconds:undefined;
      this.time=Math.min(this.active.seconds,boundary??Infinity,this.time+dt*rate);
      if(this.time>=this.active.seconds)this.playing=false;
      this.sync();
    }
    const r=this.canvas.getBoundingClientRect(),w=r.width,h=r.height;if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2),c=this.ctx;
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
    c.setTransform(dpr,0,0,dpr,0,0);
    const point=sampleTrajectory(this.active,this.time),airport=this.active?.airport;
    const view=this.view==='auto'?(['takeoff-roll','rotation','initial-climb'].includes(point?.phase)?'departure':['approach','flare','landing-roll'].includes(point?.phase)?'arrival':'follow'):this.view;
    const local=view==='profile'||Boolean(airport)&&(['departure','arrival','follow'].includes(view));
    const origin=local?(view==='arrival'?this.snapshot.config.distance*1000:['follow','profile'].includes(view)?(point?.x||0)*1000-6000:0):0;
    const groundAltitude=local?(view==='arrival'?this.snapshot.config.arrElevation:view==='departure'?this.snapshot.config.depElevation:['approach','flare','landing-roll'].includes(point?.phase)?this.snapshot.config.arrElevation:['takeoff-roll','rotation','initial-climb'].includes(point?.phase)?this.snapshot.config.depElevation:0):0;
    const scale=240/(local?20000:((this.distance||4569)*1000)),exaggeration=Number($('flightExaggeration').value);
    const world=p=>[(p.x*1000-origin)*scale,0,(p.h-groundAltitude)*scale*exaggeration];
    const focus=(['follow','profile'].includes(view)||this.view==='auto')&&point?world(point):local?[view==='arrival'?12:35,0,6]:[120,0,(this.height||13000)*scale*exaggeration*.45];
    focus[0]+=this.pan[0];focus[2]+=this.pan[1];
    const verticalExtent=(this.height||13000)*scale*exaggeration;
    const radius=(local?110:view==='follow'?65:Math.max(260,240*h/w*1.8,verticalExtent*1.85))/this.zoom;
    const eye=focus.map((v,i)=>v+[radius*Math.cos(this.elevation)*Math.cos(this.yaw),radius*Math.cos(this.elevation)*Math.sin(this.yaw),radius*Math.sin(this.elevation)][i]);
    eye[2]=Math.max(1,eye[2]);
    const camera=view==='profile'?profileCamera(focus,w,h,120/this.zoom):perspectiveCamera(eye,focus,w,h),project=camera.project;
    const line=(points,color,width=1,dash=[])=>{
      c.beginPath();for(let i=1;i<points.length;i++){const segment=clipSegment(points[i-1],points[i],camera);if(!segment.length)continue;const projected=segment.map(project);if(projected.some(p=>!p))continue;const clipped=clipScreenSegment(...projected,w,h);if(clipped.length){c.moveTo(...clipped[0]);c.lineTo(...clipped[1]);}}
      c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.setLineDash([]);
    };
    const polygon=(points,fill,stroke)=>{const projected=clipPolygon(points,camera).map(project);if(projected.some(p=>!p))return;const a=clipScreenPolygon(projected,w,h);if(a.length<3)return;c.beginPath();a.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.45;c.stroke();}};
    const label=(p,text,color='#94b1c2',align='left')=>{const a=project(p);if(!a||a[0]<10||a[0]>w-12||a[1]<70||a[1]>h-65||(a[0]>w-90&&a[1]>h-240))return;c.fillStyle=color;c.font='11px Consolas, monospace';c.textAlign=align;c.fillText(text,a[0]+5,a[1]-7);c.textAlign='left';};
    const pos=point?world(point):null;
    const pitch=point?((point.visualPitch??point.alpha??0)*RAD+(point.gamma||0)):0,cp=Math.cos(pitch),sp=Math.sin(pitch),meshScale=local?0.25:1;
    const transform=v=>[pos[0]+meshScale*(v[0]*cp-v[2]*sp),pos[1]+meshScale*v[1],pos[2]+meshScale*(v[0]*sp+v[2]*cp)];
    const faces=point?MESH.map(face=>({...face,points:face.points.map(transform)})):[];
    const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#102337');sky.addColorStop(.6,'#173549');sky.addColorStop(1,'#102b39');c.fillStyle=sky;c.fillRect(0,0,w,h);
    const ground=groundScreenPolygon(camera,w,h),groundPaint=c.createLinearGradient(0,0,0,h);
    groundPaint.addColorStop(0,'#173549');groundPaint.addColorStop(1,'#16313b');
    if(ground.length){c.beginPath();ground.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=groundPaint;c.fill();}
    const grid=groundGrid({origin,scale,focus,eye,radius});
    for(const segment of grid.segments)line(segment.points,segment.axis?'#4c727d':'#294955',1);
    if(airport){
      const runway=(start,length,elevation,name)=>{
        const a=world({x:start/1000,h:elevation}),b=world({x:(start+length)/1000,h:elevation}),half=Math.max(.2,30*scale);
        polygon([[a[0],-half,a[2]+.03],[b[0],-half,b[2]+.03],[b[0],half,b[2]+.03],[a[0],half,a[2]+.03]],'#263c48','#9bb2bb');
        for(let x=0;x<length;x+=250){const d=world({x:(start+x)/1000,h:elevation}),e=world({x:(start+Math.min(length,x+100))/1000,h:elevation});line([d,e],'#dbe8e8',1.3);}
        label(a,name,'#d6e8e1');
      };
      runway(0,this.snapshot.config.tora,this.snapshot.config.depElevation,'DÉPART');
      runway(this.snapshot.config.distance*1000,this.snapshot.config.lda,this.snapshot.config.arrElevation,'ARRIVÉE');
    }
    if(point){
      const elevation=airport?(['approach','flare','landing-roll'].includes(point.phase)?this.snapshot.config.arrElevation:['takeoff-roll','rotation','initial-climb'].includes(point.phase)?this.snapshot.config.depElevation:0):0;
      drawGroundShadow(c,this.shadowMask,faces,{center:pos,groundZ:world({x:point.x,h:elevation})[2]+.04,heightMetres:point.h-elevation,worldScale:scale},project,w,h,dpr);
    }
    for(const marker of grid.labels)label(marker.point,f(marker.metres/1000,grid.spacing<1000?1:0)+' km');
    if(this.active){
      const tracks=$('flightCompare').checked?Object.values(this.tracks).filter(Boolean):[this.active];
      for(const track of tracks){
        const selected=track===this.active;
        line(track.renderRows.map(world),selected?'#78adab':'#7f94aa',selected?1.7:1.2,selected?[]:[5,5]);
        for(const event of track.events){
          const a=world({x:event.x,h:event.from}),b=world({x:event.endX??event.x,h:event.to});
          const segment=event.finite?track.renderRows.filter(p=>p.seconds>=event.seconds&&p.seconds<=event.endSeconds).map(world):[a,b];
          line(segment,selected?'#f1bb6a':'#8394aa',2);
          const eventScreen=project(b),aircraftScreen=project(world(point));
          if(selected&&this.view!=='follow'&&eventScreen&&aircraftScreen&&Math.hypot(eventScreen[0]-aircraftScreen[0],eventScreen[1]-aircraftScreen[1])>140)label(b,'Δh '+f(event.to-event.from)+' m · '+clock(event.duration||0),'#f1bb6a');
        }
      }
      const trail=this.active.renderRows.filter(p=>p.seconds<=this.time).map(world);trail.push(world(point));line(trail,TEAL,3);
      const ground=[pos[0],0,0];line([ground,pos],'#74c6b266',1,[4,5]);
      if(this.view!=='follow'){label(world(this.active.rows[0]),'DÉBUT',TEAL);label(world(this.active.rows.at(-1)),'FIN',TEAL,'right');}
      this.meshRenderer.draw(c,faces,camera,w,h,dpr);
      const p=project(pos);if(p){
        c.strokeStyle='#6ae0bf70';c.beginPath();c.arc(p[0],p[1],this.view==='follow'?65:22,0,Math.PI*2);c.stroke();c.fillStyle='#b7e9de';c.font='11px Consolas, monospace';
        const x=clamp(p[0]+(this.view==='follow'?-40:28),12,w-185),y=p[1]-(this.view==='follow'?82:26);
        c.fillText('A380 · '+f(point.h)+' m',x,y);c.fillText(f(point.x,1)+' km · '+f(point.gs*3.6)+' km/h sol',x,y+14);
      }
      const z=(this.height||13000)*scale*exaggeration;
      if(this.view!=='follow'&&!local){
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
    ctx.fillText('Croisière longitudinale ; montées de durée finie ; modèle non validé en vol.',20,this.canvas.height+82);
    canvas.toBlob(blob=>{if(blob)save('a380-trajectoire-3d.png',blob,'image/png');},'image/png');
  }
}
