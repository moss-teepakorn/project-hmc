const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const { role } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing user id' });
  if (!['admin', 'member', 'client'].includes(role)) return res.status(400).json({ error: 'INVALID_ROLE' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server missing SUPABASE env variables' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { global: { headers: { 'x-application-role': 'server' } } });

  // Expect caller's access token in Authorization header
  const auth = (req.headers.authorization || '').split(' ');
  const accessToken = auth[0] === 'Bearer' ? auth[1] : auth[0] || null;
  if (!accessToken) return res.status(401).json({ error: 'MISSING_TOKEN' });

  // Verify caller user
  const { data: callerUser, error: callerErr } = await supabase.auth.getUser(accessToken);
  if (callerErr || !callerUser?.user) return res.status(401).json({ error: 'INVALID_TOKEN' });

  const callerId = callerUser.user.id;

  // Check caller role from profiles table
  const { data: callerProfile, error: profErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (profErr) return res.status(500).json({ error: profErr.message });
  if (!callerProfile || callerProfile.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' });

  // Update target user's role
  const { error: updErr } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (updErr) return res.status(500).json({ error: updErr.message });

  return res.status(200).json({ ok: true });
};
