import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Download, Upload, ChevronDown, ZoomIn, ZoomOut, Lock, Unlock, Sparkles, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Pencil, Trash2, Check, X, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useStore } from '../../store';
import { taskApi } from '../../services/api';
import { Btn, EditableCell, Avatar, Card, Modal, FormRow, Input, Select, C } from '../Common';
import { flattenTree, hasChildren, calcDuration, fmtDate, fmtDatePdf, fmtMonth, compareWbs, isoToDmy, dmyToIso, formatNameWithLastInitial, PROCESS_STATUS_STYLE } from '../../utils';
import GanttChart, { ZOOM_LEVELS } from '../Gantt/GanttChart';
import type { Task, ViewMode } from '../../types';

interface Props {
  projectId: string;
  extraActions?: React.ReactNode;
}

export const ROW_H = 36;
export const HDR_H = 48;   // unified header height for both table and gantt
const TABLE_BOTTOM_SPACER_ROWS = 4;

// Columns for table view
type TaskColumnId =
  | 'wbs'
  | 'taskName'
  | 'startDate'
  | 'endDate'
  | 'actualFinish'
  | 'duration'
  | 'percentComplete'
  | 'effortManday'
  | 'resource'
  | 'actions';

const COLS: Array<{ id: TaskColumnId; label: string; w: number; canHide: boolean }> = [
  { id: 'wbs',             label: 'WBS',           w: 52,  canHide: false },
  { id: 'taskName',        label: 'Task Name',     w: 320, canHide: false },
  { id: 'startDate',       label: 'Start',         w: 94,  canHide: true },
  { id: 'endDate',         label: 'Finish',        w: 94,  canHide: true },
  { id: 'actualFinish',    label: 'Actual Finish', w: 120, canHide: true },
  { id: 'duration',        label: 'Days',          w: 46,  canHide: true },
  { id: 'percentComplete', label: '% Done',        w: 120, canHide: true },
  { id: 'effortManday',    label: 'Effort (MD)',   w: 94,  canHide: true },
  { id: 'resource',        label: 'Resource',      w: 160, canHide: true },
  { id: 'actions',         label: '',              w: 76,  canHide: true },
];
const DEFAULT_COLUMN_VISIBILITY: Record<TaskColumnId, boolean> = COLS.reduce((acc, col) => {
  acc[col.id] = true;
  return acc;
}, {} as Record<TaskColumnId, boolean>);
const MANDATORY_COLUMN_IDS = new Set<TaskColumnId>(['wbs', 'taskName']);
const EFFORT_STEP = 0.025;

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
const TASK_DEPENDENCY_OPTIONS = ['FS', 'SS', 'FF', 'SF'] as const;

function toDependencyType(value: unknown): 'FS' | 'SS' | 'FF' | 'SF' {
  const normalized = String(value || 'FS').trim().toUpperCase();
  return (TASK_DEPENDENCY_OPTIONS as readonly string[]).includes(normalized)
    ? (normalized as 'FS' | 'SS' | 'FF' | 'SF')
    : 'FS';
}

type TaskStatus = (typeof TASK_STATUS_OPTIONS)[number];
export type PhaseOption = { value: string; label: string };
type TaskRow = Task | NewTaskInsert;
type TaskImportRow = {
  wbs: string;
  taskName: string;
  parentWbs: string;
  startDate: string;
  endDate: string;
  actualFinish: string;
  percentComplete: number;
  status: TaskStatus;
  phase: string;
  predecessorWbs: string;
  predecessorType: 'FS' | 'SS' | 'FF' | 'SF';
  predecessorLagDays: number;
  resource: string;
  effortManday: number;
};
type TaskImportPreview = {
  fileName: string;
  rows: TaskImportRow[];
};

const TASK_IMPORT_REQUIRED_HEADERS = [
  'WBS',
  'Task Name',
  'Parent WBS',
  'Start Date',
  'End Date',
  'Actual Finish',
  '% Complete',
  'Status',
  'Phase',
  'Predecessor WBS',
  'Owner',
  'Effort Manday',
] as const;

const TASK_IMPORT_HEADERS = [
  ...TASK_IMPORT_REQUIRED_HEADERS,
  'Predecessor Type',
  'Predecessor Lag Days',
] as const;

type SuggestedDateAssignment = {
  id: string;
  taskName: string;
  level: number;
  startDate: string;
  endDate: string;
};

