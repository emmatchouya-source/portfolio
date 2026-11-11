"""Run existing independent checks with retained logs. Never compile/upload to physical hardware."""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import json
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.test-artifacts/audit-suite'

def run(name):
    t=time.monotonic()
    try:
        r=subprocess.run([sys.executable,'-X','utf8',str(ROOT/'tests'/name)],cwd=ROOT,capture_output=True,timeout=900)
        output=r.stdout+r.stderr
        (OUT/(name+'.log')).write_bytes(output)
        return {'test':name,'status':'PASS' if r.returncode==0 else 'FAIL','exit':r.returncode,'seconds':round(time.monotonic()-t,1),'log':name+'.log'}
    except subprocess.TimeoutExpired as e:
        (OUT/(name+'.log')).write_bytes((e.stdout or b'')+(e.stderr or b''))
        return {'test':name,'status':'TIMEOUT','seconds':round(time.monotonic()-t,1)}

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    results=[]
    tests=sorted(p.name for p in (ROOT/'tests').glob('test_a380_*.py'))
    # Artifact-producing DroneLab tests run sequentially after the A380 group.
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs={pool.submit(run,name):name for name in tests}
        for job in as_completed(jobs):
            result=job.result();results.append(result);print(json.dumps(result),flush=True)
            (OUT/'summary.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    for name in ['browser_smoke.py','airframes.py','native_controller.py','airframes_native.py','arduino_export.py','agent_bridge.py','agent_browser.py','airframes_agent.py']:
        result=run(name);results.append(result);print(json.dumps(result),flush=True)
        (OUT/'summary.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print('Suite complete:',json.dumps({s:sum(x['status']==s for x in results) for s in ['PASS','FAIL','TIMEOUT']}),flush=True)
    return 1 if any(r['status']!='PASS' for r in results) else 0

if __name__=='__main__':sys.exit(main())
