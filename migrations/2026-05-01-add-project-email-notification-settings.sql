-- Add project email reminder configuration fields
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS email_notification_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_notification_mode TEXT NOT NULL DEFAULT 'task' CHECK (email_notification_mode IN ('task', 'custom')),
  ADD COLUMN IF NOT EXISTS email_notification_recipients TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_notification_time TIME NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS email_notification_last_sent_at TIMESTAMPTZ;
