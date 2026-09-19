// ══════════════════════════════════════════════
//  CONFIG — edite depois de configurar o Supabase
// ══════════════════════════════════════════════
const CFG = {
  // Cole aqui depois de criar conta no supabase.com
  supabaseUrl:  localStorage.getItem('sb_url')  || '',
  supabaseKey:  localStorage.getItem('sb_key')  || '',
  // Chaves de IA (salvas automaticamente)
  aiKeys: JSON.parse(localStorage.getItem('ai_keys') || '[]'),
  // GitHub
  githubToken: localStorage.getItem('gh_token') || '',
  githubRepo:  localStorage.getItem('gh_repo')  || '',
};

// Detectar provedor pela chave
function detectProvider(key) {
  if (!key) return null;
  if (key.startsWith('sk-ant-')) return { name:'Claude',   base:'https://api.anthropic.com/v1',           model:'claude-haiku-4-20250514' };
  if (key.startsWith('AIza'))    return { name:'Gemini',   base:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-2.0-flash' };
  if (key.startsWith('gsk_'))    return { name:'Groq',     base:'https://api.groq.com/openai/v1',         model:'llama-3.3-70b-versatile' };
  if (key.startsWith('sk-or-'))  return { name:'OpenRouter',base:'https://openrouter.ai/api/v1',         model:'anthropic/claude-haiku' };
  if (key.startsWith('xai-'))    return { name:'Grok',     base:'https://api.x.ai/v1',                   model:'grok-3-mini' };
  if (key.startsWith('sk-'))     return { name:'OpenAI',   base:'https://api.openai.com/v1',             model:'gpt-4o-mini' };
  return null;
}

// Chamar IA
async function callAI(messages, system, maxTokens = 4096) {
  const keys = JSON.parse(localStorage.getItem('ai_keys') || '[]');
  const activeKey = keys.find(k => k.active)?.key || keys[0]?.key;
  if (!activeKey) throw new Error('Nenhuma chave de IA configurada. Clique em ⚙️ para configurar.');
  const prov = detectProvider(activeKey);
  if (!prov) throw new Error('Chave inválida: ' + activeKey.slice(0,8) + '...');

  if (prov.name === 'Claude') {
    // Anthropic não suporta CORS no browser — usar proxy ou Groq/Gemini
    throw new Error('Claude não funciona direto no browser. Use Gemini (AIza...) ou Groq (gsk_...) gratuitamente.');
  }

  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const r = await fetch(`${prov.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeKey}` },
    body: JSON.stringify({ model: prov.model, messages: msgs, max_tokens: maxTokens })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.choices?.[0]?.message?.content || '';
}

// Supabase client
let _sb = null;
async function getSB() {
  if (_sb) return _sb;
  const url = localStorage.getItem('sb_url');
  const key = localStorage.getItem('sb_key');
  if (!url || !key) return null;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  _sb = createClient(url, key);
  return _sb;
}

// Auth helpers
async function getUser() {
  const sb = await getSB();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data?.user || null;
}

async function requireAuth() {
  const user = await getUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  return user;
}

// Toast
function toast(msg, type = 'ok') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.style.cssText = `position:fixed;bottom:20px;right:20px;padding:8px 16px;border-radius:6px;font-size:13px;z-index:9999;color:#fff;background:${type==='err'?'#da3633':'#238636'};`;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

// Shared CSS base
const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;min-height:100dvh;}
a{color:#58a6ff;text-decoration:none;}
input,textarea,select{background:#161b22;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:6px 10px;font-family:inherit;font-size:13px;}
input:focus,textarea:focus,select:focus{outline:none;border-color:#58a6ff;}
.btn{padding:7px 14px;border-radius:6px;font-size:13px;font-weight:600;border:none;cursor:pointer;font-family:inherit;}
.btn-blue{background:#1f6feb;color:#fff;} .btn-blue:hover{background:#388bfd;}
.btn-green{background:#238636;color:#fff;} .btn-green:hover{background:#2ea043;}
.btn-gray{background:#21262d;color:#e6edf3;border:1px solid #30363d;} .btn-gray:hover{background:#30363d;}
.btn-red{background:#da3633;color:#fff;}
::-webkit-scrollbar{width:5px;height:5px;} ::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px;}
#toast{display:none;}
`;
