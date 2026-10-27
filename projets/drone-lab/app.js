import {Simulation,config,DEFAULTS,PRESETS,DT} from './core.js';
import {norm,sub,euler} from './math.js';
import {Scene,drawAttitude,drawChart,chartSpec,COLORS} from './renderer.js';
import {configuration,csv,report,generateC,download} from './exports.js';
import {BOARDS} from './boards.js';
import {customBoard,arduinoZip} from './arduino.js';

const $=id=>document.getElementById(id),labels={hover:'VOL STATIONNAIRE',square:'CIRCUIT CARRÉ',circle:'ORBITE CIRCULAIRE',eight:'TRAJECTOIRE EN HUIT',waypoints:'POINTS DE PASSAGE'};
const fields={
  mission:[['altitude','Altitude cible','m',1,15,.5],['radius','Dimension du circuit','m',2,12,.5],['speed','Vitesse maximale','m/s',.5,8,.5]],
  environment:[['wind','Vent moyen','m/s',0,12,.5],['windDirection','Direction du vent','°',0,360,5],['gust','Amplitude des rafales','m/s',0,6,.1],['fence','Rayon de la zone de vol','m',20,60,1],['ceiling','Plafond de vol','m',16,30,1]],
  aircraft:[['mass','Masse totale','kg',.1,10,.05],['arm','Centre → moteur','m',.07,.7,.01],['thrust','Poussée max / moteur','N',.5,80,.1],['motorTau','Constante moteur','s',.01,.2,.005],['yawRatio','Couple / poussée','m',.005,.05,.001],['drag','Coefficient de traînée','kg/m',0,1,.01],['ix','Inertie Ixx','kg·m²',.0001,2,.0001],['iy','Inertie Iyy','kg·m²',.0001,2,.0001],['iz','Inertie Izz','kg·m²',.0001,2,.0001],['batteryMah','Capacité batterie','mAh',200,25000,50]],
  control:[['posP','Position · Kp','s⁻¹',.1,4,.1],['velP','Vitesse · Kp','s⁻¹',.1,8,.1],['velI','Vitesse · Ki','s⁻²',0,2,.05],['attP','Attitude · Kp','s⁻¹',.5,12,.5],['rateP','Rotation · Kp','s⁻¹',1,45,1],['rateI','Rotation · Ki','s⁻²',0,25,.5],['rateD','Rotation · Kd','—',0,.5,.01],['tilt','Inclinaison maximale','°',5,45,1]],
  sensor:[['noise','Niveau de bruit','×',0,3,.1],['seed','Graine aléatoire','—',0,4294967295,1]]
};
for(const [group,items] of Object.entries(fields))for(const [key,label,unit,min,max,step] of items){const el=document.createElement('label');el.className='field';el.htmlFor=key;el.append(document.createTextNode(label));const wrap=document.createElement('span');wrap.className='input-wrap';const input=document.createElement('input');Object.assign(input,{id:key,type:'number',min,max,step});input.required=true;const suffix=document.createElement('small');suffix.textContent=unit;wrap.append(input,suffix);el.append(wrap);$(`${group}-fields`).append(el);}

