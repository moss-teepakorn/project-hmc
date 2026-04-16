-- Add floor and room fields for houses
ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS floor_no integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS room_no text;

-- Keep floor number in expected UI range
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'houses_floor_no_range_check'
  ) THEN
    ALTER TABLE public.houses
      ADD CONSTRAINT houses_floor_no_range_check CHECK (floor_no >= 0 AND floor_no <= 99);
  END IF;
END $$;
