// ═══════════════════════════════════════════════════════════
//  CodeLens — app.js  (toda a lógica)
// ═══════════════════════════════════════════════════════════

// ── 0. ESTADO GLOBAL ────────────────────────────────────────
const S = {
  // Editor
  files: {}, currentFile: null, previewTimer: null,
  edAIMsgs: [], edBusy: false,
  // Playground
  pg: { tab: 'html', html: defaultHtml(), css: '', js: '' },
  pgTimer: null, snippets: [],
  // Chat
  chatMsgs: [], chatBusy: false, chatId: null, convs: [],
  // Supabase
  sb: null, user: null,
};

const SQL = `-- Cole no SQL Editor do Supabase → Run
CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  path text NOT NULL, content text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, path)
);
CREATE TABLE IF NOT EXISTS chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text DEFAULT 'Nova conversa', created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid REFERENCES chats(id) ON DELETE CASCADE,
  role text NOT NULL, content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS snippets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text DEFAULT 'Sem título', html text DEFAULT '',
  css text DEFAULT '', js text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippets  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON projects  FOR ALL USING (auth.uid()=user_id);
CREATE POLICY "own" ON files     FOR ALL USING (project_id IN (SELECT id FROM projects WHERE user_id=auth.uid()));
CREATE POLICY "own" ON chats     FOR ALL USING (auth.uid()=user_id);
CREATE POLICY "own" ON messages  FOR ALL USING (chat_id IN (SELECT id FROM chats WHERE user_id=auth.uid()));
CREATE POLICY "own" ON snippets  FOR ALL USING (auth.uid()=user_id);`;

// ── 1. INIT ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sql-box').value = SQL;
  loadConfig();
  initSB();
  initEditor();
  initPg();
  updateChatAIInfo();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
});

function loadConfig() {
  const url = ls('sb_url') || '';
  const ghRepo = ls('gh_repo') || '';
  if (url) document.getElementById('cfg-sb-url').value = url;
  document.getElementById('cfg-gh-repo').value = ghRepo;
  renderKeySlots();
}

async function initSB() {
  const url = ls('sb_url'), key = ls('sb_key');
  if (!url || !key) { setSBStatus(false); return; }
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    S.sb = createClient(url, key);
    const { data } = await S.sb.auth.getUser();
    S.user = data?.user || null;
    setSBStatus(true);
    if (S.user) {
      document.getElementById('user-badge').textContent = '👤 ' + S.user.email.split('@')[0];
      document.getElementById('user-lbl').textContent = '👤 ' + S.user.email;
    }
  } catch { setSBStatus(false, 'erro'); }
}

function setSBStatus(ok, msg) {
  const dot = document.getElementById('sb-dot');
  dot.style.background = ok ? 'var(--green)' : 'var(--red)';
  document.getElementById('sb-lbl').textContent = msg || (ok ? 'conectado' : 'não configurado');
}

// ── 2. NAVEGAÇÃO ─────────────────────────────────────────────
const SECTIONS = { home: 'home', editor: 'editor-section', pg: 'pg-section', chat: 'chat-section', cfg: 'cfg-section' };
const NAV_BTNS = ['home','editor','pg','chat','cfg'];

window.go = (name) => {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((b, i) => b.classList.toggle('active', NAV_BTNS[i] === name));
  document.getElementById(SECTIONS[name]).classList.add('active');
  if (name === 'pg') { document.getElementById('pg-editor').value = S.pg[S.pg.tab]; setTimeout(runPg, 100); }
  if (name === 'chat') loadConvs();
};

// ── 3. UTILITÁRIOS ───────────────────────────────────────────
const ls  = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsS = (k,v) => { try { localStorage.setItem(k, v); } catch {} };

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function md(s) {
  return String(s)
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:#0a0e14;padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type === 'err' ? '#da3633' : '#238636';
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}

function handleTabKey(e, el) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const s = el.selectionStart;
  el.value = el.value.substring(0, s) + '  ' + el.value.substring(el.selectionEnd);
  el.selectionStart = el.selectionEnd = s + 2;
}

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return { html:'🌐',css:'🎨',js:'📜',ts:'📘',jsx:'⚛',tsx:'⚛',json:'📋',md:'📝',py:'🐍',txt:'📄',svg:'🖼' }[ext] || '📄';
}

function defaultHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  body{font-family:sans-serif;padding:20px;background:#f0f4f8;}
  h1{color:#2563eb;}
  button{background:#2563eb;color:#fff;border:none;padding:10px 20px;
    border-radius:8px;font-size:15px;cursor:pointer;margin-top:12px;}
</style>
</head>
<body>
  <h1>🚀 Playground</h1>
  <p>Edite e veja ao vivo!</p>
  <button onclick="alert('Funcionou! ✅')">Testar</button>
</body>
</html>`;
}

// ── 4. IA ────────────────────────────────────────────────────
function detectProvider(key) {
  if (!key) return null;
  if (key.startsWith('AIza'))   return { name:'Gemini',     base:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-2.0-flash' };
  if (key.startsWith('gsk_'))   return { name:'Groq',       base:'https://api.groq.com/openai/v1', model:'llama-3.3-70b-versatile' };
  if (key.startsWith('sk-or-')) return { name:'OpenRouter', base:'https://openrouter.ai/api/v1', model:'anthropic/claude-haiku' };
  if (key.startsWith('xai-'))   return { name:'Grok',       base:'https://api.x.ai/v1', model:'grok-3-mini' };
  if (key.startsWith('sk-'))    return { name:'OpenAI',     base:'https://api.openai.com/v1', model:'gpt-4o-mini' };
  return null;
}

function getActiveKey() {
  const slots = JSON.parse(ls('ai_keys') || '[]');
  return slots.find(s => s.active)?.key || slots[0]?.key || null;
}

async function callAI(messages, maxTokens = 4096) {
  const key = getActiveKey();
  if (!key) throw new Error('Nenhuma chave configurada! Vá em ⚙️ Config.');
  const prov = detectProvider(key);
  if (!prov) throw new Error('Chave inválida: ' + key.slice(0, 8) + '...');
  const r = await fetch(`${prov.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: prov.model, messages, max_tokens: maxTokens })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.choices?.[0]?.message?.content || '';
}

// ── 5. EDITOR ────────────────────────────────────────────────
function initEditor() {
  const saved = ls('ed_files');
  if (saved) S.files = JSON.parse(saved);
  renderFileTree();
  if (Object.keys(S.files).length) openEdFile(Object.keys(S.files)[0]);
}

function renderFileTree() {
  const tree = document.getElementById('file-tree');
  const keys = Object.keys(S.files).sort();
  tree.innerHTML = keys.length ? keys.map(f => `
    <div class="tree-item ${f === S.currentFile ? 'active' : ''}" onclick="openEdFile('${esc(f)}')">
      <span>${fileIcon(f)}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f)}</span>
      <button class="del" onclick="event.stopPropagation();delEdFile('${esc(f)}')">✕</button>
    </div>
  `).join('') : '<p style="padding:12px;font-size:12px;color:var(--muted);">Sem arquivos. Crie ou importe ZIP.</p>';
}

function openEdFile(name) {
  if (S.currentFile) S.files[S.currentFile] = document.getElementById('ed-code').value;
  S.currentFile = name;
  const code = S.files[name] || '';
  document.getElementById('ed-code').value = code;
  document.getElementById('ed-fname').textContent = name;
  document.getElementById('ed-info').textContent = code.split('\n').length + ' linhas';
  renderFileTree();
  if (name.endsWith('.html') || name.endsWith('.htm')) schedulePreview();
}

window.onEdEdit = () => {
  if (S.currentFile) S.files[S.currentFile] = document.getElementById('ed-code').value;
  const lines = (S.files[S.currentFile] || '').split('\n').length;
  document.getElementById('ed-info').textContent = lines + ' linhas';
  if (S.currentFile?.endsWith('.html')) schedulePreview();
};

function schedulePreview() {
  clearTimeout(S.previewTimer);
  S.previewTimer = setTimeout(updatePreview, 600);
}

