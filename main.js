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

/* ---------- Typographie française : espaces insécables devant : ; ? ! %, dans les nombres et avant les unités ---------- */
(function typo(){
  if (!document.documentElement.lang.startsWith('fr')) return;
  const skip = 'script,style,svg,textarea,code,pre';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());){
    if (!n.parentElement || n.parentElement.closest(skip)) continue;
    const t = n.nodeValue
      .replace(/ ([:;?!%»])/g, '\u00a0$1')
      .replace(/« /g, '«\u00a0')
      .replace(/(\d) (?=\d{3}(?!\d))/g, '$1\u00a0')
      .replace(/(\d) (?=(?:h|min|kg|km|m|lignes|pas)(?![\wÀ-ÿ]))/g, '$1\u00a0');
    if (t !== n.nodeValue) n.nodeValue = t;
  }
})();

/* ---------- Menu mobile ---------- */
(function menu(){
  const btn = $('menuBtn'), bar = $('nav'); if (!btn || !bar) return;
  const set = open => {
    bar.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open);
    btn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  };
  btn.addEventListener('click', () => set(!bar.classList.contains('open')));
  bar.querySelectorAll('ul a').forEach(a => a.addEventListener('click', () => set(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape' && bar.classList.contains('open')){ set(false); btn.focus(); } });
  document.addEventListener('click', e => { if (!bar.contains(e.target)) set(false); });
})();

/* ---------- Matrice de preuves : filtre par moyen de vérification ---------- */
(function matrix(){
  const box = document.querySelector('.matrix'); if (!box) return;
  const rows = [...box.querySelectorAll('tbody tr')], chips = [...box.querySelectorAll('.chip')], out = $('mxCount');
  const match = (r, f) => f === 'all' || (f === 'live' ? r.dataset.live === '1' : r.dataset.moc === f);
  chips.forEach(c => { const i = c.querySelector('i'); if (i) i.textContent = rows.filter(r => match(r, c.dataset.f)).length; });
  function apply(f){
    let n = 0;
    rows.forEach(r => { const ok = match(r, f); r.hidden = !ok; if (ok) n++; });
    chips.forEach(c => c.setAttribute('aria-pressed', c.dataset.f === f));
    if (out) out.textContent = f === 'all' ? `${n} affirmations` : `${n} affirmation${n > 1 ? 's' : ''} sur ${rows.length}`;
  }
  chips.forEach(c => c.addEventListener('click', () => apply(c.dataset.f)));
  apply('all');
})();

if ($('printBtn')) $('printBtn').addEventListener('click', () => window.print());

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
  links.forEach(a => {
    const on = a.getAttribute('href') === '#' + cur;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
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

/* ---------- Écoulement potentiel autour d'un profil de Joukowski ----------
   Vitesse complexe dans le plan du cercle, transformation z = ζ + 1/ζ, circulation fixée par la
   condition de Kutta. Les efforts sont calculés de deux façons indépendantes pour se recouper :
   théorème de Kutta-Joukowski (analytique) et intégration des pressions sur le contour.
   Limites : fluide parfait incompressible, donc ni frottement, ni décollement, ni décrochage. */
(function flow(){
  const cv = $('flow'); if (!cv) return;
  const ctx = cv.getContext('2d');
  const cpCv = $('cpPlot'), cpCtx = cpCv ? cpCv.getContext('2d') : null;
  const NB = String.fromCharCode(160), MINUS = String.fromCharCode(8722);
  const num = (v, d) => {
    if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;
    return v.toLocaleString('fr-FR', { minimumFractionDigits:d, maximumFractionDigits:d }).replace('-', MINUS);
  };
  const put = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

  // --- modèle ---
  // nombres complexes [re, im]
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, b) => [a[0]*b[0] - a[1]*b[1], a[0]*b[1] + a[1]*b[0]];
  const div = (a, b) => { const d = b[0]*b[0] + b[1]*b[1]; return [(a[0]*b[0] + a[1]*b[1]) / d, (a[1]*b[0] - a[0]*b[1]) / d]; };
  const cexp = t => [Math.cos(t), Math.sin(t)], abs2 = a => a[0]*a[0] + a[1]*a[1];
  const csqrt = a => { const r = Math.sqrt(Math.hypot(a[0], a[1])), t = Math.atan2(a[1], a[0]) / 2; return [r*Math.cos(t), r*Math.sin(t)]; };

  const MU = [-0.09, 0.075], A = Math.hypot(1 - MU[0], MU[1]), BETA = Math.asin(MU[1] / A);
  const N = 360;                                                    // segments du contour
  const RHO = 1.225, VISC = 1.789e-5, SOUND = 340.3, CHORD_M = 1;   // air ISA au niveau de la mer, corde de 1 m
  // Décollement de bord de fuite : modèle empirique statique de Beddoes-Leishman (loi de Kirchhoff).
  // f = fraction de corde où l'écoulement reste attaché à l'extrados ; CL = CL potentiel × ((1 + √f)/2)².
  // Les trois constantes sont des valeurs typiques d'un profil d'épaisseur moyenne, non identifiées sur ce profil.
  const SEP_A1 = 12, SEP_S1 = 1.5, SEP_S2 = 2.3;                    // incidence de décrochage et raideurs, en degrés
  const attached = d => d <= SEP_A1 ? 1 - 0.3*Math.exp((d - SEP_A1)/SEP_S1) : 0.04 + 0.66*Math.exp((SEP_A1 - d)/SEP_S2);
  const LIFT_MAX = 6400, MOMENT_MAX = 460;                          // efforts maximaux du domaine (80 m/s), en N/m et N·m/m : bases de l'échelle des flèches
  const MACH_MAX = 0.5;                                             // au-delà, la compressibilité ne se néglige plus
  let alpha = 0, Gamma = 0;

  const toZ = z => add(z, div([1, 0], z));                          // z = ζ + 1/ζ
  const dW = s => {                                                 // dW/dζ, vitesse amont unitaire
    const d = sub(s, MU), d2 = mul(d, d);
    const t1 = cexp(-alpha), t2 = div(mul([A*A, 0], cexp(alpha)), d2), t3 = div([0, Gamma / (2*Math.PI)], d);
    return add(sub(t1, t2), t3);
  };
  // Contour parcouru dans le sens direct à partir du bord de fuite (ζ = 1) : extrados, bord d'attaque, intrados.
  const circle = t => add(MU, [A*Math.cos(t), A*Math.sin(t)]);
  const zEdge = [], sMid = [], zMid = [];
  for (let k = 0; k <= N; k++) zEdge.push(toZ(circle(-BETA + 2*Math.PI*k/N)));
  for (let k = 0; k < N; k++){ const s = circle(-BETA + 2*Math.PI*(k + 0.5)/N); sMid.push(s); zMid.push(toZ(s)); }
  let iLE = 0; zEdge.forEach((z, i) => { if (z[0] < zEdge[iLE][0]) iLE = i; });
  const xmin = zEdge[iLE][0], chord = zEdge[0][0] - xmin;
  const chordY = xc => zEdge[iLE][1] * (1 - xc);                    // corde : du bord d'attaque au bord de fuite

  // épaisseur et cambrure relatives du profil
  const yAt = (x, i0, i1) => {
    for (let i = i0; i < i1; i++){
      const a = zEdge[i], b = zEdge[i + 1];
      if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    }
    return 0;
  };
  let thick = 0, camber = 0;
  for (let i = 1; i < 80; i++){
    const x = xmin + chord*i/80, yu = yAt(x, 0, iLE), yl = yAt(x, iLE, N);
    thick = Math.max(thick, yu - yl); camber = Math.max(camber, (yu + yl)/2 - chordY(i/80));
  }

  function solve(deg){
    alpha = deg * Math.PI / 180;
    // circulation de Kutta : vitesse nulle au bord de fuite ζ = 1
    const s1 = sub([1, 0], MU), br = sub(cexp(-alpha), div(mul([A*A, 0], cexp(alpha)), mul(s1, s1)));
    Gamma = mul(mul(br, s1), [0, 2*Math.PI])[0];
    const cp = new Float64Array(N), xRef = xmin + chord/4;
    let F = [0, 0], M = 0, cpMin = Infinity, iStag = 0;
    for (let k = 0; k < N; k++){
      const s = sMid[k], j = abs2(sub([1, 0], div([1, 0], mul(s, s))));
      cp[k] = 1 - abs2(dW(s)) / j;                                  // Bernoulli : Cp = 1 − (V/V∞)²
      if (cp[k] < cpMin) cpMin = cp[k];
      if (cp[k] > cp[iStag]) iStag = k;                             // point d'arrêt : Cp = 1
      const dF = mul([0, cp[k]], sub(zEdge[k + 1], zEdge[k]));      // effort de pression du segment : i·Cp·dz
      F = add(F, dF);
      M += (zMid[k][0] - xRef)*dF[1] - zMid[k][1]*dF[0];            // moment au quart de corde (sens direct)
    }
    const Fw = mul(F, cexp(-alpha)), cn = F[1] / chord, cm = -M / (chord*chord);   // cm > 0 : cabreur
    const clKJ = 8*Math.PI*A*Math.sin(alpha + BETA) / chord;        // Kutta-Joukowski : L' = ρ V Γ
    const f = attached(deg);
    return {
      cp, cpMin, iStag, cm, clKJ, f,
      clReal: clKJ * Math.pow((1 + Math.sqrt(f)) / 2, 2),           // portance estimée avec décollement
      cl: Fw[1] / chord, cd: Fw[0] / chord,                         // pressions intégrées, repère vent
      xcp: Math.abs(cn) > 0.04 ? 0.25 - cm/cn : NaN                 // centre de poussée, en fraction de corde
    };
  }

  // --- rendu ---
  let W = 0, H = 0, scale = 1, cx = 0, cy = 0, res = null, deg = 6, speed = 50;
  let colors = {}, parts = [], running = false, visible = true, foilXY = [], envXY = [];
  let tAnim = 0, iSep = 0, sepOn = false, eddies = [];              // zone décollée
  const CP_LEN = 0.15, CP_CAP = 4;                                  // longueur des flèches de pression, par unité de Cp
  const noteEl = $('flowNote'), NOTE = noteEl ? noteEl.innerHTML : '';
  const WARN_SEP = pct => `<b>Décollement estimé${NB}:</b> environ ${pct}${NB}% de l'extrados (modèle empirique de Beddoes-Leishman). Portance réduite${NB}; pressions et moment restent ceux du fluide parfait.`;

  const WARN_MACH = m => `<b>Hors domaine.</b> La survitesse locale atteint Mach${NB}${num(m, 2)}${NB}: l'hypothèse incompressible ne tient plus.`;

  const toScreen = z => { const r = mul(z, cexp(-alpha)); return [cx + r[0]*scale, cy - r[1]*scale]; };
  const fromScreen = (x, y) => {
    const z = mul([(x - cx)/scale, -(y - cy)/scale], cexp(alpha));
    const q = csqrt(sub(mul(z, z), [4, 0]));
    const s1 = [(z[0] + q[0]) / 2, (z[1] + q[1]) / 2], s2 = [(z[0] - q[0]) / 2, (z[1] - q[1]) / 2];
    return abs2(s1) >= abs2(s2) ? s1 : s2;
  };
  const inside = s => abs2(sub(s, MU)) < A*A*1.002;
  function velocity(s){
    const w = dW(s), dz = sub([1, 0], div([1, 0], mul(s, s))), j = Math.max(abs2(dz), 0.04);
    return { v:[w[0]/j, -w[1]/j], speed: Math.sqrt(abs2(w) / j) };   // dζ/dt = conj(dW/dζ)/|dz/dζ|²
  }

  function layout(){                                                // profil et enveloppe de pression, en pixels
    foilXY = zEdge.map(toScreen); envXY = [];
    for (let k = 0; k < N; k++){
      const d = sub(zEdge[k + 1], zEdge[k]), l = Math.hypot(d[0], d[1]) || 1;
      const len = CP_LEN * Math.min(Math.abs(res.cp[k]), CP_CAP);
      const a = toScreen(zMid[k]), b = toScreen([zMid[k][0] + d[1]/l*len, zMid[k][1] - d[0]/l*len]);   // normale extérieure
      envXY.push([a[0], a[1], b[0], b[1]]);
    }
    // point de décollement sur l'extrados (parcouru du bord de fuite vers le bord d'attaque)
    sepOn = 1 - res.f > 0.03; iSep = 0;
    while (iSep < iLE && (zEdge[iSep][0] - xmin)/chord > res.f) iSep++;
    const n = sepOn ? 5 + Math.round((1 - res.f)*14) : 0;
    if (eddies.length !== n) eddies = Array.from({ length:n }, () => ({ u:Math.random(), v:Math.random(), r:6 + Math.random()*12, ph:Math.random()*6.28, w:3 + Math.random()*4, c:0.6 + Math.random()*0.8 }));
  }
  function update(reseed){
    deg = +$('alpha').value; speed = $('vinf') ? +$('vinf').value : 50;
    res = solve(deg); layout();
    const lift = 0.5*RHO*speed*speed*CHORD_M*res.clReal, re = RHO*speed*CHORD_M/VISC, e = Math.floor(Math.log10(re));
    res.lift = lift; res.mom = 0.5*RHO*speed*speed*CHORD_M*CHORD_M*res.cm;   // efforts par mètre d'envergure
    const machLoc = speed*Math.sqrt(1 - res.cpMin)/SOUND;         // survitesse maximale sur le profil
    put('alphaOut', num(deg, 1) + NB + '°'); put('vinfOut', num(speed, 0) + NB + 'm/s');
    put('flowInfo', `épaisseur ${num(thick/chord*100, 1)}${NB}% · cambrure ${num(camber/chord*100, 1)}${NB}%`);
    put('fCl', num(res.clKJ, 3));
    put('fClInt', num(res.cl, 3) + `<small>écart ${num(Math.abs(res.cl - res.clKJ), 4)}</small>`);
    put('fCd', num(res.cd, 3));
    put('fCm', num(res.cm, 3));
    const xcpNote = res.xcp > 1 ? 'hors profil, en aval' : res.xcp < 0 ? 'hors profil, en amont' : sepOn ? 'fluide parfait' : '';
    put('fXcp', isNaN(res.xcp) ? 'couple pur<small>portance quasi nulle</small>'
      : num(res.xcp*100, 0) + NB + '% de corde' + (xcpNote ? `<small>${xcpNote}</small>` : ''));
    put('fCpMin', num(res.cpMin, 2) + `<small>Mach local ${num(machLoc, 2)}</small>`);
    put('fLift', num(lift, 0) + NB + 'N/m' + `<small>C<sub>L</sub> estimé ${num(res.clReal, 3)}</small>`);
    put('fRe', `${num(re / Math.pow(10, e), 1)}·10<sup>${e}</sup><small>Mach ${num(speed/SOUND, 2)}</small>`);
    if (noteEl){
      const msg = sepOn ? WARN_SEP(num((1 - res.f)*100, 0)) : machLoc > MACH_MAX ? WARN_MACH(machLoc) : '';
      noteEl.classList.toggle('warn', !!msg); noteEl.innerHTML = msg || NOTE;
    }
    if (reseed) seed();
    drawCp();
    if (reduceMotion) staticLines();
  }

  function spawn(p, anywhere){
    for (let k = 0; k < 20; k++){
      const x = anywhere ? Math.random()*W : -10 - Math.random()*30, y = Math.random()*H;
      const s = fromScreen(x, y);
      if (!inside(s)){ p.s = s; p.life = 160 + Math.random()*260; p.trail = []; p.bin = 1; return; }
    }
  }
  function seed(){
    const n = Math.round(Math.min(520, W*H / 520));
    parts = Array.from({ length:n }, () => { const p = {}; spawn(p, true); return p; });
  }
  function fit(c, g){
    const dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return null;
    c.width = w*dpr; c.height = h*dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }
  function resize(){
    const s = fit(cv, ctx); if (!s) return;
    W = s[0]; H = s[1]; if (cpCtx) fit(cpCv, cpCtx);
    scale = Math.min(W / 6.2, H / 3.5); cx = W*0.5; cy = H*0.6;
    readColors(); update(true);
  }
  function readColors(){
    colors = { a:css('--accent'), b:css('--accent-2'), warm:css('--warm'), ink:css('--ink'), panel:css('--panel'), line:css('--line'), muted:css('--muted') };
  }
  function clear(){ ctx.clearRect(0, 0, W, H); }

  // Chaque particule garde ses dernières positions ; tout est redessiné à chaque image
  // (un effacement progressif du canvas laisse des traces résiduelles qui s'accumulent).
  const TRAIL = 34;
  function step(dt){
    tAnim += dt;
    for (const e of eddies){ e.u += dt*0.11*e.c; if (e.u > 1){ e.u = 0; e.v = Math.random(); } }
    for (const p of parts){
      const k1 = velocity(p.s), mid = [p.s[0] + k1.v[0]*dt/2, p.s[1] + k1.v[1]*dt/2], k2 = velocity(mid);
      p.s = [p.s[0] + k2.v[0]*dt, p.s[1] + k2.v[1]*dt];
      p.life--; p.bin = k2.speed < 0.9 ? 0 : k2.speed > 1.12 ? 2 : 1;   // ralenti, proche de V∞, accéléré
      const [x, y] = toScreen(toZ(p.s));
      if (p.life < 0 || x > W + 40 || y < -40 || y > H + 40 || inside(p.s)){ spawn(p, false); continue; }
      p.trail.push(x, y);
      if (p.trail.length > TRAIL*2) p.trail.splice(0, 2);
    }
    clear();
    ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // deux moitiés de traînée (ancienne pâle, récente marquée) × trois couleurs (vitesse locale)
    const palette = [colors.warm, colors.b, colors.a];
    for (let bin = 0; bin < 3; bin++){
      for (const [from, opacity] of [[0, 0.22], [0.5, 0.75]]){
        ctx.beginPath();
        for (const p of parts){
          const t = p.trail, n = t.length / 2;
          if (p.bin !== bin || n < 3) continue;
          const i0 = Math.floor((n - 1)*from), i1 = from ? n - 1 : Math.floor((n - 1)*0.5);
          ctx.moveTo(t[i0*2], t[i0*2 + 1]);
          for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(t[i*2], t[i*2 + 1]);
        }
        ctx.strokeStyle = palette[bin]; ctx.globalAlpha = opacity; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    scene();
  }

  // Pression pariétale : flèches normales à la paroi, de longueur proportionnelle à |Cp|.
  function drawPressure(){
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    for (const [suction, color] of [[true, colors.a], [false, colors.warm]]){
      const is = k => (res.cp[k] < 0) === suction && !(sepOn && k < iSep);   // rien dans la zone décollée
      ctx.beginPath();
      for (let k = 0; k < N - 1; k++){
        if (!is(k) || !is(k + 1)) continue;
        const p = envXY[k], q = envXY[k + 1];
        ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(p[2], p[3]); ctx.closePath();
      }
      ctx.fillStyle = color; ctx.globalAlpha = 0.13; ctx.fill();
      ctx.beginPath();
      for (let k = 0; k < N - 1; k++){
        if (!is(k) || !is(k + 1)) continue;
        ctx.moveTo(envXY[k][2], envXY[k][3]); ctx.lineTo(envXY[k + 1][2], envXY[k + 1][3]);
      }
      for (let k = 4; k < N; k += 9){
        if (is(k)){ ctx.moveTo(envXY[k][0], envXY[k][1]); ctx.lineTo(envXY[k][2], envXY[k][3]); }
      }
      ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.85; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawFoil(){
    ctx.beginPath();
    foilXY.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath(); ctx.fillStyle = colors.panel; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = colors.a; ctx.stroke();
  }
  function arrow(x0, y0, x1, y1, color, width){
    const a = Math.atan2(y1 - y0, x1 - x0), h = 4 + width*2.4;
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - h*0.6*Math.cos(a), y1 - h*0.6*Math.sin(a)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - h*Math.cos(a - 0.42), y1 - h*Math.sin(a - 0.42));
    ctx.lineTo(x1 - h*Math.cos(a + 0.42), y1 - h*Math.sin(a + 0.42));
    ctx.closePath(); ctx.fill();
  }
  function label(text, x, y, align, color){
    ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function tag(text, x, y, align, color){                           // libellé sur fond, lisible par-dessus les lignes de courant
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    const w = ctx.measureText(text).width, x0 = align === 'right' ? x - w : x;
    ctx.fillStyle = colors.panel; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.roundRect(x0 - 4, y - 8, w + 8, 16, 4); ctx.fill(); ctx.globalAlpha = 1;
    label(text, x, y, align, color);
  }
  function drawForces(){
    // point d'arrêt
    const st = envXY[res.iStag];
    ctx.beginPath(); ctx.arc(st[0], st[1], 3.4, 0, 2*Math.PI); ctx.fillStyle = colors.warm; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = colors.panel; ctx.stroke();
    // Torseur réduit au quart de corde : portance (perpendiculaire à la vitesse amont) et moment.
    // Ce point reste fixe alors que le centre de poussée part à l'infini quand la portance s'annule.
    // Échelle linéaire sur les efforts dimensionnels : une flèche deux fois plus longue est une force deux fois plus grande.
    const [bx, by] = toScreen([xmin + chord/4, chordY(0.25)]);
    const len = res.lift / LIFT_MAX * H*0.37;
    if (Math.abs(len) >= 12) arrow(bx, by, bx, by - len, colors.ink, 2.6);
    else if (Math.abs(len) >= 0.5){                                 // trop courte pour porter une pointe
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - len);
      ctx.strokeStyle = colors.ink; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.stroke();
    }
    // Moment : arc d'ouverture proportionnelle à |M′|. CM < 0 (piqueur, nez à gauche) : sens antihoraire à l'écran.
    const R = 21, sweep = Math.min(4, Math.abs(res.mom) / MOMENT_MAX * 3.2), dir = res.cm < 0 ? -1 : 1;
    if (sweep >= 0.15){
      const a0 = -dir*sweep/2, a1 = dir*sweep/2;
      ctx.beginPath(); ctx.arc(bx, by, R, a0, a1, dir < 0);
      ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.stroke();
      const ex = bx + R*Math.cos(a1), ey = by + R*Math.sin(a1), tx = -dir*Math.sin(a1), ty = dir*Math.cos(a1);
      arrow(ex, ey, ex + 9*tx, ey + 9*ty, colors.ink, 1.7);
    }
    ctx.beginPath(); ctx.arc(bx, by, 3, 0, 2*Math.PI); ctx.fillStyle = colors.ink; ctx.fill();
    // Libellés placés hors du profil et de son enveloppe de pression, sur la largeur qu'ils occupent.
    let top = by, bottom = by;
    envXY.forEach((e, k) => {
      if (e[0] < bx || e[0] > bx + 115 || (sepOn && k < iSep)) return;
      if (k < iLE) top = Math.min(top, e[1], e[3]); else bottom = Math.max(bottom, e[1], e[3]);
    });
    if (Math.abs(res.clReal) > 0.03) tag(`L′ ${num(res.lift, 0)}${NB}N/m`, bx + 10, Math.min(by - len + 8, top - 11), 'left', colors.ink);
    tag(`M¼ ${num(res.mom, 0)}${NB}N·m/m`, bx + 4, Math.max(by + R + 12, bottom + 11), 'left', colors.ink);
    // vitesse amont
    const y = H - 18, l = (16 + speed*0.42) * Math.min(1, W/420);   // raccourcie sur petit écran, pour ne pas toucher la légende
    arrow(16, y, 16 + l, y, colors.muted, 1.6);
    label('V∞', 16 + l + 7, y, 'left', colors.muted);
    // légende des pressions
    let x = W - 14;
    for (const [text, color] of [['surpression', colors.warm], ['dépression', colors.a]]){
      label(text, x, y, 'right', colors.muted);
      x -= ctx.measureText(text).width + 8;
      ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.fillRect(x - 10, y - 2, 10, 4); ctx.globalAlpha = 1;
      x -= 24;
    }
  }
  // Zone décollée et sillage : représentation schématique (couche de cisaillement et tourbillons), pas un calcul.
  function upperY(x){                                               // ordonnée écran de l'extrados à l'abscisse x
    for (let i = 0; i < iLE; i++){
      const a = foilXY[i], b = foilXY[i + 1];
      if ((a[0] - x)*(b[0] - x) <= 0 && a[0] !== b[0]) return a[1] + (b[1] - a[1])*(x - a[0])/(b[0] - a[0]);
    }
    return foilXY[0][1];
  }
  function drawWake(){
    if (!sepOn) return;
    const xs = foilXY[iSep][0], ys = foilXY[iSep][1], xt = foilXY[0][0], yt = foilXY[0][1], xe = W + 12;
    const wave = (x, x0, ph) => Math.min(5, 0.035*(x - x0)) * Math.sin(0.05*(x - x0) - 5*tAnim + ph);
    const top = x => ys + wave(x, xs, 0), bot = x => x < xt ? upperY(x) : yt + wave(x, xt, 2);
    ctx.beginPath(); ctx.moveTo(xs, ys);
    for (let x = xs; x <= xe; x += 6) ctx.lineTo(x, top(x));
    for (let x = xe; x > xt; x -= 6) ctx.lineTo(x, bot(x));
    for (let i = 0; i <= iSep; i++) ctx.lineTo(foilXY[i][0], foilXY[i][1]);
    ctx.closePath(); ctx.fillStyle = colors.panel; ctx.globalAlpha = 0.82; ctx.fill();
    ctx.beginPath(); ctx.moveTo(xs, ys);
    for (let x = xs; x <= xe; x += 6) ctx.lineTo(x, top(x));
    ctx.moveTo(xt, yt);
    for (let x = xt; x <= xe; x += 6) ctx.lineTo(x, bot(x));
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.lineCap = 'butt'; ctx.strokeStyle = colors.muted; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.lineCap = 'round';
    for (const e of eddies){
      const x = xs + e.u*(xe - xs), t = top(x), th = bot(x) - t;
      if (th < 7) continue;
      const y = t + (0.22 + 0.56*e.v)*th, r = Math.min(th*0.4, e.r), a0 = tAnim*e.w + e.ph;
      ctx.moveTo(x + r*Math.cos(a0), y + r*Math.sin(a0)); ctx.arc(x, y, r, a0, a0 + 4.4);
      ctx.moveTo(x + r*0.45*Math.cos(a0 + 2), y + r*0.45*Math.sin(a0 + 2)); ctx.arc(x, y, r*0.45, a0 + 2, a0 + 5.6);
    }
    ctx.strokeStyle = colors.muted; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
    label('décollement', Math.min(W - 60, (xs + xt)/2 + 40), ys - 9, 'center', colors.muted);
  }
  function scene(){ drawPressure(); drawWake(); drawFoil(); drawForces(); }

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
    ctx.globalAlpha = 1; scene();
  }

  // Répartition de pression le long de la corde ; l'axe est inversé, comme le veut l'usage : dépression en haut.
  function drawCp(){
    if (!cpCtx || !res) return;
    const w = cpCv.clientWidth, h = cpCv.clientHeight; if (!w || !h) return;
    const g = cpCtx, L = 36, R = 12, T = 8, B = 20, pw = w - L - R, ph = h - T - B;
    const low = Math.max(-8, Math.min(-1.5, Math.floor(res.cpMin*2) / 2));
    const X = xc => L + xc*pw, Y = c => T + (Math.max(c, low) - low) / (1 - low) * ph;
    g.clearRect(0, 0, w, h);
    g.lineWidth = 1; g.strokeStyle = colors.line;
    g.beginPath(); g.moveTo(L, T); g.lineTo(L, T + ph); g.lineTo(L + pw, T + ph); g.stroke();
    g.setLineDash([3, 3]); g.beginPath(); g.moveTo(L, Y(0)); g.lineTo(L + pw, Y(0)); g.stroke(); g.setLineDash([]);
    g.font = '500 10.5px Inter, system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = colors.muted;
    g.textAlign = 'right';
    for (const c of [low, 0, 1]) if (c !== 1 || Y(1) - Y(0) >= 11) g.fillText(num(c, c % 1 ? 1 : 0), L - 6, Y(c));
    g.textAlign = 'center';
    for (const xc of [0, 0.5, 1]) g.fillText(num(xc, xc % 1 ? 1 : 0), X(xc), T + ph + 11);
    g.textAlign = 'right'; g.fillText('x/c', L + pw - 2, T + ph - 8);
    g.lineWidth = 2; g.lineJoin = 'round';
    for (const [k0, k1, color] of [[iLE, N, colors.b], [0, iLE, colors.a]]){
      g.beginPath();
      for (let k = k0; k < k1; k++){
        const px = X((zMid[k][0] - xmin) / chord), py = Y(res.cp[k]);
        k === k0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.strokeStyle = color; g.stroke();
    }
  }

  let last = 0;
  function loop(t){
    if (!running) return;
    // pas de temps lié au temps réel (vitesse identique à 60 ou 144 Hz) et à la vitesse amont choisie
    const dt = last ? Math.min(0.05, (t - last)/1000 * 1.1 * (0.45 + 0.55*speed/50)) : 0.018; last = t;
    if (visible && !document.hidden && res) step(dt);
    requestAnimationFrame(loop);
  }
  $('alpha').addEventListener('input', () => update(true));
  if ($('flowMoreBtn')) $('flowMoreBtn').addEventListener('click', e => {
    const more = $('flowMore'), open = more.hidden;
    more.hidden = !open;
    e.currentTarget.setAttribute('aria-expanded', open);
    e.currentTarget.textContent = open ? 'Masquer la pression et les efforts' : 'Afficher la pression et les efforts';
    resize();                                                        // le tracé de Cp n'a de taille qu'une fois affiché
  });
  if ($('vinf')) $('vinf').addEventListener('input', () => update(false));
  new IntersectionObserver(en => { visible = en[0].isIntersecting; }).observe(cv);
  themeListeners.push(() => { readColors(); clear(); drawCp(); if (reduceMotion) staticLines(); });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
  resize();
  if (!reduceMotion){ running = true; requestAnimationFrame(loop); }
})();
