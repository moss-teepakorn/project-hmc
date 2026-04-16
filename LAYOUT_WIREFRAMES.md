# VMS Layout Wireframes & Component Specifications

## Page Layout Blueprints

### Master Layout Structure
```
┌─────────────────────────────────────────────────────────────────────┐
│                          TOPBAR (56px)                              │
│  ☰ │ [Page Title — Highlight]  │ [Theme Dots] [View Toggle] 🔔 ⚙️ │
├──────────────┬───────────────────────────────────────────────────────┤
│              │                                                        │
│  SIDEBAR     │                  MAIN CONTENT (Scrollable)            │
│  248px       │                                                        │
│  (Fixed on   │  [Page Hero / Header]                                │
│   Desktop)   │  [Content Grids/Tables/Cards]                        │
│              │  [Modals Overlay when open]                          │
│              │                                                        │
└──────────────┴───────────────────────────────────────────────────────┘
```

### Dashboard Page (Admin)
```
┌─ HERO ───────────────────────────────────────────────────────┐
│ 📊 │ Dashboard ภาพรวม              [+ Add] [Print] [Generate] │
│      The Greenfield · 15 มี.ค. 2568                           │
│      128 บ้าน | ⭐4.6 | ฿48.6K ค้าง                            │
└──────────────────────────────────────────────────────────────┘

┌─ STATS ──────────────────────────────────────────────────────┐
│ [🏠 128 หลัง] [💰 ค้าง 24] [📝 ต้อง 7] [🔧 ปัญหา 3] │
└──────────────────────────────────────────────────────────────┘

┌─ CHARTS  (2-col) ────────────────────────────────────────────┐
│ [Chart: Payment 6mo.] │ [Chart: House Status]                 │
└──────────────────────────────────────────────────────────────┘

┌─ CHARTS  (2-col) ────────────────────────────────────────────┐
│ [Chart: Quarterly Fee] │ [Chart: Issues by Type]              │
└──────────────────────────────────────────────────────────────┘

┌─ QUICK ACTIONS (2-col) ──────────────────────────────────────┐
│ [Table: Quick Requests     │ [Alerts Box: Recent Issues       │
│  • Type | From | Item      │  • Violation: Parking           │
│  • 📝 | 10/1 | Fee ฿2750  │  • Issue: Noise                 │
│ ]                         │ ]                                 │
└──────────────────────────────────────────────────────────────┘
```

### Houses Listing Page (Admin)
```
┌─ HERO ────────────────────────────────────┐
│ 🏠 │ ข้อมูลบ้าน             [+ Add House] │
│      128 หลัง                             │
└─ FILTERS ────────────────────────────────────┐
│ [Search] [Status ▼] [Soi ▼] [Zone ▼]       │
└─ TABLE ──────────────────────────────────────┐
│ Soi | No. ▲ | Owner | Phone | Sqm | Fee | Status | [Action] │
├───────────────────────────────────────────────┤
│ ซอย 2 │ 8/4 | ประสิทธ์ | ..078 | 48 | ฿3800 | ⚠️ ระงับ | [Edit] │
│ ซอย 3 │ 10/1| สมชาย  | ..5678| 52 | ฿4500 | ✓ ปกติ  | [Edit] │
│ ... (more rows)                              │
└────────────────────────────────────────────────┘
```

### Fees Management Page (Admin)
```
┌─ HERO ────────────────────────────────────────────────┐
│ 💰 │ ค่าส่วนกลาง        [+ Add] [Print] [Generate]   │
└─ STATS ───────────────────────────────────────────────┐
│ [✅ 104 ชำระแล้ว 81%] [❌ 24 ค้าง ฿48,600]           │
└─ YEAR SELECTOR + FILTERS ─────────────────────────────┐
│ [2568] [2567] [2566]  │ [Period ▼] [Status ▼] [Search] │
│ Label: ปี 2568 — ครึ่งปีแรก | ชำระ 104 / ค้าง 24     │
└─ TABLE ────────────────────────────────────────────────┐
│ บ้าน | งวด | ส่วนกลาง | จอดรถ | ขยะ | ปรับ | รวม | สถานะ │
├────────────────────────────────────────────────────────┤
│ 10/1 | H1  | ฿2250 | ฿400 | ฿100 | — | ฿2750 | 🟡 รอ  │
│ 8/4  | C67 | ฿1900 | —    | ฿100 | +฿390(red) | ฿2890 | 🔴 ค้าง │
└─────────────────────────────────────────────────────────┘
```

