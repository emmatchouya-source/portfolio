// Only the local agent's fixed API is exposed; the page never sends source code.
const BASE='http://127.0.0.1:47831',VERSION='1.0.0';
export function setupAgent({getBoard,getConfiguration,isDirty}){
  const $=id=>document.getElementById(id),dialog=$('agentDialog');
  let token='',busy=false,ports=[],pendingJob=null,connection='offline',expiresAt=0,checking=false;
  const status=(text,error=false)=>{$('agentStatus').textContent=text;$('agentStatus').classList.toggle('amber-text',error);};
  function connectionStatus(state,text){
    connection=state;$('agentConnection').dataset.state=state;$('agentConnection').textContent=text;controls();
  }
  function controls(){
    const connected=!!token&&connection==='connected';
    $('agentConnect').disabled=busy;$('agentConnect').textContent=connection==='connecting'?'Connexion en cours…':connected?'Vérifier la connexion':'Connecter l’agent';
    $('agentPortsRefresh').disabled=busy||!connected;
    $('agentPort').disabled=busy||!connected;$('agentPrepare').disabled=busy||!connected||!!pendingJob;
    $('agentUpload').disabled=busy||!connected||!!pendingJob||!$('agentPort').value;
    $('agentResume').hidden=!pendingJob;$('agentResume').disabled=busy||!connected;
    $('agentPort').setAttribute('aria-busy',String(busy));
  }
  async function request(path,{body,timeout=90000}={}){
    const headers={};if(token)headers.Authorization=`Bearer ${token}`;if(body!==undefined)headers['Content-Type']='application/json';
    let response;
    try{response=await fetch(BASE+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),cache:'no-store'});}
    catch{connectionStatus('offline','Agent déconnecté · connexion indisponible');throw Error('Agent inaccessible. Ouvre DroneLab Agent, garde sa fenêtre ouverte et autorise l’accès au réseau local si le navigateur le demande.');}
    const data=await response.json();
    if(!response.ok){
      if(response.status===403){token='';pendingJob=null;connectionStatus('offline','Agent non connecté · autorisation requise');}
      if(response.status===404&&path.startsWith('/jobs/')){pendingJob=null;controls();}
      throw Error(data.error||'L’agent a refusé la demande.');
    }
    return data;
  }
  async function task(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){if(connection==='connecting')connectionStatus('offline','Agent non connecté · connexion interrompue');status(e.message,true);}finally{busy=false;controls();}}
  async function refresh(){
    status('Recherche des ports USB…');ports=(await request('/ports')).ports;
    connectionStatus('connected','✓ Agent connecté');
    const old=$('agentPort').value;$('agentPort').replaceChildren(new Option(ports.length?'Choisir le port USB':'Aucune carte détectée',''));
    for(const p of ports)$('agentPort').append(new Option(`${p.address} · ${p.boards.map(b=>b.name).join(', ')||p.label}`,p.address));
    if(ports.some(p=>p.address===old))$('agentPort').value=old;
    else if(ports.length===1)$('agentPort').value=ports[0].address;
    status(ports.length?'Agent connecté. Choisis ta carte dans le panneau Cartes, puis prépare son programme.':'Agent connecté. Branche la carte avec un câble USB de données, puis actualise les ports.');
  }
  $('openAgent').onclick=()=>dialog.showModal();$('closeAgent').onclick=()=>dialog.close();
  $('agentConnect').onclick=()=>task(async()=>{
    connectionStatus('connecting','Connexion en cours…');
    status('Connexion… Autorise DroneLab dans la fenêtre de l’agent.');
    const health=await request('/health',{timeout:6000});
    if(health.application!=='DroneLab Agent'||health.version!==VERSION){connectionStatus('offline','Agent non connecté · mise à jour requise');throw Error('Télécharge la version actuelle de DroneLab Agent, puis ouvre-la.');}
    if(!token||Date.now()>=expiresAt){
      connectionStatus('connecting','En attente d’autorisation dans l’agent…');
      const paired=await request('/connect',{body:{}});token=paired.token;expiresAt=Date.now()+3600000;
      connectionStatus('connected','✓ Agent connecté');
    }
    await refresh();
  });
  $('agentPortsRefresh').onclick=()=>task(refresh);$('agentPort').onchange=controls;
  async function follow(){
    const deadline=Date.now()+45*60*1000;
    while(pendingJob&&Date.now()<deadline){
      const data=await request('/jobs/'+pendingJob,{timeout:12000});
      $('agentLog').textContent=data.log||'Le journal apparaîtra ici.';status(data.phase+'…');
      if(['succeeded','failed'].includes(data.state)){
        pendingJob=null;
        if(data.state==='failed')throw Error('Le traitement a échoué. Consulte le journal ci-dessous.');
        status(data.result.uploaded?'Programme de banc téléversé. Sorties moteurs inactives.':'Compilation réussie. Le programme de banc est prêt pour le téléversement.');return;
      }
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(pendingJob)throw Error('Le traitement continue dans l’agent. Clique sur « Reprendre le suivi ».');
  }
  function start(action){return task(async()=>{
    if(isDirty())throw Error('Applique les paramètres dans DroneLab avant de préparer le programme.');
    const board=getBoard(),configuration=getConfiguration(),port=$('agentPort').value;
    if(action==='upload'&&!ports.some(p=>p.address===port))throw Error('Choisis un port USB détecté.');
    status('Envoi de la configuration à l’agent…');$('agentLog').textContent='';
    const job=await request('/jobs',{body:{action,board:{id:board.id,name:board.name,fqbn:board.fqbn,limited:board.limited},configuration,port}});
    pendingJob=job.id;controls();await follow();
  });}
  $('agentPrepare').onclick=()=>start('prepare');$('agentUpload').onclick=()=>start('upload');$('agentResume').onclick=()=>task(follow);
  if(!/Windows/.test(navigator.userAgent))$('agentPlatform').hidden=false;
  // Probe only after an explicit connection, while its dialog is visible.
  setInterval(async()=>{
    if(document.hidden||!dialog.open||busy||checking||connection!=='connected')return;
    if(Date.now()>=expiresAt){token='';pendingJob=null;connectionStatus('offline','Autorisation expirée · reconnecte l’agent');return;}
    checking=true;
    try{
      const health=await request('/health',{timeout:3500});
      if(health.application!=='DroneLab Agent'||health.version!==VERSION)connectionStatus('offline','Agent non connecté · vérifie sa version');
    }catch(e){status(e.message,true);}finally{checking=false;}
  },10000);
  controls();
}
