-- Add effort_manday for task-level planned effort tracking
alter table public.tasks
  add column if not exists effort_manday numeric(12,3) not null default 0;
