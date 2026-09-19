// ╔══════════════════════════════════════════════════╗
// ║  playground.js — HTML/CSS/JS + preview + snippets║
// ╚══════════════════════════════════════════════════╝

const PG = {
  tab: 'html',
  html: `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<style>body{font-family:sans-serif;padding:20px;background:#f0f4f8;}
h1{color:#2563eb;}.btn{background:#2563eb;color:#fff;border:none;
padding:10px 20px;border-radius:8px;font-size:15px;cursor:pointer;}</style>
</head><body>
<h1>🚀 Playground</h1><p>Edite e veja ao vivo!</p>
<button class="btn" onclick="alert('✅ Funcionou!')">Testar</button>
</body></html>`,
  css: '', js: '', timer: null, snippets: [],
};

// ── Inicializar ──────────────────────────────────────
window.initPlayground = () => {
  document.getElementById('pg-editor').value = PG.html;
  setTimeout(runPg, 300);
};

// ── Abas HTML / CSS / JS ─────────────────────────────
window.setPgTab = (tab) => {
  PG[PG.tab] = document.getElementById('pg-editor').value;
  PG.tab = tab;
  const labels = { html:'✏️ HTML', css:'🎨 CSS', js:'📜 JavaScript' };
  document.getElementById('pg-tab-lbl').textContent = labels[tab];
  document.getElementById('pg-editor').value = PG[tab];
  ['html','css','js'].forEach(t => document.getElementById('pg-btn-'+t).classList.toggle('active',t===tab));
};

window.onPgChange = () => {
  PG[PG.tab] = document.getElementById('pg-editor').value;
  if (document.getElementById('pg-auto').checked) {
    clearTimeout(PG.timer);
    PG.timer = setTimeout(runPg, 600);
  }
};

// ── Preview ──────────────────────────────────────────
window.runPg = () => {
  PG[PG.tab] = document.getElementById('pg-editor').value;
  const blob = new Blob([buildPgDoc()],{type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const fr   = document.getElementById('pg-frame');
  if (fr._p) URL.revokeObjectURL(fr._p);
  fr._p=url; fr.src=url;
};

function buildPgDoc() {
  const h = PG.html.trim().toLowerCase();
  if (h.includes('<!doctype')||h.includes('<html')) return PG.html;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PG.css}</style></head><body>${PG.html}<script>${PG.js}<\/script></html>`;
}

window.downloadPg = () => {
  const title = document.getElementById('pg-title').value.trim()||'playground';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([buildPgDoc()],{type:'text/html'}));
  a.download=title+'.html'; a.click();
};

window.fullscreenPg = () => {
  PG[PG.tab]=document.getElementById('pg-editor').value;
  window.open(URL.createObjectURL(new Blob([buildPgDoc()],{type:'text/html;charset=utf-8'})),'_blank');
};

// ── Snippets ─────────────────────────────────────────
window.savePg = async () => {
  PG[PG.tab]=document.getElementById('pg-editor').value;
  const title=document.getElementById('pg-title').value.trim()||'Sem título';
  if (APP.sb && APP.user) {
    const {error}=await APP.sb.from('snippets').insert({user_id:APP.user.id,title,html:PG.html,css:PG.css,js:PG.js});
    if (error){toast('Erro: '+error.message,'err');return;}
    toast('✅ Salvo no Supabase!');
  } else {
    const local=JSON.parse(ls('snippets')||'[]');
    local.push({id:Date.now(),title,html:PG.html,css:PG.css,js:PG.js,date:new Date().toISOString()});
    lsS('snippets',JSON.stringify(local));
    toast('✅ Salvo localmente!');
  }
  await loadSnippets(); renderSnippets();
};

window.loadSnippets = async () => {
  if (APP.sb && APP.user) {
    const {data}=await APP.sb.from('snippets').select('*').eq('user_id',APP.user.id).order('created_at',{ascending:false});
    PG.snippets=data||[];
  } else { PG.snippets=JSON.parse(ls('snippets')||'[]'); }
};

window.renderSnippets = () => {
  const el=document.getElementById('snip-list');
  el.innerHTML=PG.snippets.length
    ? PG.snippets.map(s=>`<div class="snip-item" onclick="loadSnippet('${s.id}')">
        <span class="snip-name">${esc(s.title)}</span>
        <button class="snip-del" onclick="event.stopPropagation();deleteSnippet('${s.id}')">✕</button>
      </div>`).join('')
    : '<p class="empty-msg">Nenhum snippet salvo.</p>';
};

window.loadSnippet = (id) => {
  const s=PG.snippets.find(x=>String(x.id)===String(id)); if(!s) return;
  PG.html=s.html||''; PG.css=s.css||''; PG.js=s.js||'';
  document.getElementById('pg-title').value=s.title||'';
  document.getElementById('pg-editor').value=PG[PG.tab];
  runPg(); toggleSnippetDrawer();
};

window.deleteSnippet = async (id) => {
  if (!confirm('Deletar?')) return;
  if (APP.sb&&APP.user) { await APP.sb.from('snippets').delete().eq('id',id); }
  else { lsS('snippets',JSON.stringify(JSON.parse(ls('snippets')||'[]').filter(s=>String(s.id)!==String(id)))); }
  await loadSnippets(); renderSnippets(); toast('Deletado');
};

window.toggleSnippetDrawer = async () => {
  const d=document.getElementById('snip-drawer');
  d.classList.toggle('hidden');
  if (!d.classList.contains('hidden')){ await loadSnippets(); renderSnippets(); }
};
