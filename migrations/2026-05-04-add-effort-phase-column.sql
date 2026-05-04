-- Add phase column to efforts for phase grouping in Effort tab
ALTER TABLE public.efforts
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT '';
