import React from 'react';
import { differenceInCalendarDays, differenceInCalendarMonths, endOfMonth, getDaysInMonth, isValid, parseISO, startOfDay, startOfMonth } from 'date-fns';
import { C, Card, MILESTONE_STATUS } from '../Common';
import { useStore } from '../../store';
import { compareWbs, computeBaselineProgress, fmtDate } from '../../utils';
import type { ChangeRequest, Effort, Issue, Milestone, Project, Task } from '../../types';

interface Props {
  project: Project;
}

type ActualStateKey = 'notStart' | 'onTrack' | 'atRisk' | 'delay' | 'completed';

const ACTUAL_STATE: Record<ActualStateKey, { label: string; color: string }> = {
  notStart: { label: 'Not Start', color: '#94A3B8' },
  onTrack: { label: 'On Track', color: '#10B981' },
  atRisk: { label: 'At Risk', color: '#F59E0B' },
  delay: { label: 'Delay', color: '#EF4444' },
  completed: { label: 'Completed', color: '#2563EB' },
};

const PLAN_PATTERN = 'repeating-linear-gradient(135deg, #8F9AA8 0px, #8F9AA8 2px, #C5CDD8 2px, #C5CDD8 4px)';

function toDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? startOfDay(parsed) : null;
}

function calcDurationDays(start: Date, end: Date): number {
  return Math.max(1, differenceInCalendarDays(end, start) + 1);
}

function getRiskWindow(durationDays: number): number {
  if (durationDays <= 5) return 1;
  if (durationDays <= 15) return 3;
  if (durationDays <= 30) return 7;
  return 10;
}

function getMainTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.parentId)
    .filter((t) => toDate(t.startDate) && toDate(t.endDate))
    .sort((a, b) => compareWbs(a.wbs || '', b.wbs || ''));
}

function getLeafTasks(tasks: Task[]): Task[] {
  const parentTaskIds = new Set(tasks.map((t) => String(t.parentId || '')).filter(Boolean));
  return tasks
    .filter((t) => !parentTaskIds.has(String(t.id || '')))
    .sort((a, b) => compareWbs(a.wbs || '', b.wbs || ''));
}

function getActualState(task: Task, today: Date): { key: ActualStateKey; barEnd: Date } {
  const start = toDate(task.startDate);
  const end = toDate(task.endDate);
  const progress = Number(task.percentComplete || 0);

  if (!start || !end) {
    return { key: 'notStart', barEnd: today };
  }

  if (progress >= 100 || String(task.status || '').toLowerCase() === 'done') {
    return { key: 'completed', barEnd: end };
  }

  if (today > end && progress < 100) {
    return { key: 'delay', barEnd: today };
  }

  if (today < start && progress <= 0) {
    return { key: 'notStart', barEnd: end };
  }

  const durationDays = calcDurationDays(start, end);
  const riskWindowDays = getRiskWindow(durationDays);
  const daysToEnd = differenceInCalendarDays(end, today);
  const started = today >= start || progress > 0;

  if (started && progress < 80 && daysToEnd <= riskWindowDays) {
    return { key: 'atRisk', barEnd: end };
  }

  return { key: 'onTrack', barEnd: end };
}

function clampDate(value: Date, minDate: Date, maxDate: Date): Date {
  if (value < minDate) return minDate;
  if (value > maxDate) return maxDate;
  return value;
}

function monthPercent(rangeStartMonth: Date, monthCount: number, date: Date, edge: 'start' | 'end'): number {
  const safeMonthCount = Math.max(1, monthCount);
  const monthStart = startOfMonth(date);
  const monthIndex = Math.max(0, Math.min(safeMonthCount - 1, differenceInCalendarMonths(monthStart, rangeStartMonth)));
  const daysInMonth = Math.max(1, getDaysInMonth(monthStart));
  const day = Math.max(1, Math.min(daysInMonth, date.getDate()));
  const dayFraction = edge === 'start' ? (day - 1) / daysInMonth : day / daysInMonth;
  return ((monthIndex + dayFraction) / safeMonthCount) * 100;
}

function monthLabel(month: Date): string {
  const y = String(month.getFullYear()).slice(-2);
  const m = month.toLocaleString('en-US', { month: 'short' });
  return `${m}-${y}`;
}

function monthCompactLabel(month: Date): string {
  const y = String(month.getFullYear()).slice(-2);
  const m = String(month.getMonth() + 1).padStart(2, '0');
  return `${m}/${y}`;
}

function pct(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 1024);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isMobile;
}

