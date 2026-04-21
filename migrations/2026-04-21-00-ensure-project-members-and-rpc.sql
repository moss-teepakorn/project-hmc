-- Migration: ensure project_members table and validate_member_email RPC
-- Run this on your Supabase project (SQL editor) or apply via supabase CLI

create extension if not exists "uuid-ossp";

-- create project_members if missing
create table if not exists public.project_members (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);
create index if not exists idx_project_members_user on public.project_members(user_id);
create index if not exists idx_project_members_project on public.project_members(project_id);

-- ensure the RPC exists (security definer for RLS safety)
create or replace function public.validate_member_email(p_email text)
returns table(email text, type text)
language sql security definer stable
as $$
  select email, type
  from public.members
  where lower(email) = lower(p_email)
  limit 1;
$$;
