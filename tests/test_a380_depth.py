"""Independently ray-cast wing/engine visibility across a full camera orbit."""
import json
import sys
from playwright.sync_api import sync_playwright
from test_a380_lab import server,ARTIFACTS


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':900,'height':750})
        page.goto(base+'/index.html',wait_until='domcontentloaded')
        result=page.evaluate('''async()=>{
          const {aircraftMesh}=await import('./projets/a380-lab/aircraft-mesh.js?v=1.3.6');
          const {DepthMeshRenderer}=await import('./projets/a380-lab/depth-mesh.js?v=1.3.6');
          const {perspectiveCamera,profileCamera}=await import('./projets/a380-lab/trajectory.js?v=1.3.6');
          const mesh=aircraftMesh().map(f=>({...f,kind:f.color==='#bed1dc'?'wing':['#98b7c9','#193649'].includes(f.color)?'engine':'other'}));
          const wing=mesh.filter(f=>f.kind==='wing'),engine=mesh.filter(f=>f.kind==='engine');
          if(Math.max(...engine.flatMap(f=>f.points.map(p=>p[2])))>=Math.min(...wing.flatMap(f=>f.points.map(p=>p[2]))))throw Error('engine geometry above wing');
          const colors={wing:'#e03060',engine:'#00ffcc',other:'#eeeeee'},faces=mesh.map(f=>({...f,color:colors[f.kind]}));
          const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
          const triangles=faces.flatMap(f=>f.points.slice(1,-1).map((_,i)=>({a:f.points[0],b:f.points[i+1],c:f.points[i+2],kind:f.kind})));
          // Moller-Trumbore ray intersections, independent of rasterization and depth interpolation.
          function intersect(eye,ray,t){
            const e1=sub(t.b,t.a),e2=sub(t.c,t.a),h=cross(ray,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)return null;
            const s=sub(eye,t.a),u=dot(s,h)/det;if(u<0||u>1)return null;
            const q=cross(s,e1),v=dot(ray,q)/det;if(v<0||u+v>1)return null;
            const distance=dot(e2,q)/det;return distance>0?{distance,edge:Math.min(u,v,1-u-v),kind:t.kind}:null;
          }
          const gpu=new DepthMeshRenderer({lighting:false,edges:false}),cpu=new DepthMeshRenderer({software:true,lighting:false,edges:false});
          const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');
          let wingOcclusions=0,engineOcclusions=0,probes=0;const cases=[];
          const expected={wing:[224,48,96],engine:[0,255,204],other:[238,238,238]};
          for(const elevation of [-.7,-.1,.3,.7,1.15])for(let angle=0;angle<12;angle++){
            const yaw=angle*Math.PI/6,eye=[29*Math.cos(elevation)*Math.cos(yaw),29*Math.cos(elevation)*Math.sin(yaw),29*Math.sin(elevation)];
            const camera=perspectiveCamera(eye,[0,0,.15],320,240),samples=[];
            const hitsAt=(x,y)=>{
              const ray=camera.forward.map((v,i)=>v+(x-160)/camera.lens*camera.right[i]+(240*.53-y)/camera.lens*camera.up[i]);
              return triangles.map(t=>intersect(eye,ray,t)).filter(Boolean).sort((a,b)=>a.distance-b.distance);
            };
            for(let y=35;y<215;y+=5)for(let x=20;x<300;x+=5){
              const hits=hitsAt(x+.5,y+.5);
              if(!hits.some(h=>h.kind==='wing')||!hits.some(h=>h.kind==='engine')||hits[0].edge<.045)continue;
              const first=hits[0];if(!['wing','engine'].includes(first.kind))continue;
              // Ignore partially covered silhouette/intersection pixels: GPU multisampling
              // correctly blends materials there. All pixel corners must agree with the ray oracle.
              if([[.05,.05],[.95,.05],[.05,.95],[.95,.95]].some(([dx,dy])=>hitsAt(x+dx,y+dy)[0]?.kind!==first.kind))continue;
              if(first.kind==='wing')wingOcclusions++;else engineOcclusions++;
              samples.push({x,y,kind:first.kind});
            }
            for(const renderer of [gpu,cpu])for(const order of [faces,[...faces].reverse()]){
              ctx.clearRect(0,0,320,240);renderer.draw(ctx,order,camera,320,240,1);const pixels=ctx.getImageData(0,0,320,240).data;
              for(const sample of samples){const index=(sample.y*320+sample.x)*4,color=expected[sample.kind];
                if(color.some((v,i)=>Math.abs(pixels[index+i]-v)>4))throw Error(JSON.stringify({elevation,yaw,backend:renderer.backend,sample,actual:[...pixels.slice(index,index+4)],expected:color}));
                probes++;
              }
            }
            cases.push({elevation,yaw,overlapSamples:samples.length});
          }
          if(wingOcclusions<20||engineOcclusions<5)throw Error(JSON.stringify({message:'insufficient overlap coverage',wingOcclusions,engineOcclusions,probes}));
          // A distant orthographic camera still needs enough depth precision to
          // distinguish closely separated surfaces (the faithful trajectory profile).
          const profile=profileCamera([0,0,0],320,240,20),planes=[
            {points:[[-2,-.05,-2],[2,-.05,-2],[2,-.05,2],[-2,-.05,2]],color:colors.wing},
            {points:[[-2,.05,-2],[2,.05,-2],[2,.05,2],[-2,.05,2]],color:colors.engine}];
          for(const renderer of [gpu,cpu])for(const order of [planes,[...planes].reverse()]){
            ctx.clearRect(0,0,320,240);renderer.draw(ctx,order,profile,320,240,1);const pixel=ctx.getImageData(160,127,1,1).data;
            if(expected.wing.some((v,i)=>Math.abs(pixel[i]-v)>4))throw Error('orthographic depth precision');
          }
          return {backend:gpu.backend,views:cases.length,wingOcclusions,engineOcclusions,probes,cases};
        }''')
        (ARTIFACTS/'engine-wing-depth.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print('Depth visibility:',json.dumps({k:v for k,v in result.items() if k!='cases'}),flush=True)
        browser.close()
    print('Wing/engine ray casting, reversed face order, GPU and software depth: PASS',flush=True)


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