function EffortRows({ efforts }: { efforts: Effort[] }) {
  const totalBudget = efforts.reduce((sum, e) => sum + Number(e.budgetManday || 0), 0);
  const totalUsed = efforts.reduce((sum, e) => sum + Object.values(e.monthly || {}).reduce((acc, value) => acc + Number(value || 0), 0), 0);

  return (
    <>
      {efforts.slice(0, 8).map((effort) => {
        const used = Object.values(effort.monthly || {}).reduce((acc, value) => acc + Number(value || 0), 0);
        const remain = Number(effort.budgetManday || 0) - used;

        return (
          <div
            key={effort.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 88px 88px 88px',
              gap: 8,
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={effort.module}>
              {effort.module || '-'}
            </div>
            <div style={{ fontSize: 12, color: C.text2, textAlign: 'right' }}>{Number(effort.budgetManday || 0).toFixed(1)}</div>
            <div style={{ fontSize: 12, color: used > Number(effort.budgetManday || 0) ? C.red : C.primary, textAlign: 'right', fontWeight: 700 }}>
              {used.toFixed(1)}
            </div>
            <div style={{ fontSize: 12, color: remain < 0 ? C.red : C.green, textAlign: 'right', fontWeight: 700 }}>
              {remain.toFixed(1)}
            </div>
          </div>
        );
      })}

      {efforts.length === 0 && <div style={{ fontSize: 12, color: C.text3, padding: '12px 0' }}>No effort data.</div>}

      {efforts.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 88px 88px 88px',
            gap: 8,
            alignItems: 'center',
            paddingTop: 12,
            marginTop: 2,
            borderTop: `1px solid ${C.border2}`,
          }}
        >
          <div style={{ fontSize: 12, color: C.text, fontWeight: 800 }}>TOTAL</div>
          <div style={{ fontSize: 12, color: C.text2, textAlign: 'right', fontWeight: 800 }}>{totalBudget.toFixed(1)}</div>
          <div style={{ fontSize: 12, color: C.primary, textAlign: 'right', fontWeight: 800 }}>{totalUsed.toFixed(1)}</div>
          <div style={{ fontSize: 12, color: totalBudget - totalUsed < 0 ? C.red : C.green, textAlign: 'right', fontWeight: 800 }}>
            {(totalBudget - totalUsed).toFixed(1)}
          </div>
        </div>
      )}
    </>
  );
}

