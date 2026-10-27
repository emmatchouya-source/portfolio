"""Browser -> real HTTP bridge -> fake CLI. No hardware is touched.
Optional --hosted tests the deployed HTTPS site with normal browser LNA permission.
"""
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright,expect
from browser_smoke import ROOT,QuietHandler
from agent_bridge import FakeAgent,temporary_home,prepare_assets
from bridge import make_server,ORIGIN

def main():
    hosted='--hosted' in sys.argv
    web=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=web.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{web.server_port}'
    with temporary_home('dl-browser-') as tmp:
        home=Path(tmp);assets=home/'assets';prepare_assets(assets)
        agent=FakeAgent(home/'home',assets,home/'fake-cli',lambda origin:True,origins=[origin,ORIGIN])
        approval_gate=threading.Event();ports_gate=threading.Event();original_ports=agent.ports
        agent.approve=lambda origin:approval_gate.wait(15)
        agent.ports=lambda:(ports_gate.wait(15),original_ports())[1]
        bridge=make_server(agent,0);threading.Thread(target=bridge.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(channel='msedge',headless=True)
                context=browser.new_context(viewport={'width':1440,'height':1080})
                # This suite exercises installation controls; physics/rendering
                # have their own browser_smoke suite. Keep its canvas quiescent.
                context.add_init_script('window.requestAnimationFrame=()=>0;')
                # Isolate the test from an agent the user may already be using.
                # Change only the dependency's port; browser CORS/LNA stay active.
                def test_agent_endpoint(route):
                    response=route.fetch()
                    body=response.text().replace('http://127.0.0.1:47831',f'http://127.0.0.1:{bridge.server_port}')
                    route.fulfill(response=response,body=body)
                context.route('**/agent-client.js*',test_agent_endpoint)
                if hosted:context.grant_permissions(['local-network-access'],origin=ORIGIN)
                page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('console',lambda message:print('BROWSER:',message.text) if message.type=='error' else None)
                page.goto(ORIGIN+'/portfolio/projets/drone-lab/?v=agent-connection-1' if hosted else origin+'/projets/drone-lab/',wait_until='networkidle')
                page.get_by_role('button',name='Cartes',exact=True).click()
                # Choose via the actual suggestions, not by mutating page state.
                page.locator('#boardSelect').fill('Arduino UNO')
                page.locator('#boardOptions [role=option]').filter(has_text='Arduino UNO · banc limité').click()
                page.locator('#openAgent').click()
                expect(page.locator('#agentDialog')).to_be_visible()
                assert page.locator('#agentDownload').get_attribute('href').endswith('/DroneLab-Agent-Setup.exe')
                expect(page.locator('#agentUpload')).to_be_disabled()
                expect(page.locator('#agentConnection')).to_have_text('Agent non connecté')
                page.locator('#agentConnect').click()
                expect(page.locator('#agentConnection')).to_contain_text('En attente d’autorisation',timeout=10000)
                expect(page.locator('#agentConnection')).to_have_attribute('data-state','connecting')
                approval_gate.set()
                # Confirmation must appear before USB discovery finishes.
                expect(page.locator('#agentConnection')).to_have_text('✓ Agent connecté')
                expect(page.locator('#agentConnection')).to_have_attribute('data-state','connected')
                expect(page.locator('#agentPortsRefresh')).to_be_disabled()
                ports_gate.set()
                page.wait_for_function('!document.querySelector("#agentConnect").disabled',timeout=15000)
                print('CONNECTION:',page.locator('#agentStatus').inner_text())
                expect(page.locator('#agentPrepare')).to_be_enabled(timeout=15000)
                assert page.locator('#agentPort').input_value()=='COM_TEST'
                assert not any(a[0]=='upload' for a in agent.calls)
                expect(page.locator('#agentConnect')).to_have_text('Vérifier la connexion')
                agent.ports=lambda:[];page.locator('#agentPortsRefresh').click()
                expect(page.locator('#agentStatus')).to_contain_text('Branche la carte')
                expect(page.locator('#agentConnection')).to_have_text('✓ Agent connecté')
                expect(page.locator('#agentUpload')).to_be_disabled()
                agent.ports=original_ports;page.locator('#agentPortsRefresh').click()
                expect(page.locator('#agentUpload')).to_be_enabled()
                page.locator('#agentPrepare').click()
                expect(page.locator('#agentStatus')).to_contain_text('Compilation réussie',timeout=15000)
                assert not any(a[0]=='upload' for a in agent.calls)
                page.locator('#agentUpload').click()
                expect(page.locator('#agentStatus')).to_contain_text('Programme de banc téléversé',timeout=15000)
                assert sum(a[0]=='upload' for a in agent.calls)==1
                # A failed compile must not proceed to a second upload.
                agent.fail_compile=True;page.locator('#agentUpload').click()
                expect(page.locator('#agentStatus')).to_contain_text('échoué',timeout=15000)
                assert sum(a[0]=='upload' for a in agent.calls)==1
                expect(page.locator('#agentLog')).to_contain_text('TEST compilation failed')
                expect(page.locator('#agentConnection')).to_have_text('✓ Agent connecté')
                # Dirty simulation parameters are rejected before a job starts.
                page.locator('#closeAgent').click();page.get_by_role('button',name='Drone',exact=True).click()
                page.locator('#mass').fill('1.6');page.get_by_role('button',name='Cartes',exact=True).click();page.locator('#openAgent').click()
                page.locator('#agentPrepare').click();expect(page.locator('#agentStatus')).to_contain_text('Applique les paramètres')
                page.locator('#agentConnection').scroll_into_view_if_needed()
                page.screenshot(path=str(ROOT/'.test-artifacts/agent-connected.png'))
                page.set_viewport_size({'width':390,'height':844})
                page.locator('#agentConnection').scroll_into_view_if_needed()
                page.locator('#agentDialog').screenshot(path=str(ROOT/'.test-artifacts/agent-mobile.png'))
                assert page.evaluate('document.querySelector("#agentDialog").scrollWidth<=document.querySelector("#agentDialog").clientWidth+1')
                # Closing the local server must clear the green confirmation.
                bridge.shutdown();bridge.server_close()
                expect(page.locator('#agentConnection')).to_contain_text('Agent déconnecté',timeout=16000)
                expect(page.locator('#agentConnection')).to_have_attribute('data-state','offline')
                expect(page.locator('#agentPrepare')).to_be_disabled()
                assert not errors,errors
                browser.close()
                print(json.dumps({'hosted':hosted,'browserBridge':'passed','physicalUpload':False,'pageErrors':errors}))
        finally:bridge.shutdown();bridge.server_close();web.shutdown();web.server_close()

if __name__=='__main__':main()
