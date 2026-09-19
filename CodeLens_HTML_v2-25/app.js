// ╔══════════════════════════════════════════════════════════════════╗
// ║                     CodeLens — app.js                           ║
// ║              Maikon Caldeira · OAB/MG 183712                    ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  PARTE 0  — Estado global e constantes                          ║
// ║  PARTE 1  — Inicialização                                       ║
// ║  PARTE 2  — Utilitários (toast, esc, md, tabKey)                ║
// ║  PARTE 3  — Supabase (init, status)                             ║
// ║  PARTE 4  — Autenticação (login, register, logout)              ║
// ║  PARTE 5  — Navegação (go, seções)                              ║
// ║  PARTE 6  — Detecção de IA (provider, activeKey, callAI)        ║
// ║  PARTE 7  — Editor: Árvore de arquivos                          ║
// ║  PARTE 8  — Editor: Código (open, save, edit, preview)          ║
// ║  PARTE 9  — Editor: ZIP (import, export)                        ║
// ║  PARTE 10 — Editor: GitHub push                                 ║
// ║  PARTE 11 — Editor: Painel de IA                                ║
// ║  PARTE 12 — Playground: Tabs e Preview ao vivo                  ║
// ║  PARTE 13 — Playground: Snippets (salvar, carregar, deletar)    ║
// ║  PARTE 14 — Chat: Enviar e exibir mensagens                     ║
// ║  PARTE 15 — Chat: Histórico de conversas (Supabase)             ║
// ║  PARTE 16 — TTS (voz, velocidade, parar)                        ║
// ║  PARTE 17 — Configurações (chaves, Supabase, GitHub)            ║
// ╚══════════════════════════════════════════════════════════════════╝

// ════════════════════════════════════════════════════════════════════
//  PARTE 0 — ESTADO GLOBAL E CONSTANTES
// ════════════════════════════════════════════════════════════════════
const S = {
  // Editor
  files: {},          // { 'caminho/arquivo.html': 'conteúdo' }
  currentFile: null,  // nome do arquivo aberto
  previewTimer: null, // timer para preview ao vivo
  edAIMsgs: [],       // histórico IA do editor
  edBusy: false,      // IA ocupada no editor

  // Playground
  pg: {
    tab: 'html',      // aba ativa: html | css | js
    html: '',         // conteúdo HTML
    css: '',          // conteúdo CSS
    js: '',           // conteúdo JS
  },
  pgTimer: null,      // timer para auto-preview
  snippets: [],       // lista de snippets salvos

  // Chat
  chatMsgs: [],       // mensagens da conversa atual
  chatBusy: false,    // IA ocupada no chat
  chatId: null,       // ID da conversa no Supabase
  convs: [],          // lista de conversas

  // Supabase
  sb: null,           // cliente Supabase
  user: null,         // usuário logado
};

const SQL_SCHEMA = `
-- ════════════════════════════════════════════════
-- COLE ISSO NO SQL EDITOR DO SUPABASE → RUN
-- ════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  content text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, path)
);
CREATE TABLE IF NOT EXISTS chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text DEFAULT 'Nova conversa',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid REFERENCES chats(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS snippets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text DEFAULT 'Sem título',
  html text DEFAULT '',
  css text DEFAULT '',
  js text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippets  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_projects"  ON projects  FOR ALL USING (auth.uid()=user_id);
CREATE POLICY "own_files"     ON files     FOR ALL USING (project_id IN (SELECT id FROM projects WHERE user_id=auth.uid()));
CREATE POLICY "own_chats"     ON chats     FOR ALL USING (auth.uid()=user_id);
CREATE POLICY "own_messages"  ON messages  FOR ALL USING (chat_id IN (SELECT id FROM chats WHERE user_id=auth.uid()));
CREATE POLICY "own_snippets"  ON snippets  FOR ALL USING (auth.uid()=user_id);
`.trim();


// ════════════════════════════════════════════════════════════════════
//  PARTE 1 — INICIALIZAÇÃO
// ════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  // Preencher SQL na config
  document.getElementById('sql-box').value = SQL_SCHEMA;

  // Inicializar módulos em ordem
  await p3_initSB();       // Supabase primeiro (precisa ser async)
  p5_initNav();            // Navegação
  p7_renderFileTree();     // Árvore vazia
  p8_initEditor();         // Restaurar arquivos salvos
  p12_initPlayground();    // Playground com HTML padrão
  p14_updateChatAIInfo();  // Info de IA no chat
  p17_loadConfig();        // Campos de configuração

  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});


// ════════════════════════════════════════════════════════════════════
//  PARTE 2 — UTILITÁRIOS
// ════════════════════════════════════════════════════════════════════

// localStorage helpers
const ls  = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsS = (k,v) => { try { localStorage.setItem(k,v); } catch {} };

