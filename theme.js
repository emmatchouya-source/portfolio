document.getElementById('year').textContent = new Date().getFullYear();
const themes = ['auto', 'light', 'dark'], labels = { auto:'Thème : auto', light:'Thème : clair', dark:'Thème : sombre' };
let i = 0;
try { const s = localStorage.getItem('pfTheme'); if (themes.includes(s)) i = themes.indexOf(s); } catch (e) {}
function apply(){
  const t = themes[i];
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  document.getElementById('themeBtn').textContent = labels[t];
  try { localStorage.setItem('pfTheme', t); } catch (e) {}
}
document.getElementById('themeBtn').addEventListener('click', () => { i = (i + 1)%3; apply(); });
apply();
// Les liens vers une autre page s'ouvrent dans un nouvel onglet (sauf ancres, mailto et data-same-tab)
document.querySelectorAll('a[href]').forEach(a => {
  const h = a.getAttribute('href');
  if (h.startsWith('#') || h.startsWith('mailto:') || a.hasAttribute('data-same-tab')) return;
  const u = new URL(a.href, location.href);
  if (u.origin === location.origin && u.pathname === location.pathname) return;
  a.target = '_blank'; a.rel = 'noopener';
});
