import React from 'react'
import ReportMockPage from './reports/ReportMockPage'

const columns = [
  { key: 'houseNo', label: 'บ้านเลขที่' },
  { key: 'owner', label: 'เจ้าของบ้าน' },
  { key: 'period', label: 'งวดค้างชำระ' },
  { key: 'principal', label: 'เงินต้น' },
  { key: 'fine', label: 'ค่าปรับ' },
  { key: 'total', label: 'ยอดค้างรวม' },
]

const rows = [
  { id: 1, houseNo: '10/1', owner: 'สมชาย แสงดี', period: 'H2/2567', principal: '2,750', fine: '140', total: '2,890' },
  { id: 2, houseNo: '12/8', owner: 'สุดา ใจงาม', period: 'H1/2568', principal: '2,900', fine: '80', total: '2,980' },
  { id: 3, houseNo: '3/2', owner: 'วราภรณ์ มีชัย', period: 'H2/2567', principal: '2,600', fine: '160', total: '2,760' },
  { id: 4, houseNo: '18/3', owner: 'นพดล จันทร์ดี', period: 'H1/2568', principal: '3,100', fine: '90', total: '3,190' },
]

export default function AdminReportOverdue() {
  return (
    <ReportMockPage
      icon="📉"
      title="รายงานค้างชำระ"
      subtitle="Mockup สรุปหนี้ค่าส่วนกลาง"
      fileName="overdue-report-mockup"
      columns={columns}
      rows={rows}
    />
  )
}
