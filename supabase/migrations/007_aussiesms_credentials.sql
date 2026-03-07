-- 007: Add AussieSMS API key storage
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/koghrdiduiuicaysvwci/sql/new

ALTER TABLE forge_user_settings
  ADD COLUMN IF NOT EXISTS encrypted_aussiesms_api_key TEXT;
