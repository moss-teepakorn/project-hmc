import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { useStore } from '../store';
import type { Profile, UserRole } from '../types';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  configured: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();
  const fetchProjects = useStore(state => state.fetchProjects);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    async function handleSession(s: Session | null) {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        await syncProjectMemberships(s.user.email ?? '', s.user.id);
        fetchProjects();
        await fetchProfile(s.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      handleSession(s);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      handleSession(s);
    });

    return () => subscription.unsubscribe();
  }, [configured]);

  async function fetchProfile(uid: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();
      if (error) throw error;
      setProfile({
        id: data.id,
        email: data.email ?? '',
        fullName: data.full_name ?? '',
        avatarUrl: data.avatar_url ?? '',
        role: data.role ?? 'member',
        createdAt: data.created_at ?? '',
        updatedAt: data.updated_at ?? '',
      });
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('invalid login credentials')) {
        throw new Error('Email หรือ Password ไม่ถูกต้อง หรือบัญชียังไม่ยืนยันอีเมล');
      }
      if (msg.includes('email not confirmed')) {
        throw new Error('บัญชียังไม่ยืนยันอีเมล กรุณาเปิดอีเมลแล้วกดยืนยันก่อนเข้าสู่ระบบ');
      }
      throw new Error(error.message);
    }
  };

  async function syncProjectMemberships(email: string, userId: string) {
    if (!email || !userId) return;
    try {
      const response = await fetch('/api/link-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), userId }),
      });
      if (!response.ok) {
        const body = await response.text();
        console.warn('link-member failed', response.status, body);
      }
    } catch (e) {
      console.warn('link-member failed', e);
    }
  }

  const signUp = async (email: string, password: string, fullName: string, role: UserRole = 'member') => {
    const normalized = email.trim().toLowerCase();
    // 1. ตรวจสอบ email ใน members (RPC now returns project_id rows)
    const response = await supabase.rpc('validate_member_email', { p_email: normalized });
    const members = (response.data as Array<{ email: string; type: 'internal' | 'client'; project_id?: string }>) || [];
    const memberError = response.error;
    if (memberError || !members || members.length === 0) throw new Error('EMAIL_NOT_ALLOWED');

    const member = members[0];
    // 2. กำหนด role ตาม type
    let allowedRole: UserRole = 'member';
    if (member.type === 'internal') allowedRole = 'member';
    else if (member.type === 'client') allowedRole = 'client';

    // 3. ถ้าเลือก role ไม่ตรง type
    if (role !== allowedRole) throw new Error('ROLE_TYPE_MISMATCH');

    // 4. ห้ามสร้าง admin (redundant, already enforced by allowedRole)

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: normalized,
      password,
      options: { data: { full_name: fullName, role: allowedRole } },
    });
    if (signupError) throw new Error(signupError.message);

    const createdUserId = (signupData as any)?.user?.id;
    if (createdUserId) {
      await syncProjectMemberships(normalized, createdUserId);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, configured, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