export default function ExecutiveOnePage({ project }: Props) {
  const isMobile = useIsMobile();
  const { tasks, milestones, issues, efforts, changeRequests, members, risks } = useStore();
  const [showActivitiesModal, setShowActivitiesModal] = React.useState<null | 'inProgress' | 'upcoming' | 'overdue'>(null);
  const [showTodayLine, setShowTodayLine] = React.useState(false);
  const ganttWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [ganttWrapWidth, setGanttWrapWidth] = React.useState(0);

  const projectTasks = React.useMemo(() => tasks.filter((t) => t.projectId === project.id), [tasks, project.id]);
  const mainTasks = React.useMemo(() => getMainTasks(projectTasks), [projectTasks]);
  const leafTasks = React.useMemo(() => getLeafTasks(projectTasks), [projectTasks]);
  const projectMilestones = React.useMemo(
    () => milestones.filter((m) => m.projectId === project.id).sort((a, b) => Number(toDate(a.dueDate) || 0) - Number(toDate(b.dueDate) || 0)),
    [milestones, project.id],
  );
  const groupedMilestonesByPhase = React.useMemo(() => {
    const groups = new Map<string, Milestone[]>();
    projectMilestones.forEach((m) => {
      const phase = String(m.phase || '').trim() || 'Unspecified';
      if (!groups.has(phase)) groups.set(phase, []);
      groups.get(phase)!.push(m);
    });
    return Array.from(groups.entries()).map(([phase, items]) => ({ phase, items }));
  }, [projectMilestones]);
  const projectIssues = React.useMemo(
    () => issues.filter((i) => i.projectId === project.id),
    [issues, project.id],
  );
  const projectMembers = React.useMemo(
    () => members.filter((m) => m.projectId === project.id),
    [members, project.id],
  );
  const projectRisks = React.useMemo(
    () => risks.filter((r) => r.projectId === project.id),
    [risks, project.id],
  );
  const projectEfforts = React.useMemo(
    () => efforts.filter((e) => e.projectId === project.id),
    [efforts, project.id],
  );
  const projectCRs = React.useMemo(
    () => changeRequests.filter((cr) => cr.projectId === project.id),
    [changeRequests, project.id],
  );

  const today = startOfDay(new Date());

  const rangeStartBase = toDate(project.startDate) || toDate(mainTasks[0]?.startDate) || today;
  const rangeEndFromProject = toDate(project.endDate) || toDate(mainTasks[mainTasks.length - 1]?.endDate) || today;
  const rangeStartMonth = startOfMonth(rangeStartBase);
  const rangeEndMonthBase = startOfMonth(rangeEndFromProject);

  const hasDelayTask = mainTasks.some((task) => {
    const actualState = getActualState(task, today);
    return actualState.key === 'delay';
  });

  const rangeEndMonth = hasDelayTask && today > rangeEndMonthBase ? startOfMonth(today) : rangeEndMonthBase;
  const rangeStart = rangeStartMonth;
  const rangeEnd = endOfMonth(rangeEndMonth);

  const months = React.useMemo(() => {
    const list: Date[] = [];
    const cursor = new Date(rangeStartMonth.getFullYear(), rangeStartMonth.getMonth(), 1);
    while (cursor <= rangeEndMonth) {
      list.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return list;
  }, [rangeStartMonth, rangeEndMonth]);

  const accomplishedTasks = React.useMemo(
    () => leafTasks.filter((t) => Number(t.percentComplete || 0) >= 100),
    [leafTasks],
  );

  const inProgressTasks = React.useMemo(
    () => leafTasks.filter((t) => String(t.status || '') === 'In Progress' && Number(t.percentComplete || 0) < 100),
    [leafTasks],
  );

  const upcomingTasks = React.useMemo(
    () => leafTasks.filter((t) => {
      if (String(t.status || '') !== 'Todo') return false;
      const start = toDate(t.startDate);
      return !!start && start >= today;
    }),
    [leafTasks, today],
  );

  const overdueTasks = React.useMemo(
    () => leafTasks.filter((t) => {
      const end = toDate(t.endDate);
      if (!end) return false;
      if (Number(t.percentComplete || 0) >= 100 || String(t.status || '') === 'Done') return false;
      return end < today;
    }),
    [leafTasks, today],
  );

  const openIssues = React.useMemo(
    () => projectIssues.filter((issue) => issue.status === 'Open' || issue.status === 'In Progress'),
    [projectIssues],
  );
  const rootTasks = React.useMemo(
    () => projectTasks.filter((t) => !t.parentId),
    [projectTasks],
  );
  const overallProgress = React.useMemo(
    () => (rootTasks.length ? Math.round(rootTasks.reduce((sum, t) => sum + Number(t.percentComplete || 0), 0) / rootTasks.length) : 0),
    [rootTasks],
  );
  const doneRootTasks = React.useMemo(
    () => rootTasks.filter((t) => Number(t.percentComplete || 0) === 100).length,
    [rootTasks],
  );
  const inProgressRootTasks = React.useMemo(
    () => rootTasks.filter((t) => Number(t.percentComplete || 0) > 0 && Number(t.percentComplete || 0) < 100).length,
    [rootTasks],
  );
  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const baselineToday = React.useMemo(
    () => computeBaselineProgress(projectTasks, [todayIso]),
    [projectTasks, todayIso],
  );
  const plannedPercent = baselineToday[0]?.baselinePercent ?? 0;

  const totalContract = React.useMemo(
    () => projectMilestones.reduce((sum, m) => sum + Number(m.amount || 0), 0),
    [projectMilestones],
  );
  const collectedAmount = React.useMemo(
    () => projectMilestones.filter((m) => String(m.status || '').toLowerCase() === 'paid').reduce((sum, m) => sum + Number(m.amount || 0), 0),
    [projectMilestones],
  );
  const paymentPct = pct(collectedAmount, totalContract);

  const totalMandayBudget = React.useMemo(
    () => projectEfforts.reduce((sum, e) => sum + Number(e.budgetManday || 0), 0),
    [projectEfforts],
  );
  const totalMandayUsed = React.useMemo(
    () => projectEfforts.reduce((sum, e) => sum + Object.values(e.monthly || {}).reduce((acc, value) => acc + Number(value || 0), 0), 0),
    [projectEfforts],
  );
  const mandayPct = pct(totalMandayUsed, totalMandayBudget);
  const openRiskCount = React.useMemo(
    () => projectRisks.filter((r) => r.status === 'Monitoring' || r.status === 'Mitigating').length,
    [projectRisks],
  );
  const activeInternalMembers = React.useMemo(
    () => projectMembers.filter((m) => String(m.type || '').toLowerCase() === 'internal').length,
    [projectMembers],
  );

  const openTab = React.useCallback((tab: string) => {
    window.dispatchEvent(new CustomEvent('app-set-tab', { detail: { tab } }));
  }, []);

  const openIssueList = React.useMemo(
    () => openIssues.slice().sort((a, b) => (a.issueDate > b.issueDate ? -1 : 1)),
    [openIssues],
  );

  const allCRs = React.useMemo(
    () => projectCRs.slice().sort((a, b) => (a.requestDate > b.requestDate ? -1 : 1)),
    [projectCRs],
  );

  const activityTaskRows = React.useMemo(() => ({
    inProgress: inProgressTasks,
    upcoming: upcomingTasks,
    overdue: overdueTasks,
  }), [inProgressTasks, upcomingTasks, overdueTasks]);

  const activityModalTitle = showActivitiesModal === 'inProgress'
    ? 'In Progress Tasks (All)'
    : showActivitiesModal === 'upcoming'
      ? 'Upcoming Tasks (All)'
      : showActivitiesModal === 'overdue'
        ? 'Overdue Tasks (All)'
        : '';

  const activityModalRows = showActivitiesModal ? activityTaskRows[showActivitiesModal] : [];

  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  React.useEffect(() => {
    const node = ganttWrapRef.current;
    if (!node) return;

    const updateWidth = () => setGanttWrapWidth(node.clientWidth || 0);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    window.addEventListener('resize', updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  const monthCount = Math.max(1, months.length);
  const wrapWidth = Math.max(720, ganttWrapWidth || 0);
  const fixedColumnWidths = (() => {
    const base = { wbs: 52, task: 260, start: 120, end: 120, pic: 90, status: 130 };
    const min = { wbs: 44, task: 180, start: 84, end: 84, pic: 68, status: 88 };
    const baseFixed = base.wbs + base.task + base.start + base.end + base.pic + base.status;
    const minFixed = min.wbs + min.task + min.start + min.end + min.pic + min.status;
    const desiredMonthWidth = monthCount >= 10 ? 44 : monthCount >= 7 ? 54 : 68;
    const widthAtBase = baseFixed + (desiredMonthWidth * monthCount);
    if (wrapWidth >= widthAtBase) {
      return { ...base, month: Math.floor((wrapWidth - baseFixed) / monthCount) };
    }
    const widthAtMin = minFixed + (desiredMonthWidth * monthCount);
    if (wrapWidth >= widthAtMin) {
      const extra = wrapWidth - widthAtMin;
      return {
        wbs: min.wbs,
        task: min.task + Math.max(0, Math.floor(extra * 0.5)),
        start: min.start + Math.max(0, Math.floor(extra * 0.16)),
        end: min.end + Math.max(0, Math.floor(extra * 0.16)),
        pic: min.pic + Math.max(0, Math.floor(extra * 0.08)),
        status: min.status + Math.max(0, Math.floor(extra * 0.1)),
        month: desiredMonthWidth,
      };
    }
    const month = Math.max(26, Math.floor((wrapWidth - minFixed) / monthCount));
    return { ...min, month };
  })();
  const monthColWidth = fixedColumnWidths.month;
  const timelineWidth = Math.max(monthCount * monthColWidth, 0);
  const ganttGridTemplate = `${fixedColumnWidths.wbs}px ${fixedColumnWidths.task}px ${fixedColumnWidths.start}px ${fixedColumnWidths.end}px ${fixedColumnWidths.pic}px ${fixedColumnWidths.status}px minmax(0, 1fr)`;
  const compactMonthHeaders = monthColWidth < 48;

  return (
    <div style={{ minHeight: '100%', overflowY: 'auto', background: '#F3F6FB', padding: isMobile ? 14 : 18 }}>
      {/* Old Section: previous executive report is intentionally preserved in ProjectReport.tsx */}
      <div
        style={{
          marginBottom: 14,
          padding: isMobile ? '14px 16px' : '16px 20px',
          borderRadius: 14,
          border: `1px solid ${C.border}`,
          background: '#FFFFFF',
          boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
        }}
      >
        <div style={{ fontSize: 11, color: C.text2, fontWeight: 700, letterSpacing: 0.4 }}>EXECUTIVE REPORT - ONE PAGE</div>
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{project.name}</div>
          <div style={{ fontSize: 12, color: C.text2 }}>
            {fmtDate(project.startDate)} - {fmtDate(project.endDate)}
          </div>
        </div>
      </div>

      <Card style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ padding: '12px 16px', borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700, textTransform: 'uppercase' }}>Overall Progress</div>
            <div style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 900, color: C.primary, marginTop: 4 }}>{overallProgress}%</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 3 }}>{doneRootTasks} done / {inProgressRootTasks} in progress</div>
            <div style={{ marginTop: 6, height: 6, background: C.bg2, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(overallProgress, 100)}%`, height: '100%', background: C.primary }} />
            </div>
            <div style={{ fontSize: 11, marginTop: 5, fontWeight: 600, color: overallProgress >= plannedPercent ? C.green : C.red }}>
              {overallProgress >= plannedPercent ? `Ahead of target (${overallProgress - plannedPercent}%)` : `Behind target (${plannedPercent - overallProgress}%)`}
            </div>
          </div>

          <div style={{ padding: '12px 16px', borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700, textTransform: 'uppercase' }}>Payment</div>
            <div style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 900, color: C.green, marginTop: 4 }}>{paymentPct}%</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 3 }}>{money(collectedAmount)} THB collected / {projectMilestones.length} milestones</div>
            <div style={{ marginTop: 6, height: 6, background: C.bg2, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(paymentPct, 100)}%`, height: '100%', background: C.green }} />
            </div>
          </div>

          <div style={{ padding: '12px 16px', borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700, textTransform: 'uppercase' }}>Manday Used</div>
            <div style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 900, color: mandayPct > 90 ? C.red : C.amber, marginTop: 4 }}>
              {totalMandayUsed.toFixed(1)}
              <span style={{ fontSize: 13, color: C.text3, fontWeight: 700 }}>/{totalMandayBudget.toFixed(1)}</span>
            </div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 3 }}>{mandayPct}% utilized / {activeInternalMembers} members</div>
            <div style={{ marginTop: 6, height: 6, background: C.bg2, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(mandayPct, 100)}%`, height: '100%', background: mandayPct > 90 ? C.red : C.amber }} />
            </div>
          </div>

          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700, textTransform: 'uppercase' }}>Issues / Risks</div>
            <div style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 900, color: openIssues.length > 0 ? C.red : C.green, marginTop: 4 }}>
              {openIssues.length}
              <span style={{ fontSize: 13, color: C.text3, fontWeight: 700 }}> issues</span>
            </div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 3 }}>{openRiskCount} risks / {openRiskCount > 0 ? 'monitoring' : 'under control'}</div>
            <div style={{ marginTop: 6, height: 6, background: C.bg2, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${openIssues.length > 0 ? 100 : 0}%`, height: '100%', background: C.red }} />
            </div>
          </div>
        </div>
      </Card>

      <Card style={{ padding: isMobile ? 12 : 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Project Plan (Plan vs Actual)</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setShowTodayLine(!showTodayLine)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: showTodayLine ? `2px solid ${C.red}` : `1px solid ${C.border}`,
                background: showTodayLine ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                color: showTodayLine ? C.red : C.text2,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {showTodayLine ? '✓ Today Line' : '○ Today Line'}
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#64748B' }}>Plan</span>
              <span style={{ width: 16, height: 8, borderRadius: 99, background: PLAN_PATTERN, display: 'inline-block' }} />
              {Object.entries(ACTUAL_STATE).map(([key, state]) => (
                <React.Fragment key={key}>
                  <span style={{ fontSize: 11, color: '#64748B' }}>{state.label}</span>
                  <span style={{ width: 16, height: 8, borderRadius: 99, background: state.color, display: 'inline-block' }} />
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div ref={ganttWrapRef} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflowX: 'hidden', overflowY: 'hidden' }}>
          <div style={{ width: '100%' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: ganttGridTemplate,
                alignItems: 'center',
                background: '#0EA5B7',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
            <div style={{ padding: '9px 8px', borderRight: '1px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>WBS</div>
            <div style={{ padding: '9px 8px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>Task</div>
            <div style={{ padding: '9px 6px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>Start Date</div>
            <div style={{ padding: '9px 6px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>End Date</div>
            <div style={{ padding: '9px 6px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>PIC</div>
            <div style={{ padding: '9px 6px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>Status</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
              {months.map((month) => (
                <div key={month.toISOString()} style={{ padding: compactMonthHeaders ? '9px 2px' : '9px 6px', borderLeft: '1px solid rgba(255,255,255,0.3)', textAlign: 'center', fontSize: compactMonthHeaders ? 10 : 12, whiteSpace: 'nowrap' }}>
                  {compactMonthHeaders ? monthCompactLabel(month) : monthLabel(month)}
                </div>
              ))}
            </div>
            </div>

            {mainTasks.map((task) => {
            const planStart = toDate(task.startDate);
            const planEnd = toDate(task.endDate);
            if (!planStart || !planEnd) return null;

            const actual = getActualState(task, today);
            const planLeft = monthPercent(rangeStartMonth, monthCount, clampDate(planStart, rangeStart, rangeEnd), 'start');
            const planRight = monthPercent(rangeStartMonth, monthCount, clampDate(planEnd, rangeStart, rangeEnd), 'end');
            const planWidth = Math.max(0.6, planRight - planLeft);

            const actualBarEnd = clampDate(actual.barEnd, rangeStart, rangeEnd);
            const actualLeft = planLeft;
            const actualRight = monthPercent(rangeStartMonth, monthCount, actualBarEnd, 'end');
            const actualWidth = Math.max(0.6, actualRight - actualLeft);

            const state = ACTUAL_STATE[actual.key];

            return (
              <div
                key={task.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: ganttGridTemplate,
                  borderTop: `1px solid ${C.border}`,
                  background: '#FFFFFF',
                  alignItems: 'center',
                }}
              >
                <div style={{ padding: '6px 8px', fontSize: 12, color: C.text2, textAlign: 'center' }}>{task.wbs || '-'}</div>
                <div style={{ padding: '6px 8px', fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={task.taskName}>
                  {task.taskName}
                </div>
                <div style={{ padding: '6px 6px', fontSize: 11, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtDate(task.startDate)}</div>
                <div style={{ padding: '6px 6px', fontSize: 11, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtDate(task.endDate)}</div>
                <div style={{ padding: '6px 6px', fontSize: 11, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.resource || '-'}</div>
                <div style={{ padding: '6px 6px', fontSize: 10, color: state.color, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{state.label}</div>
                <div style={{ position: 'relative', minHeight: 36, borderLeft: `1px solid ${C.border}` }}>
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
                    {months.map((month) => (
                      <div key={`${task.id}-${month.toISOString()}`} style={{ borderLeft: `1px solid ${C.border}` }} />
                    ))}
                  </div>

                  <div style={{ position: 'relative', height: 36 }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: `${planLeft}%`,
                        width: `${planWidth}%`,
                        height: 7,
                        borderRadius: 99,
                        background: PLAN_PATTERN,
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 20,
                        left: `${actualLeft}%`,
                        width: `${actualWidth}%`,
                        height: 8,
                        borderRadius: 99,
                        background: actual.key === 'notStart' ? '#9AA6B2' : state.color,
                      }}
                    />
                    {showTodayLine && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: `${monthPercent(rangeStartMonth, monthCount, clampDate(today, rangeStart, rangeEnd), 'start')}%`,
                          width: 2,
                          height: 36,
                          background: C.red,
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                          boxShadow: `0 0 8px ${C.red}`,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
            })}

            {mainTasks.length === 0 && (
              <div style={{ padding: '16px 12px', textAlign: 'center', color: C.text3, fontSize: 12 }}>No main tasks with plan dates.</div>
            )}
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Accomplished Task</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>Completed tasks sorted by WBS</div>
            </div>
            <button type="button" onClick={() => openTab('tasks')} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>View Task Detail</button>
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: isMobile ? 230 : 285, overflow: 'auto' }}>
            {accomplishedTasks.map((task, index) => (
              <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: C.bg }}>
                <div style={{ minWidth: 0, fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={task.taskName}>
                  {`${index + 1}. ${task.taskName}`}
                </div>
                <div style={{ fontSize: 11, color: C.text2, whiteSpace: 'nowrap' }}>{task.actualFinish ? fmtDate(task.actualFinish) : '-'}</div>
              </div>
            ))}
            {!accomplishedTasks.length && <div style={{ fontSize: 12, color: C.text3 }}>No accomplished tasks found.</div>}
          </div>
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Upcoming Activities</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>งานที่กำลังดำเนินการ งานถัดไป และงานที่เลยกำหนด</div>
            </div>
            <button type="button" onClick={() => openTab('tasks')} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>View Tasks Tab</button>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.bg }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.text2, marginBottom: 8 }}>IN PROGRESS TASKS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) 70px 86px 90px', gap: 8, alignItems: 'center', paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                {['ที่', 'Task', 'Progress', 'Due Date', 'Resource'].map((h) => (
                  <div key={h} style={{ fontSize: 10, color: C.text2, fontWeight: 800 }}>{h}</div>
                ))}
              </div>
              {inProgressTasks.slice(0, 4).map((task, index) => (
                <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) 70px 86px 90px', gap: 8, alignItems: 'center', paddingTop: 8 }}>
                  <div style={{ fontSize: 11, color: C.primary, fontWeight: 700 }}>{index + 1}</div>
                  <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.taskName}</div>
                  <div style={{ fontSize: 11, color: C.primary, fontWeight: 700 }}>{Math.round(Number(task.percentComplete || 0))}%</div>
                  <div style={{ fontSize: 10, color: C.text2, whiteSpace: 'nowrap' }}>{task.endDate ? fmtDate(task.endDate) : '-'}</div>
                  <div style={{ fontSize: 10, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.resource || '-'}</div>
                </div>
              ))}
              {!inProgressTasks.length && <div style={{ fontSize: 11, color: C.text3 }}>No in-progress tasks</div>}
              {inProgressTasks.length > 4 && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowActivitiesModal('inProgress')} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    +{inProgressTasks.length - 4} more
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.bg }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.text2, marginBottom: 8 }}>UPCOMING TASKS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) 70px 86px 90px', gap: 8, alignItems: 'center', paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                {['ที่', 'Task', 'Progress', 'Due Date', 'Resource'].map((h) => (
                  <div key={h} style={{ fontSize: 10, color: C.text2, fontWeight: 800 }}>{h}</div>
                ))}
              </div>
              {upcomingTasks.slice(0, 4).map((task, index) => (
                <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) 70px 86px 90px', gap: 8, alignItems: 'center', paddingTop: 8 }}>
                  <div style={{ fontSize: 11, color: C.primary, fontWeight: 700 }}>{index + 1}</div>
                  <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.taskName}</div>
                  <div style={{ fontSize: 11, color: C.text2, fontWeight: 700 }}>{Math.round(Number(task.percentComplete || 0))}%</div>
                  <div style={{ fontSize: 10, color: C.text2, whiteSpace: 'nowrap' }}>{(task.endDate || task.startDate) ? fmtDate(task.endDate || task.startDate) : '-'}</div>
                  <div style={{ fontSize: 10, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.resource || '-'}</div>
                </div>
              ))}
              {!upcomingTasks.length && <div style={{ fontSize: 11, color: C.text3 }}>No upcoming tasks</div>}
              {upcomingTasks.length > 4 && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowActivitiesModal('upcoming')} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    +{upcomingTasks.length - 4} more
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.bg }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.text2, marginBottom: 8 }}>OVERDUE TASKS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) 70px 86px 90px', gap: 8, alignItems: 'center', paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                {['ที่', 'Task', 'Progress', 'Due Date', 'Resource'].map((h) => (
                  <div key={h} style={{ fontSize: 10, color: C.text2, fontWeight: 800 }}>{h}</div>
                ))}
              </div>
              {overdueTasks.slice(0, 4).map((task, index) => (
                <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) 70px 86px 90px', gap: 8, alignItems: 'center', paddingTop: 8 }}>
                  <div style={{ fontSize: 11, color: C.primary, fontWeight: 700 }}>{index + 1}</div>
                  <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.taskName}</div>
                  <div style={{ fontSize: 11, color: C.text2, fontWeight: 700 }}>{Math.round(Number(task.percentComplete || 0))}%</div>
                  <div style={{ fontSize: 10, color: C.red, whiteSpace: 'nowrap' }}>{(task.endDate || task.startDate) ? fmtDate(task.endDate || task.startDate) : '-'}</div>
                  <div style={{ fontSize: 10, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.resource || '-'}</div>
                </div>
              ))}
              {!overdueTasks.length && <div style={{ fontSize: 11, color: C.text3 }}>No overdue tasks</div>}
              {overdueTasks.length > 4 && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowActivitiesModal('overdue')} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    +{overdueTasks.length - 4} more
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Milestones</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>All project milestones sorted by due date</div>
            </div>
            <button type="button" onClick={() => openTab('ms')} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>View Milestones Tab</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {['Milestone', 'Due Date', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: C.text2, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedMilestonesByPhase.map((group) => (
                  <React.Fragment key={group.phase}>
                    <tr style={{ background: C.bg }}>
                      <td colSpan={3} style={{ padding: '8px 12px', color: C.text2, fontSize: 11, fontWeight: 800, borderBottom: `1px solid ${C.border}` }}>
                        {group.phase}
                      </td>
                    </tr>
                    {group.items.map((m: Milestone, i) => {
                      const due = parseISO(m.dueDate || '');
                      const milestoneStatus = String(m.status || '').toLowerCase();
                      const isSettledBillingStatus = milestoneStatus === 'paid' || milestoneStatus === 'billing' || milestoneStatus === 'billed';
                      const isDelayed = isValid(due) && due < today && !isSettledBillingStatus;
                      const msState = MILESTONE_STATUS[String(m.status || '').toLowerCase()] ?? MILESTONE_STATUS.pending;
                      return (
                        <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : C.bg }}>
                          <td style={{ padding: '9px 12px 9px 28px', color: C.text, fontWeight: 600 }}>{m.name}</td>
                          <td style={{ padding: '9px 12px 9px 20px', whiteSpace: 'nowrap', color: isDelayed ? C.red : C.text2, fontWeight: isDelayed ? 700 : 400 }}>{m.dueDate ? fmtDate(m.dueDate) : '—'}</td>
                          <td style={{ padding: '9px 12px 9px 20px', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, background: msState.bg, color: msState.color, fontSize: 11, fontWeight: 700 }}>{msState.label}</span>
                            {isDelayed && <span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, background: C.redBg, color: C.red, fontSize: 10, fontWeight: 700 }}>Delayed</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
                {!projectMilestones.length && (
                  <tr><td colSpan={3} style={{ padding: '20px 12px', color: C.text3, textAlign: 'center' }}>No milestones found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Open Issues</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>{openIssueList.length} open issue{openIssueList.length !== 1 ? 's' : ''}</div>
            </div>
            <button type="button" onClick={() => openTab('issues')} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>View All Issues</button>
          </div>
          {openIssueList.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: C.text3, fontSize: 12 }}>No open issues</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) 76px 132px', gap: 8, alignItems: 'center', paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                {['#', 'Issue', 'Status', 'Assignee'].map((h) => (
                  <div key={h} style={{ fontSize: 10, color: C.text2, fontWeight: 800 }}>{h}</div>
                ))}
              </div>
              {openIssueList.slice(0, 6).map((issue: Issue, index) => {
                const tag = issue.status === 'Open' ? { color: C.primary, bg: C.primaryBg } : { color: C.amber, bg: C.amberBg };
                return (
                  <div key={issue.id} style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) 76px 132px', gap: 8, alignItems: 'center', paddingTop: 8 }}>
                    <div style={{ fontSize: 11, color: C.primary, fontWeight: 700 }}>{index + 1}</div>
                    <div style={{ fontSize: 11, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={issue.title}>{issue.title}</div>
                    <div style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, background: tag.bg, color: tag.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{issue.status}</div>
                    <div style={{ fontSize: 11, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{issue.assignedTo || '—'}</div>
                  </div>
                );
              })}
            </>
          )}
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Effort Summary</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>Budget vs. used mandays by module</div>
            </div>
            <button type="button" onClick={() => openTab('effort')} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>View All Effort</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 88px 88px 88px', gap: 8, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700 }}>Module</div>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700, textAlign: 'right' }}>Budget</div>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700, textAlign: 'right' }}>Used</div>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700, textAlign: 'right' }}>Remain</div>
          </div>
          <EffortRows efforts={projectEfforts} />
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Change Requests</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>All CRs (including closed)</div>
            </div>
            <button type="button" onClick={() => openTab('cr')} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>View CR Tab</button>
          </div>
          {allCRs.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: C.text3, fontSize: 12 }}>No change requests.</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '88px minmax(0,1fr) 96px 96px', gap: 8, alignItems: 'center', paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                {['CR ID', 'Title', 'Date', 'Status'].map((h) => (
                  <div key={h} style={{ fontSize: 10, color: C.text2, fontWeight: 800 }}>{h}</div>
                ))}
              </div>
              {allCRs.slice(0, 6).map((cr: ChangeRequest) => (
                <div key={cr.id} style={{ display: 'grid', gridTemplateColumns: '88px minmax(0,1fr) 96px 96px', gap: 8, alignItems: 'center', paddingTop: 8 }}>
                  <div style={{ fontSize: 11, color: C.primary, fontWeight: 700 }}>{cr.crId || '-'}</div>
                  <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cr.title}>{cr.title || '-'}</div>
                  <div style={{ fontSize: 11, color: C.text2 }}>{cr.requestDate ? fmtDate(cr.requestDate) : '-'}</div>
                  <div style={{ fontSize: 10, color: C.text2, fontWeight: 700 }}>{cr.status || '-'}</div>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>

      {showActivitiesModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: C.white, borderRadius: 14, width: '100%', maxWidth: 980, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: C.shadow }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{activityModalTitle}</div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>ทั้งหมด {activityModalRows.length} รายการ</div>
              </div>
              <button onClick={() => setShowActivitiesModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text2, fontSize: 20, lineHeight: 1, padding: 2 }}>×</button>
            </div>

            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.bg, position: 'sticky', top: 0, zIndex: 1 }}>
                    {['ที่', 'Task', 'Progress', 'Due Date', 'Resource'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: C.text2, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activityModalRows.map((task, index) => (
                    <tr key={task.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '9px 12px', color: C.primary, fontWeight: 700, whiteSpace: 'nowrap' }}>{index + 1}</td>
                      <td style={{ padding: '9px 12px', color: C.text }}>{task.taskName}</td>
                      <td style={{ padding: '9px 12px', color: C.text2 }}>{Math.round(Number(task.percentComplete || 0))}%</td>
                      <td style={{ padding: '9px 12px', color: C.text2, whiteSpace: 'nowrap' }}>{(task.endDate || task.startDate) ? fmtDate(task.endDate || task.startDate) : '-'}</td>
                      <td style={{ padding: '9px 12px', color: C.text2 }}>{task.resource || '-'}</td>
                    </tr>
                  ))}
                  {!activityModalRows.length && (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px 12px', color: C.text3, textAlign: 'center' }}>No tasks found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowActivitiesModal(null)} style={{ fontFamily: 'Poppins, sans-serif', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', padding: '6px 14px', background: 'transparent', color: C.text2, border: `1px solid ${C.border}` }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
