ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS customer_abbreviation text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_id text NOT NULL DEFAULT '';