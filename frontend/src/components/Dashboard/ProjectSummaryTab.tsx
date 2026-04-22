import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Btn, Card, C, FormRow, TH, TD } from '../Common';
import { fmtDate, getHalfMonthSnapshotDates, computeBaselineProgress } from '../../utils';
import type { Project, ProjectProgressSnapshot } from '../../types';
import { useStore } from '../../store';

interface Props { project: Project; }

interface DraftRow {
  actualPercent: number;
  note: string;
}

export default function ProjectSummaryTab({ project }: Props) {
  const {
    tasks,
    projectProgressSnapshots,
    fetchTasks,
    fetchProjectProgressSnapshots,
    saveProjectProgressSnapshot,
    deleteProjectProgressSnapshot,
  } = useStore();

  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [savingSnapshot, setSavingSnapshot] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!project?.id) return;
    fetchProjectProgressSnapshots(project.id);
  }, [project?.id, fetchProjectProgressSnapshots]);

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id],
  );

  const snapshotDates = useMemo(
    () => getHalfMonthSnapshotDates(project.startDate, project.endDate),
    [project.startDate, project.endDate],
  );

  const baselineProgress = useMemo(() => {
    const computed = computeBaselineProgress(projectTasks, snapshotDates);
    if (snapshotDates.length > 0 && snapshotDates[snapshotDates.length - 1] === project.endDate) {
      computed[snapshotDates.length - 1] = 100;
    }
    return computed;
  }, [projectTasks, snapshotDates, project.endDate]);

  const savedByDate = useMemo(() => {
    const map = new Map<string, ProjectProgressSnapshot>();
    projectProgressSnapshots
      .filter((s) => s.projectId === project.id)
      .forEach((s) => map.set(s.snapshotDate, s));
    return map;
  }, [projectProgressSnapshots, project.id]);

  const rows = useMemo(() => snapshotDates.map((date, index) => {
    const saved = savedByDate.get(date);
    const draft = drafts[date];
    const baselinePercent = baselineProgress[index] ?? 0;
    const actualPercent = draft?.actualPercent ?? saved?.actualPercent ?? 0;
    const note = draft?.note ?? saved?.note ?? '';
    const originalActual = saved?.actualPercent ?? 0;
    const originalNote = saved?.note ?? '';
    return {
      id: saved?.id || '',
      snapshotDate: date,
      baselinePercent,
      actualPercent,
      note,
      dirty: draft ? (draft.actualPercent !== originalActual || draft.note !== originalNote) : false,
      canSave: saved?.id || draft,
    };
  }), [snapshotDates, baselineProgress, savedByDate, drafts]);

  const updateDraft = (date: string, next: DraftRow) => {
    setDrafts((prev) => ({ ...prev, [date]: next }));
  };

  const handleActualChange = (date: string, value: string) => {
    const next = Math.max(0, Math.min(100, Number(value) || 0));
    const current = drafts[date] || {
      actualPercent: savedByDate.get(date)?.actualPercent ?? 0,
      note: savedByDate.get(date)?.note ?? '',
    };
    updateDraft(date, { ...current, actualPercent: next });
  };

  const handleNoteChange = (date: string, value: string) => {
    const current = drafts[date] || {
      actualPercent: savedByDate.get(date)?.actualPercent ?? 0,
      note: savedByDate.get(date)?.note ?? '',
    };
    updateDraft(date, { ...current, note: value });
  };

  const handleSave = async (date: string) => {
    const draft = drafts[date];
    const saved = savedByDate.get(date);
    if (!draft && !saved) return;
    setSavingSnapshot(date);
    try {
      await saveProjectProgressSnapshot({
        id: saved?.id,
        projectId: project.id,
        snapshotDate: date,
        baselinePercent: baselineProgress[snapshotDates.indexOf(date)] ?? 0,
        actualPercent: draft?.actualPercent ?? saved?.actualPercent ?? 0,
        note: draft?.note ?? saved?.note ?? '',
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
      await fetchProjectProgressSnapshots(project.id);
    } finally {
      setSavingSnapshot(null);
    }
  };

  const handleDelete = async (id: string, date: string) => {
    if (!id) return;
    setSavingSnapshot(date);
    try {
      await deleteProjectProgressSnapshot(id);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
    } finally {
      setSavingSnapshot(null);
    }
  };

  const saveAll = async () => {
    for (const row of rows) {
      if (!row.dirty) continue;
      await handleSave(row.snapshotDate);
    }
  };

  const refreshBaseline = async () => {
    if (!project.id) return;
    setRefreshing(true);
    try {
      await fetchTasks(project.id);

      const currentSaved = new Map<string, ProjectProgressSnapshot>();
      projectProgressSnapshots
        .filter((s) => s.projectId === project.id)
        .forEach((s) => currentSaved.set(s.snapshotDate, s));

      for (const [index, snapshotDate] of snapshotDates.entries()) {
        const saved = currentSaved.get(snapshotDate);
        const draft = drafts[snapshotDate];
        await saveProjectProgressSnapshot({
          id: saved?.id,
          projectId: project.id,
          snapshotDate,
          baselinePercent: baselineProgress[index] ?? 0,
          actualPercent: draft?.actualPercent ?? saved?.actualPercent ?? 0,
          note: draft?.note ?? saved?.note ?? '',
        });
      }

      setDrafts({});
      await fetchProjectProgressSnapshots(project.id);
    } finally {
      setRefreshing(false);
    }
  };

  const graphRows = useMemo(() => {
    const points = rows.map((row, index) => ({
      ...row,
      actualPercent: row.actualPercent,
      baselinePercent: row.baselinePercent,
      xIndex: index,
    }));
    return points;
  }, [rows]);

  const chartWidth = 760;
  const chartHeight = 240;
  const chartMargin = { top: 20, right: 24, bottom: 38, left: 44 };
  const innerWidth = chartWidth - chartMargin.left - chartMargin.right;
  const innerHeight = chartHeight - chartMargin.top - chartMargin.bottom;

  const chartPoints = graphRows.map((row, index) => {
    const x = chartMargin.left + (graphRows.length > 1 ? (innerWidth * index) / (graphRows.length - 1) : innerWidth / 2);
    return {
      ...row,
      x,
      baselineY: chartMargin.top + innerHeight * (1 - row.baselinePercent / 100),
      actualY: chartMargin.top + innerHeight * (1 - row.actualPercent / 100),
    };
  });

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text(`${project.name} · Project Summary`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Snapshot count: ${rows.length} · Export date: ${fmtDate(new Date().toISOString())}`, 14, 22);

    const body = rows.map((row) => [
      fmtDate(row.snapshotDate),
      `${row.baselinePercent}%`,
      `${row.actualPercent}%`,
      row.note || '–',
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['Snapshot', 'Baseline %', 'Actual %', 'Notes']],
      body,
      theme: 'grid',
      headStyles: { fillColor: '#F8FAFC', textColor: '#0F172A', halign: 'left' },
      styles: { fontSize: 9, cellPadding: 3 },
    });
    doc.save(`${project.code || project.name}-project-summary.pdf`);
  };

  return (
    <div style={{ padding: 24, background: C.bg2, minHeight: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18, alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 18, color: C.text }}>Project Summary</h3>
        <span style={{ color: C.text2, fontSize: 12 }}>15-day baseline progress with actual tracking and snapshot persistence.</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn variant="outline" onClick={refreshBaseline} small disabled={refreshing || savingSnapshot !== null}>
            {refreshing ? 'Recalculating…' : 'Recalculate baseline'}
          </Btn>
          <Btn variant="ghost" onClick={exportPDF} small>Export PDF</Btn>
          <Btn variant="primary" onClick={saveAll} small disabled={!rows.some((r) => r.dirty) || refreshing || savingSnapshot !== null}>Save all</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.text2, marginBottom: 10 }}>Baseline snapshots</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ color: C.text3, fontSize: 11 }}>Snapshots</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{rows.length}</div>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ color: C.text3, fontSize: 11 }}>Most recent baseline</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.primary }}>{rows[rows.length - 1]?.baselinePercent ?? 0}%</div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.text2, marginBottom: 10 }}>Latest actual progress</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ color: C.text3, fontSize: 11 }}>Last actual</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.green }}>{rows[rows.length - 1]?.actualPercent ?? 0}%</div>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ color: C.text3, fontSize: 11 }}>Changes pending</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.primary }}>{rows.filter((r) => r.dirty).length}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: C.text2 }}>Progress graph</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Baseline vs Actual</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: C.text2 }}>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: C.primary, display: 'inline-block' }} /> Baseline
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: C.text2 }}>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: C.green, display: 'inline-block' }} /> Actual
            </div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <svg width={chartWidth} height={chartHeight} style={{ display: 'block' }}>
            {[0, 25, 50, 75, 100].map((value) => {
              const y = chartMargin.top + innerHeight * (1 - value / 100);
              return (
                <g key={value}>
                  <line x1={chartMargin.left} y1={y} x2={chartWidth - chartMargin.right} y2={y} stroke="#E2E8F0" strokeWidth={1} />
                  <text x={chartMargin.left - 10} y={y + 4} textAnchor="end" fontSize={10} fill={C.text2}>{value}%</text>
                </g>
              );
            })}
            <line x1={chartMargin.left} y1={chartMargin.top} x2={chartMargin.left} y2={chartHeight - chartMargin.bottom} stroke={C.text3} strokeWidth={1.4} />
            <line x1={chartMargin.left} y1={chartHeight - chartMargin.bottom} x2={chartWidth - chartMargin.right} y2={chartHeight - chartMargin.bottom} stroke={C.text3} strokeWidth={1.4} />

            <polyline
              fill="none"
              stroke={C.primary}
              strokeWidth={2.5}
              points={chartPoints.map((pt) => `${pt.x},${pt.baselineY}`).join(' ')}
            />
            <polyline
              fill="none"
              stroke={C.green}
              strokeWidth={2.5}
              points={chartPoints.map((pt) => `${pt.x},${pt.actualY}`).join(' ')}
            />

            {chartPoints.map((pt) => (
              <g key={pt.snapshotDate}>
                <circle cx={pt.x} cy={pt.baselineY} r={4} fill={C.primary} />
                <circle cx={pt.x} cy={pt.actualY} r={4} fill={C.green} />
                <text x={pt.x} y={chartHeight - chartMargin.bottom + 16} textAnchor="middle" fontSize={9} fill={C.text2}>{fmtDate(pt.snapshotDate)}</text>
              </g>
            ))}
          </svg>
        </div>
      </Card>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 760, background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <thead style={{ background: C.bg2 }}>
            <tr>
              <th style={TH}>Snapshot date</th>
              <th style={TH}>Baseline %</th>
              <th style={TH}>Actual %</th>
              <th style={TH}>Notes</th>
              <th style={TH}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.snapshotDate} style={{ background: row.dirty ? '#FEFBF7' : undefined }}>
                <td style={TD}>{fmtDate(row.snapshotDate)}</td>
                <td style={TD}>{row.baselinePercent}%</td>
                <td style={TD}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={row.actualPercent}
                    onChange={(e) => handleActualChange(row.snapshotDate, e.target.value)}
                    style={{ width: 72, padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}
                  />
                </td>
                <td style={TD}>
                  <textarea
                    rows={1}
                    value={row.note}
                    onChange={(e) => handleNoteChange(row.snapshotDate, e.target.value)}
                    style={{ width: '100%', minWidth: 220, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, resize: 'vertical' }}
                  />
                </td>
                <td style={TD}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Btn variant={row.dirty ? 'primary' : 'outline'} small onClick={() => handleSave(row.snapshotDate)} disabled={!row.dirty || savingSnapshot === row.snapshotDate}>
                      {savingSnapshot === row.snapshotDate ? 'Saving…' : row.dirty ? 'Save' : 'Saved'}
                    </Btn>
                    {row.id && (
                      <Btn variant="danger" small onClick={() => handleDelete(row.id, row.snapshotDate)} disabled={savingSnapshot === row.snapshotDate}>
                        Delete
                      </Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
