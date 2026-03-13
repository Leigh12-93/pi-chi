-- Pi-Chi Project Persistence Tables
-- Safe to run alongside existing tank_feedings, auth_otps, auth_sessions, sms_queue tables
-- All tables prefixed with pi_ to avoid collisions

-- Projects table
CREATE TABLE IF NOT EXISTS pi_projects (
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

CREATE INDEX IF NOT EXISTS idx_pi_projects_github_username ON pi_projects(github_username);
CREATE INDEX IF NOT EXISTS idx_pi_projects_updated ON pi_projects(updated_at DESC);

-- Project files table (stores all virtual files)
CREATE TABLE IF NOT EXISTS pi_project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pi_projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, path)
);

CREATE INDEX IF NOT EXISTS idx_pi_project_files_project ON pi_project_files(project_id);

-- Chat history table (stores conversation messages per project)
CREATE TABLE IF NOT EXISTS pi_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pi_projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_invocations JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_chat_messages_project ON pi_chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_pi_chat_messages_created ON pi_chat_messages(created_at);

-- Deployments table (tracks deployment history)
CREATE TABLE IF NOT EXISTS pi_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pi_projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('vercel', 'github')),
  url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'ready', 'error')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_deployments_project ON pi_deployments(project_id);

-- Disable RLS (service role access only, same pattern as tank_feedings)
ALTER TABLE pi_projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE pi_project_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE pi_chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE pi_deployments DISABLE ROW LEVEL SECURITY;

-- Grant access
GRANT ALL ON pi_projects TO service_role;
GRANT ALL ON pi_project_files TO service_role;
GRANT ALL ON pi_chat_messages TO service_role;
GRANT ALL ON pi_deployments TO service_role;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION pi_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pi_projects_updated_at ON pi_projects;
CREATE TRIGGER pi_projects_updated_at
  BEFORE UPDATE ON pi_projects
  FOR EACH ROW EXECUTE FUNCTION pi_update_updated_at();

DROP TRIGGER IF EXISTS pi_project_files_updated_at ON pi_project_files;
CREATE TRIGGER pi_project_files_updated_at
  BEFORE UPDATE ON pi_project_files
  FOR EACH ROW EXECUTE FUNCTION pi_update_updated_at();
