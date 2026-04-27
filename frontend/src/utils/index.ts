import {
  format, parseISO, isValid, differenceInCalendarDays, addDays,
  startOfMonth, endOfMonth,
} from 'date-fns';
import type { Task } from '../types';

// ── Date helpers — ALL display as DD/MM/YYYY ──────────────────────────────────
export const calcDuration = (s: string, e: string): number => {
  if (!s || !e) return 0;
  const start = parseISO(s);
  const end = parseISO(e);
  if (!isValid(start) || !isValid(end) || end < start) return 0;

  let current = new Date(start.getTime());
  let count = 0;
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count += 1;
    current = addDays(current, 1);
  }
  return count;
};

/** Display: 25/12/2024 */
export const fmtDate = (str: string): string => {
  if (!str) return '—';
  const d = parseISO(str);
  return isValid(d) ? format(d, 'dd/MM/yyyy') : str;
};

/** For <input type="date"> value attribute — always YYYY-MM-DD */
export const toInput = (str: string): string => {
  if (!str) return '';
  const d = parseISO(str);
  return isValid(d) ? format(d, 'yyyy-MM-dd') : '';
};

/** Month label: Mar 25 */
export const fmtMonth = (str: string): string => {
  if (!str || str.length < 7) return str;
  const [y, m] = str.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return format(d, 'MMM yy');
};

export const getProjectDateRange = (tasks: Task[]) => {
  const valid = tasks.filter(t => t.startDate && t.endDate);
  if (!valid.length) {
    const n = new Date();
    return { minDate: n, maxDate: addDays(n, 30) };
  }
  const starts = valid.map(t => parseISO(t.startDate)).filter(isValid);
  const ends   = valid.map(t => parseISO(t.endDate)).filter(isValid);
  return {
    minDate: addDays(new Date(Math.min(...starts.map(d => d.getTime()))), -3),
    maxDate: addDays(new Date(Math.max(...ends.map(d => d.getTime()))),    7),
  };
};

export const getHalfMonthSnapshotDates = (startDateStr: string, endDateStr: string): string[] => {
  const start = parseISO(startDateStr);
  const end = parseISO(endDateStr);
  if (!isValid(start) || !isValid(end) || end < start) return [];

  const toIso = (date: Date) => format(date, 'yyyy-MM-dd');
  const dates: string[] = [];
  let current: Date;

  if (start.getDate() <= 15) {
    current = new Date(start.getFullYear(), start.getMonth(), 15);
  } else {
    current = endOfMonth(start);
  }

  if (current < start) {
    current = addDays(start, 14);
  }

  while (current <= end) {
    dates.push(toIso(current));
    const next = current.getDate() === 15
      ? endOfMonth(addDays(current, 1))
      : new Date(current.getFullYear(), current.getMonth() + 1, 15);
    current = next;
  }

  const last = parseISO(dates[dates.length - 1] || '');
  if (dates.length === 0 || (isValid(end) && last < end)) {
    dates.push(toIso(end));
  }

  return dates.filter((value, index, self) => self.indexOf(value) === index);
};

export interface BaselineProgressRow {
  baselineDate: string;
  plannedWorkingDaysInPeriod: number;
  accumulatedPlannedWorkingDays: number;
  totalPlannedWorkingDays: number;
  baselinePercent: number;
}

const isChildWbsTask = (task: Task) => String(task.wbs || '').trim().includes('.');

export const computeBaselineProgress = (tasks: Task[], snapshotDates: string[]): BaselineProgressRow[] => {
  const childTasks = tasks.filter((task) => task.startDate && task.endDate && isChildWbsTask(task));
  const taskPlans = childTasks.map((task) => {
    const planned = calcDuration(task.startDate, task.endDate);
    return { task, planned };
  }).filter((item) => item.planned > 0);

  const totalPlannedWorkingDays = taskPlans.reduce((sum, item) => sum + item.planned, 0);
  let previousAccumulated = 0;

  return snapshotDates.map((snapshot) => {
    const snapshotDate = parseISO(snapshot);
    const accumulatedPlannedWorkingDays = taskPlans.reduce((sum, item) => {
      const start = parseISO(item.task.startDate);
      const end = parseISO(item.task.endDate);
      if (!isValid(start) || !isValid(end) || end < start || !isValid(snapshotDate)) return sum;
      if (snapshotDate < start) return sum;
      const cutoff = snapshotDate <= end ? snapshotDate : end;
      const countedDays = calcDuration(format(start, 'yyyy-MM-dd'), format(cutoff, 'yyyy-MM-dd'));
      return sum + countedDays;
    }, 0);

    const baselinePercent = totalPlannedWorkingDays > 0
      ? Math.min(100, Math.round((accumulatedPlannedWorkingDays / totalPlannedWorkingDays) * 100))
      : 0;

    const plannedWorkingDaysInPeriod = Math.max(0, accumulatedPlannedWorkingDays - previousAccumulated);
    previousAccumulated = accumulatedPlannedWorkingDays;

    return {
      baselineDate: snapshot,
      plannedWorkingDaysInPeriod,
      accumulatedPlannedWorkingDays,
      totalPlannedWorkingDays,
      baselinePercent,
    };
  });
};

