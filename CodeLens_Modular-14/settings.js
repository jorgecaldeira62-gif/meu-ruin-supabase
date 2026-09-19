// ╔══════════════════════════════════════════════════╗
// ║  settings.js — Chaves IA, Supabase, GitHub      ║
// ╚══════════════════════════════════════════════════╝

window.initSettings = () => {
  const sbUrl = ls('sb_url')||'';
  const ghRepo = ls('gh_repo')||'';
  if (sbUrl) document.getElementById('cfg-sb-url').value = sbUrl;
  document.getElementById('cfg-gh-repo').value = ghRepo;
  renderKeySlots();
  document.getElementById('sql-box').value = window.SQL_SCHEMA||'';
};

// ── Chaves de IA ─────────────────────────────────────
window.renderKeySlots = () => {
  const keys=JSON.parse(ls('ai_keys')||'[]');
  const el=document.getElementById('key-slots');
  el.innerHTML=keys.length
    ? keys.map((k,i)=>`
        <div class="key-slot">
          <input type="checkbox" ${k.active?'checked':''} onchange="toggleKey(${i})" style="accent-color:#58a6ff;flex-shrink:0;">
          <span class="key-prov" style="color:${k.active?'#3fb950':'#8b949e'};">${detectProvider(k.key)?.name||'?'}</span>
          <input type="password" value="${k.key}" onchange="updateKey(${i},this.value)" class="key-input">
          <button onclick="removeKey(${i})" class="key-del">✕</button>
        </div>`).join('')
    : '<p class="empty-msg">Nenhuma chave. Adicione abaixo.</p>';
  window.updateChatInfo && updateChatInfo();
};

window.addKey = () => {
  const val=document.getElementById('new-key').value.trim();
  if (!val){toast('Cole a chave no campo.','err');return;}
  const keys=JSON.parse(ls('ai_keys')||'[]');
  keys.push({key:val,active:!keys.length});
  lsS('ai_keys',JSON.stringify(keys));
  document.getElementById('new-key').value='';
  renderKeySlots(); toast('✅ Chave adicionada!');
};

window.toggleKey = (i) => {
  const keys=JSON.parse(ls('ai_keys')||'[]');
  keys.forEach((k,j)=>k.active=j===i);
  lsS('ai_keys',JSON.stringify(keys)); renderKeySlots();
};

window.updateKey = (i,val) => {
  const keys=JSON.parse(ls('ai_keys')||'[]');
  if(keys[i]) keys[i].key=val.trim();
  lsS('ai_keys',JSON.stringify(keys));
};

window.removeKey = (i) => {
  const keys=JSON.parse(ls('ai_keys')||'[]');
  keys.splice(i,1); lsS('ai_keys',JSON.stringify(keys)); renderKeySlots();
};

// ── Supabase ─────────────────────────────────────────
window.saveSB = () => {
  const url=document.getElementById('cfg-sb-url').value.trim();
  const key=document.getElementById('cfg-sb-key').value.trim();
  if(!url||!key){toast('Preencha URL e Key!','err');return;}
  lsS('sb_url',url); lsS('sb_key',key);
  document.getElementById('cfg-sb-key').value='';
  toast('✅ Supabase salvo! Recarregando...');
  setTimeout(()=>location.reload(),1000);
};

// ── GitHub ───────────────────────────────────────────
window.saveGH = () => {
  const t=document.getElementById('cfg-gh-token').value.trim();
  const r=document.getElementById('cfg-gh-repo').value.trim();
  if(t) lsS('gh_token',t);
  if(r) lsS('gh_repo',r);
  document.getElementById('cfg-gh-token').value='';
  toast('✅ GitHub salvo!');
};

// ── SQL ──────────────────────────────────────────────
window.copySql = () => {
  navigator.clipboard.writeText(document.getElementById('sql-box').value)
    .then(()=>toast('✅ SQL copiado! Cole no Supabase → SQL Editor.'));
};
