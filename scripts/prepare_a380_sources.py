"""Build portable numerical inputs from owner-supplied MGA803 files; no PDF/FCOM republishing."""
from pathlib import Path
from io import BytesIO
import hashlib
import json
import re
import zipfile
import numpy as np
import openpyxl
import pymupdf
from scipy.io import loadmat

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'projets/a380-lab/Outils'
OUTPUT = ROOT / 'projets/a380-lab/data/project.json'


def main():
    archive = SOURCE / 'Program_AeroModelGeneration.zip'
    z = zipfile.ZipFile(archive)
    mat = loadmat(BytesIO(z.read('Outputs/aero_data')), simplify_cells=True)['aero_data']
    out = {'schema': 'a380-project/v1', 'name': 'Projet MGA803 — OpenVSP + propulsion corrigée',
           'source': 'Fichiers du projet fournis par Emmanuel Tchouya ; conversion documentée, sans validation en vol.',
           'surfaces': {}, 'hashes': {}}
    for short, name in [('wb', 'WB'), ('ht', 'HT')]:
        text = z.read(f'Airbus 380/Avion_{name}_VSPGeom.history').decode()
        header = text.split('Solver Case:')[0]
        geometry = {k: float(re.search(r'\b' + k + r'_\s+([-\d.]+)', header)[1])
                    for k in ['Sref', 'Cref', 'Xcg', 'Zcg']}
        cl = mat['f_cl' + short]
        surface = {'alpha': cl['x_alpha'].tolist(), 'mach': cl['y_mach'].tolist(), **geometry}
        for coeff in ['cl', 'cd'] + (['cm'] if short == 'wb' else []):
            surface[coeff] = mat['f_' + coeff + short]['value'].tolist()
        # Verify every stored MATLAB coefficient against the last solver iteration.
        blocks = text.split('Solver Case:')[1:]
        count = 0
        for block in blocks:
            lines = [line.split() for line in block.splitlines() if re.match(r'^\s+\d+\s+[\d.-]+\s+[\d.-]+', line)]
            if not lines:
                continue
            row = list(map(float, lines[-1]))
            a = int(np.argmin(abs(np.array(surface['alpha']) - row[2])))
            m = int(np.argmin(abs(np.array(surface['mach']) - row[1])))
            for coeff, col in [('cl', 4), ('cd', 7)] + ([('cm', 17)] if short == 'wb' else []):
                assert abs(surface[coeff][a][m] - row[col]) < 1e-10, (short, coeff, a, m)
            count += 1
        assert count == len(surface['alpha']) * len(surface['mach'])
        surface['verifiedCases'] = count
        out['surfaces'][short] = surface
    out['area'] = out['surfaces']['wb']['Sref']
    propulsion = next(SOURCE.glob('Donn*.pdf'))
    text = '\n'.join(p.get_text() for p in pymupdf.open(propulsion))
    chunks = text.split('% Modèle de débit carburant')
    out['engine'] = {'thrustRefN': 352900, 'flowRefKgS': 9856.8 / 3600,
                     'flowMultiplier': 2, 'pressureExponent': 1, 'temperatureExponent': .5}
    for key, chunk in [('thrustPolynomial', chunks[0]), ('flowPolynomial', chunks[1])]:
        out['engine'][key] = {a: float(b) for a, b in re.findall(r'p(\d\d)\s*=\s*([+-]?[\d.]+)', chunk)}
        assert len(out['engine'][key]) == 18
    book = openpyxl.load_workbook(SOURCE / 'ICAO Aircraft Engine Emissions Databank.xlsx', data_only=True, read_only=True)
    row = next(r for r in book['Gaseous Emissions and Smoke'].values if r[0] == '18RR082')
    out['emissions'] = {'uid': row[0], 'engine': row[3], 'ratedThrustKN': row[8],
                        'flowKgS': [row[80], row[79], row[78], row[77]],
                        'coGKg': [row[32], row[31], row[30], row[29]],
                        'noxGKg': [row[45], row[44], row[43], row[42]],
                        'hcGKg': [row[19], row[18], row[17], row[16]]}
    assert out['emissions']['ratedThrustKN'] == 352.9
    for path in [archive, propulsion, SOURCE / 'ICAO Aircraft Engine Emissions Databank.xlsx']:
        out['hashes'][path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('Verified source cases:', {k: v['verifiedCases'] for k, v in out['surfaces'].items()})
    print('Engine coefficient counts:', len(out['engine']['thrustPolynomial']), len(out['engine']['flowPolynomial']))
    print('Output:', OUTPUT.relative_to(ROOT), OUTPUT.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