### Issues Management with Tabs (Admin)
```
┌─ HERO ────────────────────────────────────┐
│ 🔧 │ จัดการปัญหา           ⭐ 4.6        │
│      ปัญหาแจ้ง · ดำเนินการ               │
├─ TABS ────────────────────────────────────┤
│ [🔧 Active (2)] [✅ History]              │
├─ TABLE (Active) ──────────────────────────┤
│ Subject | Soi | Date | Status | Note | [Action] │
├────────────────────────────────────────────┤
│ ไฟส่อง│ ซ.3 │ 12.3 │ 🟡 ดำเนิน│ ช่างเข้า │[📋 Do]│
│ น้ำไม่│ ซ.6 │ 14.3 │ 🔴 รอ   │ —      │[📋 Do]│
└────────────────────────────────────────────┘
```

### Requests Page (Multi-Tab with Cards)
```
┌─ HERO ────────────────────────────────────┐
│ 📝 │ คำขอแก้ไข                           │
│      รวมทุก Pending — แสดงเฉพาะรออนุมัติ   │
├─ TABS ────────────────────────────────────┤
│ [🏠 House (1)] [🚗 Car (2)] [💳 Slip (5)]│
│ [🔨 Tech (2)]  [🛒 Market (3)]            │
├─ CONTENT ────────────────────────────────┤
│ ┌─ Request Card (warning bg) ──────────┐ │
│ │ [House 10/1 — สมชาย] [Status Badge]  │ │
│ │ Change: Email | Old: old@x | New: new@y│
│ │ [✓ Approve] [✗ Reject]               │ │
│ └──────────────────────────────────────┘ │
│ (Multiple similar cards per tab)         │
└────────────────────────────────────────────┘
```

### Violations Reporting Page (Admin)
```
┌─ HERO ────────────────────────────────────┐
│ ⚠️ │ แจ้งกระทำผิด          [+ New Alert] │
│      แจ้งเตือนลูกบ้านรายหลัง             │
├─ TABLE ───────────────────────────────────┐
│ บ้าน | เรื่อง | รายละเอียด | รูป | กำหนด | สถานะ │
├────────────────────────────────────────────┤
│ 10/1 |จอดรถ |ขวางประตู |2 รูป| 20/3|🟡 รอ |
│ 22/5 |เสียง |ดังหลัง 22 |1 รูป| 15/3|✓ แก้ │
└────────────────────────────────────────────┘
```

---

## Form Layout Patterns

### Two-Column Form (fr2)
```
┌──────────────────┬──────────────────┐
│ [Label]          │ [Label]          │
│ [Input]          │ [Input]          │
│                  │                  │
└──────────────────┴──────────────────┘
```
- Collapses to 1 column on mobile (< 480px)
- Gap: 11px between columns

### Three-Column Form (fr3)
```
┌──────────┬──────────┬──────────┐
│ [Label]  │ [Label]  │ [Label]  │
│ [Input]  │ [Input]  │ [Input]  │
└──────────┴──────────┴──────────┘
```
- Mobile: 1 column
- Tablet: 2 columns
- Desktop: 3 columns

### Information Grid (ig)
Used for read-only data display:
```
┌────────────────────┬────────────────────┐
│ Label              │ Value              │
│ (small, muted)     │ (bold, tx color)   │
├────────────────────┼────────────────────┤
│ Label 2            │ Value 2            │
└────────────────────┴────────────────────┘
```

