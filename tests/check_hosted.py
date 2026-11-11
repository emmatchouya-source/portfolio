"""Read-only check of existing GitHub Pages resources. The review branch is not deployed."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import json
import subprocess

ROOT=Path(__file__).resolve().parents[1]
BASE='https://emmatchouya-source.github.io/portfolio/'

def read(url):
    try:
        with urlopen(Request(url,headers={'User-Agent':'PortfolioAudit/1.0'}),timeout=20) as r:
            return {'url':url,'status':r.status,'bytes':int(r.headers.get('Content-Length','0'))}
    except HTTPError as e:return {'url':url,'status':e.code}
    except Exception as e:return {'url':url,'status':None,'error':type(e).__name__+': '+str(e)}

def main():
    files=subprocess.check_output(['git','ls-tree','-r','--name-only','36b575e'],cwd=ROOT).decode().splitlines()
    paths=[f for f in files if f.endswith(('.html','.js','.css','.svg','.png')) or f=='projets/a380-lab/data/project.json']
    with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(read,[BASE+f for f in paths]))
    external=[read('https://github.com/emmatchouya-source'),read('https://www.linkedin.com/in/emmanuel-tchouya')]
    report={'scope':'Existing production resources from base 36b575e only; review branch remains undeployed','resources':results,'externalProfiles':external}
    out=ROOT/'.test-artifacts';out.mkdir(exist_ok=True)
    (out/'hosted-resources.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    failed=[r for r in results if r['status']!=200]
    print(json.dumps({'resources':len(results),'http200':len(results)-len(failed),'failed':failed,'externalProfiles':external},ensure_ascii=False),flush=True)
    assert not failed,failed

if __name__=='__main__':main()
