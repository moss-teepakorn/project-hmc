create table if not exists public.user_pin_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  device_id text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_pin_devices_user_id on public.user_pin_devices(user_id);
create index if not exists idx_user_pin_devices_device_id on public.user_pin_devices(device_id);
create index if not exists idx_user_pin_devices_user_device_active on public.user_pin_devices(user_id, device_id, is_active);

alter table public.user_pin_devices enable row level security;

drop policy if exists user_pin_devices_public_all on public.user_pin_devices;
create policy user_pin_devices_public_all
on public.user_pin_devices
for all
to public
using (true)
with check (true);
