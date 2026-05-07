-- Add sort_order column to tasks for manual reordering
-- Note: 'order' is a reserved keyword in SQL, so we use 'sort_order' instead
alter table public.tasks
  add column if not exists sort_order numeric(12,4) not null default 0;

-- Create index for faster sorting
create index if not exists idx_tasks_sort_order on public.tasks(parent_id, sort_order);