// Escapar HTML (evita XSS)
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Markdown mínimo (negrito, código, quebra de linha)
function md(s) {
  return String(s)
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:#0a0e14;padding:1px 5px;border-radius:3px;font-size:12px;">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// Toast de notificação
function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type === 'err' ? '#da3633' : '#238636';
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}

// Lidar com tecla Tab em textarea (insere 2 espaços)
window.handleTabKey = (e, el) => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const s = el.selectionStart;
  el.value = el.value.substring(0, s) + '  ' + el.value.substring(el.selectionEnd);
  el.selectionStart = el.selectionEnd = s + 2;
};

// Ícone por extensão de arquivo
function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = { html:'🌐', htm:'🌐', css:'🎨', js:'📜', ts:'📘', jsx:'⚛', tsx:'⚛',
    json:'📋', md:'📝', py:'🐍', txt:'📄', svg:'🖼', xml:'📄', sh:'⚙', bat:'⚙' };
  return map[ext] || '📄';
}

// HTML padrão do Playground
function defaultHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  body { font-family:sans-serif; padding:20px; background:#f0f4f8; }
  h1   { color:#2563eb; }
  .btn { background:#2563eb; color:#fff; border:none; padding:10px 20px;
         border-radius:8px; font-size:15px; cursor:pointer; margin-top:12px; }
</style>
</head>
<body>
  <h1>🚀 Playground</h1>
  <p>Edite o código e veja ao vivo!</p>
  <button class="btn" onclick="alert('Funcionou! ✅')">Testar</button>
</body>
</html>`;
}


// ════════════════════════════════════════════════════════════════════
//  PARTE 3 — SUPABASE (inicializar, status)
// ════════════════════════════════════════════════════════════════════
async function p3_initSB() {
  const url = ls('sb_url');
  const key = ls('sb_key');

  if (!url || !key) {
    setSBStatus(false);
    return;
  }

  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    S.sb = createClient(url, key);

    const { data } = await S.sb.auth.getUser();
    S.user = data?.user || null;

    setSBStatus(true);

    if (S.user) {
      document.getElementById('user-badge').textContent = '👤 ' + S.user.email.split('@')[0];
      document.getElementById('user-lbl').textContent   = '👤 ' + S.user.email;
    }
  } catch {
    setSBStatus(false, 'erro de conexão');
  }
}

function setSBStatus(ok, msg) {
  document.getElementById('sb-dot').style.background = ok ? 'var(--green)' : 'var(--red)';
  document.getElementById('sb-lbl').textContent = msg || (ok ? 'conectado' : 'não configurado');
}


// ════════════════════════════════════════════════════════════════════
//  PARTE 4 — AUTENTICAÇÃO (login, registro, logout, reset senha)
// ════════════════════════════════════════════════════════════════════
window.doLogin = async () => {
  if (!S.sb) { toast('Configure o Supabase em ⚙️ Config', 'err'); return; }
  const email = document.getElementById('cfg-email').value.trim();
  const pass  = document.getElementById('cfg-pass').value;
  if (!email || !pass) { showAuthMsg('Preencha email e senha.', 'err'); return; }

  showAuthMsg('Entrando...', 'ok');
  const { error } = await S.sb.auth.signInWithPassword({ email, password: pass });
  if (error) { showAuthMsg('Erro: ' + error.message, 'err'); return; }

  showAuthMsg('✅ Logado! Recarregando...', 'ok');
  setTimeout(() => location.reload(), 800);
};

window.doRegister = async () => {
  if (!S.sb) { toast('Configure o Supabase em ⚙️ Config', 'err'); return; }
  const email = document.getElementById('cfg-email').value.trim();
  const pass  = document.getElementById('cfg-pass').value;
  if (!email || !pass) { showAuthMsg('Preencha email e senha.', 'err'); return; }

  const { error } = await S.sb.auth.signUp({ email, password: pass });
  if (error) { showAuthMsg('Erro: ' + error.message, 'err'); return; }
  showAuthMsg('✅ Conta criada! Verifique seu email para confirmar.', 'ok');
};

window.doReset = async () => {
  if (!S.sb) { toast('Configure o Supabase em ⚙️ Config', 'err'); return; }
  const email = document.getElementById('cfg-email').value.trim();
  if (!email) { showAuthMsg('Digite seu email primeiro.', 'err'); return; }

  await S.sb.auth.resetPasswordForEmail(email);
  showAuthMsg('✅ Email de recuperação enviado!', 'ok');
};

window.doLogout = async () => {
  if (S.sb) await S.sb.auth.signOut();
  lsS('sb_url', '');
  lsS('sb_key', '');
  location.reload();
};

function showAuthMsg(msg, type) {
  const el = document.getElementById('auth-msg');
  el.textContent = msg;
  el.style.color = type === 'err' ? 'var(--red)' : 'var(--green)';
}


// ════════════════════════════════════════════════════════════════════
//  PARTE 5 — NAVEGAÇÃO (trocar seções sem recarregar a página)
// ════════════════════════════════════════════════════════════════════
const SECTION_IDS = {
  home:   'home',
  editor: 'editor-section',
  pg:     'pg-section',
  chat:   'chat-section',
  cfg:    'cfg-section',
};
const NAV_ORDER = ['home','editor','pg','chat','cfg'];

function p5_initNav() {
  // Já inicia na seção "home" pelo HTML
}

window.go = (name) => {
  // Esconder todas as seções
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

  // Ativar botão de nav correspondente
  document.querySelectorAll('.nav-btn').forEach((b, i) => {
    b.classList.toggle('active', NAV_ORDER[i] === name);
  });

  // Mostrar seção escolhida
  document.getElementById(SECTION_IDS[name]).classList.add('active');

  // Ações específicas ao entrar em cada seção
  if (name === 'pg')   { document.getElementById('pg-editor').value = S.pg[S.pg.tab]; setTimeout(runPg, 100); }
  if (name === 'chat') { p15_loadConvs(); }
};


// ════════════════════════════════════════════════════════════════════
//  PARTE 6 — DETECÇÃO DE IA (provider, chamar API)
// ════════════════════════════════════════════════════════════════════

// Detectar provedor pela chave
function detectProvider(key) {
  if (!key) return null;
  if (key.startsWith('AIza'))    return { name:'Gemini',     base:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-2.0-flash' };
  if (key.startsWith('gsk_'))    return { name:'Groq',       base:'https://api.groq.com/openai/v1',                         model:'llama-3.3-70b-versatile' };
  if (key.startsWith('sk-or-'))  return { name:'OpenRouter', base:'https://openrouter.ai/api/v1',                           model:'anthropic/claude-haiku' };
  if (key.startsWith('xai-'))    return { name:'Grok',       base:'https://api.x.ai/v1',                                    model:'grok-3-mini' };
  if (key.startsWith('sk-ant-')) return { name:'Claude',     base:null,                                                     model:'claude-haiku-4' }; // sem CORS no browser
  if (key.startsWith('sk-'))     return { name:'OpenAI',     base:'https://api.openai.com/v1',                              model:'gpt-4o-mini' };
  return null;
}

// Nome legível do provedor
function detectProvName(key) {
  return detectProvider(key)?.name || '?';
}

// Pegar chave ativa
function getActiveKey() {
  const slots = JSON.parse(ls('ai_keys') || '[]');
  return slots.find(s => s.active)?.key || slots[0]?.key || null;
}

// Chamar API de IA
async function callAI(messages, maxTokens = 4096) {
  const key = getActiveKey();
  if (!key) throw new Error('Nenhuma chave configurada! Vá em ⚙️ Config.');

  const prov = detectProvider(key);
  if (!prov) throw new Error('Chave com formato desconhecido: ' + key.slice(0,8) + '...');
  if (!prov.base) throw new Error(`${prov.name} não suporta chamadas diretas do navegador. Use Gemini (AIza...) ou Groq (gsk_...).`);

  const r = await fetch(`${prov.base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model:      prov.model,
      messages,
      max_tokens: Math.min(maxTokens, 32000),
    }),
  });

  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.choices?.[0]?.message?.content || '';
}


