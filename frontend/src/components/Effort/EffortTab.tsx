import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { Card, Btn, Modal, FormRow, Input, Select, ConfirmModal, ProgressBar, C, TH, TD } from '../Common';
import { fmtMoney, fmtMonth } from '../../utils';
import type { Effort } from '../../types';
import { format, addMonths, subMonths } from 'date-fns';

interface Props { projectId: string; }
const PHASE_OPTIONS = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5'];

export default function EffortTab({ projectId }: Props) {
  const { efforts, tasks, masterCodes, fetchEfforts, fetchTasks, createEffort, updateEffort, updateEffortMonthly, deleteEffort } = useStore();
  const [modal, setModal]       = useState<Partial<Effort> | null>(null);
  const [phaseSummaryOpen, setPhaseSummaryOpen] = useState(false);
  const [deleting, setDeleting] = useState<Effort | null>(null);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    fetchEfforts(projectId);
    fetchTasks(projectId);
  }, [projectId]);

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

  const phaseOptions = PHASE_OPTIONS.map((phase) => ({ value: phase, label: phase }));

  const phaseKey = (phase?: string) => (phase && PHASE_OPTIONS.includes(phase) ? phase : 'Phase 1');

  // Phase Summary Modal: group level-0 tasks by raw phase name, sum effortManday
  const taskPhaseGroups = useMemo(() => {
    const map: Record<string, number> = {};
    tasks.filter((t) => t.projectId === projectId && Number(t.level || 0) === 0).forEach((t) => {
      const phase = (t.phase || '').trim();
      if (!phase) return;
      map[phase] = (map[phase] || 0) + Number(t.effortManday || 0);
    });
    return map;
  }, [tasks, projectId]);

  const phaseSummaryRows = useMemo(() => {
    const taskPhaseCodes = masterCodes
      .filter((code) => code.codeType === 'task_phase')
      .sort((a, b) => a.codeKey.localeCompare(b.codeKey));

    const rankByPhase = new Map<string, number>();
    taskPhaseCodes.forEach((code, i) => {
      const codeValue = (code.codeValue || '').trim();
      const label = (code.label || '').trim();
      const codeKey = (code.codeKey || '').trim();
      if (codeValue) rankByPhase.set(codeValue, i);
      if (label && !rankByPhase.has(label)) rankByPhase.set(label, i);
      if (codeKey && !rankByPhase.has(codeKey)) rankByPhase.set(codeKey, i);
    });

    return Object.entries(taskPhaseGroups)
      .filter(([, md]) => md >= 0)
      .sort(([phaseA], [phaseB]) => {
        const rankA = rankByPhase.get(phaseA);
        const rankB = rankByPhase.get(phaseB);
        if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
        if (rankA !== undefined) return -1;
        if (rankB !== undefined) return 1;
        return phaseA.localeCompare(phaseB);
      });
  }, [taskPhaseGroups, masterCodes]);

  // Phases and totals from Efforts table only
  const phases = useMemo(() => {
    return PHASE_OPTIONS.filter((phase) => efforts.some((e) => phaseKey(e.phase) === phase));
  }, [efforts.length, efforts.map((e) => phaseKey(e.phase)).join('|')]);

  const phaseTotals = phases.reduce((acc, phase) => {
    const list = efforts.filter((e) => phaseKey(e.phase) === phase);
    const budgetManday = list.reduce((s, e) => s + (e.budgetManday || 0), 0);
    const usedManday = list.reduce((s, e) => s + Object.values(e.monthly || {}).reduce((a, v) => a + v, 0), 0);
    acc[phase] = {
      budgetAmount: list.reduce((s, e) => s + e.budgetAmount, 0),
      budgetManday,
      usedManday,
      remaining: budgetManday - usedManday,
    };
    return acc;
  }, {} as Record<string, { budgetAmount: number; budgetManday: number; usedManday: number; remaining: number }>);

  // Totals — all from Efforts table
  const tBudAmt  = efforts.reduce((s, e) => s + e.budgetAmount, 0);
  const tBudMD   = efforts.reduce((s, e) => s + (e.budgetManday || 0), 0);
  const tUsedMD  = efforts.reduce((s, e) => s + Object.values(e.monthly || {}).reduce((a, v) => a + v, 0), 0);
  const tRem     = tBudMD - tUsedMD;
  const pct      = tBudMD > 0 ? Math.round((tUsedMD / tBudMD) * 100) : 0;

  const handleSave = async (form: Partial<Effort>) => {
    try {
      if (form.id) { await updateEffort(form.id, form); toast.success('Task updated'); }
      else         { await createEffort({ ...form, projectId }); toast.success('Task added'); }
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
        <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
          <Btn variant="ghost" onClick={() => setPhaseSummaryOpen(true)} small style={{ width: isMobile ? '100%' : 'auto' }}>Phase Summary</Btn>
          <Btn onClick={() => setModal({})} small style={{ width: isMobile ? '100%' : 'auto' }}><Plus size={14} /> Add Task</Btn>
        </div>
      </div>

      {/* Effort grid */}
      {efforts.length === 0 ? (
        <Card style={{ padding: 40, textAlign: 'center', color: C.text3 }}>
          No tasks yet. Click <strong>Add Task</strong> to start tracking effort.
        </Card>
      ) : (
        phases.map((phase) => {
          const phaseEfforts = efforts.filter((e) => phaseKey(e.phase) === phase);
          const totals = phaseTotals[phase];
          return (
            <div key={phase} style={{ marginBottom: isMobile ? 18 : 24 }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{phase}</div>
                  <div style={{ fontSize: 12, color: C.text2 }}>
                    Budget {totals.budgetManday} MD • Used {totals.usedManday} MD • Remaining {totals.remaining} MD
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: C.text2 }}>฿{fmtMoney(totals.budgetAmount)}</div>
                  <div style={{ fontSize: 12, color: C.text2 }}>{phaseEfforts.length} tasks</div>
                </div>
              </div>
              {isMobile ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {phaseEfforts.map((e) => {
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
                  })}
                </div>
              ) : (
                <Card style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 800 }}>
                    <colgroup>
                      <col style={{ width: 160 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 80 }} />
                      {months.map(mo => <col key={mo} style={{ width: 72 }} />)}
                      <col style={{ width: 80 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 80 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: C.bg }}>
                        <th style={{ ...TH }}>Task</th>
                        <th style={{ ...TH }}>Budget (฿)</th>
                        <th style={{ ...TH, textAlign: 'center' }}>Budget MD</th>
                        {months.map(mo => (
                          <th key={mo} style={{ ...TH, background: C.primaryBg, color: C.primary, textAlign: 'center' }}>
                            {fmtMonth(mo)}
                          </th>
                        ))}
                        <th style={{ ...TH, background: '#FFFBEB', color: C.amber, textAlign: 'center' }}>Used MD</th>
                        <th style={{ ...TH, background: '#F0FDF4', color: C.green, textAlign: 'center' }}>Remaining</th>
                        <th style={{ ...TH }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {phaseEfforts.map((e, i) => {
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

                      {phaseEfforts.length > 0 && (
                        <tr style={{ background: C.bg2, borderTop: `2px solid ${C.border2}` }}>
                          <td style={{ ...TD, fontWeight: 800 }}>TOTAL</td>
                          <td style={{ ...TD, fontFamily: 'Poppins, sans-serif', fontWeight: 700, color: C.primary }}>฿{fmtMoney(totals.budgetAmount)}</td>
                          <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: C.blue }}>{totals.budgetManday}</td>
                          {months.map(mo => {
                            const sum = phaseEfforts.reduce((s, e) => s + ((e.monthly || {})[mo] || 0), 0);
                            return (
                              <td key={mo} style={{ ...TD, textAlign: 'center', fontWeight: 700, color: sum > 0 ? C.amber : C.text3 }}>
                                {sum || '—'}
                              </td>
                            );
                          })}
                          <td style={{ ...TD, textAlign: 'center', fontWeight: 800, color: C.amber }}>{totals.usedManday}</td>
                          <td style={{ ...TD, textAlign: 'center', fontWeight: 800, color: totals.remaining < 0 ? C.red : C.green }}>{totals.remaining}</td>
                          <td style={TD} />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          );
        })
      )}

      {modal !== null && <EffortModal data={modal} phaseOptions={phaseOptions} isMobile={isMobile} onClose={() => setModal(null)} onSave={handleSave} />}
      {phaseSummaryOpen && (
        <Modal title="Planned Manday by Phase" onClose={() => setPhaseSummaryOpen(false)} width={420}>
          {phaseSummaryRows.map(([phase, md]) => (
              <div key={phase} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{phase}</span>
                <span style={{ fontSize: 13, color: C.primary, fontWeight: 700 }}>{md} MD</span>
              </div>
            ))}
          {phaseSummaryRows.length === 0 && (
            <div style={{ padding: '16px 0', textAlign: 'center', color: C.text3, fontSize: 13 }}>No effort manday data in tasks</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 8, borderTop: `2px solid ${C.border2}` }}>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>TOTAL</span>
            <span style={{ fontSize: 14, color: C.primary, fontWeight: 800 }}>{Object.values(taskPhaseGroups).reduce((s, v) => s + v, 0)} MD</span>
          </div>
        </Modal>
      )}
      {deleting && <ConfirmModal message={`Delete task "${deleting.module}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>

  );
}

// ── Effort Modal ──────────────────────────────────────────────────────────────
function EffortModal({ data, phaseOptions, isMobile, onClose, onSave }: { data: Partial<Effort>; phaseOptions: { value: string; label: string }[]; isMobile: boolean; onClose: () => void; onSave: (f: Partial<Effort>) => void }) {
  const [form, setForm] = useState<Partial<Effort>>({ phase: phaseOptions[0]?.value ?? 'Phase 1', module: '', budgetAmount: 0, budgetManday: 0, ...data });
  const up = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }));
  return (
    <Modal title={form.id ? 'Edit Task' : 'Add Task'} onClose={onClose} width={440}>
      <FormRow label="Task Name" required>
        <Input autoFocus value={form.module ?? ''} onChange={v => up('module', v)} placeholder="e.g. Frontend Development" />
      </FormRow>
      <FormRow label="Phase" required>
        <Select
          value={phaseOptions.some((o) => o.value === form.phase) ? String(form.phase) : (phaseOptions[0]?.value ?? 'Phase 1')}
          onChange={v => up('phase', v)}
          options={phaseOptions}
        />
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
        <Btn onClick={() => {
          if (!form.module?.trim()) return toast.error('Please enter task name');
          const normalizedPhase = phaseOptions.some((o) => o.value === form.phase) ? String(form.phase) : (phaseOptions[0]?.value ?? 'Phase 1');
          onSave({ ...form, phase: normalizedPhase });
        }}>Save</Btn>
      </div>
    </Modal>
  );
}
