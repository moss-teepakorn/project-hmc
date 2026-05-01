import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  const accessTokenHeader = req.headers.authorization || req.headers.Authorization || '';
  const accessToken = accessTokenHeader.startsWith('Bearer ') ? accessTokenHeader.slice(7) : null;
  if (!accessToken) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  // Verify caller is admin
  const { data: callerData, error: callerErr } = await supabase.auth.getUser(accessToken);
  if (callerErr || !callerData?.user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: callerProfile, error: profErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .maybeSingle();
  if (profErr || callerProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin only' });
  }

  // Query params
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const projectId = req.query.project_id || null;

  let query = supabase
    .from('email_reminder_logs')
    .select('id,project_id,project_name,project_code,type,scheduled_time,sent_at,status,recipient,tasks_count,error_message,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ logs: data || [] });
}