// ════════════════════════════════════════════════════════════════════
//  PARTE 7 — EDITOR: ÁRVORE DE ARQUIVOS
// ════════════════════════════════════════════════════════════════════
function p7_renderFileTree() {
  const tree = document.getElementById('file-tree');
  const keys = Object.keys(S.files).sort();

  if (!keys.length) {
    tree.innerHTML = '<p style="padding:12px;font-size:12px;color:var(--muted);">Sem arquivos.<br>Crie (+) ou importe um ZIP.</p>';
    return;
  }

  tree.innerHTML = keys.map(f => `
    <div class="tree-item ${f === S.currentFile ? 'active' : ''}" onclick="p8_openFile('${esc(f)}')">
      <span>${fileIcon(f)}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f)}</span>
      <button class="del" onclick="event.stopPropagation();p7_deleteFile('${esc(f)}')">✕</button>
    </div>
  `).join('');
}

window.newEdFile = () => {
  const name = prompt('Nome do arquivo (ex: index.html):');
  if (!name?.trim()) return;
  S.files[name.trim()] = '';
  p7_renderFileTree();
  p8_openFile(name.trim());
};

window.p7_deleteFile = (name) => {
  if (!confirm(`Deletar "${name}"?`)) return;
  delete S.files[name];
  if (S.currentFile === name) {
    S.currentFile = null;
    document.getElementById('ed-code').value = '';
    document.getElementById('ed-fname').textContent = 'sem arquivo';
    document.getElementById('ed-info').textContent  = '';
  }
  p7_renderFileTree();
};

