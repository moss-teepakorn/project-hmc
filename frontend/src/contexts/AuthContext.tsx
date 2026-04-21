import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabase';
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

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id);
      else setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
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

  const signUp = async (email: string, password: string, fullName: string, role: UserRole = 'member') => {
    // 1. ตรวจสอบ email ใน members
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('email,type')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    if (memberError || !member) {
      throw new Error('EMAIL_NOT_ALLOWED');
    }

    // 2. กำหนด role ตาม type
    let allowedRole: UserRole = 'member';
    if (member.type === 'internal') allowedRole = 'member';
    else if (member.type === 'client') allowedRole = 'client';

    // 3. ถ้าเลือก role ไม่ตรง type
    if (role !== allowedRole) {
      throw new Error('ROLE_TYPE_MISMATCH');
    }

    // 4. ห้ามสร้าง admin (redundant, already enforced by allowedRole)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: allowedRole } },
    });
    if (error) throw new Error(error.message);
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
