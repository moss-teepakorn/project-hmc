-- Add predecessor relation type and lag/lead days support for task dependencies.
alter table public.tasks
  add column if not exists related_task_type text not null default 'FS';

alter table public.tasks
  add column if not exists related_task_lag_days integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_tasks_related_task_type'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint chk_tasks_related_task_type
      check (related_task_type in ('FS', 'SS', 'FF', 'SF'));
  end if;
end $$;

-- Keep dependency attributes in a clean state when predecessor is empty.
update public.tasks
set related_task_type = 'FS',
    related_task_lag_days = 0
where coalesce(related_task, '') = '';