window.toggleSidebar = () => {
  document.getElementById('ed-sidebar').classList.toggle('hidden');
};


// ════════════════════════════════════════════════════════════════════
//  PARTE 8 — EDITOR: ABRIR, SALVAR, EDITAR, PREVIEW
// ════════════════════════════════════════════════════════════════════
function p8_initEditor() {
  const saved = ls('ed_files');
  if (saved) {
    try { S.files = JSON.parse(saved); } catch {}
  }
  p7_renderFileTree();
  const firstFile = Object.keys(S.files)[0];
  if (firstFile) p8_openFile(firstFile);
}

window.p8_openFile = (name) => {
  // Salvar arquivo atual antes de trocar
  if (S.currentFile) S.files[S.currentFile] = document.getElementById('ed-code').value;

  S.currentFile = name;
  const code = S.files[name] || '';
  document.getElementById('ed-code').value   = code;
  document.getElementById('ed-fname').textContent = name;
  document.getElementById('ed-info').textContent  = code.split('\n').length + ' linhas';

  p7_renderFileTree();

  // Atualizar preview automaticamente para HTML
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    p8_schedulePreview();
  }
};

window.onEdEdit = () => {
  if (!S.currentFile) return;
  S.files[S.currentFile] = document.getElementById('ed-code').value;
  const lines = S.files[S.currentFile].split('\n').length;
  document.getElementById('ed-info').textContent = lines + ' linhas';
  if (S.currentFile.endsWith('.html')) p8_schedulePreview();
};

function p8_schedulePreview() {
  clearTimeout(S.previewTimer);
  S.previewTimer = setTimeout(p8_updatePreview, 600);
}

function p8_updatePreview() {
  const content = S.files[S.currentFile] || '';
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const fr   = document.getElementById('ed-iframe');
  if (fr._prev) URL.revokeObjectURL(fr._prev);
  fr._prev = url;
  fr.src   = url;
}

window.saveEdFile = () => {
  if (!S.currentFile) { toast('Abra um arquivo primeiro.', 'err'); return; }
  S.files[S.currentFile] = document.getElementById('ed-code').value;
  lsS('ed_files', JSON.stringify(S.files));
  toast('✅ Arquivo salvo!');
};

window.togglePreview = () => {
  const p = document.getElementById('ed-preview');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) p8_updatePreview();
};

window.expandPreview = () => {
  document.getElementById('ed-preview').classList.toggle('expanded');
};

window.toggleAIPane = () => {
  document.getElementById('ai-pane').classList.toggle('hidden');
};


// ════════════════════════════════════════════════════════════════════
//  PARTE 9 — EDITOR: IMPORTAR E EXPORTAR ZIP
// ════════════════════════════════════════════════════════════════════
const TEXT_EXTS = new Set([
  'html','htm','css','js','ts','jsx','tsx','json','md','txt',
  'py','svg','xml','sh','bat','yaml','yml','env','toml','ini',
]);

window.importZip = () => document.getElementById('zip-input').click();

window.handleZipImport = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!window.JSZip) {
    toast('JSZip ainda carregando, aguarde 2 segundos e tente de novo.', 'err');
    return;
  }

  const zip = await JSZip.loadAsync(file);
  let count = 0;

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!TEXT_EXTS.has(ext)) continue;

    // Remover prefixo da pasta raiz do ZIP
    const parts = name.split('/');
    const path  = parts.length > 1 ? parts.slice(1).join('/') : name;
    if (!path) continue;

    S.files[path] = await entry.async('text');
    count++;
  }

  p7_renderFileTree();
  const first = Object.keys(S.files)[0];
  if (first) p8_openFile(first);
  toast(`✅ ${count} arquivo(s) importados`);
  e.target.value = '';
};

window.exportZip = async () => {
  // Garantir que arquivo atual está salvo
  if (S.currentFile) S.files[S.currentFile] = document.getElementById('ed-code').value;

  if (!window.JSZip) { toast('JSZip ainda carregando...', 'err'); return; }

  const zip = new JSZip();
  for (const [path, content] of Object.entries(S.files)) {
    zip.file(path, content);
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `projeto-${Date.now()}.zip`;
  a.click();
  toast('✅ ZIP exportado!');
};


// ════════════════════════════════════════════════════════════════════
//  PARTE 10 — EDITOR: ENVIAR PARA GITHUB
// ════════════════════════════════════════════════════════════════════
window.pushGitHub = async () => {
  const token = ls('gh_token');
  const repo  = ls('gh_repo');

  if (!token || !repo) {
    toast('Configure GitHub em ⚙️ Config (token + usuario/repo)', 'err');
    return;
  }

  if (S.currentFile) S.files[S.currentFile] = document.getElementById('ed-code').value;
  const fileCount = Object.keys(S.files).length;
  if (!fileCount) { toast('Nenhum arquivo para enviar.', 'err'); return; }

  toast(`Enviando ${fileCount} arquivo(s) para GitHub...`);
  let ok = 0, fail = 0;

  for (const [path, content] of Object.entries(S.files)) {
    try {
      // Verificar se arquivo já existe (para pegar SHA)
      const check = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        headers: { 'Authorization': `token ${token}` },
      });
      const sha = check.ok ? (await check.json()).sha : undefined;

      // Criar ou atualizar arquivo
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          message: `Update ${path}`,
          content: btoa(unescape(encodeURIComponent(content))),
          sha,
        }),
      });

      if (res.ok) ok++; else fail++;
    } catch {
      fail++;
    }
  }

  toast(fail ? `✅ ${ok} enviados · ❌ ${fail} com erro` : `✅ ${ok} arquivo(s) enviados para ${repo}!`);
};


