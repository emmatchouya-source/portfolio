"""DroneLab loopback bridge. Only bundled bench templates are compiled.
No remote command execution, client source files or arbitrary download URLs.
"""
from __future__ import annotations
import json
import math
import os
from pathlib import Path
import queue
import re
import secrets
import subprocess
import threading
import time
import copy
from geometry import geometry,controller_initial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION='1.1.0'
PORT=47831
ORIGIN='https://emmatchouya-source.github.io'
FQBN=re.compile(r'^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+=[A-Za-z0-9_.-]+(?:,[A-Za-z0-9_.-]+=[A-Za-z0-9_.-]+)*)?$')
EXTRA_INDEX={'esp32:esp32':'https://espressif.github.io/arduino-esp32/package_esp32_index.json',
 'rp2040:rp2040':'https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json',
 'SiliconLabs:silabs':'https://siliconlabs.github.io/arduino/package_arduinosilabs_index.json',
 'teensy:avr':'https://www.pjrc.com/teensy/package_teensy_index.json',
 'STMicroelectronics:stm32':'https://github.com/stm32duino/BoardManagerFiles/raw/main/package_stmicroelectronics_index.json'}
LIMITS={'mass':(.1,10),'arm':(.07,.7),'thrust':(.5,80),'yawRatio':(.005,.05),'posP':(.1,4),
 'velP':(.1,8),'velI':(0,2),'attP':(.5,12),'rateP':(1,45),'rateI':(0,25),'rateD':(0,.5),'tilt':(5,45),'speed':(.5,8)}

def checked_config(value,frames):
    if not isinstance(value,dict) or value.get('format')!='dronelab-config' or value.get('version') not in [1,2]:
        raise ValueError('Configuration DroneLab non reconnue.')
    value=copy.deepcopy(value)
    c=value.get('config',{})
    if not isinstance(c,dict):raise ValueError('Configuration de drone invalide.')
    if value['version']==1:c['airframe']='quad-x'
    elif not c.get('airframe'):raise ValueError('Géométrie de drone manquante.')
    c.setdefault('hAspect',1.5)
    for key,(lo,hi) in LIMITS.items():
        v=c.get(key)
        if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not lo<=v<=hi:
            raise ValueError('Paramètre invalide : '+key)
    inertia=c.get('inertia')
    if not isinstance(inertia,list) or len(inertia)!=3 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not .0001<=v<=2 for v in inertia):
        raise ValueError('Inerties invalides.')
    g=geometry(c,frames)
    if any(v>sum(inertia)-v for v in inertia) or g['motor_count']*c['thrust']<1.3*9.80665*c['mass']:
        raise ValueError('Inerties ou poussées incompatibles.')
    value['geometry']=g;value['version']=2
    json.dumps(value,allow_nan=False)
    return value

