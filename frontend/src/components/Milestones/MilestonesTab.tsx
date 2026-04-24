import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { Card, Btn, Badge, Modal, FormRow, Input, Select, Textarea, ConfirmModal, ProgressBar, C, TH, TD, MILESTONE_STATUS } from '../Common';
import { fmtDate, fmtMoney, isoToDmy, dmyToIso } from '../../utils';
import type { Milestone } from '../../types';

const PHASES = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5'];

interface Props { projectId: string; }

export default function MilestonesTab({ projectId }: Props) {
  const { milestones, fetchMilestones, createMilestone, updateMilestone, deleteMilestone } = useStore();
  const [modal, setModal]       = useState<Partial<Milestone> | null>(null);
  const [deleting, setDeleting] = useState<Milestone | null>(null);

  useEffect(() => { fetchMilestones(projectId); }, [projectId]);

  const total  = milestones.reduce((s, m) => s + m.amount, 0);
  const paid   = milestones.filter(m => m.status === 'paid').reduce((s, m) => s + m.amount, 0);
  const billed = milestones.filter(m => m.status === 'billed').reduce((s, m) => s + m.amount, 0);
  const phaseBudgetByPhase = milestones.reduce((acc, m) => {
    if (m.phase && m.phaseAmount > 0 && !acc[m.phase]) acc[m.phase] = m.phaseAmount;
    return acc;
  }, {} as Record<string, number>);
  // Order phases by Phase 1..5 then any custom
  const phases = PHASES.filter(p => milestones.some(m => m.phase === p))
    .concat([...new Set(milestones.map(m => m.phase))].filter(p => !PHASES.includes(p)));

  const handleSave = async (form: Partial<Milestone>) => {
    try {
      if (form.id) { await updateMilestone(form.id, { ...form, projectId }); toast.success('Milestone updated'); }
      else         { await createMilestone({ ...form, projectId }); toast.success('Milestone added'); }
      setModal(null);
    } catch { toast.error('Failed to save milestone'); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await deleteMilestone(deleting.id); toast.success('Deleted'); }
    catch { toast.error('Failed to delete'); }
    setDeleting(null);
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Total Contract', value: `฿${fmtMoney(total)}`,             color: C.primary, bg: C.primaryBg, icon: '💰' },
          { label: 'Paid',           value: `฿${fmtMoney(paid)}`,              color: C.green,   bg: C.greenBg,   icon: '✅' },
          { label: 'Billed',         value: `฿${fmtMoney(billed)}`,            color: C.blue,    bg: C.blueBg,    icon: '📄' },
          { label: 'Remaining',      value: `฿${fmtMoney(total-paid-billed)}`, color: C.amber,   bg: C.amberBg,   icon: '⏳' },
        ].map(s => (
          <Card key={s.label} style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 20, marginBottom: 5 }}>{s.icon}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Payment progress */}
      <Card style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
          <span style={{ fontWeight: 600, color: C.text }}>Payment Progress</span>
          <span style={{ color: C.text2 }}>{total > 0 ? Math.round((paid / total) * 100) : 0}% Collected</span>
        </div>
        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: C.bg2 }}>
          <div style={{ width: `${total > 0 ? (paid   / total) * 100 : 0}%`, background: C.green, transition: 'width 0.4s' }} />
          <div style={{ width: `${total > 0 ? (billed / total) * 100 : 0}%`, background: C.blue,  transition: 'width 0.4s' }} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
          {[{ c: C.green, l: 'Paid' }, { c: C.blue, l: 'Billed' }, { c: C.bg2, l: 'Pending' }].map(x => (
            <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: x.c, border: `1px solid ${C.border}` }} />
              <span style={{ color: C.text2 }}>{x.l}</span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Btn onClick={() => setModal({})} small><Plus size={14} /> Add Milestone</Btn>
      </div>

      {milestones.length === 0 && (
        <Card style={{ padding: 40, textAlign: 'center', color: C.text3 }}>No milestones yet.</Card>
      )}

      {phases.map(phase => {
        const pms    = milestones.filter(m => m.phase === phase);
        const pTotal = pms.reduce((s, m) => s + m.amount, 0);
        return (
          <div key={phase} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{phase}</span>
              <div style={{ height: 1, flex: 1, background: C.border, minWidth: 80 }} />
              <span style={{ fontSize: 12, color: C.text2 }}>Budget ฿{fmtMoney(phaseBudgetByPhase[phase] ?? 0)}</span>
              <span style={{ fontSize: 12, color: C.text2 }}>Milestone Total ฿{fmtMoney(pTotal)}</span>
            </div>
            <Card>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '6%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {['Milestone', '% Value', 'Amount (฿)', 'Due Date', 'Billing Date', 'Status', 'Notes', ''].map(h => (
                      <th key={h} style={{ ...TH, padding: '10px 12px', fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pms.map((ms, i) => {
                    const ss = MILESTONE_STATUS[ms.status] ?? MILESTONE_STATUS.pending;
                    return (
                      <tr key={ms.id} style={{ background: i % 2 === 0 ? C.white : C.bg }}>
                        <td style={{ ...TD, fontWeight: 600 }}>{ms.name}</td>
                        <td style={{ ...TD, fontWeight: 700, color: C.primary }}>{ms.percent}%</td>
                        <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600 }}>{fmtMoney(ms.amount)}</td>
                        <td style={{ ...TD, color: C.text2 }}>{fmtDate(ms.dueDate)}</td>
                        <td style={{ ...TD, color: C.text2 }}>{fmtDate(ms.billingDate)}</td>
                        <td style={TD}><Badge bg={ss.bg} color={ss.color}>{ss.label}</Badge></td>
                        <td style={{ ...TD, color: C.text3, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ms.notes || '—'}</td>
                        <td style={TD}>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button onClick={() => setModal(ms)} style={{ background: C.primaryBg, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.primary, cursor: 'pointer', fontWeight: 600 }}>
                              <Pencil size={11} />
                            </button>
                            <button onClick={() => setDeleting(ms)} style={{ background: C.redBg, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.red, cursor: 'pointer', fontWeight: 600 }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        );
      })}

      {modal !== null && <MilestoneModal data={modal} phaseBudgetByPhase={phaseBudgetByPhase} onClose={() => setModal(null)} onSave={handleSave} />}
      {deleting && <ConfirmModal message={`Delete milestone "${deleting.name}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}

function MilestoneModal({ data, phaseBudgetByPhase, onClose, onSave }: { data: Partial<Milestone>; phaseBudgetByPhase: Record<string, number>; onClose: () => void; onSave: (f: Partial<Milestone>) => void }) {
  const [form, setForm] = useState<Partial<Milestone>>({ phase: 'Phase 1', name: '', percent: 0, amount: 0, phaseAmount: 0, dueDate: '', billingDate: '', notes: '', status: 'pending', ...data });
  const up = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const phaseKey = form.phase || '';
    if (phaseKey && !form.phaseAmount && phaseBudgetByPhase[phaseKey]) {
      setForm(p => ({ ...p, phaseAmount: phaseBudgetByPhase[phaseKey] }));
    }
  }, [form.phase, phaseBudgetByPhase]);

  useEffect(() => {
    if (typeof form.percent === 'number' && form.phaseAmount && form.phaseAmount > 0) {
      setForm(p => ({ ...p, amount: Math.round((Number(p.phaseAmount) * Number(p.percent)) / 100) }));
    }
  }, [form.percent, form.phaseAmount]);

  const save = () => {
    try {
      const payload: Partial<Milestone> = {
        ...form,
        percent: Number(form.percent ?? 0),
        amount: Number(form.amount ?? 0),
        phaseAmount: Number(form.phaseAmount ?? 0),
      };
      if (!payload.name?.trim() || !payload.phase?.trim()) {
        toast.error('Please enter phase and milestone name');
        return;
      }
      onSave(payload);
    } catch (err: any) {
      toast.error(err?.message || 'Invalid input');
    }
  };

  return (
    <Modal title={form.id ? 'Edit Milestone' : 'Add Milestone'} onClose={onClose} width={560}>
      <FormRow label="Phase" required>
        <Select value={form.phase ?? 'Phase 1'} onChange={v => {
            const budget = phaseBudgetByPhase[v] ?? 0;
            setForm(p => ({ ...p, phase: v, phaseAmount: budget || p.phaseAmount }));
          }}
          options={PHASES.map(p => ({ value: p, label: p }))} />
      </FormRow>
      <FormRow label="Milestone Name" required>
        <Input autoFocus value={form.name ?? ''} onChange={v => up('name', v)} placeholder="e.g. Project Kickoff" />
      </FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormRow label="Phase Budget (฿)">
          <Input type="number" value={form.phaseAmount ?? 0} onChange={v => up('phaseAmount', Number(v))} placeholder="Total phase budget" />
        </FormRow>
        <FormRow label="% Value">
          <Input type="number" value={form.percent ?? 0} onChange={v => up('percent', Number(v))} placeholder="Percent" />
        </FormRow>
        <FormRow label="Amount (฿)">
          <Input type="number" value={form.amount ?? 0} onChange={v => up('amount', Number(v))} placeholder="Auto from phase budget" />
        </FormRow>
      </div>
      <FormRow label="Status">
        <Select value={form.status ?? 'pending'} onChange={v => up('status', v)}
          options={[{ value: 'pending', label: 'Pending' }, { value: 'billed', label: 'Billed' }, { value: 'paid', label: 'Paid' }]} />
      </FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormRow label="Due Date">
          <Input type="date" value={form.dueDate ?? ''} onChange={v => up('dueDate', v)} placeholder="dd/mm/yyyy" />
        </FormRow>
        <FormRow label="Billing Date">
          <Input type="date" value={form.billingDate ?? ''} onChange={v => up('billingDate', v)} placeholder="dd/mm/yyyy" />
        </FormRow>
      </div>
      <FormRow label="Notes">
        <Textarea value={form.notes ?? ''} onChange={v => up('notes', v)} rows={2} placeholder="Additional notes…" />
      </FormRow>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Save</Btn>
      </div>
    </Modal>
  );
}
