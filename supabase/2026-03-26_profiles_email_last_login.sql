-- Add profile fields for Admin Users screen
alter table if exists profiles
  add column if not exists email text,
  add column if not exists last_login_at timestamptz;

create index if not exists idx_profiles_email on profiles (email);
create index if not exists idx_profiles_last_login_at on profiles (last_login_at desc);
