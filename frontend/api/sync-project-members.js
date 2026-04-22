import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { projectId } = req.body || {};
  if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Missing Supabase service env' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: members, error: membersError } = await supabase
      .from('members')
      .select('email')
      .eq('project_id', projectId);
    if (membersError) throw membersError;

    const emails = Array.from(
      new Set(
        (members || [])
          .map((row: any) => String(row.email || '').trim().toLowerCase())
          .filter((email: string) => email)
      )
    );

    const { data: profiles, error: profilesError } = emails.length
      ? await supabase.from('profiles').select('id,email').in('email', emails)
      : { data: [], error: null };
    if (profilesError) throw profilesError;

    const profileByEmail = new Map<string, string>();
    (profiles || []).forEach((row: any) => {
      if (row.email) profileByEmail.set(String(row.email).trim().toLowerCase(), row.id);
    });

    const { data: existingRows, error: existingError } = await supabase
      .from('project_members')
      .select('id,user_id')
      .eq('project_id', projectId);
    if (existingError) throw existingError;

    const existingUserIds = new Set((existingRows || []).map((row: any) => row.user_id));
    const desiredUserIds = Array.from(
      new Set(emails.map((email) => profileByEmail.get(email)).filter(Boolean))
    );

    const inserted = [];
    if (desiredUserIds.length > 0) {
      const toInsert = desiredUserIds
        .filter((userId) => !existingUserIds.has(userId))
        .map((userId) => ({ project_id: projectId, user_id: userId }));
      if (toInsert.length > 0) {
        const { data: insertedRows, error: insertError } = await supabase
          .from('project_members')
          .insert(toInsert)
          .select();
        if (insertError) throw insertError;
        inserted.push(...(insertedRows || []));
      }
    }

    const desiredSet = new Set(desiredUserIds);
    const toDeleteIds = (existingRows || [])
      .filter((row: any) => row.user_id && !desiredSet.has(row.user_id))
      .map((row: any) => row.id);

    const deleted = [];
    if (toDeleteIds.length > 0) {
      const { data: deletedRows, error: deleteError } = await supabase
        .from('project_members')
        .delete()
        .in('id', toDeleteIds)
        .select();
      if (deleteError) throw deleteError;
      deleted.push(...(deletedRows || []));
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
