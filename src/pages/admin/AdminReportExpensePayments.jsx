import React, { useEffect, useMemo, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import ReportMockPage from './reports/ReportMockPage'
import ReportExportButtons from './ReportExportButtons'
import { listDisbursements } from '../../lib/disbursements'
import { getSystemConfig } from '../../lib/systemConfig'

const columns = [
  { key: 'voucherNo', label: 'เลขที่ใบจ่าย' },
  { key: 'payee', label: 'ผู้รับเงิน' },
  { key: 'expenseType', label: 'ประเภทค่าใช้จ่าย' },
  { key: 'amount', label: 'จำนวนเงิน', type: 'number' },
  { key: 'channel', label: 'ช่องทางจ่าย' },
  { key: 'paidAt', label: 'วันที่จ่าย' },
]

const monthOptions = [
  { value: 1, label: 'มกราคม' },
  { value: 2, label: 'กุมภาพันธ์' },
  { value: 3, label: 'มีนาคม' },
  { value: 4, label: 'เมษายน' },
  { value: 5, label: 'พฤษภาคม' },
  { value: 6, label: 'มิถุนายน' },
  { value: 7, label: 'กรกฎาคม' },
  { value: 8, label: 'สิงหาคม' },
  { value: 9, label: 'กันยายน' },
  { value: 10, label: 'ตุลาคม' },
  { value: 11, label: 'พฤศจิกายน' },
  { value: 12, label: 'ธันวาคม' },
]

function getCurrentMonth() {
  return new Date().getMonth() + 1
}

function getCurrentYear() {
  return new Date().getFullYear()
}

function fmtDate(value) {
  if (!value) return '-'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function fmtMethod(method) {
  if (method === 'transfer') return 'โอนเงิน'
  if (method === 'cash') return 'เงินสด'
  if (method === 'cheque') return 'เช็ค'
  return method || '-'
}

function getPayeeLabel(row) {
  if (row.recipient_type === 'house') {
    const houseNo = row.houses?.house_no || '-'
    const name = String(row.recipient_name || row.houses?.owner_name || '').trim()
    if (name.startsWith('บ้านเลขที่')) return name
    return name ? `บ้านเลขที่ ${houseNo} ${name}` : `บ้านเลขที่ ${houseNo}`
  }
  return String(row.recipient_name || row.partners?.name || '-').trim()
}

export default function AdminReportExpensePayments() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [startMonth, setStartMonth] = useState(getCurrentMonth())
  const [endMonth, setEndMonth] = useState(getCurrentMonth())
  const [year, setYear] = useState(getCurrentYear())
  const [setup, setSetup] = useState({})

  useEffect(() => {
    getSystemConfig().then(setSetup).catch(() => {})
  }, [])

  const yearOptions = useMemo(() => {
    const thisYear = getCurrentYear()
    const options = []
    for (let y = thisYear + 2; y >= thisYear - 5; y -= 1) options.push(y)
    return options
  }, [])

  const sumAmount = useMemo(() => rows.reduce((sum, row) => sum + (row.amountRaw || 0), 0), [rows])

  const runReport = async () => {
    setError('')
    if (startMonth > endMonth) {
      setRows([])
      setError('เดือนเริ่มต้นต้องไม่มากกว่าเดือนสิ้นสุด')
      return
    }

    setLoading(true)
    try {
      const data = await listDisbursements()
      const filtered = (data || []).filter((row) => {
        const baseDate = row.disbursement_date || row.created_at
        if (!baseDate) return false
        const date = new Date(baseDate.includes('T') ? baseDate : `${baseDate}T00:00:00`)
        const month = date.getMonth() + 1
        const yearValue = date.getFullYear()
        return yearValue === Number(year) && month >= Number(startMonth) && month <= Number(endMonth)
      })

      setRows(filtered.map((row) => ({
        id: row.id,
        voucherNo: row.id ? `EXP-${String(row.id).slice(0, 8).toUpperCase()}` : '-',
        payee: getPayeeLabel(row),
        expenseType: (row.disbursement_items || []).map((item) => item.item_label).filter(Boolean).join(', ') || '-',
        amount: Number(row.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        amountRaw: Number(row.total_amount || 0),
        channel: fmtMethod(row.payment_method),
        paidAt: fmtDate(row.disbursement_date),
      })))
    } catch (err) {
      setRows([])
      setError(err?.message || 'โหลดข้อมูลรายงานไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pane on houses-compact reports-compact">
      <div className="ph report-head">
        <div className="ph-in report-head-in">
          <div className="report-head-main">
            <div className="ph-ico">💸</div>
            <div>
              <div className="ph-h1">รายงานการจ่ายเงินออก</div>
              <div className="ph-sub">สรุปรายการจ่ายค่าใช้จ่ายของนิติบุคคล</div>
            </div>
          </div>
          <div className="report-head-actions">
            <ReportExportButtons
              columns={columns}
              rows={rows}
              reportTitle="รายงานการจ่ายเงินออก"
              filter={{
                startMonthLabel: monthOptions.find((m) => m.value === startMonth)?.label,
                endMonthLabel: monthOptions.find((m) => m.value === endMonth)?.label,
                year,
              }}
              sumAmount={sumAmount}
              logoUrl={setup.village_logo_url || '/assets/village-logo.svg'}
              footerLabel="ยอดจ่ายรวม"
            />
          </div>
        </div>
      </div>

      <div className="card report-filter-card">
        <div className="cb" style={{ padding: 12 }}>
          <form className="report-filter-grid report-filter-grid-4" onSubmit={(event) => { event.preventDefault(); runReport() }}>
            <label className="house-field" style={{ margin: 0 }}>
              <span>เดือนเริ่มต้น</span>
              <StyledSelect value={startMonth} onChange={(event) => setStartMonth(Number(event.target.value))}>
                {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </StyledSelect>
            </label>
            <label className="house-field" style={{ margin: 0 }}>
              <span>ถึงเดือน</span>
              <StyledSelect value={endMonth} onChange={(event) => setEndMonth(Number(event.target.value))}>
                {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </StyledSelect>
            </label>
            <label className="house-field" style={{ margin: 0 }}>
              <span>ปี</span>
              <StyledSelect value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {yearOptions.map((value) => <option key={value} value={value}>{value + 543}</option>)}
              </StyledSelect>
            </label>
            <div className="report-filter-action">
              <button className="btn btn-p" type="submit" style={{ minWidth: 120 }}>แสดงรายงาน</button>
            </div>
          </form>
          {error && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>{error}</div>}
        </div>
      </div>

      <ReportMockPage
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        sumAmount={sumAmount}
      />
    </div>
  )
}