-- ============================================================
-- Greenfield VMS — Database Schema v2.1
-- สร้างวันที่: 2025-03-25
-- แก้ไขจาก v2.0: ค่าขยะและค่าจอดรถคิดตามจำนวนรถ/บ้าน
-- วิธีใช้: Copy ทั้งหมด วางใน Supabase SQL Editor กด Run
-- ============================================================

-- ── 1. SETTINGS (ตั้งค่าระบบ) ──────────────────────────────
create table settings (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  value       text,
  description text,
  updated_at  timestamptz default now()
);

insert into settings (key, value, description) values
  ('village_name',           'The Greenfield', 'ชื่อหมู่บ้าน'),
  ('fee_rate',               '10',             'อัตราค่าส่วนกลาง บาท/ตร.ว./เดือน'),
  ('waste_fee_per_vehicle',  '100',            'ค่าขยะต่อคัน/เดือน'),
  ('parking_fee_per_vehicle','300',            'ค่าจอดรถส่วนกลางต่อคัน/เดือน'),
  ('overdue_fine_rate',      '0.1',            'อัตราค่าปรับค้างชำระ (10%)'),
  ('notice_fee',             '200',            'ค่าทวงถาม/ครั้ง'),
  ('current_year',           '2568',           'ปี พ.ศ. ปัจจุบัน');

-- ── 2. HOUSES (ข้อมูลบ้าน) ──────────────────────────────────
create table houses (
  id              uuid    primary key default gen_random_uuid(),
  house_no        text    not null,
  soi             text,
  address         text,
  owner_name      text,
  resident_name   text,
  contact_name    text,
  phone           text,
  line_id         text,
  email           text,
  status          text    default 'normal',
  -- normal / overdue / suspended / lawsuit
  house_type      text    default 'อยู่เอง',
  -- อยู่เอง / เช่า / ว่าง
  area_sqw        numeric default 0,
  fee_rate        numeric default 10,
  -- annual_fee = fee_rate × 12 × area_sqw (คำนวณอัตโนมัติ)
  annual_fee      numeric generated always as (fee_rate * 12 * area_sqw) stored,
  note            text,
  created_at      timestamptz default now()
);

-- ── 3. PROFILES (ผู้ใช้งาน) ──────────────────────────────────
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text    default 'resident',
  -- admin / resident
  house_id   uuid    references houses(id),
  phone      text,
  avatar_url text,
  is_active  boolean default true,
  created_at timestamptz default now()
);

-- ── 4. VEHICLES (ยานพาหนะ) ──────────────────────────────────
-- หมายเหตุ: ค่าขยะและค่าจอดรถคำนวณจากตารางนี้
--   ค่าขยะ/บ้าน = waste_fee_per_vehicle × COUNT(vehicles ของบ้านนี้)
--   ค่าจอดส่วนกลาง = parking_fee_per_vehicle × COUNT(vehicles ที่ parking_location='ส่วนกลาง')
create table vehicles (
  id               uuid primary key default gen_random_uuid(),
  house_id         uuid references houses(id) on delete cascade,
  license_plate    text not null,
  province         text,
  brand            text,
  model            text,
  color            text,
  vehicle_type     text default 'car',
  -- car / motorcycle / other
  parking_location text default 'ในบ้าน',
  -- ในบ้าน / หน้าบ้าน / ส่วนกลาง
  parking_lock_no  text,
  parking_fee      numeric default 0,
  -- ดึงมาจาก settings.parking_fee_per_vehicle ถ้าจอดส่วนกลาง
  status           text    default 'active',
  -- active / pending / removed
  note             text,
  created_at       timestamptz default now()
);

-- ── VIEW: สรุปยอดรถและค่าใช้จ่ายต่อบ้าน ─────────────────────
-- ใช้ดึงข้อมูลคำนวณค่าขยะและค่าจอดรถอัตโนมัติตอนออกใบแจ้งหนี้
create view house_vehicle_summary as
select
  h.id                                         as house_id,
  h.house_no,
  h.soi,
  count(v.id)                                  as total_vehicles,
  count(v.id) filter (
    where v.parking_location = 'ส่วนกลาง'
    and v.status = 'active'
  )                                             as vehicles_common_parking,
  count(v.id) filter (
    where v.status = 'active'
  )                                             as active_vehicles
