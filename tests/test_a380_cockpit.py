"""Each windshield pane must sit outside the nose and remain fully visible face-on."""
import json
import sys
from playwright.sync_api import sync_playwright
from test_a380_lab import server,ARTIFACTS


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1200,'height':700})
        page.goto(base+'/index.html',wait_until='domcontentloaded')
        result=page.evaluate('''async()=>{
          const {aircraftMesh}=await import('./projets/a380-lab/aircraft-mesh.js?v=1.4.0');
          const {DepthMeshRenderer}=await import('./projets/a380-lab/depth-mesh.js?v=1.4.0');
          const {perspectiveCamera}=await import('./projets/a380-lab/trajectory.js?v=1.4.0');
          const mesh=aircraftMesh(),panes=mesh.filter(f=>f.part==='cockpit-glass');
          if(panes.length!==6)throw Error('six distinct glazing panes required');
          const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
          const data=mesh.map(f=>({...f,color:f.part==='cockpit-glass'?'#203b52':'#ffffff'}));
          const gpu=new DepthMeshRenderer({lighting:false,edges:false}),cpu=new DepthMeshRenderer({software:true,lighting:false,edges:false});
          const canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;const ctx=canvas.getContext('2d'),counts=[];
          for(const pane of panes){
            const center=pane.points.reduce((s,p)=>s.map((v,i)=>v+p[i]/4),[0,0,0]);
            let n=cross(sub(pane.points[1],pane.points[0]),sub(pane.points[3],pane.points[0]));
            if(dot(n,[0,center[1],center[2]])<0)n=n.map(v=>-v);const length=Math.hypot(...n);n=n.map(v=>v/length);
            // Compare all interior points to the supporting plane of the actual body facet.
            const body=mesh.filter(f=>f.color==='#eaf2f6').map(f=>{const a=f.points[0],normal=cross(sub(f.points[1],a),sub(f.points[3],a)),l=Math.hypot(...normal);return {a,n:normal.map(v=>v/l)};});
            const support=body.filter(f=>Math.abs(dot(f.n,n))>.999999).sort((a,b)=>Math.abs(dot(sub(center,a.a),a.n))-Math.abs(dot(sub(center,b.a),b.n)))[0];
            if(!support)throw Error('missing body support plane');
            for(const u of [.1,.3,.5,.7,.9])for(const v of [.1,.3,.5,.7,.9]){
              const a=pane.points[0].map((x,i)=>x+u*(pane.points[1][i]-x)),b=pane.points[3].map((x,i)=>x+u*(pane.points[2][i]-x)),point=a.map((x,i)=>x+v*(b[i]-x));
              if(dot(sub(point,support.a),n)<.01)throw Error('glazing buried in fuselage');
            }
            const camera=perspectiveCamera(center.map((v,i)=>v+6*n[i]),center,600,400),polygon=pane.points.map(camera.project),samples=[];
            // Independent screen polygon test, excluding antialiasing at borders.
            for(let y=0;y<400;y++)for(let x=0;x<600;x++){
              const signs=polygon.map((a,i)=>{const b=polygon[(i+1)%4];return ((b[0]-a[0])*(y+.5-a[1])-(b[1]-a[1])*(x+.5-a[0]))/Math.hypot(b[0]-a[0],b[1]-a[1]);});
              if(signs.every(v=>v>2)||signs.every(v=>v<-2))samples.push((y*600+x)*4);
            }
            if(samples.length<30)throw Error('insufficient pane coverage');
            for(const renderer of [gpu,cpu])for(const order of [data,[...data].reverse()]){
              ctx.clearRect(0,0,600,400);renderer.draw(ctx,order,camera,600,400,1);const pixels=ctx.getImageData(0,0,600,400).data;
              for(const i of samples)if([32,59,82].some((v,j)=>Math.abs(pixels[i+j]-v)>4))throw Error(JSON.stringify({message:'pane obscured by nose',center,backend:renderer.backend,pixel:i,actual:[...pixels.slice(i,i+4)]}));
            }
            counts.push(samples.length);
          }
          const display=new DepthMeshRenderer(),views=document.createElement('div');views.id='cockpitViews';views.style='display:flex;gap:12px;background:#edf4f5;padding:15px;';document.body.replaceChildren(views);
          for(const side of [-1,1]){const c=document.createElement('canvas');c.width=550;c.height=400;views.append(c);display.draw(c.getContext('2d'),mesh,perspectiveCamera([22,side*17,15],[3,0,0],550,400),550,400,1);}
          return {backend:gpu.backend,panes:panes.length,pixelProbes:counts.reduce((a,b)=>a+b,0)*4,counts};
        }''')
        page.locator('#cockpitViews').screenshot(path=str(ARTIFACTS/'cockpit-complete-both-sides.png'))
        (ARTIFACTS/'cockpit-visibility.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print('Cockpit glazing:',json.dumps(result),flush=True)
        browser.close()
    print('Six exterior panes, full visible interiors, GPU/software and reversed draw order: PASS',flush=True)


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
