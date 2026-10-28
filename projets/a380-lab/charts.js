export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=(v,d=0)=>Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d,minimumFractionDigits:d});
const colors={teal:'#107a70',grey:'#93a7b3',gold:'#b48642',orange:'#bb622d',purple:'#6879a7'};
function frame(w,h,label,xlabel,ylabel) {
  const p={l:53,r:23,t:26,b:43},iw=w-p.l-p.r,ih=h-p.t-p.b;
  return {p,iw,ih,parts:[`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>`,
    `<text x="${p.l}" y="13">${esc(ylabel)}</text><text x="${w-p.r}" y="${h-5}" text-anchor="end">${esc(xlabel)}</text>`]};
}
function axes(g,w,h,xmin,xmax,ymin,ymax,xf=v=>f(v),yf=v=>f(v)) {
  const {p,iw,ih,parts}=g;
  const x=v=>p.l+(v-xmin)/(xmax-xmin||1)*iw,y=v=>p.t+ih-(v-ymin)/(ymax-ymin||1)*ih;
  for(let i=0;i<=4;i++) {
    const v=ymin+(ymax-ymin)*i/4,py=y(v);
    parts.push(`<path d="M${p.l} ${py}H${w-p.r}" stroke="#e7edf0"/><text x="${p.l-9}" y="${py+3}" text-anchor="end">${yf(v)}</text>`);
    const vx=xmin+(xmax-xmin)*i/4;
    parts.push(`<text x="${x(vx)}" y="${h-p.b+20}" text-anchor="middle">${xf(vx)}</text>`);
  }
  return {x,y};
}
function line(points,x,y,color,dashed=false,width=2) {
  return `<polyline points="${points.map(p=>`${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" ${dashed?'stroke-dasharray="5 4"':''}/>`;
}
export function profileChart(best,baseline,distance) {
  if(!best)return '<p class="empty">Aucun profil admissible.</p>';
  const w=650,h=260,g=frame(w,h,'Altitude des profils sur la distance au sol','Distance (km)','Altitude (m)');
  const rows=best.rows,other=baseline?.feasible?baseline.rows:[];
  const heights=rows.concat(other).map(r=>r.h),ymin=Math.floor((Math.min(...heights)-350)/500)*500,ymax=Math.ceil((Math.max(...heights)+350)/500)*500;
  const {x,y}=axes(g,w,h,0,distance,ymin,ymax);
  if(other.length)g.parts.push(line(other.map(r=>[r.x,r.h]),x,y,colors.grey,true));
  const pts=rows.map(r=>[r.x,r.h]);
  g.parts.push(`<polygon points="${x(0)},${y(ymin)} ${pts.map(p=>`${x(p[0])},${y(p[1])}`).join(' ')} ${x(distance)},${y(ymin)}" fill="#107a7010"/>`,line(pts,x,y,colors.teal));
  // Three audit markers expose the mission integration at representative positions.
  [0,Math.floor(rows.length/2),rows.length-1].forEach(i=>{const r=rows[i];g.parts.push(`<circle class="chart-point" cx="${x(r.x)}" cy="${y(r.h)}" r="4" fill="${colors.teal}"><title>${f(r.x)} km · ${f(r.h)} m · masse ${f(r.mass/1000,2)} t · carburant ${f(r.burn/1000,2)} t · CL ${f(r.cl,3)}</title></circle>`);});
  return g.parts.join('')+'</svg>';
}
export function speedChart(speeds,c) {
  if(!speeds.points.length)return '<p class="empty">Aucune vitesse admissible au point de référence.</p>';
  const w=470,h=245,g=frame(w,h,'Portée spécifique et vitesses MRC, LRC et ECON','Mach','SR (km/kg)');
  const min=Math.min(...speeds.points.map(p=>p.sr))*.95,max=speeds.mrc.sr*1.04;
  const {x,y}=axes(g,w,h,c.minMach,c.maxMach,min,max,v=>f(v,2),v=>f(v,3));
  // Do not bridge holes caused by feasibility limits or table boundaries.
  let group=[];
  for(const point of speeds.points) {if(group.length&&point.mach-group.at(-1)[0]>.0011){g.parts.push(line(group,x,y,colors.teal));group=[];}group.push([point.mach,point.sr]);}
  if(group.length)g.parts.push(line(group,x,y,colors.teal));
  [['mrc','MRC',colors.teal],['lrc','LRC',colors.orange],['econ','ECON',colors.purple]].forEach(([key,label,color],i)=>{
    const p=speeds[key];if(!p)return;
    g.parts.push(`<path d="M${x(p.mach)} ${y(p.sr)}V${h-g.p.b}" stroke="${color}" stroke-dasharray="3 3" opacity=".6"/><circle class="chart-point" cx="${x(p.mach)}" cy="${y(p.sr)}" r="4.5" fill="${color}" stroke="white"><title>${label} : Mach ${f(p.mach,4)} · SR ${f(p.sr,4)} km/kg · débit ${f(p.flow*3600)} kg/h</title></circle>`);
  });
  return g.parts.join('')+'</svg>';
}
export function paretoChart(points,best,baseline) {
  const all=points.concat(best?.feasible?[best]:[],baseline?.feasible?[baseline]:[]);
  if(!all.length)return '<p class="empty">Aucun compromis admissible.</p>';
  const w=600,h=270,g=frame(w,h,'Compromis entre temps de vol et consommation','Durée (h)','Carburant (t)');
  const xs=all.map(r=>r.seconds/3600),ys=all.map(r=>r.burn/1000),xpad=Math.max(.03,(Math.max(...xs)-Math.min(...xs))*.1),ypad=Math.max(.2,(Math.max(...ys)-Math.min(...ys))*.12);
  const {x,y}=axes(g,w,h,Math.min(...xs)-xpad,Math.max(...xs)+xpad,Math.min(...ys)-ypad,Math.max(...ys)+ypad,v=>f(v,2),v=>f(v,1));
  if(points.length)g.parts.push(line(points.map(r=>[r.seconds/3600,r.burn/1000]),x,y,'#9cbeb6',true,1));
  for(const r of points)g.parts.push(`<circle class="chart-point" cx="${x(r.seconds/3600)}" cy="${y(r.burn/1000)}" r="3.5" fill="#9cbeb6"><title>Mach ${f(r.profile.mach,3)} · ${f(r.profile.altitude)} m · ${r.profile.steps} montée(s) · ${f(r.burn/1000,2)} t · ${f(r.seconds/3600,2)} h</title></circle>`);
  if(baseline?.feasible)g.parts.push(`<rect x="${x(baseline.seconds/3600)-4}" y="${y(baseline.burn/1000)-4}" width="8" height="8" fill="${colors.grey}"><title>Référence</title></rect>`);
  if(best?.feasible)g.parts.push(`<circle cx="${x(best.seconds/3600)}" cy="${y(best.burn/1000)}" r="5.5" fill="${colors.teal}" stroke="white" stroke-width="2"><title>Profil recommandé</title></circle>`);
  return g.parts.join('')+'</svg>';
}
export function heatChart(points,c) {
  if(!points.length)return '<p class="empty">Aucune case calculée.</p>';
  const unique=[...new Map(points.map(p=>[`${p.mach}/${p.altitude}`,p])).values()];
  const machs=[...new Set(unique.map(p=>p.mach))].sort((a,b)=>a-b),heights=[...new Set(unique.map(p=>p.altitude))].sort((a,b)=>a-b);
  const valid=unique.filter(p=>Number.isFinite(p.burn)),min=valid.length?Math.min(...valid.map(p=>p.burn)):0,max=valid.length?Math.max(...valid.map(p=>p.burn)):1;
  const w=900,h=520,l=75,t=40,iw=790,ih=380,cw=iw/machs.length,ch=ih/heights.length;
  let parts=[`<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="Carte de consommation par altitude et Mach. Flèches pour naviguer, Entrée pour choisir."><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#edf1f3"/><path d="M0 6L6 0" stroke="#d1dae0"/></pattern><linearGradient id="scale"><stop stop-color="#e6f3ed"/><stop offset="1" stop-color="#11786d"/></linearGradient></defs><text x="${l}" y="17">Altitude initiale (m) · croisière sans montée</text>`];
  unique.forEach((p,i)=>{
    const ix=machs.indexOf(p.mach),iy=heights.indexOf(p.altitude),v=Number.isFinite(p.burn)?(p.burn-min)/(max-min||1):null;
    const fill=v===null?'url(#hatch)':`rgb(${Math.round(230-213*v)},${Math.round(243-123*v)},${Math.round(237-128*v)})`;
    const label=`Mach ${f(p.mach,3)}, altitude ${f(p.altitude)} m : ${v===null?p.reasons.join(', '):f(p.burn/1000,2)+' t de carburant'}`;
    parts.push(`<rect class="heat-cell" role="button" tabindex="${i===0?0:-1}" data-mach="${p.mach}" data-altitude="${p.altitude}" data-ix="${ix}" data-iy="${iy}" aria-label="${esc(label)}" x="${l+ix*cw+.5}" y="${t+ih-(iy+1)*ch+.5}" width="${Math.max(1,cw-1)}" height="${Math.max(1,ch-1)}" fill="${fill}"><title>${esc(label)}</title></rect>`);
  });
  heights.forEach((v,i)=>{if(i%2===0||i===heights.length-1)parts.push(`<text x="${l-9}" y="${t+ih-(i+.5)*ch+3}" text-anchor="end">${f(v)}</text>`);});
  machs.forEach((v,i)=>{if(i%3===0||i===machs.length-1)parts.push(`<text x="${l+(i+.5)*cw}" y="${t+ih+23}" text-anchor="middle">${f(v,2)}</text>`);});
  parts.push(`<text x="${l+iw}" y="${t+ih+43}" text-anchor="end">Mach</text><rect x="${l}" y="${h-50}" width="200" height="10" fill="url(#scale)"/><text x="${l}" y="${h-22}">${valid.length?f(min/1000,1)+' t':'Aucun point admissible'}</text><text x="${l+200}" y="${h-22}" text-anchor="end">${valid.length?f(max/1000,1)+' t':''}</text><text x="${l+260}" y="${h-40}">Faible → forte consommation</text></svg>`);
  return parts.join('');
}
