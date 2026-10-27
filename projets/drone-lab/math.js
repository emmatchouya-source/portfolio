// ENU world, FLU body. Hamilton quaternions [w,x,y,z], body -> world.
export const G = 9.80665;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const scale = (a, s) => a.map(v => v * s);
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const norm = a => Math.hypot(...a);
export const unit = a => scale(a, 1 / (norm(a) || 1));
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const qnorm = q => scale(q, 1 / (norm(q) || 1));
export const conj = q => [q[0], -q[1], -q[2], -q[3]];
export const mul = (a, b) => [
  a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],
  a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],
  a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],
  a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];
export const rotate = (q, v) => mul(mul(q, [0, ...v]), conj(q)).slice(1);
export function integrate(q, w, dt) {
  const n = norm(w), h = n * dt / 2;
  return qnorm(mul(q, n > 1e-9 ? [Math.cos(h), ...scale(w, Math.sin(h)/n)] : [1,0,0,0]));
}
export function fromEuler(r, p, y) {
  const a=r/2,b=p/2,c=y/2, cr=Math.cos(a),sr=Math.sin(a),cp=Math.cos(b),sp=Math.sin(b),cy=Math.cos(c),sy=Math.sin(c);
  return [cr*cp*cy+sr*sp*sy,sr*cp*cy-cr*sp*sy,cr*sp*cy+sr*cp*sy,cr*cp*sy-sr*sp*cy];
}
export function euler(q) {
  const [w,x,y,z]=q;
  return [Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y)), Math.asin(clamp(2*(w*y-z*x),-1,1)), Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))];
}
export function fromAxes(x, y, z) {
  const m=[x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]], t=m[0]+m[4]+m[8];
  let q,s;
  if(t>0){s=Math.sqrt(t+1)*2;q=[s/4,(m[7]-m[5])/s,(m[2]-m[6])/s,(m[3]-m[1])/s];}
  else if(m[0]>m[4]&&m[0]>m[8]){s=Math.sqrt(1+m[0]-m[4]-m[8])*2;q=[(m[7]-m[5])/s,s/4,(m[1]+m[3])/s,(m[2]+m[6])/s];}
  else if(m[4]>m[8]){s=Math.sqrt(1+m[4]-m[0]-m[8])*2;q=[(m[2]-m[6])/s,(m[1]+m[3])/s,s/4,(m[5]+m[7])/s];}
  else{s=Math.sqrt(1+m[8]-m[0]-m[4])*2;q=[(m[3]-m[1])/s,(m[2]+m[6])/s,(m[5]+m[7])/s,s/4];}
  return qnorm(q);
}
export function random(seed=42) {
  let state=seed>>>0;
  const uniform=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return (state+.5)/4294967296;};
  return ()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
}
