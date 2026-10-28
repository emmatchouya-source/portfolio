import {geometry} from './airframes.js';
const NS='http://www.w3.org/2000/svg';
export function drawFrame(element,c){
  const g=geometry(c);element.replaceChildren();
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 250 245');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${g.profile.name}, vue de dessus, avant vers le haut, ${g.count} moteurs`);
  const node=(tag,attrs,text)=>{const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text)el.textContent=text;svg.append(el);return el;};
  node('text',{x:125,y:14,'text-anchor':'middle',fill:'#91e7cc','font-size':10},'AVANT · +X');
  const point=r=>[125-78*r.y/c.arm,117-78*r.x/c.arm];
  if(g.profile.layout==='h'){
    for(const [a,b] of [[0,1],[2,3]]){const p=point(g.rotors[a]),q=point(g.rotors[b]);node('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:'#4d6b7d','stroke-width':3});}
    const p=point({x:0,y:g.rotors[0].y}),q=point({x:0,y:g.rotors[2].y});node('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:'#4d6b7d','stroke-width':3});
  }
  for(const [i,r] of g.rotors.entries()){
    const [x,y]=point(r);if(g.profile.layout!=='h')node('line',{x1:125,y1:117,x2:x,y2:y,stroke:'#4d6b7d','stroke-width':3});
    node('circle',{cx:x,cy:y,r:20,fill:'#142b32',stroke:r.spin>0?'#5ee0bc':'#70a9ff','stroke-width':1.5});
    node('text',{x,y:y-1,'text-anchor':'middle',fill:'#e3edf4','font-size':11},`M${i+1}`);
    // Rotor rotation is opposite to the signed reaction torque on the body.
    node('text',{x,y:y+13,'text-anchor':'middle',fill:'#a4bdce','font-size':8},r.spin>0?'CW':'CCW');
  }
  node('circle',{cx:125,cy:117,r:9,fill:'#6ee0bf'});
  node('text',{x:125,y:237,'text-anchor':'middle',fill:'#8798aa','font-size':9},'Vue de dessus · CW horaire / CCW antihoraire');
  element.append(svg);
}
