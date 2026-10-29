import {DEFAULT,VERSION,validateConfig,validateTables,flightPoint,selfCheck,upgradeConfig} from './model.js?v=1.4.0';
import {esc,profileChart,speedChart,paretoChart,heatChart} from './charts.js?v=1.4.0';
import {TrajectoryPlayer} from './scene3d.js?v=1.4.0';
import {SCENARIO_LABELS,identifyScenario,scenarioConfig} from './scenarios.js?v=1.4.0';
import {AIRPORT_FIELDS,AIRPORT_LIMITS,PHASE_LABELS} from './airport-config.js?v=1.4.0';
import {airportReport} from './airport-report.js?v=1.4.0';
const $=id=>document.getElementById(id),form=$('studyForm');
const compactLayout=matchMedia('(max-width: 820px)');
const syncConfiguration=()=>{$('configurationPanel').open=!compactLayout.matches;};
compactLayout.addEventListener('change',syncConfiguration);syncConfiguration();
for(const [key,title,unit,group] of AIRPORT_FIELDS){
  const label=document.createElement('label');label.className=group==='quick'?'field':'stack';label.append(document.createTextNode(group==='quick'?title:`${title} (${unit})`));
  const input=document.createElement('input');input.type='number';input.name=key;input.min=AIRPORT_LIMITS[key][0];input.max=AIRPORT_LIMITS[key][1];input.step='any';input.required=true;input.value=DEFAULT[key];
  if(group==='quick'){const span=document.createElement('span'),i=document.createElement('i');i.textContent=unit;span.append(input,i);label.append(span);$('airportQuickFields').append(label);}
  else{input.setAttribute('form','studyForm');label.append(input);$('airport-'+group).append(label);}
}
const trajectory=new TrajectoryPlayer();
$('flightExample').onclick=()=>loadScenario('verification');
$('recoverScenario').onclick=()=>loadScenario('verification');
$('flightRecalculate').onclick=()=>form.requestSubmit();
const f=(v,d=0)=>Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d,minimumFractionDigits:d});
const duration=s=>{const minutes=Math.round(s/60);return `${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')}`;};
let tables=null,result=null,snapshot=null,worker=null,started=0,createdAt=null;
const isProject=t=>t?.schema==='a380-project/v1';
const modelLabel=t=>isProject(t)?'Projet MGA803 — OpenVSP + propulsion corrigée':t?'Tables de croisière importées':'Modèle paramétrique de démonstration';
const modelStatus=t=>isProject(t)?'project-data/reconstructed-unvalidated':t?'user-supplied/unvalidated':'parametric-demonstration/unvalidated';
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function showError(e){$('errorMessage').textContent=e.message||String(e);$('errorDialog').showModal();}
function rawConfig(){const c={};for(const k of Object.keys(DEFAULT))c[k]=k==='objective'?form.elements[k].value:Number(form.elements[k].value);return c;}
function readConfig(){return validateConfig(rawConfig(),tables);}
function syncScenario(){
  const id=identifyScenario(rawConfig());$('studyScenario').value=id;
  $('scenarioHint').textContent=id==='verification'?'Cas de vérification numérique : 300 t, 8 000 m, Mach 0,60. Trajectoire calculable avec le modèle du projet.':id==='report'?(isProject(tables)?'Cas original du rapport : rejeté par le modèle reconstruit avec les bornes moteur actuelles. Un diagnostic détaille ce rejet.':'Paramètres du rapport appliqués au modèle actif.'):'Configuration personnalisée : relancez l’analyse après vos modifications.';
  if(id==='climbs')$('scenarioHint').textContent='Vérification numérique : 300 t, deux montées de 600 m, limite 1,27 m/s (250 ft/min). Cas calculable du modèle reconstruit, sans validation sur vol réel.';
  if(id==='full')$('scenarioHint').textContent='Vol complet de vérification à 300 t : roulage, envol, montée, croisière, descente, approche, arrondi et arrêt. Phases basse vitesse paramétriques, non validées A380.';
}
function setConfig(c){for(const k of Object.keys(DEFAULT))form.elements[k].value=c[k];syncScenario();}
function loadScenario(id){if(worker)return;setConfig(scenarioConfig(id,tables?.area));modelState();markDirty();run();}
$('studyScenario').addEventListener('change',e=>loadScenario(e.target.value));
function activateTab(name,focus=false){
  document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===name;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;$(b.dataset.tab).hidden=!active;if(active&&focus)b.focus();});
  trajectory.setVisible(name==='trajectory');
}
document.querySelectorAll('[data-tab]').forEach(b=>{
  b.onclick=()=>activateTab(b.dataset.tab);
  b.onkeydown=e=>{const tabs=[...document.querySelectorAll('[data-tab]')],i=tabs.indexOf(b);let n;if(e.key==='ArrowRight')n=(i+1)%tabs.length;else if(e.key==='ArrowLeft')n=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=tabs.length-1;else return;e.preventDefault();activateTab(tabs[n].dataset.tab,true);};
});
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>activateTab(b.dataset.go,true));
document.querySelector('.project-link').addEventListener('click',()=>activateTab('method'));
function revealField(field){
  const panel=field?.closest('[role=tabpanel]');if(panel?.hidden)activateTab(panel.id,true);
  for(let ancestor=field?.parentElement;ancestor;ancestor=ancestor.parentElement)if(ancestor.tagName==='DETAILS')ancestor.open=true;
}
// Native validation runs before submit; reveal a collapsed invalid control first.
form.addEventListener('invalid',e=>revealField(e.target),true);
document.querySelectorAll('[form="studyForm"]').forEach(el=>el.addEventListener('invalid',()=>revealField(el)));
function markDirty(){
  syncScenario();
  airportState();
  trajectory.setStale(true);
  $('dirty').textContent='Paramètres modifiés : relancez l’analyse pour les appliquer.';
  if(result)status('Paramètres modifiés · les résultats affichés correspondent à la dernière étude calculée.');
}
form.addEventListener('input',e=>{if(e.target.id!=='studyScenario')markDirty();});
document.querySelectorAll('[form="studyForm"]').forEach(el=>el.addEventListener('input',markDirty));
function modelState(){
  const imported=Boolean(tables);
  for(const key of ['area','cd0','k','waveMach','waveK','tsfc','thrustSL'])form.elements[key].disabled=imported;
  form.elements.disa.disabled=imported&&!isProject(tables);
  for(const key of ['cgOffset','n1Min','n1Max'])form.elements[key].disabled=!isProject(tables);
  $('modelTag').textContent=isProject(tables)?'Projet MGA803':imported?'Tables importées':'Paramétrique';
  $('modelNotice').innerHTML=isProject(tables)?'<b>Modèle MGA803.</b> 490 cas OpenVSP · Trent 970B-84 · équilibrage longitudinal reconstruit.':imported?`<b>Tables importées : ${esc(tables.name)}.</b> Interpolation dans le domaine fourni ; fidélité physique non vérifiée.`:'<b>Modèle paramétrique.</b> Polaire et propulsion synthétiques de démonstration.';
  syncScenario();
  airportState();
}
function airportState(){
  const full=Number(form.elements.missionMode.value)===1;
  $('airportQuick').hidden=!full;$('airportDataPanel').hidden=!full;
  for(const [key] of AIRPORT_FIELDS)form.elements[key].disabled=!full||$('run').disabled;
  $('missionScope').textContent=full?'Distance entre seuils de départ et d’arrivée. Masse et carburant au début du roulage. Le calcul se poursuit jusqu’à l’arrêt après atterrissage. Positif : vent de dos.':'Positif : vent de dos. Distance, masse initiale et durée couvrent uniquement la croisière.';
  form.elements.distance.closest('label').firstChild.textContent=full?'Distance entre seuils ':'Distance au sol ';
  for(const key of ['climbStart1','climbStart2'])form.elements[key].parentElement.querySelector('i').textContent=full?'% crois.':'% trajet';
}
function busy(on){
  if(on)trajectory.pause();
  $('run').disabled=on;$('cancel').hidden=!on;$('progress').hidden=!on;
  for(const el of form.elements)if(el.matches('input,select'))el.disabled=on;
  for(const id of ['reset','projectSource','parametric','importButton','importData','template'])$(id).disabled=on;
  for(const id of ['recoverScenario','verificationCase','flightExample','flightRecalculate'])if($(id))$(id).disabled=on;
  if($('restoreStudy'))$('restoreStudy').disabled=on;
  for(const id of ['exportStudy','exportCSV','printReport'])$(id).disabled=on||!result;
  if(!on)modelState();
}
function run(){
  let config;try{const invalid=[...form.elements].find(el=>el.willValidate&&!el.validity.valid);if(invalid)revealField(invalid);if(!form.reportValidity())return;config=readConfig();}catch(e){showError(e);return;}
  worker?.terminate();busy(true);$('progress').value=0;started=performance.now();
  status('Exploration du domaine…');
  const current={config:structuredClone(config),tables:tables?structuredClone(tables):null,scenario:identifyScenario(config)};
  try{worker=new Worker(new URL('./worker.js?v=1.4.0',import.meta.url),{type:'module'});}catch(e){busy(false);status('Impossible de démarrer le calcul.',true);showError(e);return;}
  worker.onmessage=({data})=>{
    if(data.type==='progress'){$('progress').value=data.value;status(`${data.phase} · ${data.value} %`);return;}
    if(data.type==='error'){worker.terminate();worker=null;busy(false);status('Calcul interrompu : '+data.message,true);showError(Error(data.message));return;}
    if(data.type==='result'){
      worker.terminate();worker=null;result=data.result;snapshot=current;createdAt=new Date().toISOString();busy(false);render();
      $('dirty').textContent='Paramètres appliqués à l’étude affichée.';
      status(result.best?`${SCENARIO_LABELS[current.scenario]} · ${f(result.count)} profils explorés · ${f(result.feasibleCount)} admissibles · ${f((performance.now()-started)/1000,1)} s · résultat discret, sans garantie d’optimum global.`:'Aucun profil admissible pour ces paramètres. Le diagnostic ci-dessous explique le blocage.',!result.best);
      try{localStorage.setItem('a380-last-study',JSON.stringify({config,tables}));}catch{/* Private mode / quota: calculation remains usable. */}
    }
  };
  worker.onerror=e=>{worker?.terminate();worker=null;busy(false);status('Erreur de calcul : '+e.message,true);};
  worker.postMessage(current);
}
form.addEventListener('submit',e=>{e.preventDefault();run();});
$('cancel').onclick=()=>{worker?.terminate();worker=null;busy(false);status('Calcul annulé. Les éventuels résultats précédents sont conservés.');};
async function useProject(start=false,id='verification'){
  let c;try{c=start?scenarioConfig(id):readConfig();}catch(e){showError(e);return;}
  busy(true);
  try{const response=await fetch(new URL('./data/project.json',import.meta.url));if(!response.ok)throw Error('Impossible de charger les données du projet.');const data=validateTables(await response.json());
    c.area=data.area;tables=data;setConfig(c);modelState();markDirty();busy(false);
    $('dataStatus').textContent=`Modèle du projet chargé : WB 180 cas, empennage 310 cas ; moteur Trent 970B-84, OACI 18RR082. Les corrections et limites sont documentées.`;
    if(start)run();
  }catch(e){busy(false);if(start){tables=null;setConfig(scenarioConfig(id));modelState();run();$('dataStatus').textContent='Chargement des données du projet impossible : modèle paramétrique de secours activé.';}else showError(e);}
}
$('projectSource').onclick=()=>useProject();
$('reset').onclick=()=>useProject(true);
function tableResultRow(label,r,selected=false){
  if(!r?.feasible)return `<tr><td>${label}</td><td colspan="6" class="infeasible">${esc(r?.reasons?.join(' · ')||'Indisponible')}</td></tr>`;
  return `<tr class="${selected?'selected':''}"><td>${label}</td><td>${f(r.profile.mach,3)} / ${f(r.profile.altitude)} m<br><small>${r.profile.steps} montée(s)</small></td><td>${f(r.burn/1000,2)} t</td><td>${duration(r.seconds)}</td><td>${f(r.co2/1000,2)} t</td><td>${f(r.score/1000,2)}${snapshot.config.objective==='time'?' ks':' t éq.'}</td><td>${f(r.reserveMargin/1000,2)} t</td></tr>`;
}
function render(){
  const {best,baseline,speeds}=result,c=snapshot.config;
  const sourcePoint=best?.rows.find(p=>Number.isFinite(p.alpha)),emissions=best?.cruiseEmissions??best?.emissions;
  $('airportSummary').hidden=!c.missionMode;
  $('airportSummary').innerHTML=c.missionMode?airportReport(best??(baseline.feasible?baseline:null),c):'';
  const gain=best&&baseline.feasible?(baseline.burn-best.burn)/baseline.burn*100:null;
  $('kpis').innerHTML=`<article><span>CARBURANT</span><strong>${best?f(best.burn/1000,2):'—'}<small>t</small></strong><p>Profil recommandé</p></article><article><span>${c.missionMode?'DURÉE DU VOL COMPLET':'DURÉE DE CROISIÈRE'}</span><strong>${best?duration(best.seconds):'—'}</strong><p>Pour ${f(c.distance)} km au sol</p></article><article><span>CO₂ DIRECT</span><strong>${best?f(best.co2/1000,1):'—'}<small>t</small></strong><p>Combustion du carburant uniquement</p></article><article class="gain"><span>ÉCART À LA RÉFÉRENCE</span><strong>${gain===null?'—':(gain<0?'+':'−')+f(Math.abs(gain),1)}<small>%</small></strong><p>${gain===null?'Référence non admissible':'Consommation de carburant'}</p></article>`;
  $('profileTag').textContent=best?{fuel:'Objectif carburant',time:'Objectif durée',econ:'Objectif coût équivalent'}[c.objective]:'Aucun profil admissible';
  $('recommendation').innerHTML=best?`<div><small>MACH CONSTANT</small><strong>${f(best.profile.mach,3)}</strong></div><div><small>ALTITUDE INITIALE</small><strong>${f(best.profile.altitude)} <small>m</small></strong></div><div><small>MONTÉES</small><strong>${best.profile.steps} <small>× ${f(c.stepHeight)} m</small></strong></div>`:'<div><p class="infeasible">Modifiez le domaine ou les contraintes, puis relancez le calcul.</p>'+(isProject(snapshot.tables)?'<p class="hint">Le scénario dépasse les limites retenues. Consultez le diagnostic ou chargez le cas de vérification.</p><button id="verificationCase" class="compact">Charger le cas de vérification 300 t</button>':'')+'</div>';
  if($('verificationCase'))$('verificationCase').onclick=()=>loadScenario('verification');
  $('feasibilityNotice').hidden=Boolean(best);
  if(!best){
    const point=baseline.lastPoint,mainReason=Object.entries(result.failures).sort((a,b)=>b[1]-a[1])[0]?.[0]||baseline.reasons?.[0]||'Contraintes du domaine choisi';
    $('feasibilityTitle').textContent=mainReason.includes('N1')?'La poussée requise dépasse le domaine moteur retenu.':'Aucun profil ne respecte les contraintes actuelles.';
    $('feasibilityDetail').textContent=point&&isProject(snapshot.tables)&&point.thrust>point.available?`À ${f(point.mass/1000)} t, ${f(point.h)} m et Mach ${f(point.mach,2)}, il faut ${f(point.thrust/1000,1)} kN ; le modèle fournit ${f(point.available/1000,1)} kN au régime corrigé maximal d’étude de ${f(c.n1Max)} %. Ce résultat porte sur le modèle reconstruit et ses bornes.`:`Motif principal : ${mainReason}. Vérifiez les limites de masse, carburant, altitude, durée et poussée avant de relancer.`;
    $('recoverScenario').hidden=Boolean(snapshot.tables)&&!isProject(snapshot.tables);
  }
  $('searchBoundary')?.remove();
  if(best){const p=best.profile,bounds=[];
    if(Math.abs(p.mach-c.minMach)<1e-8)bounds.push('Mach minimum');if(Math.abs(p.mach-c.maxMach)<1e-8)bounds.push('Mach maximum');
    if(Math.abs(p.altitude-c.minAltitude)<1e-6)bounds.push('altitude minimum');if(Math.abs(p.altitude-c.maxAltitude)<1e-6)bounds.push('altitude maximum');
    if(bounds.length){const note=document.createElement('p');note.id='searchBoundary';note.className='hint';note.textContent='Solution sur une borne du domaine : '+bounds.join(', ')+'. Il ne s’agit pas d’un optimum intérieur identifié. L’extension du domaine exige une vérification de la validité du modèle.';$('recommendation').after(note);}
  }
  for(const id of ['profileChart','speedChart','paretoChart','heatChart','comparison','sensitivity'])$(id).classList.remove('empty');
  $('profileChart').innerHTML=profileChart(best,baseline,Math.max(c.distance,best?.rows.at(-1)?.x??0,baseline?.rows?.at(-1)?.x??0));
  $('constraints').innerHTML=best?`<div><strong>${f(best.minThrustMargin*100,1)} %</strong><span>marge min. de poussée<br>requise : ${f((1-c.thrustLimit)*100)} %</span></div><div><strong>${f(best.cruiseMaxCL??best.maxCL,3)} / ${f(c.clMax,2)}</strong><span>CL maximal de croisière / limite</span></div><div><strong>+${f(best.reserveMargin/1000,2)} t</strong><span>au-delà de la réserve finale</span></div>`:'';
  if(!best&&baseline.lastPoint){const p=baseline.lastPoint;$('constraints').innerHTML=`<div><strong>${f(p.thrust/1000,1)} kN</strong><span>poussée totale requise<br>au point de rejet</span></div><div><strong>${f(p.available/1000,1)} kN</strong><span>capacité du modèle au N1c maximal</span></div><div><strong>${f(p.alpha,2)}° / ${f(p.stab,2)}°</strong><span>incidence / stabilisateur équilibrés</span></div>`;}
  $('speedChart').innerHTML=speedChart(speeds,c);
  $('speedValues').innerHTML=['mrc','lrc','econ'].map(k=>`<div class="${k}"><span>${k.toUpperCase()}</span><b>${speeds[k]?f(speeds[k].mach,3):'—'}</b></div>`).join('');
  const diagnostics=document.querySelector('.lower-grid .panel:last-child');
  diagnostics.querySelector('h3').textContent=isProject(snapshot.tables)?'Équilibrage & émissions':'Ce qui déplace le résultat';
  diagnostics.querySelector('.subtle').textContent=isProject(snapshot.tables)?'Modèle OpenVSP et propulsion corrigée, à profil recommandé.':'Variation indépendante de ±10 %, à profil recommandé fixé.';
  diagnostics.querySelector(':scope > .hint').textContent=isProject(snapshot.tables)?'Émissions de combustion estimées par modèle. Aucun effet non-CO₂ climatique ni cycle de vie.':'Cette plage représente des scénarios déterministes. Elle ne constitue pas un intervalle de confiance.';
  $('comparison').innerHTML=`<table class="comparison-table"><thead><tr><th>Profil</th><th>Mach / altitude initiale</th><th>Carburant</th><th>Durée</th><th>CO₂</th><th>${c.objective==='time'?'Objectif durée':'Objectif équivalent'}</th><th>Marge réserve</th></tr></thead><tbody>${tableResultRow('Référence',baseline)}${tableResultRow('Recommandé',best,true)}</tbody></table><p class="hint">Objectif ${c.objective==='econ'?`carburant + ${f(c.ci)} kg/min × durée`:c.objective==='time'?'durée en kilosecondes':'carburant'}. Les transitions de montée sont incluses dans la durée et le carburant. Gains conditionnels aux données du modèle.</p>`;
  $('paretoChart').innerHTML=paretoChart(result.pareto,best,baseline);
  const sample=result.pareto.filter((_,i,a)=>i===0||i===a.length-1||i===Math.floor(a.length/2));
  $('paretoTable').innerHTML=sample.length?`<table class="pareto-table"><thead><tr><th>Mach</th><th>Altitude / montées</th><th>Carburant</th><th>Durée</th></tr></thead><tbody>${sample.map(r=>`<tr><td>${f(r.profile.mach,3)}</td><td>${f(r.profile.altitude)} m / ${r.profile.steps}</td><td>${f(r.burn/1000,2)} t</td><td>${duration(r.seconds)}</td></tr>`).join('')}</tbody></table>`:'';
  $('sensitivity').innerHTML=isProject(snapshot.tables)&&best?`<div class="sensitivity-row"><label>Équilibrage au départ de la croisière recommandée</label><div class="formula">α = ${f(sourcePoint.alpha,3)}° · δstab = ${f(sourcePoint.stab,3)}°<br>N1 corrigé = ${f(sourcePoint.n1c,2)} %<br>N1 = ${f(sourcePoint.n1,2)} %<br>Résidu force : ${sourcePoint.trimForceResidual.toExponential(2)}<br>Résidu moment : ${sourcePoint.trimMomentResidual.toExponential(2)}</div></div><h4>Émissions de croisière seule — BFF simplifié</h4><div class="formula">NOx : ${emissions.nox===null?'hors domaine':f(emissions.nox,2)+' kg'}<br>CO : ${emissions.co===null?'hors domaine':f(emissions.co,2)+' kg'}<br>HC : ${emissions.hc===null?'non calculable sur toute la mission':f(emissions.hc,2)+' kg'}</div><p class="hint">OACI UID 18RR082. Interpolation log–log sans extrapolation. Un indice HC nul dans la source interdit l’interpolation logarithmique du segment concerné.</p>`:snapshot.tables?'<p class="subtle">Sensibilité paramétrique indisponible en mode tables. Importez des jeux de données distincts pour comparer leurs hypothèses.</p>':!best?'<p class="subtle">Un profil admissible est nécessaire.</p>':result.sensitivity.map(s=>`<div class="sensitivity-row"><label>${s.label}</label><div class="sensitivity-track"><span>${s.low===null?'Hors contrainte':f(s.low/1000,2)+' t'}</span><span class="bar"></span><span>${s.high===null?'Hors contrainte':f(s.high/1000,2)+' t'}</span></div><p class="hint">−10 % / +10 % sur ${esc(s.key)} · référence ${f(best.burn/1000,2)} t</p></div>`).join('');
  $('heatChart').innerHTML=heatChart(result.heat,c);setupHeat();
  $('failureSummary').innerHTML=`<h4>Motifs d’exclusion lors du balayage initial</h4><div class="failure-list">${Object.entries(result.failures).map(([reason,n])=>`<span>${esc(reason)} : ${f(n)}</span>`).join('')||'<span>Aucune exclusion</span>'}</div><p class="hint">Un profil peut contribuer à plusieurs motifs. Les points hors domaine ne sont pas extrapolés.</p>`;
  const conv=result.convergence;
  $('validation').innerHTML=result.checks.map(x=>`<div class="check ${x.pass?'':'failed'}"><strong>${x.pass?'PASS':'ÉCHEC'}</strong>${esc(x.name)}</div>`).join('')+`<div class="check"><strong>${conv?'CONVERGENCE RK4':'CONVERGENCE NON ÉVALUÉE'}</strong>${conv?`5 km / 2,5 km : écart ${f(conv.deltaKg,6)} kg (${f(conv.relative*100,8)} %).`:'Aucun profil admissible à vérifier.'}</div><div class="check"><strong>PÉRIMÈTRE DES CONTRAINTES</strong>Contrôle aux étapes RK4 et aux transitions. Absence de preuve continue entre échantillons.</div><div class="check"><strong>FIDÉLITÉ PHYSIQUE</strong>${snapshot.tables?'Tables importées : provenance déclarée, validation physique à fournir.':'Modèle de démonstration ; aucune comparaison à des données de vol.'}</div>`;
  trajectory.setStudy(result,snapshot);
}
function setupHeat(){
  const cells=[...$('heatChart').querySelectorAll('.heat-cell')];
  const select=cell=>{
    if(worker)return;
    form.elements.mach.value=cell.dataset.mach;form.elements.altitude.value=cell.dataset.altitude;form.elements.steps.value=0;markDirty();
    $('heatSelection').textContent=`Référence sélectionnée : Mach ${f(Number(cell.dataset.mach),3)}, ${f(Number(cell.dataset.altitude))} m, sans montée. Relancez « Calculer et comparer » pour l’appliquer.`;
  };
  cells.forEach(cell=>{
    cell.onclick=()=>select(cell);
    cell.onkeydown=e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();select(cell);return;}
      const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key];if(!dir)return;e.preventDefault();
      const next=cells.find(x=>Number(x.dataset.ix)===Number(cell.dataset.ix)+dir[0]&&Number(x.dataset.iy)===Number(cell.dataset.iy)+dir[1]);
      if(next){cell.tabIndex=-1;next.tabIndex=0;next.focus();}
    };
  });
}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('exportStudy').onclick=()=>{
  if(!result)return;
  download('a380-etude.json',JSON.stringify({schema:'a380-study/v1',version:VERSION,createdAt,modelStatus:modelStatus(snapshot.tables),qualification:{flightValidated:false,engineDomainValidated:false,scope:snapshot.config.missionMode?'Full mission with unvalidated low-speed model':'Cruise and finite step climbs only',airportModelStatus:snapshot.config.missionMode?'parametric-low-speed/unvalidated':null,criticalOpenItems:['Original trim/CG conventions','Trent thrust/fuel operating domain','Independent aircraft flight or manufacturer reference cases','Buffet and certified operating envelope']},scope:snapshot.config.missionMode?'Full flight: takeoff, climb, cruise, descent, approach, flare and braking. Low-speed model is parametric and not A380 AFM validated.':'Cruise with finite C2 climbs. Not validated for operational flight planning.',...snapshot,result},null,2),'application/json');
};
$('exportCSV').onclick=()=>{
  if(!result?.best){showError(Error('Aucune trajectoire admissible à exporter.'));return;}
  const columns=['profile','distance_km','time_s','altitude_m','mach','mass_kg','fuel_burn_kg','tas_m_s','groundspeed_m_s','CL','CD','thrust_total_N','available_total_N','fuel_flow_total_kg_s','tsfc_kg_N_s','thrust_margin_ratio','alpha_deg','stabilizer_deg','N1_corrected_percent','N1_percent','force_residual_normalized','moment_residual_normalized','model_status','model_version','study_utc','phase','vertical_speed_m_s','flight_path_deg','load_factor','axial_energy_residual_W'];
  const lines=[columns.join(',')];
  for(const [name,r] of [['recommended',result.best],['baseline',result.baseline]])if(r.feasible)for(const p of r.rows)lines.push([name,p.x,p.seconds,p.h,p.mach,p.mass,p.burn,p.tas,p.gs,p.cl,p.cd,p.thrust,p.available,p.flow,p.tsfc,p.thrustMargin,p.alpha??'',p.stab??'',p.n1c??'',p.n1??'',p.trimForceResidual??'',p.trimMomentResidual??'',modelStatus(snapshot.tables),VERSION,createdAt,p.phase,p.roc,p.gamma*180/Math.PI,p.loadFactor,p.energyResidualW].map(v=>typeof v==='number'?v.toPrecision(12):v).join(','));
  download('a380-trajectoires.csv',lines.join('\r\n'),'text/csv;charset=utf-8');
};
$('printReport').onclick=()=>{
  const doc=document.createElement('div');doc.className='print-only';doc.id='printMetadata';
  doc.innerHTML=`<h2>A380 Cruise Lab — Dossier d’étude</h2><p>Calcul du ${esc(createdAt)} · version ${VERSION} · ${esc(modelLabel(snapshot.tables))}</p><p>Mission : ${f(snapshot.config.distance)} km · masse initiale ${f(snapshot.config.mass)} kg · vent ${f(snapshot.config.wind)} m/s · ΔISA ${f(snapshot.config.disa)} K · CI ${f(snapshot.config.ci)} kg/min.</p><p>Ce document décrit la dernière étude calculée. Le fichier JSON associé contient tous les paramètres et résultats reproductibles.</p>`;
  $('workspace').prepend(doc);window.print();doc.remove();
};
$('parametric').onclick=()=>{tables=null;modelState();$('dataStatus').textContent='Modèle paramétrique activé. Relancez l’analyse pour appliquer ce choix.';markDirty();};
$('importButton').onclick=()=>$('importData').click();
$('template').onclick=()=>{
  const t={schema:'a380-cruise-tables/v1',name:'Exemple synthétique — non validé A380',source:'Generated from the A380 Cruise Lab demonstration model v'+VERSION,area:DEFAULT.area,mach:[.5,.6,.7,.75,.8,.85,.89],cl:[.1,.3,.5,.7,.9,1.1,1.5],altitude:[8000,9000,10000,11000,12000,13100]};
  t.cd=t.mach.map(m=>t.cl.map(cl=>DEFAULT.cd0+DEFAULT.k*cl*cl+DEFAULT.waveK*Math.pow(Math.max(0,m-DEFAULT.waveMach),4)));
  t.tsfc=t.mach.map(m=>t.altitude.map(h=>flightPoint(DEFAULT,500000,h,m).tsfc));
  t.maxThrust=t.mach.map(m=>t.altitude.map(h=>flightPoint(DEFAULT,500000,h,m).available));
  download('a380-tables-exemple-synthetique.json',JSON.stringify(t,null,2),'application/json');
};
$('importData').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>50*1024*1024)throw Error('Fichier limité à 50 Mo.');
    const data=JSON.parse(await file.text());let nextTables,nextConfig;
    if(data.schema==='a380-study/v1'){
      if(!data.config)throw Error('Configuration absente de l’étude.');
      const migrated=upgradeConfig(data.config);nextConfig=Object.fromEntries(Object.keys(DEFAULT).map(k=>[k,migrated[k]]));
      nextTables=data.tables?validateTables(data.tables):null;validateConfig(nextConfig,nextTables);
    }else{
      nextTables=validateTables(data);nextConfig=readConfig();nextConfig.area=nextTables.area;nextConfig.disa=0;validateConfig(nextConfig,nextTables);
    }
    tables=nextTables;setConfig(nextConfig);modelState();markDirty();
    $('dataStatus').textContent=tables?`Tables chargées : ${tables.name}. Source : ${tables.source}. Relancez l’analyse avec les montées de durée finie.`:'Étude chargée. Les résultats seront recalculés avec le modèle de montées de durée finie 1.2.';
  }catch(error){showError(error);}finally{e.target.value='';}
};
// A fresh visit always opens the documented reference. Stored work is offered explicitly.
try{
  const saved=JSON.parse(localStorage.getItem('a380-last-study')||'null');
  if(saved){
    const restore=document.createElement('button');restore.id='restoreStudy';restore.type='button';restore.className='text-button';restore.textContent='Restaurer ma dernière étude locale';
    restore.onclick=()=>{try{const t=saved.tables?validateTables(saved.tables):null,migrated=upgradeConfig(saved.config),c=Object.fromEntries(Object.keys(DEFAULT).map(k=>[k,migrated[k]]));validateConfig(c,t);tables=t;setConfig(c);modelState();run();}catch(e){showError(e);}};
    document.querySelector('.run-actions').append(restore);
  }
}catch{/* Corrupt or unavailable local storage must not block startup. */}
const params=new URLSearchParams(location.search),requested=params.get('scenario');
const initialScenario=['verification','climbs','full','report'].includes(requested)?requested:params.get('model')==='parametric'?'report':'verification';
setConfig(scenarioConfig(initialScenario));modelState();
$('validation').innerHTML=selfCheck().map(x=>`<div class="check"><strong>${x.pass?'PASS':'ÉCHEC'}</strong>${esc(x.name)}</div>`).join('');
if(params.get('view')==='3d')activateTab('trajectory');
if(location.hash==='#projectStory')activateTab('method');
if(params.get('model')==='parametric')run();else useProject(true,initialScenario);
