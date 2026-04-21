import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../services/supabase';
import type { UserRole } from '../../types';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [allowedRole, setAllowedRole] = useState<'member' | 'client' | null>(null);
  const [emailError, setEmailError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const validateEmailRole = async (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      setAllowedRole(null);
      setEmailError('');
      return;
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('type')
      .ilike('email', normalized)
      .maybeSingle();

    if (memberError || !member) {
      setAllowedRole(null);
      setEmailError('EMAIL_NOT_ALLOWED');
      setRole('member');
      return;
    }

    setEmailError('');
    if (member.type === 'client') {
      setAllowedRole('client');
      setRole('client');
    } else {
      setAllowedRole('member');
      setRole('member');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && emailError) {
      setError(emailError);
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        if (!fullName.trim()) { setError('Name is required'); setLoading(false); return; }
        await signUp(email, password, fullName, role);
        setSignupSuccess(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: isDark
        ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
        : 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 50%, #C7D2FE 100%)',
      fontFamily: 'Poppins, sans-serif',
      padding: 16,
    }}>
      {/* Theme toggle */}
      <button
        onClick={toggle}
        style={{
          position: 'fixed', top: 16, right: 16,
          background: isDark ? '#334155' : '#fff',
          border: `1px solid ${isDark ? '#475569' : '#E2E8F0'}`,
          borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
          fontSize: 16,
        }}
      >
        {isDark ? '☀️' : '🌙'}
      </button>

      <div style={{
        background: isDark ? '#1E293B' : '#fff',
        borderRadius: 20,
        boxShadow: isDark
          ? '0 24px 60px rgba(0,0,0,0.5)'
          : '0 24px 60px rgba(79,70,229,0.12)',
        padding: '40px 36px',
        width: '100%',
        maxWidth: 420,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
            marginBottom: 12,
          }}>
            <span style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>PM</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: isDark ? '#F1F5F9' : '#0F172A' }}>
            ProjectMS
          </div>
          <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginTop: 4 }}>
            Enterprise Project Management
          </div>
        </div>

        {signupSuccess ? (
          <div style={{
            textAlign: 'center', padding: 20,
            background: isDark ? '#064E3B' : '#D1FAE5',
            borderRadius: 12, marginBottom: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? '#6EE7B7' : '#065F46' }}>
              Account created!
            </div>
            <div style={{ fontSize: 12, color: isDark ? '#A7F3D0' : '#047857', marginTop: 6 }}>
              Check your email to confirm, then sign in.
            </div>
            <button
              onClick={() => { setMode('login'); setSignupSuccess(false); }}
              style={{
                marginTop: 14, padding: '8px 24px', fontSize: 13, fontWeight: 600,
                background: '#4F46E5', color: '#fff', border: 'none',
                borderRadius: 8, cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
              }}
            >
              Go to Sign In
            </button>
          </div>
        ) : (
          <>
            {/* Tab toggle */}
            <div style={{
              display: 'flex', gap: 0, marginBottom: 24,
              background: isDark ? '#0F172A' : '#F1F5F9',
              borderRadius: 10, padding: 3,
            }}>
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(''); }}
                  style={{
                    flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 600,
                    borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontFamily: 'Poppins, sans-serif',
                    background: mode === m ? (isDark ? '#334155' : '#fff') : 'transparent',
                    color: mode === m ? '#4F46E5' : (isDark ? '#94A3B8' : '#64748B'),
                    boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {m === 'login' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                background: isDark ? '#7F1D1D' : '#FEE2E2',
                color: isDark ? '#FCA5A5' : '#991B1B',
                fontSize: 12, fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 5 }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    required
                    style={{
                      width: '100%', padding: '10px 14px', fontSize: 13,
                      borderRadius: 10, border: `1.5px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                      background: isDark ? '#0F172A' : '#F8FAFC',
                      color: isDark ? '#F1F5F9' : '#0F172A',
                      fontFamily: 'Poppins, sans-serif', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 5 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(''); setAllowedRole(null); }}
                  onBlur={() => validateEmailRole(email)}
                  placeholder="you@company.com"
                  required
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 13,
                    borderRadius: 10, border: `1.5px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                    background: isDark ? '#0F172A' : '#F8FAFC',
                    color: isDark ? '#F1F5F9' : '#0F172A',
                    fontFamily: 'Poppins, sans-serif', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 5 }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                  minLength={6}
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 13,
                    borderRadius: 10, border: `1.5px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                    background: isDark ? '#0F172A' : '#F8FAFC',
                    color: isDark ? '#F1F5F9' : '#0F172A',
                    fontFamily: 'Poppins, sans-serif', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              {mode === 'signup' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 5 }}>
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    style={{
                      width: '100%', padding: '10px 14px', fontSize: 13,
                      borderRadius: 10, border: `1.5px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                      background: isDark ? '#0F172A' : '#F8FAFC',
                      color: isDark ? '#F1F5F9' : '#0F172A',
                      fontFamily: 'Poppins, sans-serif', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    {!allowedRole && <option value="member">Member</option>}
                    {!allowedRole && <option value="client">Client</option>}
                    {allowedRole === 'member' && <option value="member">Member</option>}
                    {allowedRole === 'client' && <option value="client">Client</option>}
                  </select>
                  {allowedRole === 'member' && (
                    <div style={{ marginTop: 8, color: isDark ? '#A7F3D0' : '#047857', fontSize: 12 }}>
                      Your email is registered as internal; only Member is allowed.
                    </div>
                  )}
                  {allowedRole === 'client' && (
                    <div style={{ marginTop: 8, color: isDark ? '#A7F3D0' : '#047857', fontSize: 12 }}>
                      Your email is registered as client; only Client is allowed.
                    </div>
                  )}
                  {emailError && (
                    <div style={{ marginTop: 8, color: isDark ? '#FECACA' : '#B91C1C', fontSize: 12 }}>
                      {emailError}
                    </div>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
                  borderRadius: 10, border: 'none', cursor: loading ? 'wait' : 'pointer',
                  background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
                  color: '#fff', fontFamily: 'Poppins, sans-serif',
                  opacity: loading ? 0.7 : 1, marginTop: 4,
                }}
              >
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
