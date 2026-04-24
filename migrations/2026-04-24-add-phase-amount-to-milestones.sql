-- Add phase budget storage to milestones
ALTER TABLE public.milestones
ADD COLUMN IF NOT EXISTS phase_amount numeric NOT NULL DEFAULT 0;
