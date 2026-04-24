import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { Card, Btn, Badge, Modal, FormRow, Input, Select, Textarea, ConfirmModal, C, TH, TD } from '../Common';
import { fmtDate, RISK_LEVEL_COLOR, todayISO } from '../../utils';
import type { Risk } from '../../types';

const RISK_STATUSES = ['Monitoring', 'Mitigating', 'Closed'] as const;
const LEVELS        = ['Low', 'Medium', 'High'] as const;

interface Props { projectId: string; }

export default function RiskRegisterTab({ projectId }: Props) {
  const { risks, members, fetchRisks, fetchMembers, createRisk, updateRisk, deleteRisk } = useStore();
  const [modal, setModal]       = useState<Partial<Risk> | null>(null);
  const [deleting, setDeleting] = useState<Risk | null>(null);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    fetchRisks(projectId);
    fetchMembers(projectId);
  }, [projectId]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const memberOptions = [{ value: '', label: '— Select —' }, ...members.map(m => ({ value: m.name, label: m.name }))];

  const openRisks = risks.filter(r => r.status === 'Monitoring').length;
  const highRisks = risks.filter(r => r.impact === 'High' || r.probability === 'High').length;

  const handleSave = async (form: Partial<Risk>) => {
    try {
      if (form.id) { await updateRisk(form.id, { ...form, projectId }); toast.success('Risk updated'); }
      else         { await createRisk({ ...form, projectId }); toast.success('Risk added'); }
      setModal(null);
    } catch { toast.error('Failed to save risk'); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await deleteRisk(deleting.id); toast.success('Deleted'); }
    catch { toast.error('Failed to delete'); }
    setDeleting(null);
  };

  const riskScore = (r: Risk): 'Low' | 'Medium' | 'High' => {
    const score = ['Low','Medium','High'].indexOf(r.probability) + ['Low','Medium','High'].indexOf(r.impact);
    return score >= 3 ? 'High' : score >= 1 ? 'Medium' : 'Low';
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Total Risks', value: risks.length,   color: C.primary, bg: C.primaryBg, icon: '🎯' },
          { label: 'Open',        value: openRisks,      color: openRisks > 0 ? C.red : C.green, bg: openRisks > 0 ? C.redBg : C.greenBg, icon: '🔓' },
          { label: 'High Impact', value: highRisks,      color: highRisks > 0 ? C.red : C.green, bg: highRisks > 0 ? C.redBg : C.greenBg, icon: '⚡' },
        ].map(s => (
          <Card key={s.label} style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Btn onClick={() => setModal({})} small><Plus size={14} /> Add Risk</Btn>
      </div>

      <Card>
        {isMobile ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {risks.map((risk) => {
              const score = riskScore(risk);
              return (
                <Card key={risk.id} style={{ padding: 10, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0, flex: '1 1 140px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{risk.title}</div>
                      <div style={{ fontSize: 10, color: C.text2, marginTop: 4 }}>{fmtDate(risk.riskDate)} · {risk.owner || 'No owner'}</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 90 }}>
                      <Badge bg={RISK_LEVEL_COLOR[score] + '18'} color={RISK_LEVEL_COLOR[score]}>{score}</Badge>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, marginTop: 10, fontSize: 10, color: C.text2 }}>
                    <div><strong style={{ color: C.text, fontWeight: 600 }}>Probability:</strong> <span style={{ color: RISK_LEVEL_COLOR[risk.probability] || C.text2 }}>{risk.probability}</span></div>
                    <div><strong style={{ color: C.text, fontWeight: 600 }}>Impact:</strong> <span style={{ color: RISK_LEVEL_COLOR[risk.impact] || C.text2 }}>{risk.impact}</span></div>
                    <div><strong style={{ color: C.text, fontWeight: 600 }}>Status:</strong> {risk.status}</div>
                    <div><strong style={{ color: C.text, fontWeight: 600 }}>Mitigation:</strong> {risk.mitigation || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                    <button onClick={() => setModal(risk)} style={{ background: C.primaryBg, border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: C.primary, cursor: 'pointer', fontWeight: 600 }}><Pencil size={14} /></button>
                    <button onClick={() => setDeleting(risk)} style={{ background: C.redBg, border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: C.red, cursor: 'pointer', fontWeight: 600 }}><Trash2 size={14} /></button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {['Date', 'Title', 'Probability', 'Impact', 'Score', 'Owner', 'Status', 'Mitigation', ''].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {risks.map((risk, i) => {
                const score = riskScore(risk);
                return (
                  <tr key={risk.id} style={{ background: i % 2 === 0 ? C.white : C.bg }}>
                    <td style={{ ...TD, fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(risk.riskDate)}</td>
                    <td style={{ ...TD, fontWeight: 600, minWidth: 120 }}>{risk.title}</td>
                    <td style={{ ...TD }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: RISK_LEVEL_COLOR[risk.probability] || C.text2 }}>{risk.probability}</span>
                    </td>
                    <td style={{ ...TD }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: RISK_LEVEL_COLOR[risk.impact] || C.text2 }}>{risk.impact}</span>
                    </td>
                    <td style={{ ...TD }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: RISK_LEVEL_COLOR[score], background: RISK_LEVEL_COLOR[score] + '18', padding: '2px 8px', borderRadius: 12 }}>{score}</span>
                    </td>
                    <td style={{ ...TD, fontSize: 11 }}>{risk.owner || '—'}</td>
                    <td style={{ ...TD }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: risk.status === 'Monitoring' ? C.red : risk.status === 'Mitigating' ? C.amber : C.green, background: (risk.status === 'Monitoring' ? C.red : risk.status === 'Mitigating' ? C.amber : C.green) + '18', padding: '2px 8px', borderRadius: 12 }}>
                        {risk.status}
                      </span>
                    </td>
                    <td style={{ ...TD, color: C.text2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{risk.mitigation || '—'}</td>
                    <td style={TD}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => setModal(risk)} style={{ background: C.primaryBg, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.primary, cursor: 'pointer', fontWeight: 600 }}><Pencil size={11} /></button>
                        <button onClick={() => setDeleting(risk)} style={{ background: C.redBg, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.red, cursor: 'pointer', fontWeight: 600 }}><Trash2 size={11} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {risks.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>No risks registered.</div>}
      </Card>

      {modal !== null && (
        <Modal title={modal.id ? 'Edit Risk' : 'Add Risk'} onClose={() => setModal(null)} width={560}>
          <RiskForm data={modal} memberOptions={memberOptions} onClose={() => setModal(null)} onSave={handleSave} />
        </Modal>
      )}
      {deleting && <ConfirmModal message={`Delete risk "${deleting.title}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}

function RiskForm({ data, memberOptions, onClose, onSave }: { data: Partial<Risk>; memberOptions: {value:string;label:string}[]; onClose: () => void; onSave: (f: Partial<Risk>) => void }) {
  const [form, setForm] = useState<Partial<Risk>>({
    riskDate: todayISO(), title: '', description: '', probability: 'Medium', impact: 'Medium',
    mitigation: '', owner: '', status: 'Monitoring',
    ...data,
  });
  const up = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormRow label="Date"><Input autoFocus type="date" value={form.riskDate ?? ''} onChange={v => up('riskDate', v)} /></FormRow>
        <FormRow label="Status"><Select value={form.status ?? 'Monitoring'} onChange={v => up('status', v)} options={RISK_STATUSES.map(s => ({ value: s, label: s }))} /></FormRow>
      </div>
      <FormRow label="Title" required><Input value={form.title ?? ''} onChange={v => up('title', v)} placeholder="Risk description" /></FormRow>
      <FormRow label="Description"><Textarea value={form.description ?? ''} onChange={v => up('description', v)} rows={2} /></FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormRow label="Probability"><Select value={form.probability ?? 'Medium'} onChange={v => up('probability', v)} options={LEVELS.map(l => ({ value: l, label: l }))} /></FormRow>
        <FormRow label="Impact"><Select value={form.impact ?? 'Medium'} onChange={v => up('impact', v)} options={LEVELS.map(l => ({ value: l, label: l }))} /></FormRow>
        <FormRow label="Owner"><>
          <Input value={form.owner ?? ''} onChange={v => up('owner', v)} placeholder="Owner name" list="risk-owner-options" />
          <datalist id="risk-owner-options">
            {memberOptions.map(option => <option key={option.value} value={option.label} />)}
          </datalist>
        </></FormRow>
      </div>
      <FormRow label="Mitigation Plan"><Textarea value={form.mitigation ?? ''} onChange={v => up('mitigation', v)} rows={4} placeholder="How to mitigate this risk…" /></FormRow>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => { if (!form.title?.trim()) return; onSave(form); }}>Save</Btn>
      </div>
    </>
  );
}
