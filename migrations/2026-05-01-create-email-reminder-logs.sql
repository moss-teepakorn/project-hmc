-- Email reminder send log table
-- Tracks every auto/manual email reminder attempt per project

CREATE TABLE IF NOT EXISTS email_reminder_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid        REFERENCES projects(id) ON DELETE SET NULL,
  project_name  text,
  project_code  text,
  type          text        NOT NULL CHECK (type IN ('auto', 'manual')),
  scheduled_time text,
  sent_at       timestamptz,
  status        text        NOT NULL CHECK (status IN ('sent', 'skipped', 'failed')),
  recipient     text,
  tasks_count   integer     DEFAULT 0,
  error_message text,
  created_at    timestamptz DEFAULT now()
);

-- Index for quick lookup by project
CREATE INDEX IF NOT EXISTS idx_email_reminder_logs_project_id ON email_reminder_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_email_reminder_logs_created_at ON email_reminder_logs(created_at DESC);

-- RLS: only service role (or admin users) can read/write
ALTER TABLE email_reminder_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (used by API routes)
CREATE POLICY "service_role_all" ON email_reminder_logs
  FOR ALL USING (true)
  WITH CHECK (true);
