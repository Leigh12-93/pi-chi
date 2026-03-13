-- User Preferences Memory
-- Stores learned user preferences for personalized AI outputs

CREATE TABLE IF NOT EXISTS pi_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_username TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(github_username, preference_key)
);

CREATE INDEX IF NOT EXISTS idx_pi_prefs_user ON pi_user_preferences(github_username);

-- Enable RLS
ALTER TABLE pi_user_preferences ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access" ON pi_user_preferences
  FOR ALL USING (true) WITH CHECK (true);