function updatePreview() {
  const c = S.files[S.currentFile] || '';
  const blob = new Blob([c], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const fr = document.getElementById('ed-iframe');
  if (fr._prev) URL.revokeObjectURL(fr._prev);
  fr._prev = url; fr.src = url;
}

window.newEdFile = () => {
  const name = prompt('Nome do arquivo:', 'novo.html');
  if (!name?.trim()) return;
  S.files[name.trim()] = '';
  renderFileTree();
  openEdFile(name.trim());
};

window.delEdFile = (name) => {
  if (!confirm(`Deletar "${name}"?`)) return;
  delete S.files[name];
  if (S.currentFile === name) {
    S.currentFile = null;
    document.getElementById('ed-code').value = '';
    document.getElementById('ed-fname').textContent = 'sem arquivo';
  }
  renderFileTree();
};

window.saveEdFile = () => {
  if (S.currentFile) S.files[S.currentFile] = document.getElementById('ed-code').value;
  lsS('ed_files', JSON.stringify(S.files));
  if (S.sb && S.user) saveFilesToSB();
  toast('✅ Salvo!');
};

async function saveFilesToSB() {
  // Salvar todos no Supabase
}

window.toggleSidebar = () => document.getElementById('ed-sidebar').classList.toggle('hidden');
window.togglePreview = () => { const p = document.getElementById('ed-preview'); p.classList.toggle('hidden'); if (!p.classList.contains('hidden')) updatePreview(); };
window.expandPreview = () => document.getElementById('ed-preview').classList.toggle('expanded');
window.toggleAIPane = () => document.getElementById('ai-pane').classList.toggle('hidden');

window.importZip = () => document.getElementById('zip-input').click();

window.handleZipImport = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  if (!window.JSZip) { toast('JSZip carregando, tente em 2 segundos', 'err'); return; }
  const zip = await JSZip.loadAsync(file);
  const textExts = new Set(['html','htm','css','js','ts','jsx','tsx','json','md','txt','py','svg','xml','sh','bat','yaml','yml','env']);
  let count = 0;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!textExts.has(ext)) continue;
    const parts = name.split('/');
    const path = parts.length > 1 ? parts.slice(1).join('/') : name;
    if (!path) continue;
    S.files[path] = await entry.async('text');
    count++;
  }
  renderFileTree();
  const keys = Object.keys(S.files);
  if (keys.length) openEdFile(keys[0]);
  toast(`✅ ${count} arquivo(s) importados`);
  e.target.value = '';
};

window.exportZip = async () => {
  if (S.currentFile) S.files[S.currentFile] = document.getElementById('ed-code').value;
  if (!window.JSZip) { toast('JSZip ainda carregando...', 'err'); return; }
  const zip = new JSZip();
  for (const [p, c] of Object.entries(S.files)) zip.file(p, c);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `projeto-${Date.now()}.zip`; a.click();
  toast('✅ ZIP exportado!');
};

window.pushGitHub = async () => {
  const token = ls('gh_token'), repo = ls('gh_repo');
  if (!token || !repo) { toast('Configure GitHub em ⚙️ Config', 'err'); return; }
  if (S.currentFile) S.files[S.currentFile] = document.getElementById('ed-code').value;
  toast('Enviando para GitHub...');
  let ok = 0;
  for (const [path, content] of Object.entries(S.files)) {
    try {
      const existing = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: { 'Authorization': `token ${token}` } });
      const sha = existing.ok ? (await existing.json()).sha : undefined;
      await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Update ${path}`, content: btoa(unescape(encodeURIComponent(content))), sha })
      });
      ok++;
    } catch {}
  }
  toast(`✅ ${ok} arquivo(s) enviados!`);
};

// Editor AI
window.sendEdAI = async () => {
  if (S.edBusy) return;
  const input = document.getElementById('ai-ed-prompt');
  const text = input.value.trim(); if (!text) return;
  input.value = '';
  const code = S.files[S.currentFile] || '';
  const sys = { role: 'system', content: `Assistente de programação. Arquivo: ${S.currentFile || 'nenhum'}\n\`\`\`\n${code.slice(0,3000)}\n\`\`\`` };
  S.edAIMsgs.push({ role: 'user', content: text });
  addEdAIMsg('user', text);
  const thinking = addEdAIMsg('assistant', '');
  thinking.querySelector('.ai-m').children[0].innerHTML = '<span class="dot-anim"><span></span><span></span><span></span></span>';
  S.edBusy = true;
  try {
    const msgs = [sys, ...S.edAIMsgs.slice(-10)];
    const reply = await callAI(msgs);
    thinking.querySelector('.ai-m').children[0].innerHTML = md(reply);
    S.edAIMsgs.push({ role: 'assistant', content: reply });
  } catch(e) {
    thinking.querySelector('.ai-m').children[0].innerHTML = `<span style="color:var(--red)">Erro: ${esc(e.message)}</span>`;
  }
  S.edBusy = false;
  document.getElementById('ai-msgs').scrollTop = 99999;
};

