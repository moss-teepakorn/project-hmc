-- Add project progress snapshot persistence for baseline vs actual comparison

CREATE TABLE IF NOT EXISTS public.project_progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  baseline_percent INTEGER NOT NULL DEFAULT 0,
  actual_percent INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_project_progress_snapshots_project
  ON public.project_progress_snapshots(project_id);

ALTER TABLE IF EXISTS public.project_progress_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_progress_snapshots_public_select ON public.project_progress_snapshots;
DROP POLICY IF EXISTS project_progress_snapshots_public_insert ON public.project_progress_snapshots;
DROP POLICY IF EXISTS project_progress_snapshots_public_update ON public.project_progress_snapshots;
DROP POLICY IF EXISTS project_progress_snapshots_public_delete ON public.project_progress_snapshots;

CREATE POLICY project_progress_snapshots_public_select ON public.project_progress_snapshots
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY project_progress_snapshots_public_insert ON public.project_progress_snapshots
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY project_progress_snapshots_public_update ON public.project_progress_snapshots
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY project_progress_snapshots_public_delete ON public.project_progress_snapshots
  FOR DELETE
  TO anon, authenticated
  USING (true);
