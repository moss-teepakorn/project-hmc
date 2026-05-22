ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS baseline_start_date DATE,
  ADD COLUMN IF NOT EXISTS baseline_end_date DATE;

CREATE INDEX IF NOT EXISTS idx_tasks_baseline_start_date ON tasks (baseline_start_date);
CREATE INDEX IF NOT EXISTS idx_tasks_baseline_end_date ON tasks (baseline_end_date);
