BEGIN;

ALTER TABLE public.tasks
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL,
  ALTER COLUMN actual_finish DROP NOT NULL;

COMMIT;

SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tasks'
  AND column_name IN ('start_date', 'end_date', 'actual_finish')
ORDER BY column_name;
