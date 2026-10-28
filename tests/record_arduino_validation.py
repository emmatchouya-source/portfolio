"""Record successful Arduino CLI template builds in the board catalogue.
Run after arduino_compile.py. Copies no host paths into the published source.
"""
from pathlib import Path
import json
import re
import hashlib

ROOT=Path(__file__).resolve().parents[1]

def main():
    path=ROOT/'projets/drone-lab/boards.js'
    source=path.read_text(encoding='utf-8')
    match=re.search(r'export const BOARDS = ([\s\S]*);\s*$',source)
    boards=json.loads(match[1])
    results=json.loads((ROOT/'.test-artifacts/arduino-compile-results.json').read_text(encoding='utf-8'))
    passed={}
    for result in results:
        if not result.get('success') or not result.get('build',{}).get('success'):
            raise RuntimeError('Cannot record an unsuccessful compilation')
        if result.get('controllerSha256')!=hashlib.sha256((ROOT/'projets/drone-lab/controller.c').read_text(encoding='utf-8').encode('utf-8')).hexdigest():raise RuntimeError('Rerun board builds after controller changes')
        info=result['build']['builder_result']
        sizes={s['name']:s['size'] for s in info.get('executable_sections_size',[])}
        passed[result['fqbn']]={'coreVersion':info['build_platform']['version'],'date':'2026-10-27',
            'scope':'planar multirotor bench template, actuator outputs disabled',
            'airframes':['quad-x'],'controllerSha256':result['controllerSha256'],
            'flashBytes':sizes.get('text'),'ramBytes':sizes.get('data'),'hardwareTested':False}
    matrix=ROOT/'.test-artifacts/airframe-compile-results.json'
    if matrix.exists():
        for result in json.loads(matrix.read_text(encoding='utf-8')):
            if not result.get('success') or not result.get('build',{}).get('success'):raise RuntimeError('Failed geometry build')
            if result.get('controllerSha256')!=hashlib.sha256((ROOT/'projets/drone-lab/controller.c').read_text(encoding='utf-8').encode('utf-8')).hexdigest():raise RuntimeError('Rerun geometry builds after controller changes')
            target=passed.get(result['fqbn'])
            if not target:continue
            if result['airframe'] not in target['airframes']:target['airframes'].append(result['airframe'])
            sizes={s['name']:s['size'] for s in result['build']['builder_result'].get('executable_sections_size',[])}
            target.setdefault('airframeBuilds',[]).append({'airframe':result['airframe'],'flashBytes':sizes.get('text'),'ramBytes':sizes.get('data')})
    for board in boards:
        if board['fqbn'] in passed:
            board['validation']=passed[board['fqbn']]
    path.write_text(source[:match.start(1)]+json.dumps(boards,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
    print(f'Recorded {len(passed)} successful FQBN template compilations')

if __name__=='__main__':
    main()
