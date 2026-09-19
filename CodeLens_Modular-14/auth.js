// ╔══════════════════════════════════════════════════╗
// ║  auth.js — Login, registro, logout, recuperação ║
// ╚══════════════════════════════════════════════════╝

window.doLogin = async () => {
  if (!APP.sb) { toast('Configure Supabase em ⚙️','err'); return; }
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  if (!email||!pass) { showAuthMsg('Preencha email e senha.','err'); return; }
  showAuthMsg('Entrando...','ok');
  const { error } = await APP.sb.auth.signInWithPassword({ email, password:pass });
  if (error) { showAuthMsg('Erro: '+error.message,'err'); return; }
  showAuthMsg('✅ Logado! Recarregando...','ok');
  setTimeout(()=>location.reload(), 800);
};

window.doRegister = async () => {
  if (!APP.sb) { toast('Configure Supabase em ⚙️','err'); return; }
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  if (!email||!pass) { showAuthMsg('Preencha email e senha.','err'); return; }
  const { error } = await APP.sb.auth.signUp({ email, password:pass });
  if (error) { showAuthMsg('Erro: '+error.message,'err'); return; }
  showAuthMsg('✅ Conta criada! Verifique seu email.','ok');
};

window.doReset = async () => {
  if (!APP.sb) { toast('Configure Supabase em ⚙️','err'); return; }
  const email = document.getElementById('auth-email').value.trim();
  if (!email) { showAuthMsg('Digite seu email.','err'); return; }
  await APP.sb.auth.resetPasswordForEmail(email);
  showAuthMsg('✅ Email de recuperação enviado!','ok');
};

window.doLogout = async () => {
  if (APP.sb) await APP.sb.auth.signOut();
  lsS('sb_url',''); lsS('sb_key','');
  location.reload();
};

function showAuthMsg(msg, type) {
  const el = document.getElementById('auth-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type==='err' ? '#f85149' : '#3fb950';
}
