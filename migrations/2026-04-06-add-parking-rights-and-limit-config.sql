-- Add house parking rights and over-limit policy config
alter table if exists houses
  add column if not exists parking_rights integer;

update houses
set parking_rights = 1
where parking_rights is null;

alter table if exists houses
  alter column parking_rights set default 1;

alter table if exists system_config
  add column if not exists allow_exceed_parking_limit boolean;

update system_config
set allow_exceed_parking_limit = true
where allow_exceed_parking_limit is null;

alter table if exists system_config
  alter column allow_exceed_parking_limit set default true;
