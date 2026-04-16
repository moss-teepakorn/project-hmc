-- Migration: Add is_admin boolean to profiles
-- Date: 2026-03-31

BEGIN;

-- Add is_admin column (default false)
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false NOT NULL;

COMMIT;

-- Notes:
-- - This migration ensures `profiles.is_admin` exists for RLS policies.
-- - To grant admin to an account, run:
--   UPDATE public.profiles SET is_admin = true WHERE id = '<user-uuid>';
-- - Apply this migration before the RLS migration that checks `profiles.is_admin`.
