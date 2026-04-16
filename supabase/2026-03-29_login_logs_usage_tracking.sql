-- Extend login_logs to track complete system usage events
-- Run this in Supabase SQL Editor

alter table if exists login_logs
  add column if not exists event_type text not null default 'login',
  add column if not exists page_path text,
  add column if not exists function_name text,
  add column if not exists ip_address text,
  add column if not exists browser text,
  add column if not exists user_agent text,
  add column if not exists device_type text,
  add column if not exists metadata jsonb;

create index if not exists login_logs_event_type_idx on login_logs(event_type);
create index if not exists login_logs_page_path_idx on login_logs(page_path);
create index if not exists login_logs_function_name_idx on login_logs(function_name);
create index if not exists login_logs_browser_idx on login_logs(browser);
