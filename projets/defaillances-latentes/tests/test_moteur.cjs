'use strict';
// Moteur de la page index.html, testé hors navigateur :  node --test tests/
// Les valeurs de référence viennent du solveur Python indépendant (outil/fiabilite/latentes.py du dépôt du cours)
// et des articles (Ramesh et al. 2002, Kohda et Inoue 2001).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script id="moteur">([\s\S]*?)<\/script>/)[1];
const ctx = vm.createContext({module: {}});
vm.runInContext(code, ctx);
const L = ctx.module.exports;
const proche = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg} : ${a} au lieu de ${b}`);

test('exemple 2 du M3A : mêmes valeurs que le solveur Python', () => {
  const r = L.analyser({comp: '1 1e-5\n2 1e-4 1000\n3 1e-4', schema: 'serie(1; par(2; 3))', t: '5', cible: '7,5e-5', cc: '2'});
  assert.deepEqual(JSON.parse(JSON.stringify(r.C)), [['1'], ['2', '3']]);
  proche(r.Pc, 1e-4, 1e-12, 'méthode du cours');
  proche(r.PR, 7.42987e-5, 1e-5, 'Ramesh');
  proche(r.M.P, 7.34490e-5, 1e-5, 'exact');
  proche(r.M.profil[0], 5.02486e-5, 1e-5, '1re mission');
  proche(r.M.max, 9.50966e-5, 1e-5, 'pire vol');
  proche(r.adm.Tc, 500, 1e-12, 'intervalle du cours');
  assert.equal(r.adm.Nex, 214);
});

test('arbre de Kohda et Inoue : états critiques, probabilités et surveillance', () => {
  const r = L.analyser({comp: '1 1e-4 1000\n2 1e-4 1000\n3 1e-4 1000\n4 1e-4', schema: 'OU(ET(1;4);ET(2;3;4))', t: '5', cible: '1e-5', cc: '1'});
  assert.deepEqual(JSON.parse(JSON.stringify(r.kohda.map(k => [k.nom, k.nc, k.nCI]))),[['1', 3, 4], ['2', 1, 3], ['3', 1, 3], ['4', 5, 3]]);
  proche(r.Pc, 5.5e-5, 1e-12, 'cours');
  proche(r.PR, 2.58582e-5, 1e-5, 'Ramesh');
  proche(r.M.P, 2.49382e-5, 1e-5, 'exact');
  const s = Object.fromEntries(r.surveillance.map(x => [x.nom, x]));
  proche(s['1'].P, 1.7689e-6, 1e-4, 'surveillance de 1');
  proche(s['2'].P, 2.3538e-5, 1e-4, 'surveillance de 2');
  proche(r.adm.Tc, 100, 1e-12, 'intervalle du cours');
  assert.equal(r.adm.Tex, 340);
});

test('les trois écritures du schéma donnent les mêmes coupes minimales', () => {
  const noms = ['1', '2', '3', '4'];
  const a = L.coupesMinimales('OU(ET(1;4);ET(2;3;4))', noms).coupes;
  const b = L.coupesMinimales('par(4; serie(1; par(2; 3)))', noms).coupes;
  const c = L.coupesMinimales('1 4\n2 3 4', noms).coupes;
  assert.deepEqual(JSON.parse(JSON.stringify(a)), [['1', '4'], ['2', '3', '4']]);
  assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)));
  assert.deepEqual(JSON.parse(JSON.stringify(c)), JSON.parse(JSON.stringify(a)));
});

test('validation intégrée : tous les cas conformes', () => {
  const v = L.valider();
  assert.ok(v.length >= 18);
  for (const x of v) assert.ok(x.ok, x.cas);
});

test('saisie des nombres', () => {
  for (const [s, v] of [['1e-5', 1e-5], ['1,5e-5', 1.5e-5], ['10^-5', 1e-5], ['1,5×10^-5', 1.5e-5], ['1,5·10⁻⁵', 1.5e-5], ['1000', 1000]]) proche(L.nombre(s), v, 1e-12, s);
  assert.throws(() => L.analyser({comp: '1 abc', schema: '1', t: '5'}));
  assert.throws(() => L.analyser({comp: '1 1e-4', schema: '1 2', t: '5'}), /pas de taux/);
});
