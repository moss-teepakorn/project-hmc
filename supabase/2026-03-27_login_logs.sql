-- Login Logs table — เก็บข้อมูลการเข้าสู่ระบบของผู้ใช้แต่ละคน
-- วิธีใช้: Copy ทั้งหมด วางใน Supabase SQL Editor กด Run

create table if not exists login_logs (
  id          bigserial primary key,
  user_id     uuid references profiles(id) on delete set null,
  username    text not null,
  full_name   text,
  role        text,
  login_at    timestamptz not null default now()
);

create index if not exists login_logs_user_id_idx  on login_logs(user_id);
create index if not exists login_logs_login_at_idx on login_logs(login_at desc);
create index if not exists login_logs_username_idx on login_logs(username);

-- RLS (permissive — ใช้ anon key เหมือนตารางอื่นๆ ในระบบ)
alter table login_logs enable row level security;

create policy "allow_all_login_logs"
  on login_logs
  for all
  using (true)
  with check (true);
