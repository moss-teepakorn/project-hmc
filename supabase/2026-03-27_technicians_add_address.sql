-- Add single-line address field for technicians directory
alter table if exists technicians
  add column if not exists address text;