from houses h
left join vehicles v on v.house_id = h.id
group by h.id, h.house_no, h.soi;

-- ── 5. FEES (ใบแจ้งหนี้) ─────────────────────────────────────
-- fee_waste    = waste_fee_per_vehicle    × active_vehicles × เดือน
-- fee_parking  = parking_fee_per_vehicle × vehicles_common_parking × เดือน
create table fees (
  id                  uuid    primary key default gen_random_uuid(),
  house_id            uuid    references houses(id) on delete cascade,
  year                int     not null,
  period              text    default 'full_year',
  -- first_half / second_half / full_year
  invoice_date        date,
  due_date            date,
  status              text    default 'unpaid',
  -- unpaid / pending / paid / overdue

  -- รายการค่าใช้จ่าย
  fee_common          numeric default 0, -- ค่าส่วนกลาง
  fee_parking         numeric default 0, -- ค่าเช่าที่จอดรถ (จำนวนรถส่วนกลาง × ค่าจอด × เดือน)
  fee_waste           numeric default 0, -- ค่าขยะ (จำนวนรถทั้งหมด × ค่าขยะ × เดือน)
  fee_overdue_common  numeric default 0, -- ค่าส่วนกลางค้างจ่าย
  fee_overdue_fine    numeric default 0, -- ค่าปรับค้างจ่าย
  fee_overdue_notice  numeric default 0, -- ค่าทวงถามค้างจ่าย
  fee_fine            numeric default 0, -- ค่าปรับ
  fee_notice          numeric default 0, -- ค่าทวงถาม
  fee_violation       numeric default 0, -- ค่ากระทำผิด
  fee_other           numeric default 0, -- ค่าอื่นๆ

  -- รวมอัตโนมัติ
  total_amount        numeric generated always as (
    fee_common + fee_parking + fee_waste +
    fee_overdue_common + fee_overdue_fine + fee_overdue_notice +
    fee_fine + fee_notice + fee_violation + fee_other
  ) stored,

  note                text,
  created_at          timestamptz default now()
);

-- ── 6. PAYMENTS (บันทึกการชำระเงินแต่ละครั้ง) ───────────────
create table payments (
  id             uuid primary key default gen_random_uuid(),
  fee_id         uuid references fees(id) on delete cascade,
  house_id       uuid references houses(id),
  amount         numeric     not null,
  payment_method text        default 'transfer',
  -- transfer / cash / qr
  slip_url       text,
  paid_at        timestamptz not null default now(),
  verified_by    uuid        references profiles(id),
  verified_at    timestamptz,
  note           text
);

-- ── 7. ISSUES (แจ้งปัญหา) ────────────────────────────────────
create table issues (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid references houses(id) on delete cascade,
  title       text not null,
  detail      text,
  category    text,
  -- ไฟฟ้า / ประปา / ถนน / ความสะอาด / ความปลอดภัย / อื่นๆ
  status      text default 'pending',
  -- pending / in_progress / resolved / closed
  image_url   text,
  admin_note  text,
  rating      int  check (rating between 1 and 5),
  rating_note text,
  resolved_at timestamptz,
  created_at  timestamptz default now()
);

-- ── 8. ISSUE_LOGS (Timeline การแก้ไขปัญหา) ───────────────────
create table issue_logs (
  id        uuid primary key default gen_random_uuid(),
  issue_id  uuid references issues(id) on delete cascade,
  logged_by uuid references profiles(id),
  action    text not null,
  image_url text,
  logged_at timestamptz default now()
);

