# การตั้งค่า Email Reminder

โปรเจกต์นี้รองรับฟีเจอร์ส่งอีเมลแจ้งเตือนงานรายวัน โดยใช้ Gmail SMTP.

## โครงสร้างฐานข้อมูล

เพิ่มฟิลด์ดังต่อไปนี้ในตาราง `projects`:

- `email_notification_enabled BOOLEAN NOT NULL DEFAULT FALSE`
  - เปิด/ปิดระบบส่งอีเมลแจ้งเตือนรายวันสำหรับแต่ละโปรเจกต์
- `email_notification_mode VARCHAR(20) NOT NULL DEFAULT 'task' CHECK (email_notification_mode IN ('task','custom'))`
  - `task`: ส่งไปยังผู้รับผิดชอบงาน แล้ว fallback ไปยัง recipients ที่กำหนดเองเมื่อไม่มีผู้รับผิดชอบ
  - `custom`: ส่งเฉพาะไปยังอีเมลที่กำหนดเองเท่านั้น
- `email_notification_recipients TEXT NOT NULL DEFAULT ''`
  - เก็บรายชื่ออีเมลผู้รับ คั่นด้วยเครื่องหมายจุลภาค เช่น `somchai@domain.com,apichart@domain.com`
- `email_notification_time TIME NOT NULL DEFAULT '08:00'`
  - เวลาส่งรายวันตามเวลาของเซิร์ฟเวอร์
- `email_notification_last_sent_at TIMESTAMPTZ`
  - เก็บเวลาที่ระบบส่งอีเมลแจ้งเตือนล่าสุดสำหรับโปรเจกต์นั้น

มีการเพิ่มไฟล์ migration ที่ `migrations/2026-05-01-add-project-email-notification-settings.sql` แล้ว

## โครงสร้างฝั่ง frontend

โมเดล `Project` มีฟิลด์เพิ่มขึ้นดังนี้:

- `emailNotificationEnabled`
- `emailNotificationMode`
- `emailNotificationRecipients`
- `emailNotificationTime`
- `emailNotificationLastSentAt`

และหน้าจอแก้ไขโปรเจกต์ได้ขยายให้กำหนดค่าฟิลด์เหล่านี้ได้แล้ว

## บริการส่งอีเมล

เพิ่ม serverless API route ที่ `frontend/api/send-task-reminders.js`

เมื่อเรียกใช้งาน route นี้ จะทำงานดังนี้:

1. โหลดโปรเจกต์ทั้งหมดที่เปิดใช้การแจ้งเตือน
2. กรองโปรเจกต์ที่ถึงเวลาส่งแล้วและยังไม่ได้ส่งวันนี้
3. ดึงงานที่ตรงเงื่อนไข:
   - `percent_complete < 100`
   - `due_date <= today + 7 days`
4. สร้างตารางในอีเมล โดยมีข้อมูล:
   - Project ID
   - Project Name
   - Task
   - Due date
   - % complete
   - Status (`Overdue` / `Due Soon`)
5. ส่งอีเมลผ่าน Gmail SMTP
6. อัปเดต `email_notification_last_sent_at` เมื่อส่งสำเร็จ

## ตัวแปรสภาพแวดล้อม

เพิ่มค่าเหล่านี้ในไฟล์ environment ของ frontend:

- ถ้ามี `frontend/.env.local` ให้ใส่ในไฟล์นั้น
- ถ้าไม่มีและโปรเจกต์ใช้งาน `frontend/.env` อยู่แล้ว ให้ใส่ในไฟล์นั้นแทน

> ปกติ `.env.local` จะไม่ถูก commit ขึ้น git จึงปลอดภัยกว่า แต่ถ้าไม่มีไฟล์ดังกล่าว คุณสามารถใช้ `.env` ได้เช่นกัน

```env
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
REMINDER_API_SECRET=your-secret-key-for-reminder-api
GMAIL_USER=your-gmail-address@gmail.com
GMAIL_APP_PASSWORD=your-gmail-app-password
EMAIL_FROM="Project Tracking System <no-reply@yourdomain.com>"
EMAIL_REPLY_TO=your-reply-address@example.com
```

- `SUPABASE_SERVICE_KEY` คือ Supabase service role key สำหรับ API route นี้ โดยต้องใช้ key ที่มีสิทธิ์เขียนในฐานข้อมูล
- `REMINDER_API_SECRET` คือรหัสลับที่คุณตั้งขึ้นเองเพื่อป้องกันไม่ให้ใครเรียก API สาธารณะได้
  - ตัวอย่างเช่น `8f2b7c92d9e34a0b9f64c1d0a7e38f11`
  - สามารถใช้การสุ่ม string ยาว ๆ หรือเครื่องมือสร้างรหัสลับ
- `GMAIL_USER` คือบัญชี Gmail ที่จะใช้ส่งอีเมล
- `GMAIL_APP_PASSWORD` คือรหัสผ่านแบบ App Password ของบัญชี Gmail นั้น
- `EMAIL_FROM` คือที่อยู่ผู้ส่งที่จะแสดงในอีเมล
- `EMAIL_REPLY_TO` คือที่อยู่อีเมลสำหรับตอบกลับ หากต้องการให้ตอบกลับไปยังคนอื่น

### REMINDER_API_SECRET เอามาจากไหน

`REMINDER_API_SECRET` ไม่ได้เป็นคีย์ที่ Supabase สร้างให้โดยอัตโนมัติ คุณต้องกำหนดขึ้นเองจากผู้ใช้งาน
เช่น ใช้ `openssl rand -hex 32` หรือใช้ generator ของระบบ แล้วเก็บไว้ใน environment
เมื่อเรียก API ต้องส่งค่าเดียวกันนี้เข้าไปใน header `x-reminder-secret` หรือ query string
เพื่อให้ API route ยืนยันว่าเป็นคำสั่งที่มาจาก scheduler ที่เชื่อถือได้เท่านั้น

### หมายเหตุการตั้งค่า Gmail

- ต้องใช้บัญชี Gmail ที่สร้าง App Password
- ไปที่ Google Account เมนู `Security > App passwords` แล้วสร้างรหัสผ่านสำหรับ `Mail`
- ห้ามใช้รหัสผ่าน Gmail ปกติในการส่งอีเมล

## การตั้งเวลาส่ง

Route นี้ออกแบบมาให้เรียกโดย external scheduler ทุกวัน เช่น:

- Vercel Cron (ถ้ารองรับ)
- GitHub Actions
- cron-job.org
- cron ของเซิร์ฟเวอร์เอง

เรียก endpoint พร้อม secret header หรือ query string:

```bash
curl -X POST https://your-site.com/api/send-task-reminders \
  -H "x-reminder-secret: your-secret-key-for-reminder-api"
```

ควรตั้ง scheduler ให้เรียก endpoint ทุก 5-15 นาที เพื่อให้ระบบสามารถจับเวลาส่งที่กำหนดไว้ในโปรเจกต์ได้

## หมายเหตุ

- ตารางเวลาจะถูกประเมินตามเวลาเซิร์ฟเวอร์
- ถ้าโปรเจกต์ใช้โหมด `task` แต่ไม่พบ email ผู้รับผิดชอบ จะใช้ recipients ที่กำหนดเองแทน
- หัวเรื่องอีเมลจะเป็น: `Task Reminder Notification`
