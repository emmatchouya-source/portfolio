"""Infinite ground, near-plane clipping and world-anchored cruise motion."""
import json
import sys
from playwright.sync_api import sync_playwright,expect
from test_a380_lab import server,ARTIFACTS
from test_a380_trajectory import seek


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1512,'height':1080},device_scale_factor=1)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/?scenario=full&view=3d',wait_until='domcontentloaded')
        page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#flightTimeline').max>100",timeout=180000)
        expect(page.locator('.version')).to_have_text('v1.4.0')
        checks=page.evaluate('''async()=>{
          const {perspectiveCamera}=await import('./trajectory.js?v=1.3.2');
          const {clipSegment,clipPolygon,clipScreenSegment,clipScreenPolygon,groundScreenPolygon,groundGrid}=await import('./scene-ground.js?v=1.3.2');
          const checks=[],test=(name,pass)=>{if(!pass)throw Error(name);checks.push(name);};
          const camera=perspectiveCamera([0,-10,5],[0,0,0],800,400);
          const segment=clipSegment([0,-20,5],[0,20,0],camera);
          test('crossing segment survives near plane',segment.length===2&&segment.every(p=>camera.project(p)));
          test('entirely hidden segment culled',clipSegment([0,-30,6],[0,-40,8],camera).length===0);
          const slab=[[-100,-100,0],[100,-100,0],[100,100,0],[-100,100,0]];
          test('legacy slab had vertices behind camera',slab.some(p=>!camera.project(p)));
          test('visible part of polygon retained',clipPolygon(slab,camera).length>=3&&clipPolygon(slab,camera).every(p=>camera.project(p)));
          test('very distant projected lines clipped to screen',JSON.stringify(clipScreenSegment([-1e9,200],[1e9,200],800,400))==='[[0,200],[800,200]]');
          test('offscreen lines excluded',clipScreenSegment([-200,-200],[-10,-10],800,400).length===0);
          test('oversized projected polygon clipped to viewport',clipScreenPolygon([[-1e6,-1e6],[1e6,-1e6],[1e6,1e6],[-1e6,1e6]],800,400).every(p=>p[0]>=0&&p[0]<=800&&p[1]>=0&&p[1]<=400));
          const area=points=>Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
          // Independently cast pixel rays: the plane covers exactly downward rays, across aspect/zoom/pitch.
          for(const [w,h] of [[800,400],[390,500]])for(const pitch of [.035,.3,.48,1.53])for(const radius of [14,110,600]){
            const eye=[radius*Math.cos(pitch),0,100+radius*Math.sin(pitch)],target=[0,0,100];
            const c=perspectiveCamera(eye,target,w,h),polygon=groundScreenPolygon(c,w,h);
            test(`ground remains present ${w}/${pitch}/${radius}`,area(polygon)>w*h*.45);
            const inside=(x,y)=>{let n=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
              const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])n=!n;
            }return n;};
            for(const x of [w*.2,w*.8])for(const y of [h*.15,h*.85]){
              const ray=c.forward.map((v,i)=>v+(x-w/2)/c.lens*c.right[i]+(h*.53-y)/c.lens*c.up[i]);
              test('horizon agrees with independent ray-plane intersection',inside(x,y)===(-eye[2]/ray[2]>0));
            }
          }
          const g={origin:1234000,scale:.012,focus:[72,0,96],eye:[120,-80,150],radius:110},a=groundGrid(g),b=groundGrid({...g,origin:g.origin+125});
          const shared=a.labels.find(p=>b.labels.some(q=>p.metres===q.metres));
          const moved=b.labels.find(p=>p.metres===shared.metres);
          test('grid slides with true distance in tracking frame',Math.abs(moved.point[0]-shared.point[0]+125*g.scale)<1e-9);
          test('kilometre identities are anchored to world',a.labels.every(p=>Math.abs(p.metres-(g.origin+p.point[0]/g.scale))<1e-7));
          test('ground grid work remains bounded',a.segments.length<100);
          return checks.length;
        }''')
        print('Ground/camera checks:',checks,flush=True)
        with page.expect_download() as event:page.locator('#exportStudy').click()
        study=json.loads(event.value.path().read_text(encoding='utf-8'))
        track=study['result']['baseline'];phases={p['phase']:p for p in track['phases']}
        page.locator('#flightCanvas').scroll_into_view_if_needed()
        # Instrument the actual ground fill: no missing plane at approach/flare boundaries.
        page.evaluate('''()=>{window.groundFills=0;const proto=CanvasRenderingContext2D.prototype,old=proto.fill;
          proto.fill=function(...args){if(this.canvas.id==='flightCanvas'&&this.fillStyle instanceof CanvasGradient)window.groundFills++;return old.apply(this,args);};}''')
        for phase in ['cruise','descent','approach','flare','landing-roll']:
            interval=phases[phase]
            for t in [interval['startSeconds'],(interval['startSeconds']+interval['endSeconds'])/2,interval['endSeconds']-.01]:
                before=page.evaluate('window.groundFills')
                seek(page,t)
                page.wait_for_function('(n)=>window.groundFills>n',arg=before)
            if phase in ['cruise','approach','flare']:
                page.locator('#flightCanvas').screenshot(path=str(ARTIFACTS/f'ground-{phase}.png'))
            if phase=='cruise':
                coverage=page.locator('#flightCanvas').evaluate('''el=>{const d=el.getContext('2d').getImageData(0,0,el.width,el.height).data;let n=0;
                  for(let i=0;i<d.length;i+=4)if(d[i]===41&&d[i+1]===73&&d[i+2]===85)n++;return n/(el.width*el.height);}''')
                assert coverage<.02,('spurious broad grid band',coverage)
        cruise=phases['cruise'];t=(cruise['startSeconds']+cruise['endSeconds'])/2
        seek(page,t);page.wait_for_timeout(100)
        before=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
        seek(page,t+1);page.wait_for_timeout(100)
        assert before!=page.locator('#flightCanvas').evaluate('el=>el.toDataURL()')
        assert page.locator('#flightCamera').input_value()=='auto'
        # Check actual playing, not just seeking: reduced auto acceleration and moving scenery.
        page.locator('#flightPlay').click();page.wait_for_timeout(350);page.locator('#flightPlay').click()
        advance=float(page.locator('#flightTimeline').input_value())-(t+1)
        assert 0<advance<200,advance
        for camera in ['follow','top','side','orbit','arrival']:
            page.locator('#flightCamera').select_option(camera)
            page.wait_for_timeout(60)
        page.set_viewport_size({'width':390,'height':844})
        page.locator('#flightCamera').select_option('auto')
        seek(page,(phases['approach']['startSeconds']+phases['approach']['endSeconds'])/2)
        page.locator('#flightCanvas').scroll_into_view_if_needed();page.wait_for_timeout(150)
        page.locator('#trajectory').screenshot(path=str(ARTIFACTS/'ground-mobile.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        assert not errors,errors
        browser.close()
    print('Ground continuity, cruise motion, playback and mobile: PASS',flush=True)


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
