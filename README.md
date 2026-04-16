<<<<<<< HEAD
# ProjectMS v2 — Enterprise Project Management System

Multi-project management system built with **React 18 + TypeScript**, **Supabase PostgreSQL**, and **Zustand**.  
Font: **Poppins** · Theme: **Light / Dark mode**

---

## Features

| Module | Description |
|---|---|
| **Multi-Project Dashboard** | Card-based portfolio view with status filters, KPIs, and progress tracking |
| **Tasks + Gantt** | WBS hierarchy, drag & drop Gantt chart, auto-reschedule, inline edit |
| **Members** | Internal / Client team management with roles and allocation |
| **Milestones** | Phase-based payment tracking with billing status |
| **Effort Tracking** | Module x month manday grid, budget vs actual |
| **Change Requests** | Full workflow: Draft → Submitted → Review → Approved → Implemented → Closed |
| **Issue Tracking** | Log, assign, and track issues with status filtering |
| **Risk Management** | Probability x impact scoring with risk matrix |
| **Executive Report** | PDF export with KPIs, Gantt snapshot, and summaries |
| **Auth & RLS** | Supabase Auth with role-based access (Admin, PM, Member, Client) |
| **Real-time** | Live updates via Supabase Realtime subscriptions |
| **Dark Mode** | Toggle between light and dark themes |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript 5, Vite 5 |
| Styling | TailwindCSS 3, Poppins font |
| Gantt | Custom SVG (drag & drop) |
| State | Zustand 4 |
| Backend | Supabase (no custom backend) |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (JWT) |
| Real-time | Supabase Realtime |
| Deployment | GitHub + Vercel |

---

## Project Structure

```
project-ms/
├── frontend/
│   └── src/
│       ├── types/index.ts            ← TypeScript interfaces
│       ├── services/
│       │   ├── supabase.ts           ← Supabase client
│       │   └── api.ts                ← Data operations (all tables)
│       ├── store/index.ts            ← Zustand state management
│       ├── contexts/
│       │   ├── AuthContext.tsx        ← Supabase Auth provider
│       │   └── ThemeContext.tsx       ← Dark/light mode provider
│       ├── hooks/
│       │   └── useRealtime.ts        ← Realtime subscriptions
│       ├── utils/                    ← Date, tree, format helpers
│       └── components/
│           ├── Auth/AuthPage.tsx      ← Login / Sign up
│           ├── Common/               ← Design system (Card, Btn, Modal...)
│           ├── Layout/Navbar.tsx      ← Top nav + auth + theme toggle
│           ├── Dashboard/            ← Project list + detail + report
│           ├── Table/TasksTab.tsx    ← Task table + inline edit + export
│           ├── Gantt/GanttChart.tsx  ← SVG Gantt + drag to reschedule
│           ├── Members/              ← Member CRUD
│           ├── Milestones/           ← Milestone CRUD + payment tracker
│           ├── Effort/               ← Monthly manday grid
│           ├── ChangeRequest/        ← CR workflow management
│           ├── Issues/               ← Issue tracking
│           └── RiskRegister/         ← Risk management
│
├── supabase/
│   └── schema.sql                    ← Full database schema + RLS policies
│
├── package.json                      ← Root scripts
└── README.md
```

---

## Database Schema (Supabase PostgreSQL)

Run `supabase/schema.sql` in the Supabase SQL Editor to create all tables.

| Table | Description |
|---|---|
| `profiles` | User profiles (auto-created on signup) |
| `projects` | Project portfolio |
| `tasks` | WBS task hierarchy with dependencies |
| `members` | Project team members |
| `milestones` | Payment milestones by phase |
| `efforts` | Module effort budgets |
| `effort_monthly` | Monthly manday actuals |
| `change_requests` | Change request workflow |
| `cr_items` | CR line items |
| `issues` | Issue tracking |
| `risks` | Risk register |

### Security
- Row Level Security (RLS) enabled on all tables
- Admin role can access everything
- Authenticated users can view/manage projects
- Profile auto-created on signup via trigger

---

## Local Development Setup

### Step 1 — Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → Create new project
2. Go to **SQL Editor** → Run the contents of `supabase/schema.sql`
3. Go to **Settings → API** → Copy the Project URL and anon key

### Step 2 — Install Dependencies

```bash
npm run install:all
```

### Step 3 — Configure Environment

```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 4 — Run Development Server

```bash
npm run dev
```

Open browser: **http://localhost:5173**

---

## Deployment (Vercel)

1. Push code to GitHub
2. Import repo in Vercel → Root Directory: `frontend`
3. Framework: `Vite`
4. Set Environment Variables:
   ```
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
5. Deploy

---

## User Roles

| Role | Access |
|---|---|
| **Admin** | Full access to all projects and settings |
| **PM** | Manage projects and tasks |
| **Member** | Work on assigned tasks |
| **Client** | View-only access |

---

## Business Logic

### Duration
```
duration = endDate - startDate (days)
```

### Parent Task % Complete (Weighted Average)
```
parent % = Sum(child.% x child.duration) / Sum(child.duration)
```

### Auto-Reschedule (Finish-to-Start)
```
When Task A changes endDate:
  Task B (dependent on A).startDate = Task A.endDate
  Task B.endDate = Task B.startDate + Task B.duration
  → Cascades to downstream tasks
```

### Risk Score
```
Risk Score = Probability x Impact (Low/Medium/High matrix)
```

### Effort Remaining
```
Remaining MD = Budget MD - Sum(monthly manday)
```

---

## License

MIT © 2024 ProjectMS Enterprise
=======
# Greenfield VMS

ระบบจัดการหมู่บ้าน The Greenfield — v2.2

## Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Deploy**: Vercel

## วิธีตั้งค่า

### 1. Copy .env
```bash
cp .env.example .env
```

### 2. ใส่ค่า Supabase
เปิด `.env` แล้วใส่ค่าจาก Supabase Dashboard → Project Settings → API:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 3. ติดตั้ง dependencies (ถ้ารันในเครื่อง)
```bash
npm install
npm run dev
```

### 4. รันโปรเจกต์บนเครื่อง
```bash
npm start
```

หรือถ้าอยากดูแบบพรีวิวบน production build
```bash
npm run build
npm run preview
```

## Vercel Environment Variables
ใน Vercel Dashboard → Settings → Environment Variables ใส่:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## โครงสร้างโปรเจกต์
```
src/
├── lib/
│   └── supabase.js        # Supabase client
├── contexts/
│   └── AuthContext.jsx    # Auth state (user, profile, role)
├── pages/
│   ├── LoginPage.jsx
│   ├── admin/
│   │   └── AdminLayout.jsx
│   └── resident/
│       └── ResidentLayout.jsx
├── App.jsx                # Router + Auth provider
└── main.jsx
```
>>>>>>> fbdbe30cb826a7a75357f341a6cabfcd5b9e3ec2
