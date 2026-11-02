# Project HMC

ระบบจัดการโครงการ HMC พัฒนาด้วย React, TypeScript, Vite และ Supabase

## โครงสร้าง

- `frontend/` แอปเว็บและ Supabase client
- `frontend/api/` Vercel serverless API functions
- `migrations/` database migrations ของ Project HMC
- `docs/supabase-schema.sql` schema reference

หน้าจอ Timesheet ต้อง apply migration `migrations/2026-11-02-create-personal-timesheets.sql` กับ Supabase ก่อนใช้งาน โดยข้อมูลจะถูกจำกัดให้อ่านและแก้ไขได้เฉพาะเจ้าของรายการผ่าน Row Level Security

## เริ่มต้นใช้งาน

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

กำหนด `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ใน `frontend/.env.local` ก่อนเชื่อมต่อ Supabase

## คำสั่งจากโฟลเดอร์หลัก

```bash
npm run dev
npm run build
npm run preview
npm run lint:modal-size
```

`npm run migrate:local` ใช้รัน database migrations ในเครื่อง ดูรายละเอียดการตั้งค่าเพิ่มเติมใน `docs/`.
