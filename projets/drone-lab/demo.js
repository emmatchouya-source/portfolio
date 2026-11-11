import {config} from './core.js?v=airframes-1';
import {norm,sub} from './math.js';

// Public synthetic scenario. These parameters never inherit a saved user study.
export const DEMO_CONFIG=Object.freeze(config({mission:'eight',airframe:'quad-x',altitude:5,radius:4,speed:1,wind:0,gust:0,noise:1,seed:12,feedback:'estimate'}));
export const DEMO=Object.freeze({duration:40,impulseAt:20,positionBand:.5,velocityBand:.3,dwell:2});
export function demoState(){return {injected:false,done:false,lastOutside:null,peakError:0,postSamples:0};}
export function beforeDemoStep(sim,state){
  if(!state.injected&&sim.t>=DEMO.impulseAt-1e-8){sim.disturb();state.injected=true;}
}
export function afterDemoStep(sim,state){
  if(state.injected){
    const error=norm(sub(sim.target.p,sim.s.p)),velocity=norm(sub(sim.target.v,sim.s.v));
    state.peakError=Math.max(state.peakError,error);state.postSamples++;
    if(error>DEMO.positionBand||velocity>DEMO.velocityBand)state.lastOutside=sim.t;
  }
  state.done=sim.t>=DEMO.duration-1e-8||['landed','crashed'].includes(sim.mode);
}
export function demoSummary(sim,state){
  const insideFor=state.injected?sim.t-(state.lastOutside??DEMO.impulseAt):0;
  return {status:state.done?'completed':'running',seconds:sim.t,trackingRmsM:sim.trackingRms,
    saturationPercent:100*sim.metrics.saturation/(sim.metrics.samples||1),
    postImpulsePeakErrorM:state.injected?state.peakError:null,
    recoverySeconds:state.done&&state.injected&&insideFor>=DEMO.dwell?(state.lastOutside??DEMO.impulseAt)-DEMO.impulseAt:null,
    mode:sim.mode,impulseAtSeconds:DEMO.impulseAt,config:{...sim.c}};
}
