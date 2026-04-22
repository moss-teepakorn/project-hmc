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
