"""Validate board catalogue, ZIP export and Arduino integration UI.
Creates selected projects under .test-artifacts for actual Arduino CLI builds.
Run: python tests/arduino_export.py
"""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import json
import threading
import zipfile
from playwright.sync_api import sync_playwright
from browser_smoke import ROOT, QuietHandler

def main():
    artifact=ROOT/'.test-artifacts'
    artifact.mkdir(exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(channel='msedge',headless=True)
            page=browser.new_page(viewport={'width':1440,'height':1080})
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/projets/drone-lab/',wait_until='networkidle')
            page.wait_for_selector('#boardOptions option',state='attached')
            result=page.evaluate('''async()=>{
              const {BOARDS}=await import('./boards.js');
              const {Simulation}=await import('./core.js');
              const {arduinoFiles,arduinoZip,customBoard}=await import('./arduino.js');
              const {crc32,zipStore}=await import('./zip.js');
              const template=await (await fetch('controller.c')).text(),sim=new Simulation();
              const assert=(ok,message)=>{if(!ok)throw Error(message);};
              assert(new Set(BOARDS.map(b=>b.id)).size===BOARDS.length,'Duplicate profile IDs');
              assert(crc32(new TextEncoder().encode('123456789'))===0xcbf43926,'CRC32 reference');
              let invalid=0;
              for(const fqbn of ['arduino:avr:uno;echo','bad','a:b:c/../../file','a:b:c:x=foo bar','a:b:c:x=$(test)']){try{customBoard({name:'Test',fqbn});}catch{invalid++;}}
              assert(invalid===5,'Reject invalid FQBN / shell metacharacters');
              let pathRejected=false;try{zipStore([{name:'../bad',content:'no'}]);}catch{pathRejected=true;}assert(pathRejected,'ZIP path traversal');
              const projects=[];
              for(const board of BOARDS){
                const files=arduinoFiles(template,sim,board),manifest=JSON.parse(files.find(f=>f.name.endsWith('/manifest.json')).content),header=files.find(f=>f.name.endsWith('/dl_board.h')).content;
                assert(manifest.board.id===board.id&&!manifest.actuators_enabled,'Manifest and inactive outputs');
                assert(header.includes('#define DL_ACTUATORS_ENABLED 0'),'Inactive actuator compile flag');
                assert(header.includes('#define DL_LIMITED_PROFILE '+(board.limited?1:0)),'Limited profile classification');
                assert(files.length===7&&files[0].name.endsWith('.ino'),'Project layout');
                const zip=arduinoZip(template,sim,board);assert(zip[0]===0x50&&zip[1]===0x4b,'ZIP signature');
                if(['arduino:renesas_uno','arduino:avr','arduino:sam'].includes(board.core))projects.push({board,files});
              }
              const custom=customBoard({name:'STM32 — test',fqbn:'STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F411CE'});
              assert(arduinoFiles(template,sim,custom).length===7,'Custom STM32 export');
              return {count:BOARDS.length,projects};
            }''')
            projects=artifact/'arduino-projects'
            projects.mkdir(exist_ok=True)
            for project in result['projects']:
                for f in project['files']:
                    path=projects/f['name']
                    path.parent.mkdir(parents=True,exist_ok=True)
                    path.write_text(f['content'],encoding='utf-8')
            (artifact/'arduino-projects.json').write_text(json.dumps(result['projects'],ensure_ascii=False),encoding='utf-8')
            page.get_by_role('button',name='Cartes',exact=True).click()
            assert page.locator('#dirtyBadge').is_hidden()
            assert page.locator('#boardSearch').count()==0, 'Search and selection must be one field'
            page.locator('#boardSelect').fill('Nano')
            assert page.locator('#exportArduino').is_disabled(), 'Partial query must not export the previous board'
            assert 'pour ce filtre' in page.locator('#boardCount').inner_text()
            page.locator('#boardGroup').select_option('Arduino 8 bits')
            page.locator('#boardSelect').fill('Arduino UNO · banc limité')
            assert 'BANC UNIQUEMENT' in page.locator('#boardDetails').inner_text()
            assert page.locator('#dirtyBadge').is_hidden(), 'Hardware selection must not dirty simulation parameters'
            with page.expect_download() as event:
                page.locator('#exportArduino').click()
            zip_path=artifact/'arduino-export.zip'
            event.value.save_as(zip_path)
            with zipfile.ZipFile(zip_path) as z:
                assert z.testzip() is None, 'ZIP CRC failure'
                assert len(z.namelist())==7
                manifest=json.loads(z.read(next(n for n in z.namelist() if n.endswith('manifest.json'))))
                assert manifest['board']['fqbn']=='arduino:avr:uno'
                assert manifest['board']['limited'] is True
            page.locator('#customBoardToggle').check()
            assert page.locator('#exportArduino').is_disabled()
            page.locator('#customBoardName').fill('STM32 test')
            page.locator('#customBoardFqbn').fill('STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F411CE')
            assert page.locator('#exportArduino').is_enabled()
            with page.expect_download() as event:
                page.locator('#exportArduino').click()
            event.value.save_as(artifact/'custom-board.zip')
            page.locator('#customBoardToggle').uncheck()
            page.locator('#boardGroup').select_option('')
            page.locator('#boardSelect').fill('Arduino UNO R4 Minima')
            page.screenshot(path=str(artifact/'boards-desktop.png'),full_page=True)
            page.set_viewport_size({'width':390,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Hardware UI mobile overflow'
            assert not errors,errors
            browser.close()
            print(f"PASS: {result['count']} profile exports, CRC32, ZIP extraction, inactive outputs, custom profiles, filters and mobile UI")
    finally:
        server.shutdown()
        server.server_close()

if __name__=='__main__':
    main()
