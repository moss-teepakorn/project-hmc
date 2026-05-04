-- ============================================================================
-- ProjectMS Enterprise — Supabase PostgreSQL Schema (COMPLETE)
-- ============================================================================
-- วิธีใช้: Copy ทั้งหมด วางใน Supabase SQL Editor แล้วกด Run
-- รวม: tables, indexes, RLS policies, triggers, functions, seed data
-- อัพเดตล่าสุด: 2026-05-04 (รวม migrations ทั้งหมด)
-- ============================================================================

-- ============================================================================
-- 0. Extensions
-- ============================================================================
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. PROFILES (เชื่อมกับ auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  role        text not null default 'member'
                check (role in ('admin','pm','member','client')),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create profile เมื่อ signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'member')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 2. PROJECTS
-- ============================================================================
create table if not exists public.projects (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  code        text not null default '',
  client      text not null default '',
  software_version text not null default '',
  status      text not null default 'Planning'
                check (status in ('Planning','Req & Design','Setup','Testing','Go Live','Hyper Care')),
  start_date  text not null default '',
  end_date    text not null default '',
  description text not null default '',
  color       text not null default '#4F46E5',
  created_by  uuid references public.profiles(id),
  -- Email notification settings
  email_notification_enabled       boolean not null default false,
  email_notification_mode          text    not null default 'task'
                                     check (email_notification_mode in ('task','custom')),
  email_notification_recipients    text    not null default '',
  email_notification_time          time    not null default '08:00',
  email_notification_last_sent_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Project Environments
create table if not exists public.project_environments (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  environment  text not null check (environment in ('DEV','QA','UAT','Production')),
  url          text not null default '',
  username     text not null default '',
  password     text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(project_id, environment)
);

create index if not exists idx_project_environments_project on public.project_environments(project_id);

-- Project Progress Snapshots
create table if not exists public.project_progress_snapshots (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  snapshot_date    date not null,
  baseline_percent integer not null default 0,
  actual_percent   integer not null default 0,
  note             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(project_id, snapshot_date)
);

create index if not exists idx_project_progress_snapshots_project on public.project_progress_snapshots(project_id);

-- ============================================================================
-- 3. PROJECT MEMBERS (access control + team)
-- ============================================================================
create table if not exists public.members (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null default '',
  nickname    text not null default '',
  role        text not null default '',
  position    text not null default '',
  email       text not null default '',
  tel         text not null default '',
  ext         text not null default '',
  type        text not null default 'internal' check (type in ('internal','client')),
  notes       text not null default '',
  user_id     uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique(email)
);

create index if not exists idx_members_project on public.members(project_id);
create index if not exists idx_members_user    on public.members(user_id);

-- Project Members (for project visibility)
create table if not exists public.project_members (
  id         uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create index if not exists idx_project_members_user    on public.project_members(user_id);
create index if not exists idx_project_members_project on public.project_members(project_id);

-- Auto-sync project_members เมื่อมี profile ใหม่ที่ email ตรงกับ members
create or replace function public.sync_project_members_for_new_profile()
returns trigger
language plpgsql security definer
as $$
begin
  insert into public.project_members (project_id, user_id)
  select m.project_id, new.id
  from public.members m
  where lower(m.email) = lower(new.email)
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_sync_project_members_on_profiles_insert on public.profiles;
create trigger trg_sync_project_members_on_profiles_insert
  after insert on public.profiles
  for each row
  execute function public.sync_project_members_for_new_profile();

-- ============================================================================
-- 4. TASKS
-- ============================================================================
create table if not exists public.tasks (
  id               uuid primary key default uuid_generate_v4(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  wbs              text not null default '',
  task_name        text not null default '',
  phase            varchar(100) not null default '',
  start_date       text not null default '',
  end_date         text not null default '',
  actual_finish    text not null default '',
  duration         integer not null default 0,
  percent_complete integer not null default 0,
  status           text not null default 'Todo'
                     check (status in ('Todo','In Progress','Block/Delay','Done')),
  resource         text not null default '',
  related_task     text not null default '',
  parent_id        text not null default '',
  level            integer not null default 0,
  "order"          integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists idx_tasks_project on public.tasks(project_id);

-- ============================================================================
-- 5. MILESTONES
-- ============================================================================
create table if not exists public.milestones (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  phase        text not null default '',
  name         text not null default '',
  percent      numeric not null default 0,
  amount       numeric not null default 0,
  phase_amount numeric not null default 0,
  due_date     text not null default '',
  billing_date text not null default '',
  notes        text not null default '',
  status       text not null default 'pending'
                 check (status in ('pending','billed','paid')),
  created_at   timestamptz not null default now()
);

create index if not exists idx_milestones_project on public.milestones(project_id);

-- ============================================================================
-- 6. EFFORTS
-- ============================================================================
create table if not exists public.efforts (
  id             uuid primary key default uuid_generate_v4(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  module         text not null default '',
  phase          text not null default '',
  budget_amount  numeric not null default 0,
  budget_manday  numeric not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_efforts_project on public.efforts(project_id);

-- ============================================================================
-- 7. EFFORT MONTHLY
-- ============================================================================
create table if not exists public.effort_monthly (
  id        uuid primary key default uuid_generate_v4(),
  effort_id uuid not null references public.efforts(id) on delete cascade,
  month     text not null default '',
  manday    numeric not null default 0,
  unique(effort_id, month)
);

create index if not exists idx_effort_monthly_effort on public.effort_monthly(effort_id);

-- ============================================================================
-- 8. CHANGE REQUESTS
-- ============================================================================
create table if not exists public.change_requests (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  cr_id         text not null default '',
  title         text not null default '',
  requested_by  text not null default '',
  request_date  text not null default '',
  approved_by   text not null default '',
  approval_date text not null default '',
  total_manday  numeric not null default 0,
  discount      numeric not null default 0,
  status        text not null default 'Draft'
                  check (status in ('Draft','Submitted','Under Review','Approved','Rejected','Implemented','Close')),
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists idx_cr_project on public.change_requests(project_id);

-- ============================================================================
-- 9. CR ITEMS
-- ============================================================================
create table if not exists public.cr_items (
  id     uuid primary key default uuid_generate_v4(),
  cr_id  uuid not null references public.change_requests(id) on delete cascade,
  detail text not null default '',
  manday numeric not null default 0
);

create index if not exists idx_cr_items_cr on public.cr_items(cr_id);

-- ============================================================================
-- 10. ISSUES
-- ============================================================================
create table if not exists public.issues (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  issue_date    text not null default '',
  title         text not null default '',
  description   text not null default '',
  reported_by   text not null default '',
  assigned_to   text not null default '',
  status        text not null default 'Open'
                  check (status in ('Open','In Progress','Resolved','Blocked')),
  resolved_date text not null default '',
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists idx_issues_project on public.issues(project_id);

-- ============================================================================
-- 11. RISKS
-- ============================================================================
create table if not exists public.risks (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  risk_date   text not null default '',
  title       text not null default '',
  description text not null default '',
  probability text not null default 'Medium' check (probability in ('Low','Medium','High')),
  impact      text not null default 'Medium' check (impact in ('Low','Medium','High')),
  mitigation  text not null default '',
  owner       text not null default '',
  status      text not null default 'Monitoring'
                check (status in ('Monitoring','Mitigating','Closed')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_risks_project on public.risks(project_id);

-- ============================================================================
-- 12. MASTERS CODE (ข้อมูล dropdown / config)
-- ============================================================================
create table if not exists public.masters_code (
  id         uuid primary key default gen_random_uuid(),
  code_type  text not null,
  code_key   text not null,
  code_value text not null,
  label      text not null,
  sort_order integer not null default 100,
  active     boolean not null default true,
  text_color text not null default '#0F172A',
  bg_color   text not null default '#EEF2FF',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists masters_code_code_type_key_idx on public.masters_code(code_type, code_key);

-- Seed data
insert into public.masters_code (code_type, code_key, code_value, label, sort_order, text_color, bg_color) values
  ('project_status', 'planning',   'Planning',     'Planning',     10, '#92400E', '#FEF3C7'),
  ('project_status', 'req_design', 'Req & Design', 'Req & Design', 20, '#1E40AF', '#DBEAFE'),
  ('project_status', 'setup',      'Setup',        'Setup',        30, '#9A3412', '#FED7AA'),
  ('project_status', 'testing',    'Testing',      'Testing',      40, '#6B21A8', '#E9D5FF'),
  ('project_status', 'go_live',    'Go Live',      'Go Live',      50, '#065F46', '#D1FAE5'),
  ('project_status', 'hyper_care', 'Hyper Care',   'Hyper Care',   60, '#475569', '#F1F5F9'),
  ('task_phase', 'project_initiation',       'Project Initiation',         'Project Initiation',         10, '#0F172A', '#F8FAFF'),
  ('task_phase', 'requirement_gap_analysis', 'Requirement & Gap Analysis', 'Requirement & Gap Analysis', 20, '#0F172A', '#F8FAFF'),
  ('task_phase', 'business_blueprint',       'Business Blueprint',         'Business Blueprint',         30, '#0F172A', '#F8FAFF'),
  ('task_phase', 'system_configuration',     'System Configuration',       'System Configuration',       40, '#0F172A', '#F8FAFF'),
  ('task_phase', 'data_migration',           'Data Migration',             'Data Migration',             50, '#0F172A', '#F8FAFF'),
  ('task_phase', 'uat_parallel_run',         'UAT & Parallel Run',         'UAT & Parallel Run',         60, '#0F172A', '#F8FAFF'),
  ('task_phase', 'go_live_hypercare',        'Go-live & Hypercare',        'Go-live & Hypercare',        70, '#0F172A', '#F8FAFF')
on conflict (code_type, code_key) do nothing;

-- ============================================================================
-- 13. EMAIL REMINDER LOGS
-- ============================================================================
create table if not exists public.email_reminder_logs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects(id) on delete set null,
  project_name  text,
  project_code  text,
  type          text not null check (type in ('auto','manual')),
  scheduled_time text,
  sent_at       timestamptz,
  status        text not null check (status in ('sent','skipped','failed')),
  recipient     text,
  tasks_count   integer default 0,
  error_message text,
  created_at    timestamptz default now()
);

create index if not exists idx_email_reminder_logs_project_id on public.email_reminder_logs(project_id);
create index if not exists idx_email_reminder_logs_created_at on public.email_reminder_logs(created_at desc);

-- ============================================================================
-- 14. HELPER FUNCTIONS
-- ============================================================================

-- ตรวจสอบว่า user เป็น admin หรือไม่
create or replace function public.is_admin()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ตรวจสอบว่า user เป็น member ของ project หรือไม่
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.members
    where project_id = p_project_id and user_id = auth.uid()
  )
  or public.is_admin()
  or exists (
    select 1 from public.projects
    where id = p_project_id and created_by = auth.uid()
  );
$$;

-- ตรวจสอบ email ใน members table (ใช้สำหรับ signup validation)
drop function if exists public.validate_member_email(text);
create function public.validate_member_email(p_email text)
returns table(email text, type text, project_id uuid)
language sql security definer stable
as $$
  select email, type, project_id
  from public.members
  where lower(email) = lower(p_email);
$$;

-- อัพเดต updated_at อัตโนมัติ
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.projects
  for each row execute function public.update_updated_at();

create trigger set_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();

-- ============================================================================
-- 15. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- PROFILES
alter table public.profiles enable row level security;
create policy "profiles_select_all"  on public.profiles for select using (true);
create policy "profiles_update_own"  on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);

-- PROJECTS
alter table public.projects enable row level security;
create policy "projects_select" on public.projects for select using (auth.uid() is not null);
create policy "projects_insert" on public.projects for insert with check (auth.uid() is not null);
create policy "projects_update" on public.projects for update using (created_by = auth.uid() or public.is_admin());
create policy "projects_delete" on public.projects for delete using (created_by = auth.uid() or public.is_admin());

-- PROJECT_ENVIRONMENTS
alter table public.project_environments enable row level security;
create policy "proj_env_select" on public.project_environments for select using (auth.uid() is not null);
create policy "proj_env_insert" on public.project_environments for insert with check (auth.uid() is not null);
create policy "proj_env_update" on public.project_environments for update using (auth.uid() is not null);
create policy "proj_env_delete" on public.project_environments for delete using (auth.uid() is not null);

-- PROJECT_PROGRESS_SNAPSHOTS
alter table public.project_progress_snapshots enable row level security;
create policy "snapshots_select" on public.project_progress_snapshots for select to anon, authenticated using (true);
create policy "snapshots_insert" on public.project_progress_snapshots for insert to anon, authenticated with check (true);
create policy "snapshots_update" on public.project_progress_snapshots for update to anon, authenticated using (true) with check (true);
create policy "snapshots_delete" on public.project_progress_snapshots for delete to anon, authenticated using (true);

-- MEMBERS
alter table public.members enable row level security;
create policy "members_select" on public.members for select using (auth.uid() is not null);
create policy "members_insert" on public.members for insert with check (auth.uid() is not null);
create policy "members_update" on public.members for update using (auth.uid() is not null);
create policy "members_delete" on public.members for delete using (auth.uid() is not null);

-- PROJECT_MEMBERS
alter table public.project_members enable row level security;
create policy "project_members_select" on public.project_members for select using (auth.uid() is not null);
create policy "project_members_insert" on public.project_members for insert with check (auth.uid() is not null);
create policy "project_members_delete" on public.project_members for delete using (auth.uid() is not null);

-- TASKS
alter table public.tasks enable row level security;
create policy "tasks_select" on public.tasks for select using (auth.uid() is not null);
create policy "tasks_insert" on public.tasks for insert with check (auth.uid() is not null);
create policy "tasks_update" on public.tasks for update using (auth.uid() is not null);
create policy "tasks_delete" on public.tasks for delete using (auth.uid() is not null);

-- MILESTONES
alter table public.milestones enable row level security;
create policy "milestones_select" on public.milestones for select using (auth.uid() is not null);
create policy "milestones_insert" on public.milestones for insert with check (auth.uid() is not null);
create policy "milestones_update" on public.milestones for update using (auth.uid() is not null);
create policy "milestones_delete" on public.milestones for delete using (auth.uid() is not null);

-- EFFORTS
alter table public.efforts enable row level security;
create policy "efforts_select" on public.efforts for select using (auth.uid() is not null);
create policy "efforts_insert" on public.efforts for insert with check (auth.uid() is not null);
create policy "efforts_update" on public.efforts for update using (auth.uid() is not null);
create policy "efforts_delete" on public.efforts for delete using (auth.uid() is not null);

-- EFFORT_MONTHLY
alter table public.effort_monthly enable row level security;
create policy "effort_monthly_select" on public.effort_monthly for select using (auth.uid() is not null);
create policy "effort_monthly_insert" on public.effort_monthly for insert with check (auth.uid() is not null);
create policy "effort_monthly_update" on public.effort_monthly for update using (auth.uid() is not null);
create policy "effort_monthly_delete" on public.effort_monthly for delete using (auth.uid() is not null);

-- CHANGE_REQUESTS
alter table public.change_requests enable row level security;
create policy "cr_select" on public.change_requests for select using (auth.uid() is not null);
create policy "cr_insert" on public.change_requests for insert with check (auth.uid() is not null);
create policy "cr_update" on public.change_requests for update using (auth.uid() is not null);
create policy "cr_delete" on public.change_requests for delete using (auth.uid() is not null);

-- CR_ITEMS
alter table public.cr_items enable row level security;
create policy "cr_items_select" on public.cr_items for select using (auth.uid() is not null);
create policy "cr_items_insert" on public.cr_items for insert with check (auth.uid() is not null);
create policy "cr_items_update" on public.cr_items for update using (auth.uid() is not null);
create policy "cr_items_delete" on public.cr_items for delete using (auth.uid() is not null);

-- ISSUES
alter table public.issues enable row level security;
create policy "issues_select" on public.issues for select using (auth.uid() is not null);
create policy "issues_insert" on public.issues for insert with check (auth.uid() is not null);
create policy "issues_update" on public.issues for update using (auth.uid() is not null);
create policy "issues_delete" on public.issues for delete using (auth.uid() is not null);

-- RISKS
alter table public.risks enable row level security;
create policy "risks_select" on public.risks for select using (auth.uid() is not null);
create policy "risks_insert" on public.risks for insert with check (auth.uid() is not null);
create policy "risks_update" on public.risks for update using (auth.uid() is not null);
create policy "risks_delete" on public.risks for delete using (auth.uid() is not null);

-- MASTERS_CODE
alter table public.masters_code enable row level security;
create policy "masters_code_select"  on public.masters_code for select using (auth.uid() is not null);
create policy "masters_code_insert"  on public.masters_code for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "masters_code_update"  on public.masters_code for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "masters_code_delete"  on public.masters_code for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- EMAIL_REMINDER_LOGS (service role เข้าถึงได้ทั้งหมด)
alter table public.email_reminder_logs enable row level security;
create policy "email_logs_all" on public.email_reminder_logs for all using (true) with check (true);

-- ============================================================================
-- 16. REALTIME
-- ============================================================================
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.milestones;
alter publication supabase_realtime add table public.issues;
alter publication supabase_realtime add table public.risks;
alter publication supabase_realtime add table public.change_requests;