---

## Card Component Variations

### Standard Card
```
┌─────────────────────┐
│ [Header] [Title] 🔨 │ ← Colored bg (default navy)
├─────────────────────┤
│ [Body Content]      │ ← White/card bg
│ • Text              │
│ • Lists             │
│ • Form fields       │
│ • Tables            │
│                     │
└─────────────────────┘
```

### Stat Card (sc)
```
┌────────────────────┐
│ [Icon]  Value      │
│ ┌──┐   ฿2,750      │
│ │  │   ค้างชำระ    │
│ └──┘   ↑ 3 new     │
│        (secondary) │
└────────────────────┘
```
- Icon: 40px, colored bg
- Value: 22px, bold
- Label: 12px
- Subtitle: 10px muted

### Announcement Card (ann)
```
┌─ [Dot] title              [badge] [edit] [del] ┐
│ Description text                               │
│ Small date & author info                       │
│                                                │
│ [Img] [Img] (if any)                          │
└────────────────────────────────────────────────┘
```
- Dot color: Red (urgent), Green (normal), Blue (event)
- Padding: 12px 14px
- Margin-bottom: 9px

### Issue/Violation Card (iss / vio)
```
┌────────────────────────────────┐
│ [Icon] Title        [Status]   │
│ Meta info (house, date)        │
│                                │
│ Description (gray text)        │
│ [Deadline Badge if relevant]   │
│ [[Images] if evidence provided] │
└────────────────────────────────┘
```

### Fee Card (Invoice view)
```
┌─ Title: ครึ่งปีแรก 2568    [บ้าง: ค้างชำระ] ┐
│                                              │
│ ค่าส่วนกลาง (52 ตร.ว.)     ฿2,250          │
│ ค่าจอดรถส่วนกลาง          ฿400            │
│ ค่าขยะ                    ฿100            │
│ เงินค้างชำระ              —               │
│ ค่าปรับ 10%               — (or ฿X in red)│
│ ค่าทวงถาม                 —               │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈                │
│ รวมทั้งสิ้น (bold, primary) ฿2,750         │
│                                              │
│ [💳 ชำระ] [🖨️ พิมพ์] [🧾 เสร็จ]          │
└──────────────────────────────────────────────┘
```

---

## Interactive Component States

### Buttons
```
Default:           Hover:             Active:
┌─────────┐       ┌─────────┐        ┌─────────┐
│ Primary │ ─→    │ Primary │  ─→    │ Primary │
└─────────┘  BG+1 │(Lift -1)│ Click  │(Shadow)│
             Shade└─────────┘        └─────────┘

Sizes: 
  btn-sm:  6px 12px  12px font
  btn-xs:  4px 9px   11px font
  default: 8px 16px  13px font
```

### Form Inputs
```
Default:            Focus:              Disabled:
┌──────────────┐   ┌──────────────┐    ┌──────────────┐
│ Placeholder  │   │ Value ▮      │    │ Value (gray) │
└──────────────┘   │ (Primary     │    └──────────────┘
                   │  border,      │    Dashed border,
                   │  3px halo)    │    70% opacity
                   └──────────────┘
```

### Toggle/Chip States
```
Off:                 On:
┌──────────┐        ┌──────────┐
│ Label    │  ─→    │ Label    │ (Primary bg, white text)
└──────────┘        └──────────┘
(Gray border,       (Primary bg,
 white/light bg)     white text)
```

### Tabs
```
Inactive:           Active:
Label  ┈┈┈          Label
       (gray)       ▁▁▁__ (primary color bar)
       (12px)       (bold, primary text)
```

