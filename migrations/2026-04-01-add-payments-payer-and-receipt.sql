-- Add payer fields and receipt number to payments
BEGIN;

ALTER TABLE IF EXISTS payments
  ADD COLUMN IF NOT EXISTS payer_type text,
  ADD COLUMN IF NOT EXISTS payer_name text,
  ADD COLUMN IF NOT EXISTS payer_contact text,
  ADD COLUMN IF NOT EXISTS receipt_no text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt_no ON payments(receipt_no);

COMMIT;