function addEdAIMsg(role, content) {
  const wrap = document.createElement('div');
  const div = document.createElement('div');
  div.className = 'ai-m ' + role;
  div.innerHTML = `<div>${content ? md(content) : ''}</div>`;
  wrap.appendChild(div);
  document.getElementById('ai-msgs').appendChild(wrap);
  document.getElementById('ai-msgs').scrollTop = 99999;
  return wrap;
}

window.clearEdAI = () => { S.edAIMsgs = []; document.getElementById('ai-msgs').innerHTML = ''; };

// ── 6. PLAYGROUND ────────────────────────────────────────────
function initPg() {
  document.getElementById('pg-editor').value = S.pg.html;
  loadLocalSnippets();
  setTimeout(runPg, 200);
}

window.setPgTab = (tab) => {
  S.pg[S.pg.tab] = document.getElementById('pg-editor').value;
  S.pg.tab = tab;
  const labels = { html: '✏️ HTML', css: '🎨 CSS', js: '📜 JavaScript' };
  document.getElementById('pg-lbl').textContent = labels[tab];
  document.getElementById('pg-editor').value = S.pg[tab];
  ['html','css','js'].forEach(t => document.getElementById('pg-tab-'+t).classList.toggle('active', t===tab));
};

window.onPgEdit = () => {
  S.pg[S.pg.tab] = document.getElementById('pg-editor').value;
  if (document.getElementById('pg-auto').checked) {
    clearTimeout(S.pgTimer);
    S.pgTimer = setTimeout(runPg, 600);
  }
};

window.runPg = () => {
  S.pg[S.pg.tab] = document.getElementById('pg-editor').value;
  const doc = buildPgDoc();
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const fr = document.getElementById('pg-iframe');
  if (fr._prev) URL.revokeObjectURL(fr._prev);
  fr._prev = url; fr.src = url;
};

