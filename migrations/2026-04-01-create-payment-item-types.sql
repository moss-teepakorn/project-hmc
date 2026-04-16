-- Create payment_item_types table for master data of non-common payment items
BEGIN;

CREATE TABLE IF NOT EXISTS payment_item_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  default_amount numeric DEFAULT 0,
  category text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp ON payment_item_types;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON payment_item_types
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

COMMIT;