function getProjectDurationDays(startDate?: string, endDate?: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getWorkingDatesBetween(startDate?: string, endDate?: string): string[] {
  if (!startDate || !endDate) return [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (!isWeekend(cursor)) dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function parseIsoDateSafe(value?: string): Date | null {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addWorkingDays(base: Date, deltaDays: number): Date {
  if (deltaDays === 0) return new Date(base);
  const step = deltaDays > 0 ? 1 : -1;
  let remaining = Math.abs(deltaDays);
  const cursor = new Date(base);
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + step);
    if (!isWeekend(cursor)) remaining -= 1;
  }
  return cursor;
}

function nextWorkingOnOrAfter(date: Date): Date {
  const cursor = new Date(date);
  while (isWeekend(cursor)) {
    cursor.setDate(cursor.getDate() + 1);
  }
  return cursor;
}

function prevWorkingOnOrBefore(date: Date): Date {
  const cursor = new Date(date);
  while (isWeekend(cursor)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  return cursor;
}

function toIso(date: Date): string {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayPassword(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

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
  sortOrder: number;
  taskName: string;
  effortManday: number;
  startDate: string;
  endDate: string;
  actualFinish: string;
  resource: string;
  percentComplete: number;
  phase: string;
  level: number;
  relatedTask: string;
  relatedTaskType: 'FS' | 'SS' | 'FF' | 'SF';
  relatedTaskLagDays: number;
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

function roundEffortManday(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Number((Math.round(value / EFFORT_STEP) * EFFORT_STEP).toFixed(3));
}

function getColumnPrefsUserKeyFromLocalStorage(): string {
  if (typeof window === 'undefined') return 'anonymous';
  try {
    const keys = Object.keys(window.localStorage);
    const authTokenKey = keys.find((key) => key.startsWith('sb-') && key.endsWith('-auth-token'));
    if (!authTokenKey) return 'anonymous';
    const raw = window.localStorage.getItem(authTokenKey);
    if (!raw) return 'anonymous';
    const parsed = JSON.parse(raw) as { user?: { id?: string } };
    return parsed?.user?.id || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

function normalizeDateInputToIso(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return dmyToIso(raw) || '';
}

function toDisplayDmy(value?: string): string {
  const iso = normalizeDateInputToIso(value);
  return iso ? isoToDmy(iso) : '';
}

function normalizeTaskDateRange(startDate?: string, endDate?: string): { startDate: string; endDate: string; adjusted: boolean } {
  const start = normalizeDateInputToIso(startDate);
  const end = normalizeDateInputToIso(endDate);
  const startParsed = parseIsoDateSafe(start);
  const endParsed = parseIsoDateSafe(end);
  if (!startParsed || !endParsed || startParsed <= endParsed) {
    return { startDate: start, endDate: end, adjusted: false };
  }
  return { startDate: start, endDate: start, adjusted: true };
}

function makeColumnVisibilityStorageKey(projectId: string, userKey: string): string {
  return `tasks-column-visibility:v1:${projectId}:${userKey}`;
}

function normalizeColumnVisibility(value: unknown): Record<TaskColumnId, boolean> {
  const normalized = { ...DEFAULT_COLUMN_VISIBILITY };
  if (value && typeof value === 'object') {
    for (const col of COLS) {
      const raw = (value as Record<string, unknown>)[col.id];
      if (typeof raw === 'boolean') {
        normalized[col.id] = raw;
      }
    }
  }
  for (const id of MANDATORY_COLUMN_IDS) {
    normalized[id] = true;
  }
  return normalized;
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

export default function TasksTab({ projectId, extraActions }: Props) {
  const { tasks, members, activeProject, fetchTasks, createTask, updateTask, reorderTasks, deleteTask, masterCodes } = useStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView]         = useState<ViewMode>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'table' : 'split');
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Task | null>(null);
  const [loading, setLoading]   = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<TaskImportPreview | null>(null);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;
  const [buttonFocus, setButtonFocus] = useState<'expand' | 'collapse' | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; task: Task | null; taskLevel: number }>({ visible: false, x: 0, y: 0, task: null, taskLevel: 0 });
  const [newTaskInsert, setNewTaskInsert] = useState<NewTaskInsert | null>(null);
  const [moveToSubModal, setMoveToSubModal] = useState<{ task: Task; targetParentId: string; targetLevel: 1 | 2 } | null>(null);
  const [moveToMainModal, setMoveToMainModal] = useState<{ task: Task; targetIndex: number } | null>(null);
  const [suggestModalOpen, setSuggestModalOpen] = useState(false);
  const [isSuggestionLocked, setIsSuggestionLocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('task-suggestion-locked') === 'true';
  });
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [splitW, setSplitW]     = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(640, Math.round(window.innerWidth * 0.66));
    }
    return 630;
  });
  const [zoomIndex, setZoomIndex] = useState(3); // default = Week
  const [colWidths, setColWidths] = useState<number[]>(COLS.map((c) => c.w));
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [columnPrefsUserKey, setColumnPrefsUserKey] = useState('anonymous');
  const [columnPrefsLoaded, setColumnPrefsLoaded] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<TaskColumnId, boolean>>({ ...DEFAULT_COLUMN_VISIBILITY });
  const [addPreset, setAddPreset] = useState<{ anchorId: string | null; mode: 'main' | 'sub'; position: 'before' | 'after' | 'append' }>({
    anchorId: null,
    mode: 'main',
    position: 'append',
  });
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null);
  const dragTaskIdRef = useRef<string | null>(null);

  // Scroll sync
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const tableHeaderRef = useRef<HTMLDivElement>(null);
  const ganttBodyRef = useRef<HTMLDivElement>(null);
  const syncing      = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    setColumnPrefsUserKey(getColumnPrefsUserKeyFromLocalStorage());
  }, []);

  const columnStorageKey = useMemo(() => makeColumnVisibilityStorageKey(projectId, columnPrefsUserKey), [projectId, columnPrefsUserKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setColumnPrefsLoaded(false);
    try {
      const raw = window.localStorage.getItem(columnStorageKey);
      if (!raw) {
        setColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY });
      } else {
        setColumnVisibility(normalizeColumnVisibility(JSON.parse(raw)));
      }
    } catch {
      setColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY });
    } finally {
      setColumnPrefsLoaded(true);
    }
  }, [columnStorageKey]);

  useEffect(() => {
    if (!columnPrefsLoaded || typeof window === 'undefined') return;
    window.localStorage.setItem(columnStorageKey, JSON.stringify(columnVisibility));
  }, [columnStorageKey, columnPrefsLoaded, columnVisibility]);

  const projectTasks = tasks.filter(t => t.projectId === projectId);
  const phaseOptions = masterCodes
    .filter((code) => code.codeType === 'task_phase' && code.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((code) => ({ value: code.codeValue, label: code.label }));
  const effectivePhaseOptions: PhaseOption[] = phaseOptions.length > 0
    ? phaseOptions
    : PHASE_OPTIONS.map((phase) => ({ value: phase, label: phase }));
  const todayIso = new Date().toISOString().slice(0, 10);
  const nextWeekIso = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const visible = flattenTree(projectTasks, expanded);

  const getInsertMeta = (anchor: Task, action: InsertAction) => {
    if (action === 'main-before' || action === 'main-after') {
      return { parentId: '', sortOrder: Number(anchor.sortOrder || 0) + (action === 'main-before' ? -0.5 : 0.5), level: 0 };
    }

    if (action === 'sub-before' || action === 'sub-after') {
      if ((anchor.level ?? 0) === 0) {
        const children = projectTasks
          .filter((t) => t.parentId === anchor.id)
          .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
        const sortOrder = action === 'sub-before'
          ? (children.length ? Number(children[0].sortOrder || 0) - 0.5 : 1)
          : (children.length ? Number(children[children.length - 1].sortOrder || 0) + 1 : 1);
        return { parentId: anchor.id, sortOrder, level: 1 };
      }
      const parentId = anchor.parentId;
      return { parentId, sortOrder: Number(anchor.sortOrder || 0) + (action === 'sub-before' ? -0.5 : 0.5), level: 1 };
    }

    if (action === 'child-before' || action === 'child-after') {
      const parentId = anchor.parentId;
      return { parentId, sortOrder: Number(anchor.sortOrder || 0) + (action === 'child-before' ? -0.5 : 0.5), level: 2 };
    }

    if (action === 'child-under') {
      const children = projectTasks
        .filter((t) => t.parentId === anchor.id)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
      const nextSortOrder = children.length ? Number(children[children.length - 1].sortOrder || 0) + 1 : 1;
      return { parentId: anchor.id, sortOrder: nextSortOrder, level: 2 };
    }

    const children = projectTasks
      .filter((t) => t.parentId === anchor.id)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    const nextSortOrder = children.length ? Number(children[children.length - 1].sortOrder || 0) + 1 : 1;
    return { parentId: anchor.id, sortOrder: nextSortOrder, level: 2 };
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

  const getDescendantIds = (taskId: string): Set<string> => {
    const ids = new Set<string>();
    const queue = [taskId];
    while (queue.length) {
      const cur = queue.shift()!;
      projectTasks
        .filter((t) => t.parentId === cur)
        .forEach((t) => { ids.add(t.id); queue.push(t.id); });
    }
    return ids;
  };

  const availableMoveToSubParents = moveToSubModal
    ? (() => {
      const descendantIds = getDescendantIds(moveToSubModal.task.id);
      return projectTasks
        .filter((t) => {
          if (t.id === moveToSubModal.task.id) return false;
          if (descendantIds.has(t.id)) return false;
          if (moveToSubModal.targetLevel === 1) return !t.parentId;
          return (t.level ?? 0) === 1;
        })
        .sort((a, b) => {
          const byWbs = compareWbs(a.wbs || '', b.wbs || '');
          if (byWbs !== 0) return byWbs;
          return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
        });
    })()
    : [];

  const availableMoveToMainPositions = moveToMainModal
    ? (() => {
      const roots = projectTasks
        .filter((t) => !t.parentId && t.id !== moveToMainModal.task.id)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
      const options: { value: string; label: string }[] = [];
      for (let i = 1; i <= roots.length + 1; i += 1) {
        if (i <= roots.length) {
          const target = roots[i - 1];
          options.push({ value: String(i), label: `Row ${i} (WBS ${i}) - before ${target.wbs || i}. ${target.taskName}` });
        } else {
          options.push({ value: String(i), label: `Row ${i} (WBS ${i}) - end of main task list` });
        }
      }
      return options;
    })()
    : [];

  const suggestionPreview = useMemo(() => {
    const projectStart = activeProject?.startDate || '';
    const projectEnd = activeProject?.endDate || '';
    const workingDates = getWorkingDatesBetween(projectStart, projectEnd);
    const projectStartDate = parseIsoDateSafe(projectStart);
    const childrenByParent = new Map<string, Task[]>();
    const taskById = new Map(projectTasks.map((task) => [task.id, task]));

    const sortTasks = (items: Task[]) => [...items].sort((a, b) => {
      const sortOrderDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
      if (sortOrderDiff !== 0) return sortOrderDiff;
      return compareWbs(a.wbs, b.wbs);
    });

    for (const task of projectTasks) {
      const parentId = task.parentId || '';
      const list = childrenByParent.get(parentId) || [];
      list.push(task);
      childrenByParent.set(parentId, list);
    }
    for (const [key, items] of childrenByParent.entries()) {
      childrenByParent.set(key, sortTasks(items));
    }

    const getDurationDays = (task: Task): number => {
      const explicit = Number(task.duration || 0);
      if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.trunc(explicit));

      const s = parseIsoDateSafe(task.startDate);
      const e = parseIsoDateSafe(task.endDate);
      if (!s || !e || e < s) return 1;

      let count = 0;
      const cursor = new Date(s);
      while (cursor <= e) {
        if (!isWeekend(cursor)) count += 1;
        cursor.setDate(cursor.getDate() + 1);
      }
      return Math.max(1, count);
    };

    const assignments: SuggestedDateAssignment[] = [];
    const assignmentById = new Map<string, { start: Date; end: Date }>();
    const existingScheduleById = new Map<string, { start: Date; end: Date }>();

    projectTasks.forEach((task) => {
      const s = parseIsoDateSafe(task.startDate);
      const e = parseIsoDateSafe(task.endDate);
      if (!s || !e) return;
      existingScheduleById.set(task.id, {
        start: nextWorkingOnOrAfter(s),
        end: nextWorkingOnOrAfter(e),
      });
    });

    const rootCache = new Map<string, string>();
    const getRootId = (taskId: string): string => {
      const cached = rootCache.get(taskId);
      if (cached) return cached;
      let current = taskById.get(taskId);
      if (!current) return taskId;
      while (current?.parentId) {
        const parent = taskById.get(current.parentId);
        if (!parent) break;
        current = parent;
      }
      const rootId = current?.id || taskId;
      rootCache.set(taskId, rootId);
      return rootId;
    };

    const leafTasks = sortTasks(projectTasks.filter((task) => !(childrenByParent.get(task.id) || []).length));
    const leafByParent = new Map<string, Task[]>();
    const leafByRoot = new Map<string, Task[]>();

    leafTasks.forEach((task) => {
      const parentKey = String(task.parentId || '');
      const parentList = leafByParent.get(parentKey) || [];
      parentList.push(task);
      leafByParent.set(parentKey, parentList);

      const rootKey = getRootId(task.id);
      const rootList = leafByRoot.get(rootKey) || [];
      rootList.push(task);
      leafByRoot.set(rootKey, rootList);
    });

    const mainWindowByRoot = new Map<string, { start: Date | null; end: Date | null }>();
    projectTasks.filter((task) => !task.parentId).forEach((root) => {
      mainWindowByRoot.set(root.id, {
        start: parseIsoDateSafe(root.startDate),
        end: parseIsoDateSafe(root.endDate),
      });
    });

    const getScheduledAnchor = (taskId: string): { start: Date; end: Date } | null => {
      return assignmentById.get(taskId) || existingScheduleById.get(taskId) || null;
    };

    const getDependencyDrivenStart = (task: Task, durationDays: number): Date | null => {
      if (!task.relatedTask) return null;
      const predecessor = getScheduledAnchor(task.relatedTask);
      if (!predecessor) return null;

      const depType = String(task.relatedTaskType || 'FS').toUpperCase();
      const lag = Math.trunc(Number(task.relatedTaskLagDays || 0));

      if (depType === 'SS') {
        return nextWorkingOnOrAfter(addWorkingDays(predecessor.start, lag));
      }
      if (depType === 'FF') {
        const constrainedFinish = addWorkingDays(predecessor.end, lag);
        return nextWorkingOnOrAfter(addWorkingDays(constrainedFinish, -(durationDays - 1)));
      }
      if (depType === 'SF') {
        const constrainedFinish = addWorkingDays(predecessor.start, lag);
        return nextWorkingOnOrAfter(addWorkingDays(constrainedFinish, -(durationDays - 1)));
      }

      return nextWorkingOnOrAfter(addWorkingDays(predecessor.end, 1 + lag));
    };

    let pending = [...leafTasks];
    let passGuard = Math.max(1, leafTasks.length * 2);

    while (pending.length && passGuard > 0) {
      const nextPending: Task[] = [];
      let progressed = false;

      pending.forEach((task) => {
        if (assignmentById.has(task.id)) {
          progressed = true;
          return;
        }

        const hasDependency = !!task.relatedTask;
        const hasDependencyAnchor = !hasDependency || !!getScheduledAnchor(task.relatedTask);
        if (hasDependency && !hasDependencyAnchor) {
          nextPending.push(task);
          return;
        }

        const durationDays = getDurationDays(task);
        const dependencyStart = getDependencyDrivenStart(task, durationDays);
        const relationDate = parseIsoDateSafe(task.startDate);
        const rootId = getRootId(task.id);
        const mainWindow = mainWindowByRoot.get(rootId) || { start: null, end: null };

        const candidateStarts: Date[] = [];
        if (dependencyStart) candidateStarts.push(dependencyStart);
        if (relationDate) candidateStarts.push(nextWorkingOnOrAfter(relationDate));

        if (!dependencyStart) {
          if (mainWindow.start) candidateStarts.push(nextWorkingOnOrAfter(mainWindow.start));

          const siblingLeafs = leafByParent.get(String(task.parentId || '')) || [];
          const siblingIndex = siblingLeafs.findIndex((item) => item.id === task.id);
          if (siblingIndex > 0) {
            const prevSibling = assignmentById.get(siblingLeafs[siblingIndex - 1].id);
            if (prevSibling) candidateStarts.push(nextWorkingOnOrAfter(addWorkingDays(prevSibling.end, 1)));
          } else {
            const rootLeafs = leafByRoot.get(rootId) || [];
            const rootIndex = rootLeafs.findIndex((item) => item.id === task.id);
            if (rootIndex > 0) {
              const prevRootLeaf = assignmentById.get(rootLeafs[rootIndex - 1].id);
              if (prevRootLeaf) candidateStarts.push(nextWorkingOnOrAfter(addWorkingDays(prevRootLeaf.end, 1)));
            }
          }
        }

        if (!candidateStarts.length) {
          if (projectStartDate) candidateStarts.push(nextWorkingOnOrAfter(projectStartDate));
          else candidateStarts.push(nextWorkingOnOrAfter(new Date()));
        }

        let suggestedStart = candidateStarts.reduce((max, cur) => (cur > max ? cur : max));

        // For tasks without explicit predecessor, keep start within its main task window.
        if (!dependencyStart && mainWindow.end) {
          const windowEnd = prevWorkingOnOrBefore(mainWindow.end);
          if (suggestedStart > windowEnd) {
            suggestedStart = windowEnd;
          }
        }

        const suggestedEnd = addWorkingDays(suggestedStart, durationDays - 1);
        assignmentById.set(task.id, { start: suggestedStart, end: suggestedEnd });
        assignments.push({
          id: task.id,
          taskName: task.taskName,
          level: task.level ?? 0,
          startDate: toIso(suggestedStart),
          endDate: toIso(suggestedEnd),
        });
        progressed = true;
      });

      if (!progressed) break;
      pending = nextPending;
      passGuard -= 1;
    }

    // Fallback for cyclic/unresolved references: schedule by WBS sequence without predecessor anchors.
    pending.forEach((task) => {
      const durationDays = getDurationDays(task);
      const relationDate = parseIsoDateSafe(task.startDate);
      const rootId = getRootId(task.id);
      const mainWindow = mainWindowByRoot.get(rootId) || { start: null, end: null };

      const candidateStarts: Date[] = [];
      if (relationDate) candidateStarts.push(nextWorkingOnOrAfter(relationDate));

      if (mainWindow.start) candidateStarts.push(nextWorkingOnOrAfter(mainWindow.start));

      const siblingLeafs = leafByParent.get(String(task.parentId || '')) || [];
      const siblingIndex = siblingLeafs.findIndex((item) => item.id === task.id);
      if (siblingIndex > 0) {
        const prevSibling = assignmentById.get(siblingLeafs[siblingIndex - 1].id);
        if (prevSibling) candidateStarts.push(nextWorkingOnOrAfter(addWorkingDays(prevSibling.end, 1)));
      } else {
        const rootLeafs = leafByRoot.get(rootId) || [];
        const rootIndex = rootLeafs.findIndex((item) => item.id === task.id);
        if (rootIndex > 0) {
          const prevRootLeaf = assignmentById.get(rootLeafs[rootIndex - 1].id);
          if (prevRootLeaf) candidateStarts.push(nextWorkingOnOrAfter(addWorkingDays(prevRootLeaf.end, 1)));
        }
      }

      if (!candidateStarts.length) {
        if (projectStartDate) candidateStarts.push(nextWorkingOnOrAfter(projectStartDate));
        else candidateStarts.push(nextWorkingOnOrAfter(new Date()));
      }

      let suggestedStart = candidateStarts.reduce((max, cur) => (cur > max ? cur : max));

      if (mainWindow.end) {
        const windowEnd = prevWorkingOnOrBefore(mainWindow.end);
        if (suggestedStart > windowEnd) {
          suggestedStart = windowEnd;
        }
      }

      const suggestedEnd = addWorkingDays(suggestedStart, durationDays - 1);
      assignmentById.set(task.id, { start: suggestedStart, end: suggestedEnd });
      assignments.push({
        id: task.id,
        taskName: task.taskName,
        level: task.level ?? 0,
        startDate: toIso(suggestedStart),
        endDate: toIso(suggestedEnd),
      });
    });

    return {
      projectStart,
      projectEnd,
      projectDurationDays: getProjectDurationDays(projectStart, projectEnd),
      workingDayCount: workingDates.length,
      assignments,
      unresolvedDependencyCount: pending.length,
    };
  }, [activeProject?.endDate, activeProject?.startDate, projectTasks]);

  const openTaskContextMenu = (task: Task) => (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const taskLevel = task.level ?? 0;
    const margin = 12;
    const x = Math.max(margin, Math.min(e.clientX, window.innerWidth - margin));
    const y = Math.max(margin, Math.min(e.clientY, window.innerHeight - margin));
    setSelected(task.id);
    setContextMenu({ visible: true, x, y, task, taskLevel });
  };

  const handleContextMenuSelect = (action: InsertAction) => {
    const anchor = contextMenu.task;
    if (!anchor) return;
    const { parentId, sortOrder, level } = getInsertMeta(anchor, action);
    setNewTaskInsert({
      id: `new-${Date.now()}`,
      anchorId: anchor.id,
      parentId,
      action,
      sortOrder,
      taskName: '',
      effortManday: 0,
      startDate: todayIso,
      endDate: nextWeekIso,
      actualFinish: '',
      resource: '',
      percentComplete: 0,
      phase: anchor.phase || effectivePhaseOptions[0]?.value || '',
      level,
      relatedTask: '',
      relatedTaskType: 'FS',
      relatedTaskLagDays: 0,
    });
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleMoveToMainTask = async () => {
    const anchor = contextMenu.task;
    if (!anchor) return;
    if (!anchor.parentId) {
      toast.error('This task is already a Main Task');
      setContextMenu((prev) => ({ ...prev, visible: false }));
      return;
    }

    const roots = projectTasks
      .filter((t) => !t.parentId && t.id !== anchor.id)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    const firstWbs = Number(String(anchor.wbs || '').split('.')[0] || 0);
    const suggestedIndex = Number.isFinite(firstWbs) && firstWbs > 0
      ? Math.min(roots.length + 1, Math.max(1, firstWbs + 1))
      : roots.length + 1;

    setMoveToMainModal({ task: anchor, targetIndex: suggestedIndex });
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const confirmMoveToMainTask = async () => {
    if (!moveToMainModal) return;
    const anchor = moveToMainModal.task;
    const roots = projectTasks
      .filter((t) => !t.parentId && t.id !== anchor.id)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    const targetIndex = Math.max(1, Math.min(moveToMainModal.targetIndex, roots.length + 1));
    const insertAt = targetIndex - 1;

    let nextSortOrder = 1;
    if (roots.length === 0) {
      nextSortOrder = 1;
    } else if (insertAt <= 0) {
      nextSortOrder = Number(roots[0].sortOrder || 0) - 0.5;
    } else if (insertAt >= roots.length) {
      nextSortOrder = Number(roots[roots.length - 1].sortOrder || 0) + 1;
    } else {
      const prev = Number(roots[insertAt - 1].sortOrder || 0);
      const next = Number(roots[insertAt].sortOrder || 0);
      nextSortOrder = (prev + next) / 2;
    }

    try {
      await updateTask(anchor.id, {
        parentId: '',
        sortOrder: nextSortOrder,
      });
      toast.success(`Moved to Main Task (WBS ${targetIndex})`);
    } catch {
      toast.error('Failed to move task');
    } finally {
      setMoveToMainModal(null);
    }
  };

  const handleMoveToSubTask = async () => {
    const anchor = contextMenu.task;
    if (!anchor) return;

    const taskLevel = anchor.level ?? 0;
    const targetLevel: 1 | 2 = taskLevel === 1 ? 2 : 1;
    const candidates = projectTasks
      .filter((t) => {
        if (t.id === anchor.id) return false;
        if (targetLevel === 1) return !t.parentId;
        return (t.level ?? 0) === 1;
      })
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));

    if (!candidates.length) {
      toast.error(targetLevel === 1
        ? 'Cannot move to Sub Task Level 1: no target Main Task found'
        : 'Cannot move to Sub Task Level 2: no target Sub Task Level 1 found');
      setContextMenu((prev) => ({ ...prev, visible: false }));
      return;
    }

    setMoveToSubModal({ task: anchor, targetParentId: candidates[0].id, targetLevel });
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const confirmMoveToSubTask = async () => {
    if (!moveToSubModal) return;
    const anchor = moveToSubModal.task;
    const targetParentId = moveToSubModal.targetParentId;
    const targetLevel = moveToSubModal.targetLevel;
    const targetParent = projectTasks.find((t) => t.id === targetParentId);
    if (!targetParent) {
      toast.error(targetLevel === 1 ? 'Target Main Task not found' : 'Target Sub Task Level 1 not found');
      return;
    }

    if (targetLevel === 1 && targetParent.parentId) {
      toast.error('Target for Sub Task Level 1 must be a Main Task');
      return;
    }
    if (targetLevel === 2 && (targetParent.level ?? 0) !== 1) {
      toast.error('Target for Sub Task Level 2 must be Sub Task Level 1');
      return;
    }

    try {
      const children = projectTasks
        .filter((t) => t.parentId === targetParentId)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
      const nextSortOrder = children.length ? Number(children[children.length - 1].sortOrder || 0) + 1 : 1;

      await updateTask(anchor.id, {
        parentId: targetParentId,
        sortOrder: nextSortOrder,
      });
      toast.success(`Moved to Sub Task Level ${targetLevel} under ${targetParent.taskName}`);
    } catch {
      toast.error('Failed to move task');
    } finally {
      setMoveToSubModal(null);
    }
  };

  const handleReorderTask = async (mode: 'up' | 'down' | 'top' | 'bottom') => {
    const anchor = contextMenu.task;
    if (!anchor || !activeProject) return;

    // Sort siblings by WBS — same order the user sees on screen
    const siblings = [...projectTasks]
      .filter((t) => (t.parentId || '') === (anchor.parentId || ''))
      .sort((a, b) => compareWbs(a.wbs || '', b.wbs || ''));
    const index = siblings.findIndex((t) => t.id === anchor.id);

    if (index < 0 || siblings.length <= 1) {
      setContextMenu((prev) => ({ ...prev, visible: false }));
      return;
    }

    let newIndex = index;
    if (mode === 'up') {
      if (index === 0) { toast('Task is already at top'); setContextMenu((prev) => ({ ...prev, visible: false })); return; }
      newIndex = index - 1;
    } else if (mode === 'down') {
      if (index === siblings.length - 1) { toast('Task is already at bottom'); setContextMenu((prev) => ({ ...prev, visible: false })); return; }
      newIndex = index + 1;
    } else if (mode === 'top') {
      if (index === 0) { toast('Task is already at top'); setContextMenu((prev) => ({ ...prev, visible: false })); return; }
      newIndex = 0;
    } else /* bottom */ {
      if (index === siblings.length - 1) { toast('Task is already at bottom'); setContextMenu((prev) => ({ ...prev, visible: false })); return; }
      newIndex = siblings.length - 1;
    }

    // Rebuild sibling list with anchor moved to new position
    const reordered = [...siblings];
    reordered.splice(index, 1);
    reordered.splice(newIndex, 0, anchor);

    try {
      await reorderTasks(activeProject.id, reordered.map((t) => t.id));
      toast.success('Task order updated');
    } catch {
      toast.error('Failed to reorder task');
    } finally {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    }
  };

  const handleTableRowDragStart = (task: Task) => (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    dragTaskIdRef.current = task.id;
    setDragTaskId(task.id);
  };

  const handleTableRowDragEnd = () => {
    dragTaskIdRef.current = null;
    setDragTaskId(null);
    setDropTarget(null);
  };

  const handleTableRowDragOver = (targetTask: Task) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = dragTaskIdRef.current || dragTaskId || e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetTask.id) {
      setDropTarget(null);
      return;
    }

    const draggedTask = projectTasks.find((t) => t.id === draggedId);
    if (!draggedTask) return;
    if ((draggedTask.parentId || '') !== (targetTask.parentId || '')) {
      setDropTarget(null);
      return;
    }

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const position: 'before' | 'after' = (e.clientY - rect.top) < (rect.height / 2) ? 'before' : 'after';
    setDropTarget({ id: targetTask.id, position });
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTableRowDrop = (targetTask: Task) => async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = dragTaskIdRef.current || dragTaskId || e.dataTransfer.getData('text/plain');
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const dropPosition: 'before' | 'after' = (e.clientY - rect.top) < (rect.height / 2) ? 'before' : 'after';
    setDropTarget(null);
    dragTaskIdRef.current = null;
    setDragTaskId(null);

    if (!draggedId || draggedId === targetTask.id) return;
    const draggedTask = projectTasks.find((t) => t.id === draggedId);
    if (!draggedTask) return;
    if ((draggedTask.parentId || '') !== (targetTask.parentId || '')) {
      toast.error('Drag & drop is allowed only within the same group');
      return;
    }

    if (!activeProject) return;

    // Use the exact visual order (WBS-sorted) as the authoritative sequence.
    // Remove the dragged task then re-insert at the desired drop position.
    const siblingsInViewOrder = visible
      .filter((t) => (t.parentId || '') === (targetTask.parentId || ''));

    const withoutDragged = siblingsInViewOrder.filter((t) => t.id !== draggedTask.id);
    const targetIdx = withoutDragged.findIndex((t) => t.id === targetTask.id);
    if (targetIdx < 0) return;

    const insertAt = dropPosition === 'before' ? targetIdx : targetIdx + 1;
    const newOrder = [...withoutDragged];
    newOrder.splice(insertAt, 0, draggedTask);

    try {
      await reorderTasks(activeProject.id, newOrder.map((t) => t.id));
      toast.success('Task moved');
    } catch {
      toast.error('Failed to move task');
    }
  };

  const cancelNewTask = () => setNewTaskInsert(null);

  const saveNewTask = async () => {
    if (!newTaskInsert) return;
    if (!newTaskInsert.taskName.trim()) {
      toast.error('Task Name is required');
      return;
    }
    const normalized = normalizeTaskDateRange(newTaskInsert.startDate, newTaskInsert.endDate);
    const normalizedActualFinish = normalizeDateInputToIso(newTaskInsert.actualFinish);
    try {
      await createTask({
        projectId,
        parentId: newTaskInsert.parentId,
        sortOrder: newTaskInsert.sortOrder,
        taskName: newTaskInsert.taskName,
        effortManday: roundEffortManday(newTaskInsert.effortManday),
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        actualFinish: normalizedActualFinish,
        duration: calcDuration(normalized.startDate, normalized.endDate),
        resource: newTaskInsert.resource,
        phase: newTaskInsert.phase,
        percentComplete: newTaskInsert.percentComplete,
        relatedTask: newTaskInsert.relatedTask,
        relatedTaskType: newTaskInsert.relatedTaskType,
        relatedTaskLagDays: newTaskInsert.relatedTaskLagDays,
      });
      if (normalized.adjusted) {
        toast.success('ปรับวันที่สิ้นสุดให้ไม่น้อยกว่าวันที่เริ่มต้นแล้ว');
      }
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
    if (!contextMenu.visible) return;
    const menuEl = contextMenuRef.current;
    if (!menuEl) return;

    const margin = 12;
    const rect = menuEl.getBoundingClientRect();
    let nextX = contextMenu.x;
    let nextY = contextMenu.y;

    if (rect.right > window.innerWidth - margin) {
      nextX -= rect.right - (window.innerWidth - margin);
    }
    if (rect.bottom > window.innerHeight - margin) {
      nextY -= rect.bottom - (window.innerHeight - margin);
    }
    if (rect.left < margin) nextX = margin;
    if (rect.top < margin) nextY = margin;

    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu((prev) => ({ ...prev, x: Math.round(nextX), y: Math.round(nextY) }));
    }
  }, [contextMenu.visible, contextMenu.x, contextMenu.y, contextMenu.taskLevel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('task-suggestion-locked', String(isSuggestionLocked));
  }, [isSuggestionLocked]);

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
    const currentTask = projectTasks.find((task) => task.id === id);
    if (!raw) {
      const updates: Partial<Task> = { [field]: '' };
      if (currentTask && (field === 'startDate' || field === 'endDate')) {
        const nextStart = field === 'startDate' ? '' : String(currentTask.startDate || '');
        const nextEnd = field === 'endDate' ? '' : String(currentTask.endDate || '');
        updates.duration = calcDuration(nextStart, nextEnd);
      }
      try { await updateTask(id, updates); }
      catch { toast.error('Failed to save'); }
      return;
    }
    const iso = normalizeDateInputToIso(raw);
    if (!iso) {
      toast.error('วันที่ต้องเป็นรูปแบบ DD/MM/YYYY');
      return;
    }
    const updates: Partial<Task> = { [field]: iso };
    if (currentTask && (field === 'startDate' || field === 'endDate')) {
      const nextStart = field === 'startDate' ? iso : String(currentTask.startDate || '');
      const nextEnd = field === 'endDate' ? iso : String(currentTask.endDate || '');
      const normalized = normalizeTaskDateRange(nextStart, nextEnd);
      updates.startDate = normalized.startDate;
      updates.endDate = normalized.endDate;
      updates.duration = calcDuration(normalized.startDate, normalized.endDate);
      if (normalized.adjusted) {
        toast.success('ปรับวันที่สิ้นสุดให้ไม่น้อยกว่าวันที่เริ่มต้นแล้ว');
      }
    }
    try { await updateTask(id, updates); }
    catch { toast.error('Failed to save'); }
  }, [projectTasks, updateTask]);

  const handlePct = useCallback(async (id: string, pct: number) => {
    try {
      const res = await taskApi.setComplete(id, pct);
      useStore.setState({ tasks: res.allTasks ?? useStore.getState().tasks });
    } catch { toast.error('Failed to save'); }
  }, []);

  const openSuggestionModal = () => {
    if (isSuggestionLocked) {
      toast.error('Suggestion is locked. Please unlock first.');
      return;
    }
    setSuggestModalOpen(true);
  };

  const toggleSuggestionLock = () => {
    if (!isSuggestionLocked) {
      setIsSuggestionLocked(true);
      setSuggestModalOpen(false);
      toast.success('Suggestion locked');
      return;
    }
    setUnlockPassword('');
    setUnlockModalOpen(true);
  };

  const confirmUnlockSuggestion = () => {
    if (unlockPassword.trim() !== getTodayPassword()) {
      toast.error('Invalid password.');
      return;
    }
    setIsSuggestionLocked(false);
    setUnlockModalOpen(false);
    setUnlockPassword('');
    toast.success('Suggestion unlocked');
  };

  const applySuggestedDates = async () => {
    if (!activeProject?.startDate || !activeProject?.endDate) {
      toast.error('Project start/end date is required');
      return;
    }
    if (suggestionPreview.workingDayCount <= 0) {
      toast.error('Project duration has no working days to suggest');
      return;
    }
    if (!suggestionPreview.assignments.length) {
      toast.error('No leaf tasks found to update');
      return;
    }

    try {
      setLoading(true);
      for (const assignment of suggestionPreview.assignments) {
        await updateTask(assignment.id, {
          startDate: assignment.startDate,
          endDate: assignment.endDate,
        });
      }
      await fetchTasks(projectId);
      toast.success(`Suggested dates applied to ${suggestionPreview.assignments.length} task(s)`);
      setSuggestModalOpen(false);
    } catch {
      toast.error('Failed to apply suggested dates');
    } finally {
      setLoading(false);
    }
  };

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

  const normalizeExcelDate = (value: unknown): string => {
    if (value == null || value === '') return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) return '';
      const yyyy = String(parsed.y).padStart(4, '0');
      const mm = String(parsed.m).padStart(2, '0');
      const dd = String(parsed.d).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const text = String(value).trim();
    if (!text) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return dmyToIso(text) || '';
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  };

  const parseImportRows = (sheet: XLSX.WorkSheet): TaskImportRow[] => {
    const matrix = XLSX.utils.sheet_to_json<(string | number | Date)[]>(sheet, { header: 1, defval: '' });
    const headers = (matrix[0] || []).map((value) => String(value || '').trim());
    const missingHeaders = TASK_IMPORT_REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missingHeaders.length) {
      throw new Error(`Missing columns: ${missingHeaders.join(', ')}`);
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
    const importedRows = rows
      .map((row, index) => {
        const rawActualFinish = row['Actual Finish'];
        const actualFinish = normalizeExcelDate(rawActualFinish);
        if (String(rawActualFinish ?? '').trim() && !actualFinish) {
          throw new Error(`Row ${index + 2}: Actual Finish must be YYYY-MM-DD`);
        }

        const rawStartDate = row['Start Date'];
        const startDate = normalizeExcelDate(rawStartDate);
        if (String(rawStartDate ?? '').trim() && !startDate) {
          throw new Error(`Row ${index + 2}: Start Date must be YYYY-MM-DD`);
        }

        const rawEndDate = row['End Date'];
        const endDate = normalizeExcelDate(rawEndDate);
        if (String(rawEndDate ?? '').trim() && !endDate) {
          throw new Error(`Row ${index + 2}: End Date must be YYYY-MM-DD`);
        }

        const percent = Number(row['% Complete'] ?? 0);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
          throw new Error(`Row ${index + 2}: % Complete must be between 0 and 100`);
        }

        const status = String(row['Status'] || '').trim() as TaskStatus;
        if (!TASK_STATUS_OPTIONS.includes(status)) {
          throw new Error(`Row ${index + 2}: Status must be one of ${TASK_STATUS_OPTIONS.join(', ')}`);
        }

        const effort = Number(row['Effort Manday'] ?? 0);
        if (!Number.isFinite(effort) || effort < 0) {
          throw new Error(`Row ${index + 2}: Effort Manday must be a non-negative number`);
        }

        const predecessorTypeRaw = String(row['Predecessor Type'] || '').trim().toUpperCase();
        const predecessorType = (TASK_DEPENDENCY_OPTIONS.includes(predecessorTypeRaw as 'FS' | 'SS' | 'FF' | 'SF')
          ? predecessorTypeRaw
          : 'FS') as 'FS' | 'SS' | 'FF' | 'SF';

        const lagRaw = String(row['Predecessor Lag Days'] ?? '').trim();
        const predecessorLagDays = lagRaw === '' ? 0 : Number(lagRaw);
        if (!Number.isFinite(predecessorLagDays) || !Number.isInteger(predecessorLagDays)) {
          throw new Error(`Row ${index + 2}: Predecessor Lag Days must be an integer`);
        }

        return {
          wbs: String(row['WBS'] || '').trim(),
          taskName: String(row['Task Name'] || '').trim(),
          parentWbs: String(row['Parent WBS'] || '').trim(),
          startDate,
          endDate,
          actualFinish,
          percentComplete: percent,
          status,
          phase: String(row['Phase'] || '').trim(),
          predecessorWbs: String(row['Predecessor WBS'] || '').trim(),
          predecessorType,
          predecessorLagDays,
          resource: String(row['Owner'] || '').trim(),
          effortManday: effort,
        };
      })
      .filter((row) => row.wbs || row.taskName || row.parentWbs || row.startDate || row.endDate || row.phase || row.predecessorWbs || row.resource);

    if (!importedRows.length) {
      throw new Error('No task rows found in the file');
    }

    return importedRows;
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
    const taskById = new Map(projectTasks.map((task) => [task.id, task]));
    const sortedTasks = [...projectTasks].sort((a, b) => compareWbs(a.wbs, b.wbs));
    const exampleRows = [
      ['1', 'Project Preparation', '', '2026-05-01', '2026-05-05', '', 100, 'Done', effectivePhaseOptions[0]?.value || 'Project Initiation', '', 'PM Team', 0, 'FS', 0],
      ['1.1', 'Kickoff Meeting', '1', '2026-05-01', '2026-05-01', '2026-05-01', 100, 'Done', effectivePhaseOptions[0]?.value || 'Project Initiation', '', 'PM Team', 0.5, 'FS', 0],
      ['1.2', 'Requirement Workshop', '1', '2026-05-02', '2026-05-05', '', 60, 'In Progress', effectivePhaseOptions[1]?.value || 'Requirement & Gap Analysis', '1.1', 'Business Analyst', 2, 'FS', 1],
      ['2', 'Blueprint Phase', '', '2026-05-06', '2026-05-12', '', 0, 'Todo', effectivePhaseOptions[2]?.value || 'Business Blueprint', '1.2', 'Consulting Team', 0, 'SS', 0],
      ['2.1', 'Design Approval', '2', '2026-05-10', '2026-05-12', '', 0, 'Todo', effectivePhaseOptions[2]?.value || 'Business Blueprint', '', 'Project Sponsor', 1, 'FS', 0],
    ];
    const exportRows = sortedTasks.length > 0
      ? sortedTasks.map((task) => [
          task.wbs,
          task.taskName,
          task.parentId ? (taskById.get(task.parentId)?.wbs || '') : '',
          task.startDate,
          task.endDate,
          task.actualFinish || '',
          task.percentComplete,
          getTaskStatus(task),
          task.phase || '',
          task.relatedTask ? (taskById.get(task.relatedTask)?.wbs || '') : '',
          task.resource || '',
          Number(task.effortManday || 0),
          task.relatedTaskType || 'FS',
          Number(task.relatedTaskLagDays || 0),
        ])
      : exampleRows;
    const ws = XLSX.utils.aoa_to_sheet([
      [...TASK_IMPORT_HEADERS],
      ...exportRows,
    ]);
    ws['!cols'] = [{wch:10},{wch:38},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12},{wch:16},{wch:26},{wch:18},{wch:24},{wch:14},{wch:18},{wch:20}];

    const referenceSheet = XLSX.utils.aoa_to_sheet([
      ['Field', 'Rule'],
      ['WBS', 'Required, unique per project. Example: 1, 1.1, 1.1.1'],
      ['Parent WBS', 'Leave blank for root task. Must point to another WBS in this file'],
      ['Start Date / End Date / Actual Finish', 'Use YYYY-MM-DD'],
      ['% Complete', '0-100'],
      ['Status', TASK_STATUS_OPTIONS.join(', ')],
      ['Phase', effectivePhaseOptions.map((option) => option.value).join(', ') || 'Use existing project phase values'],
      ['Predecessor WBS', 'Leave blank or reference another WBS in this file'],
      ['Predecessor Type', 'FS / SS / FF / SF (optional, default FS)'],
      ['Predecessor Lag Days', 'Integer days, use negative for lead (optional, default 0)'],
      ['Owner', 'Mapped to Resource field in current system'],
      ['Overwrite Import', 'Import will delete all current tasks in this project and recreate from sheet'],
    ]);
    referenceSheet['!cols'] = [{ wch: 24 }, { wch: 90 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.utils.book_append_sheet(wb, referenceSheet, 'Reference');
    XLSX.writeFile(wb, `tasks-${projectId}.xlsx`);
    toast.success(sortedTasks.length > 0 ? 'Exported XLSX' : 'Exported XLSX with example rows'); setShowExport(false);
  };

  const openImportDialog = () => {
    setShowExport(false);
    importInputRef.current?.click();
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets.Tasks || workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('Tasks sheet not found');
      const importedRows = parseImportRows(sheet);
      setImportPreview({ fileName: file.name, rows: importedRows });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    }
  };

  const confirmImportOverwrite = async () => {
    if (!importPreview) return;
    try {
      setImporting(true);
      const result = await taskApi.replaceByImport(projectId, importPreview.rows);
      useStore.setState({ tasks: result.data });
      setImportPreview(null);
      toast.success(`Imported ${result.data.length} tasks`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // ── PDF export: redesigned with Poppins-like styling ──────────────────────
  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const proj = useStore.getState().activeProject;
    const today = new Date();
    const reportDateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // ── Colors ──
    const colText:    [number,number,number] = [30,  30,  30 ];
    const colMuted:   [number,number,number] = [100, 116, 139];
    const colGray:    [number,number,number] = [203, 213, 225];
    const colRowMain: [number,number,number] = [219, 234, 254]; // indigo-100
    const colRowSub:  [number,number,number] = [241, 245, 249]; // slate-100

    // ── Layout ──
    const PL = 8, PR = 8;
    const hdrH = 18;
    const ftrH = 10;
    const cW = W - PL - PR;
    const startY = hdrH + 5;
    const ftrLineY = H - ftrH;
    const ftrTextY = H - ftrH + 5;

    // ── Column widths (mm) ──
    const CW = { wbs: 12, name: 68, start: 20, end: 20, dur: 11, pct: 10, status: 18, owner: 24 };
    const tableW = Object.values(CW).reduce((s, v) => s + v, 0);
    const gW = cW - tableW;
    const gX = PL + tableW;
    const tHdrH = 8;
    const baseRowH = 6.2;

    const u8ToBase64 = (bytes: Uint8Array): string => {
      let out = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        out += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return btoa(out);
    };

    const ensurePoppinsFont = async () => {
      try {
        const fl = (doc as any).getFontList?.();
        if (fl?.Poppins || fl?.poppins) return;

        const [regRes, boldRes] = await Promise.all([
          fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Regular.ttf'),
          fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf'),
        ]);
        if (!regRes.ok || !boldRes.ok) return;

        const [regBuf, boldBuf] = await Promise.all([regRes.arrayBuffer(), boldRes.arrayBuffer()]);
        doc.addFileToVFS('Poppins-Regular.ttf', u8ToBase64(new Uint8Array(regBuf)));
        doc.addFileToVFS('Poppins-Bold.ttf', u8ToBase64(new Uint8Array(boldBuf)));
        doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal');
        doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold');
      } catch {
        // Keep default font fallback if external font loading fails.
      }
    };

    await ensurePoppinsFont();

    // jsPDF needs embedded TTF for true custom fonts; use Poppins name when available, fallback otherwise.
    const setPdfFont = (style: 'normal' | 'bold' = 'normal') => {
      const fl = (doc as any).getFontList?.();
      const popName = fl?.Poppins ? 'Poppins' : (fl?.poppins ? 'poppins' : null);
      doc.setFont(popName || 'helvetica', style);
    };

    // ── Helper: row height ──
    const getRowH = (task: Task): number => {
      doc.setFontSize(5.8);
      const ind = task.level * 2;
      const lines = doc.splitTextToSize(task.taskName || '', Math.max(5, CW.name - ind - 2));
      return Math.max(baseRowH, 2.2 + Math.min(3, Array.isArray(lines) ? lines.length : 1) * 1.9);
    };

    // ── Paginate ──
    const all = [...projectTasks].sort((a, b) => compareWbs(a.wbs, b.wbs));
    const maxBody = H - startY - tHdrH - ftrH - 4;
    const pages: Task[][] = [];
    let curPage: Task[] = [], curH = 0;
    all.forEach(t => {
      const h = getRowH(t);
      if (curPage.length && curH + h > maxBody) { pages.push(curPage); curPage = [t]; curH = h; }
      else { curPage.push(t); curH += h; }
    });
    if (curPage.length || !pages.length) pages.push(curPage);
    const totalPages = pages.length;

    // ── Date range & months (day-accurate scale like Tasks tab) ──
    const valid = all.filter(t => t.startDate && t.endDate);
    const allD = valid.flatMap(t => [new Date(t.startDate), new Date(t.endDate)]);
    const rawMinD = allD.length ? new Date(Math.min(...allD.map(d => d.getTime()))) : new Date();
    const rawMaxD = allD.length ? new Date(Math.max(...allD.map(d => d.getTime()))) : new Date();
    rawMinD.setHours(0, 0, 0, 0);
    rawMaxD.setHours(0, 0, 0, 0);
    // Expand to full months so month headers auto-fit evenly and avoid cramped first/last segments.
    const minD = new Date(rawMinD.getFullYear(), rawMinD.getMonth(), 1);
    const maxD = new Date(rawMaxD.getFullYear(), rawMaxD.getMonth() + 1, 0);
    minD.setHours(0, 0, 0, 0);
    maxD.setHours(0, 0, 0, 0);
    const months: Date[] = [];
    const mc = new Date(minD.getFullYear(), minD.getMonth(), 1);
    while (mc <= maxD) { months.push(new Date(mc)); mc.setMonth(mc.getMonth() + 1); }
    const mCnt = months.length;
    const MS_DAY = 86400000;
    const totalDays = Math.max(1, Math.floor((maxD.getTime() - minD.getTime()) / MS_DAY) + 1);
    const dayW = gW / totalDays;
    const mFontSz = mCnt <= 4 ? 6 : mCnt <= 8 ? 5.5 : mCnt <= 14 ? 5 : 4.5;
    const dayOffset = (d: Date) => Math.floor((d.getTime() - minD.getTime()) / MS_DAY);

    // ── Render pages ──
    for (let pg = 0; pg < totalPages; pg++) {
      if (pg > 0) doc.addPage('a4', 'landscape');
      const rows = pages[pg] || [];

      // ── HEADER: white rounded rect, thin gray border ──
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...colGray);
      doc.setLineWidth(0.3);
      doc.roundedRect(PL, 2, cW, hdrH, 3, 3, 'FD');

      // Left: Client name
      doc.setFontSize(9.5); setPdfFont('bold'); doc.setTextColor(...colText);
      doc.text(proj?.client || proj?.name || 'Project', PL + 5.5, 10.8);

      // Center: Fixed title
      doc.setFontSize(11.5); setPdfFont('bold'); doc.setTextColor(...colText);
      doc.text('Project Implementation Schedule', W / 2, 10.6, { align: 'center' });

      // Right: REPORT DATE box (rounded, thin gray border)
      const dbW = 36, dbH = 12, dbX = W - PR - dbW - 2, dbY = 3.5;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(...colGray);
      doc.setLineWidth(0.25);
      doc.roundedRect(dbX, dbY, dbW, dbH, 2, 2, 'FD');
      doc.setFontSize(5.5); setPdfFont('bold'); doc.setTextColor(...colMuted);
      doc.text('REPORT DATE', dbX + dbW / 2, dbY + 3.5, { align: 'center' });
      doc.setFontSize(7); setPdfFont('normal'); doc.setTextColor(...colText);
      doc.text(reportDateStr, dbX + dbW / 2, dbY + 9, { align: 'center' });

      // ── TABLE HEADER ──
      let cy = startY;
      doc.setFillColor(239, 246, 255);
      doc.rect(PL, cy, cW, tHdrH, 'F');
      doc.setDrawColor(...colGray); doc.setLineWidth(0.2);
      doc.rect(PL, cy, cW, tHdrH, 'S');

      const hcols = [
        { l:'WBS', w: CW.wbs }, { l:'Task Name', w: CW.name },
        { l:'Start', w: CW.start }, { l:'Finish', w: CW.end },
        { l:'Dur.', w: CW.dur }, { l:'%', w: CW.pct },
        { l:'Status', w: CW.status }, { l:'Owner', w: CW.owner },
      ];
      doc.setFontSize(5.8); setPdfFont('bold'); doc.setTextColor(49, 46, 129);
      let hx = PL;
      hcols.forEach(c => {
        const tw = doc.getTextWidth(c.l);
        doc.text(c.l, hx + (c.w - tw) / 2, cy + 5.3);
        hx += c.w;
      });

      // Month headers
      doc.setFillColor(249, 250, 251);
      doc.rect(gX, cy, gW, tHdrH, 'F');
      doc.setDrawColor(...colGray); doc.rect(gX, cy, gW, tHdrH, 'S');
      months.forEach((mo, i) => {
        const segS = new Date(Math.max(new Date(mo.getFullYear(), mo.getMonth(), 1).getTime(), minD.getTime()));
        const segE = new Date(Math.min(new Date(mo.getFullYear(), mo.getMonth() + 1, 0).getTime(), maxD.getTime()));
        const mx = gX + dayOffset(segS) * dayW;
        const mw = (dayOffset(segE) - dayOffset(segS) + 1) * dayW;
        const label = mo.toLocaleString('en', { month: 'short', year: '2-digit' }).toUpperCase();
        doc.setFontSize(mFontSz); setPdfFont('bold'); doc.setTextColor(70, 70, 70);
        const tw = doc.getTextWidth(label);
        doc.text(label, mx + (mw - tw) / 2, cy + 5.3);
        if (i < months.length - 1) {
          doc.setDrawColor(...colGray); doc.setLineWidth(0.1);
          doc.line(mx + mw, cy, mx + mw, cy + tHdrH);
        }
      });
      cy += tHdrH;

      // ── TASK ROWS ──
      rows.forEach(task => {
        const rH = getRowH(task);
        const ry = cy;
        const isMain = task.level === 0;
        const isPar = hasChildren(projectTasks, task.id);
        const isSubParent = !isMain && isPar;
        const isLeafSubTask = !isMain && !isPar;
        const indent = task.level * 2.5;
        const isMile = task.duration === 0;
        const pct = task.percentComplete;
        const pcArr: [number,number,number] = pct >= 100 ? [16,185,129] : pct >= 60 ? [59,130,246] : [99,102,241];
        const [pcR, pcG, pcB] = pcArr;

        // Row background by level
        if (isMain)       { doc.setFillColor(...colRowMain); }
        else if (isPar)   { doc.setFillColor(...colRowSub);  }
        else              { doc.setFillColor(255, 255, 255); }
        doc.rect(PL, ry, cW, rH, 'F');

        // Row border
        doc.setDrawColor(...colGray); doc.setLineWidth(0.15);
        doc.rect(PL, ry, cW, rH, 'S');

        // Column separators
        let sx = PL;
        Object.values(CW).forEach(w => {
          doc.setDrawColor(...colGray); doc.setLineWidth(0.1);
          doc.line(sx + w, ry, sx + w, ry + rH);
          sx += w;
        });

        const ymid = ry + rH / 2 + 0.5;

        // WBS
        doc.setFontSize(isMain ? 6 : 5.6);
        setPdfFont(isMain ? 'bold' : 'normal');
        doc.setTextColor(...colText);
        const wbsW = doc.getTextWidth(task.wbs || '');
        doc.text(task.wbs || '', PL + (CW.wbs - wbsW) / 2, ymid);

        // Task Name
        setPdfFont((isMain || isPar) ? 'bold' : 'normal');
        doc.setFontSize(isMain ? 6.1 : isPar ? 5.8 : 5.5);
        doc.setTextColor(...colText);
        const label = isMile ? `◆ ${task.taskName}` : task.taskName;
        const nLines = doc.splitTextToSize(label || '', Math.max(4, CW.name - indent - 1));
        doc.text(nLines, PL + CW.wbs + indent + 1, ymid - (Math.min(nLines.length, 2) - 1) * 1.1);

        // Start / Finish / Duration
        const xD = PL + CW.wbs + CW.name;
        setPdfFont('normal'); doc.setTextColor(...colMuted); doc.setFontSize(5.4);
        doc.text(task.startDate ? fmtDatePdf(task.startDate) : '', xD + 1, ymid);
        doc.text(task.endDate   ? fmtDatePdf(task.endDate)   : '', xD + CW.start + 1, ymid);
        doc.text(`${task.duration}d`, xD + CW.start + CW.end + 1, ymid);

        // %
        const xP = xD + CW.start + CW.end + CW.dur;
        setPdfFont('bold'); doc.setTextColor(pcR, pcG, pcB); doc.setFontSize(5.5);
        doc.text(`${pct}%`, xP + CW.pct / 2, ymid, { align: 'center' });

        // Status / Owner
        setPdfFont('normal'); doc.setTextColor(...colMuted); doc.setFontSize(5.4);
        doc.text(task.status || 'Todo', xP + CW.pct + 1, ymid);
        const ownerLines = doc.splitTextToSize(String(task.resource || '-'), CW.owner - 2);
        doc.text(ownerLines, xP + CW.pct + CW.status + 1, ymid);

        // ── GANTT BAR ──
        if (task.startDate && task.endDate) {
          const s1 = new Date(task.startDate);
          const e1 = new Date(task.endDate);
          s1.setHours(0, 0, 0, 0);
          e1.setHours(0, 0, 0, 0);
          const sOfs = Math.max(0, dayOffset(s1));
          const eOfs = Math.min(totalDays - 1, dayOffset(e1));
          const spanDays = Math.max(1, eOfs - sOfs + 1);
          const bx = gX + sOfs * dayW + 0.15;
          const bw = Math.max(spanDays * dayW - 0.3, 0.65);
          const barH = 2.05;
          const barY = ry + (rH - barH) / 2;
          const barR = 0.7;

          if (isMain) {
            // Main task: solid gray.
            doc.setFillColor(148, 163, 184);
            doc.roundedRect(bx, barY, bw, barH, barR, barR, 'F');
            doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.22);
            doc.roundedRect(bx, barY, bw, barH, barR, barR, 'S');
          } else if (isSubParent) {
            // Subtask with children: lighter gray.
            doc.setFillColor(203, 213, 225);
            doc.roundedRect(bx, barY, bw, barH, barR, barR, 'F');
            doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
            doc.roundedRect(bx, barY, bw, barH, barR, barR, 'S');
          } else if (isLeafSubTask) {
            // Leaf subtask: cyan fill.
            doc.setFillColor(109, 192, 222);
            doc.roundedRect(bx, barY, bw, barH, barR, barR, 'F');
            doc.setDrawColor(88, 164, 194); doc.setLineWidth(0.2);
            doc.roundedRect(bx, barY, bw, barH, barR, barR, 'S');
          }
        }

        // Month dividers per row
        months.forEach((mo, i) => {
          if (i < months.length - 1) {
            const nextMonthStart = new Date(mo.getFullYear(), mo.getMonth() + 1, 1);
            const splitX = gX + dayOffset(nextMonthStart) * dayW;
            doc.setDrawColor(...colGray); doc.setLineWidth(0.1);
            doc.line(splitX, ry, splitX, ry + rH);
          }
        });

        cy += rH;
      });

      // Keep single seam line from table column border; avoid duplicated separator here.

      // ── FOOTER ──
      doc.setDrawColor(...colGray); doc.setLineWidth(0.2);
      doc.line(PL, ftrLineY, W - PR, ftrLineY);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...colMuted);
      doc.text('Prepared by Humanica Public Company Limited', PL, ftrTextY);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...colText);
      doc.text('Confidential', W / 2, ftrTextY, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...colMuted);
      doc.text(`Project ID: ${proj?.code || projectId} | Page ${pg + 1} of ${totalPages}`, W - PR, ftrTextY, { align: 'right' });
    }

    doc.save(`tasks-gantt-${projectId}.pdf`);
    toast.success('Exported PDF');
    setShowExport(false);
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
                    <span>{Number(task.effortManday || 0).toFixed(3)} MD</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: C.text2 }}>
                    <span>Resource: {task.resource || '—'}</span>
                    <span>Level: {task.level ?? 0}</span>
                    <span>Effort: {Number(task.effortManday || 0).toFixed(3)} MD</span>
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

  const isColumnVisible = useCallback((columnId: TaskColumnId) => columnVisibility[columnId] !== false, [columnVisibility]);

  const visibleHeaderColumns = useMemo(
    () => COLS.map((col, index) => ({ col, index })).filter(({ col }) => isColumnVisible(col.id)),
    [isColumnVisible],
  );

  const handleToggleColumnVisibility = (columnId: TaskColumnId) => {
    if (MANDATORY_COLUMN_IDS.has(columnId)) return;
    setColumnVisibility((prev) => normalizeColumnVisibility({ ...prev, [columnId]: !prev[columnId] }));
  };

  const handleResetColumnVisibility = () => {
    setColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY });
  };

  const tableContent = (
    <div style={{ display:'flex', flex:1, flexDirection:'column', height:'100%', overflow:'hidden', minHeight:0 }}>
      {isMobile ? taskCardContent : (
        <>
          <div style={{ flex:1, minWidth:0, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ overflowX:'auto', overflowY:'hidden', minWidth:0 }}>
              {/* Table header — same height as Gantt header (HDR_H) */}
              <div ref={tableHeaderRef} onScroll={onHeaderScroll} style={{ minWidth:'max-content', display:'flex', background:C.bg, borderBottom:`1px solid ${C.border}`, flexShrink:0, height:HDR_H }}>
                {visibleHeaderColumns.map(({ col, index }) => (
                  <div key={col.id} style={{
                    position:'relative',
                    width: colWidths[index],
                    minWidth: colWidths[index],
                    padding:'0 8px', fontSize:10, fontWeight:700, color:C.text2, textTransform:'uppercase', letterSpacing:'0.05em', flexShrink:0, display:'flex', alignItems:'center'
                  }}>
                    {col.label}
                    <div onMouseDown={e => onColumnResizeStart(index, e)}
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
                const canEditEffort = isNew ? !!newRow.parentId : (!isPar && !!rowTask.parentId);
                const level = isNew ? newRow.level : rowTask.level ?? 0;
                const durationDays = isNew ? calcDuration(newRow.startDate, newRow.endDate) : rowTask.duration;
                const isDropBefore = !isNew && dropTarget?.id === rowTask.id && dropTarget.position === 'before';
                const isDropAfter = !isNew && dropTarget?.id === rowTask.id && dropTarget.position === 'after';
                return (
                  <div key={task.id}
                    draggable={!isNew}
                    onDragStart={!isNew ? handleTableRowDragStart(rowTask) : undefined}
                    onDragEnd={!isNew ? handleTableRowDragEnd : undefined}
                    onDragOver={!isNew ? handleTableRowDragOver(rowTask) : undefined}
                    onDrop={!isNew ? handleTableRowDrop(rowTask) : undefined}
                    onClick={() => setSelected(task.id)}
                    onContextMenu={!isNew ? openTaskContextMenu(rowTask) : undefined}
                    style={{
                      display:'flex', alignItems:'center', height:ROW_H,
                      borderTop: isDropBefore ? `2px solid ${C.primary}` : '1px solid transparent',
                      borderBottom: isDropAfter ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                      background: isNew ? C.primaryBg : isSel ? C.primaryBg : i % 2 === 0 ? C.white : C.bg,
                      borderLeft: isSel ? `3px solid ${C.primary}` : '3px solid transparent',
                      cursor: !isNew ? (dragTaskId === rowTask.id ? 'grabbing' : 'grab') : 'pointer',
                      flexShrink:0,
                    }}>
                    {isColumnVisible('wbs') && (
                      <div style={{ width:colWidths[0], minWidth:colWidths[0], padding:'0 8px', fontSize:10, color:C.text3, fontFamily:'Poppins, sans-serif', flexShrink:0 }}>{isNew ? '—' : rowTask!.wbs}</div>
                    )}
                    {isColumnVisible('taskName') && (
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
                    )}
                    {isColumnVisible('startDate') && (
                      <div style={{ width:colWidths[2], minWidth:colWidths[2], padding:'0 6px', flexShrink:0 }}>
                        <EditableCell
                          type="date"
                          value={isNew ? toDisplayDmy(newRow.startDate) : isoToDmy(rowTask.startDate)}
                          placeholder="—"
                          onSave={(v) => {
                            if (isNew) setNewTaskInsert((prev) => {
                              if (!prev) return prev;
                              const normalized = normalizeTaskDateRange(v, prev.endDate);
                              if (normalized.adjusted) {
                                toast.success('ปรับวันที่สิ้นสุดให้ไม่น้อยกว่าวันที่เริ่มต้นแล้ว');
                              }
                              return { ...prev, startDate: normalized.startDate, endDate: normalized.endDate };
                            });
                            else handleUpdateDate(rowTask.id, 'startDate', v);
                          }}
                          alwaysSave
                          style={{ color:isNew ? C.text : isPar ? C.text3 : C.text }}
                        />
                      </div>
                    )}
                    {isColumnVisible('endDate') && (
                      <div style={{ width:colWidths[3], minWidth:colWidths[3], padding:'0 6px', flexShrink:0 }}>
                        <EditableCell
                          type="date"
                          value={isNew ? toDisplayDmy(newRow.endDate) : isoToDmy(rowTask.endDate)}
                          placeholder="—"
                          onSave={(v) => {
                            if (isNew) setNewTaskInsert((prev) => {
                              if (!prev) return prev;
                              const normalized = normalizeTaskDateRange(prev.startDate, v);
                              if (normalized.adjusted) {
                                toast.success('ปรับวันที่สิ้นสุดให้ไม่น้อยกว่าวันที่เริ่มต้นแล้ว');
                              }
                              return { ...prev, startDate: normalized.startDate, endDate: normalized.endDate };
                            });
                            else handleUpdateDate(rowTask.id, 'endDate', v);
                          }}
                          alwaysSave
                          style={{ color:isNew ? C.text : isPar ? C.text3 : C.text }}
                        />
                      </div>
                    )}
                    {isColumnVisible('actualFinish') && (
                      <div style={{ width:colWidths[4], minWidth:colWidths[4], padding:'0 6px', flexShrink:0 }}>
                        <EditableCell
                          type="date"
                          value={isNew ? toDisplayDmy(newRow.actualFinish) : rowTask.actualFinish ? isoToDmy(rowTask.actualFinish) : ''}
                          placeholder="—"
                          onSave={(v) => {
                            if (isNew) setNewTaskInsert((prev) => prev ? { ...prev, actualFinish: normalizeDateInputToIso(v) } : prev);
                            else handleUpdateDate(rowTask.id, 'actualFinish', v);
                          }}
                          alwaysSave
                          style={{ color:isNew ? C.text3 : rowTask.actualFinish ? C.green : C.text3 }}
                        />
                      </div>
                    )}
                    {isColumnVisible('duration') && (
                      <div style={{ width:colWidths[5], minWidth:colWidths[5], padding:'0 6px', fontSize:11, color:C.text2, fontFamily:'Poppins, sans-serif', flexShrink:0 }}>{durationDays}d</div>
                    )}
                    {isColumnVisible('percentComplete') && (
                      <div style={{ width:colWidths[6], minWidth:colWidths[6], padding:'0 6px', flexShrink:0 }}>
                        {isNew ? (
                          <PctCell value={newRow.percentComplete} isParent={false} onSave={(n) => setNewTaskInsert((prev) => prev ? { ...prev, percentComplete: n } : prev)} />
                        ) : (
                          <PctCell value={rowTask.percentComplete} isParent={isPar} onSave={(n) => handlePct(rowTask.id, n)} />
                        )}
                      </div>
                    )}
                    {isColumnVisible('effortManday') && (
                      <div style={{ width:colWidths[7], minWidth:colWidths[7], padding:'0 6px', fontSize:11, color:C.text2, fontFamily:'Poppins, sans-serif', flexShrink:0 }}>
                        {isNew ? (
                          <EditableCell
                            value={String(newRow.effortManday || 0)}
                            placeholder="0"
                            onSave={(v) => {
                              const next = roundEffortManday(Number(v) || 0);
                              setNewTaskInsert((prev) => prev ? { ...prev, effortManday: next } : prev);
                            }}
                            style={{ color: canEditEffort ? C.text : C.text3 }}
                          />
                        ) : (
                          canEditEffort ? (
                            <EditableCell
                              value={String(Number(rowTask.effortManday || 0))}
                              placeholder="0"
                              onSave={(v) => handleUpdate(rowTask.id, { effortManday: roundEffortManday(Number(v) || 0) })}
                            />
                          ) : (
                            <span title="Auto-calculated from child tasks" style={{ color: C.text3, fontWeight: 600 }}>
                              {Number(rowTask.effortManday || 0).toFixed(3)}
                            </span>
                          )
                        )}
                      </div>
                    )}
                    {isColumnVisible('resource') && (
                      <div style={{ width:colWidths[8], minWidth:colWidths[8], padding:'0 6px', display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
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
                    )}
                    {isColumnVisible('actions') && (
                      <div style={{ width:colWidths[9], minWidth:colWidths[9], padding:'0 5px', flexShrink:0, display:'flex', gap:4, justifyContent:'center' }}>
                        {isNew ? (
                          <>
                            <button onClick={e => { e.stopPropagation(); saveNewTask(); }}
                              title="Save"
                              style={{ width:22, height:22, display:'inline-flex', alignItems:'center', justifyContent:'center', background:C.primaryBg, border:'none', borderRadius:5, cursor:'pointer', color:C.primary }}>
                              <Check size={12} />
                            </button>
                            <button onClick={e => { e.stopPropagation(); cancelNewTask(); }}
                              title="Cancel"
                              style={{ width:22, height:22, display:'inline-flex', alignItems:'center', justifyContent:'center', background:C.border2, border:'none', borderRadius:5, cursor:'pointer', color:C.text2 }}>
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={e => { e.stopPropagation(); setEditModal(rowTask); }}
                              title="Edit"
                              style={{ width:22, height:22, display:'inline-flex', alignItems:'center', justifyContent:'center', background:C.primaryBg, border:'none', borderRadius:5, cursor:'pointer', color:C.primary }}>
                              <Pencil size={12} />
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleDelete(rowTask.id); }}
                              title="Delete"
                              style={{ width:22, height:22, display:'inline-flex', alignItems:'center', justifyContent:'center', background:C.redBg, border:'none', borderRadius:5, cursor:'pointer', color:C.red }}>
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!loading && visible.length === 0 && (
                <div style={{ padding:40, textAlign:'center', color:C.text3 }}>No tasks. Click "+ Add Task".</div>
              )}
              {/* Reserve extra space at the bottom so users can work with last rows comfortably. */}
              <div style={{ height: ROW_H * TABLE_BOTTOM_SPACER_ROWS, flexShrink: 0 }} />
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
                          <span>{Number(task.effortManday || 0).toFixed(3)} MD</span>
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
                        title="Edit"
                        style={{ width:28, height:28, display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:8, border:'none', background:C.primaryBg, color:C.primary, cursor:'pointer' }}>
                        <Pencil size={14} />
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
            <button onClick={expandAll} title="Expand All" onFocus={() => setButtonFocus('expand')} onBlur={() => setButtonFocus(null)}
              style={{ width:30, height:30, display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:6, border:'1px solid transparent', background: buttonFocus === 'expand' ? C.primary : C.primaryBg, color: buttonFocus === 'expand' ? C.white : C.primary, cursor:'pointer', outline:'none' }}>
              <ChevronsDown size={15} />
            </button>
            <button onClick={collapseAll} title="Collapse All" onFocus={() => setButtonFocus('collapse')} onBlur={() => setButtonFocus(null)}
              style={{ width:30, height:30, display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:6, border:'1px solid transparent', background: buttonFocus === 'collapse' ? C.text : C.bg, color: buttonFocus === 'collapse' ? C.white : C.text2, cursor:'pointer', outline:'none' }}>
              <ChevronsUp size={15} />
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
          {extraActions}
          <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportFileChange} />
          <div style={{ position:'relative' }}>
            <Btn variant="ghost" small onClick={()=>setShowExport(v=>!v)} title="Export">
              <Download size={13} /> <ChevronDown size={11} />
            </Btn>
            {showExport && (
              <div style={{ position:'absolute', right:0, top:'110%', background:C.white, border:`1px solid ${C.border}`, borderRadius:10, boxShadow:C.shadow2, zIndex:50, minWidth:160, overflow:'hidden' }}>
                {[['📊 Excel Template (.xlsx)', exportXLSX],['📄 PDF + Gantt', exportPDF],['📥 Import Overwrite (.xlsx)', openImportDialog]].map(([label, fn]) => (
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
          <Btn small variant="ghost" onClick={() => setColumnModalOpen(true)} title="Show/Hide Columns">
            <SlidersHorizontal size={13} />
          </Btn>
          <Btn small onClick={openImportDialog} title={importing ? 'Importing' : 'Import Excel'} style={{ opacity: importing ? 0.7 : 1 }}><Upload size={13} /></Btn>
          <Btn small variant="ghost" onClick={toggleSuggestionLock} title={isSuggestionLocked ? 'Unlock Suggestion' : 'Lock Suggestion'}>
            {isSuggestionLocked ? <Lock size={13} /> : <Unlock size={13} />}
          </Btn>
          <Btn small onClick={openSuggestionModal} disabled={isSuggestionLocked} title="Suggest Dates"><Sparkles size={13} /></Btn>
          <Btn small onClick={openAddTaskDefault} title="Add Task"><Plus size={13} /></Btn>
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
              bottomSpacerRows={TABLE_BOTTOM_SPACER_ROWS}
              onUpdate={async(id,field,value)=>handleUpdate(id,{[field]:value})} />
          </div>
        )}
      </div>

      {contextMenu.visible && contextMenu.task && typeof document !== 'undefined' && createPortal(
        <div ref={contextMenuRef} style={{ position:'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 3000, background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow2, minWidth: 220, maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', overflowX: 'hidden' }}>
          <button type="button" onClick={() => handleReorderTask('top')}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13, whiteSpace:'nowrap' }}>
            <ChevronsUp size={13} />
            <span>Move Top</span>
          </button>
          <button type="button" onClick={() => handleReorderTask('up')}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13, whiteSpace:'nowrap' }}>
            <ArrowUp size={13} />
            <span>Move Up</span>
          </button>
          <button type="button" onClick={() => handleReorderTask('down')}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13, whiteSpace:'nowrap' }}>
            <ArrowDown size={13} />
            <span>Move Down</span>
          </button>
          <button type="button" onClick={() => handleReorderTask('bottom')}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13, whiteSpace:'nowrap' }}>
            <ChevronsDown size={13} />
            <span>Move Bottom</span>
          </button>
          <div style={{ borderTop: `1px solid ${C.border}` }} />
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
              <button type="button" onClick={() => handleContextMenuSelect('sub-after')}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Add Subtask After
              </button>
              <button type="button" onClick={handleMoveToSubTask}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Move to Sub Task Level 1
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
              <button type="button" onClick={handleMoveToMainTask}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Move to Main Task
              </button>
              <button type="button" onClick={handleMoveToSubTask}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Move to Sub Task Level 2
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
              <button type="button" onClick={handleMoveToSubTask}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:13 }}>
                Move to Sub Task Level 1
              </button>
            </>
          )}
        </div>,
        document.body,
      )}

      {columnModalOpen && (
        <Modal title="Task Columns" onClose={() => setColumnModalOpen(false)} width={560}>
          <div style={{ display:'grid', gap:14 }}>
            <div style={{ fontSize:12, color:C.text2 }}>
              Save by project and user. WBS and Task Name are always visible.
            </div>
            <div style={{ display:'grid', gap:8, maxHeight:420, overflowY:'auto', paddingRight:4 }}>
              {COLS.map((col) => {
                const checked = isColumnVisible(col.id);
                return (
                  <div key={col.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 12px', background:C.white }}>
                    <div style={{ fontSize:13, color:C.text, fontWeight:600 }}>{col.label || 'Actions'}</div>
                    <button
                      type="button"
                      onClick={() => handleToggleColumnVisibility(col.id)}
                      disabled={!col.canHide}
                      style={{
                        width:48,
                        height:26,
                        border:'none',
                        borderRadius:999,
                        cursor: col.canHide ? 'pointer' : 'not-allowed',
                        background: checked ? C.primary : C.border2,
                        opacity: col.canHide ? 1 : 0.55,
                        position:'relative',
                        transition:'all 0.2s ease',
                      }}
                      title={col.canHide ? (checked ? 'Hide column' : 'Show column') : 'Required column'}
                    >
                      <span
                        style={{
                          position:'absolute',
                          top:3,
                          left: checked ? 25 : 3,
                          width:20,
                          height:20,
                          borderRadius:'50%',
                          background:C.white,
                          transition:'all 0.2s ease',
                          boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
                        }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
              <Btn variant="ghost" onClick={handleResetColumnVisibility}>Reset All</Btn>
              <div style={{ display:'flex', gap:10 }}>
                <Btn variant="ghost" onClick={() => setColumnModalOpen(false)}>Close</Btn>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {moveToSubModal && (
        <Modal title={`Move to Sub Task Level ${moveToSubModal.targetLevel}`} onClose={() => setMoveToSubModal(null)} width={560}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontSize: 13, color: C.text2 }}>
              Choose target {moveToSubModal.targetLevel === 1 ? 'Main Task' : 'Sub Task Level 1'} for: <span style={{ color: C.text, fontWeight: 700 }}>{moveToSubModal.task.taskName}</span>
            </div>
            <FormRow label={moveToSubModal.targetLevel === 1 ? 'Target Main Task' : 'Target Sub Task Level 1'}>
              <Select
                value={moveToSubModal.targetParentId}
                onChange={(v) => setMoveToSubModal((prev) => prev ? ({ ...prev, targetParentId: v }) : prev)}
                options={availableMoveToSubParents.map((t) => ({ value: t.id, label: `${t.wbs || ''} ${t.taskName}`.trim() }))}
              />
            </FormRow>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setMoveToSubModal(null)}>Cancel</Btn>
              <Btn onClick={confirmMoveToSubTask} disabled={!moveToSubModal.targetParentId}>Move to Sub Task Level {moveToSubModal.targetLevel}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {moveToMainModal && (
        <Modal title="Move to Main Task" onClose={() => setMoveToMainModal(null)} width={620}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontSize: 13, color: C.text2 }}>
              Select target position for: <span style={{ color: C.text, fontWeight: 700 }}>{moveToMainModal.task.taskName}</span>
            </div>
            <FormRow label="Target Row / Main WBS">
              <Select
                value={String(moveToMainModal.targetIndex)}
                onChange={(v) => setMoveToMainModal((prev) => prev ? ({ ...prev, targetIndex: Number(v) || 1 }) : prev)}
                options={availableMoveToMainPositions}
              />
            </FormRow>
            <div style={{ fontSize: 12, color: C.text2 }}>
              This task will become main task at row <strong>{moveToMainModal.targetIndex}</strong> (WBS <strong>{moveToMainModal.targetIndex}</strong>).
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setMoveToMainModal(null)}>Cancel</Btn>
              <Btn onClick={confirmMoveToMainTask}>Move to Main Task</Btn>
            </div>
          </div>
        </Modal>
      )}

      {addModal  && (
        <TaskModal
          tasks={projectTasks}
          selectedTask={projectTasks.find(t => t.id === addPreset.anchorId) ?? null}
          preset={addPreset}
          phaseOptions={effectivePhaseOptions}
          onClose={()=>setAddModal(false)}
          onSave={handleCreate}
        />
      )}
      {editModal && (
        <TaskEditModal
          task={editModal}
          tasks={projectTasks}
          phaseOptions={effectivePhaseOptions}
          onClose={()=>setEditModal(null)}
          onSave={handleEditSave}
          onInsertBefore={() => openInsertAround(editModal, 'before')}
          onInsertAfter={() => openInsertAround(editModal, 'after')}
        />
      )}
      {importPreview && (
        <Modal title="Preview Task Import" onClose={() => !importing && setImportPreview(null)} width={920}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
            <Card style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: C.text2, marginBottom: 6 }}>FILE</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, wordBreak: 'break-word' }}>{importPreview.fileName}</div>
            </Card>
            <Card style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: C.text2, marginBottom: 6 }}>ROWS</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>{importPreview.rows.length}</div>
            </Card>
            <Card style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: C.text2, marginBottom: 6 }}>ROOT TASKS</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{importPreview.rows.filter((row) => !row.parentWbs).length}</div>
            </Card>
            <Card style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: C.text2, marginBottom: 6 }}>WITH PREDECESSOR</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{importPreview.rows.filter((row) => !!row.predecessorWbs).length}</div>
            </Card>
          </div>

          <div style={{ padding: '12px 14px', borderRadius: 12, background: C.redBg, color: C.red, fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
            การ import นี้จะลบ Task เดิมทั้งหมดของ project ปัจจุบัน แล้วสร้างใหม่จากไฟล์นี้ 100%
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1.4fr 110px 110px 110px 120px', gap: 0, background: C.bg2, borderBottom: `1px solid ${C.border}` }}>
              {['WBS', 'Task Name', 'Parent', 'Status', '%', 'Owner'].map((label) => (
                <div key={label} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: C.text2 }}>{label}</div>
              ))}
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {importPreview.rows.slice(0, 15).map((row, index) => (
                <div key={`${row.wbs}-${index}`} style={{ display: 'grid', gridTemplateColumns: '90px 1.4fr 110px 110px 110px 120px', gap: 0, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ padding: '10px 12px', fontSize: 12, color: C.text }}>{row.wbs}</div>
                  <div style={{ padding: '10px 12px', fontSize: 12, color: C.text }}>{row.taskName}</div>
                  <div style={{ padding: '10px 12px', fontSize: 12, color: C.text2 }}>{row.parentWbs || '-'}</div>
                  <div style={{ padding: '10px 12px', fontSize: 12, color: C.text2 }}>{row.status || '-'}</div>
                  <div style={{ padding: '10px 12px', fontSize: 12, color: C.text2 }}>{row.percentComplete}%</div>
                  <div style={{ padding: '10px 12px', fontSize: 12, color: C.text2 }}>{row.resource || '-'}</div>
                </div>
              ))}
            </div>
          </div>

          {importPreview.rows.length > 15 && (
            <div style={{ fontSize: 12, color: C.text2, marginBottom: 18 }}>
              Showing first 15 rows from {importPreview.rows.length} rows in the file.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Btn variant="ghost" onClick={() => setImportPreview(null)} disabled={importing}>Cancel</Btn>
            <Btn variant="danger" onClick={confirmImportOverwrite} disabled={importing}>{importing ? 'Importing…' : 'Confirm Overwrite Import'}</Btn>
          </div>
        </Modal>
      )}

      {suggestModalOpen && (
        <Modal title="Suggest Task Dates" onClose={() => setSuggestModalOpen(false)} width={980}>
          <div style={{ display: 'grid', gap: 16 }}>
            <Card style={{ padding: '14px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.text2 }}>PROJECT RANGE</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fmtDate(suggestionPreview.projectStart)} - {fmtDate(suggestionPreview.projectEnd)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.text2 }}>DURATION</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>{suggestionPreview.projectDurationDays} days</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.text2 }}>WORKING DAYS</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{suggestionPreview.workingDayCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.text2 }}>LEAF TASKS TO UPDATE</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{suggestionPreview.assignments.length}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: C.text2, marginTop: 12 }}>
                ระบบจะคำนวณจาก Dependency (FS/SS/FF/SF), lag/lead, Duration และลำดับ WBS โดยข้ามวันเสาร์-อาทิตย์อัตโนมัติ จากนั้นอัปเดตเฉพาะ leaf task แล้วให้ parent คำนวณวันตามลูกอีกที
              </div>
              {suggestionPreview.unresolvedDependencyCount > 0 && (
                <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>
                  พบ dependency ที่ resolve ไม่ได้ {suggestionPreview.unresolvedDependencyCount} task (เช่น วนลูปหรืออ้าง predecessor ที่ไม่มีวัน) ระบบใช้ fallback ตามลำดับ WBS ให้รายการเหล่านี้
                </div>
              )}
            </Card>

            <Card style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Suggested Leaf Task Dates</div>
              <div style={{ maxHeight: 320, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      {['Task', 'Level', 'Start Date', 'End Date'].map((label) => (
                        <th key={label} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: C.text2, borderBottom: `1px solid ${C.border}` }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suggestionPreview.assignments.map((item) => (
                      <tr key={item.id}>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: C.text, borderBottom: `1px solid ${C.border}` }}>{item.taskName}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: C.text2, borderBottom: `1px solid ${C.border}` }}>{item.level}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: C.text2, borderBottom: `1px solid ${C.border}` }}>{fmtDate(item.startDate)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: C.text2, borderBottom: `1px solid ${C.border}` }}>{fmtDate(item.endDate)}</td>
                      </tr>
                    ))}
                    {!suggestionPreview.assignments.length && (
                      <tr>
                        <td colSpan={4} style={{ padding: '18px 12px', fontSize: 12, color: C.text3, textAlign: 'center' }}>No suggested dates available. Check project start/end date and task list.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setSuggestModalOpen(false)}>Cancel</Btn>
              <Btn onClick={applySuggestedDates} disabled={!suggestionPreview.assignments.length || loading}>{loading ? 'Applying…' : 'Apply Suggested Dates'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {unlockModalOpen && (
        <Modal title="Unlock Suggestion" onClose={() => setUnlockModalOpen(false)} width={520}>
          <div style={{ display: 'grid', gap: 12 }}>
            <FormRow label="Password">
              <Input value={unlockPassword} onChange={setUnlockPassword} placeholder="*********" />
            </FormRow>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setUnlockModalOpen(false)}>Cancel</Btn>
              <Btn onClick={confirmUnlockSuggestion}>Unlock</Btn>
            </div>
          </div>
        </Modal>
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

function TaskModal({ tasks, selectedTask, preset, phaseOptions, onClose, onSave }: { tasks:Task[]; selectedTask: Task | null; preset: { anchorId: string | null; mode: 'main' | 'sub'; position: 'before' | 'after' | 'append' }; phaseOptions: PhaseOption[]; onClose:()=>void; onSave:(f:Partial<Task>)=>void }) {
  const { members, activeProject } = useStore();
  const todayIso    = new Date().toISOString().split('T')[0];
  const nextWeekIso = new Date(Date.now()+7*86400000).toISOString().split('T')[0];
  const [form, setForm] = useState<Partial<Task>>({
    taskName:'',
    effortManday: 0,
    startDate: todayIso,
    endDate: nextWeekIso,
    resource:'',
    parentId:'',
    relatedTask:'',
    relatedTaskType: 'FS',
    relatedTaskLagDays: 0,
    phase: selectedTask?.phase || phaseOptions[0]?.value,
  });
  const phaseDropdownOptions = form.phase && !phaseOptions.some((option) => option.value === String(form.phase))
    ? [{ value: String(form.phase), label: String(form.phase) }, ...phaseOptions]
    : phaseOptions;
  useEffect(() => {
    if (phaseOptions.length === 0) return;
    if (!form.phase || (PHASE_OPTIONS.some((p) => p === String(form.phase)) && !phaseOptions.some((option) => option.value === String(form.phase)))) {
      setForm((prev) => ({
        ...prev,
        phase: selectedTask?.phase ? String(selectedTask.phase) : phaseOptions[0]?.value,
      }));
    }
  }, [phaseOptions, selectedTask?.phase, form.phase]);
  const [insertType, setInsertType] = useState<'main' | 'sub'>(preset.mode);
  const [insertPosition, setInsertPosition] = useState<'before' | 'after' | 'append'>(preset.position);
  const up = (k:string,v:string|number) => setForm(p=>({...p,[k]:v}));
  const sortedTasks = [...tasks].sort((a, b) => compareWbs(a.wbs, b.wbs));
  const dur = calcDuration(String(form.startDate || ''), String(form.endDate || ''));
  return (
    <Modal title="New Task" onClose={onClose} width={980}>
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
            <Select value={String(form.phase || phaseOptions[0]?.value)} onChange={v => setForm(f => ({ ...f, phase: v }))}
              options={phaseDropdownOptions.map((p) => ({ value: p.value, label: p.label }))} />
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
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:12 }}>
        <FormRow label="Start Date"><Input type="date" value={form.startDate ?? ''} onChange={v => up('startDate', v)} /></FormRow>
        <FormRow label="End Date"><Input type="date" value={form.endDate ?? ''} onChange={v => up('endDate', v)} /></FormRow>
        <FormRow label="Actual Finish Date"><Input type="date" value={form.actualFinish ?? ''} onChange={v => up('actualFinish', v)} /></FormRow>

        <FormRow label="Effort Manday">
          {insertType === 'main' ? (
            <input
              type="number"
              value={0}
              disabled
              style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box',opacity:0.6,background:C.bg }}
            />
          ) : (
            <input
              type="number"
              min={0}
              step={EFFORT_STEP}
              value={Number(form.effortManday ?? 0)}
              onChange={e => up('effortManday', e.target.value)}
              placeholder="0"
              style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
            />
          )}
        </FormRow>

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

        <FormRow label="Parent Task">
          <Select value={form.parentId??''} onChange={v=>up('parentId',v)} options={[{value:'',label:'— None —'},...sortedTasks.map(t=>({value:t.id,label:`${t.wbs||''} ${t.taskName}`.trim()}))]} />
        </FormRow>

        <FormRow label="Predecessor">
          <Select value={form.relatedTask??''} onChange={v=>up('relatedTask',v)} options={[{value:'',label:'— None —'},...sortedTasks.map(t=>({value:t.id,label:`${t.wbs||''} ${t.taskName}`.trim()}))]} />
        </FormRow>

        <FormRow label="Dependency Type">
          <Select
            value={String(form.relatedTaskType || 'FS')}
            onChange={v => up('relatedTaskType', v)}
            disabled={!form.relatedTask}
            options={TASK_DEPENDENCY_OPTIONS.map((type) => ({ value: type, label: type }))}
          />
        </FormRow>

        <FormRow label="Lag / Lead (days)">
          <input
            type="number"
            step={1}
            value={String(form.relatedTaskLagDays ?? 0)}
            disabled={!form.relatedTask}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '' || raw === '-') {
                up('relatedTaskLagDays', raw);
                return;
              }
              const parsed = Number(raw);
              up('relatedTaskLagDays', Number.isFinite(parsed) ? Math.trunc(parsed) : 0);
            }}
            placeholder="0"
            style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
          />
        </FormRow>
      </div>
      <div style={{ fontSize: 11, color: C.text3, marginTop: -4, marginBottom: 8 }}>
        {insertType === 'main' ? 'Main task effort is auto-calculated and locked (0 when no child).' : `Use increments of ${EFFORT_STEP} MD`}
      </div>
      {dur>0&&<p style={{ fontSize:12, color:C.primary, marginBottom:12 }}>Duration: <strong>{dur} days</strong></p>}
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
          const normalized = normalizeTaskDateRange(startDate, endDate);

          let parentId = '';
          let sortOrder: number | undefined;

          if (insertType === 'main') {
            parentId = '';
            if (selectedTask && !selectedTask.parentId && insertPosition !== 'append') {
              sortOrder = Number(selectedTask.sortOrder || 0) + (insertPosition === 'before' ? -0.5 : 0.5);
            }
            else {
              const roots = tasks.filter(t => !t.parentId);
              const maxSortOrder = roots.reduce((m, t) => Math.max(m, Number(t.sortOrder || 0)), 0);
              sortOrder = maxSortOrder + 1;
            }
          } else {
            parentId = (form.parentId as string) || selectedTask?.id || '';
            if (!parentId) {
              toast.error('Sub Task ต้องมี Parent Task');
              return;
            }
            const siblings = tasks.filter(t => (t.parentId || '') === parentId);
            const maxSortOrder = siblings.reduce((m, t) => Math.max(m, Number(t.sortOrder || 0)), 0);
            if (selectedTask && (selectedTask.parentId || '') === parentId && insertPosition !== 'append') {
              sortOrder = Number(selectedTask.sortOrder || 0) + (insertPosition === 'before' ? -0.5 : 0.5);
            } else {
              sortOrder = maxSortOrder + 1;
            }
          }

          const selectedParent = tasks.find(t => t.id === (form.parentId as string));
          onSave({
            ...form,
            parentId,
            sortOrder,
            effortManday: insertType === 'main' ? 0 : roundEffortManday(Number(form.effortManday || 0)),
            relatedTaskType: form.relatedTask ? toDependencyType(form.relatedTaskType) : 'FS',
            relatedTaskLagDays: form.relatedTask ? Math.trunc(Number(form.relatedTaskLagDays || 0)) : 0,
            startDate: normalized.startDate,
            endDate: normalized.endDate,
            duration: calcDuration(normalized.startDate, normalized.endDate),
            phase: String(
              form.phase ||
              selectedParent?.phase ||
              selectedTask?.phase ||
              phaseOptions[0]?.value
            ),
          });
          if (normalized.adjusted) {
            toast.success('ปรับวันที่สิ้นสุดให้ไม่น้อยกว่าวันที่เริ่มต้นแล้ว');
          }
        }}>Create Task</Btn>
      </div>
    </Modal>
  );
}

