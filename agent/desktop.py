"""Per-user Windows installer and visible DroneLab Agent window."""
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import sys
import threading
import urllib.request
import webbrowser
import zipfile
import tkinter as tk
from tkinter import messagebox,ttk
from bridge import Agent,make_server,PORT,VERSION,ORIGIN

SITE=ORIGIN+'/portfolio/projets/drone-lab/?v=agent-1'

def assets_path():
    if hasattr(sys,'_MEIPASS'):return Path(sys._MEIPASS)/'assets'
    return Path(__file__).resolve().parents[1]/'.test-artifacts'/'agent-assets'

def provision(home,assets):
    home.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((assets/'bundle.json').read_text(encoding='utf-8'))
    archive=assets/'arduino-cli.zip'
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=manifest['cliZipSha256']:raise RuntimeError('L’archive Arduino CLI est altérée.')
    cli=home/'bin'/'arduino-cli.exe';cli.parent.mkdir(exist_ok=True)
    if not cli.exists() or hashlib.sha256(cli.read_bytes()).hexdigest()!=manifest['cliExeSha256']:
        with zipfile.ZipFile(archive) as z:
            data=z.read('arduino-cli.exe')
        if hashlib.sha256(data).hexdigest()!=manifest['cliExeSha256']:raise RuntimeError('Arduino CLI est altéré.')
        temporary=cli.with_suffix('.tmp');temporary.write_bytes(data);temporary.replace(cli)
    notices=home/'licenses';notices.mkdir(exist_ok=True)
    for source in (assets/'licenses').glob('*'):
        shutil.copy2(source,notices/source.name)
    return cli

def install_current_user(home,assets):
    cli=provision(home,assets)
    if getattr(sys,'frozen',False):
        installed=home/'DroneLab-Agent.exe';source=Path(sys.executable).resolve()
        if source!=installed.resolve():
            temporary=home/'DroneLab-Agent.new.exe';shutil.copy2(source,temporary);temporary.replace(installed)
        import winreg
        base=r'Software\Classes\dronelab-agent'
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER,base) as key:
            winreg.SetValueEx(key,'',0,winreg.REG_SZ,'URL:DroneLab Agent')
            winreg.SetValueEx(key,'URL Protocol',0,winreg.REG_SZ,'')
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER,base+r'\shell\open\command') as key:
            # The browser URL is deliberately NOT passed as a command argument.
            winreg.SetValueEx(key,'',0,winreg.REG_SZ,f'"{installed}" --open')
    return cli

def self_test(home,assets):
    cli=provision(home,assets)
    run=subprocess.run([str(cli),'version','--json'],capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW,timeout=30)
    if run.returncode:raise RuntimeError(run.stderr)
    root=tk.Tk();root.withdraw();ttk.Label(root,text='DroneLab').pack();root.update();root.destroy()
    result={'version':VERSION,'cli':json.loads(run.stdout),'assets':all((assets/name).is_file() for name in ['boards.json','DroneLab.ino','dl_hal.h','controller.c']),
            'tk':True,'installedToUserProfile':False,'registryModified':False}
    (home/'agent-selftest.json').write_text(json.dumps(result,indent=2),encoding='utf-8')

def main():
    assets=assets_path()
    if len(sys.argv)==3 and sys.argv[1]=='--self-test':
        try:self_test(Path(sys.argv[2]).resolve(),assets)
        except Exception as exc:
            Path(sys.argv[2]).mkdir(parents=True,exist_ok=True)
            (Path(sys.argv[2])/'agent-selftest-error.txt').write_text(str(exc),encoding='utf-8')
            raise
        return
    if sys.platform!='win32':raise RuntimeError('Cet installateur cible Windows x64.')
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health',timeout=1) as response:
            if json.load(response).get('application')=='DroneLab Agent':return
    except Exception:pass
    home=Path(os.environ['LOCALAPPDATA'])/'DroneLabAgent'
    events=queue.Queue();root=tk.Tk();root.title('DroneLab Agent');root.geometry('570x365');root.minsize(500,350)
    root.configure(bg='#111821')
    style=ttk.Style();style.theme_use('clam');style.configure('TButton',padding=9)
    frame=tk.Frame(root,bg='#111821',padx=28,pady=25);frame.pack(fill='both',expand=True)
    tk.Label(frame,text='DRONELAB  ·  AGENT LOCAL',bg='#111821',fg='#5ee0bc',font=('Segoe UI',17,'bold')).pack(anchor='w')
    tk.Label(frame,text='Installation dans ton compte Windows, sans commande à saisir.',bg='#111821',fg='#aabac8',wraplength=500,justify='left',font=('Segoe UI',10)).pack(anchor='w',pady=(12,18))
    status=tk.StringVar(value='Installation de l’agent…')
    tk.Label(frame,textvariable=status,bg='#111821',fg='#edf4f8',wraplength=490,justify='left',font=('Segoe UI',11)).pack(anchor='w')
    progress=ttk.Progressbar(frame,mode='indeterminate');progress.pack(fill='x',pady=17);progress.start()
    tk.Label(frame,text='Garde cette fenêtre ouverte pendant l’utilisation.\nLes outils de la carte seront téléchargés à la première préparation.\nLes pilotes USB ne sont pas installés par cet agent.',bg='#111821',fg='#859aab',justify='left',font=('Segoe UI',9)).pack(anchor='w')
    buttons=tk.Frame(frame,bg='#111821');buttons.pack(fill='x',pady=20)
    ttk.Button(buttons,text='Ouvrir DroneLab',command=lambda:webbrowser.open(SITE)).pack(side='left')
    state={'agent':None,'server':None}
    def approve(origin):
        event=threading.Event();result=[];events.put(('approve',origin,event,result))
        if not event.wait(60):return False
        return bool(result and result[0])
    def setup():
        try:
            cli=install_current_user(home,assets)
            agent=Agent(home,assets,cli,approve,event=lambda text:events.put(('status',text)))
            server=make_server(agent);state.update(agent=agent,server=server)
            threading.Thread(target=server.serve_forever,daemon=True).start();events.put(('ready',))
        except Exception as exc:events.put(('error',str(exc)))
    def stop():
        if state['agent'] and state['agent'].active:
            messagebox.showinfo('Traitement en cours','Attends la fin du traitement avant de fermer l’agent.',parent=root);return
        if state['server']:threading.Thread(target=state['server'].shutdown,daemon=True).start()
        root.destroy()
    ttk.Button(buttons,text='Fermer l’agent',command=stop).pack(side='right');root.protocol('WM_DELETE_WINDOW',stop)
    def poll():
        try:
            while True:
                event=events.get_nowait()
                if event[0]=='ready':progress.stop();progress.pack_forget();status.set('Agent prêt. Dans DroneLab, clique sur « Connecter l’agent ».')
                elif event[0]=='status':status.set(event[1])
                elif event[0]=='error':progress.stop();status.set('Installation interrompue : '+event[1])
                elif event[0]=='approve':
                    _,origin,done,result=event
                    answer=messagebox.askyesno('Autoriser DroneLab ?',f'Autoriser {origin} à détecter les ports USB et à préparer, compiler et téléverser le programme de banc DroneLab ?\n\nL’autorisation dure une heure. Le programme conserve les sorties moteurs inactives.',parent=root)
                    result.append(answer);done.set()
        except queue.Empty:pass
        root.after(120,poll)
    threading.Thread(target=setup,daemon=True).start();poll();root.mainloop()

if __name__=='__main__':main()
