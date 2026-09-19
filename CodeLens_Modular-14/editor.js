// ╔══════════════════════════════════════════════════╗
// ║  editor.js — Árvore de arquivos, código,        ║
// ║              preview ao vivo, painel IA         ║
// ╚══════════════════════════════════════════════════╝

const ED = { files:{}, current:null, timer:null, aiMsgs:[], busy:false };

// ── Inicializar ──────────────────────────────────────
window.initEditor = () => {
  try { ED.files = JSON.parse(ls('ed_files')||'{}'); } catch{}
  renderTree();
  const first = Object.keys(ED.files)[0];
  if (first) openFile(first);
};

// ── Árvore de arquivos ───────────────────────────────
function renderTree() {
  const el = document.getElementById('ed-tree');
  if (!el) return;
  const keys = Object.keys(ED.files).sort();
  el.innerHTML = keys.length
    ? keys.map(f=>`
        <div class="tree-item ${f===ED.current?'active':''}" onclick="openFile('${esc(f)}')">
          <span>${fileIcon(f)}</span>
          <span class="tree-name">${esc(f)}</span>
          <button class="tree-del" onclick="event.stopPropagation();deleteFile('${esc(f)}')">✕</button>
        </div>`).join('')
    : '<p class="tree-empty">Sem arquivos.<br>Crie (+) ou importe ZIP.</p>';
}

window.newEdFile = () => {
  const n = prompt('Nome do arquivo:','novo.html');
  if (!n?.trim()) return;
  ED.files[n.trim()]=''; renderTree(); openFile(n.trim());
};

window.deleteFile = (name) => {
  if (!confirm(`Deletar "${name}"?`)) return;
  delete ED.files[name];
  if (ED.current===name) { ED.current=null; setEditorContent('',''); }
  renderTree();
};

window.toggleEdSidebar = () => document.getElementById('ed-sidebar').classList.toggle('hidden');

// ── Abrir e editar arquivo ───────────────────────────
window.openFile = (name) => {
  if (ED.current) ED.files[ED.current] = document.getElementById('ed-code').value;
  ED.current = name;
  const code = ED.files[name]||'';
  setEditorContent(name, code);
  renderTree();
  if (name.endsWith('.html')||name.endsWith('.htm')) scheduleEdPreview();
};

function setEditorContent(name, code) {
  const ta = document.getElementById('ed-code'); if (!ta) return;
  ta.value = code;
  document.getElementById('ed-fname').textContent = name||'sem arquivo';
  document.getElementById('ed-info').textContent  = name ? code.split('\n').length+' linhas' : '';
}

window.onEdChange = () => {
  if (!ED.current) return;
  ED.files[ED.current] = document.getElementById('ed-code').value;
  const n = ED.files[ED.current].split('\n').length;
  document.getElementById('ed-info').textContent = n+' linhas';
  if (ED.current.endsWith('.html')) scheduleEdPreview();
};

// ── Salvar ───────────────────────────────────────────
window.saveFile = () => {
  if (!ED.current) { toast('Abra um arquivo.','err'); return; }
  ED.files[ED.current] = document.getElementById('ed-code').value;
  lsS('ed_files', JSON.stringify(ED.files));
  toast('✅ Salvo!');
};

// ── Preview ao vivo ──────────────────────────────────
function scheduleEdPreview() {
  clearTimeout(ED.timer);
  ED.timer = setTimeout(updateEdPreview, 600);
}

