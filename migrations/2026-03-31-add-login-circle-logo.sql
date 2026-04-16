-- Migration: add login_circle_logo fields to system_config and public_config
-- Run this in Supabase SQL editor or via psql connected to your project.

BEGIN;

-- Add login circle URL and path to system_config
ALTER TABLE IF EXISTS system_config
  ADD COLUMN IF NOT EXISTS login_circle_logo_url text;

ALTER TABLE IF EXISTS system_config
  ADD COLUMN IF NOT EXISTS login_circle_logo_path text;

-- public_config may be a VIEW in some deployments. Only alter it if it's a real table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'public_config' AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE public_config
      ADD COLUMN IF NOT EXISTS login_circle_logo_url text;

    ALTER TABLE public_config
      ADD COLUMN IF NOT EXISTS login_circle_logo_path text;
  ELSE
    RAISE NOTICE 'public_config is not a base table; skipping ALTER on public_config (it may be a view)';
  END IF;
END$$;

COMMIT;
