export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { projectId } = req.body || {};
  if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Missing Supabase service env' });

  try {
    const membersResp = await fetch(
      `${SUPABASE_URL}/rest/v1/members?project_id=eq.${encodeURIComponent(projectId)}&select=email`,
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
        },
      }
    );
    const members = await membersResp.json();
    const emails = Array.from(new Set(
      (Array.isArray(members) ? members : [])
        .map((row) => String(row.email || '').trim().toLowerCase())
        .filter((email) => email)
    ));

    const profiles = emails.length > 0 ? await (async () => {
      const quoted = emails.map((email) => `'${email.replace(/'/g, "''")}'`).join(',');
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?email=in.(${encodeURIComponent(quoted)})&select=id,email`,
        {
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            apikey: SUPABASE_SERVICE_KEY,
          },
        }
      );
      return await resp.json();
    })() : [];

    const profileByEmail = new Map();
    (Array.isArray(profiles) ? profiles : []).forEach((row) => {
      if (row.email) profileByEmail.set(String(row.email).trim().toLowerCase(), row.id);
    });

    const existingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/project_members?project_id=eq.${encodeURIComponent(projectId)}&select=id,user_id`,
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
        },
      }
    );
    const existingRows = await existingResp.json();
    const existingUserIds = new Set((Array.isArray(existingRows) ? existingRows : []).map((row) => row.user_id));

    const desiredUserIds = Array.from(new Set(
      emails.map((email) => profileByEmail.get(email)).filter(Boolean)
    ));

    const toInsert = desiredUserIds.filter((userId) => !existingUserIds.has(userId));
    const inserted = [];
    if (toInsert.length > 0) {
      const insertRows = toInsert.map((userId) => ({ project_id: projectId, user_id: userId }));
      const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/project_members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(insertRows),
      });
      if (!insertResp.ok) {
        const err = await insertResp.text();
        throw new Error(`Insert failed: ${err}`);
      }
      const insertedRows = await insertResp.json();
      inserted.push(...(Array.isArray(insertedRows) ? insertedRows : []));
    }

    const desiredSet = new Set(desiredUserIds);
    const toDeleteIds = (Array.isArray(existingRows) ? existingRows : [])
      .filter((row) => row.user_id && !desiredSet.has(row.user_id))
      .map((row) => row.id);
    let deleted = [];
    if (toDeleteIds.length > 0) {
      const quotedIds = toDeleteIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',');
      const deleteResp = await fetch(
        `${SUPABASE_URL}/rest/v1/project_members?id=in.(${encodeURIComponent(quotedIds)})`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            apikey: SUPABASE_SERVICE_KEY,
            Prefer: 'return=representation',
          },
        }
      );
      if (!deleteResp.ok) {
        const err = await deleteResp.text();
        throw new Error(`Delete failed: ${err}`);
      }
      deleted = deleteResp.status === 204 ? [] : await deleteResp.json();
    }

    return res.status(200).json({
      message: 'Sync completed',
      insertedCount: inserted.length,
      deletedCount: deleted.length,
      missingProfiles: emails.filter((email) => !profileByEmail.has(email)),
    });
  } catch (e) {
    console.error('sync-project-members error', e);
    return res.status(500).json({ error: 'Server error', details: String(e) });
  }
}
