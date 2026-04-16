-- Fee notice print logs
-- เก็บประวัติการพิมพ์ใบแจ้งเตือนรายใบแจ้งหนี้ (ครั้งที่ 1,2,3,...)

create table if not exists fee_notice_print_logs (
  id          bigserial primary key,
  fee_id       uuid not null references fees(id) on delete cascade,
  notice_no    integer not null check (notice_no > 0),
  print_mode   text not null default 'paper' check (print_mode in ('paper', 'pdf', 'image')),
  printed_by   uuid references profiles(id) on delete set null,
  printed_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create unique index if not exists fee_notice_print_logs_fee_notice_uq
  on fee_notice_print_logs(fee_id, notice_no);

create index if not exists fee_notice_print_logs_fee_id_idx
  on fee_notice_print_logs(fee_id);

create index if not exists fee_notice_print_logs_printed_at_idx
  on fee_notice_print_logs(printed_at desc);

alter table fee_notice_print_logs enable row level security;

drop policy if exists "allow_all_fee_notice_print_logs" on fee_notice_print_logs;

create policy "allow_all_fee_notice_print_logs"
  on fee_notice_print_logs
  for all
  using (true)
  with check (true);
