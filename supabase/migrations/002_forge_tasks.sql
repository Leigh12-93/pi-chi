-- Background task tracking for long-running operations
-- (deploy, GitHub create/push, build checks, npm install)

CREATE TABLE IF NOT EXISTS forge_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forge_tasks_project ON forge_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_forge_tasks_status ON forge_tasks(status, created_at);

ALTER TABLE forge_tasks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON forge_tasks TO service_role;

DROP TRIGGER IF EXISTS forge_tasks_updated_at ON forge_tasks;
CREATE TRIGGER forge_tasks_updated_at
  BEFORE UPDATE ON forge_tasks
  FOR EACH ROW EXECUTE FUNCTION forge_update_updated_at();
