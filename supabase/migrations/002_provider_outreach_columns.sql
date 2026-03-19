-- Migration: Add outreach tracking columns to providers table
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/pocoystpkrdmobplazhd/sql/new

ALTER TABLE providers ADD COLUMN IF NOT EXISTS outreach_status text DEFAULT 'pending';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS outreach_date timestamptz;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS outreach_count integer DEFAULT 0;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_outreach_date timestamptz;

-- Add check constraint for valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'providers_outreach_status_check'
  ) THEN
    ALTER TABLE providers ADD CONSTRAINT providers_outreach_status_check
      CHECK (outreach_status IN ('pending', 'contacted', 'replied', 'declined', 'active'));
  END IF;
END $$;

-- Create index for outreach queries
CREATE INDEX IF NOT EXISTS idx_providers_outreach_status ON providers (outreach_status);
CREATE INDEX IF NOT EXISTS idx_providers_outreach_pending ON providers (outreach_status, phone) WHERE phone IS NOT NULL AND outreach_status = 'pending';

-- Verify: count viable providers
SELECT count(*) AS viable_providers
FROM providers
WHERE phone IS NOT NULL
  AND outreach_status = 'pending';
