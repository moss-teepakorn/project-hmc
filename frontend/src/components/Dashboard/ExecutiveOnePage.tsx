import React from 'react';
import { addMonths, differenceInCalendarDays, isValid, parseISO, startOfDay, startOfMonth } from 'date-fns';
import { C, Card } from '../Common';
import { useStore } from '../../store';
import { compareWbs, fmtDate } from '../../utils';
import type { Effort, Issue, Milestone, Project, Task } from '../../types';

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

function percentLeft(rangeStart: Date, rangeEnd: Date, date: Date): number {
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1);
  const days = differenceInCalendarDays(date, rangeStart);
  return Math.max(0, Math.min(100, (days / totalDays) * 100));
}

function percentRight(rangeStart: Date, rangeEnd: Date, date: Date): number {
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1);
  const days = differenceInCalendarDays(date, rangeStart) + 1;
  return Math.max(0, Math.min(100, (days / totalDays) * 100));
}

function monthLabel(month: Date): string {
  const y = String(month.getFullYear()).slice(-2);
  const m = month.toLocaleString('en-US', { month: 'short' });
  return `${m}-${y}`;
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
  const { tasks, milestones, issues, efforts } = useStore();

  const projectTasks = React.useMemo(() => tasks.filter((t) => t.projectId === project.id), [tasks, project.id]);
  const mainTasks = React.useMemo(() => getMainTasks(projectTasks), [projectTasks]);
  const leafTasks = React.useMemo(() => getLeafTasks(projectTasks), [projectTasks]);
  const projectMilestones = React.useMemo(
    () => milestones.filter((m) => m.projectId === project.id).sort((a, b) => Number(toDate(a.dueDate) || 0) - Number(toDate(b.dueDate) || 0)),
    [milestones, project.id],
  );
  const projectIssues = React.useMemo(
    () => issues.filter((i) => i.projectId === project.id),
    [issues, project.id],
  );
  const projectEfforts = React.useMemo(
    () => efforts.filter((e) => e.projectId === project.id),
    [efforts, project.id],
  );

  const today = startOfDay(new Date());

  const rangeStartBase = toDate(project.startDate) || toDate(mainTasks[0]?.startDate) || today;
  const rangeEndFromProject = toDate(project.endDate) || toDate(mainTasks[mainTasks.length - 1]?.endDate) || today;
  const rangeStart = startOfMonth(rangeStartBase);
  const rangeEndBase = startOfMonth(addMonths(rangeEndFromProject, 1));

  const hasDelayTask = mainTasks.some((task) => {
    const actualState = getActualState(task, today);
    return actualState.key === 'delay';
  });

  const rangeEnd = hasDelayTask && today > rangeEndBase ? startOfMonth(addMonths(today, 1)) : rangeEndBase;

  const months = React.useMemo(() => {
    const list: Date[] = [];
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor <= rangeEnd) {
      list.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return list;
  }, [rangeStart, rangeEnd]);

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

      <Card style={{ padding: isMobile ? 12 : 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Project Plan (Plan vs Actual)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748B' }}>Plan</span>
            <span style={{ width: 16, height: 8, borderRadius: 99, background: '#CBD5E1', display: 'inline-block' }} />
            {Object.entries(ACTUAL_STATE).map(([key, state]) => (
              <React.Fragment key={key}>
                <span style={{ fontSize: 11, color: '#64748B' }}>{state.label}</span>
                <span style={{ width: 16, height: 8, borderRadius: 99, background: state.color, display: 'inline-block' }} />
              </React.Fragment>
            ))}
          </div>
        </div>

        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '52px minmax(220px,1.3fr) 120px 120px 90px 130px minmax(420px,2fr)',
              alignItems: 'stretch',
              background: '#0EA5B7',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            <div style={{ padding: '10px 8px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>WBS</div>
            <div style={{ padding: '10px 8px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>Task</div>
            <div style={{ padding: '10px 8px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>Start Date</div>
            <div style={{ padding: '10px 8px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>End Date</div>
            <div style={{ padding: '10px 8px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>PIC</div>
            <div style={{ padding: '10px 8px', borderRight: '1px solid rgba(255,255,255,0.3)' }}>Status</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(90px, 1fr))` }}>
              {months.map((month) => (
                <div key={month.toISOString()} style={{ padding: '10px 8px', borderLeft: '1px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
                  {monthLabel(month)}
                </div>
              ))}
            </div>
          </div>

          {mainTasks.map((task) => {
            const planStart = toDate(task.startDate);
            const planEnd = toDate(task.endDate);
            if (!planStart || !planEnd) return null;

            const actual = getActualState(task, today);
            const planLeft = percentLeft(rangeStart, rangeEnd, clampDate(planStart, rangeStart, rangeEnd));
            const planRight = percentRight(rangeStart, rangeEnd, clampDate(planEnd, rangeStart, rangeEnd));
            const planWidth = Math.max(0.6, planRight - planLeft);

            const actualBarEnd = clampDate(actual.barEnd, rangeStart, rangeEnd);
            const actualLeft = planLeft;
            const actualRight = percentRight(rangeStart, rangeEnd, actualBarEnd);
            const actualWidth = Math.max(0.6, actualRight - actualLeft);

            const state = ACTUAL_STATE[actual.key];

            return (
              <div
                key={task.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px minmax(220px,1.3fr) 120px 120px 90px 130px minmax(420px,2fr)',
                  borderTop: `1px solid ${C.border}`,
                  background: '#FFFFFF',
                }}
              >
                <div style={{ padding: '8px 8px', fontSize: 12, color: C.text2 }}>{task.wbs || '-'}</div>
                <div style={{ padding: '8px 8px', fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={task.taskName}>
                  {task.taskName}
                </div>
                <div style={{ padding: '8px 8px', fontSize: 12, color: C.text2 }}>{fmtDate(task.startDate)}</div>
                <div style={{ padding: '8px 8px', fontSize: 12, color: C.text2 }}>{fmtDate(task.endDate)}</div>
                <div style={{ padding: '8px 8px', fontSize: 12, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.resource || '-'}</div>
                <div style={{ padding: '8px 8px', fontSize: 11, color: state.color, fontWeight: 800 }}>{state.label}</div>
                <div style={{ position: 'relative', minHeight: 52, borderLeft: `1px solid ${C.border}` }}>
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(90px, 1fr))` }}>
                    {months.map((month) => (
                      <div key={`${task.id}-${month.toISOString()}`} style={{ borderLeft: `1px solid ${C.border}` }} />
                    ))}
                  </div>

                  <div style={{ position: 'relative', height: 52 }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: `${planLeft}%`,
                        width: `${planWidth}%`,
                        height: 8,
                        borderRadius: 99,
                        background: '#B8C2CF',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 28,
                        left: `${actualLeft}%`,
                        width: `${actualWidth}%`,
                        height: 10,
                        borderRadius: 99,
                        background: state.color,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {mainTasks.length === 0 && (
            <div style={{ padding: '16px 12px', textAlign: 'center', color: C.text3, fontSize: 12 }}>No main tasks with plan dates.</div>
          )}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 800, marginBottom: 10 }}>Accomplished Task</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {accomplishedTasks.slice(0, 8).map((task, index) => (
              <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) 100px', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: C.bg }}>
                <div style={{ fontSize: 11, color: C.text2, fontWeight: 700 }}>{index + 1}</div>
                <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={task.taskName}>{task.taskName}</div>
                <div style={{ fontSize: 11, color: C.text2, textAlign: 'right' }}>{task.actualFinish ? fmtDate(task.actualFinish) : '-'}</div>
              </div>
            ))}
            {accomplishedTasks.length === 0 && <div style={{ fontSize: 12, color: C.text3 }}>No accomplished tasks.</div>}
          </div>
        </Card>

        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 800, marginBottom: 10 }}>Upcoming Activities</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.primary, marginBottom: 6 }}>In Progress ({inProgressTasks.length})</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {inProgressTasks.slice(0, 3).map((task) => (
                  <div key={task.id} style={{ fontSize: 12, color: C.text, background: C.bg, borderRadius: 8, padding: '7px 9px' }}>
                    {task.taskName}
                  </div>
                ))}
                {inProgressTasks.length === 0 && <div style={{ fontSize: 12, color: C.text3 }}>No in-progress tasks.</div>}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 6 }}>Upcoming ({upcomingTasks.length})</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {upcomingTasks.slice(0, 3).map((task) => (
                  <div key={task.id} style={{ fontSize: 12, color: C.text, background: C.bg, borderRadius: 8, padding: '7px 9px' }}>
                    {task.taskName}
                  </div>
                ))}
                {upcomingTasks.length === 0 && <div style={{ fontSize: 12, color: C.text3 }}>No upcoming tasks.</div>}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.red, marginBottom: 6 }}>Overdue ({overdueTasks.length})</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {overdueTasks.slice(0, 3).map((task) => (
                  <div key={task.id} style={{ fontSize: 12, color: C.text, background: C.bg, borderRadius: 8, padding: '7px 9px' }}>
                    {task.taskName}
                  </div>
                ))}
                {overdueTasks.length === 0 && <div style={{ fontSize: 12, color: C.text3 }}>No overdue tasks.</div>}
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 800, marginBottom: 10 }}>Milestones</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {projectMilestones.slice(0, 8).map((milestone: Milestone) => (
              <div key={milestone.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 95px 95px', gap: 8, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={milestone.name}>{milestone.name}</div>
                <div style={{ fontSize: 11, color: C.text2, textAlign: 'right' }}>{fmtDate(milestone.dueDate)}</div>
                <div style={{ fontSize: 11, color: C.text2, textAlign: 'right' }}>{String(milestone.status || '').toUpperCase()}</div>
              </div>
            ))}
            {projectMilestones.length === 0 && <div style={{ fontSize: 12, color: C.text3 }}>No milestones.</div>}
          </div>
        </Card>

        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 800, marginBottom: 10 }}>Open Issues</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {openIssues.slice(0, 8).map((issue: Issue) => (
              <div key={issue.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px', gap: 8, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                <div style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={issue.title}>
                  {issue.title}
                </div>
                <div style={{ fontSize: 11, color: issue.status === 'Open' ? C.red : C.amber, textAlign: 'right', fontWeight: 700 }}>
                  {issue.status}
                </div>
              </div>
            ))}
            {openIssues.length === 0 && <div style={{ fontSize: 12, color: C.text3 }}>No open issues.</div>}
          </div>
        </Card>

        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 800, marginBottom: 10 }}>Effort Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 88px 88px 88px', gap: 8, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700 }}>Module</div>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700, textAlign: 'right' }}>Budget</div>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700, textAlign: 'right' }}>Used</div>
            <div style={{ fontSize: 10, color: C.text2, fontWeight: 700, textAlign: 'right' }}>Remain</div>
          </div>
          <EffortRows efforts={projectEfforts} />
        </Card>
      </div>
    </div>
  );
}
