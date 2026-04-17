-- Add software version to projects
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS software_version TEXT NOT NULL DEFAULT '';

-- Store environment URLs and credentials per project
CREATE TABLE IF NOT EXISTS project_environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('DEV', 'QA', 'UAT', 'Production')),
  url TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_project_environments_project
ON project_environments(project_id);
