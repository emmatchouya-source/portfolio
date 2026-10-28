// Editable numerical-study assumptions, NOT A380 flight-manual performance data.
export const AIRPORT_DEFAULTS=Object.freeze({
  missionMode:0,depElevation:0,arrElevation:0,tora:4000,toda:4500,lda:4000,
  departureRoc:8,descentRoc:8,approachEAS:70,approachAngle:3,
  rollingMu:.02,brakeMu:.3,brakeDelay:2,rotationTime:5,
  airportCleanCd0:.02,airportCleanK:.045,airportCleanClMax:1.2,
  takeoffClMax:2, takeoffCd0:.045,landingClMax:2.5,landingCd0:.08,
  airportHighLiftK:.06,airportSpeedbrakeCd:.08,airportPower:.9,
  airportTsfc:16,airportIdleThrust:15000,airportIdleFlow:1,
  landingMassLimit:0,brakeEnergyLimit:0,
});
export const AIRPORT_LIMITS={
  missionMode:[0,1],depElevation:[0,3000],arrElevation:[0,3000],tora:[500,7000],toda:[500,10000],lda:[500,7000],
  departureRoc:[2,20],descentRoc:[2,20],approachEAS:[50,110],approachAngle:[2,4.5],
  rollingMu:[.005,.06],brakeMu:[.05,.6],brakeDelay:[0,10],rotationTime:[2,12],
  airportCleanCd0:[.01,.05],airportCleanK:[.02,.1],airportCleanClMax:[.8,1.8],
  takeoffClMax:[1.2,3],takeoffCd0:[.02,.12],landingClMax:[1.5,3.5],landingCd0:[.04,.2],
  airportHighLiftK:[.02,.15],airportSpeedbrakeCd:[0,.2],airportPower:[.5,1],
  airportTsfc:[8,35],airportIdleThrust:[0,100000],airportIdleFlow:[.2,5],
  landingMassLimit:[0,575000],brakeEnergyLimit:[0,2000],
};
export const AIRPORT_FIELDS=[
  ['depElevation','Altitude au départ','m','quick'],['arrElevation','Altitude à l’arrivée','m','quick'],
  ['tora','Piste de décollage (TORA)','m','quick'],['toda','Distance disponible (TODA)','m','quick'],['lda','Piste d’atterrissage (LDA)','m','quick'],
  ['departureRoc','Montée initiale : taux maximal','m/s','quick'],['descentRoc','Descente : taux maximal','m/s','quick'],
  ['approachEAS','Vitesse d’approche équivalente','m/s','quick'],['approachAngle','Pente finale au sol','°','quick'],
  ['rollingMu','Coefficient de roulement','—','ground'],['brakeMu','Coefficient de freinage','—','ground'],
  ['brakeDelay','Délai de freinage','s','ground'],['rotationTime','Durée de rotation','s','ground'],
  ['landingMassLimit','Limite de masse à l’atterrissage (0 : non renseignée)','kg','ground'],['brakeEnergyLimit','Limite d’énergie des freins (0 : non renseignée)','MJ','ground'],
  ['airportCleanCd0','CD₀ en configuration lisse','—','aero'],['airportCleanK','Facteur de traînée induite lisse','—','aero'],['airportCleanClMax','CL maximal lisse','—','aero'],
  ['takeoffClMax','CL maximal au décollage','—','aero'],['takeoffCd0','CD₀ au décollage','—','aero'],
  ['landingClMax','CL maximal à l’atterrissage','—','aero'],['landingCd0','CD₀ à l’atterrissage','—','aero'],
  ['airportHighLiftK','Facteur de traînée induite avec volets','—','aero'],['airportSpeedbrakeCd','CD additionnel maximal des aérofreins','—','aero'],
  ['airportPower','Fraction de poussée disponible','—','engine'],['airportTsfc','TSFC basse vitesse','mg/(N·s)','engine'],
  ['airportIdleThrust','Poussée totale au ralenti','N','engine'],['airportIdleFlow','Débit total minimal','kg/s','engine'],
];
export const PHASE_LABELS={
  'takeoff-roll':'Accélération sur piste',rotation:'Rotation','departure-climb':'Montée initiale',
  'initial-climb':'Montée après envol',
  cruise:'Croisière',climb:'Montée de croisière',descent:'Descente',approach:'Approche',flare:'Arrondi','landing-roll':'Freinage sur piste',
};
export function validateAirportConfig(c){
  if(c.missionMode!==0&&c.missionMode!==1)throw Error('Mode de mission invalide.');
  if(!c.missionMode)return;
  for(const [k,[lo,hi]] of Object.entries(AIRPORT_LIMITS))if(!Number.isFinite(c[k])||c[k]<lo||c[k]>hi)throw Error(`${k} : valeur attendue entre ${lo} et ${hi}.`);
  if(c.toda<c.tora)throw Error('La TODA doit être supérieure ou égale à la TORA.');
  if(c.airportIdleThrust>=4*c.thrustSL*c.airportPower)throw Error('La poussée au ralenti doit rester inférieure à la poussée de décollage.');
  if(c.wind< -30||c.wind>15)throw Error('Vol complet : vent longitudinal limité à −30 à +15 m/s pour ce modèle d’étude.');
}
