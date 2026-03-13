-- 008: Add missing columns to pi_user_settings
-- These columns are referenced in app/api/settings/route.ts but were not created in earlier migrations

ALTER TABLE pi_user_settings
  ADD COLUMN IF NOT EXISTS encrypted_vercel_token TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_supabase_url TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_supabase_key TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_supabase_access_token TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_stripe_secret_key TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_stripe_publishable_key TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_stripe_webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS global_env_vars TEXT;
