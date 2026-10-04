import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import { Eye, EyeOff, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2, UserPlus, UserRound, Users, X } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getCurrentUserRoleAndId } from '../../services/api';
import { getPermissionsByRole, USER_SCREEN_OPTIONS, type ScreenAccessLevel, type UserScreenPermissions } from '../../constants/rolePermissions';
import { Btn, C, Modal } from '../Common';
import type { Profile } from '../../types';

type ManagedUser = Profile;

function defaultScreenPermissions(user: ManagedUser): UserScreenPermissions {
  const defaults = getPermissionsByRole(user.role);
  const visible = new Set([...defaults.visibleProjectTabs, ...(defaults.canViewPortfolioOverview ? ['portfolio-overview'] : [])]);
  return Object.fromEntries(USER_SCREEN_OPTIONS.map((screen) => [screen.id, visible.has(screen.id) ? 'full' : 'hidden'])) as UserScreenPermissions;
}

function normalizeScreenPermissions(user: ManagedUser): UserScreenPermissions {
  const defaults = defaultScreenPermissions(user);
  if (Array.isArray(user.screenPermissions)) {
    const selectedScreens = new Set(user.screenPermissions);
    return Object.fromEntries(USER_SCREEN_OPTIONS.map((screen) => [screen.id, selectedScreens.has(screen.id) ? 'full' : 'hidden'])) as UserScreenPermissions;
  }
  return { ...defaults, ...(user.screenPermissions || {}) };
}

