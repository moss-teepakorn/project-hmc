import React, { useEffect, useState } from 'react';
import { ChevronLeft, Home } from 'lucide-react';
import { Badge, Tabs, C, PROJECT_STATUS, ProgressBar } from '../Common';
import { fmtDate, computeBaselineProgress } from '../../utils';
import type { Project } from '../../types';
import TasksTab          from '../Table/TasksTab';
import ProjectSummaryTab from './ProjectSummaryTab';
import MembersTab        from '../Members/MembersTab';
import MilestonesTab     from '../Milestones/MilestonesTab';
import EffortTab         from '../Effort/EffortTab';
import ChangeRequestTab  from '../ChangeRequest/ChangeRequestTab';
import IssuesTab         from '../Issues/IssuesTab';
import RiskRegisterTab   from '../RiskRegister/RiskRegisterTab';
import ProjectEnvironmentTab from './ProjectEnvironmentTab';
import ProjectReport     from './ProjectReport';
import { useStore }      from '../../store';
import { useAuth }       from '../../contexts/AuthContext';

interface Props { project: Project; }

export default function ProjectDetail({ project }: Props) {
  const [activeTab, setActiveTab]   = useState('tasks');
  const [isMobile, setIsMobile] = useState(false);
  const { profile } = useAuth();
  const {
    tasks,
    members,
    milestones,
    efforts,
    changeRequests,
    issues,
    risks,
    projectEnvironments,
    fetchTasks,
    fetchProjectProgressSnapshots,
    fetchMembers,
    fetchMilestones,
    fetchEfforts,
    fetchCRs,
    fetchIssues,
    fetchRisks,
    fetchProjectEnvironments,
  } = useStore();

  const { masterCodes } = useStore();
  const statusCode = masterCodes.find((code) => code.codeType === 'project_status' && code.active && code.codeValue === project.status);
  const s = statusCode ? { bg: statusCode.bgColor, color: statusCode.textColor, label: statusCode.label } : { bg: C.bg2, color: C.text, label: project.status || 'Unknown' };
  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const rootTasks = projectTasks.filter((t) => !t.parentId);
  const overallProgress = rootTasks.length ? Math.round(rootTasks.reduce((sum, t) => sum + t.percentComplete, 0) / rootTasks.length) : 0;

  const currentDate = new Date();
  const todayIso = currentDate.toISOString().slice(0, 10);
  const todayBaseline = computeBaselineProgress(projectTasks, [todayIso]);
  const plannedPercent = todayBaseline[0]?.baselinePercent ?? 0;
  const scheduleGap = plannedPercent - overallProgress;
  const scheduleStatus = !todayBaseline.length ? 'Plan N/A'
    : scheduleGap > 20 ? 'Stoper'
    : scheduleGap > 3 ? 'Delay'
    : 'On Track';
  const scheduleColor = scheduleStatus === 'Stoper'
    ? C.red
    : scheduleStatus === 'Delay'
      ? C.amber
      : scheduleStatus === 'Plan N/A'
        ? C.text3
        : C.green;
  const scheduleBg = scheduleStatus === 'Stoper'
    ? C.redBg
    : scheduleStatus === 'Delay'
      ? C.amberBg
      : scheduleStatus === 'Plan N/A'
        ? C.bg2
        : C.greenBg;
  const scheduleLabel = scheduleStatus === 'Plan N/A' ? 'Plan N/A' : `Project Health : ${scheduleStatus}`;

  const allTabs = [
    { id: 'tasks',    label: 'Tasks',      icon: '📋', count: tasks.filter(t => t.projectId === project.id).length },
    { id: 'summary',  label: 'Summary',    icon: '📈' },
    { id: 'members',  label: 'Members',    icon: '👥', count: members.length },
    { id: 'ms',       label: 'Milestones', icon: '🏁', count: milestones.length },
    { id: 'effort',   label: 'Effort',     icon: '⚡', count: efforts.length },
    { id: 'cr',       label: 'Change Req', icon: '📝', count: changeRequests.length },
    { id: 'issues',   label: 'Issues',     icon: '🔴', count: issues.filter(i => i.status !== 'Resolved' && i.status !== 'Blocked').length },
    { id: 'risks',    label: 'Risks',      icon: '🎯', count: risks.filter(r => r.status === 'Monitoring' || r.status === 'Mitigating').length },
    { id: 'env',      label: 'Program URL', icon: '🌐', count: projectEnvironments.filter((e) => e.projectId === project.id).length },
    { id: 'report',   label: 'Report',     icon: '📊' },
  ];

  // Role-based tab filtering
  const userRole = profile?.role || 'admin';
  const TABS = allTabs.filter(tab => {
    if (userRole === 'admin') return true; // Admin sees all tabs
    if (userRole === 'member') {
      // Member cannot see Milestone tab
      return tab.id !== 'ms';
    }
    if (userRole === 'client') {
      // Client cannot see Milestone, Effort, or Report tabs
      return tab.id !== 'ms' && tab.id !== 'effort' && tab.id !== 'report';
    }
    return true;
  });

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    const handleSetTab = (e: Event) => {
      const tab = (e as CustomEvent<{ tab: string }>).detail?.tab;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener('app-set-tab', handleSetTab);
    return () => window.removeEventListener('app-set-tab', handleSetTab);
  }, []);

  React.useEffect(() => {
    if (!project?.id) return;

    // Preload all project datasets so Executive Report and all tabs are complete immediately.
    Promise.allSettled([
      fetchTasks(project.id),
      fetchProjectProgressSnapshots(project.id),
      fetchMembers(project.id),
      fetchMilestones(project.id),
      fetchEfforts(project.id),
      fetchCRs(project.id),
      fetchIssues(project.id),
      fetchRisks(project.id),
      fetchProjectEnvironments(project.id),
    ]);
  }, [
    project?.id,
    fetchTasks,
    fetchProjectProgressSnapshots,
    fetchMembers,
    fetchMilestones,
    fetchEfforts,
    fetchCRs,
    fetchIssues,
    fetchRisks,
    fetchProjectEnvironments,
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ padding: isMobile ? '12px 16px 0' : '14px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 10, height: 42, borderRadius: 5, background: project.color || C.primary, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 19, fontWeight: 800, color: C.text, margin: 0 }}>{project.name}</h2>
                <Badge bg={s.bg} color={s.color}>{s.label}</Badge>
              </div>
              <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>
                {project.code} · {project.client} · {fmtDate(project.startDate)} – {fmtDate(project.endDate)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <Badge bg={scheduleBg} color={scheduleColor}>
                  {scheduleLabel}
                </Badge>
                <span style={{ fontSize: 12, color: C.text3, whiteSpace: 'nowrap' }}>
                  Overall Progress : {overallProgress}% - Target : {plannedPercent}%
                </span>
              </div>
            </div>
          </div>
          <Tabs tabs={TABS} active={activeTab} onChange={id => setActiveTab(id)} />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', background: activeTab === 'tasks' ? C.white : C.bg }}>
        {activeTab === 'tasks'   && <div style={{ height: '100%' }}><TasksTab         projectId={project.id} /></div>}
        {activeTab === 'summary' && <div style={{ height: '100%', overflowY: 'auto' }}><ProjectSummaryTab project={project} /></div>}
        {activeTab === 'members' && <div style={{ height: '100%', overflowY: 'auto' }}><MembersTab        projectId={project.id} /></div>}
        {activeTab === 'ms'      && <div style={{ height: '100%', overflowY: 'auto' }}><MilestonesTab     projectId={project.id} /></div>}
        {activeTab === 'effort'  && <div style={{ height: '100%', overflowY: 'auto' }}><EffortTab         projectId={project.id} /></div>}
        {activeTab === 'cr'      && <div style={{ height: '100%', overflowY: 'auto' }}><ChangeRequestTab  projectId={project.id} /></div>}
        {activeTab === 'issues'  && <div style={{ height: '100%', overflowY: 'auto' }}><IssuesTab         projectId={project.id} /></div>}
        {activeTab === 'risks'   && <div style={{ height: '100%', overflowY: 'auto' }}><RiskRegisterTab   projectId={project.id} /></div>}
        {activeTab === 'env'     && <div style={{ height: '100%', overflowY: 'auto' }}><ProjectEnvironmentTab project={project} /></div>}
        {activeTab === 'report'  && <div style={{ height: '100%', overflowY: 'auto' }}><ProjectReport project={project} /></div>}
      </div>
    </div>
  );
}
