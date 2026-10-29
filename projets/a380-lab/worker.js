import {optimize} from './optimizer.js?v=1.3.7';
self.onmessage=({data})=>{
  try { const result=optimize(data.config,data.tables,p=>postMessage({type:'progress',...p}));postMessage({type:'result',result}); }
  catch(e) {postMessage({type:'error',message:e.message});}
};
