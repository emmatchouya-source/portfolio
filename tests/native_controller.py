"""Compile exported C99 and compare its outputs against the JavaScript trace.
Run browser_smoke.py first. Requires cc/clang/gcc, or ziglang in
.test-artifacts/toolchain (python -m pip install --target ... ziglang==0.15.2).
"""
from pathlib import Path
import json
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / '.test-artifacts'

def vector(values):
    return '{' + ','.join(format(v, '.17g') for v in values) + '}'

def main():
    trace = json.loads((ARTIFACT / 'controller-trace.json').read_text(encoding='utf-8'))
    rows = []
    for item in trace:
        s, t = item['state'], item['target']
        state = '{' + ','.join(vector(s[k]) for k in ['p', 'v', 'q', 'w']) + '}'
        target = '{' + ','.join(vector(t[k]) for k in ['p', 'v', 'a']) + ',' + str(t['yaw']) + '}'
        rows.append('{' + state + ',' + target + ',' + vector(item['out']) + '}')
    harness = '''#include <stdio.h>
#include "dronelab_controller.c"
typedef struct {DL_State state; DL_Target target; double expected[4];} Case;
static const Case cases[] = {
''' + ',\n'.join(rows) + '''
};
int main(void){
    DL_Controller ctl; DL_Output out; dl_reset(&ctl);double worst=0;
    for(unsigned i=0;i<sizeof(cases)/sizeof(cases[0]);i++){
        if(!dl_step(&ctl,&DL_DEFAULT,&cases[i].state,&cases[i].target,1./240.,true,&out))return 2;
        for(int j=0;j<4;j++){
            double err=fabs(out.motor_N[j]-cases[i].expected[j]);
            if(err>worst)worst=err;
            if(err>1e-9){printf("Parity failure row %u motor %d: %.12g\\n",i,j,err);return 3;}
        }
    }
    if(!dl_step(&ctl,&DL_DEFAULT,&cases[0].state,&cases[0].target,1./240.,false,&out))return 4;
    for(int j=0;j<4;j++)if(out.motor_N[j]!=0)return 5;
    if(dl_step(&ctl,&DL_DEFAULT,&cases[0].state,&cases[0].target,0,true,&out))return 6;
    for(int j=0;j<4;j++)if(out.motor_N[j]!=0)return 7;
    DL_State bad=cases[0].state;bad.p[0]=NAN;
    if(dl_step(&ctl,&DL_DEFAULT,&bad,&cases[0].target,1./240.,true,&out))return 8;
    bad=cases[0].state;bad.q[0]=2;
    if(dl_step(&ctl,&DL_DEFAULT,&bad,&cases[0].target,1./240.,true,&out))return 9;
    printf("PASS: C99 compilation, 100-step JS/C parity (max error %.3g N), disarm and invalid-input checks\\n",worst);
    return 0;
}
'''
    source = ARTIFACT / 'controller_harness.c'
    source.write_text(harness, encoding='utf-8')
    zig = ARTIFACT / 'toolchain' / 'ziglang' / ('zig.exe' if os.name == 'nt' else 'zig')
    env = os.environ.copy()
    env['ZIG_GLOBAL_CACHE_DIR'] = str(ARTIFACT / 'zig-global-cache')
    env['ZIG_LOCAL_CACHE_DIR'] = str(ARTIFACT / 'zig-local-cache')
    if zig.exists():
        compiler = [str(zig), 'cc']
        if os.name == 'nt':
            compiler += ['-target', 'x86_64-windows-gnu']
    else:
        found = next((shutil.which(c) for c in ['cc', 'clang', 'gcc'] if shutil.which(c)), None)
        if not found:
            raise RuntimeError('No C99 compiler available. Install cc/clang/gcc or the documented local ziglang toolchain.')
        compiler = [found]
    binary = ARTIFACT / ('controller_test.exe' if os.name == 'nt' else 'controller_test')
    subprocess.run(compiler + ['-std=c99', '-O2', '-Wall', '-Wextra', '-Werror', '-pedantic', str(source), '-o', str(binary), '-lm'], env=env, check=True, timeout=240)
    subprocess.run([str(binary)], check=True, timeout=10)

if __name__ == '__main__':
    main()
