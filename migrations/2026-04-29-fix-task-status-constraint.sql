-- Ensure task status uses Block/Delay and support legacy values
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'Todo';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tasks'::regclass
      AND conname = 'chk_tasks_status'
  ) THEN
    ALTER TABLE tasks DROP CONSTRAINT chk_tasks_status;
  END IF;
  ALTER TABLE tasks
    ADD CONSTRAINT chk_tasks_status CHECK (status IN ('Todo', 'In Progress', 'Block/Delay', 'Done'));
END$$;

UPDATE tasks
SET status = 'Block/Delay'
WHERE status IN ('Blocked/Delay', 'Review');

UPDATE tasks
SET status = 'Todo'
WHERE status IS NULL OR status = '';
