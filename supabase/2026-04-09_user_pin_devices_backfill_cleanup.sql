begin;

-- Keep username in sync with profiles for reliable PIN lookup.
update public.user_pin_devices as upd
set
  username = lower(trim(p.username)),
  updated_at = now()
from public.profiles as p
where upd.user_id = p.id
  and (
    upd.username is null
    or btrim(upd.username) = ''
    or lower(btrim(upd.username)) <> lower(btrim(p.username))
  );

-- Normalize invalid counters that may exist from legacy rows.
update public.user_pin_devices
set
  failed_attempts = greatest(coalesce(failed_attempts, 0), 0),
  updated_at = now()
where failed_attempts is null or failed_attempts < 0;

-- If an old bug created multiple active rows for same user/device,
-- keep only the newest preferred row and deactivate others.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, device_id
      order by
        is_active desc,
        coalesce(updated_at, created_at, now()) desc,
        created_at desc,
        id desc
    ) as rn
  from public.user_pin_devices
)
update public.user_pin_devices as upd
set
  is_active = false,
  updated_at = now()
from ranked
where upd.id = ranked.id
  and ranked.rn > 1
  and upd.is_active = true;

-- Prevent future duplicate active PIN rows per user/device.
create unique index if not exists uq_user_pin_devices_active_per_device
on public.user_pin_devices(user_id, device_id)
where is_active = true;

commit;
