import { createClient } from '@supabase/supabase-js';

const USER_SCREEN_IDS = [
  'portfolio-overview', 'tasks', 'summary', 'members', 'ms', 'effort', 'checklists',
  'cr', 'issues', 'risks', 'activities', 'env', 'onepage',
];

export default async function handler(req, res) {
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missingEnvironment = [];
  if (!supabaseUrl) missingEnvironment.push('SUPABASE_URL or VITE_SUPABASE_URL');
  if (!serviceKey) missingEnvironment.push('SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY');
  if (missingEnvironment.length) {
    return res.status(500).json({ error: `Missing server environment variable(s): ${missingEnvironment.join(', ')}` });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessToken) return res.status(401).json({ error: 'MISSING_TOKEN' });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return res.status(401).json({ error: 'INVALID_TOKEN' });

  const callerId = authData.user.id;
  const { data: caller, error: callerError } = await supabase.from('profiles').select('role,is_active').eq('id', callerId).maybeSingle();
  if (callerError) return res.status(500).json({ error: callerError.message });
  if (caller?.role !== 'admin' || caller.is_active === false) return res.status(403).json({ error: 'FORBIDDEN' });

  if (req.method === 'POST') {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const fullName = String(req.body?.fullName || '').trim();
    const role = req.body?.role;
    if (!email || !fullName || !['admin', 'member', 'client'].includes(role)) return res.status(400).json({ error: 'INVALID_INVITE_DETAILS' });
    if (role !== 'admin') {
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('type')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      if (memberError) return res.status(500).json({ error: memberError.message });
      if (!member) return res.status(400).json({ error: 'EMAIL_NOT_ALLOWED' });
      const allowedRole = member.type === 'client' ? 'client' : 'member';
      if (role !== allowedRole) return res.status(400).json({ error: 'ROLE_TYPE_MISMATCH' });
    }
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role },
      ...(req.headers.origin ? { redirectTo: `${req.headers.origin}/` } : {}),
    });
    if (error) return res.status(400).json({ error: error.message });
    if (role === 'admin' && data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: 'admin',
        is_active: true,
        project_access_scope: 'all',
        screen_permissions: null,
      }, { onConflict: 'id' });
      if (profileError) {
        await supabase.auth.admin.deleteUser(data.user.id);
        return res.status(500).json({ error: profileError.message });
      }
    }
    return res.status(200).json({ ok: true, userId: data.user?.id });
  }

  const userId = req.body?.userId;
  if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'INVALID_USER_ID' });

  const { data: target, error: targetError } = await supabase.from('profiles').select('id,role,is_active').eq('id', userId).maybeSingle();
  if (targetError) return res.status(500).json({ error: targetError.message });
  if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  if (req.method === 'PATCH') {
    const updates = {};
    const authUpdates = {};
    if (target.role === 'admin' && (req.body?.is_active !== undefined || req.body?.project_access_scope !== undefined || req.body?.screen_permissions !== undefined)) {
      return res.status(403).json({ error: 'ADMIN_ACCESS_IS_FIXED' });
    }
    if (userId === callerId && req.body?.is_active === false) return res.status(400).json({ error: 'CANNOT_DEACTIVATE_SELF' });
    if (req.body?.fullName !== undefined) {
      const fullName = String(req.body.fullName || '').trim();
      if (!fullName) return res.status(400).json({ error: 'FULL_NAME_REQUIRED' });
      updates.full_name = fullName;
    }
    if (req.body?.role !== undefined) {
      if (!['admin', 'member', 'client'].includes(req.body.role)) return res.status(400).json({ error: 'INVALID_ROLE' });
      if (userId === callerId && req.body.role !== target.role) return res.status(400).json({ error: 'CANNOT_CHANGE_SELF_ROLE' });
      updates.role = req.body.role;
      authUpdates.user_metadata_role = req.body.role;
      if (req.body.role === 'admin') {
        updates.project_access_scope = 'all';
        updates.screen_permissions = null;
        updates.is_active = true;
      } else if (target.role === 'admin') {
        updates.project_access_scope = 'member';
        updates.screen_permissions = null;
      }
    }
    if (req.body?.email !== undefined) {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'INVALID_EMAIL' });
      authUpdates.email = email;
      authUpdates.email_confirm = true;
      updates.email = email;
    }
    if (req.body?.password) {
      if (String(req.body.password).length < 6) return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
      authUpdates.password = String(req.body.password);
    }
    if (Object.keys(authUpdates).length) {
      const { data: authTarget, error: authTargetError } = await supabase.auth.admin.getUserById(userId);
      if (authTargetError || !authTarget.user) return res.status(404).json({ error: 'AUTH_USER_NOT_FOUND' });
      if (req.body?.fullName !== undefined) {
        authUpdates.user_metadata = { ...(authTarget.user.user_metadata || {}), full_name: updates.full_name };
      }
      if (authUpdates.user_metadata_role) {
        authUpdates.user_metadata = { ...(authUpdates.user_metadata || authTarget.user.user_metadata || {}), role: authUpdates.user_metadata_role };
        delete authUpdates.user_metadata_role;
      }
      const { error } = await supabase.auth.admin.updateUserById(userId, authUpdates);
      if (error) return res.status(400).json({ error: error.message });
    }
    if (typeof req.body?.is_active === 'boolean') updates.is_active = req.body.is_active;
    if (req.body?.project_access_scope !== undefined) {
      if (!['member', 'all'].includes(req.body.project_access_scope)) return res.status(400).json({ error: 'INVALID_PROJECT_ACCESS_SCOPE' });
      updates.project_access_scope = req.body.project_access_scope;
    }
    if (req.body?.screen_permissions !== undefined) {
      const screens = req.body.screen_permissions;
      const validAccess = new Set(['hidden', 'read', 'full']);
      if (!screens || typeof screens !== 'object' || Array.isArray(screens)
        || Object.entries(screens).some(([screen, access]) => !USER_SCREEN_IDS.includes(screen) || !validAccess.has(access))) {
        return res.status(400).json({ error: 'INVALID_SCREEN_PERMISSIONS' });
      }
      updates.screen_permissions = screens;
    }
    if (!Object.keys(updates).length && !Object.keys(authUpdates).length) return res.status(400).json({ error: 'NO_VALID_UPDATES' });
    if (Object.keys(updates).length) {
      const { data: updated, error } = await supabase.from('profiles').update(updates).eq('id', userId).select('id').maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!updated) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    return res.status(200).json({ ok: true });
  }

  if (target.role === 'admin') return res.status(403).json({ error: 'ADMIN_ACCESS_IS_FIXED' });
  if (userId === callerId) return res.status(400).json({ error: 'CANNOT_DELETE_SELF' });
  if (target.is_active !== false) return res.status(400).json({ error: 'ONLY_INACTIVE_USERS_CAN_BE_DELETED' });
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}