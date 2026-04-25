import React, { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, Menu, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { Card, Btn, Badge, ProgressBar, ConfirmModal, C, PROJECT_STATUS, MILESTONE_STATUS, TH, TD } from '../Common';
import { fmtDate, fmtMoney, compareWbs } from '../../utils';
import type { Project } from '../../types';
import ProjectModal from './ProjectModal';
import PortfolioReportSummary from './PortfolioReportSummary';

const STATUS_ORDER = ['Planning', 'Req & Design', 'Setup', 'Testing', 'Go Live', 'Hyper Care'];

export default function Dashboard() {
  const { projects, tasks, milestones, issues, risks, changeRequests, setActiveProject, deleteProject, fetchTasks, fetchIssues, fetchRisks, fetchCRs, fetchMembers, fetchMilestones, fetchEfforts } = useStore();
  const [editing,    setEditing]    = useState<Project | null>(null);
  const [deleting,   setDeleting]   = useState<Project | null>(null);
  const [selected,   setSelected]   = useState<Project | null>(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showHypercare, setShowHypercare] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'report'>('overview');
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [notificationsShown, setNotificationsShown] = useState(false);
  const isMobile = windowWidth < 768;

  React.useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    };

    const overdueTasks = tasks.filter((t) => {
      const due = parseDate(t.endDate);
      return due && t.percentComplete < 100 && due < now;
    });
    const upcomingTasks = tasks.filter((t) => {
      const due = parseDate(t.endDate);
      return due && t.percentComplete < 100 && due >= now && due <= endIn7;
    });
    const billingWarnings = milestones.filter((m) => {
      const bill = parseDate(m.billingDate);
      return bill && m.status !== 'billed' && m.status !== 'paid' && bill <= dueIn10;
    });

    const messages: string[] = [];
    if (overdueTasks.length) messages.push(`มี ${overdueTasks.length} แผนงานเกินกำหนดที่ยังไม่เสร็จ`);
    if (upcomingTasks.length) messages.push(`มี ${upcomingTasks.length} แผนงานที่ใกล้ครบใน 7 วัน`);
    if (billingWarnings.length) messages.push(`มี ${billingWarnings.length} milestone ที่ยังไม่ billing ในอีก 10 วัน`);

    if (messages.length > 0) {
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
    }
    setNotificationsShown(true);
  }, [tasks, milestones, notificationsShown]);

  // Fetch data when project selected
  React.useEffect(() => {
    if (selected?.id) {
      fetchTasks(selected.id);
      fetchMembers(selected.id);
      fetchIssues(selected.id);
      fetchRisks(selected.id);
      fetchCRs(selected.id);
      fetchMilestones(selected.id);
      fetchEfforts(selected.id);
    }
  }, [selected?.id, fetchTasks, fetchMembers, fetchIssues, fetchRisks, fetchCRs, fetchMilestones, fetchEfforts]);

  // Separate normal projects from Hypercare
  const normalProjects = projects.filter(p => p.status !== 'Hyper Care').sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const hypercareProjects = projects.filter(p => p.status === 'Hyper Care').sort((a, b) => a.name.localeCompare(b.name));
  const allProjects = projects.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

  const getProgress = (pid: string) => {
    const roots = tasks.filter(t => t.projectId === pid && !t.parentId);
    return roots.length ? Math.round(roots.reduce((s, t) => s + t.percentComplete, 0) / roots.length) : 0;
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await deleteProject(deleting.id); if (selected?.id === deleting.id) setSelected(null); toast.success('Project deleted'); }
    catch { toast.error('Failed to delete'); }
    setDeleting(null);
  };

  const renderProjectCard = (p: Project, compact = false) => {
    const s    = PROJECT_STATUS[p.status] ?? PROJECT_STATUS['Planning'];
    const prog = getProgress(p.id);
    const isSel = selected?.id === p.id;
    return (
      <div key={p.id}
        onClick={() => setSelected(p)}
        style={{ background: isSel ? C.primaryBg : C.white, borderRadius: 10, border: `1px solid ${isSel ? C.primary : C.border}`, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s', marginBottom: 8, borderLeft: `4px solid ${p.color || C.primary}` }}
        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#F8FAFF'; }}
        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = C.white; }}>
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
      {/* Mobile hamburger menu */}
      {isMobile && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', background: C.primary, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 4, display: 'flex', alignItems: 'center' }}>
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginLeft: 8 }}>Projects</span>
        </div>
      )}

      {/* ── Left panel: project list ─────────────────────────────────────── */}
      {sidebarOpen && (
        <div style={{ width: isMobile ? '100%' : 280, minWidth: isMobile ? 'auto' : 240, maxWidth: isMobile ? '100%' : 320, borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none', display: 'flex', flexDirection: 'column', background: C.bg, overflow: 'hidden', maxHeight: isMobile ? '50vh' : '100%' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Projects</div>
            <div style={{ fontSize: 10, color: C.text3, marginTop: 1 }}>{allProjects.length} projects</div>
          </div>
          <Btn onClick={() => setShowAdd(true)} small style={{ padding: '5px 10px' }}><Plus size={12} /></Btn>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 0' }}>
          {normalProjects.length === 0 && hypercareProjects.length === 0 && (
            <div style={{ padding: '30px 10px', textAlign: 'center', color: C.text3, fontSize: 12 }}>No projects yet</div>
          )}
          {normalProjects.map(p => renderProjectCard(p))}

          {/* Hypercare section — collapsible, hidden by default */}
          {hypercareProjects.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => setShowHypercare(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 10px', background: C.amberBg, border: `1px solid ${C.amber}33`, borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: C.amber, fontFamily: 'Poppins, sans-serif', transition: 'all 0.15s' }}>
                {showHypercare ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Hyper Care ({hypercareProjects.length})
              </button>
              {showHypercare && (
                <div style={{ marginTop: 6 }}>
                  {hypercareProjects.map(p => renderProjectCard(p))}
                </div>
              )}
            </div>
          )}
          <div style={{ height: 16 }} />
        </div>
      </div>
      )}

      {/* ── Right panel: summary or welcome ─────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', background: C.bg }}>
        {!selected ? (
          <div style={{ width: '100%', minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '16px 14px 0' : '24px 32px 0' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
              </div>
            </div>
            {dashboardTab === 'overview' ? (
              <WelcomeSummary projects={allProjects} tasks={tasks} onOpen={setActiveProject} isMobile={isMobile} />
            ) : (
              <PortfolioReportSummary />
            )}
          </div>
        ) : (
          <ProjectSummaryPanel
            project={selected}
            onOpen={() => setActiveProject(selected)}
            isMobile={isMobile}
          />
        )}
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
function WelcomeSummary({ projects, tasks, onOpen, isMobile }: { projects: Project[]; tasks: any[]; onOpen: (p: Project) => void; isMobile: boolean }) {
  const [showHC, setShowHC] = useState(false);
  const normalProjects = projects.filter(p => p.status !== 'Hyper Care');
  const hypercareProjects = projects.filter(p => p.status === 'Hyper Care');
  const planning   = projects.filter(p => p.status === 'Planning');
  const reqDesign  = projects.filter(p => p.status === 'Req & Design');
  const setup      = projects.filter(p => p.status === 'Setup');
  const testing    = projects.filter(p => p.status === 'Testing');
  const goLive     = projects.filter(p => p.status === 'Go Live');

  const renderOverviewProjectCard = (p: Project, fallbackColor = C.primary) => {
    const roots = tasks.filter(t => t.projectId === p.id && !t.parentId);
    const prog  = roots.length ? Math.round(roots.reduce((s: number, t: any) => s + t.percentComplete, 0) / roots.length) : 0;
    const s     = PROJECT_STATUS[p.status] ?? PROJECT_STATUS['Planning'];

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
      <p style={{ color: C.text2, fontSize: 13, marginBottom: 24 }}>Select a project on the left to view its executive summary.</p>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Planning',     value: planning.length,          color: C.amber,   bg: C.amberBg,   icon: '📋' },
          { label: 'Req & Design', value: reqDesign.length,         color: C.primary, bg: C.primaryBg, icon: '🚀' },
          { label: 'Setup',        value: setup.length,             color: '#9A3412', bg: '#FED7AA', icon: '🧩' },
          { label: 'Testing',      value: testing.length,           color: '#6B21A8', bg: '#E9D5FF', icon: '🧪' },
          { label: 'Go Live',      value: goLive.length,            color: C.green,   bg: C.greenBg,   icon: '✅' },
          { label: 'Hyper Care',   value: hypercareProjects.length, color: C.amber,   bg: C.amberBg,   icon: '🛡️' },
        ].map(s => (
          <Card key={s.label} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{s.icon}</div>
            <div><div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.text2 }}>{s.label}</div></div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px,1fr))', gap: 14 }}>
        {normalProjects.map(p => renderOverviewProjectCard(p, C.primary))}
      </div>

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
  const { tasks, milestones, members, efforts, changeRequests, issues, risks } = useStore();
  const s = PROJECT_STATUS[project.status] ?? PROJECT_STATUS['Planning'];

  const pt   = tasks.filter(t => t.projectId === project.id);
  const ms   = milestones.filter(m => m.projectId === project.id);   // may be empty if not fetched
  const ef   = efforts.filter(e => e.projectId === project.id);
  const crs  = changeRequests.filter(c => c.projectId === project.id);
  const iss  = issues.filter(i => i.projectId === project.id);
  const rks  = risks.filter(r => r.projectId === project.id);

  const roots   = pt.filter(t => !t.parentId);
  const rootTasksSorted = [...roots].sort((a, b) => compareWbs(a.wbs, b.wbs));
  const prog    = roots.length ? Math.round(roots.reduce((s, t) => s + t.percentComplete, 0) / roots.length) : 0;
  const doneTasks = pt.filter(t => t.percentComplete === 100).length;

  const totalContract = ms.reduce((s, m) => s + m.amount, 0);
  const paidAmt       = ms.filter(m => m.status === 'paid').reduce((s, m) => s + m.amount, 0);
  const payPct        = totalContract > 0 ? Math.round((paidAmt / totalContract) * 100) : 0;

  const milestonesByPhase = ms.reduce((acc, m) => {
    const phase = m.phase || 'Unspecified';
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(m);
    return acc;
  }, {} as Record<string, typeof ms>);
  const phaseOrder = Object.keys(milestonesByPhase).sort((a, b) => a.localeCompare(b));

  const tBudMD  = ef.reduce((s, e) => s + e.budgetManday, 0);
  const tUsedMD = ef.reduce((s, e) => s + Object.values(e.monthly || {}).reduce((a, v) => a + v, 0), 0);

  const openIssues = iss.filter(i => i.status === 'Open' || i.status === 'In Progress').length;
  const openRisks  = rks.filter(r => r.status === 'Monitoring' || r.status === 'Mitigating').length;
  const openCRs    = crs.filter(c => c.status === 'Submitted' || c.status === 'Under Review').length;

  const KPI = ({ label, value, sub, color, bg, icon }: any) => (
    <div style={{ background: bg, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.text, fontWeight: 600, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: C.text2, marginTop: 1 }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ padding: isMobile ? '18px 14px' : '24px 28px', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: isMobile ? 16 : 0, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 10, height: 48, borderRadius: 5, background: project.color || C.primary, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>{project.name}</h2>
              <Badge bg={s.bg} color={s.color}>{s.label}</Badge>
            </div>
            {!isMobile && (
              <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>{project.code} · {project.client}</div>
            )}
            <div style={{ fontSize: 11, color: C.text2, marginTop: isMobile ? 8 : 2 }}>{fmtDate(project.startDate)} – {fmtDate(project.endDate)}</div>
          </div>
        </div>
        <Btn onClick={onOpen} style={{ flexShrink: 0, marginTop: isMobile ? 10 : 0 }}>Open Project →</Btn>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Progress" value={`${prog}%`} sub={`${doneTasks}/${pt.length} tasks done`} color={C.primary} bg={C.primaryBg} icon="📋" />
        <KPI label="Payment" value={`${payPct}%`} sub={`฿${fmtMoney(paidAmt)} collected`} color={C.green} bg={C.greenBg} icon="💰" />
        <KPI label="Manday" value={`${tUsedMD}/${tBudMD}`} sub="MD used vs budget" color={C.amber} bg={C.amberBg} icon="⚡" />
        <KPI label="Open Issues" value={openIssues + openCRs} sub={`${openRisks} open risks`} color={openIssues + openCRs > 0 ? C.red : C.green} bg={openIssues + openCRs > 0 ? C.redBg : C.greenBg} icon="⚠️" />
      </div>

      {/* Progress bar */}
      <Card style={{ padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
          <span style={{ fontWeight: 600, color: C.text }}>Overall Progress</span>
          <span style={{ fontWeight: 700, color: prog >= 100 ? C.green : C.primary }}>{prog}%</span>
        </div>
        <ProgressBar value={prog} height={10} color={prog >= 100 ? C.green : project.color || C.primary} />
      </Card>

      {/* Task summary + Recent issues */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Root tasks */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, color: C.text }}>📋 Main Tasks ({rootTasksSorted.length})</div>
          <div>
            {rootTasksSorted.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', borderBottom: `1px solid ${C.border}`, gap: 10 }}>
                <div style={{ flex: 1, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.wbs} {t.taskName}</div>
                <div style={{ width: 60, flexShrink: 0 }}><ProgressBar value={t.percentComplete} height={4} /></div>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.percentComplete >= 100 ? C.green : C.primary, minWidth: 32, textAlign: 'right' }}>{t.percentComplete}%</span>
              </div>
            ))}
            {rootTasksSorted.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: C.text3 }}>No tasks yet</div>}
          </div>
        </Card>

        {/* Issues + CRs summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>🔴 Issues ({iss.length})</div>
            {iss.length === 0 && <div style={{ fontSize: 11, color: C.text3 }}>No issues logged</div>}
            {iss.slice(0, 3).map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{i.title}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: i.status === 'Resolved' ? C.green : i.status === 'Blocked' ? C.red : i.status === 'In Progress' ? C.blue : C.amber, marginLeft: 8, flexShrink: 0 }}>{i.status}</span>
              </div>
            ))}
          </Card>
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>📝 Change Requests ({crs.length})</div>
            {crs.length === 0 && <div style={{ fontSize: 11, color: C.text3 }}>No CRs logged</div>}
            {crs.slice(0, 3).map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.crId} {c.title}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: c.status === 'Implemented' ? C.green : c.status === 'Rejected' ? C.red : c.status === 'Under Review' ? C.blue : C.amber, marginLeft: 8, flexShrink: 0 }}>{c.status}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Milestones payment */}
      {ms.length > 0 && (
        <Card style={{ padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10 }}>🏁 Milestones</div>
          {phaseOrder.map(phase => (
            <div key={phase} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>{phase}</div>
              {isMobile ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                  {milestonesByPhase[phase].sort((a, b) => a.name.localeCompare(b.name)).map(m => {
                    const ss = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.pending;
                    return (
                      <div key={m.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px', minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                          <span style={{ background: ss.bg, color: ss.color, padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>{ss.label}</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.text2, marginBottom: 6, whiteSpace: 'nowrap' }}>฿{fmtMoney(m.amount)}</div>
                        {m.dueDate && <div style={{ fontSize: 11, color: C.text2 }}>{fmtDate(m.dueDate)}</div>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '30%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '20%' }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: C.bg }}>
                        {['Milestone', 'Amount', 'Due Date', 'Billing Date', 'Status'].map(h => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {milestonesByPhase[phase].sort((a, b) => a.name.localeCompare(b.name)).map((m, idx) => {
                        const ss = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.pending;
                        return (
                          <tr key={m.id} style={{ background: idx % 2 === 0 ? C.white : C.bg }}>
                            <td style={TD}>{m.name}</td>
                            <td style={TD}>฿{fmtMoney(m.amount)}</td>
                            <td style={TD}>{m.dueDate ? fmtDate(m.dueDate) : '—'}</td>
                            <td style={TD}>{m.billingDate ? fmtDate(m.billingDate) : '—'}</td>
                            <td style={TD}>
                              <span style={{ background: ss.bg, color: ss.color, padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>{ss.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
