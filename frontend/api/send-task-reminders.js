import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const REMINDER_API_SECRET = process.env.REMINDER_API_SECRET;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const EMAIL_FROM = process.env.EMAIL_FROM || GMAIL_USER;
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || EMAIL_FROM;

const isValidEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const normalizeRecipients = (raw) => {
  if (!raw || typeof raw !== 'string') return [];
  return Array.from(new Set(raw
    .split(',')
    .map((part) => part.trim())
    .filter((email) => isValidEmail(email))
  ));
};

const normalizeNameFromEmail = (email) => {
  const username = email.split('@')[0] || '';
  return username.replace(/\.|_|-|\d+/g, ' ').trim();
};

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
};

const buildEmailHtml = (project, rows) => {
  const rowsHtml = rows.map((task) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 10px;">${project.code || ''}</td>
        <td style="padding:8px 10px;">${project.name || ''}</td>
        <td style="padding:8px 10px;">${task.task_name || ''}</td>
        <td style="padding:8px 10px;">${formatDate(task.end_date)}</td>
        <td style="padding:8px 10px; text-align:center;">${task.percent_complete ?? ''}%</td>
        <td style="padding:8px 10px;">${task.statusLabel}</td>
      </tr>`).join('');

  return `
    <div style="font-family: Arial, sans-serif; color: #111827;">
      <p>Dear Khun,</p>
      <p>This is a reminder that the following tasks are due soon or already overdue.</p>
      <table style="border-collapse: collapse; width: 100%; margin-top: 12px;">
        <thead>
          <tr style="background: #f3f4f6; text-align: left;">
            <th style="padding: 10px; border: 1px solid #d1d5db;">Project ID</th>
            <th style="padding: 10px; border: 1px solid #d1d5db;">Project Name</th>
            <th style="padding: 10px; border: 1px solid #d1d5db;">Task</th>
            <th style="padding: 10px; border: 1px solid #d1d5db;">Due date</th>
            <th style="padding: 10px; border: 1px solid #d1d5db;">%</th>
            <th style="padding: 10px; border: 1px solid #d1d5db;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <p>Please review the tasks and take any necessary action.</p>
      <p>This is an automated email notification. Please do not reply to this email.</p>
      <p>Best regards,<br/>Project Tracking System</p>
    </div>`;
};

const buildEmailText = (rows) => {
  const lines = [
    'Dear Khun,',
    '',
    'This is a reminder that the following tasks are due soon or already overdue.',
    '',
    'Project ID | Project Name | Task | Due date | % | Status',
    '--------------------------------------------------------',
    ...rows.map((task) => `${task.project_code} | ${task.project_name} | ${task.task_name} | ${formatDate(task.end_date)} | ${task.percent_complete}% | ${task.statusLabel}`),
    '',
    'Please review the tasks and take any necessary action.',
    'This is an automated email notification. Please do not reply to this email.',
    '',
    'Best regards,',
    'Project Tracking System',
  ];
  return lines.join('\n');
};

const getStatusLabel = (endDateString) => {
  if (!endDateString) return 'Due Soon';
  const dueDate = new Date(endDateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dueDate < today) return 'Overdue';
  return 'Due Soon';
};

const sendMail = async ({ to, bcc, html, text }) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  return transporter.sendMail({
    from: EMAIL_FROM,
    to,
    bcc,
    replyTo: EMAIL_REPLY_TO,
    subject: 'Task Reminder Notification',
    html,
    text,
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GMAIL_USER || !GMAIL_APP_PASSWORD || !EMAIL_FROM || !REMINDER_API_SECRET) {
    return res.status(500).json({ error: 'Missing email or Supabase configuration in environment' });
  }

  try {
    const { projectId, test } = req.body || {};
    const secret = req.headers['x-reminder-secret'] || req.query.secret;
    const isTestMode = Boolean(test);
    if (!isTestMode && secret !== REMINDER_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const now = new Date();
    const nowKey = now.toISOString().slice(0, 10);
    const currentTime = now.toISOString().slice(11, 16);

  let projectsResp = await supabase
    .from('projects')
    .select('id,name,code,email_notification_enabled,email_notification_mode,email_notification_recipients,email_notification_time,email_notification_last_sent_at');

  if (projectsResp.error) return res.status(500).json({ error: projectsResp.error.message });

  let projects = projectsResp.data || [];
  if (projectId) {
    projects = projects.filter((project) => project.id === projectId);
  }

  if (!isTestMode) {
    projects = projects.filter((project) => {
      if (!project.email_notification_enabled) return false;
      if (!project.email_notification_time) return false;
      const scheduled = String(project.email_notification_time).slice(0, 5);
      const alreadySentToday = project.email_notification_last_sent_at
        ? String(new Date(project.email_notification_last_sent_at).toISOString().slice(0, 10)) === nowKey
        : false;
      return !alreadySentToday && currentTime >= scheduled;
    });
  }

  const results = [];

  for (const project of projects) {
    const tasksResp = await supabase
      .from('tasks')
      .select('id,task_name,end_date,percent_complete,assigned_to')
      .eq('project_id', project.id)
      .lt('percent_complete', 100)
      .not('end_date', 'is', null)
      .lte('end_date', new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString().slice(0, 10));
    if (tasksResp.error) {
      results.push({ project: project.id, error: tasksResp.error.message });
      continue;
    }

    const tasks = tasksResp.data || [];
    if (tasks.length === 0) {
      results.push({ project: project.id, skipped: 'No due tasks found' });
      continue;
    }

    const memberResp = await supabase
      .from('members')
      .select('name,email')
      .eq('project_id', project.id);
    const members = memberResp.data || [];
    const memberMap = new Map(members.map((m) => [String(m.name).trim().toLowerCase(), String(m.email).trim().toLowerCase()]));

    const taskBasedRecipients = tasks.map((task) => {
      const assigned = String(task.assigned_to || '').trim();
      if (isValidEmail(assigned)) return assigned.toLowerCase();
      return memberMap.get(assigned.toLowerCase()) || null;
    }).filter(Boolean);

    const customRecipients = normalizeRecipients(project.email_notification_recipients || '');
    const recipients = project.email_notification_mode === 'custom'
      ? customRecipients
      : Array.from(new Set([...(taskBasedRecipients || []), ...(customRecipients || [])]));

    if (recipients.length === 0) {
      results.push({ project: project.id, skipped: 'No email recipients found' });
      continue;
    }

    const rows = tasks.map((task) => ({
      project_code: project.code || '',
      project_name: project.name || '',
      task_name: task.task_name || '',
      end_date: task.end_date,
      percent_complete: task.percent_complete ?? 0,
      statusLabel: getStatusLabel(task.end_date),
    }));

    const html = buildEmailHtml(project, rows);
    const text = buildEmailText(rows);
    const [to, ...bcc] = recipients;

    try {
      await sendMail({ to, bcc, html, text });
      if (!isTestMode) {
        await supabase
          .from('projects')
          .update({ email_notification_last_sent_at: new Date().toISOString() })
          .eq('id', project.id);
      }
      results.push({ project: project.id, sentTo: recipients, test: isTestMode });
    } catch (error) {
      results.push({ project: project.id, error: String(error) });
    }
  }

  return res.status(200).json({ results });
  } catch (error) {
    console.error('Reminder handler error', error);
    return res.status(500).json({ error: String(error) || 'Internal Server Error' });
  }
}