function buildPgDoc() {
  const h = S.pg.html.trim().toLowerCase();
  if (h.includes('<!doctype') || h.includes('<html')) return S.pg.html;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${S.pg.css}</style></head><body>${S.pg.html}<script>${S.pg.js}<\/script></html>`;
}

window.downloadPg = () => {
  S.pg[S.pg.tab] = document.getElementById('pg-editor').value;
  const title = document.getElementById('pg-title').value || 'playground';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buildPgDoc()], { type: 'text/html' }));
  a.download = title + '.html'; a.click();
};

window.fullscreenPg = () => {
  S.pg[S.pg.tab] = document.getElementById('pg-editor').value;
  window.open(URL.createObjectURL(new Blob([buildPgDoc()], { type: 'text/html;charset=utf-8' })), '_blank');
};

window.savePg = async () => {
  S.pg[S.pg.tab] = document.getElementById('pg-editor').value;
  const title = document.getElementById('pg-title').value.trim() || 'Sem título';
  const snip = { id: Date.now(), title, html: S.pg.html, css: S.pg.css, js: S.pg.js, date: new Date().toISOString() };

  if (S.sb && S.user) {
    const { error } = await S.sb.from('snippets').insert({ user_id: S.user.id, title, html: S.pg.html, css: S.pg.css, js: S.pg.js });
    if (error) { toast('Erro: ' + error.message, 'err'); return; }
    toast('✅ Salvo no Supabase!');
  } else {
    const local = JSON.parse(ls('snippets') || '[]');
    local.push(snip);
    lsS('snippets', JSON.stringify(local));
    toast('✅ Salvo localmente!');
  }
  await loadLocalSnippets();
  renderSnippets();
};

async function loadLocalSnippets() {
  if (S.sb && S.user) {
    const { data } = await S.sb.from('snippets').select('*').eq('user_id', S.user.id).order('created_at', { ascending: false });
    S.snippets = data || [];
  } else {
    S.snippets = JSON.parse(ls('snippets') || '[]');
  }
}

function renderSnippets() {
  const list = document.getElementById('snip-list');
  list.innerHTML = S.snippets.length ? S.snippets.map(s => `
    <div class="snip-item" onclick="loadSnippet('${s.id}')">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;">${esc(s.title)}</span>
      <button class="sn-del" onclick="event.stopPropagation();delSnippet('${s.id}')">✕</button>
    </div>
  `).join('') : '<p style="padding:10px;font-size:12px;color:var(--muted);">Nenhum snippet.</p>';
}

window.loadSnippet = (id) => {
  const s = S.snippets.find(x => String(x.id) === String(id)); if (!s) return;
  S.pg.html = s.html || ''; S.pg.css = s.css || ''; S.pg.js = s.js || '';
  document.getElementById('pg-title').value = s.title || '';
  document.getElementById('pg-editor').value = S.pg[S.pg.tab];
  runPg();
  toggleSnippets();
};

window.delSnippet = async (id) => {
  if (!confirm('Deletar?')) return;
  if (S.sb && S.user) {
    await S.sb.from('snippets').delete().eq('id', id);
  } else {
    const local = JSON.parse(ls('snippets') || '[]').filter(s => String(s.id) !== String(id));
    lsS('snippets', JSON.stringify(local));
  }
  await loadLocalSnippets();
  renderSnippets();
  toast('Deletado');
};

window.toggleSnippets = async () => {
  const d = document.getElementById('snip-drawer');
  d.classList.toggle('hidden');
  if (!d.classList.contains('hidden')) { await loadLocalSnippets(); renderSnippets(); }
};

// ── 7. CHAT ──────────────────────────────────────────────────
function updateChatAIInfo() {
  const key = getActiveKey();
  const prov = key ? detectProvider(key) : null;
  document.getElementById('chat-ai-info').textContent = prov
    ? `${prov.name} · ${prov.model} · Ctrl+Enter envia`
    : 'IA não configurada — vá em ⚙️ Config';
  const badge = document.getElementById('ai-badge');
  const lbl = document.getElementById('ai-lbl');
  if (prov) {
    badge.textContent = prov.name;
    lbl.textContent = prov.name;
    document.getElementById('ai-dot')?.style && (document.getElementById('ai-dot').style.background = 'var(--green)');
  }
}

window.sendChatMsg = async () => {
  if (S.chatBusy) return;
  const input = document.getElementById('chat-prompt');
  const text = input.value.trim(); if (!text) return;
  const key = getActiveKey();
  if (!key) { toast('Configure IA em ⚙️ Config', 'err'); return; }
  input.value = '';

  S.chatMsgs.push({ role: 'user', content: text });
  addChatMsg('user', text);
  updateMemBadge();

  S.chatBusy = true;
  document.getElementById('chat-send').disabled = true;
  document.getElementById('chat-send').textContent = '…';

  const thinking = addChatMsg('assistant', '');
  thinking.querySelector('.cm').innerHTML = '<div class="dot-anim"><span></span><span></span><span></span></div>';

  try {
    const ctx = parseInt(document.getElementById('ctx-sel').value);
    const useMem = document.getElementById('use-mem').checked;
    const msgs = useMem ? S.chatMsgs.slice(-Math.floor(ctx / 200)) : [{ role: 'user', content: text }];
    const reply = await callAI(msgs, Math.min(ctx, 8192));
    thinking.querySelector('.cm').innerHTML = md(reply);
    S.chatMsgs.push({ role: 'assistant', content: reply });

    if (S.sb && S.chatId) {
      await S.sb.from('messages').insert([
        { chat_id: S.chatId, role: 'user', content: text },
        { chat_id: S.chatId, role: 'assistant', content: reply }
      ]);
    }
    if (document.getElementById('use-tts').checked) speakText(reply);
  } catch(e) {
    thinking.querySelector('.cm').innerHTML = `<span style="color:var(--red)">Erro: ${esc(e.message)}</span>`;
  }

  S.chatBusy = false;
  document.getElementById('chat-send').disabled = false;
  document.getElementById('chat-send').textContent = '▶';
  updateMemBadge();
};

function addChatMsg(role, content) {
  const div = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = 'cm ' + role;
  inner.innerHTML = role === 'user'
    ? `<div style="font-size:11px;color:var(--blue);margin-bottom:3px;">👤 Você</div><div style="white-space:pre-wrap;">${esc(content)}</div>`
    : `<div style="font-size:11px;color:var(--green);margin-bottom:3px;">🤖 IA</div>${content ? md(content) : ''}`;
  div.appendChild(inner);
  document.getElementById('chat-msgs').appendChild(div);
  document.getElementById('chat-msgs').scrollTop = 99999;
  return div;
}

function updateMemBadge() {
  document.getElementById('mem-lbl').textContent = S.chatMsgs.length + ' msgs';
}

window.newChatConv = async () => {
  S.chatMsgs = []; S.chatId = null;
  document.getElementById('chat-msgs').innerHTML = '';
  updateMemBadge();
  if (S.sb && S.user) {
    const { data } = await S.sb.from('chats').insert({ user_id: S.user.id, title: 'Nova conversa' }).select().single();
    S.chatId = data?.id;
    await loadConvs();
  }
};

window.clearChatMsgs = () => { S.chatMsgs = []; document.getElementById('chat-msgs').innerHTML = ''; updateMemBadge(); };

window.exportChat = () => {
  const txt = S.chatMsgs.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  a.download = 'chat-' + Date.now() + '.txt'; a.click();
};

async function loadConvs() {
  if (!S.sb || !S.user) return;
  const { data } = await S.sb.from('chats').select('*').eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(20);
  S.convs = data || [];
  document.getElementById('conv-list').innerHTML = S.convs.map(c => `
    <div class="conv-item ${c.id === S.chatId ? 'active' : ''}" onclick="loadConv('${c.id}')">
      💬 ${esc(c.title || 'Conversa')}
      <div style="font-size:10px;color:var(--muted);">${new Date(c.created_at).toLocaleDateString('pt-BR')}</div>
    </div>
  `).join('');
}

window.loadConv = async (id) => {
  S.chatId = id; S.chatMsgs = [];
  document.getElementById('chat-msgs').innerHTML = '';
  if (S.sb) {
    const { data } = await S.sb.from('messages').select('*').eq('chat_id', id).order('created_at');
    (data || []).forEach(m => { S.chatMsgs.push({ role: m.role, content: m.content }); addChatMsg(m.role, m.content); });
  }
  updateMemBadge();
  loadConvs();
};

window.toggleChatSidebar = () => document.getElementById('chat-sidebar').classList.toggle('hidden');

// ── TTS ──────────────────────────────────────────────────────
window.toggleTTSBar = () => {
  document.getElementById('tts-bar').style.display = document.getElementById('use-tts').checked ? 'flex' : 'none';
};
let ttsUtter = null;
function speakText(text) {
  if (!window.speechSynthesis) return;
  stopTTS();
  const clean = text.replace(/```[\s\S]*?```/g,'').replace(/[*_`#]/g,'').trim().slice(0,3000);
  ttsUtter = new SpeechSynthesisUtterance(clean);
  ttsUtter.lang = 'pt-BR';
  ttsUtter.rate = parseFloat(document.getElementById('tts-speed').value);
  window.speechSynthesis.speak(ttsUtter);
}
window.stopTTS = () => window.speechSynthesis?.cancel();

