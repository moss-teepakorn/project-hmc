-- Fix RLS for partners with current local-auth architecture.
-- Current frontend auth does not create Supabase Auth JWT, so auth.uid() is null.
-- Keep RLS enabled but allow CRUD for anon/authenticated roles used by the app.

BEGIN;

ALTER TABLE IF EXISTS public.partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partners_select_authenticated ON public.partners;
DROP POLICY IF EXISTS partners_insert_admin ON public.partners;
DROP POLICY IF EXISTS partners_update_admin ON public.partners;
DROP POLICY IF EXISTS partners_delete_admin ON public.partners;
DROP POLICY IF EXISTS partners_public_select ON public.partners;
DROP POLICY IF EXISTS partners_public_insert ON public.partners;
DROP POLICY IF EXISTS partners_public_update ON public.partners;
DROP POLICY IF EXISTS partners_public_delete ON public.partners;

CREATE POLICY partners_public_select ON public.partners
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY partners_public_insert ON public.partners
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY partners_public_update ON public.partners
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY partners_public_delete ON public.partners
  FOR DELETE
  TO anon, authenticated
  USING (true);

COMMIT;