### Status Badge State Machine
```
House Status:
┌─ hs-ok ──┐    ┌─ hs-lt ──┐    ┌─ hs-ss ──┐    ┌─ hs-lw ──┐
│ ● Normal │ →  │ ● Late   │ →  │ ● Serious│ →  │ ⚖️ Legal    │
│ 🟢 Green │    │ 🟡 Warn  │    │ 🔴 Red   │    │ ⚫ Black    │
└──────────┘    └──────────┘    └──────────┘    └────────────┘

Fee Status:
┌─ ชำระแล้ว ──┐    ┌─ รอสลิป ──┐    ┌─ ค้างชำระ ──┐
│ ✅ Green   │ →  │ 🟡 Warn  │ →  │ 🔴 Red      │
└─────────────┘    └──────────┘    └────────────┘

Issue Status:
┌─ รอดำเนิน ──┐    ┌─ กำลังดำเนิน ──┐    ┌─ เสร็จสิ้น ──┐
│ 🔴 Red     │ →  │ 🟡 Warn       │ →  │ ✅ Green     │
└─────────────┘    └───────────────┘    └───────────────┘
```

---

## Navigation Patterns

### Sidebar (Fixed Layout)
```
┌──────────────────────┐
│ 🏘️ Village Name      │ ← Logo (20px padding)
│    v12.3             │
├──────────────────────┤
│ 🟢 เจ้าหน้าที่นิติ    │ ← Role pill (animated dot)
├──────────────────────┤
│ หน้าหลัก ▲           │ ← Section header (uppercase)
│ 📊 Dashboard (active)│ ← Green left bar + bold
│ 🏠 ข้อมูลบ้าน        │
│ 🚗 ข้อมูลรถ          │
│ 💰 ค่าส่วนกลาง       │
│                      │
│ จัดการ               │ ← Next section
│ 📝 คำขอแก้ไข (7)    │ ← Red badge (important)
│ 🔧 ปัญหา (3)        │
│ ⚠️ กระทำผิด          │
│ 📢 ประกาศ            │
│ 🏆 ผลงาน             │
│ 🔨 ทำเนียบช่าง       │
│ 🛒 ตลาดชุมชน         │
│                      │
│ ระบบ ▼               │
│ ⚙️ Config            │
│ 👥 ผู้ใช้งาน         │
│ 📋 Log               │
├──────────────────────┤
│ 🚪 ออกจากระบบ       │ ← Footer
└──────────────────────┘
```

### Resident Sidebar
```
┌──────────────────────┐
│ [Same logo section]  │
├──────────────────────┤
│ 🟢 ลูกบ้าน           │
├──────────────────────┤
│ หลัก                 │
│ 🏡 หน้าแรก (home)   │
│ 🏠 บ้านของฉัน        │
│ 🚗 รถ                │
│ 💳 ค่าส่วนกลาง       │
│ 🔔 แจ้งปัญหา        │
│ ⚠️ การแจ้งเตือน      │
│                      │
│ ข้อมูล               │
│ 📢 ประกาศ            │
│ 🏆 ผลงาน             │
│ 🔨 ทำเนียบช่าง       │
│ 🛒 ตลาด              │
│                      │
│ บัญชี                │
│ 👤 โปรไฟล์           │
├──────────────────────┤
│ 🚪 ออกจากระบบ       │
└──────────────────────┘
```

---

## Modal Layouts

### Standard Modal (Desktop)
```
┌─ Header (gradient) ─────────────┐
│ [Icon] Title         [Subtitle] │
└─────────────────────────────────┤
│ [Body Content]                  │
│ • Form fields                   │
│ • Text                          │
│ • Images                        │
│ (scrollable if tall)            │
│                                 │
├─────────────────────────────────┤
│ [Fields optional]    [Buttons]  │ ← Footer
│                    [Primary] [Secondary]
└─────────────────────────────────┘
```

