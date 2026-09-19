// ╔══════════════════════════════════════════════════╗
// ║  chat.js — Mensagens, memória, TTS,             ║
// ║            histórico de conversas (Supabase)    ║
// ╚══════════════════════════════════════════════════╝

const CHAT = {
  msgs:   [],    // mensagens da conversa atual
  convId: null,  // ID da conversa no Supabase
  convs:  [],    // lista de conversas
  busy:   false, // IA ocupada
  tts:    null,  // utterance TTS atual
};

// ── Info da IA ───────────────────────────────────────
window.updateChatInfo = () => {
  const key  = getActiveKey();
  const prov = key ? detectProvider(key) : null;
  const el   = document.getElementById('chat-ai-info');
  if (el) el.textContent = prov
    ? `${prov.name} · ${prov.model} · Ctrl+Enter envia`
    : 'IA não configurada — vá em ⚙️';
  const badge = document.getElementById('ai-badge');
  if (badge && prov) badge.textContent = prov.name;
};

// ── Enviar mensagem ──────────────────────────────────
window.sendChat = async () => {
  if (CHAT.busy) return;
  const inp  = document.getElementById('chat-input');
  const text = inp.value.trim(); if (!text) return;
  const key  = getActiveKey();
  if (!key) { toast('Configure IA em ⚙️','err'); return; }
  inp.value = '';

  // Adicionar mensagem do usuário
  CHAT.msgs.push({role:'user',content:text});
  addChatBubble('user', text);
  updateMemBadge();

  // Preparar loading
  CHAT.busy = true;
  document.getElementById('chat-send').disabled    = true;
  document.getElementById('chat-send').textContent = '…';

  const think = addChatBubble('assistant','<span class="dot-anim"><span></span><span></span><span></span></span>');

  try {
    // Contexto com controle de memória
    const ctx    = parseInt(document.getElementById('ctx-sel').value);
    const useMem = document.getElementById('use-mem').checked;
    const msgs   = useMem
      ? CHAT.msgs.slice(-Math.max(4, Math.floor(ctx/200)))
      : [{role:'user',content:text}];

    const reply = await callAI(msgs, Math.min(ctx, 8192));
    think.querySelector('.bubble-body').innerHTML = md(reply);
    CHAT.msgs.push({role:'assistant',content:reply});

    // Salvar no Supabase
    if (APP.sb && CHAT.convId) {
      await APP.sb.from('messages').insert([
        {chat_id:CHAT.convId, role:'user',      content:text},
        {chat_id:CHAT.convId, role:'assistant', content:reply},
      ]);
    }

    // TTS
    if (document.getElementById('use-tts').checked) speakText(reply);

  } catch(e) {
    think.querySelector('.bubble-body').innerHTML = `<span style="color:#f85149">Erro: ${esc(e.message)}</span>`;
  }

  CHAT.busy = false;
  document.getElementById('chat-send').disabled    = false;
  document.getElementById('chat-send').textContent = '▶';
  updateMemBadge();
};

function addChatBubble(role, content) {
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap ' + role;
  wrap.innerHTML = `
    <div class="bubble-label">${role==='user'?'👤 Você':'🤖 IA'}</div>
    <div class="bubble-body">${role==='user'?`<div style="white-space:pre-wrap;">${esc(content)}</div>`:content}</div>`;
  document.getElementById('chat-msgs').appendChild(wrap);
  document.getElementById('chat-msgs').scrollTop = 99999;
  return wrap;
}

function updateMemBadge() {
  const el = document.getElementById('mem-badge');
  if (el) el.textContent = CHAT.msgs.length + ' msgs';
}

// ── Gerenciar conversas ──────────────────────────────
window.newConv = async () => {
  CHAT.msgs=[]; CHAT.convId=null;
  document.getElementById('chat-msgs').innerHTML='';
  updateMemBadge();
  if (APP.sb && APP.user) {
    const {data}=await APP.sb.from('chats').insert({user_id:APP.user.id,title:'Nova conversa'}).select().single();
    CHAT.convId=data?.id;
    await loadConvs();
  }
};

window.clearChat = () => {
  CHAT.msgs=[]; CHAT.convId=null;
  document.getElementById('chat-msgs').innerHTML='';
  updateMemBadge();
};

window.exportChat = () => {
  const txt=CHAT.msgs.map(m=>`[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'}));
  a.download=`chat-${Date.now()}.txt`; a.click();
};

// ── Histórico de conversas (Supabase) ────────────────
window.loadConvs = async () => {
  if (!APP.sb||!APP.user) return;
  const {data}=await APP.sb.from('chats').select('*').eq('user_id',APP.user.id).order('created_at',{ascending:false}).limit(30);
  CHAT.convs=data||[];
  renderConvs();
};

function renderConvs() {
  const el=document.getElementById('conv-list');
  el.innerHTML=CHAT.convs.map(c=>`
    <div class="conv-item ${c.id===CHAT.convId?'active':''}" onclick="loadConv('${c.id}')">
      💬 ${esc(c.title||'Conversa')}
      <div class="conv-date">${new Date(c.created_at).toLocaleDateString('pt-BR')}</div>
    </div>`).join('');
}

window.loadConv = async (id) => {
  CHAT.convId=id; CHAT.msgs=[];
  document.getElementById('chat-msgs').innerHTML='';
  if (APP.sb) {
    const {data}=await APP.sb.from('messages').select('*').eq('chat_id',id).order('created_at');
    for (const m of (data||[])) { CHAT.msgs.push({role:m.role,content:m.content}); addChatBubble(m.role,m.content); }
  }
  updateMemBadge(); renderConvs();
};

window.toggleConvSidebar = () => document.getElementById('conv-sidebar').classList.toggle('hidden');

// ── TTS ──────────────────────────────────────────────
window.toggleTTSBar = () => {
  document.getElementById('tts-bar').style.display = document.getElementById('use-tts').checked ? 'flex' : 'none';
};

function speakText(text) {
  if (!window.speechSynthesis) return;
  stopTTS();
  const clean=text.replace(/```[\s\S]*?```/g,'').replace(/[*_`#>]/g,'').trim().slice(0,3000);
  CHAT.tts = new SpeechSynthesisUtterance(clean);
  CHAT.tts.lang='pt-BR';
  CHAT.tts.rate=parseFloat(document.getElementById('tts-speed').value);
  window.speechSynthesis.speak(CHAT.tts);
}

window.stopTTS = () => { window.speechSynthesis?.cancel(); };
