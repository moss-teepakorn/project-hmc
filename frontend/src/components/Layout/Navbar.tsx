import React from 'react';
import { useStore } from '../../store';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { C } from '../Common';
import { LogOut, Moon, Sun } from 'lucide-react';

const F = 'Poppins, sans-serif';

export default function Navbar() {
  const { activeProject, setActiveProject, projects } = useStore();
  const { user, profile, signOut, configured } = useAuth();
  const { theme, toggle } = useTheme();
  const [isMobile, setIsMobile] = React.useState(false);
  const isDark = theme === 'dark';

  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const navBg = isDark ? '#1E293B' : C.white;
  const navBorder = isDark ? '#334155' : C.border;
  const textColor = isDark ? '#F1F5F9' : C.text;
  const textMuted = isDark ? '#94A3B8' : C.text3;
  const commitIdRaw = (import.meta as any).env?.VITE_COMMIT_ID || 'local';
  const commitId = String(commitIdRaw).slice(0, 8);

  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', height: 52, background: navBg,
      borderBottom: `1px solid ${navBorder}`, flexShrink: 0,
      boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: `linear-gradient(135deg, ${C.primary}, #818CF8)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: F,
        }}>PM</div>
        <div>
          <span style={{ fontSize: 16, fontWeight: 800, color: textColor, fontFamily: F, letterSpacing: '-0.3px' }}>
            ProjectMS
          </span>
          <span style={{ fontSize: 10, color: textMuted, fontFamily: F, fontWeight: 500, marginLeft: 6 }}>
            Enterprise
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

      {/* Right: theme toggle + auth */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontFamily: F }}>
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
    </nav>
  );
}
