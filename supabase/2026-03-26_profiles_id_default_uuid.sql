-- Ensure profiles.id auto-generates UUID when client omits id
create extension if not exists pgcrypto;

alter table if exists profiles
  alter column id set default gen_random_uuid();