// ════════════════════════════════════════════════════════════════════
//  PARTE 11 — EDITOR: PAINEL DE IA (assistente de código)
// ════════════════════════════════════════════════════════════════════
window.sendEdAI = async () => {
  if (S.edBusy) return;

  const input = document.getElementById('ai-ed-prompt');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';

  // Contexto: arquivo atual
  const code     = S.files[S.currentFile] || '';
  const fileName = S.currentFile || 'nenhum';
  const system = {
    role: 'system',
    content: `Você é um assistente de programação especializado.\nArquivo atual: ${fileName}\n\`\`\`\n${code.slice(0, 3000)}\n\`\`\``,
  };

  S.edAIMsgs.push({ role: 'user', content: text });
  addEdAIMsg('user', text);

  const thinking = addEdAIMsg('assistant', '');
  thinking.querySelector('.ai-m').innerHTML = '<div class="dot-anim"><span></span><span></span><span></span></div>';

  S.edBusy = true;
  try {
    const msgs  = [system, ...S.edAIMsgs.slice(-10)];
    const reply = await callAI(msgs, 4096);
    thinking.querySelector('.ai-m').innerHTML = md(reply);
    S.edAIMsgs.push({ role: 'assistant', content: reply });
  } catch(e) {
    thinking.querySelector('.ai-m').innerHTML = `<span style="color:var(--red)">Erro: ${esc(e.message)}</span>`;
  }
  S.edBusy = false;
  document.getElementById('ai-msgs').scrollTop = 99999;
};

function addEdAIMsg(role, content) {
  const wrap = document.createElement('div');
  const div  = document.createElement('div');
  div.className = 'ai-m ' + role;
  div.innerHTML = content ? md(content) : '';
  wrap.appendChild(div);
  document.getElementById('ai-msgs').appendChild(wrap);
  document.getElementById('ai-msgs').scrollTop = 99999;
  return wrap;
}

window.clearEdAI = () => {
  S.edAIMsgs = [];
  document.getElementById('ai-msgs').innerHTML = '';
};


// ════════════════════════════════════════════════════════════════════
//  PARTE 12 — PLAYGROUND: ABAS E PREVIEW AO VIVO
// ════════════════════════════════════════════════════════════════════
function p12_initPlayground() {
  S.pg.html = defaultHtml();
  S.pg.css  = '';
  S.pg.js   = '';
  document.getElementById('pg-editor').value = S.pg.html;
  setTimeout(runPg, 300);
}

window.setPgTab = (tab) => {
  // Salvar aba atual
  S.pg[S.pg.tab] = document.getElementById('pg-editor').value;
  S.pg.tab = tab;

  // Atualizar label e conteúdo
  const labels = { html: '✏️ HTML', css: '🎨 CSS', js: '📜 JavaScript' };
  document.getElementById('pg-lbl').textContent = labels[tab];
  document.getElementById('pg-editor').value = S.pg[tab];

  // Ativar botão da aba
  ['html','css','js'].forEach(t => {
    document.getElementById('pg-tab-' + t).classList.toggle('active', t === tab);
  });
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
  const doc  = buildPgDoc();
  const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const fr   = document.getElementById('pg-iframe');
  if (fr._prev) URL.revokeObjectURL(fr._prev);
  fr._prev = url;
  fr.src   = url;
};

