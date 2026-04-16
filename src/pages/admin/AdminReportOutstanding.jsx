import React, { useEffect, useMemo, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import ReportMockPage from './reports/ReportMockPage'
import ReportExportButtons from './ReportExportButtons'
import { getSystemConfig } from '../../lib/systemConfig'
import { listFees, listPaymentTotalsByFeeIds } from '../../lib/fees'

const columns = [
  { key: 'soi', label: 'ซอย' },
  { key: 'houseNo', label: 'บ้านเลขที่' },
  { key: 'ownerName', label: 'ชื่อ-สกุล' },
  { key: 'period', label: 'งวด' },
  { key: 'commonOutstanding', label: 'ค่าส่วนกลางค้างชำระ', type: 'number' },
  { key: 'fineOutstanding', label: 'ค่าปรับค้างชำระ', type: 'number' },
  { key: 'noticeOutstanding', label: 'ค่าทวงถามค้างชำระ', type: 'number' },
  { key: 'otherOutstanding', label: 'อื่นๆ', type: 'number' },
  { key: 'outstanding', label: 'ยอดค้างรวม (บาท)', type: 'number' },
]

function formatPeriod(period, year) {
  if (!period || !year) return '-'
  if (period === 'first_half') return `H1/${year + 543}`
  if (period === 'second_half') return `H2/${year + 543}`
  if (period === 'full_year') return `เต็มปี/${year + 543}`
  return `${period}/${year + 543}`
}

export default function AdminReportOutstanding() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [setup, setSetup] = useState({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    getSystemConfig().then(setSetup).catch(() => {})
  }, [])

  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear()
    const options = []
    for (let y = thisYear + 2; y >= thisYear - 5; y -= 1) options.push(y)
    return options
  }, [])

  const sumAmount = useMemo(() => rows.reduce((sum, row) => sum + (row.outstandingRaw || 0), 0), [rows])

  const runReport = async () => {
    setError('')
    setLoading(true)
    try {
      const feeData = await listFees({ status: 'all', year })
      const feeIds = feeData.map((fee) => fee.id)
      const paymentTotals = await listPaymentTotalsByFeeIds(feeIds)
      const approved = paymentTotals.approved || {}

      const outstandingFees = (feeData || []).filter((fee) => {
        if (!fee || fee.status === 'cancelled') return false
        const total = Number(fee.total_amount || 0)
        const approvedAmount = Number(approved[fee.id] || 0)
        return total > 0 && approvedAmount < total
      })

      const mapped = outstandingFees.map((fee) => {
        const soi = fee.houses?.soi || ''
        const houseNo = fee.houses?.house_no || '-'
        const ownerName = fee.houses?.owner_name || '-'
        const total = Number(fee.total_amount || 0)
        const approvedAmount = Number(approved[fee.id] || 0)
        const outstanding = Math.max(0, total - approvedAmount)

        const common = Number(fee.fee_common || 0) + Number(fee.fee_overdue_common || 0)
        const fine = Number(fee.fee_fine || 0) + Number(fee.fee_overdue_fine || 0)
        const notice = Number(fee.fee_notice || 0) + Number(fee.fee_overdue_notice || 0)

        const exclude = new Set([
          'fee_common', 'fee_overdue_common',
          'fee_fine', 'fee_overdue_fine',
          'fee_notice', 'fee_overdue_notice',
        ])
        let other = 0
        for (const key of Object.keys(fee)) {
          if (!key.startsWith('fee_')) continue
          if (exclude.has(key)) continue
          if (key === 'fee_total' || key === 'fee_amount' || key === 'fee_sum') continue
          other += Number(fee[key] || 0)
        }

        return {
          id: fee.id,
          soi,
          houseNo,
          ownerName,
          period: formatPeriod(fee.period, fee.year),
          commonOutstanding: common.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          commonOutstandingRaw: common,
          fineOutstanding: fine.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          fineOutstandingRaw: fine,
          noticeOutstanding: notice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          noticeOutstandingRaw: notice,
          otherOutstanding: other.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          otherOutstandingRaw: other,
          outstanding: outstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          outstandingRaw: outstanding,
        }
      })

      const keyword = String(search || '').trim().toLowerCase()
      const finalRows = keyword
        ? mapped.filter((row) => (
          String(row.houseNo || '').toLowerCase().includes(keyword)
          || String(row.ownerName || '').toLowerCase().includes(keyword)
          || String(row.soi || '').toLowerCase().includes(keyword)
        ))
        : mapped

      finalRows.sort((left, right) => {
        const leftSoi = parseInt(String(left.soi || '').replace(/[^0-9]/g, ''), 10)
        const rightSoi = parseInt(String(right.soi || '').replace(/[^0-9]/g, ''), 10)
        const normalizedLeftSoi = Number.isFinite(leftSoi) ? leftSoi : Number.MAX_SAFE_INTEGER
        const normalizedRightSoi = Number.isFinite(rightSoi) ? rightSoi : Number.MAX_SAFE_INTEGER
        if (normalizedLeftSoi !== normalizedRightSoi) return normalizedLeftSoi - normalizedRightSoi
        return String(left.houseNo || '').localeCompare(String(right.houseNo || ''), 'th-TH', { numeric: true })
      })

      setRows(finalRows)
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
            <div className="ph-ico">📋</div>
            <div>
              <div className="ph-h1">รายงานค้างชำระ</div>
              <div className="ph-sub">สรุปยอดค้างชำระ แยกตามบ้านและซอย</div>
            </div>
          </div>
          <div className="report-head-actions">
            <ReportExportButtons
              columns={columns}
              rows={rows}
              reportTitle="รายงานค้างชำระ"
              filter={{ year, search }}
              sumAmount={sumAmount}
              logoUrl={setup.village_logo_url || '/assets/village-logo.svg'}
              footerLabel="ยอดค้างรวม"
            />
          </div>
        </div>
      </div>

      <div className="card report-filter-card">
        <div className="cb" style={{ padding: 12 }}>
          <form className="report-filter-grid report-filter-grid-3" onSubmit={(event) => { event.preventDefault(); runReport() }}>
            <label className="house-field" style={{ margin: 0 }}>
              <span>ค้นหา (ซอย / บ้าน / ชื่อ)</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="เช่น 99/7 หรือ สมชาย" />
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

      <ReportMockPage columns={columns} rows={rows} loading={loading} error={error} sumAmount={sumAmount} />
    </div>
  )
}