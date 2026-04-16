import React, { useEffect, useMemo, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import Swal from 'sweetalert2'
import { getSystemConfig } from '../../lib/systemConfig'
import { getPaymentCycleConfigByYear } from '../../lib/paymentCycles'
import { calculateOverdueFeesByIds, listFees, processHalfYearFeesAllHouses } from '../../lib/fees'

function toBE(yearCE) {
  const year = Number(yearCE)
  if (!Number.isFinite(year)) return '-'
  return year + 543
}

function toGregorianYear(yearValue) {
  const year = Number(yearValue)
  if (!Number.isFinite(year) || year <= 0) return null
  return year > 2400 ? year - 543 : year
}

export default function AdminFeesBillingPenalty() {
  const [setup, setSetup] = useState({
    fee_rate_per_sqw: 85,
    waste_fee_per_period: 100,
    overdue_fine_pct: 10,
    notice_fee: 200,
  })
  const [processingInvoice, setProcessingInvoice] = useState(false)
  const [processingOverdue, setProcessingOverdue] = useState(false)
  const [processForm, setProcessForm] = useState({
    yearBE: String(new Date().getFullYear() + 543),
    period: 'first_half',
    overwritePending: false,
  })
  const [invoiceSummary, setInvoiceSummary] = useState(null)
  const [overdueSummary, setOverdueSummary] = useState(null)
  const [periodOptions, setPeriodOptions] = useState([
    { value: 'first_half', label: 'ครึ่งปีแรก (1/1 - 30/6)' },
    { value: 'second_half', label: 'ครึ่งปีหลัง (1/7 - 31/12)' },
  ])

  useEffect(() => {
    getSystemConfig().then(setSetup).catch(() => {})
  }, [])

  useEffect(() => {
    const syncPeriodOptions = async () => {
      const yearCE = toGregorianYear(processForm.yearBE)
      if (!yearCE) return

      try {
        const cycleConfig = await getPaymentCycleConfigByYear(yearCE)
        if (!cycleConfig || cycleConfig.frequency !== 'half_yearly') {
          setPeriodOptions([
            { value: 'first_half', label: 'ครึ่งปีแรก (1/1 - 30/6)' },
            { value: 'second_half', label: 'ครึ่งปีหลัง (1/7 - 31/12)' },
          ])
          return
        }

        const p1 = (cycleConfig.periods || []).find((row) => Number(row.seq_no) === 1)
        const p2 = (cycleConfig.periods || []).find((row) => Number(row.seq_no) === 2)

        const formatRange = (row, fallback) => {
          if (!row?.start_date || !row?.end_date) return fallback
          return `${row.period_label || fallback} (${row.start_date} - ${row.end_date})`
        }

        setPeriodOptions([
          { value: 'first_half', label: formatRange(p1, 'ครึ่งปีแรก') },
          { value: 'second_half', label: formatRange(p2, 'ครึ่งปีหลัง') },
        ])
      } catch {
        setPeriodOptions([
          { value: 'first_half', label: 'ครึ่งปีแรก (1/1 - 30/6)' },
          { value: 'second_half', label: 'ครึ่งปีหลัง (1/7 - 31/12)' },
        ])
      }
    }

    syncPeriodOptions()
  }, [processForm.yearBE])

  const processYearOptions = useMemo(() => {
    const currentBE = new Date().getFullYear() + 543
    return [currentBE + 1, currentBE, currentBE - 1, currentBE - 2, currentBE - 3]
  }, [])

  const handleProcessInvoices = async (event) => {
    event.preventDefault()
    const yearCE = toGregorianYear(processForm.yearBE)
    if (!yearCE) {
      await Swal.fire({ icon: 'warning', title: 'ปีไม่ถูกต้อง' })
      return
    }

    try {
      setProcessingInvoice(true)

      let overwrittenPending = 0
      if (processForm.overwritePending) {
        const [pendingRows, fullYearRows] = await Promise.all([
          listFees({ year: yearCE, period: processForm.period, status: 'pending' }),
          listFees({ year: yearCE, period: 'full_year', status: 'all' }),
        ])
        const fullYearHouseIds = new Set((fullYearRows || []).map((row) => row.house_id))
        overwrittenPending = (pendingRows || []).filter((row) => !fullYearHouseIds.has(row.house_id)).length
      }

      Swal.fire({
        title: 'กำลังสร้างใบแจ้งหนี้',
        text: 'กรุณารอสักครู่ ระบบกำลังประมวลผลข้อมูลทุกหลัง',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
        showConfirmButton: false,
      })

      const result = await processHalfYearFeesAllHouses({
        yearBE: Number(processForm.yearBE),
        period: processForm.period,
        setup,
        overwritePending: processForm.overwritePending,
      })

      Swal.close()

      const summary = {
        total: Number(result.totalHouses || 0),
        created: Number(result.created || 0),
        updated: Number(result.updated || 0),
        success: Number(result.created || 0) + Number(result.updated || 0),
        failed: 0,
        overwritten: Number(overwrittenPending || 0),
        skippedPaid: Number(result.skippedPaid || 0),
        skippedPending: Number(result.skippedPending || 0),
        skippedFullYear: Number(result.skippedFullYear || 0),
        cancelledFirstHalf: Number(result.cancelledFirstHalf || 0),
      }

      setInvoiceSummary(summary)

      await Swal.fire({
        icon: 'success',
        title: 'สร้างใบแจ้งหนี้สำเร็จ',
        html: `ทั้งหมด ${summary.total} หลัง<br/>สร้างใหม่ ${summary.created} หลัง<br/>อัปเดต ${summary.updated} หลัง<br/>สำเร็จ ${summary.success} หลัง<br/>ไม่สำเร็จ ${summary.failed} หลัง<br/>ทับรายการรอตรวจสอบ ${summary.overwritten} หลัง<br/>ข้าม (ชำระแล้ว) ${summary.skippedPaid} หลัง<br/>ข้าม (รอตรวจสอบ) ${summary.skippedPending} หลัง${summary.skippedFullYear > 0 ? `<br/>ข้าม (มีใบแจ้งหนี้เต็มปีแล้ว) ${summary.skippedFullYear} หลัง` : ''}${summary.cancelledFirstHalf > 0 ? `<br/>ยกเลิกใบครึ่งปีแรกเดิม ${summary.cancelledFirstHalf} หลัง` : ''}`,
      })
    } catch (error) {
      Swal.close()
      await Swal.fire({ icon: 'error', title: 'Process ไม่สำเร็จ', text: error.message })
    } finally {
      setProcessingInvoice(false)
    }
  }

  const handleCalculateOverdue = async () => {
    try {
      setProcessingOverdue(true)

      Swal.fire({
        title: 'กำลังเตรียมรายการคำนวณค่าปรับ',
        text: 'กำลังดึงข้อมูลใบแจ้งหนี้ทั้งหมด',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
        showConfirmButton: false,
      })

      const filteredFees = await listFees({
        status: 'all',
        year: 'all',
        period: 'all',
      })

      if (filteredFees.length === 0) {
        Swal.close()
        await Swal.fire({ icon: 'info', title: 'ไม่พบรายการสำหรับคำนวณ', text: 'กรุณาสร้างใบแจ้งหนี้ก่อน' })
        return
      }

      Swal.update({
        title: 'กำลังคำนวณค่าปรับ',
        text: `กำลังประมวลผล ${filteredFees.length} รายการ`,
      })

      const result = await calculateOverdueFeesByIds({
        feeIds: filteredFees.map((item) => item.id),
        setup,
      })

      Swal.close()

      const summary = {
        total: Number(result.total || filteredFees.length),
        updated: Number(result.updated || 0),
        success: Number(result.updated || 0),
        failed: 0,
        overwritten: 0,
        skippedPaid: Number(result.skippedPaid || 0),
        skippedNotDue: Number(result.skippedNotDue || 0),
      }

      setOverdueSummary(summary)

      await Swal.fire({
        icon: 'success',
        title: 'คำนวณค่าปรับเสร็จสิ้น',
        html: `ทั้งหมด ${summary.total} รายการ<br/>อัปเดต ${summary.updated} รายการ<br/>สำเร็จ ${summary.success} รายการ<br/>ไม่สำเร็จ ${summary.failed} รายการ<br/>ทับรายการ ${summary.overwritten} รายการ<br/>ข้าม (ชำระแล้ว) ${summary.skippedPaid} รายการ<br/>ข้าม (ยังไม่ถึงกำหนด/ไม่มี due) ${summary.skippedNotDue} รายการ`,
      })
    } catch (error) {
      Swal.close()
      await Swal.fire({ icon: 'error', title: 'คำนวณไม่สำเร็จ', text: error.message })
    } finally {
      setProcessingOverdue(false)
    }
  }

  return (
    <div className="pane on houses-compact fees-compact" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="ph">
        <div className="ph-in">
          <div>
            <div className="ph-h1">สร้างใบแจ้งหนี้/ค่าปรับ</div>
            <div className="ph-sub">หน้ารวมการสร้างใบแจ้งหนี้ทุกหลัง และคำนวณค่าปรับตามเงื่อนไขเดิม</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">ส่วนที่ 1: สร้างใบแจ้งหนี้</div>
        </div>
        <form className="cb" style={{ display: 'grid', gap: 12, padding: 12 }} onSubmit={handleProcessInvoices}>
          <div className="house-grid house-grid-3" style={{ gap: 10 }}>
            <label className="house-field">
              <span>ปี (พ.ศ.)</span>
              <StyledSelect value={processForm.yearBE} onChange={(e) => setProcessForm((prev) => ({ ...prev, yearBE: e.target.value }))}>
                {processYearOptions.map((yearBE) => (
                  <option key={yearBE} value={String(yearBE)}>{yearBE}</option>
                ))}
              </StyledSelect>
            </label>
            <label className="house-field">
              <span>รอบ</span>
              <StyledSelect value={processForm.period} onChange={(e) => setProcessForm((prev) => ({ ...prev, period: e.target.value }))}>
                {periodOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </StyledSelect>
            </label>
            <label className="house-field" style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={processForm.overwritePending}
                onChange={(e) => setProcessForm((prev) => ({ ...prev, overwritePending: e.target.checked }))}
                style={{ width: 16, height: 16 }}
              />
              <span>ทับใบที่อยู่สถานะรอตรวจสอบ</span>
            </label>
          </div>

          <div style={{ fontSize: 13, color: 'var(--mu)', lineHeight: 1.8 }}>
            <div>ค่าส่วนกลาง = พื้นที่บ้าน x 6 เดือน x อัตรา setup ({Number(setup.fee_rate_per_sqw || 0).toLocaleString('th-TH')})</div>
            <div>ค่าขยะ = ค่า setup ต่อรอบ ({Number(setup.waste_fee_per_period || 0).toLocaleString('th-TH')})</div>
            <div>Process นี้จะทำทุกหลังในระบบ และใช้เงื่อนไขเดิมทั้งหมด</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-p" type="submit" disabled={processingInvoice}>
              {processingInvoice ? 'กำลังประมวลผล...' : 'Process สร้างทั้งหมด'}
            </button>
          </div>

          {invoiceSummary && (
            <div style={{ border: '1px solid var(--bo)', borderRadius: 10, padding: '10px 12px', background: '#f8fafc' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>สรุปผลสร้างใบแจ้งหนี้ ({toBE(toGregorianYear(processForm.yearBE))})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(140px, 1fr))', gap: 8, fontSize: 13 }}>
                <div>ทั้งหมด: <strong>{invoiceSummary.total}</strong></div>
                <div>สร้างใหม่: <strong>{invoiceSummary.created}</strong></div>
                <div>อัปเดต: <strong>{invoiceSummary.updated}</strong></div>
                <div>สำเร็จ: <strong>{invoiceSummary.success}</strong></div>
                <div>ไม่สำเร็จ: <strong>{invoiceSummary.failed}</strong></div>
                <div>ทับรายการ: <strong>{invoiceSummary.overwritten}</strong></div>
              </div>
            </div>
          )}
        </form>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">ส่วนที่ 2: คำนวณค่าปรับ</div>
        </div>
        <div className="cb" style={{ display: 'grid', gap: 12, padding: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--mu)' }}>
            คำนวณค่าปรับทั้งระบบด้วย logic เดิม: ค่าปรับ {Number(setup.overdue_fine_pct || 0)}% + ค่าทวงถาม {Number(setup.notice_fee || 0).toLocaleString('th-TH')} บาท
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-dg" type="button" onClick={handleCalculateOverdue} disabled={processingOverdue}>
              {processingOverdue ? 'กำลังคำนวณ...' : 'คำนวณค่าปรับ'}
            </button>
          </div>

          {overdueSummary && (
            <div style={{ border: '1px solid var(--bo)', borderRadius: 10, padding: '10px 12px', background: '#fff7ed' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>สรุปผลคำนวณค่าปรับ</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(140px, 1fr))', gap: 8, fontSize: 13 }}>
                <div>ทั้งหมด: <strong>{overdueSummary.total}</strong></div>
                <div>อัปเดต: <strong>{overdueSummary.updated}</strong></div>
                <div>สำเร็จ: <strong>{overdueSummary.success}</strong></div>
                <div>ไม่สำเร็จ: <strong>{overdueSummary.failed}</strong></div>
                <div>ทับรายการ: <strong>{overdueSummary.overwritten}</strong></div>
                <div>ข้าม: <strong>{overdueSummary.skippedPaid + overdueSummary.skippedNotDue}</strong></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}