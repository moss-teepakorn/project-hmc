-- ============================================================
-- Greenfield VMS — เพิ่ม 3 ตาราง (v2.2)
-- สร้างวันที่: 2025-03-25
-- วิธีใช้: Copy ทั้งหมด วางใน Supabase SQL Editor กด Run
-- หมายเหตุ: รัน หลังจาก schema_v2.1.sql เรียบร้อยแล้ว
-- ============================================================


-- ══════════════════════════════════════════════
-- TABLE 1: work_reports (ผลงานนิติ)
-- ที่มา: p-admin-rep + modal m-rep + p-res-work
-- ══════════════════════════════════════════════
create table work_reports (
  id           uuid    primary key default gen_random_uuid(),

  -- ข้อมูลหลักจาก modal m-rep
  month        int     not null check (month between 1 and 12),
  year         int     not null,
  category     text    not null,
  -- บำรุงรักษา / ความสะอาด / ความปลอดภัย / กิจกรรม / สิ่งแวดล้อม

  summary      text    not null,
  -- สรุปผลงาน (แสดงในตาราง p-admin-rep และ p-res-work)

  detail       text,
  -- รายละเอียดเพิ่มเติม (แสดงใน modal m-work-detail)

  image_urls   text[]  default '{}',
  -- รูปผลงานสูงสุด 10 รูป เก็บเป็น array ของ URL
  -- แสดงเป็น "5 รูป / 3 รูป / 7 รูป" ในตาราง

  is_published boolean default false,
  -- false = draft (ลูกบ้านยังไม่เห็น)
  -- true  = เผยแพร่แล้ว (ลูกบ้านเห็นใน p-res-work)

  created_by   uuid    references profiles(id),
  -- Admin ที่บันทึก — แสดงในประกาศ "โดย นิติ แอดมิน"

  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),

  -- ป้องกัน duplicate เดือน/ปีเดียวกัน
  unique (month, year)
);

-- RLS
alter table work_reports enable row level security;

-- Admin จัดการได้ทุกอย่าง
create policy "admin_all_work_reports" on work_reports
  for all using (
    (select role from profiles where id = auth.uid()) = 'admin'
  );

-- ลูกบ้านเห็นเฉพาะที่ publish แล้ว
create policy "resident_published_work_reports" on work_reports
  for select using (is_published = true and auth.uid() is not null);


-- ══════════════════════════════════════════════
-- TABLE 2: audit_logs (บันทึกการเข้าใช้งาน)
-- ที่มา: p-admin-log (บรรทัด 1941–1952)
-- columns เดิม: #, ผู้ใช้, บทบาท, วันที่, เวลา, สถานะ
-- ══════════════════════════════════════════════
create table audit_logs (
  id           uuid    primary key default gen_random_uuid(),

  -- ข้อมูลที่แสดงในตาราง p-admin-log
  user_id      uuid    references profiles(id) on delete set null,
  username     text    not null,
  -- snapshot เผื่อ user ถูกลบ — ยังหา log ย้อนหลังได้

  role         text,
  -- admin / resident — badge b-pr / b-mu ในตาราง

  action       text    not null,
  -- login / logout / login_failed
  -- approve / reject / save / delete / generate
  -- publish / change_password / change_config

  status       text    not null default 'success',
  -- success (badge b-ok สีเขียว)
  -- failed  (badge b-dg สีแดง) เช่น login ผิดรหัส

  acted_at     timestamptz default now(),
  -- แสดงเป็น col วันที่ + เวลา: "15 มี.ค. 09:30:12"

  -- ข้อมูลเสริมเพื่อความปลอดภัย (ไม่แสดงในตาราง แต่ใช้ตรวจสอบ)
  ip_address   text,
  user_agent   text,

  -- อ้างอิงสิ่งที่กระทำ
  target_table text,
  -- เช่น "fees", "houses", "vehicles", "config", "announcements"

  target_id    uuid,
  -- ID ของ record ที่กระทำ

  detail       text
  -- รายละเอียด เช่น "อนุมัติคำขอรถ กข-1234 บ้าน 10/1"
  --              เช่น "Generate ใบแจ้งหนี้ 128 หลัง ครึ่งปีแรก 2568"
  --              เช่น "เปลี่ยน fee_rate จาก 85 เป็น 90"
);

-- Index เพื่อให้ query เร็วขึ้น (กรอง/เรียงตามวันที่บ่อยมาก)
create index idx_audit_logs_acted_at on audit_logs (acted_at desc);
create index idx_audit_logs_user_id  on audit_logs (user_id);
create index idx_audit_logs_action   on audit_logs (action);

-- RLS — เฉพาะ Admin เห็น log ได้
alter table audit_logs enable row level security;

create policy "admin_read_audit_logs" on audit_logs
  for select using (
    (select role from profiles where id = auth.uid()) = 'admin'
  );

-- ระบบ (service role) เขียน log ได้ — ไม่จำกัด
-- การ insert log ทำจาก backend เท่านั้น ไม่ให้ user ทำเอง


