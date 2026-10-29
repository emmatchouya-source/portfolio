import {aircraftMesh} from './aircraft-mesh.js?v=1.5.0';
import {perspectiveCamera,clamp} from './trajectory.js?v=1.5.0';
import {shadowFootprint} from './shadow.js?v=1.5.0';
import {DepthMeshRenderer} from './depth-mesh.js?v=1.5.0';

const mesh=aircraftMesh();
class AircraftShowcase{
  constructor(figure){
    this.figure=figure;this.canvas=figure.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
    if(!this.ctx)return;
    this.meshRenderer=new DepthMeshRenderer({onRestore:()=>this.render()});
    this.mask=document.createElement('canvas');this.button=figure.querySelector('button');this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    this.paused=false;this.onScreen=false;this.frame=0;this.last=0;this.time=0;this.yaw=-.95;this.elevation=.5;this.zoom=1;this.pointer=null;
    this.button.onclick=()=>{this.paused=!this.paused;this.update();};
    this.motion.addEventListener('change',()=>{this.update();this.render();});
    document.addEventListener('visibilitychange',()=>this.update());
    window.addEventListener('pagehide',()=>this.stop());
    window.addEventListener('pageshow',()=>this.update());
    this.canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{
      if(this.pointer?.id!==e.pointerId)return;
      this.yaw-=(e.clientX-this.pointer.x)*.009;this.elevation=clamp(this.elevation+(e.clientY-this.pointer.y)*.007,-.12,1.35);
      this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY};this.render();
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(event,()=>{this.pointer=null;});
    this.canvas.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home',' ','+','=','-'].includes(e.key))return;
      e.preventDefault();
      if(e.key===' ')this.button.click();
      else if(e.key==='Home'){this.yaw=-.95;this.elevation=.5;this.zoom=1;}
      else if(e.key==='ArrowLeft')this.yaw+=.15;
      else if(e.key==='ArrowRight')this.yaw-=.15;
      else if(e.key==='ArrowUp')this.elevation=clamp(this.elevation+.1,-.12,1.35);
      else if(e.key==='ArrowDown')this.elevation=clamp(this.elevation-.1,-.12,1.35);
      else this.zoom=clamp(this.zoom*(e.key==='-'?.9:1.1),.8,1.35);
      this.render();
    });
    new ResizeObserver(()=>this.render()).observe(this.canvas);
    new IntersectionObserver(entries=>{this.onScreen=entries[0].isIntersecting;this.update();},{threshold:.08}).observe(figure);
    this.update();this.render();
  }
  stop(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.last=0;}
  update(){
    this.button.textContent=this.paused?'▶':'Ⅱ';this.button.setAttribute('aria-pressed',String(this.paused));
    this.button.setAttribute('aria-label',this.paused?'Reprendre l’animation 3D':'Mettre l’animation 3D en pause');
    const active=!this.paused&&this.onScreen&&!document.hidden;
    this.figure.dataset.animation=active?'running':document.hidden?'hidden':!this.onScreen?'offscreen':'paused';
    if(active&&!this.frame)this.frame=requestAnimationFrame(t=>this.tick(t));else if(!active)this.stop();
  }
  tick(timestamp){
    this.frame=0;
    if(this.paused||!this.onScreen||document.hidden)return;
    if(!this.last)this.last=timestamp;
    const elapsed=timestamp-this.last;
    if(elapsed>=1000/30){
      const dt=Math.min(.08,elapsed/1000);this.time+=dt;
      if(!this.pointer)this.yaw+=dt*(this.motion.matches?0.045:.16);
      this.last=timestamp;this.render();
    }
    this.frame=requestAnimationFrame(t=>this.tick(t));
  }
  render(){
    const {width:w,height:h}=this.canvas.getBoundingClientRect();if(!w||!h)return;
    const c=this.ctx,dpr=Math.min(devicePixelRatio||1,2),width=Math.round(w*dpr),height=Math.round(h*dpr);
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;this.mask.width=width;this.mask.height=height;}
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    const elevation=this.elevation+(this.motion.matches?0:Math.sin(this.time*.32)*.035),radius=29/this.zoom;
    const eye=[radius*Math.cos(elevation)*Math.cos(this.yaw),radius*Math.cos(elevation)*Math.sin(this.yaw),radius*Math.sin(elevation)];
    const camera=perspectiveCamera(eye,[0,0,.15],w,h),bob=this.motion.matches?0:Math.sin(this.time*.65)*.12;
    const faces=mesh.map(face=>({...face,points:face.points.map(p=>[p[0],p[1],p[2]+bob])}));
    // Shadow uses the same mesh and light direction as the flight view.
    const m=this.mask.getContext('2d');m.setTransform(1,0,0,1,0,0);m.clearRect(0,0,width,height);m.scale(dpr,dpr);m.fillStyle='#1a3a49';m.beginPath();
    for(const points of shadowFootprint(faces,{center:[0,0,bob],groundZ:-2,heightMetres:2+bob,worldScale:1})){
      const a=points.map(camera.project);if(a.some(p=>!p))continue;
      const area=a.reduce((s,p,i)=>{const q=a[(i+1)%a.length];return s+p[0]*q[1]-q[0]*p[1];},0),contour=area<0?a.reverse():a;
      contour.forEach((p,i)=>i?m.lineTo(p[0],p[1]):m.moveTo(p[0],p[1]));m.closePath();
    }
    m.fill('nonzero');c.save();c.globalAlpha=.13;c.filter='blur(4px)';c.drawImage(this.mask,0,0,w,h);c.restore();
    this.meshRenderer.draw(c,faces,camera,w,h,dpr);this.figure.dataset.renderer=this.meshRenderer.backend;
  }
}

const figure=document.getElementById('aircraftShowcase');if(figure)new AircraftShowcase(figure);
