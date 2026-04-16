import React, { useEffect, useMemo, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import { getSystemConfig } from '../../lib/systemConfig'
import ReportMockPage from './reports/ReportMockPage'
import ReportExportButtons from './ReportExportButtons'
import { listPayments } from '../../lib/fees'

const columns = [
  { key: 'docNo', label: 'เลขที่เอกสาร' },
  { key: 'houseNo', label: 'บ้านเลขที่' },
  { key: 'ownerName', label: 'ชื่อ สกุล' },
  { key: 'period', label: 'งวด' },
  { key: 'itemLabels', label: 'รายการที่รับชำระ' },
  { key: 'amount', label: 'ยอดชำระ', type: 'number' },
  { key: 'method', label: 'ช่องทางชำระ' },
  { key: 'paidAt', label: 'วันที่ชำระ' },
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

function formatPeriod(period, year) {
  if (!period || !year) return '-'
  if (period === 'first_half') return `H1/${year + 543}`
  if (period === 'second_half') return `H2/${year + 543}`
  if (period === 'full_year') return `เต็มปี/${year + 543}`
  return `${period}/${year + 543}`
}

function getCurrentMonth() {
  return new Date().getMonth() + 1
}

function getCurrentYear() {
  return new Date().getFullYear()
}

export default function AdminReportViolationsSummary() {
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
      const data = await listPayments({ generalOnly: true })
      const filtered = (data || []).filter((payment) => {
        if (!payment.paid_at) return false
        const paidDate = new Date(payment.paid_at)
        const paidMonth = paidDate.getMonth() + 1
        const paidYear = paidDate.getFullYear()
        return paidYear === Number(year) && paidMonth >= Number(startMonth) && paidMonth <= Number(endMonth)
      })

      setRows(
        filtered.map((payment) => ({
          id: payment.id,
          docNo: payment.receipt_no || `PAY-${String(payment.id || '').slice(-6).padStart(6, '0')}`,
          houseNo: payment.houses?.house_no || '-',
          ownerName: payment.payer_name || payment.houses?.owner_name || payment.partners?.name || '-',
          period: formatPeriod(payment.fees?.period, payment.fees?.year),
          itemLabels: Array.isArray(payment.payment_items) && payment.payment_items.length > 0
            ? payment.payment_items
              .map((item) => item?.item_label)
              .filter(Boolean)
              .join(', ')
            : '-',
          amount: Number(payment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          amountRaw: Number(payment.amount || 0),
          method: payment.payment_method || '-',
          paidAt: payment.paid_at ? payment.paid_at.slice(0, 10) : '-',
        }))
      )
    } catch (err) {
      setRows([])
      setError(err?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล')
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
            <div className="ph-ico">📄</div>
            <div>
              <div className="ph-h1">รายงานการรับชำระเงิน</div>
              <div className="ph-sub">สรุปรายการรับชำระเงินที่ไม่ใช่ค่าส่วนกลาง</div>
            </div>
          </div>
          <div className="report-head-actions">
            <ReportExportButtons
              columns={columns}
              rows={rows}
              reportTitle="รายงานการรับชำระเงิน"
              filter={{
                startMonthLabel: monthOptions.find((m) => m.value === startMonth)?.label,
                endMonthLabel: monthOptions.find((m) => m.value === endMonth)?.label,
                year,
              }}
              sumAmount={sumAmount}
              logoUrl={setup.village_logo_url || '/assets/village-logo.svg'}
              footerLabel="ยอดรับชำระรวม"
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