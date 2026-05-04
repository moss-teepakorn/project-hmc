import React, { useEffect, useState } from 'react';
import html2canvas from 'html2canvas';
import { Printer } from 'lucide-react';
import { useStore } from '../../store';
import { useAuth } from '../../contexts/AuthContext';
import { C, MILESTONE_STATUS } from '../Common';
import { fmtDate, fmtMoney, compareWbs, RISK_LEVEL_COLOR } from '../../utils';
import type { Project } from '../../types';
import toast from 'react-hot-toast';

interface Props { project: Project; }

// ── Small helpers ──────────────────────────────────────────────────────────
function money(n: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}
function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

// ── Thin progress bar ──────────────────────────────────────────────────────
function Bar({ value, color, height = 6 }: { value: number; color: string; height?: number }) {
  return (
    <div style={{ background: '#E2E8F0', borderRadius: 99, height, overflow: 'hidden', width: '100%' }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s' }} />
    </div>
  );
}

// ── Donut ──────────────────────────────────────────────────────────────────
function Donut({ value, color, size = 64 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(value, 100) / 100 * circ;
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={7} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 + 4} textAnchor="middle" fontSize={13} fontWeight={800} fill={color} fontFamily="Poppins,sans-serif">{value}%</text>
    </svg>
  );
}

// ── Badge pill ──────────────────────────────────────────────────────────────
function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: bg, color }}>{label}</span>;
}

