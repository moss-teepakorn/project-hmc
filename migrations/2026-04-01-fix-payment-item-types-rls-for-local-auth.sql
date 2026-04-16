-- Fix RLS for payment_item_types with current local-auth architecture.
-- Current frontend auth does not create Supabase Auth JWT, so auth.uid() is null.
-- This migration keeps RLS enabled but allows CRUD for anon/authenticated roles.

BEGIN;

ALTER TABLE IF EXISTS public.payment_item_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_authenticated_select ON public.payment_item_types;
DROP POLICY IF EXISTS admins_can_insert ON public.payment_item_types;
DROP POLICY IF EXISTS admins_can_update ON public.payment_item_types;
DROP POLICY IF EXISTS admins_can_delete ON public.payment_item_types;
DROP POLICY IF EXISTS allow_public_insert ON public.payment_item_types;
DROP POLICY IF EXISTS allow_public_select ON public.payment_item_types;
DROP POLICY IF EXISTS allow_public_update ON public.payment_item_types;
DROP POLICY IF EXISTS allow_public_delete ON public.payment_item_types;

CREATE POLICY allow_public_select ON public.payment_item_types
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY allow_public_insert ON public.payment_item_types
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY allow_public_update ON public.payment_item_types
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY allow_public_delete ON public.payment_item_types
  FOR DELETE
  TO anon, authenticated
  USING (true);

COMMIT;
