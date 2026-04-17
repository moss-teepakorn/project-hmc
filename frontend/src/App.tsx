import React, { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { useStore } from './store';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import { useRealtimeSubscription } from './hooks/useRealtime';
import Navbar        from './components/Layout/Navbar';
import Dashboard     from './components/Dashboard/Dashboard';
import ProjectDetail from './components/Dashboard/ProjectDetail';
import AuthPage      from './components/Auth/AuthPage';
import { C } from './components/Common';

export default function App() {
  const { user, loading: authLoading, configured } = useAuth();
  const { theme } = useTheme();
  const fetchProjects = useStore(state => state.fetchProjects);
  const activeProject = useStore(state => state.activeProject);
  const projectsLoading = useStore(state => state.projectsLoading);
  const dataLoading = useStore(state => state.dataLoading);
  const error = useStore(state => state.error);

  // Realtime subscriptions
  useRealtimeSubscription(activeProject?.id);

  useEffect(() => {
    // Fetch projects if authenticated or if Supabase isn't configured (demo mode)
    if (!configured || user) {
      fetchProjects();
    }
  }, [fetchProjects, user, configured]);

  const isDark = theme === 'dark';

  // Show loading while checking auth
  if (authLoading && configured) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh',
        background: isDark ? '#0F172A' : '#F5F7FA', flexDirection: 'column', gap: 16,
      }}>
        <div style={{
          width: 36, height: 36,
          border: `3px solid ${C.primary}`, borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: isDark ? '#94A3B8' : C.text2, fontSize: 14, fontFamily: 'Poppins, sans-serif' }}>
          Loading…
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Show auth page if Supabase is configured but user isn't logged in
  if (configured && !user) {
    return <AuthPage />;
  }

  const bg = isDark ? '#0F172A' : C.bg;
  const toastBg = isDark ? '#1E293B' : C.white;
  const toastColor = isDark ? '#F1F5F9' : C.text;
  const toastBorder = isDark ? '#334155' : C.border;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: bg, fontFamily: 'Poppins, sans-serif', overflow: 'hidden' }}>
      <Navbar />

      <main style={{ flex: 1, overflow: 'hidden' }}>
        {!activeProject ? (
          <div style={{ height: '100%', overflowY: 'auto' }}>
            {projectsLoading && !error ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
                <div style={{ width: 36, height: 36, border: `3px solid ${C.primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <p style={{ color: isDark ? '#94A3B8' : C.text2, fontSize: 14 }}>Loading projects…</p>
              </div>
            ) : error ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8 }}>
                <p style={{ color: C.red, fontWeight: 600, fontSize: 15 }}>Connection Error</p>
                <p style={{ color: isDark ? '#94A3B8' : C.text2, fontSize: 13 }}>{error}</p>
                <p style={{ color: isDark ? '#64748B' : C.text3, fontSize: 12 }}>
                  {configured ? 'Check your Supabase configuration.' : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'}
                </p>
              </div>
            ) : (
              <Dashboard />
            )}
          </div>
        ) : (
          <ProjectDetail project={activeProject} />
        )}
      </main>

      {dataLoading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 450, cursor: 'wait' }}>
          <div style={{ position: 'absolute', inset: 0, background: isDark ? 'rgba(15,23,42,0.24)' : 'rgba(255,255,255,0.20)' }} />
          <div style={{
            position: 'absolute',
            right: 16,
            bottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 999,
            background: isDark ? '#1E293B' : '#FFFFFF',
            border: `1px solid ${isDark ? '#334155' : C.border}`,
            boxShadow: C.shadow2,
            pointerEvents: 'none',
          }}>
            <div style={{
              width: 14,
              height: 14,
              border: `2px solid ${C.primary}`,
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: isDark ? '#E2E8F0' : C.text2,
              fontFamily: 'Poppins, sans-serif',
            }}>
              Saving...
            </span>
          </div>
        </div>
      )}

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            fontFamily: 'Poppins, sans-serif',
            fontSize: 13,
            background: toastBg,
            color: toastColor,
            border: `1px solid ${toastBorder}`,
            borderRadius: 12,
            boxShadow: C.shadow2,
          },
          success: { iconTheme: { primary: C.green,   secondary: '#fff' } },
          error:   { iconTheme: { primary: C.red,     secondary: '#fff' } },
        }}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${isDark ? '#0F172A' : C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${isDark ? '#334155' : C.border2}; border-radius: 3px; }
        input[type="date"] { color-scheme: ${isDark ? 'dark' : 'light'}; }
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
}