-- ── 9. VIOLATIONS (กระทำผิด) ─────────────────────────────────
create table violations (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid references houses(id) on delete cascade,
  type        text not null,
  detail      text,
  occurred_at date,
  image_url   text,
  status      text default 'pending',
  -- pending / resolved / cancelled
  due_date    date,
  admin_note  text,
  created_at  timestamptz default now()
);

-- ── 10. ANNOUNCEMENTS (ประกาศ) ───────────────────────────────
create table announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  content    text,
  type       text    default 'normal',
  -- urgent / normal / info
  image_url  text,
  is_pinned  boolean default false,
  created_by uuid    references profiles(id),
  created_at timestamptz default now()
);

-- ── 11. TECHNICIANS (ทำเนียบช่าง) ────────────────────────────
create table technicians (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text,
  line_id      text,
  rating       numeric default 0,
  review_count int     default 0,
  status       text    default 'pending',
  -- pending / approved / suspended
  suggested_by uuid    references profiles(id),
  avatar_url   text,
  note         text,
  created_at   timestamptz default now()
);

-- ── 12. TECHNICIAN_SERVICES (บริการและค่าแรงแต่ละประเภท) ─────
-- 1 ช่าง มีได้หลายบริการ แต่ละบริการมีช่วงราคาเป็น min-max
create table technician_services (
  id         uuid primary key default gen_random_uuid(),
  tech_id    uuid    references technicians(id) on delete cascade,
  skill      text    not null,
  -- ล้างแอร์ / ช่างไฟ / ช่างประปา / ทาสี ฯลฯ
  price_min  numeric default 0,
  price_max  numeric default 0,
  price_note text
  -- เช่น "รวมอุปกรณ์" / "ไม่รวมอะไหล่"
);

-- ── 13. MARKETPLACE (ตลาดชุมชน) ──────────────────────────────
create table marketplace (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid references houses(id),
  title        text not null,
  detail       text,
  category     text,
  listing_type text    default 'sell',
  -- sell / free / rent / wanted
  price        numeric default 0,
  contact      text,
  image_url    text,
  status       text    default 'pending',
  -- pending / approved / sold / cancelled
  created_at   timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ป้องกันลูกบ้านเห็นข้อมูลของบ้านอื่น
-- ============================================================
alter table houses              enable row level security;
alter table profiles            enable row level security;
alter table vehicles            enable row level security;
alter table fees                enable row level security;
alter table payments            enable row level security;
alter table issues              enable row level security;
alter table issue_logs          enable row level security;
alter table violations          enable row level security;
alter table technicians         enable row level security;
alter table technician_services enable row level security;
alter table marketplace         enable row level security;
alter table announcements       enable row level security;
alter table settings            enable row level security;

-- Admin เข้าถึงได้ทุกอย่าง
create policy "admin_all" on houses
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on vehicles
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on fees
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on payments
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on issues
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on issue_logs
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on violations
  for all using ((select role from profiles where id = auth.uid()) = 'admin');
create policy "admin_all" on settings
  for all using ((select role from profiles where id = auth.uid()) = 'admin');

-- ลูกบ้านเห็นเฉพาะข้อมูลบ้านตัวเอง
create policy "resident_own" on houses
  for select using (
    id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_own" on vehicles
  for select using (
    house_id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_own" on fees
  for select using (
    house_id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_own" on payments
  for select using (
    house_id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_own_issues" on issues
  for all using (
    house_id = (select house_id from profiles where id = auth.uid())
  );
create policy "resident_view_logs" on issue_logs
  for select using (
    issue_id in (
      select id from issues
      where house_id = (select house_id from profiles where id = auth.uid())
    )
  );

-- ทุกคนที่ login เห็นข้อมูลสาธารณะ
create policy "all_read" on announcements
  for select using (auth.uid() is not null);
create policy "all_read" on technicians
  for select using (status = 'approved');
create policy "all_read" on technician_services
  for select using (true);
create policy "all_read" on marketplace
  for select using (status = 'approved');

-- ============================================================
-- Schema v2.1 — 13 ตาราง + 1 View พร้อมใช้งาน
-- ============================================================
