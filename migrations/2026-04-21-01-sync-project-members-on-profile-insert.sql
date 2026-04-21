-- Migration: sync project_members from members when a new profile is created
-- This ensures Member/Client users automatically become project members after signup.

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
