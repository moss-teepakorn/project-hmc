-- Add phase column to tasks so main tasks can be mapped by project phase
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS phase VARCHAR(100) DEFAULT '';
