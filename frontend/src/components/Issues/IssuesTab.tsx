import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { Card, Btn, Badge, Modal, FormRow, Input, Select, Textarea, ConfirmModal, C, TH, TD } from '../Common';
import { fmtDate, PROCESS_STATUS_STYLE, todayISO } from '../../utils';
import type { Issue } from '../../types';

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Blocked'] as const;

interface Props { projectId: string; }

export default function IssuesTab({ projectId }: Props) {
  const { issues, members, fetchIssues, fetchMembers, createIssue, updateIssue, deleteIssue } = useStore();
  const [modal, setModal]       = useState<Partial<Issue> | null>(null);
  const [deleting, setDeleting] = useState<Issue | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { fetchIssues(projectId); fetchMembers(projectId); }, [projectId]);

  const memberNames = members.map(m => m.name);
  const shown = filterStatus === 'all' ? issues : issues.filter(i => i.status === filterStatus);

  const openCount = issues.filter(i => i.status === 'Open' || i.status === 'In Progress').length;

  const handleSave = async (form: Partial<Issue>) => {
    try {
      if (form.id) { await updateIssue(form.id, { ...form, projectId }); toast.success('Issue updated'); }
      else         { await createIssue({ ...form, projectId }); toast.success('Issue logged'); }
      setModal(null);
    } catch { toast.error('Failed to save issue'); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await deleteIssue(deleting.id); toast.success('Deleted'); }
    catch { toast.error('Failed to delete'); }
    setDeleting(null);
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Total Issues', value: issues.length,                                       color: C.primary, bg: C.primaryBg, icon: '🔴' },
          { label: 'Open',         value: openCount,                                            color: openCount > 0 ? C.red : C.green, bg: openCount > 0 ? C.redBg : C.greenBg, icon: '⚠️' },
          { label: 'Resolved',     value: issues.filter(i => i.status === 'Resolved').length,  color: C.green, bg: C.greenBg, icon: '✅' },
        ].map(s => (
          <Card key={s.label} style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', ...STATUSES].map(v => (
            <button key={v} onClick={() => setFilterStatus(v)}
              style={{ fontFamily: 'Poppins, sans-serif', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 16, border: `1.5px solid ${filterStatus === v ? C.primary : C.border}`, background: filterStatus === v ? C.primaryBg : C.white, color: filterStatus === v ? C.primary : C.text2, cursor: 'pointer' }}>
              {v === 'all' ? 'All' : v}
            </button>
          ))}
        </div>
        <Btn onClick={() => setModal({})} small><Plus size={14} /> Log Issue</Btn>
      </div>

      {/* Table */}
      <Card>
        {isMobile ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {shown.map((issue) => {
              const ss = PROCESS_STATUS_STYLE[issue.status] ?? PROCESS_STATUS_STYLE['N/A'];
              return (
                <Card key={issue.id} style={{ padding: 10, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{issue.title}</div>
                      <div style={{ fontSize: 10, color: C.text2, marginTop: 4 }}>{fmtDate(issue.issueDate)} · {issue.reportedBy || '—'}</div>
                    </div>
                    <Badge bg={ss.bg} color={ss.color}>{issue.status}</Badge>
                  </div>
                  <div style={{ display: 'grid', gap: 6, marginTop: 8, fontSize: 10, color: C.text2 }}>
                    <div><strong style={{ color: C.text, fontWeight: 600 }}>Assigned</strong>: {issue.assignedTo || '—'}</div>
                    <div><strong style={{ color: C.text, fontWeight: 600 }}>Resolved</strong>: {issue.resolvedDate ? fmtDate(issue.resolvedDate) : '—'}</div>
                    <div><strong style={{ color: C.text, fontWeight: 600 }}>Description</strong>: {issue.description || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                    <button onClick={() => setModal(issue)} style={{ background: C.primaryBg, border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: C.primary, cursor: 'pointer', fontWeight: 600 }}><Pencil size={14} /></button>
                    <button onClick={() => setDeleting(issue)} style={{ background: C.redBg, border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: C.red, cursor: 'pointer', fontWeight: 600 }}><Trash2 size={14} /></button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {['Date', 'Title', 'Description', 'Reported By', 'Assigned To', 'Status', 'Resolved', ''].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((issue, i) => {
                const ss = PROCESS_STATUS_STYLE[issue.status] ?? PROCESS_STATUS_STYLE['N/A'];
                return (
                  <tr key={issue.id} style={{ background: i % 2 === 0 ? C.white : C.bg }}>
                    <td style={{ ...TD, fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(issue.issueDate)}</td>
                    <td style={{ ...TD, fontWeight: 600, minWidth: 120 }}>{issue.title}</td>
                    <td style={{ ...TD, color: C.text2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.description || '—'}</td>
                    <td style={{ ...TD, fontSize: 11 }}>{issue.reportedBy || '—'}</td>
                    <td style={{ ...TD, fontSize: 11 }}>{issue.assignedTo || '—'}</td>
                    <td style={TD}><span style={{ fontSize: 11, fontWeight: 600, color: ss.color, background: ss.bg, padding: '3px 10px', borderRadius: 20 }}>{issue.status}</span></td>
                    <td style={{ ...TD, fontSize: 11 }}>{issue.resolvedDate ? fmtDate(issue.resolvedDate) : '—'}</td>
                    <td style={TD}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => setModal(issue)} style={{ background: C.primaryBg, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.primary, cursor: 'pointer', fontWeight: 600 }}><Pencil size={11} /></button>
                        <button onClick={() => setDeleting(issue)} style={{ background: C.redBg, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.red, cursor: 'pointer', fontWeight: 600 }}><Trash2 size={11} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {shown.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>No issues.</div>}
      </Card>

      {modal !== null && <IssueModal data={modal} memberNames={memberNames} onClose={() => setModal(null)} onSave={handleSave} />}
      {deleting && <ConfirmModal message={`Delete issue "${deleting.title}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}

function IssueModal({ data, memberNames, onClose, onSave }: { data: Partial<Issue>; memberNames: string[]; onClose: () => void; onSave: (f: Partial<Issue>) => void }) {
  const [form, setForm] = useState<Partial<Issue>>({
    issueDate: todayISO(), title: '', description: '', reportedBy: '', assignedTo: '',
    status: 'Open', resolvedDate: '', notes: '',
    ...data,
  });
  const up = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const memberOptions = [{ value: '', label: '— Select —' }, ...memberNames.map(n => ({ value: n, label: n }))];
  return (
    <Modal title={form.id ? 'Edit Issue' : 'Log Issue'} onClose={onClose} width={560}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormRow label="Issue Date"><Input autoFocus type="date" value={form.issueDate ?? ''} onChange={v => up('issueDate', v)} /></FormRow>
        <FormRow label="Status"><Select value={form.status ?? 'Open'} onChange={v => up('status', v)} options={STATUSES.map(s => ({ value: s, label: s }))} /></FormRow>
      </div>
      <FormRow label="Title" required><Input value={form.title ?? ''} onChange={v => up('title', v)} placeholder="Short issue description" /></FormRow>
      <FormRow label="Description"><Textarea value={form.description ?? ''} onChange={v => up('description', v)} rows={2} placeholder="Detailed description…" /></FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormRow label="Reported By"><Select value={form.reportedBy ?? ''} onChange={v => up('reportedBy', v)} options={memberOptions} /></FormRow>
        <FormRow label="Assigned To"><Select value={form.assignedTo ?? ''} onChange={v => up('assignedTo', v)} options={memberOptions} /></FormRow>
      </div>
      <FormRow label="Resolved Date"><Input type="date" value={form.resolvedDate ?? ''} onChange={v => up('resolvedDate', v)} /></FormRow>
      <FormRow label="Notes"><Textarea value={form.notes ?? ''} onChange={v => up('notes', v)} rows={2} placeholder="Additional notes…" /></FormRow>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => { if (!form.title?.trim()) return; onSave(form); }}>Save</Btn>
      </div>
    </Modal>
  );
}
