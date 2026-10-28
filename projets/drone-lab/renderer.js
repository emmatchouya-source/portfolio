import {add,sub,scale,dot,norm,unit,cross,rotate,euler} from './math.js';

function fit(canvas){const d=Math.min(window.devicePixelRatio||1,2),r=canvas.getBoundingClientRect();if(canvas.width!==Math.round(r.width*d)||canvas.height!==Math.round(r.height*d)){canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);}const ctx=canvas.getContext('2d');ctx.setTransform(d,0,0,d,0,0);return {ctx,w:r.width,h:r.height};}
export class Scene {
  constructor(canvas){
    this.canvas=canvas;this.yaw=-1.02;this.elevation=.58;this.distance=24;this.follow=false;this.top=false;
    let pointer=null;
    canvas.addEventListener('pointerdown',e=>{pointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!pointer)return;this.yaw-=(e.clientX-pointer[0])*.007;this.elevation=Math.max(.12,Math.min(1.5,this.elevation+(e.clientY-pointer[1])*.005));this.top=false;pointer=[e.clientX,e.clientY];});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>pointer=null);
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=Math.max(4,Math.min(95,this.distance*Math.exp(e.deltaY*.001)));},{passive:false});
  }
  reset(){this.yaw=-1.02;this.elevation=.58;this.distance=24;this.top=false;this.follow=false;}
  draw(sim){
    const {ctx:c,w,h}=fit(this.canvas);if(!w||!h)return;
    const focus=this.follow?add(sim.s.p,[0,0,0]):[sim.c.radius*.35,sim.c.radius*.35,1.5];
    const el=this.top?1.565:this.elevation, eye=add(focus,[this.distance*Math.cos(el)*Math.cos(this.yaw),this.distance*Math.cos(el)*Math.sin(this.yaw),this.distance*Math.sin(el)]);
    const forward=unit(sub(focus,eye)),right=unit(cross(forward,[0,0,1])),up=cross(right,forward),f=Math.min(w*.95,h*1.9);
    const project=p=>{const d=sub(p,eye),z=dot(d,forward);return z>.15?[w/2+f*dot(d,right)/z,h*.54-f*dot(d,up)/z,z]:null;};
    const line=(points,color,width=1,dash=[])=>{c.beginPath();let begun=false;for(const p of points){const a=project(p);if(!a){begun=false;continue;}if(!begun){c.moveTo(a[0],a[1]);begun=true;}else c.lineTo(a[0],a[1]);}c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.setLineDash([]);};
    const polygon=(points,fill,stroke)=>{const pp=points.map(project);if(pp.some(p=>!p))return;c.beginPath();pp.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}};
    const text=(p,t,color='#628398',size=10)=>{const a=project(p);if(!a)return;c.fillStyle=color;c.font=`${size}px Consolas, monospace`;c.fillText(t,a[0]+5,a[1]-6);};
    const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#101c29');bg.addColorStop(.5,'#132530');bg.addColorStop(1,'#0c1921');c.fillStyle=bg;c.fillRect(0,0,w,h);
    polygon([[-90,-90,0],[90,-90,0],[90,90,0],[-90,90,0]],'#101f28');
    for(let i=-40;i<=40;i+=2){const color=i%10===0?'#29414e90':'#23394365';line([[i,-40,0],[i,40,0]],color);line([[-40,i,0],[40,i,0]],color);}
    // A geometric landing pad; no unmodelled obstacles in the simulated volume.
    polygon([[-1.2,-1.2,.01],[1.2,-1.2,.01],[1.2,1.2,.01],[-1.2,1.2,.01]],'#172e36','#3a5967');
    const ring=[];for(let i=0;i<=64;i++){const a=i*Math.PI/32;ring.push([.9*Math.cos(a),.9*Math.sin(a),.025]);}line(ring,'#5b938a',1.5);
    line([[-.35,-.45,.03],[-.35,.45,.03]],'#86b1a6',2);line([[.35,-.45,.03],[.35,.45,.03]],'#86b1a6',2);line([[-.35,0,.03],[.35,0,.03]],'#86b1a6',2);
    line([[0,0,.04],[5,0,.04]],'#3d6f85');line([[0,0,.04],[0,5,.04]],'#3d6f85');text([5,0,0],'E / X');text([0,5,0],'N / Y');
    const fence=[];for(let i=0;i<=96;i++){const a=i*Math.PI/48;fence.push([sim.c.fence*Math.cos(a),sim.c.fence*Math.sin(a),.04]);}line(fence,'#a47d4d55',1,[5,7]);
    let planned=sim.route;
    if(['circle','eight'].includes(sim.c.mission)){planned=[];for(let i=0;i<=160;i++){const a=i*Math.PI/80,r=sim.c.radius;planned.push(sim.c.mission==='circle'?[r*Math.sin(a),r*(1-Math.cos(a)),sim.c.altitude]:[r*Math.sin(a),r*.5*Math.sin(2*a),sim.c.altitude]);}}
    line(planned,'#dca86799',1.2,[5,5]);
    if(['square','waypoints'].includes(sim.c.mission))planned.forEach((p,i)=>{line([[p[0],p[1],.05],p],'#b7956040',1,[3,6]);const a=project(p);if(a){c.strokeStyle='#dca86799';c.lineWidth=1;c.strokeRect(a[0]-3,a[1]-3,6,6);text(p,`${i+1}`,'#b68e60',8);}});
    line(sim.trail,'#5ee0bcbb',1.8);
    const p=sim.s.p, shadow=[p[0],p[1],.02], ground=project(shadow);
    if(ground){const r=14/(1+p[2]*.03);c.fillStyle='#00000040';c.beginPath();c.ellipse(ground[0],ground[1],r,r*.35,0,0,Math.PI*2);c.fill();}
    line([shadow,p],'#5ee0bc40',1,[3,4]);
    const tp=sim.target.p,ta=project(tp);if(ta&&sim.mode!=='ready'){c.strokeStyle='#e8b476';c.lineWidth=1;c.beginPath();c.arc(ta[0],ta[1],7,0,Math.PI*2);c.moveTo(ta[0]-11,ta[1]);c.lineTo(ta[0]+11,ta[1]);c.moveTo(ta[0],ta[1]-11);c.lineTo(ta[0],ta[1]+11);c.stroke();}
    const est=project(sim.estimate.p);if(est&&norm(sub(sim.estimate.p,p))>.04){c.fillStyle='#70a9ff';c.beginPath();c.arc(est[0],est[1],2.5,0,Math.PI*2);c.fill();}
    const q=sim.s.q, transform=v=>add(p,rotate(q,v)), prop=sim.geometry.propRadius;
    const rotors=sim.geometry.rotors.map(r=>[r.x,r.y,0]);
    if(sim.geometry.profile.layout==='h'){
      line([transform(rotors[0]),transform(rotors[1])],'#8193a8',4);line([transform(rotors[2]),transform(rotors[3])],'#8193a8',4);
      line([transform([0,rotors[0][1],0]),transform([0,rotors[2][1],0])],'#78d9c4',4);
    }
    const parts=rotors.map((r,i)=>({r,i,depth:project(transform(r))?.[2]||0})).sort((a,b)=>b.depth-a.depth);
    for(const {r,i} of parts){
      if(sim.geometry.profile.layout!=='h')line([transform([0,0,0]),transform(r)],r[0]>0?'#78d9c4':'#8193a8',4);
      const disk=[];for(let j=0;j<=32;j++){const angle=j*Math.PI/16;disk.push(transform(add(r,[prop*Math.cos(angle),prop*Math.sin(angle),.025])));}
      polygon(disk,sim.motors[i]>.1?'#7dcdbd26':'#233c4c','#7eaaab70');
      const angle=-sim.t*(35+sim.motors[i]*12)*sim.geometry.rotors[i].spin;line([transform(add(r,[-prop*Math.cos(angle),-prop*Math.sin(angle),.03])),transform(add(r,[prop*Math.cos(angle),prop*Math.sin(angle),.03]))],'#9dc9c4',1.5);
      if(prop*f/(project(transform(r))?.[2]||1)>10)text(transform(add(r,[0,0,.07])),`M${i+1}`,sim.failedMotor===i?'#f08f75':'#c4e5df',9);
    }
    const l=sim.c.arm*.36,z=sim.c.arm*.22,body=[[-l,-l,z],[l,-l,z],[l,l,z],[-l,l,z]];polygon(body.map(transform),'#a4bbca','#ddeaf0');
    line([transform([0,0,z+.02]),transform([l*1.7,0,z+.02])],'#5ee0bc',2);
    const dp=project(p);if(dp){c.strokeStyle='#5ee0bc50';c.lineWidth=1;c.beginPath();c.arc(dp[0],dp[1],Math.max(21,sim.c.arm*f/(dp[2]||1)*1.6),0,Math.PI*2);c.stroke();c.fillStyle='#84bbae';c.font='9px Consolas, monospace';c.fillText(`DR-01  ${p[2].toFixed(1)} m`,dp[0]+26,dp[1]-17);}
    // Screen-space orientation compass, projected from the same camera basis.
    const cx=w-47,cy=h-45;c.font='9px Consolas, monospace';for(const [v,label,col] of [[[1,0,0],'E','#6b99c1'],[[0,1,0],'N','#5ee0bc'],[[0,0,1],'Z','#dda772']]){const dx=dot(v,right)*23,dy=-dot(v,up)*23;c.strokeStyle=col;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+dx,cy+dy);c.stroke();c.fillStyle=col;c.fillText(label,cx+dx-3,cy+dy-5);}
  }
}

