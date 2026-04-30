import React, { useState } from 'react';
import { parseISO, isValid, addDays } from 'date-fns';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, Home } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { supabase } from '../../services/supabase';
import { Card, Btn, Badge, ProgressBar, ConfirmModal, C, MILESTONE_STATUS, TH, TD } from '../Common';
import { fmtDate, fmtMoney, compareWbs, computeBaselineProgress, getHalfMonthSnapshotDates } from '../../utils';
import type { Project } from '../../types';
import ProjectModal from './ProjectModal';
import PortfolioReportSummary from './PortfolioReportSummary';

const STATUS_ORDER = ['Planning', 'Req & Design', 'Setup', 'Testing', 'Go Live', 'Hyper Care'];

export default function Dashboard() {
  const { projects, tasks, milestones, issues, risks, changeRequests, activeProject, setActiveProject, deleteProject, fetchTasks, fetchIssues, fetchRisks, fetchCRs, fetchMembers, fetchMilestones, fetchEfforts, masterCodes } = useStore();
  const [selected,   setSelected]   = useState<Project | null>(null);
  const [editing,    setEditing]    = useState<Project | null>(null);
  const [deleting,   setDeleting]   = useState<Project | null>(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [showHypercare, setShowHypercare] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'report'>('overview');
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [notificationsShown, setNotificationsShown] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
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
    // Load all tasks once so progress % can show for all project cards in portfolio overview.
    fetchTasks();
    fetchMilestones();
  }, [fetchTasks, fetchMilestones]);
  
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
  }, [selected?.id, fetchTasks, fetchMembers, fetchIssues, fetchRisks, fetchCRs, fetchMilestones, fetchEfforts]);

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
                {['overview', 'report'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDashboardTab(tab as 'overview' | 'report')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 10,
                      border: dashboardTab === tab ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                      background: dashboardTab === tab ? C.primaryBg : C.white,
                      color: dashboardTab === tab ? C.primary : C.text,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 12,
                      fontFamily: 'Poppins, sans-serif',
                    }}
                  >
                    {tab === 'overview' ? 'Portfolio Overview' : 'Project Summary Report'}
                  </button>
                ))}
                {selected && (
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
                )}
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
                <Btn onClick={() => setShowAdd(true)} small style={{ padding: '8px 14px', height: 36, whiteSpace: 'nowrap' }}>
                  <Plus size={12} style={{ marginRight: 6 }} /> Add Project
                </Btn>
              </div>
            </div>
            {dashboardTab === 'overview' ? (
              selected ? (
                <ProjectSummaryPanel project={selected} onOpen={() => setActiveProject(selected)} isMobile={isMobile} />
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
  });
  const hypercareProjects = projects.filter((p) => {
    const status = projectStatusOptions.find((code) => code.codeValue === p.status);
    return status ? status.label === 'Hyper Care' : p.status === 'Hyper Care';
  });

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
function ProjectSummaryPanel({ project, onOpen, isMobile }: { project: Project; onOpen: () => void; isMobile: boolean }) {
  const { tasks, milestones, members, efforts, changeRequests, issues, risks, masterCodes } = useStore();
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

  const getStageLabel = (name: string) => {
    const lower = String(name || '').toLowerCase();
    const mapping = [
      { label: 'Project Initiation', keywords: ['initiation', 'kick-off', 'kick off', 'project prep'] },
      { label: 'Requirement & Gap Analysis', keywords: ['requirement', 'gap', 'analysis', 'gathering'] },
      { label: 'Business Blueprint', keywords: ['blueprint', 'business blueprint'] },
      { label: 'System Configuration', keywords: ['configuration', 'system config', 'environment', 'setup'] },
      { label: 'Data Migration', keywords: ['migration', 'data migration', 'data move'] },
      { label: 'UAT & Parallel Run', keywords: ['uat', 'parallel', 'parallel run', 'testing', 'defects'] },
      { label: 'Go-live & Hypercare', keywords: ['go-live', 'go live', 'hypercare', 'production', 'support'] },
    ];
    const found = mapping.find((item) => item.keywords.some((k) => lower.includes(k)));
    return found ? found.label : name || 'Main Task';
  };

  const normalizeText = (value: string) => String(value || '').trim();
  const normalizeKey = (value: string) => normalizeText(value).toLowerCase();

  const taskPhaseOptions = masterCodes
    .filter((code) => code.codeType === 'task_phase' && code.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((code) => ({ value: normalizeText(code.codeValue), label: normalizeText(code.label) }));

  const phaseLabelByValue = taskPhaseOptions.reduce<Record<string, string>>((acc, phase) => {
    acc[phase.value] = phase.label;
    return acc;
  }, {});

  const phaseLabelByText = taskPhaseOptions.reduce<Record<string, string>>((acc, phase) => {
    acc[normalizeKey(phase.label)] = phase.label;
    return acc;
  }, {});

  const phaseSortIndex = taskPhaseOptions.reduce<Record<string, number>>((acc, phase, index) => {
    acc[normalizeKey(phase.label)] = index;
    return acc;
  }, {});

  const phaseLabels = taskPhaseOptions.length > 0
    ? taskPhaseOptions.map((phase) => phase.label)
    : [
      'Project Initiation',
      'Requirement & Gap Analysis',
      'Business Blueprint',
      'System Configuration',
      'Data Migration',
      'UAT & Parallel Run',
      'Go-live & Hypercare',
    ];

  const resolvePhaseLabel = (phaseValue: string, taskName: string) => {
    const rawValue = normalizeText(phaseValue);
    if (!rawValue) return getStageLabel(taskName);

    const mappedByValue = phaseLabelByValue[rawValue];
    if (mappedByValue) return mappedByValue;

    const mappedByText = phaseLabelByText[normalizeKey(rawValue)];
    if (mappedByText) return mappedByText;

    const stageLabel = getStageLabel(taskName);
    const normalizedStageLabel = normalizeKey(stageLabel);
    if (phaseLabelByText[normalizedStageLabel]) return phaseLabelByText[normalizedStageLabel];

    return stageLabel;
  };

  const phaseProgress = rootTasksSorted.reduce<Record<string, { total: number; count: number }>>((acc, t) => {
    const phaseValue = normalizeText(t.phase || '');
    const label = resolvePhaseLabel(phaseValue, t.taskName);
    if (!acc[label]) acc[label] = { total: 0, count: 0 };
    acc[label].total += t.percentComplete;
    acc[label].count += 1;
    return acc;
  }, {});

  const stageTasks = Object.keys(phaseProgress)
    .map((label) => ({
      id: label,
      name: label,
      progress: Math.round(phaseProgress[label].total / phaseProgress[label].count),
    }))
    .sort((a, b) => {
      const aIndex = phaseSortIndex[normalizeKey(a.name)];
      const bIndex = phaseSortIndex[normalizeKey(b.name)];
      if (aIndex != null || bIndex != null) {
        if (aIndex == null) return 1;
        if (bIndex == null) return -1;
        return aIndex - bIndex;
      }
      return a.name.localeCompare(b.name);
    });

  const recentFinishedTasks = pt
    .filter((t) => t.actualFinish)
    .sort((a, b) => {
      const da = parseISO(a.actualFinish || '');
      const db = parseISO(b.actualFinish || '');
      if (!isValid(db) && !isValid(da)) return 0;
      if (!isValid(db)) return -1;
      if (!isValid(da)) return 1;
      return Number(db) - Number(da);
    })
    .slice(0, 3)
    .map((t) => ({
      title: t.taskName,
      subtitle: t.actualFinish ? `Finished ${fmtDate(t.actualFinish)}` : '',
      date: t.actualFinish,
    }));

  const actionItems = recentFinishedTasks.length
    ? recentFinishedTasks
    : [{ title: 'No recent completed tasks', subtitle: 'No finished tasks found', date: '' }];

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
          { title: 'Payment Collected', value: `฿${fmtMoney(paidAmt)}`, detail: `Outstanding ฿${fmtMoney(outstandingAmt)}`, color: C.green, bg: C.greenBg },
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

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.7fr 0.9fr', gap: 16, marginBottom: 18 }}>
        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Progress by Phase</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>Map main task to stage and show completion percent</div>
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
            {!stageTasks.length && <div style={{ fontSize: 12, color: C.text3 }}>No stage-level main tasks found.</div>}
          </div>
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Management Attention</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.bg }}>
              <div style={{ fontSize: 11, color: C.text2 }}>NEXT MILESTONE</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 6 }}>{upcomingMilestones[0]?.name || 'No milestone due soon'}</div>
              {upcomingMilestones[0] && <div style={{ fontSize: 11, color: C.text2, marginTop: 6 }}>{upcomingMilestones[0].dueDate ? fmtDate(upcomingMilestones[0].dueDate) : 'TBD'} · Amount ฿{fmtMoney(upcomingMilestones[0].amount)}</div>}
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.bg }}>
              <div style={{ fontSize: 11, color: C.text2 }}>NEXT ACTION</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 6 }}>{actionItems[0]?.title || 'No immediate action required'}</div>
              {actionItems[0]?.subtitle && <div style={{ fontSize: 11, color: C.text2, marginTop: 6 }}>{actionItems[0].subtitle}</div>}
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.bg }}>
              <div style={{ fontSize: 11, color: C.text2 }}>TOP RISKS</div>
              {rks.slice(0, 3).map((risk) => (
                <div key={risk.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: C.text }}>{risk.title || 'Risk item'}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.text2 }}>{risk.probability}</span>
                </div>
              ))}
              {!rks.length && <div style={{ fontSize: 11, color: C.text3, marginTop: 10 }}>No active risks</div>}
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.bg }}>
              <div style={{ fontSize: 11, color: C.text2 }}>DECISION REQUIRED</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 6 }}>Approve or confirm revised Phase timeline</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 6 }}>Required to keep Business Blueprint completion aligned with project plan.</div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.18fr 0.82fr', gap: 16, marginBottom: 20 }}>
        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Upcoming Milestones</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>Delayed or due within 30 days</div>
            </div>
            <button style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>View All Milestones</button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {milestoneStatusCards.map((m) => (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '12px 14px', borderRadius: 12, background: C.bg }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>{m.phase || 'No phase'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>฿{fmtMoney(m.amount)}</div>
                  <div style={{ fontSize: 11, color: m.isDelayed ? C.red : C.text2, marginTop: 4 }}>{m.dueDate ? fmtDate(m.dueDate) : 'TBD'}</div>
                  <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, background: m.isDelayed ? C.redBg : C.amberBg, color: m.isDelayed ? C.red : C.amber, fontSize: 10, fontWeight: 700 }}>{m.isDelayed ? 'Delayed' : 'Pending'}</div>
                </div>
              </div>
            ))}
            {!milestoneStatusCards.length && <div style={{ fontSize: 11, color: C.text3 }}>No upcoming milestones within 30 days</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
            <div style={{ background: C.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.text2 }}>CONTRACT</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>฿{fmtMoney(totalContract)}</div>
            </div>
            <div style={{ background: C.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.text2 }}>BILLED</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>฿{fmtMoney(billedAmt)}</div>
            </div>
            <div style={{ background: C.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.text2 }}>COLLECTED</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>฿{fmtMoney(paidAmt)}</div>
            </div>
            <div style={{ background: C.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.text2 }}>NEXT BILLING</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>฿{fmtMoney(upcomingMilestones[0]?.amount || 0)}</div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Action Items & Recent Updates</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>รายการที่ต้องติดตามล่าสุด</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {actionItems.map((item, index) => (
              <div key={`${item.title}-${index}`} style={{ display: 'grid', gap: 6, padding: '12px 14px', borderRadius: 12, background: C.bg }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{item.title}</div>
                <div style={{ fontSize: 11, color: C.text2 }}>{item.subtitle}</div>
                {item.date && <div style={{ fontSize: 10, color: C.text3 }}>{fmtDate(item.date)}</div>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
