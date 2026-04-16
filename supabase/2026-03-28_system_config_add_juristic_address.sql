alter table if exists public.system_config
  add column if not exists juristic_address text;

update public.system_config
set juristic_address = coalesce(juristic_address, '')
where juristic_address is null;