// ── 8. CONFIG ────────────────────────────────────────────────
window.saveSB = () => {
  const url = document.getElementById('cfg-sb-url').value.trim();
  const key = document.getElementById('cfg-sb-key').value.trim();
  if (!url || !key) { toast('Preencha URL e Key!', 'err'); return; }
  lsS('sb_url', url); lsS('sb_key', key);
  document.getElementById('cfg-sb-key').value = '';
  toast('✅ Supabase salvo! Recarregando...');
  setTimeout(() => location.reload(), 1000);
};

window.saveGH = () => {
  const t = document.getElementById('cfg-gh-token').value.trim();
  const r = document.getElementById('cfg-gh-repo').value.trim();
  if (t) lsS('gh_token', t);
  if (r) lsS('gh_repo', r);
  document.getElementById('cfg-gh-token').value = '';
  toast('✅ GitHub salvo!');
};

function renderKeySlots() {
  const keys = JSON.parse(ls('ai_keys') || '[]');
  document.getElementById('key-slots').innerHTML = keys.length ? keys.map((k, i) => `
    <div class="key-slot">
      <input type="checkbox" ${k.active?'checked':''} onchange="toggleKey(${i})" style="accent-color:var(--blue);flex-shrink:0;">
      <span style="font-size:11px;color:${k.active?'var(--green)':'var(--muted)'};">${detectProvName(k.key)}</span>
      <input type="password" value="${k.key}" onchange="updateKey(${i},this.value)">
      <button onclick="removeKey(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;flex-shrink:0;">✕</button>
    </div>
  `).join('') : '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Nenhuma chave. Adicione abaixo.</p>';
  updateChatAIInfo();
}

