ALTER TABLE public.project_checklist_progress
  ADD COLUMN IF NOT EXISTS not_required boolean NOT NULL DEFAULT false;