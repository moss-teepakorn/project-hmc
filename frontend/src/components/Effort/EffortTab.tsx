import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { Card, Btn, Modal, FormRow, Input, ConfirmModal, ProgressBar, C, TH, TD } from '../Common';
import { fmtMoney, fmtMonth } from '../../utils';
import type { Effort } from '../../types';
import { format, addMonths, subMonths } from 'date-fns';

interface Props { projectId: string; }

export default function EffortTab({ projectId }: Props) {
  const { efforts, fetchEfforts, createEffort, updateEffort, updateEffortMonthly, deleteEffort } = useStore();
  const [modal, setModal]       = useState<Partial<Effort> | null>(null);
  const [deleting, setDeleting] = useState<Effort | null>(null);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;

  useEffect(() => { fetchEfforts(projectId); }, [projectId]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Build month columns: from 3 months before earliest entry to 3 months ahead
  const getMonths = (): string[] => {
    const allMonths = new Set<string>();
    efforts.forEach(e => Object.keys(e.monthly || {}).forEach(m => allMonths.add(m)));
    const sorted = [...allMonths].sort();
    if (sorted.length === 0) {
      // Default: current -2 to +3
      const now = new Date();
      return Array.from({ length: 6 }, (_, i) => format(addMonths(subMonths(now, 2), i), 'yyyy-MM'));
    }
    // Extend range ±1 month
    const first = format(subMonths(new Date(sorted[0] + '-01'), 0), 'yyyy-MM');
    const last  = format(addMonths(new Date(sorted[sorted.length - 1] + '-01'), 1), 'yyyy-MM');
    const result: string[] = [];
    let cur = new Date(first + '-01');
    const end = new Date(last + '-01');
    while (cur <= end) {
      result.push(format(cur, 'yyyy-MM'));
      cur = addMonths(cur, 1);
    }
    return result;
  };

  const months = getMonths();

  // Totals
  const tBudAmt  = efforts.reduce((s, e) => s + e.budgetAmount, 0);
  const tBudMD   = efforts.reduce((s, e) => s + e.budgetManday, 0);
  const tUsedMD  = efforts.reduce((s, e) => s + Object.values(e.monthly || {}).reduce((a, v) => a + v, 0), 0);
  const tRem     = tBudMD - tUsedMD;
  const pct      = tBudMD > 0 ? Math.round((tUsedMD / tBudMD) * 100) : 0;

  const handleSave = async (form: Partial<Effort>) => {
    try {
      if (form.id) { await updateEffort(form.id, form); toast.success('Module updated'); }
      else         { await createEffort({ ...form, projectId }); toast.success('Module added'); }
      setModal(null);
    } catch { toast.error('Failed to save'); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await deleteEffort(deleting.id); toast.success('Deleted'); }
    catch { toast.error('Failed to delete'); }
    setDeleting(null);
  };

  // Debounced monthly update
  const handleMonthly = useCallback((id: string, month: string, val: string) => {
    const manday = Number(val) || 0;
    updateEffortMonthly(id, month, manday);
  }, [updateEffortMonthly]);

  return (
    <div style={{ padding: 24 }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Budget Amount', value: `฿${fmtMoney(tBudAmt)}`, color: C.primary, bg: C.primaryBg,                 icon: '💼' },
          { label: 'Budget Manday', value: `${tBudMD} MD`,            color: C.blue,    bg: C.blueBg,                    icon: '📅' },
          { label: 'Used Manday',   value: `${tUsedMD} MD`,           color: C.amber,   bg: C.amberBg,                   icon: '⚡' },
          { label: 'Remaining',     value: `${tRem} MD`,              color: tRem < 0 ? C.red : C.green, bg: tRem < 0 ? C.redBg : C.greenBg, icon: tRem < 0 ? '⚠️' : '✅' },
        ].map(s => (
          <Card key={s.label} style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 20, marginBottom: 5 }}>{s.icon}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Utilization bar */}
      <Card style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Manday Utilization</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: pct > 90 ? C.red : pct > 70 ? C.amber : C.primary }}>
            {pct}% — {tUsedMD} / {tBudMD} MD
          </span>
        </div>
        <ProgressBar value={pct} color={pct > 90 ? C.red : pct > 70 ? C.amber : C.primary} height={10} />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 0 }}>
        <Btn onClick={() => setModal({})} small style={{ width: isMobile ? '100%' : 'auto' }}><Plus size={14} /> Add Module</Btn>
      </div>

      {/* Effort grid */}
      {isMobile ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {efforts.length > 0 ? efforts.map((e, i) => {
            const used = Object.values(e.monthly || {}).reduce((s, v) => s + v, 0);
            const rem  = e.budgetManday - used;
            return (
              <Card key={e.id} style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{e.module}</div>
                    <div style={{ fontSize: 12, color: C.text2 }}>{e.budgetManday} MD • ฿{fmtMoney(e.budgetAmount)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setModal(e)} style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: C.primaryBg, border: 'none', borderRadius: 8, color: C.primary, cursor: 'pointer' }}>
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => setDeleting(e)} style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: C.redBg, border: 'none', borderRadius: 8, color: C.red, cursor: 'pointer' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div style={{ background: C.bg2, borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 11, color: C.text2, marginBottom: 4 }}>Used MD</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>{used}</div>
                  </div>
                  <div style={{ background: C.bg2, borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 11, color: C.text2, marginBottom: 4 }}>Remaining</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: rem < 0 ? C.red : C.green }}>{rem}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
                  {months.map(mo => (
                    <div key={mo} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, minHeight: 72 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.text2, marginBottom: 6 }}>{fmtMonth(mo)}</div>
                      <input
                        type="number" min={0}
                        value={(e.monthly || {})[mo] || ''}
                        onChange={ev => handleMonthly(e.id, mo, ev.target.value)}
                        placeholder="—"
                        style={{ width: '100%', textAlign: 'center', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 6px', fontFamily: 'Poppins, sans-serif', fontSize: 12, color: C.text, background: ((e.monthly || {})[mo] > 0) ? C.amberBg : C.white, outline: 'none' }}
                        onFocus={ev => ev.target.style.borderColor = C.primary}
                        onBlur={ev  => ev.target.style.borderColor = C.border}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            );
          }) : (
            <Card style={{ padding: 24, textAlign: 'center', color: C.text3 }}>
              No modules yet. Click <strong>Add Module</strong> to start tracking effort.
            </Card>
          )}
        </div>
      ) : (
        <Card style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <th style={{ ...TH, minWidth: 160 }}>Module</th>
                <th style={{ ...TH, minWidth: 110 }}>Budget (฿)</th>
                <th style={{ ...TH, textAlign: 'center', minWidth: 80 }}>Budget MD</th>
                {months.map(mo => (
                  <th key={mo} style={{ ...TH, background: C.primaryBg, color: C.primary, textAlign: 'center', minWidth: 72 }}>
                    {fmtMonth(mo)}
                  </th>
                ))}
                <th style={{ ...TH, background: '#FFFBEB', color: C.amber, textAlign: 'center', minWidth: 80 }}>Used MD</th>
                <th style={{ ...TH, background: '#F0FDF4', color: C.green, textAlign: 'center', minWidth: 90 }}>Remaining</th>
                <th style={{ ...TH, minWidth: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {efforts.map((e, i) => {
                const used = Object.values(e.monthly || {}).reduce((s, v) => s + v, 0);
                const rem  = e.budgetManday - used;
                return (
                  <tr key={e.id} style={{ background: i % 2 === 0 ? C.white : C.bg }}>
                    <td style={{ ...TD, fontWeight: 600 }}>{e.module}</td>
                    <td style={{ ...TD, fontFamily: 'Poppins, sans-serif', color: C.primary, fontWeight: 600 }}>฿{fmtMoney(e.budgetAmount)}</td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: C.blue }}>{e.budgetManday}</td>
                    {months.map(mo => (
                      <td key={mo} style={{ ...TD, textAlign: 'center', padding: '6px 6px' }}>
                        <input
                          type="number" min={0}
                          value={(e.monthly || {})[mo] || ''}
                          onChange={ev => handleMonthly(e.id, mo, ev.target.value)}
                          placeholder="—"
                          style={{
                            width: 54, textAlign: 'center', border: `1px solid ${C.border}`, borderRadius: 6,
                            padding: '4px 4px', fontFamily: 'Poppins, sans-serif', fontSize: 12, color: C.text,
                            background: ((e.monthly || {})[mo] > 0) ? C.amberBg : C.white, outline: 'none',
                          }}
                          onFocus={ev => ev.target.style.borderColor = C.primary}
                          onBlur={ev  => ev.target.style.borderColor = C.border}
                        />
                      </td>
                    ))}
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: C.amber, background: '#FFFBEB' }}>{used}</td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: rem < 0 ? C.red : C.green, background: rem < 0 ? '#FFF1F2' : '#F0FDF4' }}>{rem}</td>
                    <td style={TD}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => setModal(e)} style={{ background: C.primaryBg, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.primary, cursor: 'pointer', fontWeight: 600 }}>
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => setDeleting(e)} style={{ background: C.redBg, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.red, cursor: 'pointer', fontWeight: 600 }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {efforts.length > 0 && (
                <tr style={{ background: C.bg2, borderTop: `2px solid ${C.border2}` }}>
                  <td style={{ ...TD, fontWeight: 800 }}>TOTAL</td>
                  <td style={{ ...TD, fontFamily: 'Poppins, sans-serif', fontWeight: 700, color: C.primary }}>฿{fmtMoney(tBudAmt)}</td>
                  <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: C.blue }}>{tBudMD}</td>
                  {months.map(mo => {
                    const sum = efforts.reduce((s, e) => s + ((e.monthly || {})[mo] || 0), 0);
                    return (
                      <td key={mo} style={{ ...TD, textAlign: 'center', fontWeight: 700, color: sum > 0 ? C.amber : C.text3 }}>
                        {sum || '—'}
                      </td>
                    );
                  })}
                  <td style={{ ...TD, textAlign: 'center', fontWeight: 800, color: C.amber }}>{tUsedMD}</td>
                  <td style={{ ...TD, textAlign: 'center', fontWeight: 800, color: tRem < 0 ? C.red : C.green }}>{tRem}</td>
                  <td style={TD} />
                </tr>
              )}
            </tbody>
          </table>
          {efforts.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>
              No modules yet. Click <strong>"Add Module"</strong> to start tracking effort.
            </div>
          )}
        </Card>
      )}

      {modal !== null && <EffortModal data={modal} isMobile={isMobile} onClose={() => setModal(null)} onSave={handleSave} />}
      {deleting && <ConfirmModal message={`Delete module "${deleting.module}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>

  );
}

// ── Effort Modal ──────────────────────────────────────────────────────────────
function EffortModal({ data, isMobile, onClose, onSave }: { data: Partial<Effort>; isMobile: boolean; onClose: () => void; onSave: (f: Partial<Effort>) => void }) {
  const [form, setForm] = useState<Partial<Effort>>({ module: '', budgetAmount: 0, budgetManday: 0, ...data });
  const up = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Modal title={form.id ? 'Edit Module' : 'Add Module'} onClose={onClose} width={440}>
      <FormRow label="Module Name" required>
        <Input autoFocus value={form.module ?? ''} onChange={v => up('module', v)} placeholder="e.g. Frontend Development" />
      </FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <FormRow label="Budget Manday">
          <Input type="number" value={form.budgetManday ?? 0} onChange={v => {
              const md = Number(v) || 0;
              setForm(p => ({ ...p, budgetManday: md, budgetAmount: md * 15000 }));
            }} />
        </FormRow>
        <FormRow label="Budget Amount (฿)">
          <Input type="number" value={form.budgetAmount ?? 0} onChange={v => up('budgetAmount', Number(v))} />
        </FormRow>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => { if (!form.module?.trim()) return; onSave(form); }}>Save</Btn>
      </div>
    </Modal>
  );
}