function detectProvName(key) {
  if (!key) return '—';
  if (key.startsWith('AIza'))   return 'Gemini';
  if (key.startsWith('gsk_'))   return 'Groq';
  if (key.startsWith('sk-ant-'))return 'Claude';
  if (key.startsWith('sk-or-')) return 'OpenRouter';
  if (key.startsWith('sk-'))    return 'OpenAI';
  return '?';
}

window.addKey = () => {
  const val = document.getElementById('new-key-input').value.trim();
  if (!val) return;
  const keys = JSON.parse(ls('ai_keys') || '[]');
  keys.push({ key: val, active: !keys.length });
  lsS('ai_keys', JSON.stringify(keys));
  document.getElementById('new-key-input').value = '';
  renderKeySlots();
  toast('✅ Chave adicionada!');
};

window.toggleKey = (i) => {
  const keys = JSON.parse(ls('ai_keys') || '[]');
  keys.forEach((k, j) => k.active = j === i);
  lsS('ai_keys', JSON.stringify(keys));
  renderKeySlots();
};

window.updateKey = (i, val) => {
  const keys = JSON.parse(ls('ai_keys') || '[]');
  keys[i].key = val.trim();
  lsS('ai_keys', JSON.stringify(keys));
};

window.removeKey = (i) => {
  const keys = JSON.parse(ls('ai_keys') || '[]');
  keys.splice(i, 1);
  lsS('ai_keys', JSON.stringify(keys));
  renderKeySlots();
};

window.copySql = () => {
  navigator.clipboard.writeText(document.getElementById('sql-box').value)
    .then(() => toast('✅ SQL copiado!'));
};

// Auth
window.doLogin = async () => {
  if (!S.sb) { toast('Configure Supabase primeiro!', 'err'); return; }
  const email = document.getElementById('cfg-email').value.trim();
  const pass  = document.getElementById('cfg-pass').value;
  const { error } = await S.sb.auth.signInWithPassword({ email, password: pass });
  if (error) { showAuthMsg('Erro: ' + error.message, 'err'); return; }
  showAuthMsg('✅ Logado! Recarregando...', 'ok');
  setTimeout(() => location.reload(), 800);
};

window.doRegister = async () => {
  if (!S.sb) { toast('Configure Supabase primeiro!', 'err'); return; }
  const email = document.getElementById('cfg-email').value.trim();
  const pass  = document.getElementById('cfg-pass').value;
  const { error } = await S.sb.auth.signUp({ email, password: pass });
  if (error) { showAuthMsg('Erro: ' + error.message, 'err'); return; }
  showAuthMsg('✅ Conta criada! Verifique seu email.', 'ok');
};

window.doReset = async () => {
  if (!S.sb) { toast('Configure Supabase primeiro!', 'err'); return; }
  const email = document.getElementById('cfg-email').value.trim();
  if (!email) { showAuthMsg('Digite seu email.', 'err'); return; }
  await S.sb.auth.resetPasswordForEmail(email);
  showAuthMsg('✅ Email de recuperação enviado!', 'ok');
};

window.doLogout = async () => {
  if (S.sb) await S.sb.auth.signOut();
  lsS('sb_url', ''); lsS('sb_key', '');
  location.reload();
};

function showAuthMsg(msg, type) {
  const el = document.getElementById('auth-msg');
  el.textContent = msg;
  el.style.color = type === 'err' ? 'var(--red)' : 'var(--green)';
}

// ── 9. PWA ───────────────────────────────────────────────────
// Service worker registrado no DOMContentLoaded
