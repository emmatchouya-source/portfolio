// Shared opaque-mesh renderer: visibility is resolved per pixel, never by face centroid.
import {SUN_DIRECTION} from './shadow.js?v=1.5.0';

function colorFor(face,lighting){
  const color=[1,3,5].map(i=>parseInt(face.color.slice(i,i+2),16)/255);
  if(!lighting)return color;
  const [a,b,c]=face.points,u=b.map((v,i)=>v-a[i]),v=c.map((q,i)=>q-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)||1;
  const light=.66+.34*Math.abs(n.reduce((s,x,i)=>s+x*SUN_DIRECTION[i],0))/length;
  return color.map(x=>Math.min(1,x*light));
}

const vertexSource=`attribute vec3 position;attribute vec4 color;
uniform vec3 eye,right,up,forward;uniform vec2 lensScale;
uniform float orthographic,nearPlane,farPlane;varying lowp vec4 tint;
void main(){vec3 delta=position-eye;float x=dot(delta,right),y=dot(delta,up),z=dot(delta,forward);
  if(orthographic>0.5)gl_Position=vec4(lensScale.x*x,lensScale.y*y-0.06,2.0*z/(farPlane-nearPlane)-(farPlane+nearPlane)/(farPlane-nearPlane),1.0);
  else gl_Position=vec4(lensScale.x*x,lensScale.y*y-0.06*z,(farPlane+nearPlane)/(farPlane-nearPlane)*z-2.0*farPlane*nearPlane/(farPlane-nearPlane),z);
  tint=color;}`;
const fragmentSource=`precision mediump float;varying lowp vec4 tint;void main(){gl_FragColor=tint;}`;

export class DepthMeshRenderer{
  constructor({software=false,lighting=true,edges=true,onRestore=()=>{}}={}){
    this.lighting=lighting;this.edges=edges;this.onRestore=onRestore;this.lost=false;
    this.canvas=document.createElement('canvas');this.softwareCanvas=document.createElement('canvas');
    if(!software){
      try{this.gl=this.canvas.getContext('webgl',{alpha:true,depth:true,antialias:true,premultipliedAlpha:true});if(this.gl)this.initialize();}catch{this.gl=null;}
      this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.onRestore();});
      this.canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.initialize();this.onRestore();});
    }
    this.backend=this.gl?'webgl-depth':'software-depth';
  }
  initialize(){
    const gl=this.gl,shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const vs=shader(gl.VERTEX_SHADER,vertexSource),fs=shader(gl.FRAGMENT_SHADER,fragmentSource),program=gl.createProgram();
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    this.program=program;this.buffer=gl.createBuffer();this.locations={};
    for(const name of ['eye','right','up','forward','lensScale','orthographic','nearPlane','farPlane'])this.locations[name]=gl.getUniformLocation(program,name);
    this.position=gl.getAttribLocation(program,'position');this.color=gl.getAttribLocation(program,'color');
  }
  draw(ctx,faces,camera,width,height,dpr=1){
    if(!faces.length)return;
    if(this.gl&&!this.lost){
      this.backend='webgl-depth';this.drawGL(faces,camera,width,height,dpr);ctx.drawImage(this.canvas,0,0,width,height);
    }else{
      this.backend='software-depth';this.drawSoftware(faces,camera,width,height,dpr);ctx.drawImage(this.softwareCanvas,0,0,width,height);
    }
  }
  drawGL(faces,camera,width,height,dpr){
    const gl=this.gl,w=Math.round(width*dpr),h=Math.round(height*dpr);
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    const triangles=[],lines=[],vertex=(out,p,color,alpha=1)=>out.push(...p,...color,alpha);
    let minDepth=Infinity,maxDepth=-Infinity;
    for(const face of faces){
      const color=colorFor(face,this.lighting),points=face.points;
      for(const p of points){const depth=p.reduce((s,v,i)=>s+(v-camera.eye[i])*camera.forward[i],0);minDepth=Math.min(minDepth,depth);maxDepth=Math.max(maxDepth,depth);}
      for(let i=1;i<points.length-1;i++)for(const p of [points[0],points[i],points[i+1]])vertex(triangles,p,color);
      if(this.edges)for(let i=0;i<points.length;i++)for(const p of [points[i],points[(i+1)%points.length]])vertex(lines,p,[.16,.31,.39],.22);
    }
    gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
    for(const name of ['eye','right','up','forward'])gl.uniform3fv(this.locations[name],camera[name]);
    gl.uniform2f(this.locations.lensScale,2*camera.lens/width,2*camera.lens/height);
    const margin=Math.max(1,maxDepth-minDepth),near=Math.max(camera.near,minDepth-margin),far=Math.max(near+1,maxDepth+margin);
    gl.uniform1f(this.locations.orthographic,camera.orthographic?1:0);gl.uniform1f(this.locations.nearPlane,near);gl.uniform1f(this.locations.farPlane,far);
    const upload=data=>{
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.position);gl.vertexAttribPointer(this.position,3,gl.FLOAT,false,28,0);
      gl.enableVertexAttribArray(this.color);gl.vertexAttribPointer(this.color,4,gl.FLOAT,false,28,12);
    };
    if(this.edges){gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);}
    upload(triangles);gl.drawArrays(gl.TRIANGLES,0,triangles.length/7);gl.disable(gl.POLYGON_OFFSET_FILL);
    if(lines.length){
      gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      upload(lines);gl.drawArrays(gl.LINES,0,lines.length/7);gl.depthMask(true);
    }
  }
  drawSoftware(faces,camera,width,height,dpr){
    // Correct depth fallback for blocked/unavailable/lost WebGL contexts.
    const ratio=Math.min(dpr,1.5),w=Math.round(width*ratio),h=Math.round(height*ratio),canvas=this.softwareCanvas;
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;this.image=null;}
    const ctx=canvas.getContext('2d');
    if(!this.image){this.image=ctx.createImageData(w,h);this.depth=new Float64Array(w*h);}
    const rgba=this.image.data,depth=this.depth;rgba.fill(0);depth.fill(Infinity);
    for(const face of faces){
      const color=colorFor(face,this.lighting).map(v=>Math.round(v*255));
      const points=face.points.map(p=>camera.project(p));if(points.some(p=>!p))continue;
      for(let i=1;i<points.length-1;i++){
        const [a,b,c]=[points[0],points[i],points[i+1]].map(p=>[p[0]*w/width,p[1]*h/height,p[2]]);
        const area=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(area)<1e-10)continue;
        const xmin=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),xmax=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0])));
        const ymin=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),ymax=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
        for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
          const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/area;
          const v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/area,t=1-u-v;
          if(u<0||v<0||t<0)continue;
          const z=camera.orthographic?u*a[2]+v*b[2]+t*c[2]:1/(u/a[2]+v/b[2]+t/c[2]),index=y*w+x;
          if(z>=depth[index])continue;depth[index]=z;const pixel=index*4;rgba[pixel]=color[0];rgba[pixel+1]=color[1];rgba[pixel+2]=color[2];rgba[pixel+3]=255;
        }
      }
    }
    ctx.putImageData(this.image,0,0);
  }
}
