-- Background task tracking for long-running operations
-- (deploy, GitHub create/push, build checks, npm install)

CREATE TABLE IF NOT EXISTS pi_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  progress TEXT,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pi_tasks_project ON pi_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_pi_tasks_status ON pi_tasks(status, created_at);

ALTER TABLE pi_tasks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON pi_tasks TO service_role;

DROP TRIGGER IF EXISTS pi_tasks_updated_at ON pi_tasks;
CREATE TRIGGER pi_tasks_updated_at
  BEFORE UPDATE ON pi_tasks
  FOR EACH ROW EXECUTE FUNCTION pi_update_updated_at();
