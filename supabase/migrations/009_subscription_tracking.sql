-- 009: Add subscription tracking columns to pi_user_settings
-- Used by Stripe webhook to track user subscription status

ALTER TABLE pi_user_settings
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_settings_stripe_customer
  ON pi_user_settings(stripe_customer_id);