// Montar documento HTML completo
function buildPgDoc() {
  const h = S.pg.html.trim().toLowerCase();
  // Se já tem doctype/html completo, usar direto
  if (h.includes('<!doctype') || h.includes('<html')) return S.pg.html;
  // Senão, montar envoltório com CSS e JS separados
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<style>${S.pg.css}</style>
</head>
<body>
${S.pg.html}
<script>${S.pg.js}<\/script>
</body></html>`;
}

window.downloadPg = () => {
  S.pg[S.pg.tab] = document.getElementById('pg-editor').value;
  const title = document.getElementById('pg-title').value.trim() || 'playground';
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([buildPgDoc()], { type: 'text/html' }));
  a.download = title + '.html';
  a.click();
};

window.fullscreenPg = () => {
  S.pg[S.pg.tab] = document.getElementById('pg-editor').value;
  window.open(URL.createObjectURL(new Blob([buildPgDoc()], { type: 'text/html;charset=utf-8' })), '_blank');
};


// ════════════════════════════════════════════════════════════════════
//  PARTE 13 — PLAYGROUND: SNIPPETS (salvar, carregar, deletar)
// ════════════════════════════════════════════════════════════════════
window.savePg = async () => {
  S.pg[S.pg.tab] = document.getElementById('pg-editor').value;
  const title = document.getElementById('pg-title').value.trim() || 'Sem título';

  if (S.sb && S.user) {
    // Salvar no Supabase
    const { error } = await S.sb.from('snippets').insert({
      user_id: S.user.id,
      title,
      html: S.pg.html,
      css:  S.pg.css,
      js:   S.pg.js,
    });
    if (error) { toast('Erro Supabase: ' + error.message, 'err'); return; }
    toast('✅ Snippet salvo no Supabase!');
  } else {
    // Salvar no localStorage
    const local = JSON.parse(ls('snippets') || '[]');
    local.push({ id: Date.now(), title, html: S.pg.html, css: S.pg.css, js: S.pg.js, date: new Date().toISOString() });
    lsS('snippets', JSON.stringify(local));
    toast('✅ Snippet salvo localmente!');
  }

  await p13_loadSnippets();
  p13_renderSnippets();
};

async function p13_loadSnippets() {
  if (S.sb && S.user) {
    const { data } = await S.sb.from('snippets')
      .select('*')
      .eq('user_id', S.user.id)
      .order('created_at', { ascending: false });
    S.snippets = data || [];
  } else {
    S.snippets = JSON.parse(ls('snippets') || '[]');
  }
}

function p13_renderSnippets() {
  const list = document.getElementById('snip-list');
  if (!S.snippets.length) {
    list.innerHTML = '<p style="padding:10px;font-size:12px;color:var(--muted);">Nenhum snippet salvo.</p>';
    return;
  }
  list.innerHTML = S.snippets.map(s => `
    <div class="snip-item" onclick="p13_loadSnippet('${s.id}')">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.title)}</span>
      <button class="sn-del" onclick="event.stopPropagation();p13_deleteSnippet('${s.id}')">✕</button>
    </div>
  `).join('');
}

window.p13_loadSnippet = (id) => {
  const s = S.snippets.find(x => String(x.id) === String(id));
  if (!s) return;
  S.pg.html = s.html || '';
  S.pg.css  = s.css  || '';
  S.pg.js   = s.js   || '';
  document.getElementById('pg-title').value  = s.title || '';
  document.getElementById('pg-editor').value = S.pg[S.pg.tab];
  runPg();
  toggleSnippets();
};

window.p13_deleteSnippet = async (id) => {
  if (!confirm('Deletar este snippet?')) return;
  if (S.sb && S.user) {
    await S.sb.from('snippets').delete().eq('id', id);
  } else {
    const local = JSON.parse(ls('snippets') || '[]').filter(s => String(s.id) !== String(id));
    lsS('snippets', JSON.stringify(local));
  }
  await p13_loadSnippets();
  p13_renderSnippets();
  toast('Snippet deletado');
};

window.toggleSnippets = async () => {
  const d = document.getElementById('snip-drawer');
  d.classList.toggle('hidden');
  if (!d.classList.contains('hidden')) {
    await p13_loadSnippets();
    p13_renderSnippets();
  }
};


// ════════════════════════════════════════════════════════════════════
//  PARTE 14 — CHAT: ENVIAR E EXIBIR MENSAGENS
// ════════════════════════════════════════════════════════════════════
function p14_updateChatAIInfo() {
  const key  = getActiveKey();
  const prov = key ? detectProvider(key) : null;
  document.getElementById('chat-ai-info').textContent = prov
    ? `${prov.name} · ${prov.model} · Ctrl+Enter envia`
    : 'IA não configurada — vá em ⚙️ Config';

  // Atualizar badge no topbar e status bar
  if (prov) {
    document.getElementById('ai-badge').textContent = prov.name;
    document.getElementById('ai-lbl').textContent   = prov.name;
    document.getElementById('ai-dot').style.background = 'var(--green)';
  }
}

window.sendChatMsg = async () => {
  if (S.chatBusy) return;

  const input = document.getElementById('chat-prompt');
  const text  = input.value.trim();
  if (!text) return;

  const key = getActiveKey();
  if (!key) { toast('Configure IA em ⚙️ Config', 'err'); return; }

  input.value = '';

  // Adicionar mensagem do usuário
  S.chatMsgs.push({ role: 'user', content: text });
  p14_addChatMsg('user', text);
  p14_updateMemBadge();

  // Preparar estado de carregamento
  S.chatBusy = true;
  document.getElementById('chat-send').disabled    = true;
  document.getElementById('chat-send').textContent = '…';

  const thinking = p14_addChatMsg('assistant', '');
  thinking.querySelector('.cm').innerHTML = '<div class="dot-anim"><span></span><span></span><span></span></div>';

  try {
    // Contexto: últimas N mensagens conforme controle de contexto
    const ctx    = parseInt(document.getElementById('ctx-sel').value);
    const useMem = document.getElementById('use-mem').checked;
    const msgs   = useMem
      ? S.chatMsgs.slice(-Math.max(4, Math.floor(ctx / 200)))
      : [{ role: 'user', content: text }];

    const reply = await callAI(msgs, Math.min(ctx, 8192));

    thinking.querySelector('.cm').innerHTML = md(reply);
    S.chatMsgs.push({ role: 'assistant', content: reply });

    // Salvar no Supabase se conectado
    if (S.sb && S.chatId) {
      await S.sb.from('messages').insert([
        { chat_id: S.chatId, role: 'user',      content: text  },
        { chat_id: S.chatId, role: 'assistant', content: reply },
      ]);
    }

    // TTS se ativo
    if (document.getElementById('use-tts').checked) p16_speakText(reply);

  } catch(e) {
    thinking.querySelector('.cm').innerHTML = `<span style="color:var(--red)">Erro: ${esc(e.message)}</span>`;
  }

  S.chatBusy = false;
  document.getElementById('chat-send').disabled    = false;
  document.getElementById('chat-send').textContent = '▶';
  p14_updateMemBadge();
};

function p14_addChatMsg(role, content) {
  const wrap  = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = 'cm ' + role;
  inner.innerHTML = role === 'user'
    ? `<div style="font-size:11px;color:var(--blue);margin-bottom:3px;">👤 Você</div><div style="white-space:pre-wrap;">${esc(content)}</div>`
    : `<div style="font-size:11px;color:var(--green);margin-bottom:3px;">🤖 IA</div>${content ? md(content) : ''}`;
  wrap.appendChild(inner);
  document.getElementById('chat-msgs').appendChild(wrap);
  document.getElementById('chat-msgs').scrollTop = 99999;
  return wrap;
}

function p14_updateMemBadge() {
  document.getElementById('mem-lbl').textContent = S.chatMsgs.length + ' msgs';
}

window.newChatConv = async () => {
  S.chatMsgs = [];
  S.chatId   = null;
  document.getElementById('chat-msgs').innerHTML = '';
  p14_updateMemBadge();

  // Criar nova conversa no Supabase
  if (S.sb && S.user) {
    const { data } = await S.sb.from('chats')
      .insert({ user_id: S.user.id, title: 'Nova conversa' })
      .select().single();
    S.chatId = data?.id;
    await p15_loadConvs();
  }
};

window.clearChatMsgs = () => {
  S.chatMsgs = [];
  document.getElementById('chat-msgs').innerHTML = '';
  p14_updateMemBadge();
};

window.exportChat = () => {
  const txt = S.chatMsgs.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  a.download = 'chat-' + Date.now() + '.txt';
  a.click();
};


// ════════════════════════════════════════════════════════════════════
//  PARTE 15 — CHAT: HISTÓRICO DE CONVERSAS (Supabase)
// ════════════════════════════════════════════════════════════════════
async function p15_loadConvs() {
  if (!S.sb || !S.user) return;

  const { data } = await S.sb.from('chats')
    .select('*')
    .eq('user_id', S.user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  S.convs = data || [];
  p15_renderConvs();
}

function p15_renderConvs() {
  document.getElementById('conv-list').innerHTML = S.convs.map(c => `
    <div class="conv-item ${c.id === S.chatId ? 'active' : ''}" onclick="p15_loadConv('${c.id}')">
      💬 ${esc(c.title || 'Conversa')}
      <div style="font-size:10px;color:var(--muted);">${new Date(c.created_at).toLocaleDateString('pt-BR')}</div>
    </div>
  `).join('');
}

window.p15_loadConv = async (id) => {
  S.chatId   = id;
  S.chatMsgs = [];
  document.getElementById('chat-msgs').innerHTML = '';

  if (S.sb) {
    const { data } = await S.sb.from('messages')
      .select('*')
      .eq('chat_id', id)
      .order('created_at');

    for (const m of (data || [])) {
      S.chatMsgs.push({ role: m.role, content: m.content });
      p14_addChatMsg(m.role, m.content);
    }
  }

  p14_updateMemBadge();
  p15_renderConvs(); // atualizar item ativo na lista
};

window.toggleChatSidebar = () => {
  document.getElementById('chat-sidebar').classList.toggle('hidden');
};


// ════════════════════════════════════════════════════════════════════
//  PARTE 16 — TTS (voz, velocidade, parar)
// ════════════════════════════════════════════════════════════════════
let ttsUtter = null;

window.toggleTTSBar = () => {
  const show = document.getElementById('use-tts').checked;
  document.getElementById('tts-bar').style.display = show ? 'flex' : 'none';
};

function p16_speakText(text) {
  if (!window.speechSynthesis) return;

  // Parar fala anterior
  p16_stopTTS();

  // Limpar markdown e limitar tamanho
  const clean = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_`#>]/g, '')
    .trim()
    .slice(0, 3000);

  ttsUtter = new SpeechSynthesisUtterance(clean);
  ttsUtter.lang = 'pt-BR';
  ttsUtter.rate = parseFloat(document.getElementById('tts-speed').value);

  window.speechSynthesis.speak(ttsUtter);
}

