-- Remove Supabase Auth dependency and switch to local profile-based login (bcrypt)
create extension if not exists pgcrypto;

-- 1) Revise profiles structure
alter table if exists profiles
  add column if not exists username text,
  add column if not exists password_hash text,
  add column if not exists failed_login_count int default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists password_changed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- Ensure optional fields exist for management screen
alter table if exists profiles
  add column if not exists email text,
  add column if not exists last_login_at timestamptz;

-- Fill username/password_hash for existing rows (one-time bootstrap)
update profiles
set username = coalesce(nullif(username, ''), 'user_' || substr(id::text, 1, 8));

update profiles
set password_hash = coalesce(nullif(password_hash, ''), crypt('ChangeMe123!', gen_salt('bf'))),
    password_changed_at = coalesce(password_changed_at, now());

-- Unique username + required auth fields
create unique index if not exists idx_profiles_username_unique on profiles (username);
create index if not exists idx_profiles_house_id on profiles (house_id);
create index if not exists idx_profiles_last_login_at on profiles (last_login_at desc);
create index if not exists idx_profiles_email on profiles (email);

alter table if exists profiles
  alter column username set not null,
  alter column password_hash set not null;

-- Drop FK to auth.users if still exists
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT tc.constraint_name
    INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'profiles'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

-- 2) Disable RLS (no Supabase Auth usage)
alter table if exists houses disable row level security;
alter table if exists profiles disable row level security;
alter table if exists vehicles disable row level security;
alter table if exists fees disable row level security;
alter table if exists payments disable row level security;
alter table if exists issues disable row level security;
alter table if exists issue_logs disable row level security;
alter table if exists violations disable row level security;
alter table if exists technicians disable row level security;
alter table if exists technician_services disable row level security;
alter table if exists marketplace disable row level security;
alter table if exists announcements disable row level security;
alter table if exists work_reports disable row level security;
alter table if exists audit_logs disable row level security;
alter table if exists system_config disable row level security;

-- NOTE:
-- Default password for migrated users is: ChangeMe123!
-- Please force users/admins to change password immediately after first login.
