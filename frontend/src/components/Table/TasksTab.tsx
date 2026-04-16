import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Download, ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useStore } from '../../store';
import { taskApi } from '../../services/api';
import { Btn, EditableCell, Avatar, Modal, FormRow, Input, Select, C } from '../Common';
import { flattenTree, hasChildren, calcDuration, fmtDate, fmtMonth, compareWbs, isoToDmy, dmyToIso } from '../../utils';
import GanttChart, { ZOOM_LEVELS } from '../Gantt/GanttChart';
import type { Task, ViewMode } from '../../types';

interface Props { projectId: string; }

export const ROW_H = 36;
export const HDR_H = 48;   // unified header height for both table and gantt

// Columns for table view
const COLS = [
  { label: 'WBS',           w: 52  },
  { label: 'Task Name',     w: 200 },
  { label: 'Start',         w: 94  },
  { label: 'Finish',        w: 94  },
  { label: 'Actual Finish', w: 100 },
  { label: 'Days',          w: 46  },
  { label: '% Done',        w: 110 },
  { label: 'Resource',      w: 116 },
  { label: '',              w: 76  },
];
const TABLE_FIXED_W = 52 + 94 + 94 + 100 + 46 + 110 + 116 + 76;

// Inline % editor
function PctCell({ value, isParent, onSave }: { value: number; isParent: boolean; onSave: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(String(value));
  const color = value >= 100 ? C.green : value >= 60 ? C.blue : C.primary;
  const commit = () => {
    setEditing(false);
    const n = Math.min(100, Math.max(0, parseInt(draft) || 0));
    if (n !== value) onSave(n);
    setDraft(String(n));
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
      <div style={{ flex: 1, height: 5, background: C.bg2, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      {editing && !isParent ? (
        <input autoFocus type="number" min={0} max={100} value={draft}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          style={{ width: 44, textAlign: 'right', border: `1.5px solid ${C.primary}`, borderRadius: 5, padding: '1px 4px', fontSize: 12, fontFamily: 'Poppins, sans-serif', outline: 'none', background: C.primaryBg }}
        />
      ) : (
        <span onClick={() => !isParent && setEditing(true)}
          title={isParent ? 'Auto-calculated' : 'Click to edit'}
          style={{ fontSize: 11, fontWeight: 700, color: isParent ? C.text3 : color, width: 36, textAlign: 'right', cursor: isParent ? 'default' : 'pointer', flexShrink: 0 }}>
          {value}%
        </span>
      )}
    </div>
  );
}

export default function TasksTab({ projectId }: Props) {
  const { tasks, fetchTasks, createTask, updateTask, deleteTask } = useStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView]         = useState<ViewMode>('split');
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Task | null>(null);
  const [loading, setLoading]   = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [splitW, setSplitW]     = useState(630);
  const [zoomIndex, setZoomIndex] = useState(3); // default = Week

  // Scroll sync
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const ganttBodyRef = useRef<HTMLDivElement>(null);
  const syncing      = useRef(false);

  // Resize drag
  const dragRef    = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  useEffect(() => {
    setLoading(true);
    fetchTasks(projectId).finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    const parentIds = new Set(
      tasks.filter(t => t.projectId === projectId && t.parentId).map(t => t.parentId)
    );
    setExpanded(parentIds);
  }, [tasks.length, projectId]);

  const projectTasks = tasks.filter(t => t.projectId === projectId);
  const visible      = flattenTree(projectTasks, expanded);
  const isTableView = view === 'table';

  const toggle = (id: string) => setExpanded(p => {
    const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s;
  });

  const handleUpdate = useCallback(async (id: string, updates: Partial<Task>) => {
    try { await updateTask(id, updates); }
    catch { toast.error('Failed to save'); }
  }, [updateTask]);

  const handlePct = useCallback(async (id: string, pct: number) => {
    try {
      const res = await taskApi.setComplete(id, pct);
      useStore.setState({ tasks: res.allTasks ?? useStore.getState().tasks });
    } catch { toast.error('Failed to save'); }
  }, []);

  const handleDelete = async (id: string) => {
    try { await deleteTask(id); toast.success('Deleted'); }
    catch { toast.error('Failed to delete'); }
  };

  const handleCreate = async (form: Partial<Task>) => {
    try { await createTask({ ...form, projectId }); toast.success('Task created'); setAddModal(false); }
    catch { toast.error('Failed to create'); }
  };

  const handleEditSave = async (form: Partial<Task>) => {
    if (!form.id) return;
    try { await updateTask(form.id, form); toast.success('Saved'); setEditModal(null); }
    catch { toast.error('Failed to save'); }
  };

  // Scroll sync
  const onTableScroll = useCallback(() => {
    if (syncing.current || !tableBodyRef.current || !ganttBodyRef.current) return;
    syncing.current = true;
    ganttBodyRef.current.scrollTop = tableBodyRef.current.scrollTop;
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);
  const onGanttScroll = useCallback(() => {
    if (syncing.current || !tableBodyRef.current || !ganttBodyRef.current) return;
    syncing.current = true;
    tableBodyRef.current.scrollTop = ganttBodyRef.current.scrollTop;
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  // Resize handlers
  const onResizeStart = (e: React.MouseEvent) => {
    dragRef.current    = true;
    dragStartX.current = e.clientX;
    dragStartW.current = splitW;
    e.preventDefault();
  };
  const onResizeMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const delta = e.clientX - dragStartX.current;
    setSplitW(Math.max(300, Math.min(900, dragStartW.current + delta)));
  }, []);
  const onResizeEnd = useCallback(() => { dragRef.current = false; }, []);
  useEffect(() => {
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
    return () => { window.removeEventListener('mousemove', onResizeMove); window.removeEventListener('mouseup', onResizeEnd); };
  }, [onResizeMove, onResizeEnd]);

  // ── XLSX export ──────────────────────────────────────────────────────────
  const exportXLSX = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['WBS','Task Name','Start','Finish','Actual Finish','Days','% Done','Resource'],
      ...projectTasks.map(t => [t.wbs, t.taskName, t.startDate, t.endDate, t.actualFinish || '', t.duration, t.percentComplete, t.resource]),
    ]);
    ws['!cols'] = [{wch:8},{wch:35},{wch:14},{wch:14},{wch:14},{wch:8},{wch:10},{wch:20}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.writeFile(wb, `tasks-${projectId}.xlsx`);
    toast.success('Exported XLSX'); setShowExport(false);
  };

  // ── PDF export: left=table, right=Gantt, 1 task per line ─────────────────
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const proj = useStore.getState().activeProject;

    // Header band
    doc.setFillColor(79,70,229); doc.rect(0,0,W,18,'F');
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
    doc.text(`${proj?.name ?? projectId} - Task Plan + Gantt`, 10, 11);
    doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, W-10, 11, { align:'right' });
    doc.setTextColor(0);

    const startY = 22;
    const tableW = 160; // wider task table for readable task name
    const ganttX = tableW + 12; // start of gantt area
    const ganttW = W - ganttX - 6;
    const baseRowH = 5.2; // mm per row (minimum)
    const headerH = 7;
    const taskTextX = 20;
    const taskTextW = 90;

    // Flatten all tasks for display (with indentation in name)
    const allVisible = [...projectTasks].sort((a, b) => compareWbs(a.wbs, b.wbs));
    const getRowHeight = (task: Task): number => {
      const indent = task.level * 2.5;
      doc.setFont('helvetica', hasChildren(projectTasks, task.id) ? 'bold' : 'normal');
      doc.setFontSize(5.4);
      const lines = doc.splitTextToSize(task.taskName || '', Math.max(8, taskTextW - indent));
      const lineCount = Math.max(1, (Array.isArray(lines) ? lines.length : 1));
      return Math.max(baseRowH, 2.6 + Math.min(4, lineCount) * 2.0);
    };

    const maxBodyH = H - startY - headerH - 10;
    const pageTaskRows: Task[][] = [];
    let currentPageRows: Task[] = [];
    let usedHeight = 0;
    allVisible.forEach((task) => {
      const h = getRowHeight(task);
      if (currentPageRows.length > 0 && usedHeight + h > maxBodyH) {
        pageTaskRows.push(currentPageRows);
        currentPageRows = [task];
        usedHeight = h;
      } else {
        currentPageRows.push(task);
        usedHeight += h;
      }
    });
    if (currentPageRows.length > 0 || pageTaskRows.length === 0) pageTaskRows.push(currentPageRows);
    const totalPages = pageTaskRows.length;

    const validTasks = allVisible.filter(t => t.startDate && t.endDate);
    const allDates = validTasks.flatMap(t => [new Date(t.startDate), new Date(t.endDate)]);
    const minD = allDates.length ? new Date(Math.min(...allDates.map(d => d.getTime()))) : new Date();
    const maxD = allDates.length ? new Date(Math.max(...allDates.map(d => d.getTime()))) : new Date();
    const totalDays = Math.max(1, Math.round((maxD.getTime() - minD.getTime()) / 86400000));
    const dayPx = ganttW / totalDays;

    for (let page = 0; page < totalPages; page += 1) {
      if (page > 0) doc.addPage('a4', 'landscape');

      const pageRows = pageTaskRows[page] || [];

      doc.setFillColor(79,70,229);
      doc.rect(6, startY, tableW, headerH, 'F');
      doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
      const cols = [
        { label: 'WBS',   x: 8 },
        { label: 'Task',  x: taskTextX },
        { label: 'Start', x: 110 },
        { label: 'Finish',x: 128 },
        { label: '%',     x: 145 },
        { label: 'Days',  x: 154 },
      ];
      cols.forEach(c => doc.text(c.label, c.x, startY + 5));

      // Gantt header
      doc.setFillColor(245,247,250);
      doc.rect(ganttX, startY, ganttW, headerH, 'F');
      doc.setDrawColor(79,70,229); doc.setLineWidth(0.3);
      doc.rect(ganttX, startY, ganttW, headerH, 'S');
      doc.setFontSize(6); doc.setFont('helvetica','bold'); doc.setTextColor(79,70,229);

      const cur = new Date(minD.getFullYear(), minD.getMonth(), 1);
      while (cur <= maxD) {
        const offD = Math.round((cur.getTime() - minD.getTime()) / 86400000);
        if (offD >= 0) {
          const lx = ganttX + offD * dayPx;
          doc.setDrawColor(200,210,230); doc.setLineWidth(0.1);
          doc.line(lx, startY, lx, startY + headerH);
          const monthLabel = cur.toLocaleString('en', { month: 'short', year: '2-digit' });
          if (lx + 12 < ganttX + ganttW) doc.text(monthLabel, lx + 1, startY + 5);
        }
        cur.setMonth(cur.getMonth() + 1);
      }

      const todayOff = Math.round((new Date().getTime() - minD.getTime()) / 86400000);
      const todayX = ganttX + todayOff * dayPx;

      doc.setFont('helvetica','normal');
      let yCursor = startY + headerH;
      pageRows.forEach((task, i) => {
        const ry = yCursor;
        const rowH = getRowHeight(task);

        if (i % 2 === 0) { doc.setFillColor(248,250,252); doc.rect(6, ry, tableW, rowH, 'F'); }
        doc.setDrawColor(226,232,240); doc.setLineWidth(0.15);
        doc.line(6, ry + rowH, 6 + tableW, ry + rowH);

        const isPar = hasChildren(projectTasks, task.id);
        const indent = task.level * 2.5;

        doc.setFontSize(5.8); doc.setTextColor(90);
        doc.text(task.wbs || '', 8, ry + Math.min(rowH - 1.2, 4.6));

        doc.setFont('helvetica', isPar ? 'bold' : 'normal');
        doc.setTextColor(isPar ? 65 : 30, isPar ? 65 : 30, isPar ? 155 : 30);
        doc.setFontSize(5.4);
        const nameLines = doc.splitTextToSize(task.taskName || '', Math.max(8, taskTextW - indent));
        doc.text(nameLines, taskTextX + indent, ry + 2.9, { maxWidth: Math.max(8, taskTextW - indent) });

        doc.setFont('helvetica','normal'); doc.setTextColor(80); doc.setFontSize(5.1);
        const ym = ry + rowH / 2 + 0.6;
        doc.text(task.startDate ? fmtDate(task.startDate) : '', 110, ym);
        doc.text(task.endDate ? fmtDate(task.endDate) : '', 128, ym);

        const pct = task.percentComplete;
        const [pr,pg,pb] = pct >= 100 ? [16,185,129] : pct >= 60 ? [59,130,246] : [79,70,229];
        doc.setFont('helvetica','bold'); doc.setTextColor(pr,pg,pb); doc.setFontSize(5.2);
        doc.text(`${pct}%`, 145, ym);

        doc.setFont('helvetica','normal'); doc.setTextColor(80);
        doc.text(`${task.duration}d`, 154, ym);

        // Gantt bar
        doc.setDrawColor(226,232,240); doc.setLineWidth(0.1);
        doc.line(ganttX, ry + rowH, ganttX + ganttW, ry + rowH);
        if (task.startDate && task.endDate) {
          const s2 = Math.round((new Date(task.startDate).getTime() - minD.getTime()) / 86400000);
          const e2 = Math.round((new Date(task.endDate).getTime() - minD.getTime()) / 86400000);
          const bx = ganttX + s2 * dayPx;
          const bw = Math.max((e2 - s2) * dayPx, 1);
          const by = ry + 1;
          const bh = rowH - 2;
          const fw = bw * (task.percentComplete / 100);

          doc.setFillColor(238,242,255); doc.setDrawColor(79,70,229); doc.setLineWidth(0.12);
          doc.roundedRect(bx, by, bw, bh, 0.4, 0.4, 'FD');
          if (fw > 0.3) {
            const [r,g,b] = task.percentComplete >= 100 ? [16,185,129] : task.percentComplete >= 60 ? [59,130,246] : [79,70,229];
            doc.setFillColor(r,g,b);
            doc.roundedRect(bx, by, fw, bh, 0.4, 0.4, 'F');
          }
        }

        yCursor += rowH;
      });

      if (todayOff >= 0 && todayOff <= totalDays) {
        doc.setDrawColor(239,68,68); doc.setLineWidth(0.3);
        doc.line(todayX, startY + headerH, todayX, yCursor);
      }

      doc.setDrawColor(79,70,229); doc.setLineWidth(0.3);
      doc.line(ganttX - 3, startY, ganttX - 3, yCursor);

      doc.setFontSize(6); doc.setTextColor(160);
      doc.text('ProjectMS - Task Plan + Gantt', 10, H - 4);
      doc.text(`Page ${page + 1} of ${totalPages}`, W - 10, H - 4, { align: 'right' });
    }

    doc.save(`tasks-gantt-${projectId}.pdf`);
    toast.success('Exported PDF'); setShowExport(false);
  };

  // ── Table content ─────────────────────────────────────────────────────────
  const tableContent = (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Table header — same height as Gantt header (HDR_H) */}
      <div style={{ display:'flex', background:C.bg, borderBottom:`1px solid ${C.border}`, flexShrink:0, height:HDR_H }}>
        {COLS.map(c => (
          <div key={c.label} style={{
            width: c.label === 'Task Name' ? (isTableView ? `calc(100% - ${TABLE_FIXED_W}px)` : c.w) : c.w,
            minWidth: c.label === 'Task Name' ? (isTableView ? 380 : c.w) : c.w,
            padding:'0 8px', fontSize:10, fontWeight:700, color:C.text2, textTransform:'uppercase', letterSpacing:'0.05em', flexShrink:0, display:'flex', alignItems:'center'
          }}>
            {c.label}
          </div>
        ))}
      </div>
      <div ref={tableBodyRef} onScroll={onTableScroll}
        style={{ flex:1, overflowY:'scroll', overflowX:isTableView?'hidden':'auto' }}>
        {loading && <div style={{ padding:40, textAlign:'center', color:C.text3 }}>Loading...</div>}
        {!loading && visible.map((task, i) => {
          const isPar = hasChildren(projectTasks, task.id);
          const isExp = expanded.has(task.id);
          const isSel = selected === task.id;
          const isChild = !!task.parentId;
          return (
            <div key={task.id} onClick={() => setSelected(task.id)}
              style={{ display:'flex', alignItems:'center', height:ROW_H, borderBottom:`1px solid ${C.border}`, background: isSel?C.primaryBg:i%2===0?C.white:C.bg, borderLeft: isSel?`3px solid ${C.primary}`:'3px solid transparent', cursor:'pointer', flexShrink:0 }}>
              <div style={{ width:52, minWidth:52, padding:'0 8px', fontSize:10, color:C.text3, fontFamily:'monospace', flexShrink:0 }}>{task.wbs}</div>
              <div style={{
                width:isTableView?`calc(100% - ${TABLE_FIXED_W}px)`:200,
                minWidth:isTableView?380:200,
                padding:`0 4px 0 ${8+task.level*20}px`,
                display:'flex', alignItems:'center', gap:4, flexShrink:0
              }}>
                {isPar ? (
                  <button onClick={e=>{ e.stopPropagation(); toggle(task.id); }}
                    style={{ width:18, height:18, background:C.primaryBg, border:`1px solid ${C.primary}33`, borderRadius:4, cursor:'pointer', color:C.primary, padding:0, fontSize:11, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {isExp?'▾':'▸'}
                  </button>
                ) : (
                  <span style={{ width:18, flexShrink:0, display:'inline-flex', justifyContent:'center' }}>
                    {isChild && <span style={{ color:C.border2, fontSize:10 }}>└</span>}
                  </span>
                )}
                {isPar && <span style={{ color:C.primary, fontSize:9, flexShrink:0 }}>◆</span>}
                <EditableCell value={task.taskName} onSave={v=>handleUpdate(task.id,{taskName:v})} />
              </div>
              <div style={{ width:94, minWidth:94, padding:'0 6px', flexShrink:0 }}>
                <EditableCell value={task.startDate} type="date" onSave={v=>handleUpdate(task.id,{startDate:v})} style={{ color:isPar?C.text3:C.text }} />
              </div>
              <div style={{ width:94, minWidth:94, padding:'0 6px', flexShrink:0 }}>
                <EditableCell value={task.endDate} type="date" onSave={v=>handleUpdate(task.id,{endDate:v})} style={{ color:isPar?C.text3:C.text }} />
              </div>
              <div style={{ width:100, minWidth:100, padding:'0 6px', flexShrink:0 }}>
                <EditableCell value={task.actualFinish||''} type="date" onSave={v=>handleUpdate(task.id,{actualFinish:v})} placeholder="—" style={{ color:task.actualFinish?C.green:C.text3 }} />
              </div>
              <div style={{ width:46, minWidth:46, padding:'0 6px', fontSize:11, color:C.text2, fontFamily:'monospace', flexShrink:0 }}>{task.duration}d</div>
              <div style={{ width:110, minWidth:110, padding:'0 6px', flexShrink:0 }}>
                <PctCell value={task.percentComplete} isParent={isPar} onSave={n=>handlePct(task.id,n)} />
              </div>
              <div style={{ width:116, minWidth:116, padding:'0 6px', display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                {task.resource && <Avatar name={task.resource} size={20} />}
                <EditableCell value={task.resource} onSave={v=>handleUpdate(task.id,{resource:v})} placeholder="Assign..." />
              </div>
              <div style={{ width:76, minWidth:76, padding:'0 5px', flexShrink:0, display:'flex', gap:4 }}>
                <button onClick={e=>{ e.stopPropagation(); setEditModal(task); }}
                  style={{ height:22, padding:'0 7px', background:C.primaryBg, border:'none', borderRadius:5, cursor:'pointer', color:C.primary, fontSize:11, fontWeight:600 }}>Edit</button>
                <button onClick={e=>{ e.stopPropagation(); handleDelete(task.id); }}
                  style={{ width:22, height:22, background:C.redBg, border:'none', borderRadius:5, cursor:'pointer', color:C.red, fontSize:11 }}>✕</button>
              </div>
            </div>
          );
        })}
        {!loading && visible.length===0 && (
          <div style={{ padding:40, textAlign:'center', color:C.text3 }}>No tasks. Click "+ Add Task".</div>
        )}
      </div>
      <div style={{ flexShrink:0, padding:'5px 12px', borderTop:`1px solid ${C.border}`, display:'flex', gap:16, fontSize:11, color:C.text3 }}>
        <span>{projectTasks.filter(t=>!t.parentId).length} root</span>
        <span>{projectTasks.length} total</span>
        <span>{Math.round(projectTasks.reduce((s,t)=>s+t.percentComplete,0)/Math.max(projectTasks.length,1))}% avg</span>
      </div>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Sub-toolbar with zoom controls */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.white }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ display:'flex', gap:3, background:C.bg, borderRadius:8, padding:3 }}>
            {(['table','split','gantt'] as ViewMode[]).map(m => (
              <button key={m} onClick={()=>setView(m)}
                style={{ padding:'5px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'Poppins, sans-serif', background:view===m?C.white:C.bg, color:view===m?C.primary:C.text2, boxShadow:view===m?C.shadow:'none', transition:'all 0.15s' }}>
                {m==='table'?'☰ Table':m==='split'?'⊟ Split':'▦ Gantt'}
              </button>
            ))}
          </div>
          {/* Zoom controls (visible when Gantt is showing) */}
          {(view==='split'||view==='gantt') && (
            <div style={{ display:'flex', gap:4, alignItems:'center', marginLeft:8 }}>
              <button onClick={()=>setZoomIndex(Math.max(0, zoomIndex-1))}
                disabled={zoomIndex===0}
                style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:6, padding:'4px 7px', cursor:zoomIndex===0?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:3, fontSize:11, color:C.text2, fontFamily:'Poppins, sans-serif', opacity:zoomIndex===0?0.4:1 }}
                title="Zoom out">
                <ZoomOut size={13} />
              </button>
              <span style={{ fontSize:11, fontWeight:600, color:C.primary, minWidth:56, textAlign:'center', fontFamily:'Poppins, sans-serif' }}>
                {ZOOM_LEVELS[zoomIndex].name}
              </span>
              <button onClick={()=>setZoomIndex(Math.min(ZOOM_LEVELS.length-1, zoomIndex+1))}
                disabled={zoomIndex===ZOOM_LEVELS.length-1}
                style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:6, padding:'4px 7px', cursor:zoomIndex===ZOOM_LEVELS.length-1?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:3, fontSize:11, color:C.text2, fontFamily:'Poppins, sans-serif', opacity:zoomIndex===ZOOM_LEVELS.length-1?0.4:1 }}
                title="Zoom in">
                <ZoomIn size={13} />
              </button>
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:8, position:'relative' }}>
          <div style={{ position:'relative' }}>
            <Btn variant="ghost" small onClick={()=>setShowExport(v=>!v)}>
              <Download size={13} /> Export <ChevronDown size={11} />
            </Btn>
            {showExport && (
              <div style={{ position:'absolute', right:0, top:'110%', background:C.white, border:`1px solid ${C.border}`, borderRadius:10, boxShadow:C.shadow2, zIndex:50, minWidth:160, overflow:'hidden' }}>
                {[['📊 Excel (.xlsx)', exportXLSX],['📄 PDF + Gantt', exportPDF]].map(([label, fn]) => (
                  <button key={label as string} onClick={fn as ()=>void}
                    style={{ display:'block', width:'100%', padding:'10px 16px', textAlign:'left', border:'none', background:'none', cursor:'pointer', fontSize:13, color:C.text, fontFamily:'Poppins, sans-serif' }}
                    onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                    onMouseLeave={e=>e.currentTarget.style.background='none'}>
                    {label as string}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Btn small onClick={()=>setAddModal(true)}><Plus size={13} /> Add Task</Btn>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:'hidden', display:'flex' }}>
        {(view==='table'||view==='split') && (
          <div style={{ width:view==='split'?splitW:undefined, flex:view==='table'?1:undefined, minWidth:300, overflow:'hidden', display:'flex', flexDirection:'column', flexShrink:0 }}>
            {tableContent}
          </div>
        )}
        {/* Resizable divider */}
        {view==='split' && (
          <div onMouseDown={onResizeStart}
            style={{ width:6, cursor:'col-resize', background:'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}
            onMouseEnter={e=>e.currentTarget.style.background=C.primaryBg}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{ width:2, height:40, background:C.border2, borderRadius:2 }} />
          </div>
        )}
        {(view==='gantt'||view==='split') && (
          <div style={{ flex:1, overflow:'hidden', minWidth:200 }}>
            <GanttChart tasks={projectTasks} visibleTasks={visible} selectedId={selected}
              onSelect={setSelected} ganttBodyRef={ganttBodyRef} onGanttScroll={onGanttScroll}
              zoomIndex={zoomIndex} onZoomChange={setZoomIndex}
              onUpdate={async(id,field,value)=>handleUpdate(id,{[field]:value})} />
          </div>
        )}
      </div>

      {addModal  && (
        <TaskModal
          tasks={projectTasks}
          selectedTask={projectTasks.find(t => t.id === selected) ?? null}
          onClose={()=>setAddModal(false)}
          onSave={handleCreate}
        />
      )}
      {editModal && <TaskEditModal task={editModal} tasks={projectTasks} onClose={()=>setEditModal(null)} onSave={handleEditSave} />}
    </div>
  );
}

function TaskModal({ tasks, selectedTask, onClose, onSave }: { tasks:Task[]; selectedTask: Task | null; onClose:()=>void; onSave:(f:Partial<Task>)=>void }) {
  const todayIso    = new Date().toISOString().split('T')[0];
  const nextWeekIso = new Date(Date.now()+7*86400000).toISOString().split('T')[0];
  const [form, setForm] = useState<Partial<Task>>({
    taskName:'',
    startDate:isoToDmy(todayIso),
    endDate:isoToDmy(nextWeekIso),
    resource:'',
    parentId:'',
    relatedTask:''
  });
  const [insertType, setInsertType] = useState<'main' | 'sub'>(selectedTask ? 'sub' : 'main');
  const formatDmyInput = (raw: string): string => {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };
  const up = (k:string,v:string) => setForm(p=>({...p,[k]:v}));
  const sortedTasks = [...tasks].sort((a, b) => compareWbs(a.wbs, b.wbs));
  const startIso = dmyToIso(String(form.startDate || ''));
  const endIso = dmyToIso(String(form.endDate || ''));
  const dur = calcDuration(startIso, endIso);
  return (
    <Modal title="New Task" onClose={onClose} width={480}>
      <FormRow label="Task Name" required>
        <input autoFocus value={form.taskName??''} onChange={e=>up('taskName',e.target.value)} placeholder="Enter task name"
          style={{ fontFamily:'Poppins, sans-serif', fontSize:13, padding:'8px 12px', border:`1.5px solid ${C.border}`, borderRadius:8, outline:'none', width:'100%', boxSizing:'border-box' }}
          onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border} />
      </FormRow>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:8 }}>
        <FormRow label="Insert Type">
          <Select
            value={insertType}
            onChange={v => setInsertType(v as 'main' | 'sub')}
            options={[
              { value: 'main', label: 'Main Task' },
              { value: 'sub', label: 'Sub Task' },
            ]}
          />
        </FormRow>
        <FormRow label="Insert Anchor">
          <div style={{ fontSize: 12, color: C.text2, paddingTop: 8 }}>
            {selectedTask ? `${selectedTask.wbs} ${selectedTask.taskName}` : 'No selected task (append at end)'}
          </div>
        </FormRow>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FormRow label="Start Date (dd/mm/yyyy)"><input value={form.startDate??''} onChange={e=>up('startDate',formatDmyInput(e.target.value))} placeholder="dd/mm/yyyy" inputMode="numeric" maxLength={10} style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}/></FormRow>
        <FormRow label="End Date (dd/mm/yyyy)"><input value={form.endDate??''} onChange={e=>up('endDate',formatDmyInput(e.target.value))} placeholder="dd/mm/yyyy" inputMode="numeric" maxLength={10} style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}/></FormRow>
      </div>
      {dur>0&&<p style={{ fontSize:12, color:C.primary, marginBottom:12 }}>Duration: <strong>{dur} days</strong></p>}
      <FormRow label="Resource">
        <input value={form.resource??''} onChange={e=>up('resource',e.target.value)} placeholder="Assigned person"
          style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
          onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border}/>
      </FormRow>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FormRow label="Parent Task">
          <Select value={form.parentId??''} onChange={v=>up('parentId',v)} options={[{value:'',label:'— None —'},...sortedTasks.map(t=>({value:t.id,label:`${t.wbs||''} ${t.taskName}`.trim()}))]} />
        </FormRow>
        <FormRow label="Predecessor (FS)">
          <Select value={form.relatedTask??''} onChange={v=>up('relatedTask',v)} options={[{value:'',label:'— None —'},...sortedTasks.map(t=>({value:t.id,label:`${t.wbs||''} ${t.taskName}`.trim()}))]} />
        </FormRow>
      </div>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{
          if(!form.taskName?.trim()) return;
          const startDate = dmyToIso(String(form.startDate || ''));
          const endDate = dmyToIso(String(form.endDate || ''));
          if (!startDate || !endDate) {
            toast.error('Start/End Date ต้องอยู่ในรูปแบบ dd/mm/yyyy');
            return;
          }

          let parentId = '';
          let order: number | undefined;

          if (insertType === 'main') {
            parentId = '';
            if (selectedTask && !selectedTask.parentId) order = Number(selectedTask.order || 0) + 0.5;
            else {
              const roots = tasks.filter(t => !t.parentId);
              const maxOrder = roots.reduce((m, t) => Math.max(m, Number(t.order || 0)), 0);
              order = maxOrder + 1;
            }
          } else {
            parentId = (form.parentId as string) || selectedTask?.id || '';
            if (!parentId) {
              toast.error('Sub Task ต้องมี Parent Task');
              return;
            }
            const siblings = tasks.filter(t => (t.parentId || '') === parentId);
            const maxOrder = siblings.reduce((m, t) => Math.max(m, Number(t.order || 0)), 0);
            order = maxOrder > 0 ? maxOrder + 0.5 : Number(selectedTask?.order || 0) + 0.5;
          }

          onSave({ ...form, parentId, order, startDate, endDate });
        }}>Create Task</Btn>
      </div>
    </Modal>
  );
}