let waypoints=[[0,0,5],[6,0,5],[6,6,5],[0,0,5]],sim,playing=false,dirty=false,accumulator=0,last=performance.now(),lastUi=0,lastEvents=-1,toastTimer;
const scene=new Scene($('scene'));
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?7000:3500);}
function markDirty(){dirty=true;$('dirtyBadge').hidden=false;}
function choosePanel(name){document.querySelectorAll('[data-panel]').forEach(b=>{const active=b.dataset.panel===name;b.classList.toggle('active',active);b.setAttribute('aria-selected',active);});document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${name}`));}
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>choosePanel(b.dataset.panel)));
$('openExport').onclick=()=>{choosePanel('export');if(innerWidth<=720)$('panel-export').scrollIntoView({behavior:'smooth',block:'center'});};
function showWaypointEditor(){$('waypointEditor').hidden=$('mission').value!=='waypoints';}
function renderWaypoints(){
  $('waypointList').replaceChildren();waypoints.forEach((p,i)=>{const row=document.createElement('div');row.className='waypoint-row';p.forEach((v,j)=>{const input=document.createElement('input');Object.assign(input,{type:'number',value:v,step:.5});input.setAttribute('aria-label',`Point ${i+1}, ${['Est','Nord','Altitude'][j]}`);input.onchange=()=>{waypoints[i][j]=Number(input.value);markDirty();};row.append(input);});const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`Supprimer le point ${i+1}`);remove.onclick=()=>{waypoints.splice(i,1);renderWaypoints();markDirty();};row.append(remove);$('waypointList').append(row);});
}
$('addWaypoint').onclick=()=>{if(waypoints.length>=30){toast('Maximum : 30 points.',true);return;}waypoints.push([0,0,Number($('altitude').value)||5]);renderWaypoints();markDirty();};
function fill(c){for(const items of Object.values(fields))for(const [key] of items)$(key).value=({ix:c.inertia[0],iy:c.inertia[1],iz:c.inertia[2]})[key]??c[key];$('mission').value=c.mission;$('feedback').value=c.feedback;showWaypointEditor();renderWaypoints();}
function read(){const c={};for(const items of Object.values(fields))for(const [key] of items){if(!$(key).checkValidity())throw Error(`Vérifie le champ « ${$(key).closest('label').firstChild.textContent} ».`);c[key]=Number($(key).value);}c.inertia=[c.ix,c.iy,c.iz];delete c.ix;delete c.iy;delete c.iz;c.mission=$('mission').value;c.feedback=$('feedback').value;return config(c);}
function newSim(c,wp=waypoints){const next=new Simulation(c,wp);sim=next;playing=false;accumulator=0;lastEvents=-1;dirty=false;$('dirtyBadge').hidden=true;$('gpsDropout').checked=false;$('motorFailure').value='-1';$('missionLabel').textContent=labels[c.mission];try{localStorage.setItem('droneLabConfig',JSON.stringify(configuration(sim)));}catch{/* Storage may be disabled. */}updateUi();scene.draw(sim);drawChart($('chart'),sim.history,$('chartType').value);}
function apply(){try{newSim(read());toast('Configuration appliquée. Prêt pour un nouvel essai.');}catch(e){toast(e.message,true);}}
$('applyConfig').onclick=apply;
$('defaults').onclick=()=>{waypoints=[[0,0,5],[6,0,5],[6,6,5],[0,0,5]];fill(DEFAULTS);$('preset').value='standard';newSim(DEFAULTS);toast('Paramètres initiaux restaurés.');};
for(const el of document.querySelectorAll('.panel input:not([type=file]),.panel select'))if(!el.closest('#panel-hardware')&&!['gpsDropout','motorFailure','preset'].includes(el.id))el.addEventListener('input',markDirty);
$('mission').addEventListener('change',showWaypointEditor);
$('preset').onchange=()=>{for(const [key,value] of Object.entries(PRESETS[$('preset').value])){if(key==='inertia'){['ix','iy','iz'].forEach((id,i)=>$(id).value=value[i]);}else if($(key))$(key).value=value;}markDirty();};
$('play').onclick=()=>{
  if(dirty){toast('Applique les paramètres pour commencer un nouvel essai.',true);return;}
  if(['landed','crashed'].includes(sim.mode)){newSim(sim.c);}
  if(sim.mode==='ready')sim.start();playing=!playing;accumulator=0;updateUi();
};
$('reset').onclick=()=>{waypoints=sim.waypoints.map(p=>[...p]);fill(sim.c);newSim(sim.c,waypoints);};
$('hold').onclick=()=>{if(sim.mode==='hold')sim.resume();else sim.holdPosition();updateUi();};
$('rtl').onclick=()=>{sim.rtl();updateUi();};$('land').onclick=()=>{sim.land();updateUi();};
$('disturb').onclick=()=>{if(sim.mode==='ready')return;sim.disturb();updateUi();};
$('gpsDropout').onchange=()=>{sim.dropout=$('gpsDropout').checked;sim.log(sim.dropout?'Défaut injecté : GNSS coupé':'GNSS rétabli');updateUi();};
$('motorFailure').onchange=()=>{sim.failedMotor=Number($('motorFailure').value);sim.log(sim.failedMotor>=0?`Défaut injecté : moteur ${sim.failedMotor+1}`:'Tous les moteurs rétablis');updateUi();};
$('orbitView').onclick=()=>{scene.top=false;setView();};$('topView').onclick=()=>{scene.top=true;setView();};$('followView').onclick=()=>{scene.follow=!scene.follow;setView();};$('resetView').onclick=()=>{scene.reset();setView();};
function setView(){$('orbitView').classList.toggle('active',!scene.top);$('topView').classList.toggle('active',scene.top);$('followView').classList.toggle('active',scene.follow);$('followView').setAttribute('aria-pressed',scene.follow);}
function legend(){const spec=chartSpec($('chartType').value);$('chartLegend').replaceChildren();spec.labels.forEach((label,i)=>{const span=document.createElement('span'),mark=document.createElement('i');mark.style.borderColor=COLORS[i];span.append(mark,document.createTextNode(label));$('chartLegend').append(span);});}
$('chartType').onchange=()=>{legend();drawChart($('chart'),sim.history,$('chartType').value);};legend();
for(let i=0;i<4;i++){const el=document.createElement('div');el.className='motor-item';el.innerHTML=`M${i+1}<div><i></i></div><b>0.0 N</b>`;$('motorBars').append(el);}
const clock=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`;
function updateUi(){
  const s=sim.s,err=norm(sub(sim.target.p,s.p)),angles=euler(s.q).map(v=>v*180/Math.PI),finished=['landed','crashed'].includes(sim.mode),started=sim.mode!=='ready';
  $('play').textContent=finished?'↺ Nouvel essai':playing?'Ⅱ Pause':started?'▶ Reprendre':'▶ Lancer la mission';
  for(const id of ['hold','rtl','land','disturb'])$(id).disabled=!started||finished;
  $('hold').textContent=sim.mode==='hold'?'Poursuivre':'Maintenir';
  $('flightStatus').textContent=sim.mode==='ready'?'Prêt au décollage':`${sim.phase}${!playing&&!finished?' · pause':''}`;$('elapsed').textContent=clock(sim.t);
  $('statusDot').style.background=sim.mode==='crashed'?'#f08f75':!playing?'#f1b36c':'#5ee0bc';
  const value=(id,n,unit,digits=2)=>$(id).innerHTML=`${n.toFixed(digits)} <small>${unit}</small>`;
  value('altitudeValue',s.p[2],'m');value('speedValue',norm(s.v),'m/s');value('errorValue',err,'m');value('rmsValue',sim.rms,'m');value('estValue',norm(sub(sim.estimate.p,s.p)),'m');value('batteryValue',sim.battery*100,'%',0);value('saturationValue',100*sim.metrics.saturation/(sim.metrics.samples||1),'%',1);
  $('powerValue').textContent=`${sim.voltage.toFixed(1)} V · ${sim.current.toFixed(1)} A`;$('feedbackStatus').textContent=sim.c.feedback==='truth'?'ÉTAT EXACT':'CAPTEURS';
  $('gpsStatus').textContent=sim.dropout?'PERDU':'ACTIF';$('gpsStatus').classList.toggle('amber-text',sim.dropout);$('imuStatus').textContent='ACTIVE';
  $('waypointStatus').textContent=['square','waypoints'].includes(sim.c.mission)?`${sim.waypoint+1} / ${sim.route.length}`:'CONTINU';
  $('attitudeText').textContent=`R ${angles[0].toFixed(1)}° · T ${angles[1].toFixed(1)}°`;
  [...$('motorBars').children].forEach((el,i)=>{el.querySelector('i').style.width=`${100*sim.motors[i]/sim.c.thrust}%`;el.querySelector('b').textContent=`${sim.motors[i].toFixed(1)} N`;el.querySelector('i').style.background=sim.failedMotor===i?'#e78b71':'#5ee0bc';});
  $('sampleCount').textContent=`${sim.history.length} MESURES · 20 Hz`;
  if(lastEvents!==sim.events.length){lastEvents=sim.events.length;$('eventLog').replaceChildren();const entries=sim.events.length?sim.events.slice(-12).reverse():[{t:0,message:'Configure l’essai, puis lance la mission.'}];for(const event of entries){const li=document.createElement('li'),time=document.createElement('time'),msg=document.createElement('span');time.textContent=clock(event.t);msg.textContent=event.message;li.append(time,msg);$('eventLog').append(li);}}
  drawAttitude($('attitude'),s.q);
}
const jsonDownload=(name,value)=>download(name,JSON.stringify(value,null,2),'application/json');
$('exportConfig').onclick=()=>{jsonDownload('dronelab-config.json',configuration(sim));toast(dirty?'Configuration active exportée ; modifications non appliquées exclues.':'Configuration exportée.');};
$('exportCsv').onclick=()=>{if(!sim.history.length){toast('Lance un essai pour enregistrer des mesures.',true);return;}download('dronelab-telemetry.csv',csv(sim),'text/csv;charset=utf-8');};
$('exportReport').onclick=()=>jsonDownload('dronelab-report.json',report(sim));
$('exportC').onclick=async()=>{try{const r=await fetch('controller.c');if(!r.ok)throw Error('Le modèle C ne peut pas être chargé. Utilise le serveur local ou le site hébergé.');download('dronelab_controller.c',generateC(await r.text(),sim.c),'text/x-c;charset=utf-8');toast('Loi de commande C exportée avec les paramètres actifs.');}catch(e){toast(e.message,true);}};
let selectedBoard=BOARDS.find(b=>b.fqbn==='arduino:renesas_uno:minima');
try{const saved=localStorage.getItem('droneLabBoard');selectedBoard=BOARDS.find(b=>b.id===saved)||selectedBoard;}catch{/* Optional persistence. */}
const boardLabel=b=>b.name+(b.limited?' · banc limité':'');
function currentBoard(){
  if($('customBoardToggle').checked)return customBoard({name:$('customBoardName').value,fqbn:$('customBoardFqbn').value,limited:$('customBoardLimited').checked});
  const label=$('boardSelect').value.trim(),group=$('boardGroup').value;
  const board=BOARDS.find(b=>boardLabel(b)===label&&(!group||b.group===group));
  if(!board)throw Error('Choisis une carte dans les suggestions pour préparer son projet.');
  return board;
}
function renderBoardList(rebuild=true){
  const query=$('boardSelect').value.trim().toLowerCase(),group=$('boardGroup').value;
  const options=BOARDS.filter(b=>!group||b.group===group);
  if(rebuild){$('boardOptions').replaceChildren();for(const b of options){const option=document.createElement('option');option.value=boardLabel(b);option.label=`${b.group} · ${b.architecture} · ${b.core}`;$('boardOptions').append(option);}}
  const matches=options.filter(b=>`${boardLabel(b)} ${b.group} ${b.architecture} ${b.core}`.toLowerCase().includes(query));
  $('boardCount').textContent=`${BOARDS.length} profils recensés · ${matches.length} pour ce filtre. Saisis un nom puis choisis une suggestion.`;
}
const formatBytes=n=>Number.isFinite(n)?`${(n/1024).toLocaleString('fr-FR',{maximumFractionDigits:1})} Kio`:'Selon les options du cœur';
function showBoard(){
  const custom=$('customBoardToggle').checked;$('customBoardFields').hidden=!custom;$('boardSelect').disabled=custom;$('boardGroup').disabled=custom;
  const box=$('boardDetails');box.replaceChildren();
  try{
    const b=currentBoard(),title=document.createElement('h3');title.textContent=b.name;box.append(title);
    const status=document.createElement('span');status.className='board-status';status.textContent=b.limited?'BANC UNIQUEMENT · PROFIL 8 BITS LIMITÉ':'PROJET DE PORTAGE · CADENCE À MESURER';box.append(status);
    const dl=document.createElement('dl');
    for(const [label,value] of [['Architecture',b.architecture],['Flash : limite déclarée par le cœur',formatBytes(b.flash)],['RAM : limite déclarée par le cœur',formatBytes(b.ram)],['Paquet Arduino',b.core],['Cible de compilation (FQBN)',b.fqbn],['Vérification du modèle initial',b.validation?`Cœur ${b.validation.coreVersion} · compilation réussie`:'Non vérifiée pour cette cible'],['Validation en vol','Non réalisée']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd);}box.append(dl);
    const note=document.createElement('p');note.textContent=b.notes;box.append(note);$('boardSource').hidden=!b.source;if(b.source)$('boardSource').href=b.source;$('exportArduino').disabled=false;
  }catch(e){const note=document.createElement('p');note.textContent=e.message;box.append(note);$('exportArduino').disabled=true;$('boardSource').hidden=true;}
}
$('boardGroup').onchange=()=>{if($('boardGroup').value&&selectedBoard.group!==$('boardGroup').value)$('boardSelect').value='';renderBoardList();showBoard();};
$('boardSelect').oninput=()=>{
  try{selectedBoard=currentBoard();try{localStorage.setItem('droneLabBoard',selectedBoard.id);}catch{/* Optional persistence. */}}catch{/* Partial search: wait for an exact suggestion. */}
  renderBoardList(false);showBoard();
};
for(const id of ['customBoardToggle','customBoardName','customBoardFqbn','customBoardLimited'])$(id).addEventListener('input',showBoard);
$('openHardware').onclick=()=>choosePanel('hardware');
$('exportArduino').onclick=async()=>{try{const b=currentBoard(),r=await fetch('controller.c');if(!r.ok)throw Error('Impossible de charger le modèle de commande.');download(`DroneLab_${b.id.replace(/[^A-Za-z0-9_-]/g,'_')}.zip`,arduinoZip(await r.text(),sim,b),'application/zip');toast(dirty?'Projet exporté avec la configuration active, sorties moteurs inactives. Réglages non appliqués exclus.':'Projet Arduino exporté · sorties moteurs inactives.');}catch(e){toast(e.message,true);}};
$('boardSelect').value=boardLabel(selectedBoard);renderBoardList();showBoard();
function parseImport(data){if(data.format!=='dronelab-config'||data.version!==1||!data.config||!Array.isArray(data.waypoints)||data.waypoints.length>30)throw Error('Format de configuration non reconnu.');const allowed=Object.keys(DEFAULTS),clean={};for(const k of allowed)if(Object.hasOwn(data.config,k))clean[k]=data.config[k];return {c:config(clean),wp:data.waypoints};}
$('importConfig').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>100000)throw Error('Fichier trop volumineux.');const {c,wp}=parseImport(JSON.parse(await file.text()));newSim(c,wp);waypoints=wp.map(p=>[...p]);fill(c);toast('Configuration importée et appliquée.');}catch(e){toast(`Import refusé : ${e.message}`,true);}event.target.value='';};
$('about').onclick=()=>$('aboutDialog').showModal();$('closeAbout').onclick=()=>$('aboutDialog').close();$('aboutDialog').addEventListener('click',e=>{if(e.target===$('aboutDialog')){const r=$('aboutDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('aboutDialog').close();}});
let initial=config();try{const raw=localStorage.getItem('droneLabConfig');if(raw){const {c,wp}=parseImport(JSON.parse(raw));new Simulation(c,wp);initial=c;waypoints=wp;}}catch{/* Invalid or obsolete stored configuration: use defaults. */}
fill(initial);newSim(initial);window.addEventListener('resize',()=>{scene.draw(sim);drawChart($('chart'),sim.history,$('chartType').value);});
document.addEventListener('visibilitychange',()=>{last=performance.now();accumulator=0;});
function frame(now){
  const elapsed=Math.min(.1,(now-last)/1000);last=now;
  if(playing&&!document.hidden){accumulator+=elapsed*Number($('timescale').value);let steps=0;while(accumulator>=DT&&steps<100){sim.step();accumulator-=DT;steps++;if(['landed','crashed'].includes(sim.mode)){playing=false;accumulator=0;break;}}}
  scene.draw(sim);if(now-lastUi>100){updateUi();drawChart($('chart'),sim.history,$('chartType').value);setView();lastUi=now;}requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
