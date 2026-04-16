-- Add resident update + report workflow fields for violations
alter table violations
  add column if not exists resident_note text,
  add column if not exists resident_updated_at timestamptz,
  add column if not exists report_no text,
  add column if not exists report_date date,
  add column if not exists warning_count int default 0,
  add column if not exists fine_amount numeric default 0;

-- Optional: normalize status values
update violations
set status = 'in_progress'
where status in ('inprogress', 'in-progress', 'processing');

update violations
set status = 'not_fixed'
where status in ('notfix', 'not-fix', 'ignored', 'unresolved');