window.stopTTS = p16_stopTTS;
function p16_stopTTS() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}


// ════════════════════════════════════════════════════════════════════
//  PARTE 17 — CONFIGURAÇÕES (chaves IA, Supabase, GitHub)
// ════════════════════════════════════════════════════════════════════
function p17_loadConfig() {
  // Preencher campos com valores salvos
  const sbUrl = ls('sb_url') || '';
  const ghRepo = ls('gh_repo') || '';
  if (sbUrl) document.getElementById('cfg-sb-url').value = sbUrl;
  document.getElementById('cfg-gh-repo').value = ghRepo;

  p17_renderKeySlots();
}

function p17_renderKeySlots() {
  const keys = JSON.parse(ls('ai_keys') || '[]');
  const container = document.getElementById('key-slots');

  if (!keys.length) {
    container.innerHTML = '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Nenhuma chave. Adicione abaixo.</p>';
    p14_updateChatAIInfo();
    return;
  }

  container.innerHTML = keys.map((k, i) => `
    <div class="key-slot">
      <input type="checkbox" ${k.active?'checked':''} onchange="p17_toggleKey(${i})" style="accent-color:var(--blue);flex-shrink:0;">
      <span style="font-size:11px;min-width:70px;color:${k.active?'var(--green)':'var(--muted)'};">${detectProvName(k.key)}</span>
      <input type="password" value="${k.key}" onchange="p17_updateKey(${i}, this.value)" placeholder="chave...">
      <button onclick="p17_removeKey(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;flex-shrink:0;font-size:14px;">✕</button>
    </div>
  `).join('');

  p14_updateChatAIInfo();
}

