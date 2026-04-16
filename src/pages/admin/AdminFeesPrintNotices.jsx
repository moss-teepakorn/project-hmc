import React, { useEffect, useMemo, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import Swal from 'sweetalert2'
import { getSystemConfig } from '../../lib/systemConfig'
import { buildPeriodLabelMapFromCycle, buildPeriodOptionsFromCycle, getPaymentCycleConfigByYear } from '../../lib/paymentCycles'
import {
  createNoticePrintLogs,
  listApprovedPaymentItemTotalsByFeeIds,
  listNoticePrintCountsByFeeIds,
  listPaymentTotalsByFeeIds,
  listFees,
} from '../../lib/fees'
import { resolveImageToDataUrl, DEFAULT_LOGO_DATAURL } from '../../lib/logoUtils'

function periodLabel(period) {
  if (period === 'first_half') return 'ครึ่งปีแรก'
  if (period === 'second_half') return 'ครึ่งปีหลัง'
  if (period === 'full_year') return 'เต็มปี'
  return period || '-'
}

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

function buildInvoiceDocumentNo(fee) {
  return `INV-${String(fee?.year || '').slice(-2)}-${String(fee?.id || '').slice(0, 8).toUpperCase()}`
}

function formatDateDMY(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

function extractNoticePrintCount(note) {
  const raw = String(note || '')
  const match = raw.match(/^\[NOTICE_PRINT:([0-9]+)\]\s*/)
  return match ? Number(match[1]) : 0
}

const houseSorter = new Intl.Collator('th-TH', { numeric: true, sensitivity: 'base' })

function normalizeSoiValue(soi) {
  const numeric = Number.parseInt(String(soi || '').replace(/[^0-9]/g, ''), 10)
  return Number.isNaN(numeric) ? Number.MAX_SAFE_INTEGER : numeric
}

const feeItemDefs = [
  { key: 'fee_common', label: 'ค่าส่วนกลาง' },
  { key: 'fee_parking', label: 'ค่าจอดรถ' },
  { key: 'fee_waste', label: 'ค่าขยะ' },
  { key: 'fee_overdue_common', label: 'ยอดค้างยกมา' },
  { key: 'fee_overdue_fine', label: 'ค่าปรับยอดค้าง' },
  { key: 'fee_overdue_notice', label: 'ค่าทวงถามยอดค้าง' },
  { key: 'fee_fine', label: 'ค่าปรับ' },
  { key: 'fee_notice', label: 'ค่าทวงถาม' },
  { key: 'fee_violation', label: 'ค่ากระทำผิด' },
  { key: 'fee_other', label: 'ค่าอื่นๆ' },
]

export default function AdminFeesPrintNotices() {
  const [setup, setSetup] = useState({
    village_name: 'The Greenfield',
    village_logo_url: '',
    juristic_name: 'นิติบุคคลหมู่บ้านเดอะกรีนฟิลด์',
    juristic_address: '',
    bank_name: 'กสิกรไทย',
    bank_account_no: '-',
    bank_account_name: 'นิติบุคคลหมู่บ้าน เดอะกรีนฟิลด์',
    juristic_signature_url: '',
    invoice_message: 'กรุณาชำระภายในวันที่ครบกำหนด หากพ้นกำหนดจะมีค่าปรับตามประกาศนิติบุคคล',
    fee_rate_per_sqw: 85,
  })
  const [loading, setLoading] = useState(false)
  const [runningPrintAction, setRunningPrintAction] = useState(false)
  const [fees, setFees] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [feeSubmittedTotals, setFeeSubmittedTotals] = useState({})
  const [feeApprovedTotals, setFeeApprovedTotals] = useState({})
  const [feeApprovedItemTotals, setFeeApprovedItemTotals] = useState({})
  const [noticePrintCounts, setNoticePrintCounts] = useState({})
  const [showPrintPreviewModal, setShowPrintPreviewModal] = useState(false)
  const [printPreviewHtml, setPrintPreviewHtml] = useState('')
  const [printPreviewTitle, setPrintPreviewTitle] = useState('เอกสารสำหรับพิมพ์')
  const [printPreviewNoticeNoMap, setPrintPreviewNoticeNoMap] = useState({})
  const [filters, setFilters] = useState({
    yearBE: String(new Date().getFullYear() + 543),
    period: 'first_half',
    paymentStatus: 'unpaid_only',
    houseNo: '',
  })
  const [periodLabelMap, setPeriodLabelMap] = useState(buildPeriodLabelMapFromCycle(null))
  const [periodOptions, setPeriodOptions] = useState(buildPeriodOptionsFromCycle(null, { includeRange: true }))

  const processYearOptions = useMemo(() => {
    const currentBE = new Date().getFullYear() + 543
    return [currentBE + 1, currentBE, currentBE - 1, currentBE - 2, currentBE - 3]
  }, [])

  useEffect(() => {
    const syncPeriodSetup = async () => {
      const yearCE = toGregorianYear(filters.yearBE)
      if (!yearCE) return

      try {
        const cycleConfig = await getPaymentCycleConfigByYear(yearCE)
        const nextLabelMap = buildPeriodLabelMapFromCycle(cycleConfig)
        const nextOptions = buildPeriodOptionsFromCycle(cycleConfig, { includeRange: true })
        setPeriodLabelMap(nextLabelMap)
        setPeriodOptions(nextOptions)

        if (!nextOptions.some((option) => option.value === filters.period)) {
          setFilters((prev) => ({ ...prev, period: nextOptions[0]?.value || 'full_year' }))
        }
      } catch {
        const fallbackLabelMap = buildPeriodLabelMapFromCycle(null)
        const fallbackOptions = buildPeriodOptionsFromCycle(null, { includeRange: true })
        setPeriodLabelMap(fallbackLabelMap)
        setPeriodOptions(fallbackOptions)
      }
    }

    syncPeriodSetup()
  }, [filters.yearBE])

  const resolvePeriodLabel = (period) => periodLabelMap[period] || periodLabel(period)

  const getApprovedAmountForFee = (fee) => Number(feeApprovedTotals[fee?.id] || 0)

  const getOutstandingItemRowsForFee = (fee) => {
    const approvedByItem = feeApprovedItemTotals[fee?.id] || {}
    return feeItemDefs
      .map((item) => {
        const dueAmount = Number(fee?.[item.key] || 0)
        const approvedAmount = Number(approvedByItem[item.key] || 0)
        const outstandingAmount = Math.max(0, dueAmount - approvedAmount)
        return {
          ...item,
          dueAmount,
          approvedAmount,
          outstandingAmount,
        }
      })
      .filter((row) => row.outstandingAmount > 0)
  }

  const getOutstandingAmountForFee = (fee) => {
    return getOutstandingItemRowsForFee(fee).reduce((sum, row) => sum + Number(row.outstandingAmount || 0), 0)
  }

  const getFeeStatusBadge = (fee) => {
    const approvedAmount = Number(feeApprovedTotals[fee?.id] || 0)
    const submittedAmount = Number(feeSubmittedTotals[fee?.id] || 0)
    const totalAmount = Number(fee?.total_amount || 0)

    if (fee?.status === 'cancelled') return { className: 'bd b-dg', label: 'ยกเลิก' }
    if (approvedAmount >= totalAmount && totalAmount > 0) return { className: 'bd b-ok', label: 'ชำระแล้ว' }
    if (submittedAmount > 0 && submittedAmount < totalAmount) return { className: 'bd b-ac', label: 'ชำระบางส่วน' }
    if (fee?.status === 'paid') return { className: 'bd b-ok', label: 'ชำระแล้ว' }
    if (fee?.status === 'pending') return { className: 'bd b-pr', label: 'รอตรวจสอบ' }
    if (fee?.status === 'overdue') return { className: 'bd b-dg', label: 'ค้างชำระ' }
    return { className: 'bd b-wn', label: 'ยังไม่ชำระ' }
  }

  const isFeeFullyPaid = (fee) => {
    const approvedAmount = getApprovedAmountForFee(fee)
    return approvedAmount >= Number(fee?.total_amount || 0)
  }

  const isNoticePrintable = (fee) => {
    const penaltyTotal = Number(fee?.fee_fine || 0) + Number(fee?.fee_overdue_fine || 0)
    return penaltyTotal > 0 && fee?.status !== 'cancelled' && !isFeeFullyPaid(fee) && getOutstandingAmountForFee(fee) > 0
  }

  const getNoticeCountForFee = (fee) => {
    const dbCount = Number(noticePrintCounts[fee?.id] || 0)
    const legacyCount = extractNoticePrintCount(fee?.note)
    return Math.max(dbCount, legacyCount)
  }

  const persistNoticePrintCounts = async (mode, noticeNoMap) => {
    const rows = (selectedFees || []).map((fee) => ({
      fee_id: fee.id,
      notice_no: Number(noticeNoMap?.[fee.id] || 0),
      print_mode: mode,
    }))
    await createNoticePrintLogs(rows)
  }

  const selectedFees = useMemo(() => {
    const selectedSet = new Set(selectedIds)
    return fees.filter((fee) => selectedSet.has(fee.id))
  }, [fees, selectedIds])

  const allChecked = fees.length > 0 && selectedIds.length === fees.length

  const handleSearch = async (event) => {
    event.preventDefault()
    const yearCE = toGregorianYear(filters.yearBE)
    if (!yearCE) {
      await Swal.fire({ icon: 'warning', title: 'ปีไม่ถูกต้อง' })
      return
    }

    try {
      setLoading(true)
      const [config, feeRows] = await Promise.all([
        getSystemConfig().catch(() => null),
        listFees({
          year: yearCE,
          period: filters.period,
          status: 'all',
        }),
      ])

      if (config) setSetup(config)

      const ids = (feeRows || []).map((row) => row.id)
      const [paymentTotals, paymentItemTotals, noticeCounts] = await Promise.all([
        listPaymentTotalsByFeeIds(ids),
        listApprovedPaymentItemTotalsByFeeIds(ids),
        listNoticePrintCountsByFeeIds(ids),
      ])

      setFeeSubmittedTotals(paymentTotals.submitted || {})
      setFeeApprovedTotals(paymentTotals.approved || {})
      setFeeApprovedItemTotals(paymentItemTotals || {})
      setNoticePrintCounts(noticeCounts || {})

      const houseKeyword = filters.houseNo.trim().toLowerCase()

      const filteredRows = (feeRows || [])
        .filter((fee) => {
          if (houseKeyword && !String(fee?.houses?.house_no || '').toLowerCase().includes(houseKeyword)) {
            return false
          }
          if (filters.paymentStatus === 'unpaid_only') {
            const approvedAmount = Number((paymentTotals.approved || {})[fee.id] || 0)
            const totalAmount = Number(fee.total_amount || 0)
            if (fee.status === 'cancelled') return false
            return approvedAmount < totalAmount
          }
          return isNoticePrintable(fee)
        })
        .sort((left, right) => {
          const soiCompare = normalizeSoiValue(left?.houses?.soi) - normalizeSoiValue(right?.houses?.soi)
          if (soiCompare !== 0) return soiCompare
          return houseSorter.compare(left?.houses?.house_no || '', right?.houses?.house_no || '')
        })

      setFees(filteredRows)
      setSelectedIds([])
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ค้นหาไม่สำเร็จ', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  const toggleAll = () => {
    if (allChecked) {
      setSelectedIds([])
      return
    }
    setSelectedIds(fees.map((fee) => fee.id))
  }

  const toggleRow = (id) => {
    setSelectedIds((prev) => {
      const set = new Set(prev)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return Array.from(set)
    })
  }

  const buildInvoiceHtml = async (targetFees, title, {
    autoPrint = false,
    forCapture = false,
    docType = 'notice',
    noticeNoMap = {},
  } = {}) => {
    const freshConfig = await getSystemConfig().catch(() => null)
    const rawLogoUrl = freshConfig?.village_logo_url || setup.village_logo_url || localStorage.getItem('vms-login-circle-logo-url') || ''
    const rawSignatureUrl = freshConfig?.juristic_signature_url || setup.juristic_signature_url || ''
    const printLogoUrl = await resolveImageToDataUrl(rawLogoUrl, DEFAULT_LOGO_DATAURL)
    const printSignatureUrl = await resolveImageToDataUrl(rawSignatureUrl, '')

    const fmtDate = (value) => formatDateDMY(value)
    const fmtMoney = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const toThaiBahtText = (value) => {
      const amount = Number(value || 0)
      if (!Number.isFinite(amount) || amount < 0) return '-'
      if (amount === 0) return 'ศูนย์บาทถ้วน'

      const numberText = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
      const positionText = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

      const convertInteger = (num) => {
        if (num === 0) return ''
        let result = ''
        const digits = String(num).split('').map((d) => Number(d))
        const len = digits.length

        digits.forEach((digit, idx) => {
          const pos = len - idx - 1
          if (digit === 0) return

          if (pos === 0 && digit === 1 && len > 1) {
            result += 'เอ็ด'
            return
          }
          if (pos === 1 && digit === 1) {
            result += 'สิบ'
            return
          }
          if (pos === 1 && digit === 2) {
            result += 'ยี่สิบ'
            return
          }

          result += `${numberText[digit]}${positionText[pos]}`
        })

        return result
      }

      const [intPartRaw, decPartRaw = '00'] = amount.toFixed(2).split('.')
      let intPart = Number(intPartRaw)
      const decPart = Number(decPartRaw)

      const millionChunks = []
      while (intPart > 0) {
        millionChunks.unshift(intPart % 1000000)
        intPart = Math.floor(intPart / 1000000)
      }

      const bahtText = millionChunks
        .map((chunk, index) => {
          const text = convertInteger(chunk)
          if (!text) return ''
          const isLast = index === millionChunks.length - 1
          return isLast ? text : `${text}ล้าน`
        })
        .join('') || 'ศูนย์'

      if (decPart === 0) return `${bahtText}บาทถ้วน`
      return `${bahtText}บาท${convertInteger(decPart)}สตางค์`
    }

    const itemRows = (fee) => {
      const printItems = getOutstandingItemRowsForFee(fee)
      if (printItems.length === 0) {
        return `
          <tr>
            <td class="c">1</td>
            <td>ไม่มีรายการค้างชำระ</td>
            <td class="r">0.00</td>
          </tr>
        `
      }

      return printItems
        .map((item, idx) => `
          <tr>
            <td class="c">${idx + 1}</td>
            <td>${item.label}</td>
            <td class="r">${fmtMoney(item.outstandingAmount)}</td>
          </tr>
        `)
        .join('')
    }

    const totalOutstandingForPrint = (fee) => getOutstandingItemRowsForFee(fee)
      .reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0)

    const invoiceBlocks = targetFees.flatMap((fee, feeIndex) => {
      const invoiceNo = buildInvoiceDocumentNo(fee)
      const periodText = `${resolvePeriodLabel(fee.period)} ปี ${toBE(fee.year)}`
      const isLastFee = feeIndex === targetFees.length - 1
      const isNotice = docType === 'notice'
      const noticeNo = Number(noticeNoMap?.[fee.id] || 0)
      const documentTitle = isNotice ? `ใบแจ้งเตือนค้างชำระ ครั้งที่ ${noticeNo || 1}` : 'ใบแจ้งหนี้ค่าส่วนกลาง'
      const documentNote = isNotice
        ? 'หมายเหตุ: เอกสารฉบับนี้เป็นหนังสือแจ้งเตือนเพื่อให้ดำเนินการชำระยอดค้างโดยเร็ว'
        : 'หมายเหตุ: กรุณาชำระภายในวันที่ครบกำหนด เพื่อหลีกเลี่ยงค่าปรับ/ค่าทวงถามเพิ่มเติม'
      const reminderRow = isNotice
        ? `<div><span>อ้างอิงเอกสาร:</span> <strong>${invoiceNo}</strong></div><div><span>แจ้งเตือนครั้งที่:</span> <strong>${noticeNo || 1}</strong></div>`
        : ''

      return [
        `
          <section class="sheet page-break">
            <header class="head">
              <div class="brand">
                <div class="logo-wrap"><img src="${printLogoUrl}" alt="village-logo" /></div>
                <div>
                  <div class="doc">${documentTitle}</div>
                  <div class="village">${setup.village_name || 'The Greenfield'}</div>
                  <div class="sub">${setup.juristic_name || 'นิติบุคคลหมู่บ้านเดอะกรีนฟิลด์'}</div>
                  <div class="sub">${setup.juristic_address || '-'}</div>
                  <div class="sub">${title}</div>
                </div>
              </div>
              <div class="doc-meta">
                <div><span>เลขที่เอกสาร:</span> <strong>${invoiceNo}</strong></div>
                <div><span>วันที่ออกเอกสาร:</span> <strong>${fmtDate(fee.invoice_date)}</strong></div>
                <div><span>ครบกำหนดชำระ:</span> <strong>${fmtDate(fee.due_date)}</strong></div>
                ${reminderRow}
                <div class="copy-mark-row">
                  <div class="copy-mark copy-mark--active">ต้นฉบับ</div>
                </div>
              </div>
            </header>

            ${isNotice ? `<section class="notice-alert">เอกสารแจ้งเตือนค้างชำระ: กรุณาดำเนินการชำระยอดคงค้างภายในกำหนดเพื่อหลีกเลี่ยงค่าใช้จ่ายเพิ่มเติม</section>` : ''}

            <section class="box">
              <div class="grid">
                <div><span>บ้านเลขที่</span><strong>${fee.houses?.house_no || '-'}</strong></div>
                <div><span>ชื่อเจ้าของบ้าน</span><strong>${fee.houses?.owner_name || '-'}</strong></div>
                <div><span>งวดเรียกเก็บ</span><strong>${periodText}</strong></div>
                <div><span>ซอย</span><strong>${fee.houses?.soi || '-'}</strong></div>
                <div><span>พื้นที่ (ตร.วา)</span><strong>${Number(fee.houses?.area_sqw || 0).toLocaleString('en-US')}</strong></div>
                <div><span>อัตราค่าส่วนกลาง</span><strong>${Number(setup.fee_rate_per_sqw || fee.houses?.fee_rate || 0).toLocaleString('en-US')} บาท/ตร.วา/ปี</strong></div>
              </div>
            </section>

            <section class="box">
              <table>
                <thead>
                  <tr>
                    <th class="c" style="width:56px;">ลำดับ</th>
                    <th>รายการ</th>
                    <th class="r" style="width:180px;">จำนวนเงิน (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows(fee)}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="2" class="r"><strong>รวมทั้งสิ้น</strong></td>
                    <td class="r"><strong>${fmtMoney(totalOutstandingForPrint(fee))}</strong></td>
                  </tr>
                </tfoot>
              </table>
              <div class="amount-text">(${toThaiBahtText(totalOutstandingForPrint(fee))})</div>
            </section>

            <section class="box payment-box">
              <div class="payment-title">รายละเอียดการชำระเงิน</div>
              <div class="payment-grid">
                <div><span>ธนาคาร</span><strong>${setup.bank_name || '-'}</strong></div>
                <div><span>เลขที่บัญชี</span><strong>${setup.bank_account_no || '-'}</strong></div>
                <div><span>ชื่อบัญชี</span><strong>${setup.bank_account_name || '-'}</strong></div>
                <div><span>กำหนดชำระ</span><strong>${fmtDate(fee.due_date)}</strong></div>
              </div>
              <div class="payment-note">${setup.invoice_message || 'กรุณาแนบหลักฐานการโอนทุกครั้งหลังชำระ'}</div>
            </section>

            <section class="foot">
              <div class="note">
                ${documentNote}
              </div>
              <div class="sign-wrap">
                ${printSignatureUrl ? `<img src="${printSignatureUrl}" alt="juristic-signature" />` : ''}
                <div class="sign-line"></div>
                <div>ผู้มีอำนาจลงนาม</div>
              </div>
            </section>
          </section>
        `,
        `
          <section class="sheet${isLastFee ? '' : ' page-break'}">
            <header class="head">
              <div class="brand">
                <div class="logo-wrap"><img src="${printLogoUrl}" alt="village-logo" /></div>
                <div>
                  <div class="doc">${documentTitle}</div>
                  <div class="village">${setup.village_name || 'The Greenfield'}</div>
                  <div class="sub">${setup.juristic_name || 'นิติบุคคลหมู่บ้านเดอะกรีนฟิลด์'}</div>
                  <div class="sub">${setup.juristic_address || '-'}</div>
                  <div class="sub">${title}</div>
                </div>
              </div>
              <div class="doc-meta">
                <div><span>เลขที่เอกสาร:</span> <strong>${invoiceNo}</strong></div>
                <div><span>วันที่ออกเอกสาร:</span> <strong>${fmtDate(fee.invoice_date)}</strong></div>
                <div><span>ครบกำหนดชำระ:</span> <strong>${fmtDate(fee.due_date)}</strong></div>
                ${reminderRow}
                <div class="copy-mark-row">
                  <div class="copy-mark copy-mark--active">สำเนา</div>
                </div>
              </div>
            </header>

            ${isNotice ? `<section class="notice-alert">เอกสารแจ้งเตือนค้างชำระ: กรุณาดำเนินการชำระยอดคงค้างภายในกำหนดเพื่อหลีกเลี่ยงค่าใช้จ่ายเพิ่มเติม</section>` : ''}

            <section class="box">
              <div class="grid">
                <div><span>บ้านเลขที่</span><strong>${fee.houses?.house_no || '-'}</strong></div>
                <div><span>ชื่อเจ้าของบ้าน</span><strong>${fee.houses?.owner_name || '-'}</strong></div>
                <div><span>งวดเรียกเก็บ</span><strong>${periodText}</strong></div>
                <div><span>ซอย</span><strong>${fee.houses?.soi || '-'}</strong></div>
                <div><span>พื้นที่ (ตร.วา)</span><strong>${Number(fee.houses?.area_sqw || 0).toLocaleString('en-US')}</strong></div>
                <div><span>อัตราค่าส่วนกลาง</span><strong>${Number(setup.fee_rate_per_sqw || fee.houses?.fee_rate || 0).toLocaleString('en-US')} บาท/ตร.วา/ปี</strong></div>
              </div>
            </section>

            <section class="box">
              <table>
                <thead>
                  <tr>
                    <th class="c" style="width:56px;">ลำดับ</th>
                    <th>รายการ</th>
                    <th class="r" style="width:180px;">จำนวนเงิน (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows(fee)}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="2" class="r"><strong>รวมทั้งสิ้น</strong></td>
                    <td class="r"><strong>${fmtMoney(totalOutstandingForPrint(fee))}</strong></td>
                  </tr>
                </tfoot>
              </table>
              <div class="amount-text">(${toThaiBahtText(totalOutstandingForPrint(fee))})</div>
            </section>

            <section class="box payment-box">
              <div class="payment-title">รายละเอียดการชำระเงิน</div>
              <div class="payment-grid">
                <div><span>ธนาคาร</span><strong>${setup.bank_name || '-'}</strong></div>
                <div><span>เลขที่บัญชี</span><strong>${setup.bank_account_no || '-'}</strong></div>
                <div><span>ชื่อบัญชี</span><strong>${setup.bank_account_name || '-'}</strong></div>
                <div><span>กำหนดชำระ</span><strong>${fmtDate(fee.due_date)}</strong></div>
              </div>
              <div class="payment-note">${setup.invoice_message || 'กรุณาแนบหลักฐานการโอนทุกครั้งหลังชำระ'}</div>
            </section>

            <section class="foot">
              <div class="note">
                ${documentNote}
              </div>
              <div class="sign-wrap">
                ${printSignatureUrl ? `<img src="${printSignatureUrl}" alt="juristic-signature" />` : ''}
                <div class="sign-line"></div>
                <div>ผู้มีอำนาจลงนาม</div>
              </div>
            </section>
          </section>
        `,
      ]
    }).join('')

    return `
      <html>
        <head>
          <title>${title}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700&display=swap" rel="stylesheet">
          <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; }
            html, body { font-family: 'Sarabun', 'TH Sarabun New', Tahoma, sans-serif; margin: 0; padding: 0; color: #111827; background: #fff; }
            .sheet {
              position: relative;
              width: ${forCapture ? '794px' : '100%'};
              ${forCapture ? 'height: 1122px; overflow: hidden;' : 'page-break-after: always; break-after: page; break-inside: avoid;'}
              background: #fff;
              padding: 24px 28px;
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .head { display: flex; justify-content: space-between; gap: 12px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; background: #ffffff; margin-bottom: 4px; }
            .brand { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }
            .logo-wrap { width: 64px; height: 64px; border-radius: 12px; background: #f1f5f9; border: 1.5px solid #cbd5e1; padding: 6px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
            .logo-wrap img { width: 100%; height: 100%; display: block; object-fit: contain; border-radius: 8px; }
            .doc { font-size: 16px; font-weight: 700; line-height: 1.3; }
            .village { font-size: 11px; margin-top: 3px; font-weight: 600; }
            .sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
            .doc-meta { font-size: 10px; min-width: 180px; display: flex; flex-direction: column; gap: 2px; word-break: break-word; }
            .doc-meta span { color: #6b7280; font-weight: 500; }
            .copy-mark-row { display: flex; gap: 6px; justify-content: flex-end; margin-top: 10px; margin-right: -4px; }
            .copy-mark { border: none; border-radius: 4px; padding: 3px 10px; text-align: center; font-size: 14px; font-weight: 700; line-height: 1.3; color: #94a3b8; background: transparent; }
            .copy-mark--active { color: #0c4a6e; background: transparent; }
            .notice-alert { border: 1px dashed #fb923c; background: #fff7ed; color: #9a3412; border-radius: 4px; padding: 7px 10px; font-size: 10px; font-weight: 600; line-height: 1.45; }
            .box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; word-break: break-word; }
            .grid > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
            .grid span { font-size: 9px; color: #6b7280; font-weight: 500; }
            .grid strong { font-size: 11px; font-weight: 600; }
            table { width: 100%; border-collapse: collapse; table-layout: auto; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; }
            th { background: #f1f5f9; text-align: left; font-weight: 600; }
            .c { text-align: center; }
            .r { text-align: right; }
            tfoot td { background: #f1f5f9; font-weight: 600; }
            .amount-text { margin-top: 4px; font-size: 10px; color: #374151; font-weight: 500; text-align: right; }
            .payment-box { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
            .payment-title { font-size: 11px; font-weight: 700; color: #111827; }
            .payment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; word-break: break-word; }
            .payment-grid > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
            .payment-grid span { font-size: 9px; color: #6b7280; font-weight: 500; }
            .payment-grid strong { font-size: 11px; font-weight: 600; }
            .payment-note { border-top: 1px dashed #d1d5db; padding-top: 4px; font-size: 10px; color: #4b5563; }
            .foot { margin-top: 8px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; background: #f9fafb; }
            .note { font-size: 9px; color: #64748b; line-height: 1.4; }
            .sign-wrap { min-width: 140px; text-align: center; font-size: 9px; color: #64748b; }
            .sign-wrap img { max-width: 100px; max-height: 36px; object-fit: contain; margin-bottom: 4px; }
            .sign-line { border-top: 1px solid #cbd5e1; margin: 4px 0; }
            @media print {
              html, body { background: #fff; }
              .sheet { page-break-after: always; break-after: page; break-inside: avoid; }
              .sheet:last-child { page-break-after: avoid; break-after: avoid; }
            }
          </style>
        </head>
        <body>
          ${invoiceBlocks}
          ${autoPrint ? `<script>window.onload = () => window.print();</script>` : ''}
        </body>
      </html>
    `
  }

  const openHtmlInWindow = (html) => {
    const w = window.open('', '_blank', 'width=1200,height=900')
    if (!w) return null
    w.document.write(html)
    w.document.close()
    return w
  }

  const renderInvoicesInIframe = async (html, sheetCount = 2) => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;border:none;'
    iframe.style.width = '794px'
    iframe.style.height = `${sheetCount * 1200}px`
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    doc.open()
    doc.write(html)
    doc.close()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return {
      iframe,
      doc,
      sheets: Array.from(doc.querySelectorAll('.sheet')),
    }
  }

  const runPrintAction = async (mode) => {
    if (!selectedFees.length) {
      await Swal.fire({ icon: 'info', title: 'กรุณาเลือกรายการก่อนพิมพ์' })
      return
    }

    try {
      setRunningPrintAction(true)
      const title = printPreviewTitle || `ใบแจ้งหนี้ค่าส่วนกลาง ${filters.yearBE} ${resolvePeriodLabel(filters.period)}`
      const noticeNoMap = printPreviewNoticeNoMap || {}

      if (mode === 'image' || mode === 'pdf') {
        const expectedSheets = selectedFees.length * 2
        const html = await buildInvoiceHtml(selectedFees, title, {
          autoPrint: false,
          forCapture: true,
          docType: 'notice',
          noticeNoMap,
        })
        const { iframe, sheets } = await renderInvoicesInIframe(html, expectedSheets)

        if (mode === 'image') {
          for (let i = 0; i < sheets.length; i += 1) {
            const canvas = await html2canvas(sheets[i], {
              scale: 2,
              useCORS: true,
              backgroundColor: '#ffffff',
              width: 794,
              height: 1122,
            })
            const link = document.createElement('a')
            link.href = canvas.toDataURL('image/png')
            link.download = `${title}-${i + 1}.png`
            link.click()
          }
        } else {
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
          const A4W = pdf.internal.pageSize.getWidth()
          const A4H = pdf.internal.pageSize.getHeight()
          for (let i = 0; i < sheets.length; i += 1) {
            const canvas = await html2canvas(sheets[i], {
              scale: 2,
              useCORS: true,
              backgroundColor: '#ffffff',
              width: 794,
              height: 1122,
            })
            const imgData = canvas.toDataURL('image/jpeg', 0.95)
            if (i > 0) pdf.addPage()
            pdf.addImage(imgData, 'JPEG', 0, 0, A4W, A4H, undefined, 'FAST')
          }
          pdf.save(`${title}.pdf`)
        }

        document.body.removeChild(iframe)
        await persistNoticePrintCounts(mode, noticeNoMap)
        setShowPrintPreviewModal(false)
        return
      }

      const html = await buildInvoiceHtml(selectedFees, title, {
        autoPrint: true,
        docType: 'notice',
        noticeNoMap,
      })
      const w = openHtmlInWindow(html)
      if (!w) {
        await Swal.fire({ icon: 'warning', title: 'ไม่สามารถเปิดหน้าต่างพิมพ์ได้', text: 'กรุณาอนุญาต popup ของเบราว์เซอร์' })
      } else {
        await persistNoticePrintCounts(mode, noticeNoMap)
        setShowPrintPreviewModal(false)
      }
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ดำเนินการไม่สำเร็จ', text: error.message })
    } finally {
      setRunningPrintAction(false)
    }
  }

  const openPrintPreviewModal = async () => {
    if (!selectedFees.length) {
      await Swal.fire({ icon: 'info', title: 'กรุณาเลือกรายการก่อนพิมพ์' })
      return
    }

    try {
      setRunningPrintAction(true)
      const title = `ใบแจ้งเตือนค้างชำระ ${filters.yearBE} ${resolvePeriodLabel(filters.period)}`
      const noticeNoMap = selectedFees.reduce((acc, fee) => {
        acc[fee.id] = getNoticeCountForFee(fee) + 1
        return acc
      }, {})
      const html = await buildInvoiceHtml(selectedFees, title, {
        autoPrint: false,
        docType: 'notice',
        noticeNoMap,
      })
      setPrintPreviewTitle(title)
      setPrintPreviewHtml(html)
      setPrintPreviewNoticeNoMap(noticeNoMap)
      setShowPrintPreviewModal(true)
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'เตรียมเอกสารไม่สำเร็จ', text: error.message })
    } finally {
      setRunningPrintAction(false)
    }
  }

  const closePrintPreviewModal = () => {
    if (runningPrintAction) return
    setShowPrintPreviewModal(false)
    setPrintPreviewHtml('')
    setPrintPreviewTitle('เอกสารสำหรับพิมพ์')
    setPrintPreviewNoticeNoMap({})
  }

  return (
    <div className="pane on houses-compact fees-compact" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="ph">
        <div className="ph-in">
          <div>
            <div className="ph-h1">พิมพ์ใบแจ้งเตือน</div>
            <div className="ph-sub">ค้นหารายการค้างที่มีค่าปรับ แล้วเลือกพิมพ์/ดาวน์โหลด PDF/Image</div>
          </div>
        </div>
      </div>

      <div className="card report-filter-card admin-search-filter-card">
        <form className="cb" style={{ padding: 12, display: 'grid', gap: 10 }} onSubmit={handleSearch}>
          <div className="house-grid" style={{ gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: 10 }}>
            <label className="house-field">
              <span>ปี (พ.ศ.)</span>
              <StyledSelect value={filters.yearBE} onChange={(e) => setFilters((prev) => ({ ...prev, yearBE: e.target.value }))}>
                {processYearOptions.map((yearBE) => (
                  <option key={yearBE} value={String(yearBE)}>{yearBE}</option>
                ))}
              </StyledSelect>
            </label>
            <label className="house-field">
              <span>ครั้งที่/งวด</span>
              <StyledSelect value={filters.period} onChange={(e) => setFilters((prev) => ({ ...prev, period: e.target.value }))}>
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </StyledSelect>
            </label>
            <label className="house-field">
              <span>สถานะการจ่าย</span>
              <StyledSelect value={filters.paymentStatus} onChange={(e) => setFilters((prev) => ({ ...prev, paymentStatus: e.target.value }))}>
                <option value="unpaid_only">เฉพาะที่ยังไม่จ่าย</option>
                <option value="all">ทั้งหมด</option>
              </StyledSelect>
            </label>
            <label className="house-field" style={{ gridColumn: 'span 2' }}>
              <span>บ้านเลขที่ (กรอกเอง)</span>
              <input
                type="text"
                placeholder="เช่น 88/12"
                value={filters.houseNo}
                onChange={(e) => setFilters((prev) => ({ ...prev, houseNo: e.target.value }))}
              />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-a btn-sm" type="submit" disabled={loading}>{loading ? 'กำลังค้นหา...' : 'ค้นหา'}</button>
            <button className="btn btn-g btn-sm" type="button" onClick={toggleAll}>เลือกทั้งหมด</button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn btn-p btn-sm" type="button" onClick={openPrintPreviewModal} disabled={runningPrintAction || selectedFees.length === 0}>🖨</button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">ผลลัพธ์ ({fees.length}) | เลือกแล้ว {selectedFees.length}</div>
        </div>
        <div className="cb houses-table-card-body houses-main-body">
          <div className="houses-desktop-only" style={{ overflowX: 'auto' }}>
            <table className="tw houses-table houses-main-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 48, textAlign: 'center' }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  </th>
                  <th>ซอย</th>
                  <th>บ้านเลขที่</th>
                  <th>ปี</th>
                  <th>งวด</th>
                  <th>ครบกำหนด</th>
                  <th>ยอดรวม</th>
                  <th>ยอดค้างชำระ</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>กำลังโหลดข้อมูล...</td></tr>
                ) : fees.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>ไม่พบข้อมูลตามเงื่อนไข</td></tr>
                ) : fees.map((fee) => {
                  const selected = selectedIds.includes(fee.id)
                  const statusBadge = getFeeStatusBadge(fee)
                  return (
                    <tr key={fee.id} style={{ background: selected ? '#f0fdf4' : undefined }}>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={selected} onChange={() => toggleRow(fee.id)} />
                      </td>
                      <td>{fee.houses?.soi || '-'}</td>
                      <td>
                        {fee.houses?.house_no || '-'}
                        <div style={{ fontSize: '11px', color: 'var(--mu)' }}>{fee.houses?.owner_name || '-'}</div>
                      </td>
                      <td>{toBE(fee.year)}</td>
                      <td>{resolvePeriodLabel(fee.period)}</td>
                      <td>{formatDateDMY(fee.due_date)}</td>
                      <td>{Number(fee.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>{getOutstandingAmountForFee(fee).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td><span className={statusBadge.className}>{statusBadge.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="houses-mobile-only">
            {loading ? (
              <div className="houses-card-empty">กำลังโหลดข้อมูล...</div>
            ) : fees.length === 0 ? (
              <div className="houses-card-empty">ไม่พบข้อมูลตามเงื่อนไข</div>
            ) : fees.map((fee) => {
              const selected = selectedIds.includes(fee.id)
              const statusBadge = getFeeStatusBadge(fee)
              return (
                <div key={fee.id} className="houses-mcard" style={{ borderColor: selected ? '#86efac' : undefined, background: selected ? '#f0fdf4' : undefined }}>
                  <div className="houses-mcard-top">
                    <input type="checkbox" checked={selected} onChange={() => toggleRow(fee.id)} />
                    <span className="houses-mcard-no">{fee.houses?.house_no || '-'}</span>
                    <span className="houses-mcard-soi">ซอย {fee.houses?.soi || '-'}</span>
                    <span className={`houses-mcard-badge ${statusBadge.className}`}>{statusBadge.label}</span>
                  </div>
                  <div className="houses-mcard-owner">{fee.houses?.owner_name || '-'}</div>
                  <div className="houses-mcard-meta">
                    <span><span className="houses-mcard-label">ปี:</span> {toBE(fee.year)}</span>
                    <span><span className="houses-mcard-label">งวด:</span> {resolvePeriodLabel(fee.period)}</span>
                    <span><span className="houses-mcard-label">ครบกำหนด:</span> {formatDateDMY(fee.due_date)}</span>
                    <span><span className="houses-mcard-label">ยอดรวม:</span> {Number(fee.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span><span className="houses-mcard-label">ยอดค้าง:</span> {getOutstandingAmountForFee(fee).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showPrintPreviewModal && (
        <div className="house-mo">
          <div className="house-md house-md--xl" style={{ '--house-md-max-w': '1120px', '--house-md-max-h': 'calc(100dvh - 36px)' }}>
            <div className="house-md-head">
              <div>
                <div className="house-md-title">🖨 {printPreviewTitle}</div>
                <div className="house-md-sub">แสดงตัวอย่างก่อนพิมพ์และดาวน์โหลดเอกสาร</div>
              </div>
            </div>
            <div className="house-md-body" style={{ padding: 10, background: '#eef2f7' }}>
              <div style={{ border: '1px solid var(--bo)', borderRadius: 10, overflow: 'hidden', background: '#fff', height: 'calc(100dvh - 220px)', minHeight: 420 }}>
                <iframe
                  title={printPreviewTitle}
                  srcDoc={printPreviewHtml}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              </div>
            </div>
            <div className="house-md-foot">
              <button className="btn btn-o" type="button" onClick={() => runPrintAction('pdf')} disabled={runningPrintAction}>{runningPrintAction ? 'กำลังสร้างไฟล์...' : '⬇ PDF'}</button>
              <button className="btn btn-o" type="button" onClick={() => runPrintAction('image')} disabled={runningPrintAction}>{runningPrintAction ? 'กำลังสร้างไฟล์...' : '⬇ Image'}</button>
              <button className="btn btn-a" type="button" onClick={() => runPrintAction('paper')} disabled={runningPrintAction}>🖨 พิมพ์</button>
              <button className="btn btn-g" type="button" onClick={closePrintPreviewModal} disabled={runningPrintAction}>ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}