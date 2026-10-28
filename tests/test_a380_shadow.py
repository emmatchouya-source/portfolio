"""Ground projection, mask union, altitude exaggeration and scene regression."""
import sys
from playwright.sync_api import sync_playwright,expect
from test_a380_lab import server,ARTIFACTS
from test_a380_trajectory import seek


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1512,'height':1080},device_scale_factor=2)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/?scenario=full&view=3d',wait_until='domcontentloaded')
        page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#flightTimeline').max>100",timeout=180000)
        checks=page.evaluate('''async()=>{
          const {shadowFootprint,drawGroundShadow}=await import('./shadow.js?v=1.3.1');
          const checks=[],test=(name,pass)=>{if(!pass)throw Error(name);checks.push(name);};
          const face={points:[[20,20,105],[100,20,105],[20,100,105]]};
          const g={center:[25,25,100],groundZ:8,heightMetres:100,worldScale:1};
          const footprint=shadowFootprint([face],g)[0];
          // Analytic ray-plane intersection: p + t * (.3,.4,-.86).
          test('directional light ray hits ground',footprint.every((v,i)=>Math.abs(v[0]-(face.points[i][0]+105*.3/.86))<1e-10&&Math.abs(v[1]-(face.points[i][1]+105*.4/.86))<1e-10&&v[2]===8));
          const stretched={points:face.points.map(p=>[p[0],p[1],p[2]+900])};
          test('vertical exaggeration cannot move ground shadow',JSON.stringify(footprint)===JSON.stringify(shadowFootprint([stretched],{...g,center:[25,25,1000]})[0]));
          const project=p=>[p[0],p[1],1],mask=document.createElement('canvas');
          const canvas=document.createElement('canvas');canvas.width=200;canvas.height=200;const c=canvas.getContext('2d');
          const render=(faces,heightMetres)=>{c.clearRect(0,0,200,200);drawGroundShadow(c,mask,faces,{...g,heightMetres},project,200,200,1);return [...c.getImageData(0,0,200,200).data];};
          const single=render([face],0),double=render([face,face],0);
          const alpha=data=>data.filter((_,i)=>i%4===3),peak=data=>data.reduce((a,b)=>Math.max(a,b),0),sum=data=>data.reduce((a,b)=>a+b,0);
          // Raster edge coverage can differ slightly for coincident contours.
          test('overlapping mesh faces do not multiply opacity',peak(alpha(single))===peak(alpha(double))&&Math.abs(sum(alpha(single))-sum(alpha(double)))<sum(alpha(single))*.02);
          test('ground silhouette is visible',single.some((v,i)=>i%4===3&&v>0));
          const high=render([face],8000);test('no fixed dark cruise marker',high.every(v=>v===0));
          return checks;
        }''')
        print('Shadow geometry/raster checks:',len(checks),flush=True)
        page.locator('#flightCanvas').scroll_into_view_if_needed()
        page.wait_for_timeout(250)
        page.locator('#flightCanvas').screenshot(path=str(ARTIFACTS/'shadow-departure.png'))
        for phase,camera,name in [('Rotation','departure','rotation'),('Arrondi','arrival','flare'),('Arrêt final','arrival','stop')]:
            page.locator('#flightStages').get_by_role('button',name=phase,exact=True).click()
            expect(page.locator('#flightCamera')).to_have_value(camera)
            page.locator('#flightCanvas').scroll_into_view_if_needed()
            page.wait_for_timeout(150)
            page.locator('#flightCanvas').screenshot(path=str(ARTIFACTS/f'shadow-{name}.png'))
        values=[page.locator('#flight'+k).inner_text() for k in ['Distance','Altitude','Fuel']]
        for camera in ['top','side','orbit','departure','arrival']:
            page.locator('#flightCamera').select_option(camera)
            page.wait_for_timeout(100)
        assert values==[page.locator('#flight'+k).inner_text() for k in ['Distance','Altitude','Fuel']]
        mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
        mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)))
        mp.goto(base+'/projets/a380-lab/?scenario=full&view=3d',wait_until='domcontentloaded')
        mp.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#flightTimeline').max>100",timeout=180000)
        mp.locator('#flightCanvas').scroll_into_view_if_needed();mp.wait_for_timeout(150)
        mp.locator('#flightCanvas').screenshot(path=str(ARTIFACTS/'shadow-mobile.png'))
        assert not errors,errors
        browser.close()
    print('Shadow projection, scene cameras and mobile: PASS',flush=True)


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