### Bottom Sheet Modal (Mobile)
```
  ┏━━━━━━━━━━━━━━━━━━━━━┓
  ┃    ▁▁▁ (handle)    ┃ ← 4px tall, 36px wide
  ┣━━━━━━━━━━━━━━━━━━━━━┫
  ┃ Title  [Subtitle] ┃ ← Always visible
  ┣━━━━━━━━━━━━━━━━━━━━━┫
  ┃ [Body Content]    ┃
  ┃ (scrollable)      ┃
  ┃                   ┃
  ┃                   ┃
  ┣━━━━━━━━━━━━━━━━━━━━━┫
  ┃      [Buttons]    ┃ ← Sticky footer
  ┃    [Safe area]    ┃ ← env(safe-area-inset-bottom)
  ┗━━━━━━━━━━━━━━━━━━━━┛
```

---

## Data Table Patterns

### Standard Table
```
┌─────────────────────────────────────────────────────────┐
│ Header 1 │ Header 2 │ Header 3 │ Header 4 │ Actions    │ ← Dark bg
├─────────────────────────────────────────────────────────┤
│ Value A  │ Value B  │ Value C  │ Value D  │ [Button]   │ ← Card bg
├─────────────────────────────────────────────────────────┤
│ Value A  │ Value B  │ Value C  │ Value D  │ [Button]   │ ← BG2 alt
├─────────────────────────────────────────────────────────┤
│ Value A  │ Value B  │ Value C  │ Value D  │ [Button]   │ ← Card bg
└─────────────────────────────────────────────────────────┘
```
- Rows alternate: odd = card, even = bg2
- Borders: 1.5px bottom on each row (except last)
- Header: White text on sidebar color (navy/colored)
- Padding: 11px 14px header, 10px 14px cells
- Sortable: Click header, arrow (▲) appears

### Responsive Table (Mobile)
```
On tablet/mobile, table becomes:
  - Horizontal scroll (min-width 520px for contents)
  - Custom scrollbar styling (4px height, dark color)
  - Touchable with -webkit-overflow-scrolling
  - All columns visible, user scrolls right
```

### Nested Data Table (House + Vehicles in row)
```
┌─ Main Row ────────────────────────┐
│ 10/1 │ สมชาย │ 081-234-5678       │
├─ Expandable ──────────────────────┤
│ Vehicles: 2                        │
│  • กข-1234 - Toyota Camry (white) │
│  • ขค-5678 - Honda PCX (black)    │
└────────────────────────────────────┘
```

---

## Grid System Breakdown

### 4-Column Stats Grid (Desktop)
```
[Stat 1] [Stat 2] [Stat 3] [Stat 4]
```
- Tablet (900px+): 4 columns
- Mid-tablet (600px): 2 columns
- Mobile: 2 columns

### 2-Column Content Grid (g2)
```
┌─────────────────┬─────────────────┐
│ [Left Content]  │ [Right Content] │
└─────────────────┴─────────────────┘
```
- Desktop (640px+): 2 columns
- Mobile: 1 column
- Gap: 14px

### 3-Column Content Grid (g3)
```
┌──────────┬──────────┬──────────┐
│ Card 1   │ Card 2   │ Card 3   │
└──────────┴──────────┴──────────┘
```
- Desktop (900px+): 3 columns
- Mobile/Tablet: 1 column
- Gap: 14px

### Auto-Fill Grid (tech-grid, market-grid)
```
[Grid: minmax(260px, 1fr)] ← Technician cards
[Grid: minmax(200px, 1fr)] ← Marketplace cards
```
- Responsive columns based on screen width
- Minimum width: 200–260px per item
- Gap: 12–14px

---

## Year/Period Selector Pattern

### Year Buttons (ycs / yc)
```
┌────────────┬────────────┬────────────┐
│   2568     │   2567     │   2566     │
│ ค้างชำระ  │ ชำระครบ   │ จ่ายทั้งปี │
│ ฿2,750     │ ✓ เรียบร้อย│ ✓ เรียบร้อย│
│ ค้าง       │            │            │
└────────────┴────────────┴────────────┘
```
- Active (on): Border = primary, BG = primary light
- Padding: 14px
- Border-radius: 12px
- Cursor: pointer
- Transition: all 0.18s

---

