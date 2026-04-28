-- Add task status column and keep it in sync with percent_complete
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'Todo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tasks'
      AND constraint_type = 'CHECK'
      AND constraint_name = 'chk_tasks_status'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT chk_tasks_status CHECK (status IN ('Todo', 'In Progress', 'Done'));
  END IF;
END$$;

UPDATE tasks
SET status = CASE
  WHEN percent_complete = 0 THEN 'Todo'
  WHEN percent_complete = 100 THEN 'Done'
  ELSE 'In Progress'
END;

CREATE OR REPLACE FUNCTION fn_tasks_sync_status()
RETURNS trigger AS $$
BEGIN
  NEW.status := CASE
    WHEN NEW.percent_complete = 0 THEN 'Todo'
    WHEN NEW.percent_complete = 100 THEN 'Done'
    ELSE 'In Progress'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_sync_status ON tasks;
CREATE TRIGGER trg_tasks_sync_status
BEFORE INSERT OR UPDATE OF percent_complete ON tasks
FOR EACH ROW
EXECUTE FUNCTION fn_tasks_sync_status();
