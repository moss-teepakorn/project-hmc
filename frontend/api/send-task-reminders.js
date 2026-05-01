import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const REMINDER_API_SECRET = process.env.REMINDER_API_SECRET || process.env.REMINDER_SECRET;
const GMAIL_USER = process.env.GMAIL_USER || process.env.GMAIL_USERNAME || process.env.EMAIL_USERNAME;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD;
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

const formatKhunName = (name) => {
  if (!name) return '';
  const normalized = String(name).trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${first}.${String(last[0] || '').toUpperCase()}`;
  }
  return normalized;
};

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
};

const getBangkokDateParts = (date) => {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
};

const getBangkokNow = () => {
  const parts = getBangkokDateParts(new Date());
  return {
    nowKey: `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`,
    currentTime: `${parts.hour.toString().padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`,
    today: new Date(parts.year, parts.month - 1, parts.day),
  };
};

const parseTimeToMinutes = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  const parts = value.split(':').map((part) => Number(part));
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  const hours = parts[0];
  const minutes = parts[1];
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const getBangkokDateKey = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const parts = getBangkokDateParts(d);
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
};

const formatBangkokDate = (date) => {
  const parts = getBangkokDateParts(date);
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
};

const getGreeting = (recipients, members) => {
  const emailToMember = new Map(members.map((m) => [String(m.email || '').trim().toLowerCase(), m]));
  for (const email of recipients) {
    const member = emailToMember.get(String(email || '').trim().toLowerCase());
    if (member) {
      const fullName = String(member.name || '').trim();
      const nickname = String(member.nickname || '').trim();
      const formattedName = fullName ? formatKhunName(fullName) : nickname || '';
      if (formattedName) return `Dear Khun ${formattedName},`;
    }
  }
  return 'To whom it may concern,';
};

const buildEmailHtml = (greeting, rows) => {
  const rowsHtml = rows.map((task) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 10px;">${task.project_code || ''}</td>
        <td style="padding:8px 10px;">${task.project_name || ''}</td>
        <td style="padding:8px 10px;">${task.task_name || ''}</td>
        <td style="padding:8px 10px;">${formatDate(task.end_date)}</td>
        <td style="padding:8px 10px; text-align:center;">${task.percent_complete ?? ''}%</td>
        <td style="padding:8px 10px;">${task.statusLabel}</td>
      </tr>`).join('');

  return `
    <div style="font-family: Arial, sans-serif; color: #111827;">
      <p>${greeting}</p>
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

const buildEmailText = (greeting, rows) => {
  const lines = [
    greeting,
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
  const { today } = getBangkokNow();
  const inThreeDays = new Date(today);
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  const inSevenDays = new Date(today);
  inSevenDays.setDate(inSevenDays.getDate() + 7);

  if (dueDate < today) return 'Overdue';
  if (dueDate <= inThreeDays) return 'Due in 3 days';
  if (dueDate <= inSevenDays) return 'Due in 7 days';
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
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY');
  if (!GMAIL_USER) missing.push('GMAIL_USER or GMAIL_USERNAME');
  if (!GMAIL_APP_PASSWORD) missing.push('GMAIL_APP_PASSWORD or GMAIL_PASSWORD');
  if (!REMINDER_API_SECRET) missing.push('REMINDER_API_SECRET');
  if (missing.length > 0) {
    return res.status(500).json({ error: `Missing env: ${missing.join(', ')}` });
  }

  try {
    const { projectId, test, force } = req.body || {};
    const secret = req.headers['x-reminder-secret'] || req.query.secret;
    const accessTokenHeader = req.headers.authorization || req.headers.Authorization || '';
    const accessToken = accessTokenHeader.startsWith('Bearer ') ? accessTokenHeader.slice(7) : accessTokenHeader || null;
    const isTestMode = Boolean(test);
    const isForceSend = Boolean(force);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    let isAuthorized = false;
    if (!isTestMode && secret === REMINDER_API_SECRET) {
      isAuthorized = true;
    }

    if (!isTestMode && !isAuthorized && accessToken) {
      const { data: callerUser, error: callerErr } = await supabase.auth.getUser(accessToken);
      if (!callerErr && callerUser?.user) {
        const callerId = callerUser.user.id;
        const { data: callerProfile, error: profErr } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', callerId)
          .maybeSingle();
        if (!profErr && callerProfile?.role === 'admin') {
          isAuthorized = true;
        }
      }
    }

    if (!isTestMode && !isAuthorized) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { nowKey, currentTime, today } = getBangkokNow();
    const todayString = `${today.getFullYear().toString().padStart(4, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

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

      const alreadySentToday = project.email_notification_last_sent_at
        ? getBangkokDateKey(project.email_notification_last_sent_at) === nowKey
        : false;
      if (alreadySentToday && !isForceSend) return false;

      if (isForceSend) {
        return true;
      }

      if (!project.email_notification_time) return false;

      const scheduledMinutes = parseTimeToMinutes(project.email_notification_time);
      if (scheduledMinutes == null) return false;

      const currentParts = currentTime.split(':').map((part) => Number(part));
      const currentMinutes = currentParts.length >= 2 && !Number.isNaN(currentParts[0]) && !Number.isNaN(currentParts[1])
        ? currentParts[0] * 60 + currentParts[1]
        : null;
      if (currentMinutes == null) return false;
      if (currentMinutes < scheduledMinutes) return false;

      return true;
    });
  }

  const results = [];
  const recipientTasks = new Map();
  const allMembers = new Map();
  const projectsToUpdate = new Set();

  for (const project of projects) {
    const maxDueDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    maxDueDate.setUTCDate(maxDueDate.getUTCDate() + 7);
    const tasksResp = await supabase
      .from('tasks')
      .select('id,task_name,end_date,percent_complete,resource,level')
      .eq('project_id', project.id)
      .gt('level', 0)
      .lt('percent_complete', 100)
      .not('end_date', 'is', null)
      .lte('end_date', formatBangkokDate(maxDueDate));
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
      .select('name,nickname,email')
      .eq('project_id', project.id);
    const members = memberResp.data || [];
    members.forEach((m) => {
      const email = String(m.email || '').trim().toLowerCase();
      if (email) allMembers.set(email, m);
    });
    const memberMap = new Map(members.map((m) => [String(m.name).trim().toLowerCase(), String(m.email).trim().toLowerCase()]));

    const customRecipients = normalizeRecipients(project.email_notification_recipients || '');
    let anyTaskRecipient = false;

    for (const task of tasks) {
      const taskRow = {
        project_code: project.code || '',
        project_name: project.name || '',
        task_name: task.task_name || '',
        end_date: task.end_date,
        percent_complete: task.percent_complete ?? 0,
        statusLabel: getStatusLabel(task.end_date),
      };

      const assigned = String(task.resource || '').trim();
      const taskBasedEmail = isValidEmail(assigned)
        ? assigned.toLowerCase()
        : memberMap.get(assigned.toLowerCase()) || null;
      const recipients = project.email_notification_mode === 'custom'
        ? customRecipients
        : taskBasedEmail
          ? [taskBasedEmail]
          : customRecipients;

      if (!recipients.length) continue;
      anyTaskRecipient = true;

      recipients.forEach((recipient) => {
        const email = recipient.toLowerCase();
        const existing = recipientTasks.get(email) || { recipient: email, rows: [], projectIds: new Set() };
        existing.rows.push(taskRow);
        existing.projectIds.add(project.id);
        recipientTasks.set(email, existing);
      });
    }

    if (!anyTaskRecipient) {
      results.push({ project: project.id, skipped: 'No email recipients found' });
      continue;
    }

    projectsToUpdate.add(project.id);
  }

  if (recipientTasks.size === 0) {
    return res.status(200).json({ results });
  }

  for (const { recipient, rows, projectIds } of recipientTasks.values()) {
    const greeting = getGreeting([recipient], Array.from(allMembers.values()));
    const html = buildEmailHtml(greeting, rows);
    const text = buildEmailText(greeting, rows);

    try {
      await sendMail({ to: recipient, bcc: [], html, text });
      results.push({ recipient, sentTasks: rows.length, projects: Array.from(projectIds), test: isTestMode });
    } catch (error) {
      results.push({ recipient, error: String(error) });
    }
  }

  if (!isTestMode && projectsToUpdate.size > 0) {
    await supabase
      .from('projects')
      .update({ email_notification_last_sent_at: new Date().toISOString() })
      .in('id', Array.from(projectsToUpdate));
  }

  return res.status(200).json({ results });
  } catch (error) {
    console.error('Reminder handler error', error);
    return res.status(500).json({ error: String(error) || 'Internal Server Error' });
  }
}
