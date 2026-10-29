"""Engine pylons must intersect both the wing and the nacelle, on all four engines."""
import json
import sys
from playwright.sync_api import sync_playwright
from test_a380_lab import server, ARTIFACTS


def main(base):
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width': 1200, 'height': 850})
        page.goto(base+'/index.html', wait_until='domcontentloaded')
        result = page.evaluate('''async()=>{
          const {aircraftMesh}=await import('./projets/a380-lab/aircraft-mesh.js?v=1.3.7');
          const {DepthMeshRenderer}=await import('./projets/a380-lab/depth-mesh.js?v=1.3.7');
          const {perspectiveCamera}=await import('./projets/a380-lab/trajectory.js?v=1.3.7');
          const mesh=aircraftMesh(),pylons=mesh.filter(f=>f.part==='engine-pylon');
          const ids=[...new Set(pylons.map(f=>f.engine))];
          if(ids.length!==4||pylons.length!==24)throw Error('four solid pylons required');
          const triangles=mesh.filter(f=>f.color==='#bed1dc').flatMap(f=>[[f.points[0],f.points[1],f.points[2]],[f.points[0],f.points[2],f.points[3]]]);
          const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
          // Independent vertical ray intersections with the rendered wing triangles.
          function wingZ(point){
            const origin=[point[0],point[1],10],ray=[0,0,-1];
            for(const [a,b,c] of triangles){
              const e1=sub(b,a),e2=sub(c,a),h=cross(ray,e2),det=dot(e1,h);
              if(Math.abs(det)<1e-10)continue;
              const s=sub(origin,a),u=dot(s,h)/det,q=cross(s,e1),v=dot(ray,q)/det;
              if(u>=0&&v>=0&&u+v<=1)return 10-dot(e2,q)/det;
            }
            throw Error('pylon outside wing');
          }
          let attachments=0;
          for(const id of ids){
            const faces=pylons.filter(f=>f.engine===id),top=faces[0].points,bottom=faces[1].points;
            const nacelle=mesh.filter(f=>f.engine===id&&f.part==='engine-nacelle'),points=nacelle.flatMap(f=>f.points);
            const front=Math.max(...points.map(p=>p[0])),back=Math.min(...points.map(p=>p[0]));
            const bounds=axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))];
            const cy=bounds(1).reduce((a,b)=>a+b)/2,cz=bounds(2).reduce((a,b)=>a+b)/2;
            for(const point of top){const overlap=point[2]-wingZ(point);if(overlap<.015||overlap>.035)throw Error('missing wing contact');attachments++;}
            for(const point of bottom){
              // Interpolate the measured top shoulder of the 12-sided shell.
              const fraction=(front-point[0])/(front-back);
              const frontRadius=Math.max(...points.filter(p=>Math.abs(p[0]-front)<1e-8).map(p=>Math.abs(p[1]-cy)));
              const rearRadius=Math.max(...points.filter(p=>Math.abs(p[0]-back)<1e-8).map(p=>Math.abs(p[1]-cy)));
              const r=frontRadius+(rearRadius-frontRadius)*fraction;
              const ring=points.filter(p=>Math.abs(p[0]-front)<1e-8).sort((a,b)=>b[2]-a[2]);
              const peak=ring[0],shoulder=ring.find(p=>Math.abs(p[1]-cy)>.01);
              const slope=(peak[2]-shoulder[2])/Math.abs(shoulder[1]-cy);
              const shell=cz+r*(peak[2]-cz)/frontRadius-slope*Math.abs(point[1]-cy);
              if(point[0]<=back||point[0]>=front||shell-point[2]<.015||shell-point[2]>.035)throw Error('missing nacelle contact');attachments++;
            }
          }
          document.body.replaceChildren();document.body.style='margin:0;background:#edf4f5;display:grid;grid-template-columns:1fr 1fr';
          for(const software of [false,true])for(const eye of [[27,0,.5],[20,-18,8]]){
            const canvas=document.createElement('canvas');canvas.width=580;canvas.height=380;document.body.append(canvas);
            new DepthMeshRenderer({software}).draw(canvas.getContext('2d'),mesh,perspectiveCamera(eye,[0,0,0],580,380),580,380,1);
          }
          return {engines:ids.length,solidPylons:pylons.length/6,attachmentChecks:attachments};
        }''')
        page.screenshot(path=str(ARTIFACTS/'engine-pylons-front-oblique.png'))
        (ARTIFACTS/'engine-pylons.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print('Engine attachments:', json.dumps(result), 'PASS', flush=True)
        browser.close()


if __name__ == '__main__':
    if len(sys.argv) > 1:
        main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:
            main(base)
