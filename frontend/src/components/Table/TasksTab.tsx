import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Download, ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useStore } from '../../store';
import { taskApi } from '../../services/api';
import { Btn, EditableCell, Avatar, Card, Modal, FormRow, Input, Select, C } from '../Common';
import { flattenTree, hasChildren, calcDuration, fmtDate, fmtMonth, compareWbs, isoToDmy, dmyToIso, formatNameWithLastInitial, PROCESS_STATUS_STYLE } from '../../utils';
import GanttChart, { ZOOM_LEVELS } from '../Gantt/GanttChart';
import type { Task, ViewMode } from '../../types';

interface Props { projectId: string; }

export const ROW_H = 36;
export const HDR_H = 48;   // unified header height for both table and gantt

// Columns for table view
const COLS = [
  { label: 'WBS',           w: 52  },
  { label: 'Task Name',     w: 320 },
  { label: 'Start',         w: 94  },
  { label: 'Finish',        w: 94  },
  { label: 'Actual Finish', w: 120 },
  { label: 'Days',          w: 46  },
  { label: '% Done',        w: 120 },
  { label: 'Resource',      w: 160 },
  { label: '',              w: 76  },
];
const TABLE_FIXED_W = 52 + 94 + 94 + 120 + 46 + 120 + 160 + 76;

const PHASE_OPTIONS = [
  'Project Initiation',
  'Requirement & Gap Analysis',
  'Business Blueprint',
  'System Configuration',
  'Data Migration',
  'UAT & Parallel Run',
  'Go-live & Hypercare',
] as const;

const TASK_STATUS_OPTIONS = ['Todo', 'In Progress', 'Block/Delay', 'Done'] as const;

type TaskStatus = (typeof TASK_STATUS_OPTIONS)[number];
type TaskRow = Task | NewTaskInsert;

type InsertAction =
  | 'main-before'
  | 'main-after'
  | 'sub-before'
  | 'sub-after'
  | 'child-under'
  | 'child-before'
  | 'child-after';

interface NewTaskInsert {
  id: string;
  anchorId: string;
  parentId: string;
  action: InsertAction;
  order: number;
  taskName: string;
  startDate: string;
  endDate: string;
  actualFinish: string;
  resource: string;
  percentComplete: number;
  phase: string;
  level: number;
}

function isNewTaskInsert(task: TaskRow): task is NewTaskInsert {
  return String(task.id).startsWith('new-');
}

