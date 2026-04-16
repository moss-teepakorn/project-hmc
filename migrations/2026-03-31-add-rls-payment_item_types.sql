-- Migration: Add RLS policies for payment_item_types
-- Date: 2026-03-31

BEGIN;

-- Ensure row level security is enabled
ALTER TABLE IF EXISTS public.payment_item_types ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'allow_authenticated_select' AND polrelid = 'public.payment_item_types'::regclass
  ) THEN
    CREATE POLICY "allow_authenticated_select" ON public.payment_item_types
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

-- Allow only admin users (profiles.is_admin = true) to INSERT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'admins_can_insert' AND polrelid = 'public.payment_item_types'::regclass
  ) THEN
    -- For INSERT policies PostgreSQL only allows a WITH CHECK expression; USING is ignored for INSERT.
    CREATE POLICY "admins_can_insert" ON public.payment_item_types
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
        )
      );
  END IF;
END$$;

-- Allow only admin users to UPDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'admins_can_update' AND polrelid = 'public.payment_item_types'::regclass
  ) THEN
    CREATE POLICY "admins_can_update" ON public.payment_item_types
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
        )
      );
  END IF;
END$$;

-- Allow only admin users to DELETE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'admins_can_delete' AND polrelid = 'public.payment_item_types'::regclass
  ) THEN
    CREATE POLICY "admins_can_delete" ON public.payment_item_types
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
        )
      );
  END IF;
END$$;

COMMIT;

-- Notes:
-- - This migration enables RLS and creates policies so that:
--   * authenticated users can SELECT
--   * only admins (profiles.is_admin = true) can INSERT/UPDATE/DELETE
-- - Review the `profiles` table and `is_admin` column before applying.
-- - If you prefer to allow authenticated users to INSERT, adjust the INSERT policy accordingly.
