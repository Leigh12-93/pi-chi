-- Survey responses table for venture validation
CREATE TABLE IF NOT EXISTS pi_survey_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id TEXT NOT NULL,
  answers JSONB NOT NULL,
  trade TEXT,
  location TEXT,
  email TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by survey
CREATE INDEX IF NOT EXISTS idx_pi_survey_responses_survey_id ON pi_survey_responses(survey_id);

-- RLS: Allow insert from service role (we use service key server-side)
ALTER TABLE pi_survey_responses ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_all" ON pi_survey_responses
  FOR ALL USING (true) WITH CHECK (true);
