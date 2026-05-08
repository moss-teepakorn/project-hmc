import React, { useState } from 'react';
import { parseISO, isValid, addDays } from 'date-fns';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, Home, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useRolePermissions } from '../../hooks/useRolePermissions';
import { Card, Btn, Badge, ProgressBar, ConfirmModal, C, MILESTONE_STATUS, TH, TD } from '../Common';
import { fmtDate, fmtMoney, compareWbs, computeBaselineProgress, getHalfMonthSnapshotDates } from '../../utils';
import type { Project } from '../../types';
import ProjectModal from './ProjectModal';
import PortfolioReportSummary from './PortfolioReportSummary';

const STATUS_ORDER = ['Planning', 'Req & Design', 'Setup', 'Testing', 'Go Live', 'Hyper Care'];
const DASHBOARD_VIEW_STATE_KEY = 'dashboard-view-state';

function loadDashboardViewState(): { selectedProjectId: string | null; dashboardTab: 'overview' | 'report' | null } {
  try {
    const raw = window.sessionStorage.getItem(DASHBOARD_VIEW_STATE_KEY);
    if (!raw) return { selectedProjectId: null, dashboardTab: null };
    const parsed = JSON.parse(raw) as { selectedProjectId?: unknown; dashboardTab?: unknown };
    const selectedProjectId = typeof parsed.selectedProjectId === 'string' && parsed.selectedProjectId ? parsed.selectedProjectId : null;
    const dashboardTab = parsed.dashboardTab === 'overview' || parsed.dashboardTab === 'report' ? parsed.dashboardTab : null;
    return { selectedProjectId, dashboardTab };
  } catch {
    return { selectedProjectId: null, dashboardTab: null };
  }
}

