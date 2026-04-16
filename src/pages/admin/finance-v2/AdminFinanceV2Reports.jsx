import React from 'react'
import { useNavigate } from 'react-router-dom'
import './AdminFinanceV2.css'

const reportCards = [
  {
    title: 'รายงานจ่ายค่าส่วนกลาง',
    subtitle: 'สรุปรายการรับชำระค่าส่วนกลาง',
    path: '/admin/finance-v2/reports/payments',
    buttonClass: 'btn btn-p btn-sm',
  },
  {
    title: 'รายงานค้างชำระ',
    subtitle: 'สรุปยอดค้างชำระแยกตามบ้านและซอย',
    path: '/admin/finance-v2/reports/outstanding',
    buttonClass: 'btn btn-o btn-sm',
  },
  {
    title: 'รายงานค้างชำระเชิงสรุป',
    subtitle: 'ชุดรายงานค้างชำระแบบ Hybrid',
    path: '/admin/finance-v2/reports/overdue',
    buttonClass: 'btn btn-g btn-sm',
  },
  {
    title: 'รายงานค่าปรับ',
    subtitle: 'สรุปรายงานงานผิดระเบียบและค่าปรับ',
    path: '/admin/finance-v2/reports/violations-summary',
    buttonClass: 'btn btn-a btn-sm',
  },
  {
    title: 'รายงานรายจ่าย',
    subtitle: 'สรุปรายจ่ายและการเบิกจ่าย',
    path: '/admin/finance-v2/reports/expense-payments',
    buttonClass: 'btn btn-p btn-sm',
  },
]

export default function AdminFinanceV2Reports() {
  const navigate = useNavigate()

  return (
    <div className="pane on houses-compact fees-compact">
      <div className="ph report-head">
        <div className="ph-in report-head-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="ph-ico">📚</div>
            <div>
              <div className="ph-h1">ศูนย์รายงาน V2</div>
              <div className="ph-sub">ทางเข้าแบบ Hybrid สำหรับรายงานมาตรฐาน</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card report-filter-card admin-search-filter-card">
        <div className="cb">
          <div className="finance-v2-actions">
            <button className="btn btn-g btn-sm" onClick={() => navigate('/admin/finance-v2')}>กลับหน้าศูนย์การเงิน</button>
          </div>
        </div>
      </div>

      <div className="finance-v2">
        <div className="finance-v2-grid">
          {reportCards.map((card) => (
            <section className="finance-v2-card" key={card.path}>
              <div className="finance-v2-head">{card.title}</div>
              <div className="finance-v2-body">
                <div className="finance-v2-note">{card.subtitle}</div>
                <div className="finance-v2-actions">
                  <button className={card.buttonClass} onClick={() => navigate(card.path)}>เปิดรายงาน</button>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