## Export & Print Styling

### Print-Specific CSS
```css
@media print {
  .sidebar, .topbar, .mo, .sb-overlay {
    display: none !important;
  }
  .main {
    margin-left: 0 !important;
    width: 100% !important;
  }
  .page {
    padding: 0 !important;
  }
  body {
    background: #fff;
  }
}
```

**Printable Elements:**
- Tables (responsive)
- Fee invoices
- House details
- Issue reports
- Announcements

---

## Breakpoint Summary

| Breakpoint | Name | Usage |
|------------|------|-------|
| 320–479px | Mobile XS | Extra small phones |
| 480–639px | Mobile | Standard phones |
| 640–899px | Tablet | Tablets, small screens |
| 900–1023px | Tablet L | Large tablets |
| 1024px+ | Desktop | Desktops, large screens |

**Key Changes at Each Breakpoint:**
- **<480px:** 1-col forms, modals full-screen bottom-sheet
- **640px:** 2-col grids activate, desktop modals center
- **900px:** 3-col & 4-col grids activate, stat cards expand
- **1024px:** Sidebar always visible, main content shifts right

---

## Animation Keyframes

### Page Load (fit-in / fi)
```css
@keyframes fi {
  from { transform: translateY(5px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.pane.on { animation: fi 0.18s ease; }
```

### Blinking Indicator
```css
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.sb-role-dot { animation: blink 2s infinite; }
```

### Modal Entry (bounce)
```css
.md { transform: translateY(30px); transition: transform 0.28s cubic-bezier(.34,1.26,.64,1); }
.mo.open .md { transform: translateY(0); }
/* Bounce effect caused by cubic-bezier overshoot */
```

---

## Icon System

### Icon Sizing
- **Sidebar icons:** 16px
- **Card headers:** 15px (inside ch-ico)
- **Page hero:** 24px (inside ph-ico)
- **Modal header:** 18px (inside md-hd-ico)
- **Stat cards:** 20px (inside sc-ico)
- **Large sections:** 28px–32px

### Icon Colors
- **Sidebar:** Current text color (muted/white)
- **Card headers:** Usually inherits (white on dark)
- **Inline icons:** Primary color or accent
- **Status icons:** Emoji (● ▲ ★ etc.)

### Icon Sources
- **Emoji:** 🏘️🏠🚗💰📝🔧⚠️📢🏆🔨🛒⚙️👥📋🚪
- **SVG:** Custom chevron for dropdowns
- **CSS Symbols:** ◀ ▶ ▲ ▼ ← → ◯ ● ○

---

## Responsive Images & Figures

### Avatar Styles
```css
.av               /* 32px circle, white text, 2px border */
.tech-avatar      /* 54px rounded square, emoji display */
.sb-logo-ico      /* 38px rounded square */
```

### Card Images
```css
.mcard-img        /* 140px height (mobile: 110px) */
.vio-img          /* 52px square grid items */
.rig              /* Report image grid - 5 col / 3 col mobile */
```

### Evidence/Photo Display
```css
.rig {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 7px;
}
@media(max-width: 400px) {
  grid-template-columns: repeat(3, 1fr);
}
.ri { aspect-ratio: 1; }
```

---

## Color Palette Application Guide

### When to Use Each Color:
- **Primary (--pr):** Links, primary buttons, active states, important data
- **Accent (--ac):** Success indicators, completed items, positive feedback
- **Warning (--wn):** Pending items, warnings, items needing attention
- **Danger (--dg):** Errors, violations, critical issues, deletions
- **Muted (--mu):** Secondary text, placeholder, disabled states
- **Border (--bo):** Dividers, form borders, subtle separations
- **Background (--bg/bg2):** Page background, secondary cards, table alternating rows

### Dark Mode Adjustments:
The system automatically adjusts all colors for dark mode via the `[data-theme="dark"]` selector on the `<body>` element. All color variables swap to dark-appropriate versions while maintaining contrast ratios.