export default function Dashboard() {
  const { projects, tasks, milestones, issues, risks, changeRequests, activeProject, setActiveProject, deleteProject, fetchTasks, fetchIssues, fetchRisks, fetchCRs, fetchMembers, fetchMilestones, fetchEfforts, masterCodes } = useStore();
  const { profile } = useAuth();
  const permissions = useRolePermissions();
  const savedView = React.useMemo(() => loadDashboardViewState(), []);
  const [selected,   setSelected]   = useState<Project | null>(null);
  const [editing,    setEditing]    = useState<Project | null>(null);
  const [deleting,   setDeleting]   = useState<Project | null>(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [showHypercare, setShowHypercare] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'report'>(() => {
    if (savedView.dashboardTab === 'report') return 'report';
    if (savedView.dashboardTab === 'overview' && permissions.canViewPortfolioOverview) return 'overview';
    return permissions.canViewPortfolioOverview ? 'overview' : 'report';
  });
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [notificationsShown, setNotificationsShown] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [showEmailLogs, setShowEmailLogs] = useState(false);
  const isMobile = windowWidth < 768;

  React.useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  React.useEffect(() => {
    const onHome = () => {
      setSelected(null);
      setDashboardTab('overview');
      fetchTasks();
    };
    window.addEventListener('app-home', onHome);
    return () => window.removeEventListener('app-home', onHome);
  }, [fetchTasks]);

  // Note: fetchProjects is called from App.tsx, not needed here

  React.useEffect(() => {
    // Load milestones for portfolio overview (tasks are loaded by the selection effect below).
    fetchMilestones();
  }, [fetchMilestones]);
  
  React.useEffect(() => {
    if (notificationsShown) return;
    if (!tasks.length && !milestones.length) return;

    const now = new Date();
    const endIn7 = new Date(now);
    endIn7.setDate(endIn7.getDate() + 7);
    const dueIn10 = new Date(now);
    dueIn10.setDate(dueIn10.getDate() + 10);

    const parseDate = (value: string) => {
      if (!value) return null;
      const date = parseISO(value);
      return isValid(date) ? date : null;
    };

    const overdueTasks = tasks.filter((t) => {
      const due = parseDate(t.endDate);
      return due && t.percentComplete < 100 && due < now;
    });
    const upcomingTasks = tasks.filter((t) => {
      const due = parseDate(t.endDate);
      return due && t.percentComplete < 100 && due >= now && due <= endIn7;
    });
    const dueMilestones = milestones.filter((m) => {
      const due = parseDate(m.dueDate);
      return String(m.status).toLowerCase() === 'pending' && due && due <= dueIn10;
    });

    const messages: string[] = [];
    if (overdueTasks.length) messages.push(`มี ${overdueTasks.length} แผนงานเกินกำหนดที่ยังไม่เสร็จ`);
    if (upcomingTasks.length) messages.push(`มี ${upcomingTasks.length} แผนงานที่ใกล้ครบใน 7 วัน`);
    if (dueMilestones.length) messages.push(`มี ${dueMilestones.length} milestone ที่กำลังจะครบหรือเลย Due Date ภายใน 10 วัน`);

    const todayKey = new Date().toISOString().slice(0, 10);
    const lastNotified = window.localStorage.getItem('projectNotificationsLastDate');
    if (messages.length > 0 && lastNotified !== todayKey) {
      toast.custom((t) => (
        <div style={{
          padding: 14,
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          boxShadow: C.shadow,
          fontFamily: 'Poppins, sans-serif',
          color: C.text,
          maxWidth: 360,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>แจ้งเตือนโปรเจกต์</div>
          {messages.map((msg) => (
            <div key={msg} style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 4 }}>
              {msg}
            </div>
          ))}
          <div style={{ fontSize: 11, color: C.text2, marginTop: 6 }}>ตรวจสอบได้ในหน้า Portfolio Overview หรือ Milestones</div>
        </div>
      ));
      window.localStorage.setItem('projectNotificationsLastDate', todayKey);
    }
    setNotificationsShown(true);
  }, [tasks, milestones, notificationsShown]);

  // Fetch remaining data when a project is opened from the overview cards
  React.useEffect(() => {
    if (activeProject?.id) {
      fetchTasks(activeProject.id);
      fetchMembers(activeProject.id);
      fetchIssues(activeProject.id);
      fetchRisks(activeProject.id);
      fetchCRs(activeProject.id);
      fetchMilestones(activeProject.id);
      fetchEfforts(activeProject.id);
    }
  }, [activeProject?.id, fetchTasks, fetchMembers, fetchIssues, fetchRisks, fetchCRs, fetchMilestones, fetchEfforts]);

  React.useEffect(() => {
    if (!selected?.id) {
      fetchTasks();
      return;
    }
    fetchTasks(selected.id);
    fetchMembers(selected.id);
    fetchIssues(selected.id);
    fetchRisks(selected.id);
    fetchCRs(selected.id);
    fetchMilestones(selected.id);
    fetchEfforts(selected.id);
  }, [selected?.id, fetchTasks, fetchMembers, fetchIssues, fetchRisks, fetchCRs, fetchMilestones, fetchEfforts]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (selected?.id || !savedView.selectedProjectId) return;
    if (!projects.length) return;
    const found = projects.find((p) => p.id === savedView.selectedProjectId);
    if (found) setSelected(found);
  }, [projects, savedView.selectedProjectId, selected?.id]);

  React.useEffect(() => {
    window.sessionStorage.setItem(
      DASHBOARD_VIEW_STATE_KEY,
      JSON.stringify({
        selectedProjectId: selected?.id || null,
        dashboardTab,
      })
    );
  }, [selected?.id, dashboardTab]);

  // Separate normal projects from Hypercare
  const statusOrder = masterCodes
    .filter((code) => code.codeType === 'project_status' && code.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((code) => code.codeValue);

  const getStatusOrder = (status: string) => {
    const index = statusOrder.indexOf(status);
    return index >= 0 ? index : statusOrder.length;
  };

  const normalProjects = projects.filter(p => p.status !== 'Hyper Care').sort((a, b) => getStatusOrder(a.status) - getStatusOrder(b.status));
  const hypercareProjects = projects.filter(p => p.status === 'Hyper Care').sort((a, b) => a.name.localeCompare(b.name));
  const allProjects = [...projects].sort((a, b) => getStatusOrder(a.status) - getStatusOrder(b.status));

  const getProgress = (pid: string) => {
    const roots = tasks.filter(t => t.projectId === pid && !t.parentId);
    return roots.length ? Math.round(roots.reduce((s, t) => s + t.percentComplete, 0) / roots.length) : 0;
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await deleteProject(deleting.id); toast.success('Project deleted'); }
    catch { toast.error('Failed to delete'); }
    setDeleting(null);
  };

  const renderProjectCard = (p: Project, compact = false) => {
    const statusCode = masterCodes.find((code) => code.codeType === 'project_status' && code.active && code.codeValue === p.status);
    const s = statusCode ? { bg: statusCode.bgColor, color: statusCode.textColor, label: statusCode.label } : { bg: C.bg2, color: C.text, label: p.status || 'Unknown' };
    const prog = getProgress(p.id);
    return (
      <div key={p.id}
        style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s', marginBottom: 8, borderLeft: `4px solid ${p.color || C.primary}` }}
        onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFF'; }}
        onMouseLeave={e => { e.currentTarget.style.background = C.white; }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.35, whiteSpace: 'normal', wordBreak: 'break-word' }}>
            <span style={{ color: C.text2 }}>Project ID : </span>
            <span style={{ color: C.primary, fontFamily: 'Poppins, sans-serif' }}>{(p.code || p.id || '-').replace(/\s+/g, ' ').trim()}</span>
          </div>
          <Badge bg={s.bg} color={s.color}>{s.label}</Badge>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button onClick={e => { e.stopPropagation(); setEditing(p); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = C.primary}
              onMouseLeave={e => e.currentTarget.style.color = C.text3}>
              <Pencil size={11} />
            </button>
            <button onClick={e => { e.stopPropagation(); setDeleting(p); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = C.red}
              onMouseLeave={e => e.currentTarget.style.color = C.text3}>
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.35, marginBottom: 4, whiteSpace: 'normal', wordBreak: 'break-word' }}>
          <span style={{ color: C.text2 }}>Project Name : </span>
          <span style={{ fontWeight: 700 }}>{p.name || '-'}</span>
        </div>

        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.35, marginBottom: 5, whiteSpace: 'normal', wordBreak: 'break-word' }}>
          <span style={{ color: C.text2 }}>Client : </span>
          <span>{p.client || '-'}</span>
        </div>

        <div style={{ fontSize: 12, color: C.text2, marginBottom: 6, whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {fmtDate(p.startDate)} - {fmtDate(p.endDate)}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.text2, marginBottom: 4 }}>
            <span>% Progress</span>
            <span style={{ fontWeight: 700, color: prog >= 100 ? C.green : C.primary }}>{prog}%</span>
          </div>
          <ProgressBar value={prog} height={4} color={prog >= 100 ? C.green : p.color || C.primary} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
      {/* ── Main content panel ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', background: C.bg }}>
          <div style={{ width: '100%', minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '16px 14px 0' : '24px 32px 0' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {permissions.canViewPortfolioOverview && (
                  <button
                    onClick={() => setDashboardTab('overview')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 10,
                      border: dashboardTab === 'overview' ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                      background: dashboardTab === 'overview' ? C.primaryBg : C.white,
                      color: dashboardTab === 'overview' ? C.primary : C.text,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 12,
                      fontFamily: 'Poppins, sans-serif',
                    }}
                  >
                    Portfolio Overview
                  </button>
                )}
                <button
                  onClick={() => setDashboardTab('report')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 10,
                    border: dashboardTab === 'report' ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                    background: dashboardTab === 'report' ? C.primaryBg : C.white,
                    color: dashboardTab === 'report' ? C.primary : C.text,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 12,
                    fontFamily: 'Poppins, sans-serif',
                  }}
                >
                  Project Summary Report
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveProject(null);
                    window.dispatchEvent(new CustomEvent('app-home'));
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    background: C.white,
                    color: C.text,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 12,
                    fontFamily: 'Poppins, sans-serif',
                  }}
                ><Home size={14} /> Home</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {dashboardTab === 'overview' && (
                  <Btn variant="outline" onClick={async () => {
                    setSendingAll(true);
                    try {
                      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
                      if (sessionError) throw sessionError;
                      const accessToken = sessionData?.session?.access_token;
                      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

                      const res = await fetch('/api/send-task-reminders', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ force: true }),
                      });
                      const result = await res.json();
                      if (!res.ok) throw new Error(result?.error || 'Send email failed');
                      const sentCount = Array.isArray(result.results)
                        ? result.results.filter((r: any) => r.sentTo?.length).length
                        : 0;
                      toast.success(`Sent reminders for ${sentCount} project(s)`);
                    } catch (error) {
                      const msg = error instanceof Error ? error.message : 'Failed to send email reminders';
                      toast.error(msg);
                    }
                    setSendingAll(false);
                  }}
                  small style={{ padding: '8px 14px', height: 36, whiteSpace: 'nowrap' }} disabled={sendingAll}>
                    {sendingAll ? 'Sending…' : 'Send Email'}
                  </Btn>
                )}
                {profile?.role === 'admin' && dashboardTab === 'overview' && (
                  <Btn variant="outline" onClick={() => setShowEmailLogs(true)} small style={{ padding: '8px 14px', height: 36, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Mail size={13} /> Email Logs
                  </Btn>
                )}
                <Btn onClick={() => setShowAdd(true)} small style={{ padding: '8px 14px', height: 36, whiteSpace: 'nowrap' }}>
                  <Plus size={12} style={{ marginRight: 6 }} /> Add Project
                </Btn>
              </div>
            </div>
            {dashboardTab === 'overview' ? (
              selected ? (
                <ProjectSummaryPanel project={selected} onOpen={() => setActiveProject(selected)} onViewMilestones={() => { setActiveProject(selected); setTimeout(() => window.dispatchEvent(new CustomEvent('app-set-tab', { detail: { tab: 'ms' } })), 80); }} isMobile={isMobile} />
              ) : (
                <WelcomeSummary projects={allProjects} tasks={tasks} onOpen={setSelected} onEdit={setEditing} onDelete={setDeleting} isMobile={isMobile} />
              )
            ) : (
              <PortfolioReportSummary />
            )}
          </div>
      </div>

      {showAdd  && <ProjectModal onClose={() => setShowAdd(false)} />}
      {editing  && <ProjectModal project={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmModal
          message={`Delete "${deleting.name}" and all its data?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {showEmailLogs && <EmailLogsModal onClose={() => setShowEmailLogs(false)} />}
    </div>
  );
}

// ── Welcome / global summary ──────────────────────────────────────────────────
function WelcomeSummary({ projects, tasks, onOpen, onEdit, onDelete, isMobile }: { projects: Project[]; tasks: any[]; onOpen: (p: Project) => void; onEdit: (p: Project) => void; onDelete: (p: Project) => void; isMobile: boolean }) {
  const { masterCodes } = useStore();
  const [showHC, setShowHC] = useState(false);
  const [projectView, setProjectView] = useState<'card' | 'table'>('card');
  const projectStatusOptions = masterCodes
    .filter((code) => code.codeType === 'project_status' && code.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const statusCounts = projects.reduce<Record<string, number>>((acc, project) => {
    acc[project.status] = (acc[project.status] || 0) + 1;
    return acc;
  }, {});
  const statusCards = projectStatusOptions.length > 0
    ? projectStatusOptions.map((code) => ({
        label: code.label,
        value: statusCounts[code.codeValue] || 0,
        bg: code.bgColor || C.bg2,
        color: code.textColor || C.text,
        codeValue: code.codeValue,
        icon: '📌',
      }))
    : [
        { label: 'Planning', value: projects.filter(p => p.status === 'Planning').length, bg: C.amberBg, color: C.amber, codeValue: 'Planning', icon: '📌' },
        { label: 'Req & Design', value: projects.filter(p => p.status === 'Req & Design').length, bg: C.primaryBg, color: C.primary, codeValue: 'Req & Design', icon: '📌' },
        { label: 'Setup', value: projects.filter(p => p.status === 'Setup').length, bg: '#FED7AA', color: '#9A3412', codeValue: 'Setup', icon: '📌' },
        { label: 'Testing', value: projects.filter(p => p.status === 'Testing').length, bg: '#E9D5FF', color: '#6B21A8', codeValue: 'Testing', icon: '📌' },
        { label: 'Go Live', value: projects.filter(p => p.status === 'Go Live').length, bg: C.greenBg, color: C.green, codeValue: 'Go Live', icon: '📌' },
        { label: 'Hyper Care', value: projects.filter(p => p.status === 'Hyper Care').length, bg: C.amberBg, color: C.amber, codeValue: 'Hyper Care', icon: '📌' },
      ];
  const normalProjects = projects.filter((p) => {
    const status = projectStatusOptions.find((code) => code.codeValue === p.status);
    return status ? status.label !== 'Hyper Care' : p.status !== 'Hyper Care';
  }).sort((a, b) => new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime());
  const hypercareProjects = projects.filter((p) => {
    const status = projectStatusOptions.find((code) => code.codeValue === p.status);
    return status ? status.label === 'Hyper Care' : p.status === 'Hyper Care';
  }).sort((a, b) => new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime());

  const renderOverviewProjectCard = (p: Project, fallbackColor = C.primary) => {
    const roots = tasks.filter(t => t.projectId === p.id && !t.parentId);
    const prog  = roots.length ? Math.round(roots.reduce((s: number, t: any) => s + t.percentComplete, 0) / roots.length) : 0;
    const statusCode = masterCodes.find((code) => code.codeType === 'project_status' && code.active && code.codeValue === p.status);
    const s     = statusCode ? { bg: statusCode.bgColor, color: statusCode.textColor, label: statusCode.label } : { bg: C.bg2, color: C.text, label: p.status || 'Unknown' };

    return (
      <div key={p.id}
        onClick={() => onOpen(p)}
        style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s', borderLeft: `4px solid ${p.color || fallbackColor}` }}
        onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFF'; }}
        onMouseLeave={e => { e.currentTarget.style.background = C.white; }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.35, whiteSpace: 'normal', wordBreak: 'break-word' }}>
            <span style={{ color: C.text2 }}>Project ID : </span>
            <span style={{ color: C.primary, fontFamily: 'Poppins, sans-serif' }}>{(p.code || p.id || '-').replace(/\s+/g, ' ').trim()}</span>
          </div>
          <Badge bg={s.bg} color={s.color}>{s.label}</Badge>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(p); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, display: 'flex', alignItems: 'center' }}
              title="Edit Project"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C.primary; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C.text3; }}>
              <Pencil size={12} />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(p); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, display: 'flex', alignItems: 'center' }}
              title="Delete Project"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C.red; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C.text3; }}>
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.35, marginBottom: 4, whiteSpace: 'normal', wordBreak: 'break-word' }}>
          <span style={{ color: C.text2 }}>Project Name : </span>
          <span style={{ fontWeight: 700 }}>{p.name || '-'}</span>
        </div>

        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.35, marginBottom: 5, whiteSpace: 'normal', wordBreak: 'break-word' }}>
          <span style={{ color: C.text2 }}>Client : </span>
          <span>{p.client || '-'}</span>
        </div>

        <div style={{ fontSize: 12, color: C.text2, marginBottom: 6, whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {fmtDate(p.startDate)} - {fmtDate(p.endDate)}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.text2, marginBottom: 4 }}>
            <span>% Progress</span>
            <span style={{ fontWeight: 700, color: prog >= 100 ? C.green : C.primary }}>{prog}%</span>
          </div>
          <ProgressBar value={prog} height={4} color={prog >= 100 ? C.green : p.color || fallbackColor} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: isMobile ? '18px 14px' : '28px 32px', width: '100%' }}>
      <h2 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 800, color: C.text, marginBottom: 6 }}>Portfolio Overview</h2>
      <p style={{ color: C.text2, fontSize: 13, marginBottom: 24 }}>Select a project from the list below to view its executive summary.</p>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(6, minmax(0, 1fr))', gap: 14, marginBottom: 28 }}>
        {statusCards.map((s) => (
          <Card key={s.label} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{s.icon}</div>
            <div><div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.text2 }}>{s.label}</div></div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {(['card', 'table'] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setProjectView(mode)}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: `1px solid ${projectView === mode ? C.primary : C.border}`,
                background: projectView === mode ? C.primaryBg : C.white,
                color: projectView === mode ? C.primary : C.text,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
              }}>
              {mode === 'card' ? 'Card' : 'Table'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.text2 }}>{normalProjects.length} projects</div>
      </div>

      {projectView === 'card' ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px,1fr))', gap: 14 }}>
          {normalProjects.map(p => renderOverviewProjectCard(p, C.primary))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Project ID', 'Project Name', 'Customer', 'Start Date', 'End Date', 'Stage', '% Progress'].map((label) => (
                  <th key={label} style={{ textAlign: 'left', padding: '12px 14px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.text2 }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalProjects.map((p) => {
                const roots = tasks.filter((t) => t.projectId === p.id && !t.parentId);
                const prog = roots.length ? Math.round(roots.reduce((s: number, t: any) => s + t.percentComplete, 0) / roots.length) : 0;
                const statusCode = masterCodes.find((code) => code.codeType === 'project_status' && code.active && code.codeValue === p.status);
                const stage = statusCode?.label ?? p.status;
                return (
                  <tr key={p.id} onClick={() => onOpen(p)} style={{ cursor: 'pointer', background: C.white, transition: 'background 0.15s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#F8FAFF'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: C.primary, fontWeight: 700 }}>{(p.code || p.id || '-').replace(/\s+/g, ' ').trim()}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: C.text }}>{p.name || '-'}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2 }}>{p.client || '-'}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2 }}>{fmtDate(p.startDate)}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2 }}>{fmtDate(p.endDate)}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: C.text }}>{stage}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: C.text }}>{prog}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Hypercare section — collapsible, hidden by default */}
      {hypercareProjects.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowHC(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: C.amberBg, border: `1px solid ${C.amber}33`, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.amber, fontFamily: 'Poppins, sans-serif', transition: 'all 0.15s', width: '100%' }}>
            {showHC ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            🛡️ Hyper Care Projects ({hypercareProjects.length})
          </button>
          {showHC && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px,1fr))', gap: 14, marginTop: 12 }}>
              {hypercareProjects.map(p => renderOverviewProjectCard(p, C.amber))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Per-project summary panel ─────────────────────────────────────────────────
function ProjectSummaryPanel({ project, onOpen, onViewMilestones, isMobile }: { project: Project; onOpen: () => void; onViewMilestones: () => void; isMobile: boolean }) {
  const { tasks, milestones, members, efforts, changeRequests, issues, risks, masterCodes } = useStore();
  const permissions = useRolePermissions();
  const [showAllCompletedModal, setShowAllCompletedModal] = React.useState(false);
  const accomplishedListRef = React.useRef<HTMLDivElement | null>(null);
  const [accomplishedOverflow, setAccomplishedOverflow] = React.useState(false);
  const statusCode = masterCodes.find((code) => code.codeType === 'project_status' && code.active && code.codeValue === project.status);
  const s = statusCode ? { bg: statusCode.bgColor, color: statusCode.textColor, label: statusCode.label } : { bg: C.bg2, color: C.text, label: project.status || 'Unknown' };

  const pt = tasks.filter((t) => t.projectId === project.id);
  const ms = milestones.filter((m) => m.projectId === project.id);
  const ef = efforts.filter((e) => e.projectId === project.id);
  const crs = changeRequests.filter((c) => c.projectId === project.id);
  const iss = issues.filter((i) => i.projectId === project.id);
  const rks = risks.filter((r) => r.projectId === project.id);

  const roots = pt.filter((t) => !t.parentId);
  const rootTasksSorted = [...roots].sort((a, b) => compareWbs(a.wbs, b.wbs));
  const prog = roots.length ? Math.round(roots.reduce((sum, t) => sum + t.percentComplete, 0) / roots.length) : 0;
  const doneTasks = pt.filter((t) => t.percentComplete === 100).length;
  const totalTasks = pt.length;

  const totalContract = ms.reduce((sum, m) => sum + (m.amount || 0), 0);
  const billedAmt = ms.filter((m) => String(m.status).toLowerCase() === 'billed').reduce((sum, m) => sum + (m.amount || 0), 0);
  const paidAmt = ms.filter((m) => String(m.status).toLowerCase() === 'paid').reduce((sum, m) => sum + (m.amount || 0), 0);
  const outstandingAmt = Math.max(totalContract - paidAmt, 0);
  const payPct = totalContract > 0 ? Math.round((paidAmt / totalContract) * 100) : 0;
  const visibleTotalContract = permissions.getMaskedAmount(totalContract);
  const visibleBilledAmt = permissions.getMaskedAmount(billedAmt);
  const visiblePaidAmt = permissions.getMaskedAmount(paidAmt);
  const visibleOutstandingAmt = permissions.maskFinancialAmounts ? 0 : outstandingAmt;
  const visiblePayPct = permissions.maskFinancialAmounts ? 0 : payPct;

  const tBudMD = ef.reduce((sum, e) => sum + (e.budgetManday || 0), 0);
  const tUsedMD = ef.reduce((sum, e) => sum + Object.values(e.monthly || {}).reduce((acc, v) => acc + Number(v || 0), 0), 0);

  const openIssues = iss.filter((i) => i.status === 'Open' || i.status === 'In Progress').length;
  const openRisks = rks.filter((r) => r.status === 'Monitoring' || r.status === 'Mitigating').length;
  const pendingCRs = crs.filter((c) => c.status === 'Submitted' || c.status === 'Under Review');
  const openCRs = pendingCRs.length;

  const currentDate = new Date();
  const todayIso = currentDate.toISOString().slice(0, 10);

  const upcomingMilestones = ms
    .filter((m) => {
      const due = parseISO(m.dueDate || '');
      if (!isValid(due)) return false;
      const inWindow = due <= addDays(currentDate, 30);
      const isDelayed = due < currentDate && String(m.status).toLowerCase() !== 'paid';
      return inWindow || isDelayed;
    })
    .sort((a, b) => Number(parseISO(a.dueDate || '')) - Number(parseISO(b.dueDate || '')))
    .slice(0, 4);

  const todayBaseline = computeBaselineProgress(pt, [todayIso]);
  const plannedPercent = todayBaseline[0]?.baselinePercent ?? 0;
  const scheduleGap = plannedPercent - prog;
  const scheduleStatus = !todayBaseline.length ? 'Plan N/A'
    : scheduleGap > 20 ? 'Stoper'
    : scheduleGap > 3 ? 'Delay'
    : 'On Track';
  const scheduleColor = scheduleStatus === 'Stoper' ? C.red : scheduleStatus === 'Delay' ? C.amber : C.green;
  const scheduleDetail = `Plan ${plannedPercent}% · Actual ${prog}%`;
  const healthLabel = scheduleStatus;
  const healthValue = `${prog}%`;
  const healthSubtitle = `Plan ${plannedPercent}% by today`;

  const stageTasks = rootTasksSorted.map((t) => ({
    id: t.id,
    name: `${t.wbs || '-'} ${t.taskName}`.trim(),
    progress: Math.round(Number(t.percentComplete || 0)),
  }));

  const accomplishedTasks = pt
    .filter((t) => Number(t.percentComplete || 0) >= 100)
    .sort((a, b) => compareWbs(a.wbs || '', b.wbs || ''))
    .map((t) => ({
      id: t.id,
      wbs: t.wbs || '-',
      taskName: t.taskName || '-',
      completedDate: t.actualFinish || '',
      resource: t.resource || '-',
    }));

  const today = parseISO(todayIso);

  const inProgressTasks = pt
    .filter((t) => String(t.status || '') === 'In Progress' && Number(t.percentComplete || 0) < 100)
    .sort((a, b) => compareWbs(a.wbs || '', b.wbs || ''));

  const upcomingTasks = pt
    .filter((t) => {
      if (String(t.status || '') !== 'Todo') return false;
      const start = parseISO(t.startDate || '');
      return isValid(start) && start >= today;
    })
    .sort((a, b) => {
      const as = parseISO(a.startDate || '');
      const bs = parseISO(b.startDate || '');
      if (isValid(as) && isValid(bs) && Number(as) !== Number(bs)) return Number(as) - Number(bs);
      return compareWbs(a.wbs || '', b.wbs || '');
    });

  const overdueTasks = pt
    .filter((t) => {
      if (String(t.status || '') === 'Done') return false;
      const due = parseISO(t.endDate || '');
      return isValid(due) && due < today;
    })
    .sort((a, b) => {
      const ad = parseISO(a.endDate || '');
      const bd = parseISO(b.endDate || '');
      if (isValid(ad) && isValid(bd) && Number(ad) !== Number(bd)) return Number(ad) - Number(bd);
      return compareWbs(a.wbs || '', b.wbs || '');
    });

  React.useEffect(() => {
    const checkOverflow = () => {
      const el = accomplishedListRef.current;
      if (!el) {
        setAccomplishedOverflow(false);
        return;
      }
      setAccomplishedOverflow(el.scrollHeight > el.clientHeight + 1);
    };
    const raf = window.requestAnimationFrame(checkOverflow);
    window.addEventListener('resize', checkOverflow);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', checkOverflow);
    };
  }, [accomplishedTasks.length, isMobile, stageTasks.length]);

  const milestoneStatusCards = upcomingMilestones.map((m) => {
    const due = parseISO(m.dueDate || '');
    const isDelayed = isValid(due) && due < currentDate && String(m.status).toLowerCase() !== 'paid';
    return {
      ...m,
      isDelayed,
    };
  });

  const overviewText = todayBaseline.length
    ? `โครงการอยู่ในสถานะ ${s.label} มีความคืบหน้า ${prog}% และอยู่ในระดับ ${scheduleStatus.toLowerCase()} เมื่อเทียบกับแผนงาน. มี ${openIssues} issue, ${openRisks} risk และ ${openCRs} CR ที่ต้องติดตาม.`
    : `โครงการอยู่ในสถานะ ${s.label} มีความคืบหน้าปัจจุบัน ${prog}% และมี ${openIssues} issue, ${openRisks} risk, ${openCRs} CR ที่ต้องติดตาม.`;

  const statusCard = ({ title, value, subtitle, color, bg }: any) => (
    <Card style={{ padding: '14px 16px', minHeight: 110, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 11, color: C.text2, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      </div>
      <div style={{ fontSize: 10, color: C.text2, marginTop: 8 }}>{subtitle}</div>
    </Card>
  );

  return (
    <div style={{ padding: isMobile ? '16px 14px' : '24px 28px', width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: C.text, marginBottom: 4 }}>Executive Project Dashboard Summary</div>
          <div style={{ fontSize: 12, color: C.text2 }}>HR Solution Implementation · Steering Committee View</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Badge bg={scheduleStatus === 'Stoper' ? C.redBg : scheduleStatus === 'Delay' ? C.amberBg : C.greenBg} color={scheduleColor}>Project Health : {scheduleStatus}</Badge>
          <span style={{ fontSize: 11, color: C.text2, padding: '8px 12px', borderRadius: 999, background: C.bg }}>Last Updated: {fmtDate(currentDate.toISOString().slice(0, 10))}</span>
          <Btn small onClick={onOpen} style={{ padding: '8px 10px', minWidth: 0, width: 'auto' }}><Eye size={14} />Open Project</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 18 }}>
        <Card style={{ padding: '14px 16px', minHeight: 120 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Executive Summary</div>
              <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.45, marginTop: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{overviewText}</div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(6, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { title: 'Overall Progress', value: `${prog}%`, detail: `${doneTasks}/${totalTasks} completed`, color: C.primary, bg: C.primaryBg },
          { title: 'Schedule Status', value: `${plannedPercent}%`, detail: scheduleDetail, color: scheduleColor, bg: scheduleStatus === 'Stoper' ? C.redBg : scheduleStatus === 'Delay' ? C.amberBg : C.greenBg },
          { title: 'Project Health', value: healthValue, detail: healthSubtitle, color: scheduleColor, bg: scheduleStatus === 'Stoper' ? C.redBg : scheduleStatus === 'Delay' ? C.amberBg : C.greenBg },
          { title: 'Payment Collected', value: `฿${fmtMoney(visiblePaidAmt)}`, detail: `Outstanding ฿${fmtMoney(visibleOutstandingAmt)}`, color: C.green, bg: C.greenBg },
          { title: 'Resource Usage', value: `${tUsedMD}/${tBudMD}`, detail: 'Mandays used / budget', color: C.amber, bg: C.amberBg },
          { title: 'Risks / Issues', value: `${openRisks}/${openIssues}`, detail: `${openRisks} open risks`, color: openRisks ? C.red : C.green, bg: openRisks ? C.redBg : C.greenBg },
        ].map((item) => (
          <Card key={item.title} style={{ padding: '14px 14px', minHeight: 106 }}>
            <div style={{ fontSize: 11, color: C.text2, marginBottom: 6 }}>{item.title}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.value}</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 8 }}>{item.detail}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 18 }}>
        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Progress by Main Task</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>Show main task completion sorted by WBS</div>
            </div>
            <button type="button" onClick={onOpen} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>View Task Detail</button>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {stageTasks.map((stage) => (
              <div key={stage.id} style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.text2 }}>
                  <span>{stage.name}</span>
                  <span style={{ fontWeight: 700, color: C.text }}>{stage.progress}%</span>
                </div>
                <ProgressBar value={stage.progress} height={8} color={stage.progress >= 100 ? C.green : C.primary} />
              </div>
            ))}
            {!stageTasks.length && <div style={{ fontSize: 12, color: C.text3 }}>No main tasks found.</div>}
          </div>
        </Card>

        <Card style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Accomplished Task</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>Completed tasks sorted by WBS</div>
            </div>
            {!!accomplishedTasks.length && <span style={{ fontSize: 11, color: C.text2 }}>{accomplishedTasks.length} tasks</span>}
          </div>
          <div
            ref={accomplishedListRef}
            style={{
              display: 'grid',
              gap: 8,
              overflow: 'hidden',
              maxHeight: isMobile ? 220 : 290,
              flex: 1,
            }}
          >
            {accomplishedTasks.map((task) => (
              <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: C.bg }}>
                <div style={{ minWidth: 0, fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${task.wbs} ${task.taskName}`}>
                  {task.wbs} {task.taskName}
                </div>
                <div style={{ fontSize: 11, color: C.text2, whiteSpace: 'nowrap' }}>{task.completedDate ? fmtDate(task.completedDate) : '-'}</div>
              </div>
            ))}
            {!accomplishedTasks.length && <div style={{ fontSize: 12, color: C.text3 }}>No accomplished tasks found.</div>}
          </div>
          {accomplishedOverflow && (
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowAllCompletedModal(true)}
                style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >
                View all tasks
              </button>
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Upcoming Milestones</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>Delayed or due within 30 days</div>
            </div>
            <button type="button" onClick={onViewMilestones} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>View All Milestones</button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {milestoneStatusCards.map((m) => (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '12px 14px', borderRadius: 12, background: C.bg }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>{m.phase || 'No phase'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>฿{fmtMoney(permissions.getMaskedAmount(m.amount || 0))}</div>
                  <div style={{ fontSize: 11, color: m.isDelayed ? C.red : C.text2, marginTop: 4 }}>{m.dueDate ? fmtDate(m.dueDate) : 'TBD'}</div>
                  {(() => {
                    const ss = MILESTONE_STATUS[String(m.status || '').toLowerCase()] ?? MILESTONE_STATUS.pending;
                    return (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, background: ss.bg, color: ss.color, fontSize: 10, fontWeight: 700 }}>{ss.label}</div>
                        {m.isDelayed && <div style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, background: C.redBg, color: C.red, fontSize: 9, fontWeight: 700 }}>Delayed</div>}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
            {!milestoneStatusCards.length && <div style={{ fontSize: 11, color: C.text3 }}>No upcoming milestones within 30 days</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
            <div style={{ background: C.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.text2 }}>CONTRACT</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>฿{fmtMoney(visibleTotalContract)}</div>
            </div>
            <div style={{ background: C.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.text2 }}>BILLED</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>฿{fmtMoney(visibleBilledAmt)}</div>
            </div>
            <div style={{ background: C.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.text2 }}>COLLECTED</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>฿{fmtMoney(visiblePaidAmt)}</div>
            </div>
            <div style={{ background: C.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.text2 }}>NEXT BILLING</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>฿{fmtMoney(permissions.getMaskedAmount(upcomingMilestones[0]?.amount || 0))}</div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Upcoming Activities</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>งานที่กำลังดำเนินการ งานถัดไป และงานที่เลยกำหนด</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.bg }}>
              <div style={{ fontSize: 11, color: C.text2, marginBottom: 8 }}>IN PROGRESS TASKS</div>
              {inProgressTasks.slice(0, 4).map((task) => (
                <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: C.text }}>{`${task.wbs || '-'} ${task.taskName}`}</span>
                  <span style={{ fontSize: 10, color: C.text2, whiteSpace: 'nowrap' }}>{task.endDate ? fmtDate(task.endDate) : '-'}</span>
                </div>
              ))}
              {!inProgressTasks.length && <div style={{ fontSize: 11, color: C.text3 }}>No in-progress tasks</div>}
              {inProgressTasks.length > 4 && <div style={{ fontSize: 10, color: C.text3, marginTop: 8 }}>+{inProgressTasks.length - 4} more</div>}
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.bg }}>
              <div style={{ fontSize: 11, color: C.text2, marginBottom: 8 }}>UPCOMING TASKS</div>
              {upcomingTasks.slice(0, 4).map((task) => (
                <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: C.text }}>{`${task.wbs || '-'} ${task.taskName}`}</span>
                  <span style={{ fontSize: 10, color: C.text2, whiteSpace: 'nowrap' }}>{task.startDate ? fmtDate(task.startDate) : '-'}</span>
                </div>
              ))}
              {!upcomingTasks.length && <div style={{ fontSize: 11, color: C.text3 }}>No upcoming tasks</div>}
              {upcomingTasks.length > 4 && <div style={{ fontSize: 10, color: C.text3, marginTop: 8 }}>+{upcomingTasks.length - 4} more</div>}
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.bg }}>
              <div style={{ fontSize: 11, color: C.text2, marginBottom: 8 }}>OVERDUE TASKS</div>
              {overdueTasks.slice(0, 4).map((task) => (
                <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: C.text }}>{`${task.wbs || '-'} ${task.taskName}`}</span>
                  <span style={{ fontSize: 10, color: C.red, whiteSpace: 'nowrap' }}>{task.endDate ? fmtDate(task.endDate) : '-'}</span>
                </div>
              ))}
              {!overdueTasks.length && <div style={{ fontSize: 11, color: C.text3 }}>No overdue tasks</div>}
              {overdueTasks.length > 4 && <div style={{ fontSize: 10, color: C.text3, marginTop: 8 }}>+{overdueTasks.length - 4} more</div>}
            </div>
          </div>
        </Card>
      </div>

      {showAllCompletedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: C.white, borderRadius: 14, width: '100%', maxWidth: 920, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: C.shadow }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Accomplished Task (All)</div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>เสร็จแล้วทั้งหมด {accomplishedTasks.length} รายการ</div>
              </div>
              <button onClick={() => setShowAllCompletedModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text2, fontSize: 20, lineHeight: 1, padding: 2 }}>×</button>
            </div>

            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.bg, position: 'sticky', top: 0, zIndex: 1 }}>
                    {['WBS', 'Task Name', 'Completed Date', 'Owner/Resource'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: C.text2, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accomplishedTasks.map((task) => (
                    <tr key={task.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '9px 12px', color: C.primary, fontWeight: 700, whiteSpace: 'nowrap' }}>{task.wbs}</td>
                      <td style={{ padding: '9px 12px', color: C.text }}>{task.taskName}</td>
                      <td style={{ padding: '9px 12px', color: C.text2, whiteSpace: 'nowrap' }}>{task.completedDate ? fmtDate(task.completedDate) : '-'}</td>
                      <td style={{ padding: '9px 12px', color: C.text2 }}>{task.resource || '-'}</td>
                    </tr>
                  ))}
                  {!accomplishedTasks.length && (
                    <tr>
                      <td colSpan={4} style={{ padding: '24px 12px', color: C.text3, textAlign: 'center' }}>No accomplished tasks found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setShowAllCompletedModal(false)}>Close</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Email Logs Modal ──────────────────────────────────────────────────────────
type EmailLog = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  project_code: string | null;
  type: 'auto' | 'manual';
  scheduled_time: string | null;
  sent_at: string | null;
  status: 'sent' | 'skipped' | 'failed';
  recipient: string | null;
  tasks_count: number;
  error_message: string | null;
  created_at: string;
};

function EmailLogsModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = React.useState<EmailLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filterProject, setFilterProject] = React.useState('');

  React.useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        const headers: Record<string, string> = {};
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const res = await fetch('/api/email-reminder-logs?limit=200', { headers });
        const result = await res.json();
        if (!res.ok) throw new Error(result?.error || 'Failed to load logs');
        setLogs(result.logs || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
      setLoading(false);
    };
    loadLogs();
  }, []);

  const filteredLogs = filterProject
    ? logs.filter((l) =>
        (l.project_name || '').toLowerCase().includes(filterProject.toLowerCase()) ||
        (l.project_code || '').toLowerCase().includes(filterProject.toLowerCase())
      )
    : logs;

  const statusColor = (s: string) => {
    if (s === 'sent') return C.green;
    if (s === 'failed') return C.red;
    return C.text3;
  };
  const statusBg = (s: string) => {
    if (s === 'sent') return C.greenBg;
    if (s === 'failed') return '#FEE2E2';
    return C.bg2;
  };

  const fmtTime = (iso: string | null) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 14, width: '100%', maxWidth: 960, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: C.shadow }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail size={16} color={C.primary} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: 'Poppins, sans-serif' }}>Email Send Logs</span>
            <span style={{ fontSize: 12, color: C.text2 }}>({filteredLogs.length} records)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text"
              placeholder="Filter by project..."
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, outline: 'none', width: 180 }}
            />
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text2, fontSize: 20, lineHeight: 1, padding: 2 }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: 40, textAlign: 'center', color: C.text2, fontSize: 13 }}>Loading…</div>
          )}
          {!loading && error && (
            <div style={{ padding: 40, textAlign: 'center', color: C.red, fontSize: 13 }}>{error}</div>
          )}
          {!loading && !error && filteredLogs.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: C.text2, fontSize: 13 }}>No logs found.</div>
          )}
          {!loading && !error && filteredLogs.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.bg, position: 'sticky', top: 0, zIndex: 1 }}>
                  {['Project ID', 'Project Name', 'Type', 'Scheduled', 'Sent At', 'Recipient', 'Tasks', 'Status', 'Error'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: C.text2, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#F8FAFF'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}>
                    <td style={{ padding: '9px 12px', color: C.primary, fontWeight: 700, fontFamily: 'Poppins, sans-serif', whiteSpace: 'nowrap' }}>{log.project_code || '-'}</td>
                    <td style={{ padding: '9px 12px', color: C.text, maxWidth: 200 }}>{log.project_name || '-'}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ background: log.type === 'manual' ? C.primaryBg : C.bg2, color: log.type === 'manual' ? C.primary : C.text2, borderRadius: 6, padding: '2px 7px', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                        {log.type === 'manual' ? 'Manual' : 'Auto'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', color: C.text2, whiteSpace: 'nowrap' }}>{log.scheduled_time || '-'}</td>
                    <td style={{ padding: '9px 12px', color: C.text2, whiteSpace: 'nowrap' }}>{fmtTime(log.sent_at)}</td>
                    <td style={{ padding: '9px 12px', color: C.text, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.recipient || '-'}</td>
                    <td style={{ padding: '9px 12px', color: C.text, textAlign: 'center' }}>{log.tasks_count}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ background: statusBg(log.status), color: statusColor(log.status), borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
                        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', color: C.red, fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.error_message || ''}>{log.error_message || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
