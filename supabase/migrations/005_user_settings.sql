-- forge_user_settings: BYOK API key storage + user preferences
-- API keys are AES-GCM encrypted, decrypted server-side only

CREATE TABLE IF NOT EXISTS forge_user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_username TEXT NOT NULL UNIQUE,
  encrypted_api_key TEXT,              -- AES-GCM encrypted Anthropic key (v1:iv:ciphertext)
  api_key_validated_at TIMESTAMPTZ,
  preferred_model TEXT DEFAULT 'claude-sonnet-4-20250514',
  preferences JSONB DEFAULT '{}',      -- { editorFontSize, theme, terminalFont, ... }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_forge_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_forge_user_settings_updated_at
  BEFORE UPDATE ON forge_user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_forge_user_settings_updated_at();

-- forge_project_snapshots: Version history
CREATE TABLE IF NOT EXISTS forge_project_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES forge_projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  files JSONB NOT NULL,                -- { "path": "content", ... }
  file_count INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_project
  ON forge_project_snapshots(project_id, created_at DESC);

-- Add share_token to forge_projects
ALTER TABLE forge_projects ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
