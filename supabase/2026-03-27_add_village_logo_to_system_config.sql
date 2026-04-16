-- Add village logo fields for login decorative logo upload
alter table if exists system_config
  add column if not exists village_logo_url text,
  add column if not exists village_logo_path text;

-- Expose village logo via public_config view
create or replace view public_config as
  select
    village_name,
    village_logo_url,
    juristic_name,
    juristic_phone,
    juristic_signature_url,
    bank_name,
    bank_account_no,
    bank_account_name,
    invoice_message,
    date_format,
    system_language
  from system_config
  limit 1;
