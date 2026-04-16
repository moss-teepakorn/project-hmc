-- Create board_sets and board_members tables for juristic committee registry.
-- Board sets represent the groups of 7 committee members with assigned positions.
-- Uses local-auth architecture: RLS policies allow anon/authenticated roles.

BEGIN;

CREATE TABLE IF NOT EXISTS public.board_sets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  set_no      int         NOT NULL,
  is_active   boolean     NOT NULL DEFAULT false,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_board_sets_set_no ON public.board_sets(set_no);
CREATE INDEX         IF NOT EXISTS idx_board_sets_is_active ON public.board_sets(is_active);

CREATE TABLE IF NOT EXISTS public.board_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id      uuid        NOT NULL REFERENCES public.board_sets(id) ON DELETE CASCADE,
  member_no   int         NOT NULL,
  full_name   text        NOT NULL DEFAULT '',
  position    text        NOT NULL DEFAULT 'กรรมการ',
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_board_members_set_member ON public.board_members(set_id, member_no);
CREATE INDEX         IF NOT EXISTS idx_board_members_set_id    ON public.board_members(set_id);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_board_sets_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_board_sets_updated_at ON public.board_sets;
CREATE TRIGGER trg_board_sets_updated_at
  BEFORE UPDATE ON public.board_sets
  FOR EACH ROW EXECUTE FUNCTION public.set_board_sets_updated_at();

CREATE OR REPLACE FUNCTION public.set_board_members_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_board_members_updated_at ON public.board_members;
CREATE TRIGGER trg_board_members_updated_at
  BEFORE UPDATE ON public.board_members
  FOR EACH ROW EXECUTE FUNCTION public.set_board_members_updated_at();

-- RLS (local-auth: no Supabase JWT, use anon/authenticated)
ALTER TABLE public.board_sets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_sets_public_select ON public.board_sets;
DROP POLICY IF EXISTS board_sets_public_insert ON public.board_sets;
DROP POLICY IF EXISTS board_sets_public_update ON public.board_sets;
DROP POLICY IF EXISTS board_sets_public_delete ON public.board_sets;

CREATE POLICY board_sets_public_select ON public.board_sets
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY board_sets_public_insert ON public.board_sets
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY board_sets_public_update ON public.board_sets
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY board_sets_public_delete ON public.board_sets
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS board_members_public_select ON public.board_members;
DROP POLICY IF EXISTS board_members_public_insert ON public.board_members;
DROP POLICY IF EXISTS board_members_public_update ON public.board_members;
DROP POLICY IF EXISTS board_members_public_delete ON public.board_members;

CREATE POLICY board_members_public_select ON public.board_members
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY board_members_public_insert ON public.board_members
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY board_members_public_update ON public.board_members
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY board_members_public_delete ON public.board_members
  FOR DELETE TO anon, authenticated USING (true);

COMMIT;
