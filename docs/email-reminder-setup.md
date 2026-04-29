# Email Reminder Setup

This project supports a daily task reminder email feature using Gmail SMTP.

## Database structure

Add these fields to the `projects` table:

- `email_notification_enabled BOOLEAN NOT NULL DEFAULT FALSE`
  - Turn on/off daily email reminders per project.
- `email_notification_mode VARCHAR(20) NOT NULL DEFAULT 'task' CHECK (email_notification_mode IN ('task','custom'))`
  - `task`: send to task assignees, fallback to custom recipients if needed.
  - `custom`: send only to explicitly defined email addresses.
- `email_notification_recipients TEXT NOT NULL DEFAULT ''`
  - Comma-separated recipient emails, e.g. `somchai@domain.com,apichart@domain.com`.
- `email_notification_time TIME NOT NULL DEFAULT '08:00'`
  - Daily send time in server time.
- `email_notification_last_sent_at TIMESTAMPTZ`
  - Tracks when the reminder was last sent for the project.

A migration file has been added at `migrations/2026-05-01-add-project-email-notification-settings.sql`.

## Frontend structure

The `Project` model now includes:

- `emailNotificationEnabled`
- `emailNotificationMode`
- `emailNotificationRecipients`
- `emailNotificationTime`
- `emailNotificationLastSentAt`

The project edit modal has been extended to configure these fields.

## Email sending service

A serverless API route has been added at `frontend/api/send-task-reminders.js`.

It performs the following when triggered:

1. Loads all enabled projects.
2. Filters projects whose configured reminder time has passed and have not been sent today.
3. Queries tasks where:
   - `percent_complete < 100`
   - `due_date <= today + 7 days`
4. Builds an email table with:
   - Project ID
   - Project Name
   - Task
   - Due date
   - % complete
   - Status (`Overdue` / `Due Soon`)
5. Sends email via Gmail SMTP.
6. Updates `email_notification_last_sent_at` on success.

## Environment variables

Add these values to `frontend/.env.local` or your deployment environment:

```env
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
REMINDER_API_SECRET=your-secret-key-for-reminder-api
GMAIL_USER=your-gmail-address@gmail.com
GMAIL_APP_PASSWORD=your-gmail-app-password
EMAIL_FROM="Project Tracking System <no-reply@yourdomain.com>"
EMAIL_REPLY_TO=your-reply-address@example.com
```

### Gmail setup notes

- You must use a Gmail account with an app password.
- Go to your Google account `Security > App passwords` and create a password for `Mail`.
- Do not use your normal Gmail login password.

## Scheduling

The route is designed to be called daily by an external scheduler, such as:

- Vercel Cron (if supported)
- GitHub Actions
- cron-job.org
- your own server cron

Trigger the route with a secret header or query string:

```bash
curl -X POST https://your-site.com/api/send-task-reminders \
  -H "x-reminder-secret: your-secret-key-for-reminder-api"
```

The scheduler should run the endpoint every 5-15 minutes so the server can catch the configured project send times.

## Notes

- The schedule is evaluated in server time.
- If a project uses `task` mode and no assigned emails are found, the system will use custom recipients instead.
- The email subject is: `Task Reminder Notification`.
