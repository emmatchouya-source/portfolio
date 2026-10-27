"""Compile exported projects with installed official Arduino CLI cores.
Run arduino_export.py first. Never uploads or connects to a board.
"""
from pathlib import Path
import json
import os
import subprocess
import shutil
import tempfile

def tool_path(path):
    """Older ARM GCC toolchains need short paths on Windows (MAX_PATH)."""
    if os.name!='nt':
        return str(path)
    import ctypes
    buffer=ctypes.create_unicode_buffer(32768)
    result=ctypes.windll.kernel32.GetShortPathNameW(str(path),buffer,len(buffer))
    return buffer.value if result else str(path)

ROOT=Path(__file__).resolve().parents[1]
ARTIFACT=ROOT/'.test-artifacts'

def main():
    cli=ARTIFACT/'arduino'/('arduino-cli.exe' if os.name=='nt' else 'arduino-cli')
    config=ARTIFACT/'arduino'/'arduino-cli.json'
    settings=json.loads(config.read_text(encoding='utf-8'))
    for key,value in settings.get('directories',{}).items():
        path=Path(value)
        path.mkdir(parents=True,exist_ok=True)
        settings['directories'][key]=tool_path(path)
    config.write_text(json.dumps(settings),encoding='utf-8')
    # CLI canonicalizes 8.3 directory names, so old GCC needs a genuinely
    # shorter compiler installation. Copy only ARM tools to the OS temp dir.
    compiler_paths={}
    if os.name=='nt':
        cache=ARTIFACT/'short-arduino-toolchains.json'
        saved=json.loads(cache.read_text()) if cache.exists() else {}
        for arch,version in [('renesas_uno','7-2017q4'),('sam','4.8.3-2014q1')]:
            target=Path(saved.get(arch,''))
            if not saved.get(arch) or not (target/'bin/arm-none-eabi-g++.exe').exists():
                source=Path(settings['directories']['data'])/'packages/arduino/tools/arm-none-eabi-gcc'/version
                target=Path(tempfile.mkdtemp(prefix='dl-arm-'))/'gcc'
                print('Preparing short-path ARM compiler: '+arch,flush=True)
                shutil.copytree(source,target)
                saved[arch]=str(target)
                cache.write_text(json.dumps(saved),encoding='utf-8')
            compiler_paths[arch]=str(target/'bin')+os.sep
    projects=json.loads((ARTIFACT/'arduino-projects.json').read_text(encoding='utf-8'))
    targets=['arduino:renesas_uno:minima','arduino:renesas_uno:unor4wifi','arduino:renesas_uno:nanor4',
             'arduino:avr:uno','arduino:avr:nano:cpu=atmega328','arduino:avr:mega:cpu=atmega2560',
             'arduino:avr:leonardo','arduino:avr:micro','arduino:sam:arduino_due_x','arduino:sam:arduino_due_x_dbg']
    results=[]
    for fqbn in targets:
        project=next(p for p in projects if p['board']['fqbn']==fqbn)
        folder=ARTIFACT/'arduino-projects'/project['files'][0]['name'].split('/')[0]
        build=ARTIFACT/'arduino-build'/project['board']['id']
        build.mkdir(parents=True,exist_ok=True)
        command=[tool_path(cli),'--config-file',tool_path(config),'compile','--fqbn',fqbn,'--build-path',tool_path(build),'--json',tool_path(folder)]
        arch=fqbn.split(':')[1]
        if arch in compiler_paths:
            command[command.index('--json'):command.index('--json')]=['--build-property','compiler.path='+compiler_paths[arch]]
        run=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=300)
        log=ARTIFACT/('compile-'+project['board']['id']+'.json')
        log.write_text(run.stdout+'\n'+run.stderr,encoding='utf-8')
        if run.returncode:
            print(run.stdout[-5000:]+run.stderr[-5000:],flush=True)
            raise RuntimeError('Compilation failed: '+fqbn)
        data=json.loads(run.stdout)
        result={'fqbn':fqbn,'success':True,'build':data}
        results.append(result)
        (ARTIFACT/'arduino-compile-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
        print('PASS: '+fqbn,flush=True)
    print(f'PASS: {len(results)} actual board/core compilation targets; no hardware upload performed',flush=True)

if __name__=='__main__':
    main()
