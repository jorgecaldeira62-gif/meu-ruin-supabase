// ╔══════════════════════════════════════════════════╗
// ║  main.js — Ponto de entrada, inicialização       ║
// ╚══════════════════════════════════════════════════╝

window.SQL_SCHEMA = `-- COLE NO SUPABASE → SQL EDITOR → RUN
CREATE TABLE IF NOT EXISTS projects (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, name text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS files (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid REFERENCES projects(id) ON DELETE CASCADE, path text NOT NULL, content text DEFAULT '', updated_at timestamptz DEFAULT now(), UNIQUE(project_id, path));
CREATE TABLE IF NOT EXISTS chats (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, title text DEFAULT 'Nova conversa', created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS messages (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, chat_id uuid REFERENCES chats(id) ON DELETE CASCADE, role text NOT NULL, content text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS snippets (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, title text DEFAULT 'Sem título', html text DEFAULT '', css text DEFAULT '', js text DEFAULT '', created_at timestamptz DEFAULT now());
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON projects FOR ALL USING (auth.uid()=user_id);
CREATE POLICY "own" ON files FOR ALL USING (project_id IN (SELECT id FROM projects WHERE user_id=auth.uid()));
CREATE POLICY "own" ON chats FOR ALL USING (auth.uid()=user_id);
CREATE POLICY "own" ON messages FOR ALL USING (chat_id IN (SELECT id FROM chats WHERE user_id=auth.uid()));
CREATE POLICY "own" ON snippets FOR ALL USING (auth.uid()=user_id);`;

window.addEventListener('DOMContentLoaded', async () => {
  await initSupabase();
  initEditor();
  initPlayground();
  initSettings();
  updateChatInfo();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

  // Atualizar badges
  if (APP.user) {
    const el = document.getElementById('user-info');
    if (el) el.textContent = '👤 ' + APP.user.email.split('@')[0];
  }
});
