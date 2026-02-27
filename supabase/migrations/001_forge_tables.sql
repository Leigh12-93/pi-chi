-- Forge Project Persistence Tables
-- Safe to run alongside existing tank_feedings, auth_otps, auth_sessions, sms_queue tables
-- All tables prefixed with forge_ to avoid collisions

-- Projects table
CREATE TABLE IF NOT EXISTS forge_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  github_username TEXT NOT NULL,
  description TEXT DEFAULT '',
  framework TEXT DEFAULT 'nextjs',
  github_repo_url TEXT,
  vercel_url TEXT,
  last_deploy_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forge_projects_github_username ON forge_projects(github_username);
CREATE INDEX IF NOT EXISTS idx_forge_projects_updated ON forge_projects(updated_at DESC);

-- Project files table (stores all virtual files)
CREATE TABLE IF NOT EXISTS forge_project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES forge_projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, path)
);

CREATE INDEX IF NOT EXISTS idx_forge_project_files_project ON forge_project_files(project_id);

-- Chat history table (stores conversation messages per project)
CREATE TABLE IF NOT EXISTS forge_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES forge_projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_invocations JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forge_chat_messages_project ON forge_chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_forge_chat_messages_created ON forge_chat_messages(created_at);

-- Deployments table (tracks deployment history)
CREATE TABLE IF NOT EXISTS forge_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES forge_projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('vercel', 'github')),
  url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'ready', 'error')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forge_deployments_project ON forge_deployments(project_id);

-- Disable RLS (service role access only, same pattern as tank_feedings)
ALTER TABLE forge_projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE forge_project_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE forge_chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE forge_deployments DISABLE ROW LEVEL SECURITY;

-- Grant access
GRANT ALL ON forge_projects TO service_role;
GRANT ALL ON forge_project_files TO service_role;
GRANT ALL ON forge_chat_messages TO service_role;
GRANT ALL ON forge_deployments TO service_role;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION forge_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forge_projects_updated_at ON forge_projects;
CREATE TRIGGER forge_projects_updated_at
  BEFORE UPDATE ON forge_projects
  FOR EACH ROW EXECUTE FUNCTION forge_update_updated_at();

DROP TRIGGER IF EXISTS forge_project_files_updated_at ON forge_project_files;
CREATE TRIGGER forge_project_files_updated_at
  BEFORE UPDATE ON forge_project_files
  FOR EACH ROW EXECUTE FUNCTION forge_update_updated_at();
