import React from 'react';
import { parseISO, isValid } from 'date-fns';
import { useStore } from '../../store';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { C } from '../Common';
import SetupModal from '../Setup/SetupModal';
import TaskTemplateModal from '../Setup/TaskTemplateModal';
import { Bell, Home, LogOut, Moon, Sun, Copy } from 'lucide-react';

const F = 'Poppins, sans-serif';

export default function Navbar() {
  const { activeProject, setActiveProject, projects, tasks, milestones, fetchMasterCodes } = useStore();
  const { user, profile, signOut, configured } = useAuth();
  const { theme, toggle } = useTheme();
  const [isMobile, setIsMobile] = React.useState(false);
  const [notifyOpen, setNotifyOpen] = React.useState(false);
  const [setupOpen, setSetupOpen] = React.useState(false);
  const [taskTemplateOpen, setTaskTemplateOpen] = React.useState(false);
  const [setupLoading, setSetupLoading] = React.useState(false);
  const bellRef = React.useRef<HTMLDivElement | null>(null);
  const isDark = theme === 'dark';

  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!notifyOpen) return;
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setNotifyOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [notifyOpen]);

  const navBg = isDark ? '#1E293B' : C.white;
  const navBorder = isDark ? '#334155' : C.border;
  const textColor = isDark ? '#F1F5F9' : C.text;
  const textMuted = isDark ? '#94A3B8' : C.text3;
  const commitIdRaw = (import.meta as any).env?.VITE_COMMIT_ID || 'local';
  const commitId = String(commitIdRaw).slice(0, 8);

  const openSetup = async () => {
    setSetupLoading(true);
    try {
      await fetchMasterCodes();
      setSetupOpen(true);
    } catch {
      setSetupOpen(true);
    } finally {
      setSetupLoading(false);
    }
  };

  const parseDate = (value: string) => {
    if (!value) return null;
    const d = parseISO(value);
    return isValid(d) ? d : null;
  };

  const now = new Date();
  const endIn7 = new Date(now);
  endIn7.setDate(endIn7.getDate() + 7);
  const dueIn10 = new Date(now);
  dueIn10.setDate(dueIn10.getDate() + 10);

  const upcomingTasks = tasks
    .filter((t) => t.percentComplete < 100)
    .filter((t) => {
      const due = parseDate(t.endDate);
      return due && due >= now && due <= endIn7;
    })
    .map((t) => ({
      id: t.id,
      title: `Task : ${t.taskName}`,
      subtitle: `Due ${t.endDate}`,
      type: 'task',
      status: 'upcoming' as const,
    }));

  const overdueTasks = tasks
    .filter((t) => t.percentComplete < 100)
    .filter((t) => {
      const due = parseDate(t.endDate);
      return due && due < now;
    })
    .map((t) => ({
      id: t.id,
      title: `Task : ${t.taskName}`,
      subtitle: `Due ${t.endDate}`,
      type: 'task',
      status: 'overdue' as const,
    }));

  const milestoneNotifications = milestones
    .filter((m) => String(m.status).toLowerCase() === 'pending')
    .filter((m) => {
      const due = parseDate(m.dueDate);
      return due && due <= dueIn10;
    })
    .map((m) => {
      const due = parseDate(m.dueDate);
      const status = due && due < now ? 'overdue' as const : 'upcoming' as const;
      return {
        id: m.id,
        title: `Milestone : ${m.name}`,
        subtitle: m.billingDate
          ? `Billing ${m.billingDate}`
          : `Due ${m.dueDate}`,
        type: 'milestone',
        status,
      };
    });

  const notifications = [...overdueTasks, ...upcomingTasks, ...milestoneNotifications];

  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', height: 52, background: navBg,
      borderBottom: `1px solid ${navBorder}`, flexShrink: 0,
      boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      {/* Brand */}
      <div
        onClick={() => {
          setActiveProject(null);
          window.dispatchEvent(new CustomEvent('app-home'));
        }}
        title="Go home"
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: `linear-gradient(135deg, ${C.primary}, #818CF8)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: F,
        }}>
          <Home size={18} />
        </div>
        <div>
          <span style={{ fontSize: 16, fontWeight: 800, color: textColor, fontFamily: F, letterSpacing: '-0.3px' }}>
            Project Tracking System
          </span>
        </div>
      </div>

      {/* Breadcrumb */}
      {!isMobile && activeProject && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontFamily: F }}>
          <span
            style={{ color: C.primary, fontWeight: 600, cursor: 'pointer' }}
            onClick={() => setActiveProject(null)}
            onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
            onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}>
            Projects
          </span>
          <span style={{ color: textMuted }}>›</span>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: activeProject.color || C.primary }} />
          <span style={{ fontWeight: 700, color: textColor }}>{activeProject.name}</span>
          <span style={{ fontSize: 11, color: textMuted }}>({activeProject.code})</span>
        </div>
      )}

      {/* Right: notifications, theme toggle + auth */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontFamily: F, position: 'relative' }}>
        {!isMobile && (
          <>
            <span style={{ color: textMuted }}>
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </span>
            <span style={{ color: textMuted, fontSize: 10, opacity: 0.9 }}>
              commit {commitId}
            </span>
          </>
        )}
        {profile?.role === 'admin' && (
          <button
            onClick={openSetup}
            title="Open admin setup"
            disabled={setupLoading}
            style={{
              padding: '8px 12px', borderRadius: 10, border: `1px solid ${isDark ? C.border2 : C.border}`,
              background: isDark ? '#1E293B' : C.white, color: textColor, cursor: setupLoading ? 'wait' : 'pointer', fontSize: 12,
              opacity: setupLoading ? 0.6 : 1,
            }}
          >
            {setupLoading ? 'Loading…' : 'Setup'}
          </button>
        )}

        <button
          onClick={() => setTaskTemplateOpen(true)}
          title={activeProject ? 'Task Copy & WBS Template' : 'Open a project first'}
          disabled={!activeProject}
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            border: `1px solid ${isDark ? C.border2 : C.border}`,
            background: isDark ? '#1E293B' : C.white,
            color: activeProject ? textColor : textMuted,
            cursor: activeProject ? 'pointer' : 'not-allowed',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: activeProject ? 1 : 0.55,
          }}
        >
          <Copy size={14} />
        </button>

        <div ref={bellRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setNotifyOpen((open) => !open)}
            title="Notifications"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 10,
              background: isDark ? '#334155' : '#F8FAFC',
              border: `1px solid ${isDark ? '#475569' : '#E2E8F0'}`,
              cursor: 'pointer', color: isDark ? '#F8FAFC' : '#475569',
              position: 'relative',
            }}
          >
            <Bell size={18} />
            {notifications.length > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                minWidth: 16, height: 16, borderRadius: 999,
                background: C.red, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, padding: '0 4px'
              }}>
                {notifications.length}
              </span>
            )}
          </button>
          {notifyOpen && (
            <div style={{
              position: isMobile ? 'fixed' : 'absolute',
              top: isMobile ? 52 : 42,
              right: isMobile ? 12 : 0,
              left: isMobile ? 12 : 'auto',
              width: isMobile ? 'auto' : 320,
              maxWidth: isMobile ? 'calc(100vw - 24px)' : 320,
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 18,
              boxShadow: C.shadow2, zIndex: 300, padding: 12,
              maxHeight: 360, overflowY: 'auto'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Notifications</div>
                <span style={{ fontSize: 11, color: C.text3 }}>{notifications.length} รายการ</span>
              </div>
              {notifications.length === 0 ? (
                <div style={{ color: C.text2, fontSize: 12 }}>ไม่มีการแจ้งเตือนใหม่</div>
              ) : notifications.map((item) => (
                <div key={item.id} style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  border: `1px solid ${item.status === 'overdue' ? C.red : C.green}`,
                  background: item.status === 'overdue' ? '#FEF2F2' : '#ECFDF5',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  marginBottom: 10,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: C.text2 }}>{item.subtitle}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dark/Light mode toggle */}
        <button
          onClick={toggle}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 8,
            background: isDark ? '#334155' : '#F1F5F9',
            border: `1px solid ${isDark ? '#475569' : '#E2E8F0'}`,
            cursor: 'pointer', color: isDark ? '#FCD34D' : '#64748B',
          }}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* User icon only on mobile, full info on desktop */}
        {configured && user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.primary}, #818CF8)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 11, fontWeight: 700,
            }}>
              {(profile?.fullName || user.email || '?').substring(0, 2).toUpperCase()}
            </div>
            {!isMobile && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: textColor, lineHeight: 1.2 }}>
                    {profile?.fullName || user.email?.split('@')[0] || 'User'}
                  </span>
                  <span style={{ fontSize: 9, color: textMuted, lineHeight: 1.2 }}>
                    {profile?.role || 'member'}
                  </span>
                </div>
                <button
                  onClick={signOut}
                  title="Sign out"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 6,
                    background: isDark ? '#7F1D1D33' : '#FEE2E2',
                    border: 'none', cursor: 'pointer', color: C.red,
                  }}
                >
                  <LogOut size={13} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {setupOpen && <SetupModal onClose={() => setSetupOpen(false)} />}
      {taskTemplateOpen && <TaskTemplateModal onClose={() => setTaskTemplateOpen(false)} />}
    </nav>
  );
}
