-- Google Cloud integration columns for pi_user_settings
-- OAuth credentials (user's own Google Cloud project)
-- API key, service account JSON, and connected account tokens

ALTER TABLE pi_user_settings
  ADD COLUMN IF NOT EXISTS encrypted_google_client_id TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_google_client_secret TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_google_api_key TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_google_service_account TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_google_access_token TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_google_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_connected_email TEXT,
  ADD COLUMN IF NOT EXISTS google_connected_scopes TEXT[];