export function drawAttitude(canvas,q){
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,[r,p]=euler(q);c.clearRect(0,0,w,h);c.save();c.translate(w/2,h/2);c.beginPath();c.arc(0,0,w*.44,0,2*Math.PI);c.clip();c.rotate(-r);const y=p*110;c.fillStyle='#224557';c.fillRect(-200,-200+y,400,200);c.fillStyle='#30352f';c.fillRect(-200,y,400,200);c.strokeStyle='#a6c8c5';c.lineWidth=1;c.beginPath();c.moveTo(-100,y);c.lineTo(100,y);c.stroke();c.strokeStyle='#b5c3bd70';for(let i=-3;i<=3;i++)if(i){c.beginPath();c.moveTo(-12,y+i*19);c.lineTo(12,y+i*19);c.stroke();}c.restore();c.save();c.translate(w/2,h/2);c.strokeStyle='#5ee0bc';c.lineWidth=2;c.beginPath();c.moveTo(-30,0);c.lineTo(-10,0);c.lineTo(-10,5);c.moveTo(10,5);c.lineTo(10,0);c.lineTo(30,0);c.stroke();c.fillStyle='#5ee0bc';c.fillRect(-2,-2,4,4);c.strokeStyle='#557080';c.lineWidth=2;c.beginPath();c.arc(0,0,w*.44,0,Math.PI*2);c.stroke();c.restore();
}

