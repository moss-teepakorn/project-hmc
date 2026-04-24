import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Btn, Card, C, FormRow, TH, TD } from '../Common';
import { fmtDate, getHalfMonthSnapshotDates, computeBaselineProgress } from '../../utils';
import type { Project, ProjectProgressSnapshot } from '../../types';
import { useStore } from '../../store';

interface Props { project: Project; }

interface DraftRow {
  actualPercent: string;
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
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    const originalActualInput = saved ? String(saved.actualPercent ?? 0) : '';
    const actualInput = draft?.actualPercent ?? originalActualInput;
    const actualPercent = actualInput.trim() === '' ? 0 : Number(actualInput);
    const note = draft?.note ?? saved?.note ?? '';
    const originalNote = saved?.note ?? '';
    return {
      id: saved?.id || '',
      snapshotDate: date,
      baselinePercent,
      actualPercent,
      actualInput,
      note,
      dirty: draft ? (draft.actualPercent !== originalActualInput || draft.note !== originalNote) : false,
      canSave: !!saved || !!draft,
    };
  }), [snapshotDates, baselineProgress, savedByDate, drafts]);

  const updateDraft = (date: string, next: DraftRow) => {
    setDrafts((prev) => ({ ...prev, [date]: next }));
  };

  const handleActualChange = (date: string, value: string) => {
    const current = drafts[date] || {
      actualPercent: savedByDate.get(date)?.actualPercent?.toString() ?? '',
      note: savedByDate.get(date)?.note ?? '',
    };
    updateDraft(date, { ...current, actualPercent: value });
  };

  const handleNoteChange = (date: string, value: string) => {
    const current = drafts[date] || {
      actualPercent: savedByDate.get(date)?.actualPercent?.toString() ?? '',
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
        actualPercent: draft?.actualPercent?.trim() === ''
          ? 0
          : Number(draft?.actualPercent ?? saved?.actualPercent ?? 0),
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
          actualPercent: draft?.actualPercent?.trim() === ''
            ? 0
            : Number(draft?.actualPercent ?? saved?.actualPercent ?? 0),
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

  const chartWidth = isMobile ? Math.max(windowWidth - 56, 320) : 760;
  const chartHeight = isMobile ? 220 : 240;
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

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportXLSX = () => {
    const data = [
      ['Snapshot date', 'Baseline %', 'Actual %', 'Notes'],
      ...rows.map((row) => [fmtDate(row.snapshotDate), row.baselinePercent, row.actualPercent, row.note || '']),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    XLSX.writeFile(wb, `${project.code || project.name}-summary.xlsx`);
  };

  const exportGraphImage = () => {
    const svgElement = svgRef.current;
    if (!svgElement) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = svgElement.clientWidth * scale;
      canvas.height = svgElement.clientHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        toast.error('Unable to export graph image');
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((result) => {
        if (result) {
          downloadBlob(result, `${project.code || project.name}-summary-graph.png`);
          toast.success('Graph image exported');
        } else {
          toast.error('Unable to export graph image');
        }
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error('Unable to export graph image');
    };
    image.src = url;
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFont('helvetica');
    doc.setFontSize(14);
    doc.setFillColor(241, 245, 255);
    doc.rect(14, 10, 268, 20, 'F');
    doc.setTextColor(15, 23, 42);
    doc.text(`${project.name} · Project Summary`, 16, 24);
    doc.setFontSize(10);
    doc.text(`Snapshot count: ${rows.length} · Export date: ${fmtDate(new Date().toISOString())}`, 16, 30);

    const graphX = 14;
    const graphY = 36;
    const graphW = 240;
    const graphH = 90;
    const graphBottom = graphY + graphH;
    const graphLeft = graphX + 20;

    doc.setDrawColor(226, 232, 240);
    for (let i = 0; i <= 4; i += 1) {
      const y = graphY + (graphH * i) / 4;
      doc.line(graphLeft, y, graphLeft + graphW, y);
    }

    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(1.6);
    const baselinePoints = rows.map((row, index) => {
      const x = graphLeft + (graphW * index) / Math.max(rows.length - 1, 1);
      const y = graphY + graphH * (1 - row.baselinePercent / 100);
      return { x, y, percent: row.baselinePercent };
    });
    baselinePoints.forEach((pt, index) => {
      if (index > 0) {
        const prev = baselinePoints[index - 1];
        doc.line(prev.x, prev.y, pt.x, pt.y);
      }
      doc.circle(pt.x, pt.y, 1.5, 'F');
      doc.setFontSize(7);
      doc.setTextColor(79, 70, 229);
      doc.text(`${pt.percent}%`, pt.x, pt.y - 4, { align: 'center' });
    });

    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(1.6);
    const actualPoints = rows.map((row, index) => {
      const x = graphLeft + (graphW * index) / Math.max(rows.length - 1, 1);
      const y = graphY + graphH * (1 - row.actualPercent / 100);
      return { x, y, percent: row.actualPercent };
    });
    actualPoints.forEach((pt, index) => {
      if (index > 0) {
        const prev = actualPoints[index - 1];
        doc.line(prev.x, prev.y, pt.x, pt.y);
      }
      doc.circle(pt.x, pt.y, 1.5, 'F');
      doc.setFontSize(7);
      doc.setTextColor(16, 185, 129);
      doc.text(`${pt.percent}%`, pt.x, pt.y + 6, { align: 'center' });
    });

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('0%', graphLeft - 12, graphBottom);
    doc.text('100%', graphLeft - 12, graphY + 3);
    rows.forEach((row, index) => {
      const x = graphLeft + (graphW * index) / Math.max(rows.length - 1, 1);
      doc.text(fmtDate(row.snapshotDate), x, graphBottom + 8, { align: 'center' });
    });
    doc.text('Snapshot', graphLeft + graphW / 2, graphBottom + 16, { align: 'center' });

    const body = rows.map((row) => [
      fmtDate(row.snapshotDate),
      `${row.baselinePercent}%`,
      `${row.actualPercent}%`,
      row.note || '–',
    ]);

    autoTable(doc, {
      startY: graphBottom + 24,
      head: [['Snapshot', 'Baseline %', 'Actual %', 'Notes']],
      body,
      theme: 'grid',
      headStyles: { fillColor: '#F8FAFC', textColor: '#0F172A', halign: 'left' },
      styles: { fontSize: 9, cellPadding: 3 },
    });
    doc.save(`${project.code || project.name}-project-summary.pdf`);
  };

  return (
    <div style={{ padding: 24, background: C.bg2, minHeight: '100%', fontFamily: 'Poppins, sans-serif' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18, alignItems: 'center', padding: 18, borderRadius: 18, background: '#EFF6FF' }}>
        <h3 style={{ margin: 0, fontSize: 18, color: C.text }}>Project Summary</h3>
        <span style={{ color: C.text2, fontSize: 12 }}>15-day baseline progress with actual tracking and snapshot persistence.</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn variant="outline" onClick={refreshBaseline} small disabled={refreshing || savingSnapshot !== null}>
            {refreshing ? 'Recalculating…' : 'Recalculate baseline'}
          </Btn>
          <Btn variant="ghost" onClick={exportXLSX} small>Export Excel</Btn>
          <Btn variant="ghost" onClick={exportGraphImage} small>Export Image</Btn>
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
        <div style={{ overflowX: isMobile ? 'hidden' : 'auto' }}>
          <svg ref={svgRef} width={chartWidth} height={chartHeight} style={{ display: 'block', fontFamily: 'Poppins, sans-serif', width: '100%', maxWidth: chartWidth }}>
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
                <text x={pt.x} y={pt.baselineY - 8} textAnchor="middle" fontSize={8} fill={C.primary}>{pt.baselinePercent}%</text>
                <circle cx={pt.x} cy={pt.actualY} r={4} fill={C.green} />
                <text x={pt.x} y={pt.actualY + 16} textAnchor="middle" fontSize={8} fill={C.green}>{pt.actualPercent}%</text>
                <text x={pt.x} y={chartHeight - chartMargin.bottom + 16} textAnchor="middle" fontSize={9} fill={C.text2}>{fmtDate(pt.snapshotDate)}</text>
              </g>
            ))}
          </svg>
        </div>
      </Card>

      <div>
        {isMobile ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {rows.map((row) => (
              <Card key={row.snapshotDate} style={{ padding: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <div style={{ minWidth: 0, flex: '1 1 120px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{fmtDate(row.snapshotDate)}</div>
                    <div style={{ marginTop: 4, fontSize: 9, color: C.text2, lineHeight: 1.3, maxWidth: 160, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.note || 'No notes yet'}</div>
                  </div>
                  <div style={{ display: 'grid', gap: 4, minWidth: 80, textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: C.text2 }}>Baseline</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>{row.baselinePercent}%</div>
                    <div style={{ fontSize: 9, color: C.text2 }}>Actual</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{row.actualPercent}%</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={row.actualInput}
                    onChange={(e) => handleActualChange(row.snapshotDate, e.target.value)}
                    placeholder="0-100"
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: 'Poppins, sans-serif' }}
                  />
                  <textarea
                    rows={1}
                    value={row.note}
                    onChange={(e) => handleNoteChange(row.snapshotDate, e.target.value)}
                    style={{ width: '100%', minWidth: 0, padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: 'Poppins, sans-serif', resize: 'vertical', lineHeight: 1.3, maxHeight: 48, overflow: 'hidden' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Btn variant={row.dirty ? 'primary' : 'outline'} small onClick={() => handleSave(row.snapshotDate)} disabled={!row.dirty || savingSnapshot === row.snapshotDate}>
                    {savingSnapshot === row.snapshotDate ? 'Saving…' : row.dirty ? 'Save' : 'Saved'}
                  </Btn>
                  {row.id && (
                    <Btn variant="danger" small onClick={() => handleDelete(row.id, row.snapshotDate)} disabled={savingSnapshot === row.snapshotDate}>
                      Delete
                    </Btn>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
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
                        value={row.actualInput}
                        onChange={(e) => handleActualChange(row.snapshotDate, e.target.value)}
                        placeholder=""
                        style={{ width: 72, padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'Poppins, sans-serif' }}
                      />
                    </td>
                    <td style={TD}>
                      <textarea
                        rows={1}
                        value={row.note}
                        onChange={(e) => handleNoteChange(row.snapshotDate, e.target.value)}
                        style={{ width: '100%', minWidth: 220, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'Poppins, sans-serif', resize: 'vertical' }}
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
        )}
      </div>
    </div>
  );
}
