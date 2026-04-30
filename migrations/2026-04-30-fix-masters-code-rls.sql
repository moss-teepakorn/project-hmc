-- Migration: Add RLS policies for masters_code
-- Date: 2026-04-30

BEGIN;

ALTER TABLE IF EXISTS public.masters_code ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'masters_code_authenticated_select' AND polrelid = 'public.masters_code'::regclass
  ) THEN
    CREATE POLICY "masters_code_authenticated_select" ON public.masters_code
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'masters_code_admin_insert' AND polrelid = 'public.masters_code'::regclass
  ) THEN
    CREATE POLICY "masters_code_admin_insert" ON public.masters_code
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
        )
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'masters_code_admin_update' AND polrelid = 'public.masters_code'::regclass
  ) THEN
    CREATE POLICY "masters_code_admin_update" ON public.masters_code
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'masters_code_admin_delete' AND polrelid = 'public.masters_code'::regclass
  ) THEN
    CREATE POLICY "masters_code_admin_delete" ON public.masters_code
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
        )
      );
  END IF;
END$$;

COMMIT;
