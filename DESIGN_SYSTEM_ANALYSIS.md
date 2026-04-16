# VMS Design System & Page Layouts Analysis

## 1. DESIGN SYSTEM OVERVIEW

### 1.1 Color Theming System
The system supports **7 complete theme variations**, each with primary, accent, warning, danger colors:

#### Available Themes:
1. **Normal (Navy)** — Primary navy blue (#1B4F72), accent green (#28B463)
2. **Dark** — Deep navy with blue accents (#4F9CF9), green accent (#34D399)
3. **Rose** — Pink sidebar (#C2185B), coral accent (#F06292)
4. **Sage** — Green sidebar (#2E7D52), green accent (#66BB6A)
5. **Sand** — Warm tan sidebar (#7D5A3C), gold accent (#D4A853)
6. **Violet** — Purple sidebar (#4527A0), purple accent (#7C4DFF)
7. **Teal / Coral / Mauve / Dusty Rose** — Extended palette options

#### Color Variables (CSS Custom Properties):
- `--bg` / `--bg2` — Background & secondary background (light/dark)
- `--card` / `--card2` — Card backgrounds
- `--sb` — Sidebar background
- `--pr` — Primary color (buttons, links, accents)
- `--ac` — Accent/Success color (green)
- `--wn` — Warning color (orange)
- `--dg` — Danger color (red)
- `--tx` — Text color
- `--mu` — Muted color (secondary text)
- `--bo` — Border color
- `--hg` — Gradient (used in hero sections & modals)

### 1.2 Typography & Spacing
- **Font Family:** Sarabun (Thai font) — Regular, 300, 400, 500, 600, 700, 800 weights
- **Base Font Size:** 15px (root)
- **Line Heights:** Compact (1.0–1.3 for titles), comfortable (1.6 for body text)

#### Border Radius Scale:
- `--r` = 12px (standard card/button radius)
- `--r-sm` = 8px (small elements)
- `--r-lg` = 18px (large containers)
- `--r-xl` = 22px (modals, hero sections)

#### Spacing Scale:
- 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 22px (consistent 2–4px increments)
- Margins/Padding: 10px (forms), 11px (cards), 13px (sections), 14px (grid gaps), 16px (standard padding)

#### Transitions:
- `--tr` = 0.18s ease (default smooth transition)
- Quick interactions: 0.1s–0.15s (hover, toggle effects)
- Modal animations: 0.28s cubic-bezier (bounce effect on entry)

#### Shadows:
- Light: `0 2px 12px rgba(0,0,0,.08)` (subtle cards)
- Medium: `0 6px 28px rgba(0,0,0,.14)` (cards, popovers)
- Heavy: Used for modals (0 -10px 60px for bottom sheets on mobile)

---

## 2. COMPONENT LIBRARY

### 2.1 Button System
```css
.btn-p     /* Primary (solid color) — Main CTAs */
.btn-a     /* Accent/Action (green) — Approve, success */
.btn-o     /* Outline (hollow) — Secondary actions */
.btn-g     /* Ghost (light bg) — Tertiary, neutral */
.btn-d     /* Danger (red gradient) — Delete, reject */
.btn-w     /* White/transparent — Overlay buttons */
.btn-sm    /* Small (padding: 6px 12px) */
.btn-xs    /* Extra small (padding: 4px 9px) */
```
- Border-radius: 9px (default), 8px (small), 6px (xs)
- Hover effects: elevation (translateY -1px), opacity, color change
- Font-weight: 700 (always bold)

### 2.2 Badge System
```css
.b-ok   /* Success/Active (green bg + text) */
.b-wn   /* Warning (orange bg + text) */
.b-dg   /* Danger (red bg + text) */
.b-pr   /* Primary (blue bg + text) */
.b-mu   /* Muted (gray bg + border) */
```
- Padding: 3px 9px
- Border-radius: 20px (pill-shaped)
- Font-size: 11px, font-weight: 700
- Used for status indicators, categories, tags

### 2.3 Status Indicator Badges (House Status)
```css
.hs-ok  /* Normal — Green (#D4EDDA) */
.hs-lt  /* Warning/Late — Orange (#FCF0D0) */
.hs-ss  /* Serious/Serious Status — Red (#FAD8D8) */
.hs-lw  /* Legal Warning — Dark Red (#3A1010) */
```
- Border: 1.5px solid (colored)
- Padding: 4px 12px
- Font-size: 11.5px, font-weight: 700
- Used in house listings, fee tables, status displays

### 2.4 Form Elements
```css
.fi        /* Text input */
.fs        /* Select dropdown (custom chevron SVG) */
.ft        /* Textarea (min-height: 80px) */
.fg        /* Form group (margin-bottom: 13px) */
.fl        /* Form label (font-size: 11.5px, uppercase) */
.fr2       /* Form row 2 cols (gap: 11px) */
.fr3       /* Form row 3 cols (gap: 11px) */
```
- Border: 1.5px solid var(--bo)
- Border-radius: 9px
- Padding: 9px 12px
- Focus: border changes to primary color + 3px halo shadow
- Icons: Custom "eye" icon for password toggle (absolute positioned)

### 2.5 Card Components
```css
.card      /* Standard card wrapper */
.ch        /* Card header (colored bg, white text) */
.ct        /* Card title (inside header) */
.cb        /* Card body (main content area) */
.tw        /* Table wrapper (horizontal scroll on mobile) */
```
- Card header background: Default to #1B4F72 (navy) or theme primary
- Padding: Header 13px 16px, Body 16px
- Shadow: Box-shadow var(--sh) on base card
- Border: 1.5px solid var(--bo)

### 2.6 Grid System
```css
.g1        /* 1 column (mobile first) */
.g2        /* 2 columns on tablets (640px+) */
.g3        /* 3 columns on desktop (900px+) */
.stats     /* 2 col on mobile, 2 on tablet, 4 on desktop (stat cards) */
.tech-grid /* Auto-fill grid (minmax 260px) for technician cards */
.mkt-grid  /* Auto-fill grid (minmax 200px) for marketplace cards */
```

### 2.7 Table Styling
- Header background: `var(--sb)` (sidebar color)
- Header text: White (#fff)
- Rows: Alternating odd/even with --card & --bg2
- Padding: 11px 14px (header), 10px 14px (cells)
- Cells: 1.5px border-bottom between rows
- Horizontal scroll on mobile (min-width: 520px for contents)

### 2.8 Badges for Requests/Items
- **Property Change Requests:** Badge with context color (rent, job, house, car)
- **Marketplace Listings:** 
  - `.ms-sale` (yellow) — Sale
  - `.ms-free` (green) — Free
  - `.ms-rent` (blue) — For Rent
  - `.ms-sold` (gray) — Sold Out

---

## 3. LAYOUT ARCHITECTURE

### 3.1 Overall Structure
```
├── Sidebar (fixed, 248px width on desktop)
├── Main
│   ├── Topbar (sticky, 56px height)
│   └── Page (scrollable content)
│       └── Views (admin / resident)
│           └── Panes (individual pages)
```

### 3.2 Sidebar
**Desktop:** Fixed left sidebar 248px wide, always visible  
**Mobile:** Off-screen by default, slides in on hamburger click, overlay behind

**Components:**
- **Logo Section:** 🏘️ icon + village name + version (20px padding, bottom border)
- **Role Indicator:** Colored pill with animated dot + "เจ้าหน้าที่นิติ" / "ลูกบ้าน"
- **Navigation Groups:**
  - Section headers: UPPERCASE, small text, spaced letters
  - Nav items: Icon (16px) + text + optional badge (negative space, red bg)
  - Active item: Green left border (3px) + highlighted bg + bold text
  - Hover: Subtle background change
- **Footer:** User profile + logout button

**Navigation Items (Admin):**
1. **หน้าหลัก (Home):** Dashboard, ข้อมูลบ้าน, ข้อมูลรถ, ค่าส่วนกลาง
2. **จัดการ (Management):** คำขอแก้ไข (badge: 7), ปัญหา (badge: 3), กระทำผิด, ประกาศ, ผลงาน, ทำเนียบช่าง, ตลาด
3. **ระบบ (System):** Config, ผู้ใช้งาน, Log

**Navigation Items (Resident):**
1. **หลัก (Home):** หน้าแรก, บ้านของฉัน, รถ, ค่าส่วนกลาง, แจ้งปัญหา, การแจ้งเตือน
2. **ข้อมูล (Info):** ประกาศ, ผลงาน, ทำเนียบช่าง, ตลาด
3. **บัญชี (Account):** โปรไฟล์

### 3.3 Topbar
**Height:** 56px (sticky)  
**Components:**
- **Left:** Hamburger icon (mobile only), page title with highlight color
- **Right:**
  - Theme picker (6 colored dots in pill container)
  - View toggle (Admin / ลูกบ้าน buttons)
  - Notification icon (🔔 with red dot)
  - Settings icon (⚙️)

**Title Format:** Primary title — Highlight subtitle (e.g., "Dashboard — ภาพรวม")

### 3.4 Page Header (Hero Section)
```css
.ph        /* Page hero section */
```
- **Style:** Gradient background (var(--hg)), rounded corners, subtle white circles as decoration
- **Structure:**
  - Icon (46px, semi-transparent white bg, rounded)
  - Title (21px font-weight 800, white)
  - Subtitle (small, semi-transparent white)
  - Content on right (flexbox, responsive)
- **Decorative Elements:** Semi-transparent white circles positioned absolutely (blur effect)
- **Common Actions:** Add new item, Print, Generate, Export buttons

---

## 4. UNIQUE PAGE LAYOUTS

### ADMIN SECTION

#### 4.1 Dashboard (p-admin-dash)
**Purpose:** KPI Overview & Quick Links

**Layout Components:**
1. **Page Hero** — Title "Dashboard ภาพรวม", date, stats in white
2. **KPI Cards (Stats)** — 4-column grid on desktop
   - 🏠 128 บ้านทั้งหมด
   - 💰 24 ค้างชำระ / ฿48,600
   - 📝 7 รออนุมัติ
   - 🔧 3 ปัญหา / ⭐4.6 คะแนน
3. **Chart Row 1** — 2-column grid
   - Chart: ยอดชำระ vs ค้าง (6 เดือน)
   - Chart: สถานะบ้านทั้งหมด (donut/pie)
4. **Chart Row 2** — 2-column grid
   - Chart: ยอดเก็บ vs ค้าง (ไตรมาส)
   - Chart: ปัญหาตามประเภท
5. **Quick Actions (2-col):**
   - Table: รายการด่วน (ประเภท / จาก / รายการ / สถานะ)
   - Alert Box: แจ้งเตือนล่าสุด (violations + issues list)

**Responsive:** Charts = 2 col on tablet, 1 col on mobile

---

#### 4.2 Houses (p-admin-houses)
**Purpose:** Master house listing, search, filter, edit

**Layout:**
1. **Page Hero** — "ข้อมูลบ้าน", add button
2. **Filter Bar:** Search input + 3 dropdowns (Status / Soi / Zone)
3. **Sortable Table:**
   - Headers: Soi | บ้านเลขที่ | เจ้าของ | เบอร์ | ตร.ว. | ค่าส่วนกลาง | สถานะ | Actions
   - Rows: Status badge (.hs-*), sort arrows on click
   - Sample data: Houses grouped by soi (natural sort: 2/8-4, 3/10-1, etc.)
   - Each row clickable → opens house detail modal

**Interactivity:**
- Click header to sort (↑ indicator)
- Filter dropdown changes visible rows
- Row click → Modal with house detail/edit

---

#### 4.3 Fees (p-admin-fees)
**Purpose:** Fee management, payment tracking, invoice generation

**Layout:**
1. **Page Hero** — "ค่าส่วนกลาง", Add, Print, Generate buttons
2. **Summary Stats** — 2-col:
   - ✅ 104 ชำระแล้ว (81.2%)
   - ❌ 24 ค้างชำระ (฿48,600)
3. **Year Selector + Filters:**
   - 3 year buttons (2568, 2567, 2566) — Click to switch
   - Period selector: ทุกงวด / ครึ่งปีแรก / ครึ่งปีหลัง
   - Status filter: ทุกสถานะ / ชำระแล้ว / ค้างชำระ / รอสลิป
   - Search input
4. **Fee Label** — "ปี 2568 — ครึ่งปีแรก | ชำระแล้ว 104 / ค้าง 24 / รอสลิป 5"
5. **Fees Table:**
   - Columns: บ้าน / เจ้าของ | งวด | ส่วนกลาง | จอดรถ | ขยะ | ปรับ | อื่นๆ | รวม | สถานะ | Actions
   - Rows colored by status (warning if overdue, red if dangerous)
   - Amount display: Color red if overdue (ค้าง), green if paid (ชำระแล้ว)

**Status Badges:** b-wn (รอสลิป), b-ok (ชำระแล้ว), b-dg (ค้างชำระ)

---

#### 4.4 Issues (p-admin-issues)
**Purpose:** Track maintenance requests, assign work, mark complete

**Layout:**
1. **Page Hero** — "จัดการปัญหา", ⭐4.6 rating
2. **Tabs:** 2 views
   - **🔧 กำลังดำเนินการ** (badge: 2)
   - **✅ ประวัติ** (completed items)
3. **Active Issues Table:**
   - Columns: เรื่อง / บ้าน | ซอย | วันที่แจ้ง | สถานะ | บันทึกล่าสุด | Actions
   - Row click → Modal (issue detail)
   - Status: b-dg (รอดำเนินการ), b-wn (กำลังดำเนินการ)
4. **History Table:**
   - Columns: เรื่อง / บ้าน | ซอย | วันแจ้ง | วันเสร็จ | สถานะ | คะแนน | Actions
   - Stars display: ★★★★★ (rating)

**Color Scheme:** 
- Warning/urgent: Orange badge (b-dg = danger red)
- In progress: Orange badge (b-wn)
- Completed: Green badge (b-ok)

---

#### 4.5 Violations/Violations Alerts (p-admin-vio)
**Purpose:** Track rule violations, send warnings with images/evidence

**Layout:**
1. **Page Hero** — "แจ้งกระทำผิด", new violation button
2. **Violations Table:**
   - Columns: บ้าน | เรื่อง | รายละเอียด | รูป | กำหนด | สถานะ | Actions (edit/view)
   - Row example: 10/1 | จอดรถขวางทาง | รายละเอียด | 2 รูป | 20 มี.ค. | b-wn | ✏️ แก้ไข
   - Status: b-wn (รอดำเนินการ), b-ok (แก้แล้ว)

**Violation Card (in modals):**
- Title: Large, red text
- Description: Body text
- Deadline badge: b-dg (red) with deadline date
- Images grid: 5-column grid of thumbnails (.vio-img)

---

#### 4.6 Requests (p-admin-req)
**Purpose:** Approve/reject all pending requests across categories

**Layout:**
1. **Page Hero** — "คำขอแก้ไข"
2. **Tabs:** 5 categories, each with badge count
   - 🏠 ข้อมูลบ้าน (1)
   - 🚗 ข้อมูลรถ (2)
   - 💳 สลิปค่าส่วนกลาง (5)
   - 🔨 ช่าง (2)
   - 🛒 ตลาด (3)

3. **Request Card (per type):**
   - Header: House number | Details | Status badge (b-wn)
   - Body: Form rows showing old → new values (old disabled, new editable by admin)
   - Buttons: ✓ Approve | ✗ Reject

**Types:**

**House Requests:**
- Old value disabled, new value editable by admin
- Admin can edit before approving

**Vehicle Requests:**
- 3-row form: Type, Plate, Color
- 3-row form: Brand 🔑, Model 🔑, Province
- 2-row form: Parking Type, Cost 🔑 (฿/month)
- Conditional display: "Other" brand input if selected

**Slip Requests:**
- House info + amount due
- Slip image preview (emoji or file icon)
- Approve = auto-generate receipt

**Technician Requests:**
- Name, phone, skills tags
- Admin edits, then approves

**Marketplace Requests:**
- Title, category, price, description
- Approve = list publicly

**Visual Markers (🔑):** Indicates admin-editable field

---

#### 4.7 Announcements (p-admin-ann)
**Purpose:** Create, manage, categorize announcements by year

**Layout:**
1. **Page Hero** — "ประกาศ / ข่าวสาร", add button
2. **Year Selector** — 3 year buttons (2568/2567/2566) with count
3. **Announcement Cards (by year):**
   - Header card: "📢 ประกาศปี 2568" (2 รายการ badge)
   - Each announcement:
     - Dot indicator: 🔴 ด่วน (urgent red), 🟢 ปกติ (normal green), 🔵 กิจกรรม (event blue)
     - Title: Bold, large
     - Body: Description (line-height 1.6)
     - Metadata: date, author
     - Attached images: Grid below text
     - Actions: Badge (ด่วน/กิจกรรม), Edit, Delete buttons

**Announcement Structure:**
```
[Dot] │ Title
      │ Description (2-3 lines)
      │ Date · By Admin
      │ [Image] [Image] ...
      │ [Tag] [Edit] [Delete]
```

---

#### 4.8 Reports / Achievements (p-admin-rep)
**Purpose:** Document monthly work/maintenance

**Layout:**
1. **Page Hero** — "ผลงานนิติ", add button
2. **Report Table:**
   - Columns: เดือน/ปี | หมวดหมู่ | สรุปผลงาน | รูป | Actions
   - Rows: Month/year (bold) | Category badge (b-pr for maintenance, b-wn for safety, b-ok for environment) | Description | Photo count badge | Edit button
   - Example: มีนาคม 2568 | บำรุงรักษา | ซ่อม ไฟ 12 จุด ตัดแต่งต้นไม้... | 5 รูป | ✏️ แก้ไข

---

#### 4.9 Users (p-admin-usr)
**Purpose:** User account management

**Layout:**
1. **Page Hero** — "ผู้ใช้งาน", add button
2. **Users Table:**
   - Columns: Username | ชื่อ | บ้าน | บทบาท | Login ล่าสุด | Actions
   - Username: Monospace code style
   - Role badge: b-mu (ลูกบ้าน), b-pr (Admin)
   - Last login: Date + time
   - Actions: Edit button

---

#### 4.10 Logs (p-admin-log)
**Purpose:** System access audit trail

**Layout:**
1. **Page Hero** — "ข้อมูล Log"
2. **Logs Table:**
   - Columns: # | ผู้ใช้ | บทบาท | วันที่ | เวลา | สถานะ
   - Status: b-ok (สำเร็จ), b-dg (ล้มเหลว)

---

#### 4.11 Technicians (p-admin-tech)
**Purpose:** Manage tech directory, skills, ratings

**Layout:**
1. **Page Hero** — "ทำเนียบช่าง", Add house, Approve (2), Add tech buttons
2. **Tabs:**
   - 📋 รายชื่อช่าง (12)
   - ⏳ รออนุมัติ (2)

3. **List Tab:**
   - **Filter Chip Bar:** Search + buttons (ทั้งหมด, ❄️แอร์, ⚡ไฟฟ้า, 🔧ประปา, 🏗️ก่อสร้าง, 🛠️อื่นๆ)
   - **Tech Card Grid** (auto-fill, minmax 260px):
     ```
     [Avatar emoji] │ Name
                     │ Phone · House Ref
                     │ ★★★★★ 5.0 (8 reviews)
                     │ [SkillTag] [SkillTag] ...
                     │ [Edit] [Delete]
     ```
   - Tags use color coding: ac-tag (blue—air), default (other)

---

#### 4.12 Marketplace (p-admin-market)
**Purpose:** Review and manage community marketplace listings

**Layout:**
1. **Page Hero** — "ตลาดชุมชน"
2. **Marketplace Grid** (auto-fill, minmax 200px):
   - Each card:
     - Image area (120px height, emoji or photo)
     - Status badge (top-right): ms-sale/free/rent/sold
     - Category badge: b-pr (furniture, vehicle, etc.)
     - Title (2-line clamp)
     - Price (large, primary color)
     - Meta: Type + info

3. **Status Toggle Buttons:**
   - 4 buttons: All | For Sale | Free | For Rent
   - Active button: dark bg + white text

---

#### 4.13 Config (p-admin-cfg)
**Purpose:** System settings, calculation rates, zones

**Layout:**
1. **Page Hero** — "Config ระบบ", Save button
2. **Collapsible Sections** (.cfg-sec):
   - Header (primary color bg + arrow icon): Title + expand/collapse
   - Body (hidden by default, shows on click):
     - **Section 1: หมู่บ้าน Info**
       - Village name, niti name, phone, email
       - Bank & account info
     - **Section 2: Fee Calculation**
       - Rate per sqm/year
       - Periods per year dropdown
       - Due date (day of month)
       - Garbage, parking, late fees, penalties
     - **Section 3: Zones/Phases**
       - Number of zones (1-4)
       - Total houses
       - Total parking spots
     - **Section 4: System Settings**
       - Toggle marketplace on/off
       - Toggle technician directory
       - Date format
       - Language

**Form Styling:**
- fr2 / fr3 (2-col, 3-col responsive rows)
- All inputs inline, label above
- Select dropdowns for multi-option config

---

### RESIDENT SECTION

#### 4.14 Resident Dashboard (p-res-dash)
**Purpose:** Personal home screen with alerts & quick stats

**Layout:**
1. **Page Hero** — "สวัสดี คุณสมชาย 👋", House location, outstanding balance in white
2. **Alert Banner** — Warning (b-wn) if payment due: "มียอดค้างชำระ ฿2,750"
3. **Quick Stats (3-col):**
   - 💳 ค้างชำระ
   - 🔧 ปัญหา (count)
   - ⚠️ การแจ้งเตือน (count)

4. **Fee Chart** — 
   - Title: 💳 ประวัติการชำระ 3 ปี
   - Canvas chart (historical payments)

5. **Content Grid (2-col):**
   - **Left: Announcements Card**
     - Header: 📢 ประกาศล่าสุด
     - Content: 2-3 announcement items (.ann format)
     - Click to open detail modal
   - **Right: Alerts/Violations Card**
     - Header: ⚠️ การแจ้งเตือน
     - Content: Active violations (.vio format)
     - Click to view details

---

#### 4.15 Resident House Detail (p-res-house)
**Purpose:** View & request edits to house profile & vehicles

**Layout:**
1. **Page Hero** — "ข้อมูลบ้านของฉัน", House location
2. **Status Banner** — Current status (.hs-ok / .hs-lt / etc.)
3. **Tabs:**
   - 🏠 ข้อมูลบ้าน
   - 🚗 ข้อมูลรถ

4. **House Info Tab (2-col):**
   - **Left: House Card**
     - Header: 🏠 ข้อมูลทั้งหมด | Edit button
     - Sections:
       - ที่อยู่ (not editable)
       - ผู้อาศัย (editable via request)
     - Info Grid: 2-col
       ```
       บ้านเลขที่ → 10/1      │ ขนาด → 52 ตร.ว.
       ซอย → ซอย 3          │ ค่าส่วนกลาง → ฿4,500
       ถนน → ถนนใหญ่ 1      │ เจ้าของ → สมชาย
       ...
       ```
   - **Right: Pending Requests Card**
     - Header: 📋 คำขอที่ส่งไป
     - Items: Request box (title | status badge | date)
     - Statuses: b-wn (pending), b-ok (approved)

5. **Vehicles Tab (2-col):**
   - **Left: Vehicles Card**
     - Header: 🚗 รถที่ลงทะเบียน | Add button
     - Each vehicle:
       ```
       🚗 │ Plate (Bangkok)
           │ Brand Model · Color · Location
           │ [Status badge] [Cost badge]
        
```
   - **Right: Vehicle Requests Card**
     - Pending vehicle modification requests

---

#### 4.16 Resident Fees (p-res-fee)
**Purpose:** Pay bills, view history, download receipts

**Layout:**
1. **Page Hero** — "ค่าส่วนกลาง"
2. **Hero Info Box** (fee-hero):
   - Label: "ยอดค้างชำระปัจจุบัน"
   - Large amount: ฿2,750 (primary color, 30px font)
   - Period: "ครึ่งปีแรก 2568 · กำหนด 31 มีนาคม 2568"
   - Buttons: 💳 แจ้งชำระ | 🖨️ พิมพ์

3. **Year Selector** — 3-column grid of year cards (.yc):
   ```
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │  2568   │ │  2567   │ │  2566   │
   │ ค้างชำระ│ │ชำระครบ  │ │จ่ายทั้งปี│
   │฿2,750  │ │✓ เรียบ  │ │✓ เรียบ  │
   │ค้าง     │ │ร้อย     │ │ร้อย (3%)│
   └─────────┘ └─────────┘ └─────────┘
   ```
   - .yc.on = border primary color, bg primary light

4. **Tabs:**
   - 📄 ใบแจ้งหนี้ (invoices)
   - ✅ ใบเสร็จ (receipts)

5. **Invoices Tab (2-col grid):**
   - Each invoice card:
     ```
     [Header] 📄 ครึ่งปีแรก 2568 │ [Status Badge]
     [Breakdown Rows]:
       ค่าส่วนกลาง (52 ตร.ว.)  →  ฿2,250
       ค่าจอดรถ               →  ฿400
       ค่าขยะ                 →  ฿100
       เงินค้าง                →  —
       ค่าปรับ 10%            →  — (red if due)
       ค่าทวงถาม              →  — (red if due)
       ค่ากระทำผิด            →  — (red if due)
     [Total Row] รวมทั้งสิ้น   →  ฿2,750 (bold, primary color)
     [Buttons] 💳 ชำระ | 🖨️ พิมพ์ | 🧾 ใบเสร็จ
     ```

6. **Receipts Tab (table):**
   - Columns: เลขใบเสร็จ | งวด | ยอด | วันที่ | Actions
   - Receipt #: Monospace code styling
   - Dates: Date only
   - Actions: Print button

---

#### 4.17 Resident Issues (p-res-issue)
**Purpose:** Report problems, track status, rate completion

**Layout:**
1. **Page Hero** — "แจ้งปัญหา", New issue button
2. **Tabs:**
   - 🔧 กำลังดำเนินการ (in-progress issues)
   - ✅ ประวัติ (completed)

3. **Active Issues (.iss cards):**
   ```
   [Title] ไฟส่องสว่างดับ
   [House] บ้าน 10/1
   [Status] [Badge: กำลังดำเนินการ]
   [Note] ส่งช่างไฟเข้าตรวจสอบแล้ว
   [Date] 12 มี.ค. 68
   [Action] 📋 ดำเนินการ button (opens modal)
   ```

4. **History Issues:**
   - Same format but with completion info
   - Rating stars after completion

---

#### 4.18 Resident Notifications (p-res-notif)
**Purpose:** View all violations & alerts sent to resident

**Layout:**
1. **Page Hero** — "การแจ้งเตือน"
2. **Violation Cards** (.vio):
   - Title: Bold, red text (⚠️ emoji)
   - Description: Gray text
   - Deadline: Red pill badge with date
   - Images: Grid of evidence photos
   - Status badge: b-wn (pending), b-ok (resolved)
   - Actions: Acknowledge, view details

---

#### 4.19 Resident News/Announcements (p-res-news)
**Purpose:** Read all community announcements

**Layout:**
1. **Page Hero** — "ประกาศ"
2. **Announcement Cards** (.ann):
   - Dot indicator + title + description + images + date/author
   - Click expands or opens modal for full detail

---

#### 4.20 Resident Technician Directory (p-res-tech)
**Purpose:** Search technicians, view ratings, request services

**Layout:**
1. **Page Hero** — "ทำเนียบช่าง", search
2. **Filter Chips** — Same as admin (air, electrical, plumbing, etc.)
3. **Tech Card Grid** — Same as admin
4. **Tech Detail (on click):**
   - Large avatar
   - Name, phone, house reference
   - Ratings & review count
   - Skills list (colored tags)
   - Action button: Contact / Book

---

#### 4.21 Resident Marketplace (p-res-market)
**Purpose:** Browse and post community items

**Layout:**
1. **Page Hero** — "ตลาดชุมชน", New listing button
2. **Filter/Search Bar** — Input + status buttons (All / Sale / Free / Rent)
3. **Market Grid** (auto-fill, minmax 200px) — Same as admin
4. **Listing Detail (on click):**
   - Full images
   - Description
   - Price (if applicable)
   - Seller info (house, phone)
   - Contact button
   - Report/flag options

---

#### 4.22 Resident Profile (p-res-profile)
**Purpose:** Manage personal account settings

**Layout:**
1. **Page Hero** — "โปรไฟล์"
2. **Settings Sections:**
   - Username (not editable)
   - Password change (current + new + confirm)
   - Personal info (phone, email)
   - Notification preferences (checkboxes for email, SMS, in-app)
   - Language preference
   - Save button

---

## 5. RESPONSIVE BEHAVIOR

### Desktop (1024px+)
- Sidebar always visible (fixed left)
- Multi-column grids fully expanded (4 col stats, 3 col grids)
- Table horizontal scroll disabled (unless very wide data)
- Modals centered, max-width 560px / 700px (wide)
- Topbar full-width with all options visible

### Tablet (640px–1023px)
- Sidebar hidden, hamburger menu
- Topbar with hamburger icon
- 2-column grids
- Dropdowns render as mobile selects
- Modals slightly narrower

### Mobile (< 640px)
- Full-screen sidebar (slides from left with overlay)
- Tables: Horizontal scroll enabled (min-width 520px for content)
- Grids: 1-column (or 2-col for stats/year cards)
- Forms: 1-column (fr2/fr3 collapse to single col)
- Modals: Bottom sheet style (rounded top corners, handle bar)
- Buttons: Full-width or less padding
- Font sizes: Slightly reduced
- Padding: 16px page padding, 12px form padding

### Breakpoints:
```css
@media(max-width: 480px)   /* Extra small phones */
@media(min-width: 640px)   /* Tablet start */
@media(min-width: 768px)   /* Tablet mid */
@media(min-width: 900px)   /* Desktop grid changes */
@media(min-width: 1024px)  /* Desktop sidebar always visible */
```

---

## 6. INTERACTIVE ELEMENTS & ANIMATIONS

### Transitions
- `--tr = 0.18s ease` (default)
- Background color changes: 0.15s
- Transform (scale, translate): 0.1s–0.15s
- Modal animations: 0.28s cubic-bezier(.34,1.26,.64,1) — bounce effect

### Hover Effects
- **Buttons:**
  - Primary `.btn-p:hover` → translateY(-1px) (lift effect)
  - Others → opacity change or color shift
- **Cards:** 
  - `.card:hover` → subtle shadow increase, slight scale
- **Nav Items:**
  - `.sb-item:hover` → background highlight
- **Chips/Badges:**
  - `.filter-chip:hover` → color change

### Active States
- **Navigation:**
  - `.sb-item.act` → Green left border (3px) + bold text + colored bg
- **Tabs:**
  - `.tab.on` → Primary color text + bottom border (3px)
- **Year Selector:**
  - `.yc.on` → Primary border + primary light bg
- **Filter Chips:**
  - `.filter-chip.on` → Primary bg + white text

### Animations
- **Blinking Role Dot:** `.sb-role-dot` @ 2s infinite (opacity pulse)
- **Page Load:** `.pane.on` @keyframes fi { translateY(5px) → none } over 0.18s
- **Modal Entry:** `.mo.open` → `.md` translateY(30px) → 0 over 0.28s
- **Table Rows:** Alternating colors (subtle stripe effect)

---

## 7. MODAL DIALOGS

### Structure
- Background: Semi-transparent overlay (45% opacity, blur 5px)
- Modal: Rounded corners, card-style with shadow
- **Mobile:** Bottom sheet (rounded top, handle bar at top)
- **Desktop:** Centered, max 560px (wide = 700px)

### Common Modals
1. **m-house** — House detail/edit
2. **m-house-add** — Add new house
3. **m-editveh** — Edit vehicle
4. **m-issue-detail** — Issue status/work log
5. **m-issue-done** — Completed issue with rating
6. **m-newvio** — Create violation alert
7. **m-vio-edit** — Edit violation
8. **m-pay** — Payment submission
9. **m-news-detail** — Announcement full view
10. **m-newiss** — New issue report
11. **m-edithouse** — House info modification request
12. **m-addcar** — Add vehicle
13. **m-editcar** — Edit vehicle

### Modal Header
- Gradient background (var(--hg))
- Icon (36px, semi-transparent white)
- Title (white)
- Subtitle (semi-transparent white)
- Decorative white circles (absolute positioned)

### Modal Footer
- Top border (1.5px)
- Flex layout, right-aligned buttons
- Safe area padding for mobile (env(safe-area-inset-bottom))

---

## 8. UNIQUE UI PATTERNS

### Status Badges with Progression
- **House Status:** hs-ok (🟢 Normal) → hs-lt (🟡 Late) → hs-ss (🔴 Serious) → hs-lw (⚫ Legal)

### Color-Coded Request Types
- **House requests:** Primary color (blue)
- **Vehicle requests:** Primary color
- **Slip/Payment:** Warning color (orange)
- **Technician:** Primary color
- **Marketplace:** Warning color

### Visual Hierarchy in Tables
- **Important text:** Bold, primary color, larger font
- **Secondary info:** Small gray text below (house number under name)
- **Status:** Badge on right
- **Actions:** Button on far right

### Fee Breakdown (Resident View)
- Negative amounts shown in red with "+" prefix
- Subtotals in gray
- Final total in primary color, bold, larger

### Timeline (Issues/Requests)
- Vertical line with colored dots
- Completed: Green dot
- Active: Orange dot with glow effect
- Pending: Gray dot
- Labels on right side

### Skill/Tag System
- Colored pill badges
- `.ac-tag` = Blue/primary (air conditioning)
- `.wn-tag` = Orange (warning/other)
- `.dg-tag` = Red (danger/special)
- Varied emoji prefixes: ❄️ 🔧 ⚡ 🏗️ etc.

---

## 9. ACCESSIBILITY & UX FEATURES

### Focus States
- All interactive elements: 3px halo shadow (primary light color)
- Visible on tab navigation
- Clear visual feedback

### Keyboard Navigation
- Tab order: Logical (left-to-right, top-to-bottom)
- Tabindex not needed for semantic elements
- Form navigation: Tab through inputs, Enter to submit

### Color Contrast
- All text meets WCAG AA (4.5:1 minimum)
- Status colors have text override in dark mode
- White text on colored backgrounds guaranteed

### Responsive Touch Targets
- Minimum 44px × 44px for buttons (mobile)
- Adequate spacing between interactive elements
- Tap-friendly size for sidebar nav items

### Loading States
- Badge badges show counts
- Charts render with placeholder heights
- Tables show skeleton rows or populated rows

### Empty States
- Tables show "No data" message center
- Grids show placeholder cards or message
- Clear CTA to create first item

---

## 10. DESIGN TOKENS SUMMARY

### Color System
| Token | Light | Dark |
|-------|-------|------|
| Primary (--pr) | #1B4F72 | #4F9CF9 |
| Accent (--ac) | #28B463 | #34D399 |
| Warning (--wn) | #E67E22 | #FBBF24 |
| Danger (--dg) | #C0392B | #F87171 |
| Text (--tx) | #1A1A2E | #E2E8F0 |
| Muted (--mu) | #6B7280 | #64748B |
| Background (--bg) | #F4F6F9 | #0F1117 |

### Sizing
| Element | Size |
|---------|------|
| Sidebar Width | 248px |
| Topbar Height | 56px |
| Page Padding | 16px (mobile), 22px (tablet), 26px (desktop) |
| Border Radius | 8px–22px (--r-sm to --r-xl) |
| Icon Size | 16px–28px (various contexts) |
| Badge Padding | 3px 9px |
| Button Padding | 8px 16px (default), 6px 12px (sm), 4px 9px (xs) |

### Shadows
| Type | Value |
|------|-------|
| Light | 0 2px 12px rgba(0,0,0,.08) |
| Medium | 0 6px 28px rgba(0,0,0,.14) |
| Card | var(--sh) |

---

## Summary

The VMS system implements a **comprehensive design system** with:
- ✅ **7 complete color themes** (dark mode support)
- ✅ **Modular component library** (buttons, forms, badges, cards)
- ✅ **Responsive layout** (mobile-first, desktop-optimized)
- ✅ **Admin & Resident dual-interface** with different navigation
- ✅ **15+ unique page layouts** covering all VMS functions
- ✅ **Consistent spacing, typography, and animations** throughout
- ✅ **Accessible UI** (focus states, color contrast, touch targets)
- ✅ **Thai language support** with proper font rendering

All pages follow predictable patterns:
1. **Page Header** (gradient hero)
2. **Quick Actions/Stats** (KPI cards or summary)
3. **Content** (tables, grids, cards, modals)
4. **Responsive breakpoints** (mobile → tablet → desktop)
