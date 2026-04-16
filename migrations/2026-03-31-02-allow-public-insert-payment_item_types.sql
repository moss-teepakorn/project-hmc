-- Migration: Allow public inserts to payment_item_types (temporary)
-- Date: 2026-03-31
-- WARNING: This policy allows inserts from any role. Use only for short-term testing.

BEGIN;

ALTER TABLE IF EXISTS public.payment_item_types ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'allow_public_insert' AND polrelid = 'public.payment_item_types'::regclass
  ) THEN
    CREATE POLICY "allow_public_insert" ON public.payment_item_types
      FOR INSERT
      WITH CHECK (true);
  END IF;
END$$;

COMMIT;

-- To remove this permissive policy later:
-- DROP POLICY IF EXISTS "allow_public_insert" ON public.payment_item_types;
