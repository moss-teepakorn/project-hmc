-- Add editable recipient_name for disbursements.
-- Supports cases where selected house owner is not the final payee name.

BEGIN;

ALTER TABLE public.disbursements
  ADD COLUMN IF NOT EXISTS recipient_name text;

COMMIT;
