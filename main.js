'use strict';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- Année, thème ---------- */
if ($('year')) $('year').textContent = new Date().getFullYear();
const THEMES = ['auto', 'light', 'dark'];
const ICONS = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
};
const LABELS = { auto:'Thème : automatique', light:'Thème : clair', dark:'Thème : sombre' };
let themeIdx = 0;
try { const s = localStorage.getItem('pfTheme'); if (THEMES.includes(s)) themeIdx = THEMES.indexOf(s); } catch (e) {}
const themeListeners = [];
function applyTheme(){
  const t = THEMES[themeIdx];
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  const b = $('themeBtn'); if (b){ b.innerHTML = ICONS[t]; b.title = LABELS[t]; b.setAttribute('aria-label', LABELS[t]); }
  try { localStorage.setItem('pfTheme', t); } catch (e) {}
  themeListeners.forEach(f => f());
}
if ($('themeBtn')) $('themeBtn').addEventListener('click', () => { themeIdx = (themeIdx + 1) % 3; applyTheme(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => themeListeners.forEach(f => f()));
applyTheme();

/* ---------- Liens vers une autre page : nouvel onglet (sauf ancres, mailto et data-same-tab) ---------- */
document.querySelectorAll('a[href]').forEach(a => {
  const h = a.getAttribute('href');
  if (h.startsWith('#') || h.startsWith('mailto:') || a.hasAttribute('data-same-tab')) return;
  const u = new URL(a.href, location.href);
  if (u.origin === location.origin && u.pathname === location.pathname) return;
  a.target = '_blank'; a.rel = 'noopener';
});

/* ---------- Navigation : ombre, progression, section active ---------- */
const nav = $('nav'), progress = $('progress');
const links = [...document.querySelectorAll('nav ul a[href^="#"]')];
const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
function onScroll(){
  const y = window.scrollY, h = document.documentElement.scrollHeight - innerHeight;
  if (nav) nav.classList.toggle('scrolled', y > 8);
  if (progress) progress.style.width = (h > 0 ? y / h * 100 : 0) + '%';
  let cur = null;
  sections.forEach(s => { if (s.getBoundingClientRect().top < innerHeight * 0.35) cur = s.id; });
  links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
}
addEventListener('scroll', onScroll, { passive:true }); onScroll();

/* ---------- Apparition au défilement et compteurs ---------- */
function countUp(el){
  const target = +el.dataset.count, suf = el.dataset.suffix || '';
  if (reduceMotion){ el.textContent = target.toLocaleString('fr-FR') + suf; return; }
  const t0 = performance.now(), dur = 1400;
  const step = t => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(target * e).toLocaleString('fr-FR') + suf;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const io = new IntersectionObserver(entries => entries.forEach(en => {
  if (!en.isIntersecting) return;
  en.target.classList.add('in');
  en.target.querySelectorAll('[data-count]').forEach(countUp);
  io.unobserve(en.target);
}), { threshold:0.12, rootMargin:'0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

/* halo qui suit la souris sur les cartes projet */
document.querySelectorAll('.case').forEach(c => c.addEventListener('pointermove', e => {
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
  c.style.setProperty('--my', (e.clientY - r.top) + 'px');
}));

/* ---------- Écoulement potentiel autour d'un profil de Joukowski ---------- */
(function flow(){
  const cv = $('flow'); if (!cv) return;
  const ctx = cv.getContext('2d');
  // nombres complexes [re, im]
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, b) => [a[0]*b[0] - a[1]*b[1], a[0]*b[1] + a[1]*b[0]];
  const div = (a, b) => { const d = b[0]*b[0] + b[1]*b[1]; return [(a[0]*b[0] + a[1]*b[1]) / d, (a[1]*b[0] - a[0]*b[1]) / d]; };
  const cexp = t => [Math.cos(t), Math.sin(t)], abs2 = a => a[0]*a[0] + a[1]*a[1];
  const csqrt = a => { const r = Math.sqrt(Math.hypot(a[0], a[1])), t = Math.atan2(a[1], a[0]) / 2; return [r*Math.cos(t), r*Math.sin(t)]; };

  const MU = [-0.09, 0.075], A = Math.hypot(1 - MU[0], MU[1]), U = 1, BETA = Math.asin(MU[1] / A);
  let alpha = 0, eA = [1, 0], Gamma = 0, foil = [], chord = 4, W = 0, H = 0, scale = 1, cx = 0, cy = 0;
  let colors = {}, parts = [], running = false, visible = true;

  const toZ = z => add(z, div([1, 0], z));                       // z = ζ + 1/ζ
  const dW = s => {                                              // dW/dζ
    const d = sub(s, MU), d2 = mul(d, d);
    const t1 = cexp(-alpha), t2 = div(mul([A*A, 0], cexp(alpha)), d2), t3 = div([0, Gamma / (2*Math.PI)], d);
    return add(sub(t1, t2), t3);
  };
  const toScreen = z => { const r = mul(z, cexp(-alpha)); return [cx + r[0]*scale, cy - r[1]*scale]; };
  const fromScreen = (x, y) => {
    const z = mul([(x - cx)/scale, -(y - cy)/scale], cexp(alpha));
    const q = csqrt(sub(mul(z, z), [4, 0]));
    const s1 = [(z[0] + q[0]) / 2, (z[1] + q[1]) / 2], s2 = [(z[0] - q[0]) / 2, (z[1] - q[1]) / 2];
    return abs2(s1) >= abs2(s2) ? s1 : s2;
  };
  const inside = s => abs2(sub(s, MU)) < A*A*1.002;

  function setAlpha(deg){
    alpha = deg * Math.PI / 180;
    // circulation de Kutta : vitesse nulle au bord de fuite ζ = 1
    const s = sub([1, 0], MU), br = sub(cexp(-alpha), div(mul([A*A, 0], cexp(alpha)), mul(s, s)));
    Gamma = mul(mul(br, s), [0, 2*Math.PI])[0] * U;
    foil = [];
    let xmin = 1e9, xmax = -1e9;
    for (let i = 0; i <= 160; i++){
      const z = toZ(add(MU, [A*Math.cos(i/160*2*Math.PI), A*Math.sin(i/160*2*Math.PI)]));
      foil.push(z); xmin = Math.min(xmin, z[0]); xmax = Math.max(xmax, z[0]);
    }
    chord = xmax - xmin;
    const CL = 8*Math.PI*A*Math.sin(alpha + BETA) / chord;
    if ($('clOut')) $('clOut').textContent = `CL = ${CL.toLocaleString('fr-FR', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
    if ($('flowInfo')) $('flowInfo').textContent = `α = ${deg.toLocaleString('fr-FR', { minimumFractionDigits:1 })}°`;
    seed(); clear();
  }
  function spawn(p, anywhere){
    for (let k = 0; k < 20; k++){
      const x = anywhere ? Math.random()*W : -10 - Math.random()*30, y = Math.random()*H;
      const s = fromScreen(x, y);
      if (!inside(s)){ p.s = s; p.life = 160 + Math.random()*260; p.trail = []; return; }
    }
  }
  function seed(){
    const n = Math.round(Math.min(520, W*H / 520));
    parts = Array.from({ length:n }, () => { const p = {}; spawn(p, true); return p; });
  }
  function resize(){
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight; if (!W || !H) return;
    cv.width = W*dpr; cv.height = H*dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(W / 6.2, H / 3.4); cx = W*0.5; cy = H*0.55;
    readColors(); setAlpha(+$('alpha').value);
  }
  function readColors(){ colors = { a:css('--accent'), b:css('--accent-2'), panel:css('--panel'), line:css('--line'), muted:css('--muted') }; }
  function clear(){ ctx.clearRect(0, 0, W, H); }
  function velocity(s){
    const w = dW(s), dz = sub([1, 0], div([1, 0], mul(s, s))), j = Math.max(abs2(dz), 0.04);
    return { v:[w[0]/j, -w[1]/j], speed: Math.sqrt(abs2(w) / j) };   // dζ/dt = conj(dW/dζ)/|dz/dζ|²
  }
  // Chaque particule garde ses dernières positions ; tout est redessiné à chaque image
  // (un effacement progressif du canvas laisse des traces résiduelles qui s'accumulent).
  const TRAIL = 34;
  function step(dt){
    for (const p of parts){
      const k1 = velocity(p.s), mid = [p.s[0] + k1.v[0]*dt/2, p.s[1] + k1.v[1]*dt/2], k2 = velocity(mid);
      p.s = [p.s[0] + k2.v[0]*dt, p.s[1] + k2.v[1]*dt];
      p.life--; p.fast = k2.speed > 1.12;
      const [x, y] = toScreen(toZ(p.s));
      if (p.life < 0 || x > W + 40 || y < -40 || y > H + 40 || inside(p.s)){ spawn(p, false); continue; }
      p.trail.push(x, y);
      if (p.trail.length > TRAIL*2) p.trail.splice(0, 2);
    }
    clear();
    ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // deux moitiés de traînée (ancienne pâle, récente marquée) × deux couleurs (vitesse)
    for (const [fast, color] of [[false, colors.b], [true, colors.a]]){
      for (const [from, alpha] of [[0, 0.22], [0.5, 0.75]]){
        ctx.beginPath();
        for (const p of parts){
          const t = p.trail, n = t.length / 2;
          if (p.fast !== fast || n < 3) continue;
          const i0 = Math.floor((n - 1)*from), i1 = from ? n - 1 : Math.floor((n - 1)*0.5);
          ctx.moveTo(t[i0*2], t[i0*2 + 1]);
          for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(t[i*2], t[i*2 + 1]);
        }
        ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    drawFoil();
  }
  function drawFoil(){
    ctx.beginPath();
    foil.forEach((z, i) => { const [x, y] = toScreen(z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.fillStyle = colors.panel; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = colors.a; ctx.stroke();
  }
  function staticLines(){
    clear(); ctx.lineWidth = 1.2;
    for (let i = 0; i < 34; i++){
      const p = { s: fromScreen(-5, (i + 0.5) / 34 * H) };
      if (inside(p.s)) continue;
      ctx.beginPath(); let first = true;
      for (let k = 0; k < 900; k++){
        const v = velocity(p.s); p.s = [p.s[0] + v.v[0]*0.01, p.s[1] + v.v[1]*0.01];
        const [x, y] = toScreen(toZ(p.s)); if (x > W + 10) break;
        first ? ctx.moveTo(x, y) : ctx.lineTo(x, y); first = false;
      }
      ctx.strokeStyle = colors.b; ctx.globalAlpha = .55; ctx.stroke();
    }
    ctx.globalAlpha = 1; drawFoil();
  }
  let last = 0;
  function loop(t){
    if (!running) return;
    // pas de temps lié au temps réel, pour une vitesse identique quel que soit l'écran (60 ou 144 Hz)
    const dt = last ? Math.min(0.05, (t - last)/1000*1.1) : 0.018; last = t;
    if (visible && !document.hidden) step(dt);
    requestAnimationFrame(loop);
  }
  $('alpha').addEventListener('input', e => { setAlpha(+e.target.value); if (reduceMotion) staticLines(); });
  new IntersectionObserver(en => { visible = en[0].isIntersecting; }).observe(cv);
  themeListeners.push(() => { readColors(); clear(); if (reduceMotion) staticLines(); });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (reduceMotion) staticLines(); }, 120); });
  resize();
  if (reduceMotion) staticLines(); else { running = true; requestAnimationFrame(loop); }
})();