function getTaskStatus(task: Task): TaskStatus {
  const status = String(task.status || '');
  if (status === 'Review') return 'Block/Delay';
  if (TASK_STATUS_OPTIONS.includes(status as TaskStatus)) {
    return status as TaskStatus;
  }
  if (task.percentComplete === 0) return 'Todo';
  if (task.percentComplete === 100) return 'Done';
  return 'In Progress';
}

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
  const { tasks, members, activeProject, fetchTasks, createTask, updateTask, deleteTask } = useStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView]         = useState<ViewMode>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'table' : 'split');
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Task | null>(null);
  const [loading, setLoading]   = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;
  const [buttonFocus, setButtonFocus] = useState<'expand' | 'collapse' | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; task: Task | null; taskLevel: number }>({ visible: false, x: 0, y: 0, task: null, taskLevel: 0 });
  const [newTaskInsert, setNewTaskInsert] = useState<NewTaskInsert | null>(null);
  const [splitW, setSplitW]     = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(640, Math.round(window.innerWidth * 0.66));
    }
    return 630;
  });
  const [zoomIndex, setZoomIndex] = useState(3); // default = Week
  const [colWidths, setColWidths] = useState<number[]>(COLS.map((c) => c.w));
  const [addPreset, setAddPreset] = useState<{ anchorId: string | null; mode: 'main' | 'sub'; position: 'before' | 'after' | 'append' }>({
    anchorId: null,
    mode: 'main',
    position: 'append',
  });

  // Scroll sync
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const tableHeaderRef = useRef<HTMLDivElement>(null);
  const ganttBodyRef = useRef<HTMLDivElement>(null);
  const syncing      = useRef(false);

  // Column resize
  const resizingColumn = useRef<number | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const defaultWidth = Math.max(640, Math.round(window.innerWidth * 0.66));
    setSplitW(defaultWidth);
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const projectTasks = tasks.filter(t => t.projectId === projectId);
  const todayIso = new Date().toISOString().slice(0, 10);
  const nextWeekIso = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const visible = flattenTree(projectTasks, expanded);

  const getInsertMeta = (anchor: Task, action: InsertAction) => {
    if (action === 'main-before' || action === 'main-after') {
      return { parentId: '', order: Number(anchor.order || 0) + (action === 'main-before' ? -0.5 : 0.5), level: 0 };
    }

    if (action === 'sub-before' || action === 'sub-after') {
      const parentId = anchor.parentId;
      return { parentId, order: Number(anchor.order || 0) + (action === 'sub-before' ? -0.5 : 0.5), level: 1 };
    }

    if (action === 'child-before' || action === 'child-after') {
      const parentId = anchor.parentId;
      return { parentId, order: Number(anchor.order || 0) + (action === 'child-before' ? -0.5 : 0.5), level: 2 };
    }

    const children = projectTasks
      .filter((t) => t.parentId === anchor.id)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const nextOrder = children.length ? Number(children[children.length - 1].order || 0) + 1 : 1;
    return { parentId: anchor.id, order: nextOrder, level: 2 };
  };

  const getInsertIndex = (anchor: Task, action: InsertAction) => {
    const index = visible.findIndex((t) => t.id === anchor.id);
    if (index < 0) return visible.length;
    if (action.endsWith('before')) {
      return index;
    }
    const anchorLevel = anchor.level ?? 0;
    let next = index + 1;
    while (next < visible.length && (visible[next].level ?? 0) > anchorLevel) {
      next += 1;
    }
    return next;
  };

  const visibleWithInsert = newTaskInsert ? (() => {
    const result: TaskRow[] = [...visible];
    const anchor = projectTasks.find((t) => t.id === newTaskInsert.anchorId);
    if (!anchor) return result;
    const insertIndex = getInsertIndex(anchor, newTaskInsert.action);
    result.splice(insertIndex, 0, newTaskInsert);
    return result;
  })() : visible;

  const isTableView = view === 'table';
  const viewModes: ViewMode[] = isMobile ? ['table'] : ['table', 'split', 'gantt', 'kanban'];
  const kanbanColumns = TASK_STATUS_OPTIONS.map((status) => ({
    status,
    tasks: projectTasks
      .filter((t) => getTaskStatus(t) === status)
      .sort((a, b) => compareWbs(a.wbs, b.wbs)),
  }));

  const openTaskContextMenu = (task: Task) => (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const taskLevel = task.level ?? 0;
    setSelected(task.id);
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, task, taskLevel });
  };

  const getInsertMeta = (anchor: Task, action: InsertAction) => {
    const sameParentSiblings = projectTasks
      .filter((t) => t.parentId === (action === 'main-before' || action === 'main-after' ? '' : action === 'child-under' ? anchor.id : anchor.parentId))
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    if (action === 'main-before' || action === 'main-after') {
      return { parentId: '', order: Number(anchor.order || 0) + (action === 'main-before' ? -0.5 : 0.5), level: 0 };
    }

    if (action === 'sub-before' || action === 'sub-after') {
      const parentId = anchor.parentId;
      const siblingOrders = projectTasks.filter((t) => t.parentId === parentId).map((t) => Number(t.order || 0));
      const order = Number(anchor.order || 0) + (action === 'sub-before' ? -0.5 : 0.5);
      return { parentId, order, level: 1 };
    }

    if (action === 'child-before' || action === 'child-after') {
      const parentId = anchor.parentId;
      const order = Number(anchor.order || 0) + (action === 'child-before' ? -0.5 : 0.5);
      return { parentId, order, level: 2 };
    }

    // child-under
    const children = projectTasks
      .filter((t) => t.parentId === anchor.id)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const nextOrder = children.length ? Number(children[children.length - 1].order || 0) + 1 : 1;
    return { parentId: anchor.id, order: nextOrder, level: 2 };
  };

  const handleContextMenuSelect = (action: InsertAction) => {
    const anchor = contextMenu.task;
    if (!anchor) return;
    const { parentId, order, level } = getInsertMeta(anchor, action);
    setNewTaskInsert({
      id: `new-${Date.now()}`,
      anchorId: anchor.id,
      parentId,
      action,
      order,
      taskName: '',
      startDate: todayIso,
      endDate: nextWeekIso,
      actualFinish: '',
      resource: '',
      percentComplete: 0,
      phase: anchor.phase || PHASE_OPTIONS[0],
      level,
    });
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const cancelNewTask = () => setNewTaskInsert(null);

  const saveNewTask = async () => {
    if (!newTaskInsert) return;
    if (!newTaskInsert.taskName.trim()) {
      toast.error('Task Name is required');
      return;
    }
    try {
      await createTask({
        projectId,
        parentId: newTaskInsert.parentId,
        order: newTaskInsert.order,
        taskName: newTaskInsert.taskName,
        startDate: newTaskInsert.startDate,
        endDate: newTaskInsert.endDate,
        actualFinish: newTaskInsert.actualFinish,
        duration: calcDuration(newTaskInsert.startDate, newTaskInsert.endDate),
        resource: newTaskInsert.resource,
        phase: newTaskInsert.phase,
        percentComplete: newTaskInsert.percentComplete,
      });
      toast.success('Task created');
      setNewTaskInsert(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create';
      toast.error(msg || 'Failed to create');
    }
  };

  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClick = () => setContextMenu((prev) => ({ ...prev, visible: false }));
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu.visible]);

  useEffect(() => {
    if (isMobile && view !== 'table') setView('table');
  }, [isMobile, view]);

  const toggle = (id: string) => setExpanded(p => {
    const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s;
  });

  const expandAll = () => {
    const parentIds = new Set(projectTasks.filter((t) => hasChildren(projectTasks, t.id)).map((t) => t.id));
    setExpanded(parentIds);
  };

  const collapseAll = () => setExpanded(new Set());

  const handleUpdate = useCallback(async (id: string, updates: Partial<Task>) => {
    try { await updateTask(id, updates); }
    catch { toast.error('Failed to save'); }
  }, [updateTask]);

  const handleCardDragStart = useCallback((task: Task) => (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleColumnDrop = useCallback(async (status: TaskStatus, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = projectTasks.find((t) => t.id === taskId);
    if (!task) return;
    const currentStatus = getTaskStatus(task);
    if (currentStatus === status) return;
    await handleUpdate(task.id, { status });
  }, [projectTasks, handleUpdate]);

  const handleUpdateDate = useCallback(async (id: string, field: 'startDate' | 'endDate' | 'actualFinish', value: string) => {
    const raw = String(value || '').trim();
    if (!raw) {
      try { await updateTask(id, { [field]: '' }); }
      catch { toast.error('Failed to save'); }
      return;
    }
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : dmyToIso(raw);
    if (!iso) {
      toast.error('วันที่ต้องเป็นรูปแบบ DD/MM/YYYY');
      return;
    }
    try { await updateTask(id, { [field]: iso }); }
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
    catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create';
      toast.error(msg || 'Failed to create');
    }
  };

  const handleEditSave = async (form: Partial<Task>) => {
    if (!form.id) return;
    try { await updateTask(form.id, form); toast.success('Saved'); setEditModal(null); }
    catch { toast.error('Failed to save'); }
  };

  const openAddTaskDefault = () => {
    const anchor = projectTasks.find(t => t.id === selected) || null;
    setAddPreset({
      anchorId: anchor?.id || null,
      mode: anchor?.parentId ? 'sub' : 'main',
      position: 'append',
    });
    setAddModal(true);
  };

  const openInsertAround = (anchor: Task, position: 'before' | 'after') => {
    setSelected(anchor.id);
    setEditModal(null);
    setAddPreset({
      anchorId: anchor.id,
      mode: anchor.parentId ? 'sub' : 'main',
      position,
    });
    setAddModal(true);
  };

  // Scroll sync
  const onTableScroll = useCallback(() => {
    if (!tableBodyRef.current) return;
    if (tableHeaderRef.current && tableHeaderRef.current.scrollLeft !== tableBodyRef.current.scrollLeft) {
      tableHeaderRef.current.scrollLeft = tableBodyRef.current.scrollLeft;
    }
    if (syncing.current || !ganttBodyRef.current) return;
    syncing.current = true;
    ganttBodyRef.current.scrollTop = tableBodyRef.current.scrollTop;
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  const onHeaderScroll = useCallback(() => {
    if (!tableHeaderRef.current || !tableBodyRef.current) return;
    if (tableBodyRef.current.scrollLeft !== tableHeaderRef.current.scrollLeft) {
      tableBodyRef.current.scrollLeft = tableHeaderRef.current.scrollLeft;
    }
  }, []);

  const onColumnResizeStart = useCallback((index: number, e: React.MouseEvent<HTMLDivElement>) => {
    resizingColumn.current = index;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = colWidths[index];
    e.preventDefault();
    e.stopPropagation();
  }, [colWidths]);

  const onColumnResizeMove = useCallback((e: MouseEvent) => {
    if (resizingColumn.current === null) return;
    const delta = e.clientX - resizeStartX.current;
    const nextWidth = Math.max(60, resizeStartWidth.current + delta);
    setColWidths((prev) => {
      const next = [...prev];
      if (resizingColumn.current !== null) next[resizingColumn.current] = nextWidth;
      return next;
    });
  }, []);

  const onColumnResizeEnd = useCallback(() => {
    resizingColumn.current = null;
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
    setSplitW(Math.max(0, dragStartW.current + delta));
  }, []);
  const onResizeEnd = useCallback(() => { dragRef.current = false; }, []);
  useEffect(() => {
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
    window.addEventListener('mousemove', onColumnResizeMove);
    window.addEventListener('mouseup', onColumnResizeEnd);
    return () => {
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeEnd);
      window.removeEventListener('mousemove', onColumnResizeMove);
      window.removeEventListener('mouseup', onColumnResizeEnd);
    };
  }, [onResizeMove, onResizeEnd, onColumnResizeMove, onColumnResizeEnd]);

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
    const pastelPrimary: [number, number, number] = [219, 234, 254];
    const pastelPrimaryText: [number, number, number] = [49, 46, 129];
    const pastelGrid: [number, number, number] = [191, 219, 254];

    // Header band
    doc.setFillColor(...pastelPrimary); doc.rect(0,0,W,18,'F');
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(...pastelPrimaryText);
    doc.text(`${proj?.name ?? projectId} - Task Plan + Gantt`, 10, 11);
    doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, W-10, 11, { align:'right' });
    doc.setTextColor(0);

    const startY = 22;
    const tableW = 168; // include resource column
    const ganttX = tableW + 12; // start of gantt area
    const ganttW = W - ganttX - 6;
    const baseRowH = 5.2; // mm per row (minimum)
    const headerH = 7;
    const taskTextX = 20;
    const taskTextW = 78;

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

      doc.setFillColor(...pastelPrimary);
      doc.rect(6, startY, tableW, headerH, 'F');
      doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(...pastelPrimaryText);
      const cols = [
        { label: 'WBS',   x: 8 },
        { label: 'Task',  x: taskTextX },
        { label: 'Start', x: 102 },
        { label: 'Finish',x: 117 },
        { label: 'Days',  x: 132 },
        { label: '%',     x: 142 },
        { label: 'Resource', x: 150 },
      ];
      cols.forEach(c => doc.text(c.label, c.x, startY + 5));

      // Gantt header
      doc.setFillColor(245,247,250);
      doc.rect(ganttX, startY, ganttW, headerH, 'F');
      doc.setDrawColor(...pastelGrid); doc.setLineWidth(0.3);
      doc.rect(ganttX, startY, ganttW, headerH, 'S');
      doc.setFontSize(6); doc.setFont('helvetica','bold'); doc.setTextColor(...pastelPrimaryText);

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
        doc.text(task.startDate ? fmtDate(task.startDate) : '', 102, ym);
        doc.text(task.endDate ? fmtDate(task.endDate) : '', 117, ym);

        doc.setFont('helvetica','normal'); doc.setTextColor(80);
        doc.text(`${task.duration}d`, 132, ym);

        const pct = task.percentComplete;
        const [pr,pg,pb] = pct >= 100 ? [16,185,129] : pct >= 60 ? [59,130,246] : [79,70,229];
        doc.setFont('helvetica','bold'); doc.setTextColor(pr,pg,pb); doc.setFontSize(5.2);
        doc.text(`${pct}%`, 142, ym);

        doc.setFont('helvetica','normal'); doc.setTextColor(80); doc.setFontSize(5.0);
        const resourceText = String(task.resource || '-');
        const resourceOneLine = doc.splitTextToSize(resourceText, 14)[0] || '-';
        doc.text(resourceOneLine, 150, ym);

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

      doc.setDrawColor(...pastelGrid); doc.setLineWidth(0.3);
      doc.line(ganttX - 3, startY, ganttX - 3, yCursor);

      doc.setFontSize(5.5); doc.setTextColor(150);
      doc.text(`Project ID: ${proj?.code || projectId} | Client: ${proj?.client || '-'}`, 10, H - 7);
      doc.setFontSize(6); doc.setTextColor(160);
      doc.text('ProjectMS - Task Plan + Gantt', 10, H - 4);
      doc.text(`Page ${page + 1} of ${totalPages}`, W - 10, H - 4, { align: 'right' });
    }

    doc.save(`tasks-gantt-${projectId}.pdf`);
    toast.success('Exported PDF'); setShowExport(false);
  };

  // ── Table content ─────────────────────────────────────────────────────────
  const taskCardContent = (
    <div style={{ flex:1, minHeight:0, overflowY:'auto', padding: 12 }}>
      {loading && <div style={{ padding:40, textAlign:'center', color:C.text3 }}>Loading...</div>}
      {!loading && visible.map((task, i) => {
        const isPar = hasChildren(projectTasks, task.id);
        const isSel = selected === task.id;
        const isExpanded = selected === task.id;
        return (
          <Card key={task.id} style={{
            padding: 14,
            marginBottom: 12,
            background: isSel ? C.primaryBg : i % 2 === 0 ? C.white : C.bg,
            border: isSel ? `1px solid ${C.primary}` : `1px solid transparent`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            cursor: 'pointer'
          }} onClick={() => setSelected(task.id)}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 70 }}>{task.wbs || '—'}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{task.taskName || 'Untitled task'}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  {(() => {
                    const status = getTaskStatus(task);
                    const style = PROCESS_STATUS_STYLE[status] || { bg: C.bg2, color: C.text };
                    return (
                      <span style={{
                        padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: style.bg, color: style.color, whiteSpace: 'nowrap'
                      }}>
                        {status}
                      </span>
                    );
                  })()}
                </div>
                {!isExpanded ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: C.text2 }}>
                    <span>{task.resource || 'No owner'}</span>
                    <span>{task.startDate ? isoToDmy(task.startDate) : 'TBD'} — {task.endDate ? isoToDmy(task.endDate) : 'TBD'}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: C.text2 }}>
                    <span>Resource: {task.resource || '—'}</span>
                    <span>Level: {task.level ?? 0}</span>
                  </div>
                )}
              </div>
              <div style={{ minWidth: 100, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <PctCell value={task.percentComplete} isParent={isPar} onSave={n => handlePct(task.id, n)} />
              </div>
            </div>
            {isExpanded ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 12, fontSize: 11, color: C.text2 }}>
                  <div><strong style={{ color: C.text, fontWeight: 600 }}>Start:</strong> {task.startDate ? isoToDmy(task.startDate) : '—'}</div>
                  <div><strong style={{ color: C.text, fontWeight: 600 }}>Finish:</strong> {task.endDate ? isoToDmy(task.endDate) : '—'}</div>
                  <div><strong style={{ color: C.text, fontWeight: 600 }}>Actual:</strong> {task.actualFinish ? isoToDmy(task.actualFinish) : '—'}</div>
                  <div><strong style={{ color: C.text, fontWeight: 600 }}>Days:</strong> {task.duration}d</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: C.text2 }}>
                    {isPar ? 'Parent task' : task.parentId ? 'Sub task' : 'Root task'}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={e => { e.stopPropagation(); setEditModal(task); }}
                      style={{ height: 32, background: C.primaryBg, border: 'none', borderRadius: 8, padding: '0 14px', fontSize: 11, color: C.primary, cursor: 'pointer', fontWeight: 600 }}>
                      Edit
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(task.id); }}
                      style={{ height: 32, background: C.redBg, border: 'none', borderRadius: 8, padding: '0 10px', fontSize: 11, color: C.red, cursor: 'pointer', fontWeight: 600 }}>
                      Delete
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </Card>
        );
      })}
      {!loading && visible.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>No tasks. Click "+ Add Task".</div>
      )}
    </div>
  );

  const tableContent = (
    <div style={{ display:'flex', flex:1, flexDirection:'column', height:'100%', overflow:'hidden', minHeight:0 }}>
      {isMobile ? taskCardContent : (
        <>
          <div style={{ flex:1, minWidth:0, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ overflowX:'auto', overflowY:'hidden', minWidth:0 }}>
              {/* Table header — same height as Gantt header (HDR_H) */}
              <div ref={tableHeaderRef} onScroll={onHeaderScroll} style={{ minWidth:'max-content', display:'flex', background:C.bg, borderBottom:`1px solid ${C.border}`, flexShrink:0, height:HDR_H }}>
                {COLS.map((c, i) => (
                  <div key={c.label} style={{
                    position:'relative',
                    width: colWidths[i],
                    minWidth: colWidths[i],
                    padding:'0 8px', fontSize:10, fontWeight:700, color:C.text2, textTransform:'uppercase', letterSpacing:'0.05em', flexShrink:0, display:'flex', alignItems:'center'
                  }}>
                    {c.label}
                    <div onMouseDown={e => onColumnResizeStart(i, e)}
                      style={{ position:'absolute', right:0, top:0, width:8, height:'100%', cursor:'col-resize', zIndex:2 }} />
                  </div>
                ))}
              </div>
            </div>
            <div ref={tableBodyRef} onScroll={onTableScroll}
              style={{ height:`calc(100% - ${HDR_H}px)`, minHeight:0, overflowY:'scroll', overflowX:'auto', minWidth:'max-content' }}>
              {loading && <div style={{ padding:40, textAlign:'center', color:C.text3 }}>Loading...</div>}
              {!loading && visibleWithInsert.map((task, i) => {
                const isNew = isNewTaskInsert(task);
                const isPar = !isNew && hasChildren(projectTasks, task.id);
                const isExp = !isNew && expanded.has(task.id);
                const isSel = selected === task.id;
                const rowTask = task as Task;
                const newRow = task as NewTaskInsert;
                const level = isNew ? newRow.level : rowTask.level ?? 0;
                const durationDays = isNew ? calcDuration(newRow.startDate, newRow.endDate) : rowTask.duration;
                return (
                  <div key={task.id}
                    onClick={() => setSelected(task.id)}
                    onContextMenu={!isNew ? openTaskContextMenu(rowTask) : undefined}
                    style={{ display:'flex', alignItems:'center', height:ROW_H, borderBottom:`1px solid ${C.border}`, background: isNew ? C.primaryBg : isSel ? C.primaryBg : i % 2 === 0 ? C.white : C.bg, borderLeft: isSel ? `3px solid ${C.primary}` : '3px solid transparent', cursor:'pointer', flexShrink:0 }}>
                    <div style={{ width:colWidths[0], minWidth:colWidths[0], padding:'0 8px', fontSize:10, color:C.text3, fontFamily:'Poppins, sans-serif', flexShrink:0 }}>{isNew ? '—' : rowTask!.wbs}</div>
                    <div style={{
                      width: colWidths[1],
                      minWidth: colWidths[1],
                      padding:`0 4px 0 ${8 + level * 20}px`,
                      display:'flex', alignItems:'center', gap:4, flexShrink:0
                    }}>
                      {!isNew && (isPar ? (
                        <button onClick={e => { e.stopPropagation(); toggle(rowTask.id); }}
                          style={{ width:18, height:18, background:C.primaryBg, border:`1px solid ${C.primary}33`, borderRadius:4, cursor:'pointer', color:C.primary, padding:0, fontSize:11, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {isExp ? '▾' : '▸'}
                        </button>
                      ) : (
                        <span style={{ width:18, flexShrink:0, display:'inline-flex', justifyContent:'center' }}>
                          {!isNew && !!rowTask.parentId && <span style={{ color:C.border2, fontSize:10 }}>└</span>}
                        </span>
                      ))}
                      {!isNew && isPar && <span style={{ color:C.primary, fontSize:9, flexShrink:0 }}>◆</span>}
                      <EditableCell
                        value={isNew ? newRow.taskName : rowTask.taskName}
                        onSave={(v) => {
                          if (isNew) setNewTaskInsert((prev) => prev ? { ...prev, taskName: v } : prev);
                          else handleUpdate(rowTask.id, { taskName: v });
                        }}
                      />
                    </div>
                    <div style={{ width:colWidths[2], minWidth:colWidths[2], padding:'0 6px', flexShrink:0 }}>
                      <EditableCell
                        type="date"
                        value={isNew ? newRow.startDate : isoToDmy(rowTask.startDate)}
                        placeholder="—"
                        onSave={(v) => {
                          if (isNew) setNewTaskInsert((prev) => prev ? { ...prev, startDate: v } : prev);
                          else handleUpdateDate(rowTask.id, 'startDate', v);
                        }}
                        alwaysSave
                        style={{ color:isNew ? C.text : isPar ? C.text3 : C.text }}
                      />
                    </div>
                    <div style={{ width:colWidths[3], minWidth:colWidths[3], padding:'0 6px', flexShrink:0 }}>
                      <EditableCell
                        type="date"
                        value={isNew ? newRow.endDate : isoToDmy(rowTask.endDate)}
                        placeholder="—"
                        onSave={(v) => {
                          if (isNew) setNewTaskInsert((prev) => prev ? { ...prev, endDate: v } : prev);
                          else handleUpdateDate(rowTask.id, 'endDate', v);
                        }}
                        alwaysSave
                        style={{ color:isNew ? C.text : isPar ? C.text3 : C.text }}
                      />
                    </div>
                    <div style={{ width:colWidths[4], minWidth:colWidths[4], padding:'0 6px', flexShrink:0 }}>
                      <EditableCell
                        type="date"
                        value={isNew ? newRow.actualFinish : rowTask.actualFinish ? isoToDmy(rowTask.actualFinish) : ''}
                        placeholder="—"
                        onSave={(v) => {
                          if (isNew) setNewTaskInsert((prev) => prev ? { ...prev, actualFinish: v } : prev);
                          else handleUpdateDate(rowTask.id, 'actualFinish', v);
                        }}
                        alwaysSave
                        style={{ color:isNew ? C.text3 : rowTask.actualFinish ? C.green : C.text3 }}
                      />
                    </div>
                    <div style={{ width:colWidths[5], minWidth:colWidths[5], padding:'0 6px', fontSize:11, color:C.text2, fontFamily:'Poppins, sans-serif', flexShrink:0 }}>{durationDays}d</div>
                    <div style={{ width:colWidths[6], minWidth:colWidths[6], padding:'0 6px', flexShrink:0 }}>
                      {isNew ? (
                        <PctCell value={newRow.percentComplete} isParent={false} onSave={(n) => setNewTaskInsert((prev) => prev ? { ...prev, percentComplete: n } : prev)} />
                      ) : (
                        <PctCell value={rowTask.percentComplete} isParent={isPar} onSave={(n) => handlePct(rowTask.id, n)} />
                      )}
                    </div>
                    <div style={{ width:colWidths[7], minWidth:colWidths[7], padding:'0 6px', display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                      {!isNew && rowTask.resource && <Avatar name={rowTask.resource} size={20} />}
                      <EditableCell
                        value={isNew ? newRow.resource : rowTask.resource}
                        onSave={(v) => {
                          if (isNew) setNewTaskInsert((prev) => prev ? { ...prev, resource: v } : prev);
                          else handleUpdate(rowTask.id, { resource: v });
                        }}
                        placeholder="Assign..."
                      />
                    </div>
                    <div style={{ width:colWidths[8], minWidth:colWidths[8], padding:'0 5px', flexShrink:0, display:'flex', gap:4, justifyContent:'center' }}>
                      {isNew ? (
                        <>
                          <button onClick={e => { e.stopPropagation(); saveNewTask(); }}
                            style={{ height:22, padding:'0 8px', background:C.primaryBg, border:'none', borderRadius:5, cursor:'pointer', color:C.primary, fontSize:11, fontWeight:600 }}>
                            Save
                          </button>
                          <button onClick={e => { e.stopPropagation(); cancelNewTask(); }}
                            style={{ height:22, padding:'0 8px', background:C.border2, border:'none', borderRadius:5, cursor:'pointer', color:C.text2, fontSize:11 }}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={e => { e.stopPropagation(); setEditModal(rowTask); }}
                            style={{ height:22, padding:'0 7px', background:C.primaryBg, border:'none', borderRadius:5, cursor:'pointer', color:C.primary, fontSize:11, fontWeight:600 }}>
                            Edit
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleDelete(rowTask.id); }}
                            style={{ width:22, height:22, background:C.redBg, border:'none', borderRadius:5, cursor:'pointer', color:C.red, fontSize:11 }}>
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {!loading && visible.length === 0 && (
                <div style={{ padding:40, textAlign:'center', color:C.text3 }}>No tasks. Click "+ Add Task".</div>
              )}
            </div>
            <div style={{ flexShrink:0, padding:'5px 12px', borderTop:`1px solid ${C.border}`, display:'flex', gap:16, fontSize:11, color:C.text3 }}>
              <span>{projectTasks.filter(t => !t.parentId).length} root</span>
              <span>{projectTasks.length} total</span>
              <span>{Math.round(projectTasks.reduce((s,t)=>s+t.percentComplete,0)/Math.max(projectTasks.length,1))}% avg</span>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const kanbanContent = (
    <div style={{ flex:1, overflow:'hidden', minHeight:0, display:'flex', gap:16, padding:'16px', background:C.bg2 }}>
      {kanbanColumns.map(({ status, tasks }) => (
        <div key={status} onDragOver={handleColumnDragOver} onDrop={(e) => handleColumnDrop(status, e)}
          style={{ flex:1, minWidth:240, display:'flex', flexDirection:'column', gap:10, background:C.white, border:`1px solid ${C.border}`, borderRadius:16, padding:12 }}>
          {(() => {
          const headerStyle = PROCESS_STATUS_STYLE[status] || { bg: C.bg, color: C.text };
          return (
            <div style={{
              display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginBottom:12,
              padding:'10px 12px', background: headerStyle.bg, border:`1px solid ${headerStyle.color}33`, borderRadius:14
            }}>
              <div style={{ fontSize:13, fontWeight:700, color: headerStyle.color }}>{status}</div>
              <div style={{ fontSize:12, fontWeight:700, color: headerStyle.color }}>{tasks.length}</div>
            </div>
          );
        })()}
          <div style={{ flex:1, minHeight:0, overflowY:'auto', display:'flex', flexDirection:'column', gap:10 }}>
            {tasks.length === 0 ? (
              <div style={{ color:C.text3, fontSize:12, padding:'16px 8px', border:`1px dashed ${C.border}`, borderRadius:12, textAlign:'center' }}>No tasks</div>
            ) : tasks.map((task) => {
              const isSel = selected === task.id;
              const isExpanded = selected === task.id;
              return (
                <div key={task.id}
                  draggable
                  onDragStart={handleCardDragStart(task)}
                  onClick={() => setSelected(task.id)}
                  style={{ display:'flex', flexDirection:'column', gap:8, padding:12, borderRadius:14, border:isSel?`1px solid ${C.primary}`:`1px solid ${C.border}`, background:isSel?C.primaryBg:C.white, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, flexWrap:'wrap' }}>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.taskName || 'Untitled task'}</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8, fontSize:11, color:C.text2 }}>
                        <span>{task.resource || 'No owner'}</span>
                        <span>{task.startDate ? isoToDmy(task.startDate) : 'TBD'} — {task.endDate ? isoToDmy(task.endDate) : 'TBD'}</span>
                      </div>
                      {isExpanded && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:6, fontSize:11, color:C.text3, marginTop:6 }}>
                          <span>{task.wbs || '—'}</span>
                          <span>{task.duration}d</span>
                          <span>{task.percentComplete}%</span>
                        </div>
                      )}
                      {isExpanded && (
                        <div style={{ marginTop: 6 }}>
                          {(() => {
                            const status = getTaskStatus(task);
                            const style = PROCESS_STATUS_STYLE[status] || { bg: C.bg2, color: C.text };
                            return (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999,
                                fontSize: 11, fontWeight: 700, background: style.bg, color: style.color
                              }}>
                                {status}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                      <button onClick={(e) => { e.stopPropagation(); setEditModal(task); }}
                        style={{ padding:'6px 10px', borderRadius:8, border:'none', background:C.primaryBg, color:C.primary, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                        Edit
                      </button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:11, color:C.text2 }}>
                      <div><strong style={{ color:C.text, fontWeight:600 }}>Start:</strong> {task.startDate ? isoToDmy(task.startDate) : '—'}</div>
                      <div><strong style={{ color:C.text, fontWeight:600 }}>Finish:</strong> {task.endDate ? isoToDmy(task.endDate) : '—'}</div>
                      <div><strong style={{ color:C.text, fontWeight:600 }}>Actual:</strong> {task.actualFinish ? isoToDmy(task.actualFinish) : '—'}</div>
                      <div><strong style={{ color:C.text, fontWeight:600 }}>Resource:</strong> {task.resource || '—'}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Sub-toolbar with zoom controls */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.white }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ display:'flex', gap:3, background:C.bg, borderRadius:8, padding:3 }}>
            {viewModes.map(m => (
              <button key={m} onClick={()=>setView(m)}
                style={{ padding:'5px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'Poppins, sans-serif', background:view===m?C.white:C.bg, color:view===m?C.primary:C.text2, boxShadow:view===m?C.shadow:'none', transition:'all 0.15s' }}>
                {m==='table' ? '☰ Table' : m==='split' ? '⊟ Split' : m==='gantt' ? '▦ Gantt' : '▦ Kanban'}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, marginLeft:8, alignItems:'center' }}>
            <button onClick={expandAll} onFocus={() => setButtonFocus('expand')} onBlur={() => setButtonFocus(null)}
              style={{ padding:'5px 10px', borderRadius:6, border:'1px solid transparent', background: buttonFocus === 'expand' ? C.primary : C.primaryBg, color: buttonFocus === 'expand' ? C.white : C.primary, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'Poppins, sans-serif', outline:'none' }}>
              Expand All
            </button>
            <button onClick={collapseAll} onFocus={() => setButtonFocus('collapse')} onBlur={() => setButtonFocus(null)}
              style={{ padding:'5px 10px', borderRadius:6, border:'1px solid transparent', background: buttonFocus === 'collapse' ? C.text : C.bg, color: buttonFocus === 'collapse' ? C.white : C.text2, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'Poppins, sans-serif', outline:'none' }}>
              Collapse All
            </button>
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
          <Btn small onClick={openAddTaskDefault}><Plus size={13} /> Add Task</Btn>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:'hidden', display:'flex' }}>
        {((view==='table') || (!isMobile && view==='split')) && (
          <div style={{ width:view==='split'?splitW:undefined, flex:view==='table'?1:undefined, minWidth:300, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column', flexShrink:0 }}>
            {tableContent}
          </div>
        )}
        {(view === 'kanban') && (
          <div style={{ flex:1, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            {kanbanContent}
          </div>
        )}
        {/* Resizable divider */}
        {!isMobile && view==='split' && (
          <div onMouseDown={onResizeStart}
            style={{ width:6, cursor:'col-resize', background:'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}
            onMouseEnter={e=>e.currentTarget.style.background=C.primaryBg}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{ width:2, height:40, background:C.border2, borderRadius:2 }} />
          </div>
        )}
        {!isMobile && (view==='gantt'||view==='split') && (
          <div style={{ flex:1, minHeight:0, overflow:'hidden', minWidth:200, display:'flex', flexDirection:'column' }}>
            <GanttChart tasks={projectTasks} visibleTasks={visible} selectedId={selected}
              onSelect={setSelected} ganttBodyRef={ganttBodyRef} onGanttScroll={onGanttScroll}
              zoomIndex={zoomIndex} onZoomChange={setZoomIndex}
              onUpdate={async(id,field,value)=>handleUpdate(id,{[field]:value})} />
          </div>
        )}
      </div>

      {contextMenu.visible && contextMenu.task && (
        <div style={{ position:'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 999, background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow2, minWidth: 220, overflow: 'hidden' }}>
          {contextMenu.taskLevel === 0 ? (
            <>
              <button type="button" onClick={() => handleContextMenuSelect('main-before')}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Add Maintask Before
              </button>
              <button type="button" onClick={() => handleContextMenuSelect('main-after')}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Add Maintask After
              </button>
            </>
          ) : contextMenu.taskLevel === 1 ? (
            <>
              <button type="button" onClick={() => handleContextMenuSelect('sub-before')}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Add Subtask Before
              </button>
              <button type="button" onClick={() => handleContextMenuSelect('sub-after')}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Add Subtask After
              </button>
              <button type="button" onClick={() => handleContextMenuSelect('child-under')}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Add Childtask
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => handleContextMenuSelect('child-before')}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Add Childtask Before
              </button>
              <button type="button" onClick={() => handleContextMenuSelect('child-after')}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Add Childtask After
              </button>
            </>
          )}
        </div>
      )}

      {addModal  && (
        <TaskModal
          tasks={projectTasks}
          selectedTask={projectTasks.find(t => t.id === addPreset.anchorId) ?? null}
          preset={addPreset}
          onClose={()=>setAddModal(false)}
          onSave={handleCreate}
        />
      )}
      {editModal && (
        <TaskEditModal
          task={editModal}
          tasks={projectTasks}
          onClose={()=>setEditModal(null)}
          onSave={handleEditSave}
          onInsertBefore={() => openInsertAround(editModal, 'before')}
          onInsertAfter={() => openInsertAround(editModal, 'after')}
        />
      )}
    </div>
  );
}

function formatDmyInput(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function TaskModal({ tasks, selectedTask, preset, onClose, onSave }: { tasks:Task[]; selectedTask: Task | null; preset: { anchorId: string | null; mode: 'main' | 'sub'; position: 'before' | 'after' | 'append' }; onClose:()=>void; onSave:(f:Partial<Task>)=>void }) {
  const { members, activeProject } = useStore();
  const todayIso    = new Date().toISOString().split('T')[0];
  const nextWeekIso = new Date(Date.now()+7*86400000).toISOString().split('T')[0];
  const [form, setForm] = useState<Partial<Task>>({
    taskName:'',
    startDate: todayIso,
    endDate: nextWeekIso,
    resource:'',
    parentId:'',
    relatedTask:'',
    phase: selectedTask?.phase || PHASE_OPTIONS[0],
  });
  const [insertType, setInsertType] = useState<'main' | 'sub'>(preset.mode);
  const [insertPosition, setInsertPosition] = useState<'before' | 'after' | 'append'>(preset.position);
  const up = (k:string,v:string) => setForm(p=>({...p,[k]:v}));
  const sortedTasks = [...tasks].sort((a, b) => compareWbs(a.wbs, b.wbs));
  const dur = calcDuration(String(form.startDate || ''), String(form.endDate || ''));
  return (
    <Modal title="New Task" onClose={onClose} width={480}>
      <FormRow label="Task Name" required>
        <input autoFocus value={form.taskName??''} onChange={e=>up('taskName',e.target.value)} placeholder="Enter task name"
          style={{ fontFamily:'Poppins, sans-serif', fontSize:13, padding:'8px 12px', border:`1.5px solid ${C.border}`, borderRadius:8, outline:'none', width:'100%', boxSizing:'border-box' }}
          onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border} />
      </FormRow>

      <div style={{ marginBottom: 10 }}>
        <FormRow label="Insert Type">
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setInsertType('main')}
              style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${insertType==='main'?C.primary:C.border}`, background:insertType==='main'?C.primaryBg:C.white, color:insertType==='main'?C.primary:C.text2, cursor:'pointer', fontFamily:'Poppins, sans-serif', fontSize:12, fontWeight:600 }}>
              Main Task
            </button>
            <button type="button" onClick={() => setInsertType('sub')}
              style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${insertType==='sub'?C.primary:C.border}`, background:insertType==='sub'?C.primaryBg:C.white, color:insertType==='sub'?C.primary:C.text2, cursor:'pointer', fontFamily:'Poppins, sans-serif', fontSize:12, fontWeight:600 }}>
              Sub Task
            </button>
          </div>
        </FormRow>
        {insertType === 'main' && (
          <FormRow label="Phase" required>
            <Select value={String(form.phase || PHASE_OPTIONS[0])} onChange={v => setForm(f => ({ ...f, phase: v }))}
              options={PHASE_OPTIONS.map(p => ({ value: p, label: p }))} />
          </FormRow>
        )}

        <FormRow label="Insert Position">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              { id: 'before', label: 'Before Anchor' },
              { id: 'after', label: 'After Anchor' },
              { id: 'append', label: 'Append End' },
            ] as const).map(p => (
              <button key={p.id} type="button" onClick={() => setInsertPosition(p.id)}
                style={{ padding:'6px 10px', borderRadius:8, border:`1px solid ${insertPosition===p.id?C.primary:C.border}`, background:insertPosition===p.id?C.primaryBg:C.white, color:insertPosition===p.id?C.primary:C.text2, cursor:'pointer', fontFamily:'Poppins, sans-serif', fontSize:11, fontWeight:600 }}>
                {p.label}
              </button>
            ))}
          </div>
        </FormRow>

        <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>
          Anchor: {selectedTask ? `${selectedTask.wbs} ${selectedTask.taskName}` : 'No selected task'}
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FormRow label="Start Date"><Input type="date" value={form.startDate ?? ''} onChange={v => up('startDate', v)} /></FormRow>
        <FormRow label="End Date"><Input type="date" value={form.endDate ?? ''} onChange={v => up('endDate', v)} /></FormRow>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:8 }}>
        <FormRow label="Actual Finish Date"><Input type="date" value={form.actualFinish ?? ''} onChange={v => up('actualFinish', v)} /></FormRow>
        <div />
      </div>
      {dur>0&&<p style={{ fontSize:12, color:C.primary, marginBottom:12 }}>Duration: <strong>{dur} days</strong></p>}
      <FormRow label="Resource">
        <>
          <input value={form.resource??''} onChange={e=>up('resource',e.target.value)} placeholder="Assigned person"
            list="task-resource-options"
            style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
            onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border}/>
          <datalist id="task-resource-options">
            {members.filter(m => m.projectId === activeProject?.id).map((member) => {
              const displayName = formatNameWithLastInitial(member.name || member.nickname || '');
              return <option key={member.id} value={displayName} />;
            })}
          </datalist>
        </>
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
          const startDate = String(form.startDate || '');
          const endDate = String(form.endDate || '');
          if (!startDate || !endDate) {
            toast.error('Start/End Date ต้องเลือกวันที่');
            return;
          }

          let parentId = '';
          let order: number | undefined;

          if (insertType === 'main') {
            parentId = '';
            if (selectedTask && !selectedTask.parentId && insertPosition !== 'append') {
              order = Number(selectedTask.order || 0) + (insertPosition === 'before' ? -0.5 : 0.5);
            }
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
            if (selectedTask && (selectedTask.parentId || '') === parentId && insertPosition !== 'append') {
              order = Number(selectedTask.order || 0) + (insertPosition === 'before' ? -0.5 : 0.5);
            } else {
              order = maxOrder + 1;
            }
          }

          const selectedParent = tasks.find(t => t.id === (form.parentId as string));
          onSave({
            ...form,
            parentId,
            order,
            startDate,
            endDate,
            duration: dur,
            phase: String(
              form.phase ||
              selectedParent?.phase ||
              selectedTask?.phase ||
              PHASE_OPTIONS[0]
            ),
          });
        }}>Create Task</Btn>
      </div>
    </Modal>
  );
}

function TaskEditModal({ task, tasks, onClose, onSave, onInsertBefore, onInsertAfter }: { task:Task; tasks:Task[]; onClose:()=>void; onSave:(f:Partial<Task>)=>void; onInsertBefore: () => void; onInsertAfter: () => void }) {
  const { members, activeProject } = useStore();
  const [form, setForm] = useState<Partial<Task>>({
    ...task,
    startDate: task.startDate ?? '',
    endDate: task.endDate ?? '',
    actualFinish: task.actualFinish ?? '',
    phase: task.phase ?? PHASE_OPTIONS[0],
  });
  const up = (k:string,v:string|number) => setForm(p=>({...p,[k]:v}));
  const dur = calcDuration(String(form.startDate || ''), String(form.endDate || ''));
  const sortedTasks = [...tasks].sort((a, b) => compareWbs(a.wbs, b.wbs));
  return (
    <Modal title="Edit Task" onClose={onClose} width={520}>
      <FormRow label="Task Name" required>
        <input autoFocus value={form.taskName??''} onChange={e=>up('taskName',e.target.value)}
          style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
          onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border}/>
      </FormRow>
      <FormRow label="Phase">
        <Select value={String(form.phase || PHASE_OPTIONS[0])} onChange={v => up('phase', v)}
          options={PHASE_OPTIONS.map(p => ({ value: p, label: p }))} />
      </FormRow>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FormRow label="Start Date"><Input type="date" value={form.startDate ?? ''} onChange={v => up('startDate', v)} /></FormRow>
        <FormRow label="End Date"><Input type="date" value={form.endDate ?? ''} onChange={v => up('endDate', v)} /></FormRow>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FormRow label="Actual Finish Date">
          <Input type="date" value={form.actualFinish ?? ''} onChange={v => up('actualFinish', v)} />
        </FormRow>
        <FormRow label="% Complete">
          <input type="number" min={0} max={100} value={form.percentComplete??0} onChange={e=>up('percentComplete',Math.min(100,Math.max(0,Number(e.target.value))))}
            style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}/>
        </FormRow>
      </div>
      <FormRow label="Resource">
        <>
          <input value={form.resource??''} onChange={e=>up('resource',e.target.value)} placeholder="Assigned person"
            list="task-resource-options"
            style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
            onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border}/>
          <datalist id="task-resource-options">
            {members.filter(m => m.projectId === activeProject?.id).map((member) => {
              const displayName = formatNameWithLastInitial(member.name || member.nickname || '');
              return <option key={member.id} value={displayName} />;
            })}
          </datalist>
        </>
      </FormRow>
      <FormRow label="Parent Task (change to restructure)">
        <Select value={form.parentId??''} onChange={v=>up('parentId',v)}
          options={[{value:'',label:'— None (Root) —'},...sortedTasks.filter(t=>t.id!==task.id).map(t=>({value:t.id,label:`${t.wbs||''} ${t.taskName}`.trim()}))]} />
      </FormRow>
      <FormRow label="Predecessor (FS)">
        <Select value={form.relatedTask??''} onChange={v=>up('relatedTask',v)}
          options={[{value:'',label:'— None —'},...sortedTasks.filter(t=>t.id!==task.id).map(t=>({value:t.id,label:`${t.wbs||''} ${t.taskName}`.trim()}))]} />
      </FormRow>

      <FormRow label="Quick Insert">
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button type="button" onClick={onInsertBefore}
            style={{ padding:'6px 10px', borderRadius:8, border:`1px solid ${C.primary}`, background:C.primaryBg, color:C.primary, cursor:'pointer', fontFamily:'Poppins, sans-serif', fontSize:12, fontWeight:600 }}>
            Insert Before This Task
          </button>
          <button type="button" onClick={onInsertAfter}
            style={{ padding:'6px 10px', borderRadius:8, border:`1px solid ${C.primary}`, background:C.primaryBg, color:C.primary, cursor:'pointer', fontFamily:'Poppins, sans-serif', fontSize:12, fontWeight:600 }}>
            Insert After This Task
          </button>
        </div>
      </FormRow>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>{
          if(!form.taskName?.trim()) return;
          onSave({
            ...form,
            startDate: String(form.startDate || ''),
            endDate: String(form.endDate || ''),
            actualFinish: String(form.actualFinish || ''),
            duration: calcDuration(String(form.startDate || ''), String(form.endDate || '')),
          });
        }}>Save Changes</Btn>
      </div>
    </Modal>
  );
}
