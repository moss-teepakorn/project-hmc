import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Home, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Tabs, C, PROJECT_STATUS, ProgressBar, Btn, Modal, FormRow, Select, Input } from '../Common';
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
import { useRolePermissions } from '../../hooks/useRolePermissions';
import { taskApi, memberApi, milestoneApi, effortApi, riskApi } from '../../services/api';

interface Props { project: Project; }

type CopyScopeKey = 'tasks' | 'members' | 'ms' | 'effort' | 'risks';

function getTodayPassword(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

export default function ProjectDetail({ project }: Props) {
  const [activeTab, setActiveTab]   = useState('tasks');
  const [isMobile, setIsMobile] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceProjectId, setCopySourceProjectId] = useState('');
  const [copyPassword, setCopyPassword] = useState('');
  const [copying, setCopying] = useState(false);
  const [copyScopes, setCopyScopes] = useState<Record<CopyScopeKey, boolean>>({
    tasks: true,
    members: false,
    ms: false,
    effort: false,
    risks: false,
  });
  const permissions = useRolePermissions();
  const {
    projects,
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
    fetchProjects,
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

  const copySourceProjects = useMemo(
    () => projects.filter((p) => p.id !== project.id),
    [projects, project.id],
  );

  const copyProjectOptions = copySourceProjects.map((p) => ({
    value: p.id,
    label: `${p.code} - ${p.name}`,
  }));

  const resetCopyModal = () => {
    setCopySourceProjectId(copyProjectOptions[0]?.value || '');
    setCopyPassword('');
    setCopyScopes({ tasks: true, members: false, ms: false, effort: false, risks: false });
  };

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

  // Filter tabs based on role permissions
  const TABS = allTabs.filter(tab => permissions.isTabVisible(tab.id));

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

  React.useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, [projects.length, fetchProjects]);

  React.useEffect(() => {
    if (!copyModalOpen) return;
    if (!copySourceProjectId && copyProjectOptions.length > 0) {
      setCopySourceProjectId(copyProjectOptions[0].value);
    }
  }, [copyModalOpen, copyProjectOptions, copySourceProjectId]);

  const toggleCopyScope = (key: CopyScopeKey) => {
    setCopyScopes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const hasSelectedCopyScope = Object.values(copyScopes).some(Boolean);

  const handleConfirmCopy = async () => {
    if (!copySourceProjectId) {
      toast.error('Please select source project');
      return;
    }
    if (!hasSelectedCopyScope) {
      toast.error('Please select at least one tab');
      return;
    }
    if (copyPassword.trim() !== getTodayPassword()) {
      toast.error('Invalid password');
      return;
    }

    setCopying(true);
    try {
      if (copyScopes.tasks) {
        const targetTasks = await taskApi.getByProject(project.id);
        const targetRootTasks = targetTasks.data.filter((t) => !t.parentId);
        for (const t of targetRootTasks) {
          await taskApi.remove(t.id);
        }
        await taskApi.copyFromProject(copySourceProjectId, project.id, 'all');
      }

      if (copyScopes.members) {
        const [sourceMembers, targetMembers] = await Promise.all([
          memberApi.getByProject(copySourceProjectId),
          memberApi.getByProject(project.id),
        ]);
        for (const m of targetMembers.data) {
          await memberApi.remove(m.id);
        }
        for (const m of sourceMembers.data) {
          await memberApi.create({
            projectId: project.id,
            name: m.name,
            nickname: m.nickname,
            role: m.role,
            position: m.position,
            email: m.email,
            tel: m.tel,
            ext: m.ext,
            type: m.type,
            notes: m.notes,
          });
        }
      }

      if (copyScopes.ms) {
        const [sourceMilestones, targetMilestones] = await Promise.all([
          milestoneApi.getByProject(copySourceProjectId),
          milestoneApi.getByProject(project.id),
        ]);
        for (const m of targetMilestones.data) {
          await milestoneApi.remove(m.id);
        }
        for (const m of sourceMilestones.data) {
          await milestoneApi.create({
            projectId: project.id,
            phase: m.phase,
            name: m.name,
            percent: m.percent,
            amount: m.amount,
            phaseAmount: m.phaseAmount,
            dueDate: m.dueDate,
            billingDate: m.billingDate,
            notes: m.notes,
            status: m.status,
          });
        }
      }

      if (copyScopes.effort) {
        const [sourceEfforts, targetEfforts] = await Promise.all([
          effortApi.getByProject(copySourceProjectId),
          effortApi.getByProject(project.id),
        ]);
        for (const e of targetEfforts.data) {
          await effortApi.remove(e.id);
        }
        for (const e of sourceEfforts.data) {
          const created = await effortApi.create({
            projectId: project.id,
            module: e.module,
            phase: e.phase,
            budgetAmount: e.budgetAmount,
            budgetManday: e.budgetManday,
          });
          const monthlyEntries = Object.entries(e.monthly || {});
          for (const [month, manday] of monthlyEntries) {
            await effortApi.updateMonthly(created.data.id, month, Number(manday) || 0);
          }
        }
      }

      if (copyScopes.risks) {
        const [sourceRisks, targetRisks] = await Promise.all([
          riskApi.getByProject(copySourceProjectId),
          riskApi.getByProject(project.id),
        ]);
        for (const r of targetRisks.data) {
          await riskApi.remove(r.id);
        }
        for (const r of sourceRisks.data) {
          await riskApi.create({
            projectId: project.id,
            riskDate: r.riskDate,
            title: r.title,
            description: r.description,
            probability: r.probability,
            impact: r.impact,
            mitigation: r.mitigation,
            owner: r.owner,
            status: r.status,
          });
        }
      }

      const refreshJobs: Promise<unknown>[] = [];
      if (copyScopes.tasks) refreshJobs.push(fetchTasks(project.id));
      if (copyScopes.members) refreshJobs.push(fetchMembers(project.id));
      if (copyScopes.ms) refreshJobs.push(fetchMilestones(project.id));
      if (copyScopes.effort) refreshJobs.push(fetchEfforts(project.id));
      if (copyScopes.risks) refreshJobs.push(fetchRisks(project.id));
      await Promise.all(refreshJobs);

      toast.success('Copy completed');
      setCopyModalOpen(false);
      resetCopyModal();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Copy failed';
      toast.error(msg || 'Copy failed');
    } finally {
      setCopying(false);
    }
  };

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
                <Btn
                  small
                  variant="ghost"
                  title="Copy from another project"
                  onClick={() => {
                    resetCopyModal();
                    setCopyModalOpen(true);
                  }}
                >
                  <Copy size={14} />
                </Btn>
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

      {copyModalOpen && (
        <Modal title="Copy From Project" onClose={() => setCopyModalOpen(false)} width={700}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: C.amberBg, color: C.text2, fontSize: 12 }}>
              Selected tabs will be replaced with data from source project.
            </div>

            <FormRow label="Source Project" required>
              <Select
                value={copySourceProjectId}
                onChange={setCopySourceProjectId}
                options={copyProjectOptions.length ? copyProjectOptions : [{ value: '', label: 'No other projects available' }]}
                disabled={copyProjectOptions.length === 0}
              />
            </FormRow>

            <FormRow label="Tabs to Copy" required>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {[
                  { key: 'tasks' as CopyScopeKey, label: 'Tab Task' },
                  { key: 'members' as CopyScopeKey, label: 'Tab Member' },
                  { key: 'ms' as CopyScopeKey, label: 'Tab Milestone' },
                  { key: 'effort' as CopyScopeKey, label: 'Tab Effort' },
                  { key: 'risks' as CopyScopeKey, label: 'Tab Risk' },
                ].map((item) => (
                  <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={copyScopes[item.key]}
                      onChange={() => toggleCopyScope(item.key)}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </FormRow>

            <FormRow label="Password (ddmmyyyy)" required>
              <Input value={copyPassword} onChange={setCopyPassword} placeholder="ddmmyyyy" />
            </FormRow>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setCopyModalOpen(false)} disabled={copying}>Cancel</Btn>
              <Btn
                onClick={handleConfirmCopy}
                disabled={copying || !copyProjectOptions.length || !copySourceProjectId || !hasSelectedCopyScope}
              >
                {copying ? 'Copying…' : 'Confirm Copy'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