class Agent:
    def __init__(self,home,assets,cli,approve,origins=None,event=None):
        self.home=Path(home).resolve();self.home.mkdir(parents=True,exist_ok=True)
        self.assets=Path(assets).resolve();self.cli=str(Path(cli).resolve());self.approve=approve
        self.origins=set(origins or [ORIGIN]);self.event=event or (lambda text:None)
        self.boards={b['id']:b for b in json.loads((self.assets/'boards.json').read_text(encoding='utf-8'))}
        self.frames={f['id']:f for f in json.loads((self.assets/'airframes.json').read_text(encoding='utf-8'))}
        self.cores={b['core'] for b in self.boards.values()}|set(EXTRA_INDEX)
        self.sessions={};self.jobs={};self.lock=threading.RLock();self.active=None;self.ports_cache=[]
        self.pair_lock=threading.Lock()
        self.config=self.home/'arduino-cli.json'
        dirs={key:str(self.home/key) for key in ['data','downloads','user']}
        for path in dirs.values():Path(path).mkdir(exist_ok=True)
        self.config.write_text(json.dumps({'directories':dirs}),encoding='utf-8')

    def pair(self,origin):
        if not self.pair_lock.acquire(blocking=False):raise ValueError('Une autorisation est déjà en attente dans la fenêtre de l’agent.')
        try:
            if not self.approve(origin):raise PermissionError('Connexion non autorisée dans l’agent.')
            token=secrets.token_urlsafe(32)
            with self.lock:self.sessions[token]=(origin,time.monotonic()+3600)
            self.event('DroneLab connecté. Autorisation valable une heure.')
            return token
        finally:self.pair_lock.release()

    def authorized(self,token,origin):
        with self.lock:session=self.sessions.get(token)
        return bool(session and session[0]==origin and session[1]>time.monotonic())

    def board(self,value):
        if not isinstance(value,dict):raise ValueError('Carte manquante.')
        if value.get('id')!='custom':
            b=self.boards.get(value.get('id'))
            if not b:raise ValueError('Carte absente du catalogue de l’agent. Mettre l’agent à jour.')
            return b.copy()
        fqbn=value.get('fqbn','');name=value.get('name','Carte personnalisée')
        if not isinstance(fqbn,str) or len(fqbn)>220 or not FQBN.fullmatch(fqbn):raise ValueError('FQBN invalide.')
        core=':'.join(fqbn.split(':')[:2])
        if core not in self.cores:raise ValueError('Paquet personnalisé non pris en charge par cet agent.')
        if not isinstance(name,str) or len(name)>80 or any(ord(c)<32 for c in name):raise ValueError('Nom de carte invalide.')
        return {'id':'custom','name':name,'fqbn':fqbn,'core':core,'limited':bool(value.get('limited')), 'validation':None,'notes':'Profil personnalisé'}

    def run(self,args,job=None,timeout=180):
        # List arguments, shell=False, no commands or paths supplied by the page.
        command=[self.cli,'--config-file',str(self.config),'--no-color',*args]
        options={'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {'start_new_session':True}
        proc=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',**options)
        lines=queue.Queue();collected=[];deadline=time.monotonic()+timeout
        def reader():
            for line in proc.stdout:lines.put(line)
            lines.put(None)
        threading.Thread(target=reader,daemon=True).start()
        try:
            while True:
                if time.monotonic()>deadline:raise TimeoutError('Délai dépassé. Vérifier Internet, le câble et la carte.')
                try:line=lines.get(timeout=.2)
                except queue.Empty:continue
                if line is None:break
                if sum(map(len,collected))<3000000:collected.append(line)
                if job:self.log(job,line.strip()[:1600])
            proc.wait(timeout=10)
        except BaseException:
            if proc.poll() is None:
                if os.name=='nt':subprocess.run(['taskkill','/PID',str(proc.pid),'/T','/F'],creationflags=subprocess.CREATE_NO_WINDOW,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                else:
                    import signal
                    os.killpg(proc.pid,signal.SIGKILL)
                proc.wait(timeout=10)
            raise
        text=''.join(collected)
        if proc.returncode:raise RuntimeError(text[-6000:] or 'Échec Arduino CLI.')
        return text

    def ports(self):
        with self.lock:
            if self.active:return self.ports_cache
        data=json.loads(self.run(['board','list','--json'],timeout=90))
        result=[]
        for item in data.get('detected_ports',[]):
            p=item.get('port',{});address=p.get('address','');protocol=p.get('protocol','')
            if protocol in ['serial','dfu','usb','teensy'] and address and not address.startswith('-'):
                result.append({'address':address,'protocol':protocol,'label':p.get('label',address),
                    'boards':[{'name':b.get('name',''),'fqbn':b.get('fqbn','')} for b in item.get('matching_boards',[])]})
        self.ports_cache=result
        return result

    def log(self,job,text):
        with self.lock:
            job['log'].append(text);job['log']=job['log'][-100:]

    def phase(self,job,value):
        with self.lock:job['phase']=value
        self.event(value)

    def project(self,job):
        board=job['board'];c=job['configuration']['config'];folder=self.home/'work'/job['id']/'DroneLab'
        folder.mkdir(parents=True,exist_ok=False)
        g=geometry(c,self.frames);initial=controller_initial(c,g)
        controller=(self.assets/'controller.c').read_text(encoding='utf-8')
        controller=re.sub(r'/\* CONFIG_BEGIN \*/[\s\S]*?/\* CONFIG_END \*/','/* CONFIG_BEGIN */\n'+initial+'\n/* CONFIG_END */',controller)
        header='#pragma once\n#define DL_BOARD_NAME '+json.dumps(board['name'],ensure_ascii=True)+'\n#define DL_BOARD_FQBN '+json.dumps(board['fqbn'])+'\n#define DL_CONTROL_HZ 240UL\n#define DL_PERIOD_US ((1000000UL + DL_CONTROL_HZ/2) / DL_CONTROL_HZ)\n#define DL_STATE_MAX_AGE_US 20000UL\n#define DL_LIMITED_PROFILE '+('1' if board.get('limited') else '0')+'\n#define DL_ACTUATORS_ENABLED 0\n'
        header+='#define DL_AIRFRAME_NAME '+json.dumps(g['airframe'])+'\n#define DL_MOTOR_COUNT '+str(g['motor_count'])+'\n'
        files={'DroneLab.ino':(self.assets/'DroneLab.ino').read_text(encoding='utf-8'),'dl_hal.h':(self.assets/'dl_hal.h').read_text(encoding='utf-8'),
            'dl_controller.h':'#pragma once\n'+controller,'dl_board.h':header,'simulation-config.json':json.dumps(job['configuration'],allow_nan=False,indent=2)}
        for name,content in files.items():(folder/name).write_text(content,encoding='utf-8')
        return folder

    def start(self,payload,owner):
        if not isinstance(payload,dict) or payload.get('action') not in ['prepare','upload']:raise ValueError('Action non reconnue.')
        board=self.board(payload.get('board'));configuration=checked_config(payload.get('configuration'),self.frames)
        port=payload.get('port','')
        if payload['action']=='upload':
            if not isinstance(port,str) or len(port)>200 or not any(p['address']==port for p in self.ports()):raise ValueError('Choisir un port USB détecté par l’agent.')
        with self.lock:
            if self.active:raise ValueError('Un traitement est déjà en cours.')
            ident=secrets.token_hex(8)
            job={'id':ident,'owner':owner,'state':'queued','phase':'Préparation','log':[],'action':payload['action'],
                 'board':board,'configuration':configuration,'port':port,'result':None,'started':time.monotonic()}
            self.jobs[ident]=job;self.active=ident
            if len(self.jobs)>20:
                oldest=next(iter(self.jobs));self.jobs.pop(oldest)
        threading.Thread(target=self.execute,args=(job,),daemon=True).start()
        return ident

    def execute(self,job):
        try:
            job['state']='running';b=job['board'];extra=['--additional-urls',EXTRA_INDEX[b['core']]] if b['core'] in EXTRA_INDEX else []
            self.phase(job,'Préparation des outils de la carte')
            try:installed=json.loads(self.run(['core','list','--json']))
            except (RuntimeError,json.JSONDecodeError):installed={'platforms':[]}
            platforms=installed.get('platforms',[]) if isinstance(installed,dict) else installed
            version=(b.get('validation') or {}).get('coreVersion')
            present=any(p.get('id')==b['core'] and (not version or p.get('installed_version',p.get('version'))==version) for p in platforms)
            if not present:
                self.run(['core','update-index',*extra],job,timeout=300)
                self.run(['core','install',b['core']+('@'+version if version else ''),'--skip-post-install','--skip-pre-uninstall',*extra],job,timeout=1800)
            folder=self.project(job)
            build=folder.parent/'build'
            self.phase(job,'Compilation du programme de banc')
            data=json.loads(self.run(['compile','--fqbn',b['fqbn'],'--build-path',str(build),'--json',str(folder)],job,timeout=600))
            if not data.get('success'):raise RuntimeError('La compilation a échoué.')
            if job['action']=='upload':
                self.phase(job,'Téléversement sur '+job['port'])
                self.run(['upload','--fqbn',b['fqbn'],'--port',job['port'],'--input-dir',str(build),str(folder)],job,timeout=180)
            job['result']={'compiled':True,'uploaded':job['action']=='upload','outputsEnabled':False}
            job['state']='succeeded';self.phase(job,'Téléversement terminé' if job['action']=='upload' else 'Compilation terminée')
        except Exception as exc:
            job['state']='failed';self.log(job,str(exc));self.phase(job,'Échec : consulter le journal')
        finally:
            with self.lock:self.active=None

    def snapshot(self,ident,owner):
        with self.lock:
            job=self.jobs.get(ident)
            if not job or job['owner']!=owner:raise KeyError('Traitement introuvable.')
            return {k:job[k] for k in ['id','state','phase','result']}|{'log':'\n'.join(job['log'])[-16000:]}

def make_server(agent,port=PORT):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def origin_ok(self):
            host=self.headers.get('Host','')
            origin=self.headers.get('Origin')
            return host in [f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'] and origin in agent.origins
        def send(self,status,value):
            data=json.dumps(value,ensure_ascii=False,allow_nan=False).encode('utf-8');self.send_response(status)
            if self.origin_ok():self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
            self.send_header('Vary','Origin');self.send_header('Cache-Control','no-store');self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        def do_OPTIONS(self):
            if not self.origin_ok():return self.send(403,{'error':'Origine refusée.'})
            self.send_response(204);self.send_header('Access-Control-Allow-Origin',self.headers['Origin']);self.send_header('Vary','Origin')
            self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS');self.send_header('Access-Control-Allow-Headers','Content-Type, Authorization')
            self.send_header('Access-Control-Allow-Private-Network','true');self.send_header('Content-Length','0');self.end_headers()
        def access(self):
            if not self.origin_ok():raise PermissionError('Origine refusée.')
            token=self.headers.get('Authorization','').removeprefix('Bearer ')
            if not agent.authorized(token,self.headers.get('Origin')):raise PermissionError('Connecter et autoriser l’agent depuis DroneLab.')
            return token
        def do_GET(self):
            try:
                if self.path=='/health':
                    if self.headers.get('Origin') and not self.origin_ok():raise PermissionError('Origine refusée.')
                    if self.headers.get('Host') not in [f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}']:raise PermissionError('Hôte refusé.')
                    return self.send(200,{'application':'DroneLab Agent','version':VERSION,'busy':agent.active is not None})
                owner=self.access()
                if self.path=='/ports':return self.send(200,{'ports':agent.ports()})
                if re.fullmatch(r'/jobs/[0-9a-f]{16}',self.path):return self.send(200,agent.snapshot(self.path.rsplit('/',1)[1],owner))
                self.send(404,{'error':'Route introuvable.'})
            except PermissionError as exc:self.send(403,{'error':str(exc)})
            except KeyError as exc:self.send(404,{'error':str(exc)})
            except Exception as exc:self.send(400,{'error':str(exc)[-6000:]})
        def do_POST(self):
            try:
                if not self.origin_ok():raise PermissionError('Origine refusée.')
                if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.send(415,{'error':'JSON requis.'})
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=262144:return self.send(413,{'error':'Requête trop volumineuse.'})
                body=json.loads(self.rfile.read(length))
                if self.path=='/connect':return self.send(200,{'token':agent.pair(self.headers['Origin']),'version':VERSION})
                owner=self.access()
                if self.path=='/jobs':return self.send(202,{'id':agent.start(body,owner)})
                self.send(404,{'error':'Route introuvable.'})
            except PermissionError as exc:self.send(403,{'error':str(exc)})
            except Exception as exc:self.send(400,{'error':str(exc)[-6000:]})
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler);server.daemon_threads=True
    return server
