"""Build the Windows per-user installer with bundled official Arduino CLI.
python scripts/build_agent.py --cli-zip .test-artifacts/arduino/cli.zip
No installer is run, no registry/user-profile installation happens here.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
CLI_ZIP_SHA256='fabe42e0eb04d00e776a66178299ff95a46c623dbc260f997e58fd514853dd40'

def prepare_assets(destination,cli_zip=None):
    destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
    source=(ROOT/'projets/drone-lab/arduino.js').read_text(encoding='utf-8')
    for key,name in [('SKETCH','DroneLab.ino'),('HAL','dl_hal.h')]:
        text=re.search(r'const '+key+r'=`([\s\S]*?)`;',source)[1]
        if '${' in text or '\\`' in text:raise ValueError('Template must remain a static literal')
        (destination/name).write_text(text,encoding='utf-8')
    boards=(ROOT/'projets/drone-lab/boards.js').read_text(encoding='utf-8')
    values=json.loads(re.search(r'export const BOARDS = ([\s\S]*);\s*$',boards)[1])
    (destination/'boards.json').write_text(json.dumps(values,ensure_ascii=False),encoding='utf-8')
    frames=(ROOT/'projets/drone-lab/airframes.js').read_text(encoding='utf-8')
    values=json.loads(re.search(r'export const AIRFRAMES = (\[[\s\S]*?\n\]);',frames)[1])
    (destination/'airframes.json').write_text(json.dumps(values,ensure_ascii=False),encoding='utf-8')
    shutil.copy2(ROOT/'projets/drone-lab/controller.c',destination/'controller.c')
    if cli_zip:
        if hashlib.sha256(Path(cli_zip).read_bytes()).hexdigest()!=CLI_ZIP_SHA256:
            raise ValueError('Archive différente de la distribution officielle Arduino CLI 1.5.1 Windows x64')
        shutil.copy2(cli_zip,destination/'arduino-cli.zip')
        archive=(destination/'arduino-cli.zip').read_bytes()
        licenses=destination/'licenses';licenses.mkdir(exist_ok=True)
        with zipfile.ZipFile(cli_zip) as z:
            exe=z.read('arduino-cli.exe')
            for name in z.namelist():
                if 'license' in name.lower() and '/' not in name and '\\' not in name:
                    (licenses/('ARDUINO-CLI-'+name)).write_bytes(z.read(name))
        shutil.copy2(ROOT/'agent/NOTICE.md',licenses/'NOTICE.md')
        python_license=Path(sys.base_prefix)/'LICENSE.txt'
        if python_license.exists():shutil.copy2(python_license,licenses/'PYTHON-LICENSE.txt')
        for source in (Path(sys.base_prefix)/'tcl').glob('*/license.terms'):
            shutil.copy2(source,licenses/(source.parent.name+'-LICENSE.txt'))
        import PyInstaller
        pyinstaller_license=Path(PyInstaller.__file__).parent.parent/'pyinstaller-6.22.3.dist-info'/'licenses'/'COPYING.txt'
        if pyinstaller_license.exists():shutil.copy2(pyinstaller_license,licenses/'PYINSTALLER-LICENSE.txt')
        manifest={'version':'1.1.0','arduinoCliVersion':'1.5.1','cliZipSha256':hashlib.sha256(archive).hexdigest(),
            'cliExeSha256':hashlib.sha256(exe).hexdigest(),'source':'https://github.com/arduino/arduino-cli/releases/tag/v1.5.1'}
        (destination/'bundle.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--cli-zip',type=Path,required=True);args=parser.parse_args()
    assets=ROOT/'.test-artifacts/agent-assets';prepare_assets(assets,args.cli_zip)
    destination=ROOT/'.test-artifacts/agent-release';destination.mkdir(exist_ok=True)
    # Isolate each build from files locked by a previous/interrupted Windows run.
    ident=secrets.token_hex(4);work=ROOT/'.test-artifacts'/('agent-build-'+ident)
    command=[sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onefile','--windowed','--name','DroneLab-Agent-Setup',
        '--distpath',str(destination),'--workpath',str(work),'--specpath',str(ROOT/'.test-artifacts'),
        '--add-data',str(assets)+':assets','--paths',str(ROOT/'agent'),str(ROOT/'agent/desktop.py')]
    cache=(ROOT/'.test-artifacts'/('pyinstaller-cache-'+ident)).resolve()
    for target in [cache,work.resolve(),destination.resolve()]:
        if not target.is_relative_to(ROOT.resolve()):raise ValueError('Build paths must remain inside the workspace')
    env=os.environ.copy();env['PYINSTALLER_CONFIG_DIR']=str(cache)
    subprocess.run(command,check=True,cwd=ROOT,env=env)
    exe=destination/'DroneLab-Agent-Setup.exe';digest=hashlib.sha256(exe.read_bytes()).hexdigest()
    (destination/'SHA256SUMS.txt').write_text(digest+'  '+exe.name+'\n',encoding='utf-8')
    print(json.dumps({'installer':str(exe),'bytes':exe.stat().st_size,'sha256':digest}))

if __name__=='__main__':main()
