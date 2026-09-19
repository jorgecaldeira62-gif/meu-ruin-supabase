// ╔══════════════════════════════════════════════════╗
// ║  router.js — Navegação entre seções             ║
// ╚══════════════════════════════════════════════════╝

const SECTIONS = ['home','editor','playground','chat','settings'];

window.go = (name) => {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((b,i) => b.classList.toggle('active', SECTIONS[i]===name));
  const el = document.getElementById('sec-'+name);
  if (el) el.classList.add('active');
  if (name==='playground') setTimeout(()=>window.runPg&&runPg(), 100);
  if (name==='chat') window.loadConvs && loadConvs();
};
