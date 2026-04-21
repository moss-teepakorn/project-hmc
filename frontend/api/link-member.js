export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { email, userId } = req.body || {};
  if (!email || !userId) return res.status(400).json({ error: 'Missing email or userId' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Missing Supabase service env' });

  try {
    // 1) call RPC to get matching member rows (may include project_id)
    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validate_member_email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({ p_email: email }),
    });
    const rpcData = await rpcResp.json();
    if (!Array.isArray(rpcData) || rpcData.length === 0) {
      return res.status(200).json({ message: 'No matching member rows', linked: [] });
    }

    const projectIds = Array.from(new Set(rpcData.map((r) => r.project_id).filter(Boolean)));
    if (projectIds.length === 0) {
      return res.status(200).json({ message: 'No project mapped for that email', linked: [] });
    }

    // 2) find existing project_members for this user to avoid duplicates
    const existingResp = await fetch(`${SUPABASE_URL}/rest/v1/project_members?user_id=eq.${userId}&select=project_id`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
    });
    const existing = await existingResp.json();
    const existingIds = Array.isArray(existing) ? existing.map((r) => r.project_id) : [];

    const toInsert = projectIds.filter((pid) => !existingIds.includes(pid)).map((pid) => ({ project_id: pid, user_id: userId }));
    if (toInsert.length === 0) return res.status(200).json({ message: 'Already linked', linked: projectIds });

    // 3) insert new project_members rows
    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/project_members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(toInsert),
    });

    if (!insertResp.ok) {
      const err = await insertResp.text();
      return res.status(500).json({ error: 'Insert failed', details: err });
    }

    const inserted = await insertResp.json();
    return res.status(200).json({ message: 'Linked', linked: inserted });
  } catch (e) {
    console.error('link-member error', e);
    return res.status(500).json({ error: 'Server error', details: String(e) });
  }
}
