// FLU body axes: X forward, Y left, Z up. Positions are relative to arm length.
// Spin is the SIGN OF THE REACTION TORQUE on the body about +Z (not CW viewed above).
export const AIRFRAMES = [
  {"id":"quad-x","name":"Quadricoptère X","short":"QUAD X","layout":"radial","positions":[[0.7071067811865476,0.7071067811865476],[-0.7071067811865476,0.7071067811865476],[-0.7071067811865476,-0.7071067811865476],[0.7071067811865476,-0.7071067811865476]],"spins":[1,-1,1,-1]},
  {"id":"quad-plus","name":"Quadricoptère +","short":"QUAD +","layout":"radial","positions":[[1,0],[0,1],[-1,0],[0,-1]],"spins":[1,-1,1,-1]},
  {"id":"quad-h","name":"Quadricoptère H","short":"QUAD H","layout":"h","positions":[[1,1],[-1,1],[-1,-1],[1,-1]],"spins":[1,-1,1,-1]},
  {"id":"hexa-x","name":"Hexacoptère X","short":"HEXA X","layout":"radial","positions":[[0.8660254037844386,0.5],[0,1],[-0.8660254037844386,0.5],[-0.8660254037844386,-0.5],[0,-1],[0.8660254037844386,-0.5]],"spins":[1,-1,1,-1,1,-1]},
  {"id":"hexa-plus","name":"Hexacoptère +","short":"HEXA +","layout":"radial","positions":[[1,0],[0.5,0.8660254037844386],[-0.5,0.8660254037844386],[-1,0],[-0.5,-0.8660254037844386],[0.5,-0.8660254037844386]],"spins":[1,-1,1,-1,1,-1]},
  {"id":"octo-x","name":"Octocoptère X","short":"OCTO X","layout":"radial","positions":[[0.9238795325112867,0.3826834323650898],[0.3826834323650898,0.9238795325112867],[-0.3826834323650898,0.9238795325112867],[-0.9238795325112867,0.3826834323650898],[-0.9238795325112867,-0.3826834323650898],[-0.3826834323650898,-0.9238795325112867],[0.3826834323650898,-0.9238795325112867],[0.9238795325112867,-0.3826834323650898]],"spins":[1,-1,1,-1,1,-1,1,-1]},
  {"id":"octo-plus","name":"Octocoptère +","short":"OCTO +","layout":"radial","positions":[[1,0],[0.7071067811865476,0.7071067811865476],[0,1],[-0.7071067811865476,0.7071067811865476],[-1,0],[-0.7071067811865476,-0.7071067811865476],[0,-1],[0.7071067811865476,-0.7071067811865476]],"spins":[1,-1,1,-1,1,-1,1,-1]}
];

export function frame(id='quad-x'){
  const result=AIRFRAMES.find(f=>f.id===id);
  if(!result)throw Error('Géométrie de drone non prise en charge.');
  return result;
}
export function geometry(c){
  const profile=frame(c.airframe),aspect=c.hAspect??1.5,den=Math.hypot(aspect,1);
  const rotors=profile.positions.map(([x,y],i)=>({x:c.arm*x*(profile.layout==='h'?aspect/den:1),y:c.arm*y*(profile.layout==='h'?1/den:1),spin:profile.spins[i]}));
  const count=rotors.length,sx=rotors.reduce((s,r)=>s+r.x*r.x,0),sy=rotors.reduce((s,r)=>s+r.y*r.y,0);
  // Exact minimum-norm inverse for these balanced, mutually orthogonal layouts.
  // Saturation is clipping, not a fault-tolerant or constrained optimizer.
  const mix=rotors.map(r=>[1/count,r.y/sy,-r.x/sx,r.spin/(count*c.yawRatio)]);
  const spacing=Math.min(...rotors.flatMap((r,i)=>rotors.slice(i+1).map(s=>Math.hypot(r.x-s.x,r.y-s.y))));
  return {profile,rotors,count,mix,propRadius:Math.min(c.arm*.43,spacing*.44)};
}
export function wrench(c,forces,g=geometry(c)){
  return forces.reduce((out,f,i)=>{const r=g.rotors[i];out[0]+=f;out[1]+=r.y*f;out[2]-=r.x*f;out[3]+=c.yawRatio*r.spin*f;return out;},[0,0,0,0]);
}
