import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { Card, Btn, Badge, Avatar, Modal, FormRow, Input, Select, Textarea, ConfirmModal, C, TH, TD } from '../Common';
import { roleColor } from '../../utils';
import type { Member, Profile, UserRole } from '../../types';
import { updateUserRole } from '../../services/api';
import { supabase } from '../../services/supabase';

export const ROLES = [
  'Project Sponsor', 'Project Advisor', 'Project Manager', 'Project Leader',
  'Project Coordinate', 'Project Consultant', 'Development',
  'HRD User', 'HRM User', 'Key User', 'IT Support',
];

interface Props { projectId: string; }

export default function MembersTab({ projectId }: Props) {
  const { members, fetchMembers, createMember, updateMember, deleteMember } = useStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('member');
  const [filter, setFilter]     = useState<'all' | 'internal' | 'client'>('all');
  const [modal, setModal]       = useState<Partial<Member> | null>(null);
  const [deleting, setDeleting] = useState<Member | null>(null);
  const [syncing, setSyncing]   = useState(false);

  useEffect(() => {
    fetchMembers(projectId);
    // Fetch all profiles for role info
    (async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (!error) setProfiles(data || []);
      // Get current user role
      const { data: userData } = await supabase.auth.getUser();
      let role: UserRole = 'member';
      if (userData?.user?.id) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', userData.user.id).single();
        if (profile?.role) role = profile.role;
      }
      setCurrentUserRole(role);
    })();
  }, [projectId]);

  const typeOrder: Record<string, number> = { internal: 0, client: 1 };
  const roleOrder: Record<string, number> = {
    'Project Sponsor': 0,
    'Project Advisor': 1,
    'Project Manager': 2,
    'Project Leader': 3,
    'Project Coordinate': 4,
    'Project Consultant': 5,
    'Development': 6,
    'HRD User': 7,
    'HRM User': 8,
    'Key User': 9,
    'IT Support': 10,
  };

  const sortMembers = (a: Member, b: Member) => {
    const ta = typeOrder[a.type] ?? 99;
    const tb = typeOrder[b.type] ?? 99;
    if (ta !== tb) return ta - tb;
    const ra = roleOrder[a.role || ''] ?? 99;
    const rb = roleOrder[b.role || ''] ?? 99;
    if (ra !== rb) return ra - rb;
    return String(a.name || '').localeCompare(String(b.name || ''));
  };

  const shownUnsorted = filter === 'all' ? members : members.filter(m => m.type === filter);
  const shown = [...shownUnsorted].sort(sortMembers);
  const internal = members.filter(m => m.type === 'internal').sort(sortMembers);
  const client   = members.filter(m => m.type === 'client').sort(sortMembers);

  const syncMemberEmail = async (email: string) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return;
    try {
      const response = await fetch('/api/link-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      });
      if (!response.ok) {
        const body = await response.text();
        console.warn('link-member failed', response.status, body);
      }
    } catch (e) {
      console.warn('link-member failed', e);
    }
  };

  const handleSave = async (form: Partial<Member>) => {
    try {
      if (form.id) {
        await updateMember(form.id, { ...form, projectId });
        toast.success('Member updated');
      } else {
        await createMember({ ...form, projectId });
        toast.success('Member added');
        if (form.email) await syncMemberEmail(form.email);
      }
      setModal(null);
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleSyncProjectMembers = async () => {
    if (!projectId) return;
    setSyncing(true);
    try {
      const response = await fetch('/api/sync-project-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed');
      toast.success(`Sync completed: ${result.insertedCount || 0} added, ${result.deletedCount || 0} removed`);
      await fetchMembers(projectId);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to sync';
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  // PATCH user role (admin only)
  const handlePatchRole = async (userId: string, newRole: UserRole) => {
    try {
      // Only allow 'admin', 'member', 'client'
      if (!['admin','member','client'].includes(newRole)) throw new Error('Invalid role');
      await updateUserRole(userId, newRole as 'admin' | 'member' | 'client');
      toast.success('Role updated');
      // reload profiles
      const { data } = await supabase.from('profiles').select('*');
      setProfiles(data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to update role');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await deleteMember(deleting.id); toast.success('Removed'); }
    catch { toast.error('Failed to delete'); }
    setDeleting(null);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Internal Team', count: internal.length, icon: '👥', bg: C.primaryBg, color: C.primary },
          { label: 'Client Members', count: client.length, icon: '🏢', bg: C.amberBg, color: C.amber },
        ].map(s => (
          <Card key={s.label} style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 12, color: C.text2 }}>{s.label}</div></div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'internal', 'client'] as const).map(v => (
            <button key={v} onClick={() => setFilter(v)}
              style={{ fontFamily: 'Poppins, sans-serif', fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 20, border: `1.5px solid ${filter === v ? C.primary : C.border}`, background: filter === v ? C.primaryBg : C.white, color: filter === v ? C.primary : C.text2, cursor: 'pointer' }}>
              {v.charAt(0).toUpperCase() + v.slice(1)} ({v === 'all' ? members.length : v === 'internal' ? internal.length : client.length})
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="outline" small disabled={syncing} onClick={handleSyncProjectMembers}>
            <RefreshCcw size={14} /> Sync Members
          </Btn>
          <Btn onClick={() => setModal({})} small><Plus size={14} /> Add Member</Btn>
        </div>
      </div>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {['Member', 'Nickname', 'Role', 'Position', 'Email', 'Tel', 'Type', 'Notes', ''].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((mb, i) => (
              <tr key={mb.id} style={{ background: i % 2 === 0 ? C.white : C.bg }}
                onMouseEnter={e => e.currentTarget.style.background = C.primaryBg}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? C.white : C.bg}>
                <td style={TD}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={mb.name} size={30} />
                    <span style={{ fontWeight: 600, color: C.text }}>{mb.name}</span>
                  </div>
                </td>
                <td style={{ ...TD, color: C.text2 }}>{mb.nickname}</td>
                <td style={TD}>
                  {/* Show role from profile if available */}
                  {(() => {
                    const profile = profiles.find(p => p.email === mb.email);
                    const role = profile?.role || mb.role || '—';
                    if (currentUserRole === 'admin' && profile) {
                      return (
                        <span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: roleColor(role), background: roleColor(role) + '18', padding: '3px 10px', borderRadius: 20, marginRight: 6 }}>{role}</span>
                          <select
                            value={role}
                            onChange={e => handlePatchRole(profile.id, e.target.value as UserRole)}
                            style={{ fontSize: 11, borderRadius: 6, border: '1px solid #ddd', padding: '2px 6px' }}
                          >
                            <option value="admin">admin</option>
                            <option value="member">member</option>
                            <option value="client">client</option>
                          </select>
                        </span>
                      );
                    } else {
                      return (
                        <span style={{ fontSize: 11, fontWeight: 600, color: roleColor(role), background: roleColor(role) + '18', padding: '3px 10px', borderRadius: 20 }}>{role}</span>
                      );
                    }
                  })()}
                </td>
                <td style={{ ...TD, color: C.text2, fontSize: 11 }}>{mb.position || '—'}</td>
                <td style={{ ...TD, color: C.blue }}>{mb.email}</td>
                <td style={{ ...TD, fontFamily: 'Poppins, sans-serif', fontSize: 12 }}>{mb.tel}</td>
                <td style={TD}>
                  <Badge bg={mb.type === 'internal' ? C.primaryBg : C.amberBg} color={mb.type === 'internal' ? C.primary : C.amber}>
                    {mb.type === 'internal' ? 'Internal' : 'Client'}
                  </Badge>
                </td>
                <td style={{ ...TD, color: C.text3, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{mb.notes || '—'}</td>
                <td style={TD}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button onClick={() => setModal(mb)} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', background: C.primaryBg, border: 'none', borderRadius: 8, padding: '8px', minWidth: 34, minHeight: 34, fontSize: 11, color: C.primary, cursor: 'pointer', fontWeight: 600 }}><Pencil size={16} /></button>
                    <button onClick={() => setDeleting(mb)} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', background: C.redBg, border: 'none', borderRadius: 8, padding: '8px', minWidth: 34, minHeight: 34, fontSize: 11, color: C.red, cursor: 'pointer', fontWeight: 600 }}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>No members yet.</div>}
      </Card>

      {modal !== null && <MemberModal data={modal} currentUserRole={currentUserRole} onClose={() => setModal(null)} onSave={handleSave} />}
      {deleting && <ConfirmModal message={`Remove ${deleting.name}?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}

function MemberModal({ data, currentUserRole, onClose, onSave }: { data: Partial<Member>; currentUserRole: UserRole; onClose: () => void; onSave: (f: Partial<Member>) => void }) {
  const [form, setForm] = useState<Partial<Member>>({ name: '', nickname: '', role: '', position: '', email: '', tel: '', type: 'internal', notes: '', ...data });
  const up = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Modal title={form.id ? 'Edit Member' : 'Add Member'} onClose={onClose} width={520}>
      <FormRow label="Full Name" required>
        <Input autoFocus value={form.name ?? ''} onChange={v => up('name', v)} placeholder="e.g. John Smith" />
      </FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormRow label="Nickname"><Input value={form.nickname ?? ''} onChange={v => up('nickname', v)} placeholder="e.g. John" /></FormRow>
        <FormRow label="Type">
          <Select value={form.type ?? 'internal'} onChange={v => up('type', v)}
            options={[{ value: 'internal', label: 'Internal Team' }, { value: 'client', label: 'Client' }]} />
        </FormRow>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormRow label="Role">
          <Select value={form.role ?? ''} onChange={v => up('role', v)}
            options={[{ value: '', label: 'Select role…' }, ...ROLES.map(r => ({ value: r, label: r }))]}
            disabled={currentUserRole !== 'admin'}
          />
          {currentUserRole !== 'admin' && <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>Only admins can change profile role.</div>}
        </FormRow>
        <FormRow label="Position"><Input value={form.position ?? ''} onChange={v => up('position', v)} placeholder="e.g. Senior Developer" /></FormRow>
      </div>
      <FormRow label="Email"><Input type="email" value={form.email ?? ''} onChange={v => up('email', v)} placeholder="email@example.com" /></FormRow>
      <FormRow label="Tel"><Input value={form.tel ?? ''} onChange={v => up('tel', v)} placeholder="+66-81-234-5678" /></FormRow>
      <FormRow label="Notes"><Textarea value={form.notes ?? ''} onChange={v => up('notes', v)} rows={2} placeholder="Additional remarks…" /></FormRow>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => { if (!form.name?.trim()) return; onSave(form); }}>Save</Btn>
      </div>
    </Modal>
  );
}
