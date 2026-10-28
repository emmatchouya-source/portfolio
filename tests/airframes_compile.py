"""Compile all 7 layouts for UNO AVR and UNO R4. Never uploads a device."""
import json
import os
import subprocess
import hashlib
import re
from arduino_compile import ROOT,ARTIFACT,tool_path

def main():
    cli=ARTIFACT/'arduino/arduino-cli.exe';config=ARTIFACT/'arduino/arduino-cli.json'
    short=json.loads((ARTIFACT/'short-arduino-toolchains.json').read_text()) if os.name=='nt' else {}
    projects=json.loads((ARTIFACT/'airframe-projects.json').read_text());results=[]
    for project in projects:
        board=project['board'];fqbn=board['fqbn'];arch=fqbn.split(':')[1]
        folder=ARTIFACT/'airframe-projects'/project['airframe']/project['files'][0]['name'].split('/')[0]
        source=(ROOT/'projets/drone-lab/controller.c').read_text(encoding='utf-8')
        normalize=lambda text:re.sub(r'/\* CONFIG_BEGIN \*/[\s\S]*?/\* CONFIG_END \*/','CONFIG',text.removeprefix('#pragma once\n')).strip()
        if normalize((folder/'dl_controller.h').read_text(encoding='utf-8'))!=normalize(source):raise RuntimeError('Rerun airframes.py after controller changes')
        build=ARTIFACT/'airframe-build'/project['airframe']/board['id'];build.mkdir(parents=True,exist_ok=True)
        args=[str(cli),'--config-file',str(config),'compile','--fqbn',fqbn,'--build-path',str(build),'--json']
        if arch in short:args+=['--build-property','compiler.path='+str(os.path.join(short[arch],'bin'))+os.sep]
        args.append(str(folder));run=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=300)
        (build/'result.json').write_text(run.stdout+'\n'+run.stderr,encoding='utf-8')
        if run.returncode:raise RuntimeError(fqbn+' / '+project['airframe']+'\n'+run.stdout[-6000:]+run.stderr[-2000:])
        result={'fqbn':fqbn,'airframe':project['airframe'],'success':True,'controllerSha256':hashlib.sha256(source.encode('utf-8')).hexdigest(),'build':json.loads(run.stdout)}
        results.append(result);(ARTIFACT/'airframe-compile-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
        print('PASS: '+fqbn+' / '+project['airframe'],flush=True)
    print('PASS: 14 board/geometry builds; no USB enumeration or hardware upload',flush=True)

if __name__=='__main__':main()