export const dayOffset = (minDate: Date, dateStr: string): number => {
  if (!dateStr) return 0;
  const d = parseISO(dateStr);
  if (!isValid(d)) return 0;
  return Math.max(0, differenceInCalendarDays(d, minDate));
};

export const getMonths = (minDate: Date, maxDate: Date): Date[] => {
  const result: Date[] = [];
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) {
    result.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
};

export const getDays = (minDate: Date, totalDays: number) =>
  Array.from({ length: totalDays }, (_, i) => {
    const d = addDays(minDate, i);
    return { i, d, isWeekend: d.getDay() === 0 || d.getDay() === 6, showLabel: d.getDate() % 5 === 1 };
  });

// ── Task tree helpers ─────────────────────────────────────────────────────────
export const flattenTree = (tasks: Task[], expandedIds: Set<string>): Task[] => {
  const roots = tasks.filter(t => !t.parentId).sort((a, b) => a.order - b.order);
  const out: Task[] = [];
  const walk = (t: Task) => {
    out.push(t);
    if (expandedIds.has(t.id))
      tasks.filter(x => x.parentId === t.id).sort((a, b) => a.order - b.order).forEach(walk);
  };
  roots.forEach(walk);
  return out;
};

export const hasChildren = (tasks: Task[], id: string) => tasks.some(t => t.parentId === id);

// ── WBS helpers ──────────────────────────────────────────────────────────────
const parseWbs = (wbs: string): number[] =>
  String(wbs || '')
    .split('.')
    .map(x => Number.parseInt(x, 10))
    .map(x => (Number.isFinite(x) ? x : 0));

export const compareWbs = (a: string, b: string): number => {
  const aa = parseWbs(a);
  const bb = parseWbs(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return String(a || '').localeCompare(String(b || ''));
};

// ── DD/MM/YYYY force helpers ─────────────────────────────────────────────────
export const isoToDmy = (iso: string): string => {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'dd/MM/yyyy') : '';
};

export const dmyToIso = (dmy: string): string => {
  const m = String(dmy || '').trim().match(/^(\d{2})([\/\-])(\d{2})\2(\d{4})$/);
  if (!m) return '';
  const dd = Number(m[1]);
  const mm = Number(m[3]);
  const yyyy = Number(m[4]);
  const dt = new Date(yyyy, mm - 1, dd);
  if (
    dt.getFullYear() !== yyyy ||
    dt.getMonth() !== mm - 1 ||
    dt.getDate() !== dd
  ) {
    return '';
  }
  return format(dt, 'yyyy-MM-dd');
};

// ── Money ─────────────────────────────────────────────────────────────────────
export const fmtMoney = (n: number): string =>
  new Intl.NumberFormat('en', { minimumFractionDigits: 0 }).format(n || 0);

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVT_COLORS = ['#4F46E5','#0EA5E9','#10B981','#F59E0B','#EC4899','#8B5CF6','#EF4444','#F97316'];
export const avatarColor = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVT_COLORS[Math.abs(h) % AVT_COLORS.length];
};
export const getInitials = (name: string): string =>
  name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

// ── Role colors ───────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  'Project Sponsor': '#8B5CF6', 'Project Advisor': '#6366F1',
  'Project Leader': '#4F46E5',  'Project Manager': '#4F46E5',
  'Project Consultants': '#0EA5E9', 'Business Analyst': '#0EA5E9',
  'Business Process Owner': '#F97316', 'UI/UX Designer': '#EC4899',
  'Full-Stack Developer': '#F59E0B',   'Frontend Developer': '#F59E0B',
  'Backend Developer': '#F97316', 'QA Engineer': '#10B981',
  'DevOps Engineer': '#64748B',   'IT Support': '#64748B',
  'HRM User': '#EF4444', 'HRD User': '#EF4444',
  'Product Owner': '#8B5CF6',     'IT Coordinator': '#64748B', 'HR Director': '#EF4444',
};
export const roleColor = (role: string): string => ROLE_COLORS[role] || '#94A3B8';

// ── Status colors ─────────────────────────────────────────────────────────────
export const PROCESS_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  'Open':         { bg: '#FEE2E2', color: '#991B1B' },
  'In Progress':  { bg: '#DBEAFE', color: '#1E40AF' },
  'Resolved':     { bg: '#D1FAE5', color: '#065F46' },
  'Blocked':      { bg: '#FCD34D', color: '#92400E' },
  'Draft':        { bg: '#F3F4F6', color: '#5B6B7A' },
  'Submitted':    { bg: '#FEF3C7', color: '#92400E' },
  'Under Review': { bg: '#DBEAFE', color: '#1E40AF' },
  'Approved':     { bg: '#D1FAE5', color: '#065F46' },
  'Rejected':     { bg: '#FEE2E2', color: '#991B1B' },
  'Implemented':  { bg: '#D1FAE5', color: '#065F46' },
  'Close':        { bg: '#E5E7EB', color: '#4B5563' },
};

export const RISK_LEVEL_COLOR: Record<string, string> = {
  Low: '#10B981', Medium: '#F59E0B', High: '#EF4444',
};

// ── Export XLSX helper ────────────────────────────────────────────────────────
export const exportCSV = (rows: string[][], filename: string) => {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a   = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ── Today ISO ─────────────────────────────────────────────────────────────────
export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

export { format, parseISO, isValid, addDays };
