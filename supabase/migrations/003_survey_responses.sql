-- Survey responses for TradeTrack validation
CREATE TABLE IF NOT EXISTS pi_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answers JSONB NOT NULL,
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_survey_created ON pi_survey_responses(created_at DESC);
