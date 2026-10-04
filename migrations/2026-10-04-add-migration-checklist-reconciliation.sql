ALTER TABLE public.project_checklist_progress
  ADD COLUMN IF NOT EXISTS uat_customer numeric,
  ADD COLUMN IF NOT EXISTS uat_hmc numeric,
  ADD COLUMN IF NOT EXISTS production_customer numeric,
  ADD COLUMN IF NOT EXISTS production_hmc numeric;