window.addKey = () => {
  const val = document.getElementById('new-key-input').value.trim();
  if (!val) { toast('Cole a chave no campo acima.', 'err'); return; }

  const keys = JSON.parse(ls('ai_keys') || '[]');
  keys.push({ key: val, active: !keys.length }); // primeira chave fica ativa
  lsS('ai_keys', JSON.stringify(keys));

  document.getElementById('new-key-input').value = '';
  p17_renderKeySlots();
  toast('✅ Chave adicionada!');
};

window.p17_toggleKey = (i) => {
  const keys = JSON.parse(ls('ai_keys') || '[]');
  keys.forEach((k, j) => k.active = j === i);
  lsS('ai_keys', JSON.stringify(keys));
  p17_renderKeySlots();
};

window.p17_updateKey = (i, val) => {
  const keys = JSON.parse(ls('ai_keys') || '[]');
  if (keys[i]) keys[i].key = val.trim();
  lsS('ai_keys', JSON.stringify(keys));
};

window.p17_removeKey = (i) => {
  const keys = JSON.parse(ls('ai_keys') || '[]');
  keys.splice(i, 1);
  lsS('ai_keys', JSON.stringify(keys));
  p17_renderKeySlots();
};

window.saveSB = () => {
  const url = document.getElementById('cfg-sb-url').value.trim();
  const key = document.getElementById('cfg-sb-key').value.trim();
  if (!url || !key) { toast('Preencha URL e Key!', 'err'); return; }
  lsS('sb_url', url);
  lsS('sb_key', key);
  document.getElementById('cfg-sb-key').value = '';
  toast('✅ Supabase salvo! Recarregando em 1 segundo...');
  setTimeout(() => location.reload(), 1000);
};

window.saveGH = () => {
  const token = document.getElementById('cfg-gh-token').value.trim();
  const repo  = document.getElementById('cfg-gh-repo').value.trim();
  if (token) lsS('gh_token', token);
  if (repo)  lsS('gh_repo',  repo);
  document.getElementById('cfg-gh-token').value = '';
  toast('✅ GitHub salvo!');
};

window.copySql = () => {
  navigator.clipboard.writeText(document.getElementById('sql-box').value)
    .then(() => toast('✅ SQL copiado! Cole no Supabase → SQL Editor.'));
};

// ════════════════════════════════════════════════════════════════════
//  FIM DO app.js
// ════════════════════════════════════════════════════════════════════