export const COLORS=['#5ee0bc','#f1b36c','#70a9ff','#c394e8','#ef8fae','#d9d971','#70d4ed','#c8aa8c'];
export function chartSpec(type,motorCount=4){
  return {altitude:{labels:['Réelle','Consigne','Estimée'],unit:'m',values:r=>[r.p[2],r.target[2],r.estimated[2]]},attitude:{labels:['Roulis','Tangage','Lacet'],unit:'°',values:r=>r.angles.map(v=>v*180/Math.PI)},motors:{labels:Array.from({length:motorCount},(_,i)=>`M${i+1}`),unit:'N',values:r=>r.motors},error:{labels:['Écart de position'],unit:'m',values:r=>[r.error]}}[type];
}
export function drawChart(canvas,history,type,motorCount=history.at(-1)?.motors.length??4){
  const {ctx:c,w,h}=fit(canvas);if(!w||!h)return;const spec=chartSpec(type,motorCount),last=history.at(-1)?.t||0,rows=history.filter(r=>r.t>=last-30),series=rows.map(r=>spec.values(r)),flat=series.flat().filter(Number.isFinite);
  let lo=Math.min(0,...flat),hi=Math.max(1,...flat),padding=(hi-lo)*.12;lo-=padding;hi+=padding;
  const left=45,right=w-13,top=12,bottom=h-25,x=t=>left+(t-Math.max(0,last-30))/30*(right-left),y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
  c.clearRect(0,0,w,h);c.font='8px Consolas, monospace';c.lineWidth=1;
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,py=y(v);c.strokeStyle='#243443';c.beginPath();c.moveTo(left,py);c.lineTo(right,py);c.stroke();c.fillStyle='#647e93';c.fillText(`${v.toFixed(1)}`,5,py+3);}
  for(let i=0;i<=5;i++){const t=Math.max(0,last-30)+i*6,px=left+i*(right-left)/5;c.fillStyle='#647e93';c.fillText(`${t.toFixed(0)}s`,px-7,h-8);}
  c.fillStyle='#7a94a6';c.fillText(spec.unit,6,10);
  spec.labels.forEach((_,i)=>{c.beginPath();rows.forEach((r,j)=>{const px=x(r.t),py=y(series[j][i]);j?c.lineTo(px,py):c.moveTo(px,py);});c.strokeStyle=COLORS[i];c.lineWidth=i===1&&type==='altitude'?1:1.7;c.setLineDash(i===1&&type==='altitude'?[4,4]:[]);c.stroke();});c.setLineDash([]);
  if(!rows.length){c.fillStyle='#637d91';c.font='11px Segoe UI, sans-serif';c.fillText('Lance la mission pour enregistrer les mesures.',left+10,h/2);}
}