function updateEdPreview() {
  const c    = ED.files[ED.current]||'';
  const blob = new Blob([c],{type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const fr   = document.getElementById('ed-preview');
  if (fr._p) URL.revokeObjectURL(fr._p);
  fr._p=url; fr.src=url;
}

window.toggleEdPreview = () => {
  const p = document.getElementById('ed-preview-pane');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) updateEdPreview();
};

window.toggleEdAI = () => document.getElementById('ed-ai-pane').classList.toggle('hidden');

// ── IA do editor ─────────────────────────────────────
window.sendEdAI = async () => {
  if (ED.busy) return;
  const inp = document.getElementById('ed-ai-input');
  const txt = inp.value.trim(); if (!txt) return;
  inp.value='';
  const code = ED.files[ED.current]||'';
  const sys  = {role:'system',content:`Assistente de código. Arquivo: ${ED.current||'nenhum'}\n\`\`\`\n${code.slice(0,3000)}\n\`\`\``};
  ED.aiMsgs.push({role:'user',content:txt});
  addEdAIMsg('user',txt);
  const think = addEdAIMsg('assistant','<span class="dot-anim"><span></span><span></span><span></span></span>');
  ED.busy=true;
  try {
    const reply = await callAI([sys,...ED.aiMsgs.slice(-10)],4096);
    think.innerHTML = md(reply);
    ED.aiMsgs.push({role:'assistant',content:reply});
  } catch(e) { think.innerHTML=`<span style="color:#f85149">Erro: ${esc(e.message)}</span>`; }
  ED.busy=false;
  document.getElementById('ed-ai-msgs').scrollTop=99999;
};

function addEdAIMsg(role,html) {
  const d = document.createElement('div');
  d.className='ai-msg '+role; d.innerHTML=html;
  document.getElementById('ed-ai-msgs').appendChild(d);
  document.getElementById('ed-ai-msgs').scrollTop=99999;
  return d;
}

window.clearEdAI = () => { ED.aiMsgs=[]; document.getElementById('ed-ai-msgs').innerHTML=''; };

// ── ZIP: importar ────────────────────────────────────
window.importEdZip = () => document.getElementById('ed-zip-input').click();

window.handleEdZip = async (e) => {
  const file=e.target.files[0]; if (!file) return;
  if (!window.JSZip) { toast('JSZip carregando...','err'); return; }
  const zip = await JSZip.loadAsync(file);
  const TEXT = new Set(['html','htm','css','js','ts','jsx','tsx','json','md','txt','py','svg','xml','sh','bat','yaml','yml','env']);
  let n=0;
  for (const [name,entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const ext=(name.split('.').pop()||'').toLowerCase();
    if (!TEXT.has(ext)) continue;
    const parts=name.split('/');
    const path=parts.length>1?parts.slice(1).join('/'):name;
    if (!path) continue;
    ED.files[path]=await entry.async('text'); n++;
  }
  renderTree();
  const first=Object.keys(ED.files)[0]; if (first) openFile(first);
  toast(`✅ ${n} arquivo(s) importados`);
  e.target.value='';
};

// ── ZIP: exportar ────────────────────────────────────
window.exportEdZip = async () => {
  if (ED.current) ED.files[ED.current]=document.getElementById('ed-code').value;
  if (!window.JSZip) { toast('JSZip carregando...','err'); return; }
  const zip=new JSZip();
  for (const [p,c] of Object.entries(ED.files)) zip.file(p,c);
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=`projeto-${Date.now()}.zip`; a.click();
  toast('✅ ZIP exportado!');
};

// ── GitHub ───────────────────────────────────────────
window.pushGitHub = async () => {
  const token=ls('gh_token'), repo=ls('gh_repo');
  if (!token||!repo) { toast('Configure GitHub em ⚙️','err'); return; }
  if (ED.current) ED.files[ED.current]=document.getElementById('ed-code').value;
  toast('Enviando para GitHub...');
  let ok=0,fail=0;
  for (const [path,content] of Object.entries(ED.files)) {
    try {
      const check=await fetch(`https://api.github.com/repos/${repo}/contents/${path}`,{headers:{'Authorization':`token ${token}`}});
      const sha=check.ok?(await check.json()).sha:undefined;
      const r=await fetch(`https://api.github.com/repos/${repo}/contents/${path}`,{
        method:'PUT',headers:{'Authorization':`token ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({message:`Update ${path}`,content:btoa(unescape(encodeURIComponent(content))),sha})
      });
      r.ok?ok++:fail++;
    } catch{fail++;}
  }
  toast(fail?`✅ ${ok} ok · ❌ ${fail} erro(s)`:`✅ ${ok} arquivo(s) enviados!`);
};
