"""Agent security and job integration checks. No physical board is accessed.
python tests/agent_bridge.py [--real-compile]
"""
import copy
import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'agent'),str(ROOT/'scripts')]
from bridge import Agent,make_server,ORIGIN
from build_agent import prepare_assets

CONFIG={'format':'dronelab-config','version':1,'config':dict(mass=1.5,arm=.23,thrust=9,inertia=[.022,.022,.04],yawRatio=.018,
    posP=1.3,velP=2.5,velI=.35,attP=5,rateP=18,rateI=8,rateD=.12,tilt=30,speed=3),'waypoints':[]}

def temporary_home(prefix):
    base=(ROOT/'.test-artifacts').resolve();base.mkdir(exist_ok=True)
    temp=tempfile.TemporaryDirectory(prefix=prefix,dir=base)
    assert Path(temp.name).resolve().parent==base
    return temp

class FakeAgent(Agent):
    """Deterministic CLI substitute, including a deliberately fake USB port."""
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs);self.calls=[];self.fail_compile=False;self.missing_core=False
    def run(self,args,job=None,timeout=180):
        self.calls.append(args)
        if args[:2]==['board','list']:return json.dumps({'detected_ports':[{'port':{'address':'COM_TEST','protocol':'serial','label':'TEST ONLY'},'matching_boards':[]}]})
        if args[:2]==['core','list']:return json.dumps({'platforms':[] if self.missing_core else [{'id':'arduino:avr','installed_version':'1.8.8'}]})
        if args[0]=='compile':
            time.sleep(.15)
            if self.fail_compile:raise RuntimeError('TEST compilation failed')
            return '{"success":true}'
        return '{}'

