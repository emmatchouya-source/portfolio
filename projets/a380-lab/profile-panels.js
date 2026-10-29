// Geometric profiles: x and altitude always use the same pixels per metre.
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=(v,d=0)=>Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d});
export function geometricProfile(rows,other=[],label='Profil',overview=false,reference=false){
  if(rows.length<2)return '';
  const all=rows.concat(other),xmin=Math.min(...all.map(p=>p.x))*1000,xmax=Math.max(...all.map(p=>p.x))*1000;
  const zmin=Math.min(...all.map(p=>p.h)),zmax=Math.max(...all.map(p=>p.h));
  const width=650,height=overview?116:190,left=48,right=18,top=27,bottom=38,iw=width-left-right,ih=height-top-bottom;
  const scale=Math.min(iw/Math.max(1,(xmax-xmin)*1.06),(ih-12)/Math.max(1,(zmax-zmin)*1.3));
  const x=p=>width/2+(p.x*1000-(xmin+xmax)/2)*scale;
  const y=p=>top+ih/2-(p.h-(zmin+zmax)/2)*scale;
  const path=(points,color,dashed)=>`<polyline class="geometric-path" points="${points.map(p=>`${x(p)},${y(p)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" ${dashed?'stroke-dasharray="5 4"':''}/>`;
  const ticks=[xmin,(xmin+xmax)/2,xmax].map(value=>`<text x="${x({x:value/1000})}" y="${height-17}" text-anchor="middle">${f(value/1000,1)} km</text>`).join('');
  return `<svg class="geometric-profile" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(label)} — mêmes échelles horizontale et verticale" data-scale-x="${scale}" data-scale-z="${scale}"><title>${escape(label)} — angles au sol conservés</title><text x="${left}" y="15">Altitude : ${f(zmin)}–${f(zmax)} m</text><text x="${width-right}" y="15" text-anchor="end">Axes à même échelle</text><path d="M${left} ${height-bottom}H${width-right}" stroke="#dce0e2"/>${other.length?path(other,'#93a7b3',true):''}${path(rows,reference?'#93a7b3':'#107a70',reference)}${ticks}</svg>`;
}
function slope(rows){
  let angle=0;
  for(let i=1;i<rows.length;i++){
    const dx=(rows[i].x-rows[i-1].x)*1000;if(dx<.01)continue;
    const a=Math.atan2(rows[i].h-rows[i-1].h,dx)*180/Math.PI;
    if(Math.abs(a)>Math.abs(angle))angle=a;
  }
  return angle;
}
export function phaseProfileCharts(track,other=null,interactive=false){
  if(!track?.rows?.length)return '';
  const panels=[],rows=track.rows,secondary=other?.rows||[];
  const groups=[['Décollage et montée initiale',['takeoff-roll','rotation','initial-climb']],['Montée de départ',['departure-climb']],['Croisière',['cruise','climb']],['Descente',['descent']],['Approche et atterrissage',['approach','flare','landing-roll']]];
  for(const [label,phases] of groups){
    const selected=rows.filter(p=>phases.includes(p.phase)),comparison=secondary.filter(p=>phases.includes(p.phase));
    if(selected.length>1)panels.push({label,rows:selected,other:comparison});
  }
  if(!panels.length)panels.push({label:'Croisière',rows,other:secondary});
  for(const [source,suffix] of [[track,''],[other,' · référence']]){
    const events=source?.events||source?.climbs||[];
    events.forEach((event,i)=>{
      const start=event.seconds??event.startSeconds,end=event.endSeconds;
      const selected=source.rows.filter(p=>p.seconds>=start&&p.seconds<=end);
      if(selected.length>1)panels.push({label:`Montée par palier ${i+1}${suffix}`,rows:selected,other:[],reference:Boolean(suffix)});
    });
  }
  return `<details class="phase-profile-details" open><summary>Profils par phase · angles conservés</summary><p class="hint">Chaque phase possède son propre zoom uniforme. Les courbes ne sont pas raccordées entre ces cadres. Les faibles pentes des montées par paliers restent faibles.</p><div class="phase-profile-grid">${panels.map(panel=>{
    const first=panel.rows[0],last=panel.rows.at(-1),angle=slope(panel.rows);
    return `<article class="phase-profile"><h4>${escape(panel.label)}</h4>${geometricProfile(panel.rows,panel.other,panel.label,false,panel.reference)}<p>Δh ${f(last.h-first.h)} m · pente la plus forte ${f(angle,2)}° · ${f(last.x-first.x,1)} km</p>${interactive?`<button type="button" class="compact" data-profile-time="${(first.seconds+last.seconds)/2}">Voir dans la scène</button>`:''}</article>`;
  }).join('')}</div></details>`;
}
export function missionProfileChart(best,baseline){
  if(!best)return '<p class="empty">Aucun profil admissible.</p>';
  const other=baseline?.feasible?baseline:null;
  return geometricProfile(best.rows,other?.rows||[],'Mission entière',true)+`<p class="hint">Mission entière à proportions réelles : l’altitude est faible face à la distance totale. Les détails ci-dessous conservent aussi les angles, avec un zoom propre à chaque phase.</p>`+phaseProfileCharts(best,other);
}