function TaskEditModal({ task, tasks, phaseOptions, onClose, onSave, onInsertBefore, onInsertAfter }: { task:Task; tasks:Task[]; phaseOptions: PhaseOption[]; onClose:()=>void; onSave:(f:Partial<Task>)=>void; onInsertBefore: () => void; onInsertAfter: () => void }) {
  const { members, activeProject } = useStore();
  const isParentTask = hasChildren(tasks, task.id);
  const canEditEffort = !isParentTask && !!task.parentId;
  const [form, setForm] = useState<Partial<Task>>({
    ...task,
    startDate: task.startDate ?? '',
    endDate: task.endDate ?? '',
    actualFinish: task.actualFinish ?? '',
    relatedTaskType: task.relatedTaskType ?? 'FS',
    relatedTaskLagDays: task.relatedTaskLagDays ?? 0,
    phase: task.phase ?? phaseOptions[0]?.value,
  });
  const phaseDropdownOptions = form.phase && !phaseOptions.some((option) => option.value === String(form.phase))
    ? [{ value: String(form.phase), label: String(form.phase) }, ...phaseOptions]
    : phaseOptions;
  useEffect(() => {
    if (phaseOptions.length === 0) return;
    if (!form.phase || (PHASE_OPTIONS.some((p) => p === String(form.phase)) && !phaseOptions.some((option) => option.value === String(form.phase)))) {
      setForm((prev) => ({
        ...prev,
        phase: phaseOptions[0]?.value,
      }));
    }
  }, [phaseOptions, form.phase]);
  const up = (k:string,v:string|number) => setForm(p=>({...p,[k]:v}));
  const dur = calcDuration(String(form.startDate || ''), String(form.endDate || ''));
  const sortedTasks = [...tasks].sort((a, b) => compareWbs(a.wbs, b.wbs));
  return (
    <Modal title="Edit Task" onClose={onClose} width={980}>
      <FormRow label="Task Name" required>
        <input autoFocus value={form.taskName??''} onChange={e=>up('taskName',e.target.value)}
          style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
          onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border}/>
      </FormRow>
      <FormRow label="Phase">
        <Select value={String(form.phase || phaseOptions[0]?.value)} onChange={v => up('phase', v)}
          options={phaseDropdownOptions.map((p) => ({ value: p.value, label: p.label }))} />
      </FormRow>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:12 }}>
        <FormRow label="Start Date"><Input type="date" value={form.startDate ?? ''} onChange={v => up('startDate', v)} /></FormRow>
        <FormRow label="End Date"><Input type="date" value={form.endDate ?? ''} onChange={v => up('endDate', v)} /></FormRow>
        <FormRow label="Actual Finish Date">
          <Input type="date" value={form.actualFinish ?? ''} onChange={v => up('actualFinish', v)} />
        </FormRow>

        <FormRow label="% Complete">
          <input type="number" min={0} max={100} value={form.percentComplete??0} onChange={e=>up('percentComplete',Math.min(100,Math.max(0,Number(e.target.value))))}
            style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}/>
        </FormRow>

        <FormRow label="Effort Manday">
          {canEditEffort ? (
            <input
              type="number"
              min={0}
              step={EFFORT_STEP}
              value={Number(form.effortManday ?? 0)}
              onChange={e => up('effortManday', e.target.value)}
              placeholder="0"
              style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
            />
          ) : (
            <input
              type="number"
              value={Number(task.effortManday || 0)}
              disabled
              style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box',opacity:0.6,background:C.bg }}
            />
          )}
        </FormRow>

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

        <FormRow label="Predecessor">
          <Select value={form.relatedTask??''} onChange={v=>up('relatedTask',v)}
            options={[{value:'',label:'— None —'},...sortedTasks.filter(t=>t.id!==task.id).map(t=>({value:t.id,label:`${t.wbs||''} ${t.taskName}`.trim()}))]} />
        </FormRow>

        <FormRow label="Dependency Type">
          <Select
            value={String(form.relatedTaskType || 'FS')}
            onChange={v => up('relatedTaskType', v)}
            disabled={!form.relatedTask}
            options={TASK_DEPENDENCY_OPTIONS.map((type) => ({ value: type, label: type }))}
          />
        </FormRow>

        <FormRow label="Lag / Lead (days)">
          <input
            type="number"
            step={1}
            value={String(form.relatedTaskLagDays ?? 0)}
            disabled={!form.relatedTask}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '' || raw === '-') {
                up('relatedTaskLagDays', raw);
                return;
              }
              const parsed = Number(raw);
              up('relatedTaskLagDays', Number.isFinite(parsed) ? Math.trunc(parsed) : 0);
            }}
            placeholder="0"
            style={{ fontFamily:'Poppins',fontSize:13,padding:'8px 12px',border:`1.5px solid ${C.border}`,borderRadius:8,outline:'none',width:'100%',boxSizing:'border-box' }}
          />
        </FormRow>
      </div>
      <div style={{ fontSize: 11, color: C.text3, marginTop: -4, marginBottom: 8 }}>
        {canEditEffort ? `Use increments of ${EFFORT_STEP} MD` : 'Parent/main task effort is auto-calculated and cannot be edited.'}
      </div>

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
          const normalized = normalizeTaskDateRange(String(form.startDate || ''), String(form.endDate || ''));
          onSave({
            ...form,
            effortManday: canEditEffort ? roundEffortManday(Number(form.effortManday || 0)) : Number(task.effortManday || 0),
            relatedTaskType: form.relatedTask ? toDependencyType(form.relatedTaskType) : 'FS',
            relatedTaskLagDays: form.relatedTask ? Math.trunc(Number(form.relatedTaskLagDays || 0)) : 0,
            startDate: normalized.startDate,
            endDate: normalized.endDate,
            actualFinish: String(form.actualFinish || ''),
            duration: calcDuration(normalized.startDate, normalized.endDate),
          });
          if (normalized.adjusted) {
            toast.success('ปรับวันที่สิ้นสุดให้ไม่น้อยกว่าวันที่เริ่มต้นแล้ว');
          }
        }}>Save Changes</Btn>
      </div>
    </Modal>
  );
}