async function readApiResponse(response: Response): Promise<Record<string, unknown>> {
  const responseText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  let result: Record<string, unknown> = {};
  if (responseText) {
    try {
      result = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      result = {
        error: contentType.includes('text/html')
          ? `User API unavailable (HTTP ${response.status}). Stop the current dev server, run vercel login, then restart with npm run dev.`
          : responseText.slice(0, 300),
      };
    }
  } else if (!response.ok) {
    result = { error: `User API unavailable (HTTP ${response.status}). Stop the current dev server, run vercel login, then restart with npm run dev.` };
  }
  if (!response.ok) {
    const message = String(result.error || `User API returned ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
    throw new Error(message);
  }
  return result;
}
export default function ManageUsersModal({ onClose }: { onClose: () => void }) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editingUserId, setEditingUserId] = useState('');
  const [draftFullName, setDraftFullName] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [draftPassword, setDraftPassword] = useState('');
  const [draftRole, setDraftRole] = useState<Profile['role']>('member');
  const [draftScreens, setDraftScreens] = useState<UserScreenPermissions>({});
  const [draftProjectScope, setDraftProjectScope] = useState<'member' | 'all'>('member');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState('');
  const [search, setSearch] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'client' | 'admin'>('member');
  const [inviting, setInviting] = useState(false);

  const selectedUser = users.find((item) => item.id === selectedId) || null;
  const isEditingSelected = Boolean(selectedUser && editingUserId === selectedUser.id);
  const isAccessDirty = selectedUser && selectedUser.role !== 'admin'
    && (JSON.stringify(draftScreens) !== JSON.stringify(normalizeScreenPermissions(selectedUser))
      || draftProjectScope !== (selectedUser.projectAccessScope || 'member'));
  const isNameDirty = Boolean(selectedUser && draftFullName.trim() !== selectedUser.fullName);
  const isAuthDetailsDirty = Boolean(selectedUser && (
    draftEmail.trim().toLowerCase() !== selectedUser.email.toLowerCase()
    || draftPassword.length > 0
  ));
  const isRoleDirty = Boolean(selectedUser && draftRole !== selectedUser.role);
  const isDirty = Boolean(isAccessDirty || isNameDirty || isAuthDetailsDirty || isRoleDirty);

  const visibleUsers = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return users.filter((item) => !normalized || `${item.fullName} ${item.email} ${item.role}`.toLowerCase().includes(normalized));
  }, [users, search]);

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,avatar_url,role,is_active,screen_permissions,project_access_scope,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error(`Unable to load users: ${error.message}`);
      setLoading(false);
      return;
    }
    const loaded = (data || []).map((row: Record<string, unknown>) => ({
      id: String(row.id || ''),
      email: String(row.email || ''),
      fullName: String(row.full_name || ''),
      avatarUrl: String(row.avatar_url || ''),
      role: String(row.role || 'member') as Profile['role'],
      isActive: row.is_active !== false,
      projectAccessScope: row.project_access_scope === 'all' ? 'all' as const : 'member' as const,
      screenPermissions: Array.isArray(row.screen_permissions)
        ? row.screen_permissions.map(String)
        : row.screen_permissions && typeof row.screen_permissions === 'object'
          ? row.screen_permissions as UserScreenPermissions
          : null,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    }));
    setUsers(loaded);
    setSelectedId((current) => loaded.some((item) => item.id === current) ? current : loaded[0]?.id || '');
    setLoading(false);
  };

  useEffect(() => { void loadUsers(); }, []);

  useEffect(() => {
    if (!selectedUser) {
      setDraftScreens({});
      setDraftProjectScope('member');
      setDraftFullName('');
      setDraftEmail('');
      setDraftPassword('');
      setDraftRole('member');
      return;
    }
    setDraftScreens(normalizeScreenPermissions(selectedUser));
    setDraftProjectScope(selectedUser.role === 'admin' ? 'all' : selectedUser.projectAccessScope || 'member');
    setDraftFullName(selectedUser.fullName);
    setDraftEmail(selectedUser.email);
    setDraftPassword('');
    setDraftRole(selectedUser.role);
  }, [selectedUser?.id, selectedUser?.fullName, selectedUser?.email, selectedUser?.screenPermissions, selectedUser?.projectAccessScope, selectedUser?.role]);

  const requestUpdate = async (userId: string, payload: { is_active?: boolean; screen_permissions?: UserScreenPermissions; project_access_scope?: 'member' | 'all' }) => {
    const caller = await getCurrentUserRoleAndId();
    if (caller.role !== 'admin') throw new Error('FORBIDDEN');
    const { error } = await supabase.rpc('admin_update_user_access', {
      p_user_id: userId,
      p_is_active: payload.is_active ?? null,
      p_screen_permissions: payload.screen_permissions ?? null,
      p_project_access_scope: payload.project_access_scope ?? null,
    });
    if (error) throw new Error(error.message);
  };

  const updateUserStatus = async (target: ManagedUser, isActive: boolean) => {
    setBusyUserId(target.id);
    try {
      await requestUpdate(target.id, { is_active: isActive });
      toast.success(isActive ? 'User activated' : 'User deactivated');
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update user');
    } finally {
      setBusyUserId('');
    }
  };

  const saveUserChanges = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      if (isNameDirty) {
        const { error } = await supabase.rpc('admin_update_user_profile', {
          p_user_id: selectedUser.id,
          p_full_name: draftFullName.trim(),
        });
        if (error) throw new Error(error.message);
      }
      if (isAccessDirty && selectedUser.role !== 'admin' && draftRole === selectedUser.role) {
        await requestUpdate(selectedUser.id, { screen_permissions: draftScreens, project_access_scope: draftProjectScope });
      }
      if (isRoleDirty) {
        if (selectedUser.id === currentUser?.id) throw new Error('You cannot change your own role.');
        const { error } = await supabase.rpc('admin_update_user_role', {
          p_user_id: selectedUser.id,
          p_role: draftRole,
        });
        if (error) throw new Error(error.message);
      }
      if (isAuthDetailsDirty) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error('UNAUTHENTICATED');
        const details: Record<string, string> = { userId: selectedUser.id };
        if (draftEmail.trim().toLowerCase() !== selectedUser.email.toLowerCase()) details.email = draftEmail.trim().toLowerCase();
        if (draftPassword) details.password = draftPassword;
        const response = await fetch('/api/users/manage', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(details),
        });
        await readApiResponse(response);
      }
      toast.success('User changes saved');
      setDraftPassword('');
      setEditingUserId('');
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save user changes');
    } finally {
      setSaving(false);
    }
  };

  const sendInvitation = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!inviteName.trim() || !email) {
      toast.error('Enter the user name and email');
      return;
    }
    setInviting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('UNAUTHENTICATED');
      const response = await fetch('/api/users/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email, fullName: inviteName.trim(), role: inviteRole }),
      });
      await readApiResponse(response);
      toast.success('Invitation sent');
      setInviteName('');
      setInviteEmail('');
      setShowInviteForm(false);
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not invite user');
    } finally {
      setInviting(false);
    }
  };

  const deleteInactiveUser = async (target: ManagedUser) => {
    if (target.isActive || target.role === 'admin' || target.id === currentUser?.id) return;
    const confirmation = await Swal.fire({
      title: 'Delete inactive user?',
      text: `${target.email} and its Auth account will be permanently deleted.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete user',
      cancelButtonText: 'Cancel',
      confirmButtonColor: C.red,
      cancelButtonColor: C.text3,
      reverseButtons: true,
      focusCancel: true,
    });
    if (!confirmation.isConfirmed) return;
    setBusyUserId(target.id);
    try {
      const caller = await getCurrentUserRoleAndId();
      if (caller.role !== 'admin') throw new Error('FORBIDDEN');
      const { error } = await supabase.rpc('admin_delete_inactive_user', { p_user_id: target.id });
      if (error) throw new Error(error.message);
      toast.success('Inactive user deleted');
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete user');
    } finally {
      setBusyUserId('');
    }
  };

  const setScreenAccess = (screenId: string, access: ScreenAccessLevel) => setDraftScreens((current) => ({ ...current, [screenId]: access }));

  const cancelEdit = () => {
    if (!selectedUser) return;
    setDraftScreens(normalizeScreenPermissions(selectedUser));
    setDraftProjectScope(selectedUser.projectAccessScope || 'member');
    setDraftFullName(selectedUser.fullName);
    setDraftEmail(selectedUser.email);
    setDraftPassword('');
    setEditingUserId('');
  };

  return (
    <Modal title="Manage Users" onClose={onClose} width={1080} height="88vh" contentStyle={{ padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 0.9fr)', gap: 16, height: '100%', minHeight: 0 }}>
        <section style={{ minWidth: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
            <Users size={16} color={C.primary} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or role" style={{ flex: 1, minWidth: 0, height: 32, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0 9px', fontSize: 12 }} />
            <button type="button" onClick={() => void loadUsers()} title="Refresh users" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: C.white, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text2, cursor: 'pointer' }}><RefreshCw size={14} /></button>
            <Btn onClick={() => setShowInviteForm((open) => !open)} small><UserPlus size={14} /> Add User</Btn>
          </div>
          {showInviteForm && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(160px, 1.3fr) 110px auto', gap: 7, alignItems: 'center', padding: 10, borderBottom: `1px solid ${C.border}`, background: C.white }}>
              <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Full name" style={{ height: 32, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0 8px', fontSize: 11 }} />
              <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Email address" style={{ height: 32, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0 8px', fontSize: 11 }} />
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'member' | 'client' | 'admin')} style={{ height: 32, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, color: C.text, fontSize: 11 }}>
                <option value="member">Member</option>
                <option value="client">Client</option>
                <option value="admin">Admin</option>
              </select>
              <Btn onClick={() => void sendInvitation()} disabled={inviting} small><Plus size={14} /> {inviting ? 'Sending…' : 'Invite'}</Btn>
            </div>
          )}
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead><tr style={{ position: 'sticky', top: 0, background: C.white, zIndex: 1 }}>{['User', 'Role', 'Status', ''].map((label) => <th key={label} style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, textAlign: 'left', color: C.text2, fontSize: 10, whiteSpace: 'nowrap' }}>{label}</th>)}</tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={4} style={{ padding: 20, color: C.text3, textAlign: 'center' }}>Loading users…</td></tr> : visibleUsers.map((item) => {
                  const isAdmin = item.role === 'admin';
                  const isActive = item.isActive !== false;
                  const isSelf = item.id === currentUser?.id;
                  return (
                    <tr key={item.id} onClick={() => { setSelectedId(item.id); setEditingUserId(''); }} style={{ background: selectedId === item.id ? C.primaryBg : C.white, borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                      <td style={{ padding: '10px 12px', minWidth: 190 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{item.fullName || item.email || 'Unnamed user'}</div>
                        <div style={{ fontSize: 10, color: C.text3 }}>{item.email}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: isAdmin ? C.primary : C.text2, fontWeight: isAdmin ? 700 : 500, whiteSpace: 'nowrap' }}>{item.role}</td>
                      <td style={{ padding: '10px 12px' }}><span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 999, background: isActive ? C.greenBg : C.redBg, color: isActive ? C.green : C.red, fontSize: 10, fontWeight: 700 }}>{isActive ? 'Active' : 'Inactive'}</span></td>
                      <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>
                        <button type="button" aria-label={`Edit ${item.email}`} title="Edit user" onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); setEditingUserId(item.id); }} style={{ width: 30, height: 30, border: 0, borderRadius: 6, background: 'transparent', color: editingUserId === item.id ? C.primary : C.text3, cursor: 'pointer' }}><Pencil size={14} /></button>
                        {!isAdmin && <button type="button" disabled={isSelf || busyUserId === item.id} aria-label={isActive ? `Deactivate ${item.email}` : `Activate ${item.email}`} title={isActive ? 'Deactivate user' : 'Activate user'} onClick={(event) => { event.stopPropagation(); void updateUserStatus(item, !isActive); }} style={{ width: 30, height: 30, border: 0, borderRadius: 6, background: 'transparent', color: isActive ? C.amber : C.green, cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.45 : 1 }}>{isActive ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
                        {!isAdmin && !isActive && <button type="button" disabled={isSelf || busyUserId === item.id} aria-label={`Delete ${item.email}`} title="Delete inactive user" onClick={(event) => { event.stopPropagation(); void deleteInactiveUser(item); }} style={{ width: 30, height: 30, border: 0, borderRadius: 6, background: 'transparent', color: C.red, cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.45 : 1 }}><Trash2 size={15} /></button>}
                      </td>
                    </tr>
                  );
                })}
                {!loading && visibleUsers.length === 0 && <tr><td colSpan={4} style={{ padding: 20, color: C.text3, textAlign: 'center' }}>No registered users found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'auto', padding: 14, background: C.white }}>
          {selectedUser ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, paddingBottom: 12, marginBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflowWrap: 'anywhere' }}>{selectedUser.fullName || selectedUser.email}</div>
                  <div style={{ marginTop: 3, fontSize: 11, color: C.text2 }}>{selectedUser.email} · {selectedUser.role}</div>
                </div>
                {selectedUser.role === 'admin'
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.primary, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}><ShieldCheck size={14} /> All access</span>
                  : isEditingSelected
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.primary, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}><Pencil size={13} /> Editing access</span>
                    : <Btn onClick={() => setEditingUserId(selectedUser.id)} small><Pencil size={13} /> Edit Access</Btn>}
              </div>
              {isEditingSelected && (
                <div style={{ display: 'grid', gap: 8, marginBottom: 14, padding: 10, border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg }}>
                  <label style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr)', alignItems: 'center', gap: 8, fontSize: 10, color: C.text2 }}>
                    Full Name
                    <input value={draftFullName} onChange={(event) => setDraftFullName(event.target.value)} style={{ height: 31, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 5, padding: '0 8px', fontSize: 11 }} />
                  </label>
                  <label style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr)', alignItems: 'center', gap: 8, fontSize: 10, color: C.text2 }}>
                    Email
                    <input type="email" value={draftEmail} onChange={(event) => setDraftEmail(event.target.value)} style={{ height: 31, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 5, padding: '0 8px', fontSize: 11 }} />
                  </label>
                  <label style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr)', alignItems: 'center', gap: 8, fontSize: 10, color: C.text2 }}>
                    Role
                    <select aria-label="User role" value={draftRole} disabled={selectedUser.id === currentUser?.id} onChange={(event) => setDraftRole(event.target.value as Profile['role'])} style={{ height: 31, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 5, padding: '0 8px', background: selectedUser.id === currentUser?.id ? C.bg2 : C.white, color: C.text, fontSize: 11 }}>
                      <option value="member">Member</option>
                      <option value="client">Client</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr)', alignItems: 'center', gap: 8, fontSize: 10, color: C.text2 }}>
                    New Password
                    <input type="password" autoComplete="new-password" value={draftPassword} onChange={(event) => setDraftPassword(event.target.value)} placeholder="Leave blank to keep current" style={{ height: 31, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 5, padding: '0 8px', fontSize: 11 }} />
                  </label>
                </div>
              )}
              {selectedUser.role === 'admin' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: C.primaryBg, borderRadius: 6, color: C.primary, fontSize: 12 }}><ShieldCheck size={16} /> Admin always has access to every screen and project; no setup is required.</div>
                  {isEditingSelected && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                    <Btn variant="ghost" onClick={cancelEdit} disabled={saving} small><X size={14} /> Cancel</Btn>
                    <Btn onClick={() => void saveUserChanges()} disabled={!isDirty || saving} small><Save size={14} /> {saving ? 'Saving…' : 'Save changes'}</Btn>
                  </div>}
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 190px', gap: 8, alignItems: 'center', padding: '8px 4px 12px', borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: C.text, fontWeight: 700 }}>Project visibility</span>
                    <select aria-label="Project visibility" value={draftProjectScope} disabled={!isEditingSelected} onChange={(event) => setDraftProjectScope(event.target.value as 'member' | 'all')} style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 6, background: !isEditingSelected ? C.bg2 : C.white, color: C.text, fontSize: 10, padding: '0 7px' }}>
                      <option value="member">Member projects only</option>
                      <option value="all">All projects</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>Screen access</div>
                    {isEditingSelected && <button type="button" onClick={() => setDraftScreens(Object.fromEntries(USER_SCREEN_OPTIONS.map((screen) => [screen.id, 'full'])) as UserScreenPermissions)} style={{ border: 0, background: 'transparent', color: C.primary, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>Set all to Full Access</button>}
                  </div>
                  <div style={{ display: 'grid', gap: 2 }}>
                    {USER_SCREEN_OPTIONS.map((screen) => (
                      <div key={screen.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) auto', gap: 8, alignItems: 'center', padding: '7px 4px', borderBottom: `1px solid ${C.bg2}` }}>
                        <span id={`screen-label-${screen.id}`} style={{ fontSize: 11, color: C.text }}>{screen.label}</span>
                        <div role="radiogroup" aria-labelledby={`screen-label-${screen.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {([
                            { value: 'hidden', label: 'Not Show' },
                            { value: 'read', label: 'Read' },
                            { value: 'full', label: 'Full' },
                          ] as const).map((option) => (
                            <label key={option.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: !isEditingSelected ? C.text3 : C.text2, fontSize: 9, whiteSpace: 'nowrap', cursor: isEditingSelected ? 'pointer' : 'default' }}>
                              <input
                                type="radio"
                                name={`screen-access-${screen.id}`}
                                value={option.value}
                                checked={(draftScreens[screen.id] || 'hidden') === option.value}
                                disabled={!isEditingSelected}
                                onChange={() => setScreenAccess(screen.id, option.value as ScreenAccessLevel)}
                                style={{ width: 13, height: 13, margin: 0, accentColor: C.primary }}
                              />
                              {option.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {isEditingSelected && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                    <Btn variant="ghost" onClick={cancelEdit} disabled={saving} small><X size={14} /> Cancel</Btn>
                    <Btn onClick={() => void saveUserChanges()} disabled={!isDirty || saving} small><Save size={14} /> {saving ? 'Saving…' : 'Save changes'}</Btn>
                  </div>}
                  {selectedUser.isActive === false && <div style={{ marginTop: 10, color: C.text3, fontSize: 10 }}>This account remains unable to sign in until it is activated.</div>}
                </>
              )}
            </>
          ) : <div style={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 160, color: C.text3, fontSize: 12 }}><UserRound size={24} />Select a user to manage screen access.</div>}
        </section>
      </div>
    </Modal>
  );
}