function TaskEditModal({ task, tasks, onClose, onSave }: { task:Task; tasks:Task[]; onClose:()=>void; onSave:(f:Partial<Task>)=>void }) {
  const [form, setForm] = useState<Partial<Task>>({ ...task });
  const up = (k:string,v:string|number) => setForm(p=>({...p,[k]:v}));
  const dur = calcDuration(form.startDate??'', form.endDate??'');
  const sortedTasks = [...tasks].sort((a, b) => compareWbs(a.wbs, b.wbs));
  return (
    <Modal title="Edit Task" onClose={onClose} width={520}>
      <FormRow label="Task Name" required>
        <input autoFocus value={form.taskName??''} onChange={e=>up('taskName',e.target.value)}
          style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
          onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border}/>
      </FormRow>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FormRow label="Start Date"><input type="date" value={form.startDate??''} onChange={e=>up('startDate',e.target.value)} style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box',colorScheme:'light' }}/></FormRow>
        <FormRow label="End Date"><input type="date" value={form.endDate??''} onChange={e=>up('endDate',e.target.value)} style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box',colorScheme:'light' }}/></FormRow>
      </div>
      <FormRow label="Actual Finish Date">
        <input type="date" value={form.actualFinish??''} onChange={e=>up('actualFinish',e.target.value)}
          style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.green}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box',colorScheme:'light' }}/>
      </FormRow>
      {dur>0&&<p style={{ fontSize:12, color:C.primary, marginBottom:12 }}>Duration: <strong>{dur} days</strong></p>}
      <FormRow label="% Complete">
        <input type="number" min={0} max={100} value={form.percentComplete??0} onChange={e=>up('percentComplete',Math.min(100,Math.max(0,Number(e.target.value))))}
          style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}/>
      </FormRow>
      <FormRow label="Resource">
        <input value={form.resource??''} onChange={e=>up('resource',e.target.value)} placeholder="Assigned person"
          style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
          onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border}/>
      </FormRow>
      <FormRow label="Parent Task (change to restructure)">
        <Select value={form.parentId??''} onChange={v=>up('parentId',v)}
          options={[{value:'',label:'— None (Root) —'},...sortedTasks.filter(t=>t.id!==task.id).map(t=>({value:t.id,label:`${t.wbs||''} ${t.taskName}`.trim()}))]} />
      </FormRow>
      <FormRow label="Predecessor (FS)">
        <Select value={form.relatedTask??''} onChange={v=>up('relatedTask',v)}
          options={[{value:'',label:'— None —'},...sortedTasks.filter(t=>t.id!==task.id).map(t=>({value:t.id,label:`${t.wbs||''} ${t.taskName}`.trim()}))]} />
      </FormRow>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{ if(!form.taskName?.trim()) return; onSave(form); }}>Save Changes</Btn>
      </div>
    </Modal>
  );
}
