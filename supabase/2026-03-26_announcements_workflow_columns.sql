-- Add announcement number/date metadata columns
alter table announcements
  add column if not exists announcement_no text,
  add column if not exists announcement_date date;

-- Backfill for old records
update announcements
set announcement_date = coalesce(announcement_date, created_at::date)
where announcement_date is null;

update announcements
set announcement_no = coalesce(announcement_no, 'ANN-' || to_char(coalesce(created_at, now()), 'YYYYMMDD') || '-' || lpad(substring(id::text from 1 for 4), 4, '0'))
where announcement_no is null;