-- ══════════════════════════════════════════════
-- TABLE 3: system_config (Setup ระบบ)
-- ที่มา: p-admin-cfg (บรรทัด 2219–2349) — 4 sections
-- ออกแบบเป็น singleton (1 แถวเดียว)
-- ══════════════════════════════════════════════
create table system_config (
  id           uuid    primary key default gen_random_uuid(),

  -- ─── Section 1: ข้อมูลนิติบุคคล / หมู่บ้าน ───────────────
  village_name       text    default 'The Greenfield',
  -- แสดงบน Login + Sidebar หัวหน้าเว็บ

  juristic_name      text    default 'นิติบุคคลหมู่บ้านเดอะกรีนฟิลด์',
  juristic_phone     text    default '02-123-4567',
  juristic_email     text    default 'niti@greenfield.co.th',
  bank_name          text    default 'กสิกรไทย',
  -- กสิกรไทย / ไทยพาณิชย์ / กรุงเทพ / กรุงไทย / ออมสิน / ทหารไทยธนชาต / อาคารสงเคราะห์
  bank_account_no    text,
  bank_account_name  text    default 'นิติบุคคลหมู่บ้าน เดอะกรีนฟิลด์',

  -- ─── Section 2: การคำนวณค่าส่วนกลาง ─────────────────────
  fee_rate_per_sqw      numeric default 85,
  -- อัตรา ฿/ตร.ว./ปี — ใช้คำนวณ annual_fee ใน houses

  fee_periods_per_year  int     default 2,
  -- 2 = ครึ่งปี / 4 = ไตรมาส / 12 = รายเดือน

  fee_due_day           int     default 31,
  -- วันกำหนดชำระงวดแรก (1-31)

  waste_fee_per_period  numeric default 100,
  -- ค่าขยะต่อหลัง/งวด (คูณจำนวนรถได้จากตาราง vehicles)

  parking_fee_per_vehicle numeric default 200,
  -- ค่าจอดรถส่วนกลาง ฿/คัน/เดือน

  early_pay_discount_pct  numeric default 3,
  -- ส่วนลดจ่ายทั้งปีล่วงหน้า (%) เช่น 3%

  overdue_fine_pct        numeric default 10,
  -- ค่าปรับเกินกำหนด (%/งวด) เช่น 10%

  overdue_grace_days      int     default 30,
  -- จำนวนวันหลังครบกำหนดก่อนเริ่มคิดปรับ

  notice_fee              numeric default 200,
  -- ค่าทวงถาม ฿/ครั้ง

  invoice_message         text    default 'กรุณาชำระภายในวันที่กำหนด หากพ้นกำหนดจะคิดค่าปรับ 10%',
  -- ข้อความบนใบแจ้งหนี้

  -- ─── Section 3: โซน / เฟส / พื้นที่ ──────────────────────
  zone_count              int     default 2,
  -- จำนวนโซน: 1 / 2(A,B) / 3(A,B,C) / 4

  total_houses            int     default 128,
  -- จำนวนบ้านทั้งหมดในโครงการ

  common_parking_slots    int     default 30,
  -- จำนวนที่จอดรถส่วนกลางทั้งหมด

  -- ─── Section 4: ตั้งค่าระบบ ───────────────────────────────
  enable_marketplace      boolean default true,
  -- เปิด/ปิด ฟีเจอร์ตลาดชุมชน

  enable_technicians      boolean default true,
  -- เปิด/ปิด ฟีเจอร์ทำเนียบช่าง

  date_format             text    default 'DD/MM/YYYY (พ.ศ.)',
  -- DD/MM/YYYY (พ.ศ.) / DD/MM/YYYY (ค.ศ.)

  system_language         text    default 'ภาษาไทย',
  -- ภาษาไทย / English

  -- ─── Meta ─────────────────────────────────────────────────
  updated_at   timestamptz default now(),
  updated_by   uuid        references profiles(id)
  -- Admin ที่กด "บันทึก Config" ล่าสุด
);

-- Insert ค่า default 1 แถว (singleton)
insert into system_config default values;

-- RLS
alter table system_config enable row level security;

-- Admin อ่าน/เขียนได้
create policy "admin_all_config" on system_config
  for all using (
    (select role from profiles where id = auth.uid()) = 'admin'
  );

-- ลูกบ้านอ่านได้เฉพาะค่าที่จำเป็น (village_name, bank_*, invoice_message)
-- ผ่าน view แยก ไม่ให้เห็น config ทั้งหมด
create view public_config as
  select
    village_name,
    juristic_name,
    juristic_phone,
    bank_name,
    bank_account_no,
    bank_account_name,
    invoice_message,
    date_format,
    system_language
  from system_config
  limit 1;


-- ══════════════════════════════════════════════
-- อัปเดต system_config เมื่อ updated_at เปลี่ยน
-- ══════════════════════════════════════════════
create or replace function update_config_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_config_updated
  before update on system_config
  for each row execute function update_config_timestamp();


-- ══════════════════════════════════════════════
-- ลบตาราง settings เดิม (ถูกแทนที่ด้วย system_config)
-- ══════════════════════════════════════════════
-- หมายเหตุ: uncomment บรรทัดด้านล่างหลังย้ายข้อมูลแล้ว
-- drop table if exists settings;


-- ══════════════════════════════════════════════
-- สรุป: เพิ่มแล้ว 3 ตาราง
-- work_reports (10 fields) + audit_logs (12 fields) + system_config (27 fields)
-- ══════════════════════════════════════════════
