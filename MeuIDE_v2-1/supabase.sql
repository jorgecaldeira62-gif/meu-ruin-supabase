-- ════════════════════════════════════════════════════
--  RODE ISSO NO SUPABASE: SQL Editor → New Query
-- ════════════════════════════════════════════════════

-- 1. Projetos
CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Arquivos dos projetos
CREATE TABLE IF NOT EXISTS files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  content text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, path)
);

-- 3. Conversas do chat
CREATE TABLE IF NOT EXISTS chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text DEFAULT 'Nova conversa',
  created_at timestamptz DEFAULT now()
);

-- 4. Mensagens do chat
CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid REFERENCES chats(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 5. Snippets do playground
CREATE TABLE IF NOT EXISTS snippets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text DEFAULT 'Sem título',
  html text DEFAULT '',
  css text DEFAULT '',
  js text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS (segurança por usuário)
ALTER TABLE projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippets  ENABLE ROW LEVEL SECURITY;

-- Políticas: cada usuário vê só os seus dados
CREATE POLICY "own_projects"  ON projects  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_files"     ON files     FOR ALL USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "own_chats"     ON chats     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_messages"  ON messages  FOR ALL USING (chat_id IN (SELECT id FROM chats WHERE user_id = auth.uid()));
CREATE POLICY "own_snippets"  ON snippets  FOR ALL USING (auth.uid() = user_id);

-- ✅ Pronto! Agora copie a URL e a Anon Key em Settings → API
