import {DEFAULT} from './model.js?v=1.2.0';
export const SCENARIOS=Object.freeze({
  verification:Object.freeze({...DEFAULT,mass:300000,altitude:8000,mach:.6,steps:0,minAltitude:8000,maxAltitude:9500,minMach:.5,maxMach:.8,climbRate:1.27}),
  climbs:Object.freeze({...DEFAULT,mass:300000,altitude:8000,mach:.6,steps:2,minAltitude:8000,maxAltitude:9500,minMach:.5,maxMach:.8,climbRate:1.27}),
  report:DEFAULT,
});
export const SCENARIO_LABELS=Object.freeze({verification:'Vérification numérique · 300 t',climbs:'Vérification · deux montées physiques · 300 t',report:'Rapport MGA803 · 500 t',custom:'Paramètres personnalisés'});
export function identifyScenario(config){
  return Object.keys(SCENARIOS).find(id=>Object.keys(DEFAULT).every(key=>key==='area'||
    (typeof DEFAULT[key]==='number'?Number.isFinite(config[key])&&Math.abs(config[key]-SCENARIOS[id][key])<1e-9:config[key]===SCENARIOS[id][key])))||'custom';
}
export function scenarioConfig(id,area){
  if(!Object.hasOwn(SCENARIOS,id))throw Error('Scénario inconnu.');
  return {...SCENARIOS[id],area:area??DEFAULT.area};
}