export default function ProjectReport({ project }: Props) {
  const { tasks, milestones, efforts, members, changeRequests, issues, risks, masterCodes } = useStore();
  const { profile } = useAuth();
  const [commitId] = useState(() => (import.meta as any).env?.VITE_COMMIT_ID ?? 'local');

  const pt  = tasks.filter(t => t.projectId === project.id);
  const ms  = milestones.filter(m => m.projectId === project.id);
  const ef  = efforts.filter(e => e.projectId === project.id);
  const mb  = members.filter(m => m.projectId === project.id);
  const crs = changeRequests.filter(c => c.projectId === project.id);
  const iss = issues.filter(i => i.projectId === project.id);
  const rks = risks.filter(r => r.projectId === project.id);

  // Tasks
  const roots = pt.filter(t => !t.parentId).sort((a, b) => compareWbs(a.wbs, b.wbs));
  const prog  = roots.length ? Math.round(roots.reduce((s, t) => s + t.percentComplete, 0) / roots.length) : 0;
  const done  = roots.filter(t => t.percentComplete === 100).length;
  const inP   = roots.filter(t => t.percentComplete > 0 && t.percentComplete < 100).length;

  // Payment
  const totalContract = ms.reduce((s, m) => s + m.amount, 0);
  const collected     = ms.filter(m => m.status === 'paid').reduce((s, m) => s + m.amount, 0);
  const payPct        = pct(collected, totalContract);

  // Effort / manday
  const tBudMD  = ef.reduce((s, e) => s + e.budgetManday, 0);
  const tUsedMD = ef.reduce((s, e) => s + Object.values(e.monthly || {}).reduce((a, v) => a + v, 0), 0);
  const efPct   = pct(tUsedMD, tBudMD);

  // Issues / Risks
  const openIss = iss.filter(i => i.status === 'Open' || i.status === 'In Progress').length;
  const openRks = rks.filter(r => r.status === 'Monitoring' || r.status === 'Mitigating').length;

  // Project status badge
  const sc = masterCodes.find(c => c.codeType === 'project_status' && c.active && c.codeValue === project.status);
  const statusBg    = sc?.bgColor    ?? '#EEF2FF';
  const statusColor = sc?.textColor  ?? C.primary;
  const statusLabel = sc?.label      ?? project.status ?? 'Unknown';

  // Timeline
  const now       = new Date();
  const startDate = project.startDate ? new Date(project.startDate) : null;
  const endDate   = project.endDate   ? new Date(project.endDate)   : null;
  const totalDays = startDate && endDate ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000)) : 0;
  const elapsedDays = startDate ? Math.max(0, Math.round((now.getTime() - startDate.getTime()) / 86400000)) : 0;
  const dayPct    = pct(elapsedDays, totalDays);
  const onTrack   = prog >= dayPct;

  // Manday by phase (from efforts grouped by phase)
  const phaseNames = [...new Set(ef.map(e => e.phase).filter(Boolean))];
  const effortByPhase = phaseNames.map(phase => {
    const rows = ef.filter(e => e.phase === phase);
    const budMD = rows.reduce((s, e) => s + e.budgetManday, 0);
    const allMonths = [...new Set(rows.flatMap(e => Object.keys(e.monthly || {})))].sort();
    const monthlyTotals = allMonths.map(mo => ({
      month: mo,
      usage: rows.reduce((s, e) => s + ((e.monthly || {})[mo] || 0), 0),
      budget: rows.reduce((s, e) => s + (e.budgetManday > 0 ? Math.round(e.budgetManday / Math.max(allMonths.length, 1)) : 0), 0),
    }));
    const usedMD = monthlyTotals.reduce((s, m) => s + m.usage, 0);
    return { phase, budMD, usedMD, remaining: budMD - usedMD, monthlyTotals };
  });

  // Export as image
  const exportImage = async () => {
    const el = document.querySelector('.exec-report') as HTMLElement | null;
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#fff', useCORS: true });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `executive-report-${project.code}-${now.toISOString().split('T')[0]}.png`;
      link.click();
      toast.success('Image exported');
    } catch { toast.error('Export failed'); }
  };

  const printPage = () => window.print();

  // ── Render ─────────────────────────────────────────────────────────────
  const reportDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const userName = profile?.fullName ?? profile?.email ?? '';

  return (
    <div style={{ padding: 24, background: '#F1F5F9', fontFamily: 'Poppins,sans-serif', minHeight: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        <button onClick={printPage} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: C.primary, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>
          <Printer size={14} /> Print / PDF
        </button>
        <button onClick={exportImage} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#0EA5E9', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>
          Export Image
        </button>
      </div>

      {/* ── Report Page ────────────────────────────────────────────────── */}
      <div className="exec-report" style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.08)', overflow: 'hidden', maxWidth: 900, margin: '0 auto' }}>

        {/* ── Top header bar ─────────────────────────────────────────── */}
        <div style={{ background: '#1E293B', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: '#94A3B8', letterSpacing: 1.5, textTransform: 'uppercase' }}>Executive Report — One Page</span>
          <span style={{ fontSize: 9, color: '#94A3B8' }}>{reportDate}</span>
        </div>

        {/* ── Project title ──────────────────────────────────────────── */}
        <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
              {project.name} <span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>({project.code})</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#64748B' }}>HPO{project.code}-201</span>
              <span style={{ fontSize: 10, color: '#64748B' }}>{project.client}</span>
              <span style={{ fontSize: 10, color: '#64748B' }}>{fmtDate(project.startDate)} – {fmtDate(project.endDate)}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: onTrack ? '#16A34A' : '#DC2626', background: onTrack ? '#F0FDF4' : '#FFF1F2', padding: '2px 10px', borderRadius: 99 }}>
                {onTrack ? '● On Track' : '● Behind'}
              </span>
              <Pill label={statusLabel} bg={statusBg} color={statusColor} />
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 9, color: '#94A3B8' }}>
            <div>{userName}</div>
            <div>commit {commitId.slice(0, 8)}</div>
          </div>
        </div>

        {/* ── KPI cards ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, borderBottom: '1px solid #F1F5F9' }}>
          {/* Overall Progress */}
          <div style={{ padding: '12px 18px', borderRight: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Overall Progress</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: C.primary, lineHeight: 1 }}>{prog}%</div>
            <div style={{ fontSize: 9, color: '#64748B', marginTop: 3 }}>{done} done · {inP} in progress {inP > 0 ? '↑' : ''}</div>
            <Bar value={prog} color={C.primary} height={5} />
            <div style={{ fontSize: 9, color: onTrack ? '#16A34A' : '#DC2626', marginTop: 4, fontWeight: 600 }}>
              {onTrack ? `Ahead of target (${prog - dayPct}%)` : `Behind target (${dayPct - prog}%)`}
            </div>
          </div>

          {/* Payment */}
          <div style={{ padding: '12px 18px', borderRight: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Payment</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#16A34A', lineHeight: 1 }}>{payPct}%</div>
            <div style={{ fontSize: 9, color: '#64748B', marginTop: 3 }}>{money(collected)} THB collected · {ms.length} milestones</div>
            <Bar value={payPct} color="#16A34A" height={5} />
          </div>

          {/* Manday Used */}
          <div style={{ padding: '12px 18px', borderRight: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Manday Used</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: efPct > 90 ? '#DC2626' : '#F59E0B', lineHeight: 1 }}>{tUsedMD}<span style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8' }}>/{tBudMD}</span></div>
            <div style={{ fontSize: 9, color: '#64748B', marginTop: 3 }}>{efPct}% utilized · {mb.filter(m => m.type === 'internal').length} team members</div>
            <Bar value={efPct} color={efPct > 90 ? '#DC2626' : '#F59E0B'} height={5} />
          </div>

          {/* Issues / Risks */}
          <div style={{ padding: '12px 18px' }}>
            <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Issues / Risks</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: openIss > 0 ? '#DC2626' : '#16A34A', lineHeight: 1 }}>{openIss} <span style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>issues</span></div>
            <div style={{ fontSize: 9, color: '#64748B', marginTop: 3 }}>{openRks} risks · {rks.filter(r => r.status === 'Monitoring').length > 0 ? 'all monitoring' : 'under control'}</div>
            <Bar value={openIss > 0 ? 100 : 0} color="#DC2626" height={5} />
          </div>
        </div>

        {/* ── Project Timeline ────────────────────────────────────────── */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 9, color: '#64748B' }}>Project Timeline</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: C.primary }}>Day {elapsedDays} of {totalDays} · {dayPct}% elapsed</span>
          </div>
          <div style={{ position: 'relative', height: 8 }}>
            <div style={{ background: '#E2E8F0', borderRadius: 99, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${dayPct}%`, height: '100%', background: '#CBD5E1', borderRadius: 99 }} />
            </div>
            <div style={{ position: 'absolute', left: `${dayPct}%`, top: -3, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: C.primary, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 8, color: '#94A3B8' }}>{fmtDate(project.startDate)} · Start</span>
            <span style={{ fontSize: 8, color: C.primary, fontWeight: 600 }}>▲ Today · {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            <span style={{ fontSize: 8, color: '#94A3B8' }}>{fmtDate(project.endDate)} · End</span>
          </div>
        </div>

        {/* ── Main Tasks + Payment Milestones ────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #F1F5F9' }}>
          {/* Tasks */}
          <div style={{ padding: '12px 16px', borderRight: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>MAIN TASKS ({roots.length})</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
              <thead>
                <tr style={{ color: '#94A3B8', borderBottom: '1px solid #F1F5F9' }}>
                  <th style={{ padding: '0 6px 5px 0', textAlign: 'left', fontWeight: 600 }}>#</th>
                  <th style={{ padding: '0 6px 5px', textAlign: 'left', fontWeight: 600 }}>TASK NAME</th>
                  <th style={{ padding: '0 6px 5px', textAlign: 'center', fontWeight: 600 }}>START</th>
                  <th style={{ padding: '0 6px 5px', textAlign: 'center', fontWeight: 600 }}>FINISH</th>
                  <th style={{ padding: '0 0 5px', textAlign: 'right', fontWeight: 600 }}>PROGRESS</th>
                </tr>
              </thead>
              <tbody>
                {roots.map((t, i) => {
                  const barColor = t.percentComplete >= 100 ? '#16A34A' : t.percentComplete >= 60 ? '#F59E0B' : '#4F46E5';
                  const isOverdue = t.endDate && new Date(t.endDate) < now && t.percentComplete < 100;
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                      <td style={{ padding: '5px 6px 5px 0', color: '#94A3B8' }}>{i + 1}</td>
                      <td style={{ padding: '5px 6px', fontWeight: 500, color: isOverdue ? '#DC2626' : '#0F172A' }}>{t.taskName}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: '#64748B' }}>{t.startDate ? t.startDate.slice(5).replace('-', '/') : '—'}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: isOverdue ? '#DC2626' : '#64748B', fontWeight: isOverdue ? 700 : 400 }}>{t.endDate ? t.endDate.slice(5).replace('-', '/') : '—'}</td>
                      <td style={{ padding: '5px 0', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                          <div style={{ width: 60, background: '#E2E8F0', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                            <div style={{ width: `${t.percentComplete}%`, height: '100%', background: barColor }} />
                          </div>
                          <span style={{ fontSize: 8, fontWeight: 700, color: barColor, minWidth: 24 }}>{t.percentComplete}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {roots.length === 0 && <tr><td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#CBD5E1' }}>No tasks</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Milestones */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>PAYMENT MILESTONES ({ms.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {ms.map(m => {
                const ss = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.pending;
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #F8FAFC' }}>
                    <Pill label={m.phase || 'Phase'} bg={C.primaryBg} color={C.primary} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 8, fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                      <div style={{ fontSize: 8, color: '#94A3B8' }}>Due {fmtDate(m.dueDate) || 'TBD'}</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 60 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#0F172A' }}>{money(m.amount)}</div>
                      <Pill label={ss.label} bg={ss.bg} color={ss.color} />
                    </div>
                  </div>
                );
              })}
              {ms.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: '#CBD5E1', fontSize: 8 }}>No milestones</div>}
            </div>
          </div>
        </div>

        {/* ── Risk Register + Manday by Month + Status Summary ──────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gap: 0, borderBottom: '1px solid #F1F5F9' }}>

          {/* Risk Register */}
          <div style={{ padding: '12px 16px', borderRight: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>RISK REGISTER ({rks.length} MONITORING)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {rks.map(r => {
                const impactColor = r.impact === 'High' ? '#DC2626' : r.impact === 'Medium' ? '#F59E0B' : '#16A34A';
                const impactBg    = r.impact === 'High' ? '#FFF1F2' : r.impact === 'Medium' ? '#FFFBEB' : '#F0FDF4';
                return (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid #F8FAFC' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                      <div style={{ fontSize: 8, color: '#94A3B8' }}>P:{r.probability} · I:{r.impact} · {r.owner || '—'}</div>
                    </div>
                    <Pill label={r.impact.toUpperCase()} bg={impactBg} color={impactColor} />
                  </div>
                );
              })}
              {rks.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: '#CBD5E1', fontSize: 8 }}>No risks</div>}
            </div>
          </div>

          {/* Manday by Month (per phase) */}
          <div style={{ padding: '12px 16px', borderRight: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>MANDAY USED BY MONTH</div>
            {effortByPhase.length === 0 && <div style={{ fontSize: 8, color: '#CBD5E1', padding: 12 }}>No effort data</div>}
            {effortByPhase.map(ep => (
              <div key={ep.phase} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Pill label={ep.phase} bg={C.primaryBg} color={C.primary} />
                  <span style={{ fontSize: 8, color: '#64748B' }}>Total {ep.budMD} MD · Used <b style={{ color: '#F59E0B' }}>{ep.usedMD}.0</b> · Remain <b style={{ color: ep.remaining < 0 ? '#DC2626' : '#16A34A' }}>{ep.remaining}.0</b></span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
                  <thead>
                    <tr style={{ color: '#94A3B8' }}>
                      <th style={{ textAlign: 'left', padding: '2px 4px', fontWeight: 600 }}>MONTH</th>
                      <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 600 }}>USAGE</th>
                      <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 600 }}>USED</th>
                      <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 600 }}>ACCUMULA</th>
                      <th style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 600 }}>REMAIN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ep.monthlyTotals.map((mo, idx) => {
                      const accum = ep.monthlyTotals.slice(0, idx + 1).reduce((s, x) => s + x.usage, 0);
                      const remain = ep.budMD - accum;
                      return (
                        <tr key={mo.month} style={{ borderTop: '1px solid #F8FAFC' }}>
                          <td style={{ padding: '3px 4px', color: '#64748B' }}>
                            {new Date(mo.month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }).replace(' ', ' \'')}
                          </td>
                          <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 7, color: '#CBD5E1' }}>{mo.budget}/</span>
                              <span style={{ fontWeight: 700, color: mo.usage > 0 ? '#F59E0B' : '#CBD5E1' }}>{mo.usage}</span>
                            </span>
                          </td>
                          <td style={{ padding: '3px 4px', textAlign: 'right', color: mo.usage > 0 ? '#0F172A' : '#CBD5E1', fontWeight: mo.usage > 0 ? 700 : 400 }}>{mo.usage > 0 ? mo.usage.toFixed(1) : '—'}</td>
                          <td style={{ padding: '3px 4px', textAlign: 'right', color: '#64748B' }}>{accum.toFixed(1)}</td>
                          <td style={{ padding: '3px 4px', textAlign: 'right', color: remain < 0 ? '#DC2626' : '#16A34A', fontWeight: 600 }}>{remain.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                      <td style={{ padding: '4px', fontWeight: 700, fontSize: 8 }}>TOTAL</td>
                      <td colSpan={2} style={{ padding: '4px', textAlign: 'right', fontWeight: 700, color: '#F59E0B', fontSize: 8 }}>{ep.usedMD.toFixed(1)}</td>
                      <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700, fontSize: 8 }}>{ep.usedMD.toFixed(1)}</td>
                      <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700, color: ep.remaining < 0 ? '#DC2626' : '#16A34A', fontSize: 8 }}>{ep.remaining.toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Status Summary */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>STATUS SUMMARY</div>

            {/* Health indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: onTrack ? '#F0FDF4' : '#FFF1F2', borderRadius: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>{onTrack ? '✅' : '⚠️'}</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: onTrack ? '#16A34A' : '#DC2626' }}>Project Health: {onTrack ? 'On Track' : 'Behind Schedule'}</div>
                <div style={{ fontSize: 8, color: '#64748B' }}>Progress {prog}% {onTrack ? 'exceeds' : 'below'} target {dayPct}%</div>
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { label: 'TOTAL TASKS', value: pt.length, sub: `${roots.length} main tasks` },
                { label: 'CHANGE REQ', value: crs.length, sub: crs.length === 0 ? 'No changes' : `${crs.filter(c => c.status === 'Approved').length} approved` },
                { label: 'OPEN ISSUES', value: openIss, sub: openIss === 0 ? 'All clear' : `${openIss} active` },
                { label: 'MILESTONES', value: ms.length, sub: `${ms.filter(m => m.status === 'pending').length} pending` },
              ].map(s => (
                <div key={s.label} style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: 8 }}>
                  <div style={{ fontSize: 8, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 8, color: '#64748B', marginTop: 2 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Contract */}
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#F8FAFC', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 8, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Contract Value</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.primary }}>{money(totalContract)} <span style={{ fontSize: 9, fontWeight: 500 }}>THB</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 8, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Collected</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#16A34A' }}>{money(collected)}</div>
                </div>
              </div>
              <Bar value={payPct} color="#16A34A" height={5} />
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div style={{ padding: '8px 20px', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: '#94A3B8' }}>{project.name} ({project.code}) · HPO{project.code}-201 · Confidential Executive Report</span>
          <span style={{ fontSize: 8, color: '#94A3B8' }}>Tasks: {pt.length} · Members: {mb.length} · Milestones: {ms.length} · Risks: {rks.length} · {onTrack ? '● On Track' : '● Behind'}</span>
        </div>
      </div>
    </div>
  );
}
  const r    = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.bg2} strokeWidth={9}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+5} textAnchor="middle" fontSize={16} fontWeight={700} fill={color} fontFamily="Poppins, sans-serif">{value}%</text>
    </svg>
  );
}

export default function ProjectReport({ project }: Props) {
  const { tasks, milestones, efforts, changeRequests, issues, risks } = useStore();
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const pt  = tasks.filter(t => t.projectId === project.id);
  const ms  = milestones.filter(m => m.projectId === project.id);
  const ef  = efforts.filter(e => e.projectId === project.id);
  const crs = changeRequests.filter(c => c.projectId === project.id);
  const iss = issues.filter(i => i.projectId === project.id);
  const rks = risks.filter(r => r.projectId === project.id);

  const roots    = pt.filter(t => !t.parentId);
  const tasksForReport = [...roots].sort((a, b) => compareWbs(a.wbs, b.wbs));
  const prog     = roots.length ? Math.round(roots.reduce((s,t)=>s+t.percentComplete,0)/roots.length) : 0;
  const done     = pt.filter(t=>t.percentComplete===100).length;
  const inProg   = pt.filter(t=>t.percentComplete>0&&t.percentComplete<100).length;
  const notStart = pt.filter(t=>t.percentComplete===0).length;

  const totalContract = ms.reduce((s,m)=>s+m.amount,0);
  const paidAmt       = ms.filter(m=>m.status==='paid').reduce((s,m)=>s+m.amount,0);
  const billedAmt     = ms.filter(m=>m.status==='billed').reduce((s,m)=>s+m.amount,0);
  const payPct        = totalContract>0?Math.round((paidAmt/totalContract)*100):0;

  const tBudMD  = ef.reduce((s,e)=>s+e.budgetManday,0);
  const tUsedMD = ef.reduce((s,e)=>s+Object.values(e.monthly||{}).reduce((a,v)=>a+v,0),0);
  const efPct   = tBudMD>0?Math.round((tUsedMD/tBudMD)*100):0;

  const openIssues = iss.filter(i=>i.status==='Open'||i.status==='In Progress').length;
  const openRisks  = rks.filter(r=>r.status==='Monitoring'||r.status==='Mitigating').length;
  const openCRs    = crs.filter(c=>c.status==='Draft'||c.status==='Submitted'||c.status==='Under Review').length;

  const { masterCodes } = useStore();
  const statusCode = masterCodes.find((code) => code.codeType === 'project_status' && code.active && code.codeValue === project.status);
  const s = statusCode ? { bg: statusCode.bgColor, color: statusCode.textColor, label: statusCode.label } : { bg: C.bg2, color: C.text, label: project.status || 'Unknown' };
  const money2 = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  // ── PDF export ─────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    const element = document.querySelector('.executive-report-page');
    if (!element) return;
    const canvas = await html2canvas(element as HTMLElement, { scale: 2, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = W;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    doc.save(`report-${project.code}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exported');
  };

  const exportImage = async () => {
    const element = document.querySelector('.executive-report-page');
    if (!element) return;
    const canvas = await html2canvas(element as HTMLElement, { scale: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `executive-report-${project.code}-${new Date().toISOString().split('T')[0]}.png`;
    link.click();
    toast.success('Image exported');
  };

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: 24, background: C.bg2, fontFamily: 'Poppins, sans-serif' }}>
      <div className="executive-report-page" style={{ background: C.white, borderRadius: 20, width: '100%', margin: '0 auto', boxShadow: '0 20px 60px rgba(0,0,0,0.08)', fontSize: 9 }}>
        <style>{`
          .executive-report-page table td,
          .executive-report-page table th,
          .executive-report-page .report-list-row div,
          .executive-report-page .report-list-row span {
            font-size: 9px !important;
            font-family: Poppins, sans-serif !important;
          }
        `}</style>
        {/* Toolbar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:20, fontWeight:700, color:C.text }}>Executive Report - {project.name}</span>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button onClick={exportPDF}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', background:C.primary, border:'none', borderRadius:8, color:'#fff', fontSize:9, fontWeight:600, cursor:'pointer', fontFamily:'Poppins, sans-serif' }}>
              <Printer size={14}/> Export PDF
            </button>
            <button onClick={exportImage}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', background:C.blue, border:'none', borderRadius:8, color:'#fff', fontSize:9, fontWeight:600, cursor:'pointer', fontFamily:'Poppins, sans-serif' }}>
              Export Image
            </button>
          </div>
        </div>

        {/* Report body */}
        <div style={{ padding:18 }}>
          {/* Header */}
          <div style={{ background:`linear-gradient(135deg,${C.primary},#818CF8)`, borderRadius:12, padding:'14px 20px', marginBottom:14, color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:18, fontWeight:800 }}>{project.name}</div>
              <div style={{ fontSize:11, opacity:0.86, marginTop:2 }}>{project.code} | {project.client} | {fmtDate(project.startDate)} - {fmtDate(project.endDate)}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ background:'rgba(255,255,255,0.25)', borderRadius:8, padding:'3px 10px', fontSize:11, fontWeight:600 }}>{s.label}</div>
              <div style={{ fontSize:9, opacity:0.75, marginTop:3 }}>{new Date().toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric'})}</div>
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : 'repeat(4,1fr)', gap:10, marginBottom:12 }}>
            {[
              { label:'Overall Progress', value:prog,   color:C.primary, sub:`${done} done · ${inProg} in progress` },
              { label:'Payment',          value:payPct, color:C.green,   sub:`${money2(paidAmt)} collected` },
              { label:'Manday',           value:efPct,  color:efPct>90?C.red:efPct>70?C.amber:C.primary, sub:`${tUsedMD}/${tBudMD} MD` },
              { label:'Issues/CRs Open', value:openIssues+openCRs, color:openIssues+openCRs>0?C.red:C.green, sub:`${openRisks} risks open`, isCount:true },
            ].map(k => (
              <div key={k.label} style={{ background:C.bg, borderRadius:10, padding:'10px 12px', display:'flex', alignItems:'center', gap:10 }}>
                {!k.isCount ? <DonutChart value={k.value} color={k.color} size={72}/> : (
                  <div style={{ width:72, height:72, borderRadius:'50%', background:k.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:800, color:k.color }}>{k.value}</div>
                )}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.text }}>{k.label}</div>
                  <div style={{ fontSize:10, color:C.text2, marginTop:2 }}>{k.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tasks + Milestones */}
          <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr', gap:10, marginBottom:10 }}>
            {/* Tasks */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:6 }}>Main Tasks ({tasksForReport.length})</div>
              {isMobile ? (
                <div style={{ display:'grid', gap:8 }}>
                  {tasksForReport.map((t) => (
                    <Card key={t.id} style={{ padding: 10, marginBottom: 0, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px', border: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{t.taskName}</div>
                          <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>{t.wbs}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: C.text2 }}>Progress</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: t.percentComplete >= 100 ? C.green : t.percentComplete >= 60 ? C.blue : C.primary }}>{t.percentComplete}%</div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div style={{ background:C.bg, borderRadius:10, overflow:'hidden', maxHeight:260, overflowY:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:8 }}>
                    <thead><tr style={{ background:C.primary }}>
                      {['WBS','Task','Start','Finish','Actual','%'].map(h=>(
                        <th key={h} style={{ padding:'5px 7px', color:'#fff', textAlign:'left', fontSize:8, fontWeight:600 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {tasksForReport.map((t,i)=>(
                        <tr key={t.id} style={{ background:i%2===0?C.white:C.bg }}>
                          <td style={{ padding:'4px 7px', fontSize:8, color:C.text3 }}>{t.wbs}</td>
                          <td style={{ padding:'4px 7px', fontSize:8, fontWeight:500 }}>{t.taskName}</td>
                          <td style={{ padding:'4px 7px', fontSize:8, color:C.text2 }}>{fmtDate(t.startDate)}</td>
                          <td style={{ padding:'4px 7px', fontSize:8, color:C.text2 }}>{fmtDate(t.endDate)}</td>
                          <td style={{ padding:'4px 7px', fontSize:8, color:t.actualFinish?C.green:C.text3 }}>{t.actualFinish?fmtDate(t.actualFinish):'-'}</td>
                          <td style={{ padding:'4px 7px', fontSize:8, fontWeight:700, color:t.percentComplete>=100?C.green:t.percentComplete>=60?C.blue:C.primary }}>{t.percentComplete}%</td>
                        </tr>
                      ))}
                      {tasksForReport.length===0&&<tr><td colSpan={6} style={{ padding:16, textAlign:'center', fontSize:8, color:C.text3 }}>No tasks</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Milestones */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:6 }}>Milestones ({ms.length})</div>
              {isMobile ? (
                <div style={{ display:'grid', gap:8 }}>
                  {ms.map((m) => {
                    const ss = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.pending;
                    return (
                      <Card key={m.id} style={{ padding: 10, marginBottom: 0, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{m.phase}</div>
                            <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>{m.name}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 9, color: C.text2 }}>Due {fmtDate(m.dueDate)}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color:ss.color }}>{ss.label}</div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background:C.bg, borderRadius:10, overflow:'hidden', maxHeight:260, overflowY:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:8 }}>
                    <thead><tr style={{ background:C.green }}>
                      {['Phase','Name','Amount','Due','Status'].map(h=>(
                        <th key={h} style={{ padding:'5px 7px', color:'#fff', textAlign:'left', fontSize:8, fontWeight:600 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {ms.map((m,i)=>{const ss=MILESTONE_STATUS[m.status]??MILESTONE_STATUS.pending;return(
                        <tr key={m.id} style={{ background:i%2===0?C.white:C.bg }}>
                          <td style={{ padding:'4px 7px', fontSize:8, color:C.text3 }}>{m.phase}</td>
                          <td style={{ padding:'4px 7px', fontSize:8, fontWeight:500 }}>{m.name}</td>
                          <td style={{ padding:'4px 7px', fontSize:8, fontFamily:'Poppins, sans-serif', color:C.primary }}>{money2(m.amount)}</td>
                          <td style={{ padding:'4px 7px', fontSize:8, color:C.text2 }}>{fmtDate(m.dueDate)}</td>
                          <td style={{ padding:'4px 7px' }}><span style={{ fontSize:8, fontWeight:600, color:ss.color, background:ss.bg, padding:'2px 8px', borderRadius:10 }}>{ss.label}</span></td>
                        </tr>
                      );})}
                      {ms.length===0&&<tr><td colSpan={5} style={{ padding:16, textAlign:'center', fontSize:8, color:C.text3 }}>No milestones</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* CR + Issues + Risks summary */}
          <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr 1fr', gap:14 }}>
            {/* CRs */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:8 }}>📝 Change Requests ({crs.length})</div>
              {isMobile ? (
                <div style={{ display:'grid', gap:8 }}>
                  {crs.map((c) => {
                    const ss = PROCESS_STATUS_STYLE[c.status] ?? PROCESS_STATUS_STYLE['N/A'];
                    return (
                      <Card key={c.id} style={{ padding: 10, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.primary }}>{c.crId}</div>
                            <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>{c.title.substring(0,30)}</div>
                          </div>
                          <span style={{ fontSize: 8, fontWeight: 600, color: ss.color, background: ss.bg, padding: '2px 8px', borderRadius: 10 }}>{c.status}</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background:C.bg, borderRadius:10, overflow:'hidden' }}>
                  {crs.length===0&&<div style={{ padding:16, textAlign:'center', fontSize:8, color:C.text3 }}>No CRs</div>}
                  {crs.map((c,i)=>{const ss=PROCESS_STATUS_STYLE[c.status]??PROCESS_STATUS_STYLE['N/A'];return(
                    <div key={c.id} className="report-list-row" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 12px', background:i%2===0?C.white:C.bg, borderBottom:`1px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize:8, fontWeight:600, color:C.primary }}>{c.crId}</div>
                        <div style={{ fontSize:8, color:C.text2 }}>{c.title.substring(0,28)} · {c.totalManday}MD</div>
                      </div>
                      <span style={{ fontSize:8, fontWeight:600, color:ss.color, background:ss.bg, padding:'2px 8px', borderRadius:10, flexShrink:0, marginLeft:8 }}>{c.status}</span>
                    </div>
                  );})}
                </div>
              )}
            </div>
            {/* Issues */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:8 }}>🔴 Issues ({iss.length})</div>
              {isMobile ? (
                <div style={{ display:'grid', gap:8 }}>
                  {iss.map((issue) => {
                    const ss = PROCESS_STATUS_STYLE[issue.status] ?? PROCESS_STATUS_STYLE['N/A'];
                    return (
                      <Card key={issue.id} style={{ padding: 10, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{issue.title.substring(0,30)}</div>
                            <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>{fmtDate(issue.issueDate)} · {issue.assignedTo||'—'}</div>
                          </div>
                          <span style={{ fontSize: 8, fontWeight: 600, color:ss.color, background:ss.bg, padding: '2px 8px', borderRadius: 10 }}>{issue.status}</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background:C.bg, borderRadius:10, overflow:'hidden' }}>
                  {iss.length===0&&<div style={{ padding:16, textAlign:'center', fontSize:8, color:C.text3 }}>No issues</div>}
                  {iss.map((issue,i)=>{const ss=PROCESS_STATUS_STYLE[issue.status]??PROCESS_STATUS_STYLE['N/A'];return(
                    <div key={issue.id} className="report-list-row" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 12px', background:i%2===0?C.white:C.bg, borderBottom:`1px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize:8, fontWeight:600, color:C.text }}>{issue.title.substring(0,28)}</div>
                        <div style={{ fontSize:8, color:C.text2 }}>{fmtDate(issue.issueDate)} · {issue.assignedTo||'—'}</div>
                      </div>
                      <span style={{ fontSize:8, fontWeight:600, color:ss.color, background:ss.bg, padding:'2px 8px', borderRadius:10, flexShrink:0, marginLeft:8 }}>{issue.status}</span>
                    </div>
                  );})}
                </div>
              )}
            </div>
            {/* Risks */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:8 }}>🎯 Risks ({rks.length})</div>
              {isMobile ? (
                <div style={{ display:'grid', gap:8 }}>
                  {rks.map((r) => {
                    const rc = RISK_LEVEL_COLOR[r.impact] || C.text2;
                    const sc = r.status === 'Monitoring' ? C.red : r.status === 'Mitigating' ? C.amber : C.green;
                    return (
                      <Card key={r.id} style={{ padding: 10, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{r.title.substring(0,30)}</div>
                            <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>P:{r.probability} / I:{r.impact}</div>
                          </div>
                          <span style={{ fontSize: 8, fontWeight: 600, color: sc, background: sc + '18', padding: '2px 8px', borderRadius: 10 }}>{r.status}</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background:C.bg, borderRadius:10, overflow:'hidden' }}>
                  {rks.length===0&&<div style={{ padding:16, textAlign:'center', fontSize:8, color:C.text3 }}>No risks</div>}
                  {rks.map((r,i)=>{
                    const rc=RISK_LEVEL_COLOR[r.impact]||C.text2;
                    const sc=r.status==='Monitoring'?C.red:r.status==='Mitigating'?C.amber:C.green;
                    return(
                    <div key={r.id} className="report-list-row" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 12px', background:i%2===0?C.white:C.bg, borderBottom:`1px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize:8, fontWeight:600, color:C.text }}>{r.title.substring(0,28)}</div>
                        <div style={{ fontSize:8 }}>
                          <span style={{ color:rc, fontWeight:600 }}>P:{r.probability} / I:{r.impact}</span>
                          <span style={{ color:C.text3 }}> · {r.owner||'—'}</span>
                        </div>
                      </div>
                      <span style={{ fontSize:8, fontWeight:600, color:sc, background:sc+'18', padding:'2px 8px', borderRadius:10, flexShrink:0, marginLeft:8 }}>{r.status}</span>
                    </div>
                  );})}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
