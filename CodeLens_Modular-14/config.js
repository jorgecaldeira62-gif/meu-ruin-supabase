// ╔══════════════════════════════════════════════════╗
// ║  config.js — Estado global, Supabase e IA       ║
// ╚══════════════════════════════════════════════════╝

// ── Estado global ────────────────────────────────────
window.APP = {
  sb:   null,   // cliente Supabase
  user: null,   // usuário logado
};

// ── localStorage helpers ─────────────────────────────
window.ls  = k => { try { return localStorage.getItem(k); } catch { return null; } };
window.lsS = (k,v) => { try { localStorage.setItem(k,v); } catch {} };

// ── Inicializar Supabase ─────────────────────────────
window.initSupabase = async () => {
  const url = ls('sb_url');
  const key = ls('sb_key');
  if (!url || !key) return;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    APP.sb = createClient(url, key);
    const { data } = await APP.sb.auth.getUser();
    APP.user = data?.user || null;
  } catch(e) { console.error('Supabase:', e.message); }
};

// ── Detectar provedor de IA pela chave ───────────────
window.detectProvider = (key) => {
  if (!key) return null;
  if (key.startsWith('AIza'))    return { name:'Gemini',     base:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-2.0-flash' };
  if (key.startsWith('gsk_'))    return { name:'Groq',       base:'https://api.groq.com/openai/v1',                         model:'llama-3.3-70b-versatile' };
  if (key.startsWith('sk-or-'))  return { name:'OpenRouter', base:'https://openrouter.ai/api/v1',                           model:'anthropic/claude-haiku' };
  if (key.startsWith('xai-'))    return { name:'Grok',       base:'https://api.x.ai/v1',                                    model:'grok-3-mini' };
  if (key.startsWith('sk-'))     return { name:'OpenAI',     base:'https://api.openai.com/v1',                              model:'gpt-4o-mini' };
  return null;
};

// ── Pegar chave ativa ────────────────────────────────
window.getActiveKey = () => {
  const slots = JSON.parse(ls('ai_keys') || '[]');
  return slots.find(s => s.active)?.key || slots[0]?.key || null;
};

// ── Chamar IA ────────────────────────────────────────
window.callAI = async (messages, maxTokens = 4096) => {
  const key  = getActiveKey();
  if (!key) throw new Error('Nenhuma chave de IA. Configure em ⚙️');
  const prov = detectProvider(key);
  if (!prov?.base) throw new Error(`${prov?.name || 'Provedor'} não suporta chamadas do browser. Use Gemini ou Groq.`);

  const r = await fetch(`${prov.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` },
    body: JSON.stringify({ model:prov.model, messages, max_tokens:Math.min(maxTokens,32000) }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.choices?.[0]?.message?.content || '';
};

// ── Toast ────────────────────────────────────────────
window.toast = (msg, type = 'ok') => {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.cssText = `position:fixed;bottom:20px;right:20px;padding:8px 16px;border-radius:6px;
    font-size:13px;color:#fff;z-index:9999;display:block;
    background:${type==='err'?'#da3633':'#238636'};`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.style.display='none', 3000);
};

// ── Escapar HTML ─────────────────────────────────────
window.esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Markdown mínimo ──────────────────────────────────
window.md = s => String(s)
  .replace(/```([\s\S]*?)```/g,'<pre><code>$1</code></pre>')
  .replace(/`([^`]+)`/g,'<code style="background:#0a0e14;padding:1px 5px;border-radius:3px;">$1</code>')
  .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
  .replace(/\n/g,'<br>');

// ── Ícone por extensão ───────────────────────────────
window.fileIcon = name => {
  const ext = (name.split('.').pop()||'').toLowerCase();
  return {html:'🌐',css:'🎨',js:'📜',ts:'📘',jsx:'⚛',tsx:'⚛',json:'📋',md:'📝',py:'🐍',txt:'📄',svg:'🖼'}[ext]||'📄';
};

// ── Tab em textarea ──────────────────────────────────
window.handleTab = (e, el) => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const s = el.selectionStart;
  el.value = el.value.substring(0,s)+'  '+el.value.substring(el.selectionEnd);
  el.selectionStart = el.selectionEnd = s+2;
};