def wait_job(agent,ident,owner='owner',timeout=30):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        value=agent.snapshot(ident,owner)
        if value['state'] in ['succeeded','failed']:return value
        time.sleep(.02)
    raise TimeoutError('Job did not finish')

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=temporary_home('dl-agent-test-');self.home=Path(self.tmp.name)
        self.assets=self.home/'assets';prepare_assets(self.assets)
        self.agent=FakeAgent(self.home/'home',self.assets,self.home/'fake-cli',lambda origin:True)
        self.board=next(b for b in self.agent.boards.values() if b['fqbn']=='arduino:avr:uno')
        self.payload={'action':'prepare','board':{'id':self.board['id']},'configuration':copy.deepcopy(CONFIG)}
        self.server=make_server(self.agent,0);threading.Thread(target=self.server.serve_forever,daemon=True).start()
    def tearDown(self):self.server.shutdown();self.server.server_close();self.tmp.cleanup()
    def request(self,path,body=None,token=None,origin=ORIGIN,headers=None,method=None):
        h={'Origin':origin} if origin else {}
        if body is not None:h['Content-Type']='application/json'
        if token:h['Authorization']='Bearer '+token
        h.update(headers or {});conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        conn.request(method or ('POST' if body is not None else 'GET'),path,json.dumps(body) if body is not None else None,h)
        res=conn.getresponse();data=json.loads(res.read() or '{}');out=(res.status,dict(res.headers),data);conn.close();return out
    def test_origin_host_and_pairing(self):
        self.assertEqual(self.request('/health',origin='https://untrusted.example')[0],403)
        self.assertEqual(self.request('/health',headers={'Host':'attacker.example'})[0],403)
        self.assertEqual(self.request('/ports')[0],403)
        self.assertEqual(self.request('/connect',{},origin='https://untrusted.example')[0],403)
        code,h,data=self.request('/connect',{});self.assertEqual(code,200)
        self.assertEqual(h['Access-Control-Allow-Origin'],ORIGIN);token=data['token']
        self.assertEqual(self.request('/ports',token=token)[2]['ports'][0]['address'],'COM_TEST')
        self.assertEqual(self.request('/ports',token=token,origin='https://untrusted.example')[0],403)
        self.agent.sessions[token]=(ORIGIN,time.monotonic()-1)
        self.assertEqual(self.request('/ports',token=token)[0],403)
        self.agent.approve=lambda origin:False
        self.assertEqual(self.request('/connect',{})[0],403)
    def test_cors_body_and_unknown_routes(self):
        code,h,_=self.request('/jobs',method='OPTIONS');self.assertEqual(code,204)
        self.assertEqual(h['Access-Control-Allow-Private-Network'],'true')
        self.assertNotIn('Access-Control-Allow-Origin',self.request('/health',origin='https://evil.example')[1])
        self.assertEqual(self.request('/connect',{},headers={'Content-Type':'text/plain'})[0],415)
        self.assertEqual(self.request('/connect',{},headers={'Content-Length':'262145'})[0],413)
        self.assertEqual(self.request('/unknown',token=self.agent.pair(ORIGIN))[0],404)
    def test_untrusted_board_and_configuration(self):
        for fqbn in ['a:b:c;echo','arduino:avr:uno:cpu=$(test)','a:b:c','https://evil/a:b:c']:
            with self.assertRaises(ValueError):self.agent.board({'id':'custom','fqbn':fqbn})
        self.assertEqual(self.agent.board({'id':'custom','name':'STM32','fqbn':'STMicroelectronics:stm32:GenF4'})['core'],'STMicroelectronics:stm32')
        p=copy.deepcopy(self.payload);p['board']['fqbn']='evil:override:board'
        self.assertEqual(self.agent.board(p['board'])['fqbn'],'arduino:avr:uno')
        for value in [float('nan'),True,'1;system()',-1]:
            p=copy.deepcopy(self.payload);p['configuration']['config']['mass']=value
            with self.assertRaises(ValueError):self.agent.start(p,'owner')
        p=copy.deepcopy(self.payload);p.update(action='upload',port='COM_EVIL')
        with self.assertRaises(ValueError):self.agent.start(p,'owner')
        self.assertFalse(any(a[0]=='upload' for a in self.agent.calls))
    def test_prepare_uses_bundled_code_and_private_results(self):
        self.agent.missing_core=True;self.payload['source']='malicious code ignored'
        ident=self.agent.start(self.payload,'owner')
        with self.assertRaises(ValueError):self.agent.start(self.payload,'owner')
        with self.assertRaises(KeyError):self.agent.snapshot(ident,'another-owner')
        result=wait_job(self.agent,ident);self.assertEqual(result['result'],dict(compiled=True,uploaded=False,outputsEnabled=False))
        install=next(a for a in self.agent.calls if a[:2]==['core','install'])
        self.assertIn('--skip-post-install',install);self.assertIn('--skip-pre-uninstall',install);self.assertIn('arduino:avr@1.8.8',install)
        folder=self.agent.home/'work'/ident/'DroneLab'
        self.assertIn('#define DL_ACTUATORS_ENABLED 0',(folder/'dl_board.h').read_text())
        self.assertEqual((folder/'DroneLab.ino').read_text(),(self.assets/'DroneLab.ino').read_text())
        self.assertNotIn('malicious',(folder/'dl_controller.h').read_text())
    def test_mock_upload_and_failed_compile(self):
        self.payload.update(action='upload',port='COM_TEST')
        job=self.agent.start(self.payload,'owner');self.assertTrue(wait_job(self.agent,job)['result']['uploaded'])
        upload=next(a for a in self.agent.calls if a[0]=='upload');self.assertIn('--input-dir',upload)
        self.agent.fail_compile=True;self.agent.calls=[]
        job=self.agent.start(self.payload,'owner');self.assertEqual(wait_job(self.agent,job)['state'],'failed')
        self.assertFalse(any(a[0]=='upload' for a in self.agent.calls));self.assertIsNone(self.agent.active)

    def test_airframes_and_untrusted_geometry(self):
        for profile in self.agent.frames.values():
            p=copy.deepcopy(self.payload);p['configuration'].update(version=2,geometry={'motor_count':999,'rotors':['untrusted']})
            p['configuration']['config'].update(airframe=profile['id'],hAspect=1.5)
            ident=self.agent.start(p,'owner');result=wait_job(self.agent,ident)
            self.assertEqual(result['state'],'succeeded')
            folder=self.agent.home/'work'/ident/'DroneLab'
            actual=json.loads((folder/'simulation-config.json').read_text())
            self.assertEqual(actual['geometry']['motor_count'],len(profile['positions']))
            self.assertNotIn('untrusted',(folder/'dl_controller.h').read_text())
            self.assertIn('#define DL_MOTOR_COUNT '+str(len(profile['positions'])),(folder/'dl_board.h').read_text())
        for value in ['y6','unknown',None]:
            p=copy.deepcopy(self.payload);p['configuration']['version']=2;p['configuration']['config']['airframe']=value
            with self.assertRaises(ValueError):self.agent.start(p,'owner')
        p=copy.deepcopy(self.payload);p['configuration']['config']['airframe']='octo-x'
        ident=self.agent.start(p,'owner');wait_job(self.agent,ident)
        actual=json.loads((self.agent.home/'work'/ident/'DroneLab'/'simulation-config.json').read_text())
        self.assertEqual(actual['geometry']['airframe'],'quad-x')

def real_compile():
    """Uses installed official CLI/core. Never enumerates or uploads a device."""
    with temporary_home('dl-real-') as temp:
        home=Path(temp);assets=home/'assets';prepare_assets(assets)
        agent=Agent(home/'home',assets,ROOT/'.test-artifacts/arduino/arduino-cli.exe',lambda origin:False)
        agent.config=ROOT/'.test-artifacts/arduino/arduino-cli.json'
        board=next(b for b in agent.boards.values() if b['fqbn']=='arduino:avr:uno')
        for frame in ['quad-x','octo-plus']:
            c=copy.deepcopy(CONFIG);c['version']=2;c['config'].update(airframe=frame,hAspect=1.5)
            ident=agent.start({'action':'prepare','board':board,'configuration':c},'test')
            result=wait_job(agent,ident,'test',timeout=900)
            if result['state']!='succeeded':raise RuntimeError(result['log'])
            print(json.dumps({'realCompile':'arduino:avr:uno','airframe':frame,'result':result['result']}))

if __name__=='__main__':
    if '--real-compile' in sys.argv:real_compile()
    else:unittest.main()
