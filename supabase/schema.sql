<<<<<<< HEAD
-- ============================================================================
-- ProjectMS Enterprise — Supabase PostgreSQL Schema
-- ============================================================================
-- Run this in Supabase SQL Editor to set up the database.
-- Includes: tables, indexes, RLS policies, realtime, and helper functions.
-- ============================================================================

-- 0. Extensions
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. PROFILES (linked to auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  role        text not null default 'member'
                check (role in ('admin','pm','member','client')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create profile on signup
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
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.project_environments (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  environment  text not null check (environment in ('DEV', 'QA', 'UAT', 'Production')),
  url          text not null default '',
  username     text not null default '',
  password     text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(project_id, environment)
);

create index if not exists idx_project_environments_project on public.project_environments(project_id);

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
-- PROJECT MEMBERS (for project visibility)
create table if not exists public.project_members (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);
create index if not exists idx_project_members_user on public.project_members(user_id);
create index if not exists idx_project_members_project on public.project_members(project_id);

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

create trigger trg_sync_project_members_on_profiles_insert
  after insert on public.profiles
  for each row
  execute function public.sync_project_members_for_new_profile();

create index if not exists idx_members_project on public.members(project_id);
create index if not exists idx_members_user    on public.members(user_id);

-- ============================================================================
-- 4. TASKS
-- ============================================================================
create table if not exists public.tasks (
  id               uuid primary key default uuid_generate_v4(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  wbs              text not null default '',
  task_name        text not null default '',
  start_date       text not null default '',
  end_date         text not null default '',
  actual_finish    text not null default '',
  duration         integer not null default 0,
  percent_complete integer not null default 0,
  status           text not null default 'Todo' check (status in ('Todo','In Progress','Block/Delay','Done')),
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
  status       text not null default 'pending' check (status in ('pending','billed','paid')),
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
  budget_amount  numeric not null default 0,
  budget_manday  numeric not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_efforts_project on public.efforts(project_id);

-- ============================================================================
-- 7. EFFORT MONTHLY
-- ============================================================================
create table if not exists public.effort_monthly (
  id         uuid primary key default uuid_generate_v4(),
  effort_id  uuid not null references public.efforts(id) on delete cascade,
  month      text not null default '',
  manday     numeric not null default 0,
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
  id       uuid primary key default uuid_generate_v4(),
  cr_id    uuid not null references public.change_requests(id) on delete cascade,
  detail   text not null default '',
  manday   numeric not null default 0
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
-- 12. ROW LEVEL SECURITY
-- ============================================================================

-- Helper: check if user is admin
create or replace function public.is_admin()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: check if user is member of project
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

-- PROFILES
alter table public.profiles enable row level security;

create policy "Users can view all profiles"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- PROJECTS
alter table public.projects enable row level security;

create policy "Anyone authenticated can view projects"
  on public.projects for select using (auth.uid() is not null);

create policy "Authenticated users can create projects"
  on public.projects for insert with check (auth.uid() is not null);

create policy "Project creator or admin can update"
  on public.projects for update using (
    created_by = auth.uid() or public.is_admin()
  );

create policy "Project creator or admin can delete"
  on public.projects for delete using (
    created_by = auth.uid() or public.is_admin()
  );

-- MEMBERS
alter table public.members enable row level security;

create policy "Project members can view members"
  on public.members for select using (auth.uid() is not null);

create policy "Authenticated can manage members"
  on public.members for insert with check (auth.uid() is not null);

create policy "Authenticated can update members"
  on public.members for update using (auth.uid() is not null);

create policy "Authenticated can delete members"
  on public.members for delete using (auth.uid() is not null);

-- drop existing version first to allow changing return row type
drop function if exists public.validate_member_email(text);
create function public.validate_member_email(p_email text)
returns table(email text, type text, project_id uuid)
language sql security definer stable
as $$
  select email, type, project_id
  from public.members
  where lower(email) = lower(p_email);
$$;

-- TASKS
alter table public.tasks enable row level security;

create policy "Authenticated can view tasks"
  on public.tasks for select using (auth.uid() is not null);

create policy "Authenticated can insert tasks"
  on public.tasks for insert with check (auth.uid() is not null);

create policy "Authenticated can update tasks"
  on public.tasks for update using (auth.uid() is not null);

create policy "Authenticated can delete tasks"
  on public.tasks for delete using (auth.uid() is not null);

-- MILESTONES
alter table public.milestones enable row level security;

create policy "Authenticated can view milestones"
  on public.milestones for select using (auth.uid() is not null);

create policy "Authenticated can insert milestones"
  on public.milestones for insert with check (auth.uid() is not null);

create policy "Authenticated can update milestones"
  on public.milestones for update using (auth.uid() is not null);

create policy "Authenticated can delete milestones"
  on public.milestones for delete using (auth.uid() is not null);

-- EFFORTS
alter table public.efforts enable row level security;

create policy "Authenticated can view efforts"
  on public.efforts for select using (auth.uid() is not null);

create policy "Authenticated can insert efforts"
  on public.efforts for insert with check (auth.uid() is not null);

create policy "Authenticated can update efforts"
  on public.efforts for update using (auth.uid() is not null);

create policy "Authenticated can delete efforts"
  on public.efforts for delete using (auth.uid() is not null);

-- EFFORT_MONTHLY
alter table public.effort_monthly enable row level security;

create policy "Authenticated can view effort_monthly"
  on public.effort_monthly for select using (auth.uid() is not null);

create policy "Authenticated can insert effort_monthly"
  on public.effort_monthly for insert with check (auth.uid() is not null);

create policy "Authenticated can update effort_monthly"
  on public.effort_monthly for update using (auth.uid() is not null);

create policy "Authenticated can delete effort_monthly"
  on public.effort_monthly for delete using (auth.uid() is not null);

-- CHANGE_REQUESTS
alter table public.change_requests enable row level security;

create policy "Authenticated can view CRs"
  on public.change_requests for select using (auth.uid() is not null);

create policy "Authenticated can insert CRs"
  on public.change_requests for insert with check (auth.uid() is not null);

create policy "Authenticated can update CRs"
  on public.change_requests for update using (auth.uid() is not null);

create policy "Authenticated can delete CRs"
  on public.change_requests for delete using (auth.uid() is not null);

-- CR_ITEMS
alter table public.cr_items enable row level security;

create policy "Authenticated can view CR items"
  on public.cr_items for select using (auth.uid() is not null);

create policy "Authenticated can insert CR items"
  on public.cr_items for insert with check (auth.uid() is not null);

create policy "Authenticated can update CR items"
  on public.cr_items for update using (auth.uid() is not null);

create policy "Authenticated can delete CR items"
  on public.cr_items for delete using (auth.uid() is not null);

-- ISSUES
alter table public.issues enable row level security;

create policy "Authenticated can view issues"
  on public.issues for select using (auth.uid() is not null);

create policy "Authenticated can insert issues"
  on public.issues for insert with check (auth.uid() is not null);

create policy "Authenticated can update issues"
  on public.issues for update using (auth.uid() is not null);

create policy "Authenticated can delete issues"
  on public.issues for delete using (auth.uid() is not null);

-- RISKS
alter table public.risks enable row level security;

create policy "Authenticated can view risks"
  on public.risks for select using (auth.uid() is not null);

create policy "Authenticated can insert risks"
  on public.risks for insert with check (auth.uid() is not null);

create policy "Authenticated can update risks"
  on public.risks for update using (auth.uid() is not null);

create policy "Authenticated can delete risks"
  on public.risks for delete using (auth.uid() is not null);

-- ============================================================================
-- 13. REALTIME
-- ============================================================================
-- Enable realtime for key tables
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.milestones;
alter publication supabase_realtime add table public.issues;
alter publication supabase_realtime add table public.risks;
alter publication supabase_realtime add table public.change_requests;

-- ============================================================================
-- 14. UPDATED_AT TRIGGER
-- ============================================================================
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
=======
-- ============================================================
-- Greenfield VMS — Database Schema v2.2 (Combined)
-- schema_v2.1 + add_3_tables (v2.2)
-- วิธีใช้: Copy ทั้งหมด วางใน Supabase SQL Editor กด Run
-- ============================================================

-- ── 2. HOUSES (ข้อมูลบ้าน) ──────────────────────────────────────────
create table if not exists houses (
  id              uuid    primary key default gen_random_uuid(),
  house_no        text    not null,
  soi             text,
  address         text,
  owner_name      text,
  resident_name   text,
  contact_name    text,
  phone           text,
  line_id         text,
  email           text,
  status          text    default 'normal',
  -- normal / overdue / suspended / lawsuit
  house_type      text    default 'อยู่เอง',
  -- อยู่เอง / เช่า / ว่าง
  area_sqw        numeric default 0,
  fee_rate        numeric default 10,
  -- annual_fee = fee_rate × 12 × area_sqw (คำนวณอัตโนมัติ)
  annual_fee      numeric generated always as (fee_rate * 12 * area_sqw) stored,
  note            text,
  created_at      timestamptz default now()
);

-- ── 3. PROFILES (ผู้ใช้งาน) ────────────────────────────────────────
create table if not exists profiles (
  id         uuid primary key default gen_random_uuid(),
  username   text unique not null,
  password_hash text not null,
  full_name  text,
  email      text,
  role       text    default 'resident',
  -- admin / resident
  house_id   uuid    references houses(id),
  phone      text,
  avatar_url text,
  is_active  boolean default true,
  failed_login_count int default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ── 4. VEHICLES (ยานพาหนะ) ─────────────────────────────────────────
create table if not exists vehicles (
  id               uuid primary key default gen_random_uuid(),
  house_id         uuid references houses(id) on delete cascade,
  license_plate    text not null,
  province         text,
  brand            text,
  model            text,
  color            text,
  vehicle_type     text default 'car',
  -- car / motorcycle / other
  parking_location text default 'ในบ้าน',
  -- ในบ้าน / หน้าบ้าน / ส่วนกลาง
  parking_lock_no  text,
  parking_fee      numeric default 0,
  status           text    default 'active',
  -- active / pending / removed
  note             text,
  created_at       timestamptz default now()
);

-- ── VIEW: สรุปยอดรถและค่าใช้จ่ายต่อบ้าน ────────────────────────────
create or replace view house_vehicle_summary as
select
  h.id                                         as house_id,
  h.house_no,
  h.soi,
  count(v.id)                                  as total_vehicles,
  count(v.id) filter (
    where v.parking_location = 'ส่วนกลาง'
    and v.status = 'active'
  )                                             as vehicles_common_parking,
  count(v.id) filter (
    where v.status = 'active'
  )                                             as active_vehicles
from houses h
left join vehicles v on v.house_id = h.id
group by h.id, h.house_no, h.soi;

-- ── 5. FEES (ใบแจ้งหนี้) ────────────────────────────────────────────
create table if not exists fees (
  id                  uuid    primary key default gen_random_uuid(),
  house_id            uuid    references houses(id) on delete cascade,
  year                int     not null,
  period              text    default 'full_year',
  -- first_half / second_half / full_year
  invoice_date        date,
  due_date            date,
  status              text    default 'unpaid',
  -- unpaid / pending / paid / overdue
  fee_common          numeric default 0,
  fee_parking         numeric default 0,
  fee_waste           numeric default 0,
  fee_overdue_common  numeric default 0,
  fee_overdue_fine    numeric default 0,
  fee_overdue_notice  numeric default 0,
  fee_fine            numeric default 0,
  fee_notice          numeric default 0,
  fee_violation       numeric default 0,
  fee_other           numeric default 0,
  total_amount        numeric generated always as (
    fee_common + fee_parking + fee_waste +
    fee_overdue_common + fee_overdue_fine + fee_overdue_notice +
    fee_fine + fee_notice + fee_violation + fee_other
  ) stored,
  note                text,
  created_at          timestamptz default now()
);

-- ── 6. PAYMENTS (บันทึกการชำระเงิน) ────────────────────────────────
create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  fee_id         uuid references fees(id) on delete cascade,
  house_id       uuid references houses(id),
  amount         numeric     not null,
  payment_method text        default 'transfer',
  -- transfer / cash / qr
  slip_url       text,
  paid_at        timestamptz not null default now(),
  verified_by    uuid        references profiles(id),
  verified_at    timestamptz,
  note           text
);

-- ── 6.1 PAYMENT_ITEMS (รายละเอียดรายการชำระต่อครั้ง) ───────────────
create table if not exists payment_items (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null references payments(id) on delete cascade,
  fee_id             uuid references fees(id) on delete cascade,
  house_id           uuid references houses(id),
  item_key           text not null,
  item_label         text not null,
  due_amount         numeric default 0,
  paid_amount        numeric not null default 0,
  outstanding_amount numeric generated always as (greatest(coalesce(due_amount, 0) - coalesce(paid_amount, 0), 0)) stored,
  created_at         timestamptz not null default now()
);

create index if not exists idx_payment_items_payment_id on payment_items (payment_id);
create index if not exists idx_payment_items_fee_id on payment_items (fee_id);
create index if not exists idx_payment_items_house_id on payment_items (house_id);

-- ── 7. ISSUES (แจ้งปัญหา) ───────────────────────────────────────────
create table if not exists issues (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid references houses(id) on delete cascade,
  title       text not null,
  detail      text,
  category    text,
  -- ไฟฟ้า / ประปา / ถนน / ความสะอาด / ความปลอดภัย / อื่นๆ
  status      text default 'pending',
  -- pending / in_progress / resolved / closed
  image_url   text,
  admin_note  text,
  rating      int  check (rating between 1 and 5),
  rating_note text,
  resolved_at timestamptz,
  created_at  timestamptz default now()
);

-- ── 8. ISSUE_LOGS (Timeline การแก้ไขปัญหา) ─────────────────────────
create table if not exists issue_logs (
  id        uuid primary key default gen_random_uuid(),
  issue_id  uuid references issues(id) on delete cascade,
  logged_by uuid references profiles(id),
  action    text not null,
  image_url text,
  logged_at timestamptz default now()
);

-- ── 9. VIOLATIONS (กระทำผิด) ────────────────────────────────────────
create table if not exists violations (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid references houses(id) on delete cascade,
  type        text not null,
  detail      text,
  occurred_at date,
  image_url   text,
  status      text default 'pending',
  -- pending / in_progress / not_fixed / resolved / cancelled
  due_date    date,
  report_no   text,
  report_date date,
  warning_count int default 0,
  fine_amount numeric default 0,
  admin_note  text,
  resident_note text,
  resident_updated_at timestamptz,
  created_at  timestamptz default now()
);

-- ── 10. ANNOUNCEMENTS (ประกาศ) ──────────────────────────────────────
create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  announcement_no text,
  announcement_date date,
  title      text not null,
  content    text,
  type       text    default 'normal',
  -- urgent / normal / info
  image_url  text,
  is_pinned  boolean default false,
  created_by uuid    references profiles(id),
  created_at timestamptz default now()
);

-- ── 11. TECHNICIANS (ทำเนียบช่าง) ──────────────────────────────────
create table if not exists technicians (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text,
  line_id      text,
  rating       numeric default 0,
  review_count int     default 0,
  status       text    default 'pending',
  -- pending / approved / suspended
  suggested_by uuid    references profiles(id),
  avatar_url   text,
  note         text,
  created_at   timestamptz default now()
);

-- ── 12. TECHNICIAN_SERVICES (บริการช่าง) ───────────────────────────
create table if not exists technician_services (
  id         uuid primary key default gen_random_uuid(),
  tech_id    uuid    references technicians(id) on delete cascade,
  skill      text    not null,
  price_min  numeric default 0,
  price_max  numeric default 0,
  price_note text
);

-- ── 13. MARKETPLACE (ตลาดชุมชน) ────────────────────────────────────
create table if not exists marketplace (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid references houses(id),
  title        text not null,
  detail       text,
  category     text,
  listing_type text    default 'sell',
  -- sell / free / rent / wanted
  price        numeric default 0,
  contact      text,
  image_url    text,
  status       text    default 'pending',
  -- pending / approved / sold / cancelled
  created_at   timestamptz default now()
);

-- ── 14. WORK_REPORTS (ผลงานนิติ) ────────────────────────────────────
create table if not exists work_reports (
  id           uuid    primary key default gen_random_uuid(),
  month        int     not null check (month between 1 and 12),
  year         int     not null,
  category     text    not null,
  -- บำรุงรักษา / ความสะอาด / ความปลอดภัย / กิจกรรม / สิ่งแวดล้อม
  summary      text    not null,
  detail       text,
  image_urls   text[]  default '{}',
  is_published boolean default false,
  created_by   uuid    references profiles(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (month, year)
);

-- ── 15. AUDIT_LOGS (บันทึกการเข้าใช้งาน) ───────────────────────────
create table if not exists audit_logs (
  id           uuid    primary key default gen_random_uuid(),
  user_id      uuid    references profiles(id) on delete set null,
  username     text    not null,
  role         text,
  action       text    not null,
  status       text    not null default 'success',
  -- success / failed
  acted_at     timestamptz default now(),
  ip_address   text,
  user_agent   text,
  target_table text,
  target_id    uuid,
  detail       text
);

create index if not exists idx_audit_logs_acted_at on audit_logs (acted_at desc);
create index if not exists idx_audit_logs_user_id  on audit_logs (user_id);
create index if not exists idx_audit_logs_action   on audit_logs (action);

-- ── 16. SYSTEM_CONFIG (ตั้งค่าระบบ — แทน settings) ────────────────
create table if not exists system_config (
  id                      uuid    primary key default gen_random_uuid(),
  -- Section 1: ข้อมูลนิติบุคคล
  village_name            text    default 'The Greenfield',
  village_logo_url        text,
  village_logo_path       text,
  juristic_name           text    default 'นิติบุคคลหมู่บ้านเดอะกรีนฟิลด์',
  juristic_phone          text    default '02-123-4567',
  juristic_email          text    default 'niti@greenfield.co.th',
  juristic_signature_url  text,
  juristic_signature_path text,
  bank_name               text    default 'กสิกรไทย',
  bank_account_no         text,
  bank_account_name       text    default 'นิติบุคคลหมู่บ้าน เดอะกรีนฟิลด์',
  -- Section 2: การคำนวณค่าส่วนกลาง
  fee_rate_per_sqw        numeric default 85,
  fee_periods_per_year    int     default 2,
  fee_due_day             int     default 31,
  waste_fee_per_period    numeric default 100,
  parking_fee_per_vehicle numeric default 200,
  early_pay_discount_pct  numeric default 3,
  overdue_fine_pct        numeric default 10,
  overdue_grace_days      int     default 30,
  notice_fee              numeric default 200,
  invoice_message         text    default 'กรุณาชำระภายในวันที่กำหนด หากพ้นกำหนดจะคิดค่าปรับ 10%',
  -- Section 3: โซน / เฟส
  zone_count              int     default 2,
  total_houses            int     default 128,
  common_parking_slots    int     default 30,
  -- Section 4: ตั้งค่าระบบ
  enable_marketplace      boolean default true,
  enable_technicians      boolean default true,
  date_format             text    default 'DD/MM/YYYY (พ.ศ.)',
  system_language         text    default 'ภาษาไทย',
  updated_at              timestamptz default now(),
  updated_by              uuid    references profiles(id)
);

insert into system_config default values;

-- VIEW: public config สำหรับ resident
create or replace view public_config as
  select
    village_name, village_logo_url, juristic_name, juristic_phone,
    juristic_signature_url,
    bank_name, bank_account_no, bank_account_name,
    invoice_message, date_format, system_language
  from system_config
  limit 1;

-- ── TRIGGER: อัปเดต updated_at ─────────────────────────────────────
create or replace function update_config_timestamp()
returns trigger as $$
>>>>>>> fbdbe30cb826a7a75357f341a6cabfcd5b9e3ec2
begin
  new.updated_at = now();
  return new;
end;
<<<<<<< HEAD
$$;

create trigger set_updated_at
  before update on public.projects
  for each row execute function public.update_updated_at();

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();
=======
$$ language plpgsql;

create trigger trg_config_updated
  before update on system_config
  for each row execute function update_config_timestamp();

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────
alter table houses              enable row level security;
alter table profiles            enable row level security;
alter table vehicles            enable row level security;
alter table fees                enable row level security;
alter table payments            enable row level security;
alter table payment_items       enable row level security;
alter table issues              enable row level security;
alter table issue_logs          enable row level security;
alter table violations          enable row level security;
alter table technicians         enable row level security;
alter table technician_services enable row level security;
alter table marketplace         enable row level security;
alter table announcements       enable row level security;
alter table work_reports        enable row level security;
alter table audit_logs          enable row level security;
alter table system_config       enable row level security;

-- Admin เข้าถึงได้ทุกอย่าง
create policy "admin_all" on houses
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on vehicles
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on fees
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on payments
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all_payment_items" on payment_items
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on issues
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on issue_logs
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on violations
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all_work_reports" on work_reports
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_read_audit_logs" on audit_logs
  for select using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all_config" on system_config
  for all using ((select role from profiles where id = auth.uid()) = 'admin');

-- ลูกบ้านเห็นเฉพาะข้อมูลบ้านตัวเอง
create policy "resident_own" on houses
  for select using (
    id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_own" on vehicles
  for select using (
    house_id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_own" on fees
  for select using (
    house_id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_own" on payments
  for select using (
    house_id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_own_payment_items" on payment_items
  for select using (
    house_id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_insert_own_payment_items" on payment_items
  for insert with check (
    house_id = (select house_id from profiles where id = auth.uid())
    and exists (
      select 1
      from payments p
      where p.id = payment_id
        and p.house_id = (select house_id from profiles where id = auth.uid())
    )
  );
create policy "payment_items_open_access" on payment_items
  for all to public
  using (true)
  with check (true);
create policy "resident_own_issues" on issues
  for all using (
    house_id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_view_logs" on issue_logs
  for select using (
    issue_id in (
      select id from issues
      where house_id = (select house_id from profiles where id = auth.uid())
    )
  );

-- ทุกคนที่ login เห็นข้อมูลสาธารณะ
create policy "all_read" on announcements
  for select using (auth.uid() is not null);
create policy "all_read" on technicians
  for select using (status = 'approved');
create policy "all_read" on technician_services
  for select using (true);
create policy "all_read" on marketplace
  for select using (status = 'approved');
create policy "resident_published_work_reports" on work_reports
  for select using (is_published = true and auth.uid() is not null);

-- ============================================================
-- Schema v2.2 — 16 ตาราง + 2 Views พร้อมใช้งาน
-- ============================================================

alter table public.profiles enable row level security;
alter table public.houses enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "houses_read_authenticated" on public.houses;
create policy "houses_read_authenticated"
on public.houses
for select
to authenticated
using (true);

drop policy if exists "houses_write_admin" on public.houses;
create policy "houses_write_admin"
on public.houses
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active = true
  )
);
>>>>>>> fbdbe30cb826a7a75357f341a6cabfcd5b9e3ec2
