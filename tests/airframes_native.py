"""Compile C99 and check 700 JS/C controller steps plus invalid-geometry stops.
Requires tests/airframes.py first. No hardware access.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from native_controller import ROOT,ARTIFACT,vector

def main():
    traces=json.loads((ARTIFACT/'airframe-traces.json').read_text())
    source=(ROOT/'projets/drone-lab/controller.c').read_text(encoding='utf-8');configs=[];rows=[]
    for index,trace in enumerate(traces):
        initial=re.search(r'static const DL_Config DL_DEFAULT = \{[\s\S]*?\n\};',trace['c'])[0]
        configs.append(initial.replace('DL_DEFAULT',f'CONFIG_{index}'))
        for item in trace['rows']:
            state='{'+','.join(vector(item['state'][k]) for k in ['p','v','q','w'])+'}'
            target='{'+','.join(vector(item['target'][k]) for k in ['p','v','a'])+','+str(item['target']['yaw'])+'}'
            expected=vector(item['out']+[0]*(8-len(item['out'])))
            rows.append('{'+','.join([str(index),state,target,expected,'true' if item['saturated'] else 'false'])+'}')
    harness=source+'\n#include <stdio.h>\n'+'\n'.join(configs)+'''
typedef struct {unsigned config;DL_State state;DL_Target target;double expected[DL_MAX_MOTORS];bool saturated;} Case;
static const DL_Config *configs[]={'''+','.join('&CONFIG_'+str(i) for i in range(len(configs)))+'''};
static const Case cases[]={'''+',\n'.join(rows)+'''};
static bool zero(const DL_Output *out){for(unsigned i=0;i<DL_MAX_MOTORS;i++)if(out->motor_N[i]!=0)return false;return true;}
int main(void){
  DL_Controller ctl;DL_Output out;double worst=0;unsigned previous=99;
  for(unsigned i=0;i<sizeof(cases)/sizeof(cases[0]);i++){
    const Case *t=&cases[i];const DL_Config *c=configs[t->config];
    if(previous!=t->config){dl_reset(&ctl);previous=t->config;}
    if(!dl_step(&ctl,c,&t->state,&t->target,1./240.,true,&out))return 2;
    if(out.motor_count!=c->motor_count||out.saturated!=t->saturated)return 3;
    for(unsigned j=0;j<DL_MAX_MOTORS;j++){
      double error=fabs(out.motor_N[j]-t->expected[j]);if(error>worst)worst=error;
      if(error>1e-9){printf("Parity failure geometry %u row %u motor %u: %.12g\\n",t->config,i,j,error);return 4;}
    }
  }
  const Case *t=&cases[0];
  for(unsigned k=0;k<sizeof(configs)/sizeof(configs[0]);k++){
    DL_Config rounded=*configs[k];
    for(unsigned j=0;j<rounded.motor_count;j++)for(unsigned a=0;a<3;a++)rounded.rotors[j][a]=(float)rounded.rotors[j][a];
    double moment[3]={.01,-.02,.001};
    if(!dl_allocate(&rounded,14.7,moment,&out))return 10;
    if(!dl_step(&ctl,configs[k],&t->state,&t->target,1./240.,false,&out)||!zero(&out))return 5;
    DL_Config bad=*configs[k];bad.motor_count=9;
    if(dl_step(&ctl,&bad,&t->state,&t->target,1./240.,true,&out)||!zero(&out))return 6;
    bad=*configs[k];bad.rotors[0][0]=NAN;
    if(dl_step(&ctl,&bad,&t->state,&t->target,1./240.,true,&out)||!zero(&out))return 7;
    bad=*configs[k];for(unsigned j=0;j<bad.motor_count;j++)bad.rotors[j][1]=0;
    if(dl_step(&ctl,&bad,&t->state,&t->target,1./240.,true,&out)||!zero(&out))return 8;
  }
  DL_State bad=t->state;bad.q[0]=2;
  if(dl_step(&ctl,&DL_DEFAULT,&bad,&t->target,1./240.,true,&out)||!zero(&out))return 9;
  printf("PASS: 7 layouts, 700 JS/C steps, all 8 outputs checked, max error %.3g N; invalid geometries/disarm return zeros\\n",worst);
  return 0;
}
'''
    path=ARTIFACT/'airframes_harness.c';path.write_text(harness,encoding='utf-8')
    zig=ARTIFACT/'toolchain/ziglang'/('zig.exe' if os.name=='nt' else 'zig')
    compiler=[str(zig),'cc'] if zig.exists() else [next((shutil.which(c) for c in ['cc','clang','gcc'] if shutil.which(c)),'cc')]
    if zig.exists() and os.name=='nt':compiler+=['-target','x86_64-windows-gnu']
    env=os.environ.copy();env.update(ZIG_GLOBAL_CACHE_DIR=str(ARTIFACT/'zig-global-cache'),ZIG_LOCAL_CACHE_DIR=str(ARTIFACT/'zig-local-cache'))
    binary=ARTIFACT/('airframes_test.exe' if os.name=='nt' else 'airframes_test')
    subprocess.run(compiler+['-std=c99','-O2','-Wall','-Wextra','-Werror','-pedantic',str(path),'-o',str(binary),'-lm'],env=env,check=True,timeout=240)
    subprocess.run([str(binary)],check=True,timeout=10)

if __name__=='__main__':main()
