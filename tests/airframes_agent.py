"""Verify browser and local-agent exports encode the same numeric controller.
Requires airframes.py. Uses no CLI and accesses no device.
"""
import copy
import json
from pathlib import Path
import re
import sys
from agent_bridge import ROOT,FakeAgent,temporary_home,prepare_assets,wait_job

def initial_numbers(text):
    block=re.search(r'static const DL_Config DL_DEFAULT = \{([\s\S]*?)\n\};',text)[1]
    return [float(v) for v in re.findall(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?',block,re.I)]

with temporary_home('dl-geometry-parity-') as temp:
    home=Path(temp);assets=home/'assets';prepare_assets(assets)
    agent=FakeAgent(home/'home',assets,home/'no-cli',lambda origin:False)
    board=next(b for b in agent.boards.values() if b['fqbn']=='arduino:avr:uno')
    traces=json.loads((ROOT/'.test-artifacts/airframe-traces.json').read_text())
    for trace in traces:
        configuration=copy.deepcopy(trace['configuration'])
        expected=configuration['geometry'];configuration['geometry']={'rotors':'FORGED','motor_count':999}
        ident=agent.start({'action':'prepare','board':board,'configuration':configuration},'test');result=wait_job(agent,ident,'test')
        assert result['state']=='succeeded',result
        folder=agent.home/'work'/ident/'DroneLab'
        actual=json.loads((folder/'simulation-config.json').read_text())['geometry']
        assert actual['motor_count']==expected['motor_count']
        for a,b in zip(actual['rotors'],expected['rotors']):
            assert all(abs(a[k]-b[k])<1e-14 for k in ['x','y','spin'])
        a=initial_numbers((folder/'dl_controller.h').read_text());b=initial_numbers(trace['c'])
        assert len(a)==len(b) and all(abs(x-y)<1e-13 for x,y in zip(a,b)),trace['id']
    print('PASS: 7 browser/agent controller configurations agree; supplied rotor arrays ignored')
