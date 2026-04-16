import React, { useEffect, useMemo, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import Swal from 'sweetalert2'
import { listHouses } from '../../lib/houses'
import { getSystemConfig } from '../../lib/systemConfig'
import { buildPeriodLabelMapFromCycle, getPaymentCycleConfigByYear } from '../../lib/paymentCycles'
import villageLogo from '../../assets/village-logo.svg'
import { resolveImageToDataUrl, DEFAULT_LOGO_DATAURL } from '../../lib/logoUtils'
import {
  calculateFullYearFeeByHouse,
  calculateOverdueFeesByIds,
  calculateOverdueFeeCharges,
  createPayment,
  createNoticePrintLogs,
  deleteFee,
  getFeeYears,
  getLatestFeeYear,
  listFees,
  listNoticePrintCountsByFeeIds,
  listApprovedPaymentItemTotalsByFeeIds,
  listPaymentTotalsByFeeIds,
  listPayments,
  processHalfYearFeesAllHouses,
  summarizeFees,
  updateFee,
} from '../../lib/fees'

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

function extractDiscountFromNote(note) {
  const raw = String(note || '').replace(/^\[NOTICE_PRINT:[0-9]+\]\s*/, '')
  const match = raw.match(/^\[DISCOUNT:([0-9]+(?:\.[0-9]+)?)\]\s*/)
  return match ? Number(match[1]) : 0
}

function stripDiscountTag(note) {
  const raw = String(note || '').replace(/^\[NOTICE_PRINT:[0-9]+\]\s*/, '')
  return raw.replace(/^\[DISCOUNT:[0-9]+(?:\.[0-9]+)?\]\s*/, '')
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

const AdminFees = () => {
  const [fees, setFees] = useState([])
  const [payments, setPayments] = useState([])
  const [houses, setHouses] = useState([])
  const [periodLabelMapByYear, setPeriodLabelMapByYear] = useState({})
  const [currentYearPeriodLabels, setCurrentYearPeriodLabels] = useState(buildPeriodLabelMapFromCycle(null))
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
    waste_fee_per_period: 100,
    early_pay_discount_pct: 3,
    overdue_fine_pct: 10,
    notice_fee: 200,
  })
  const [statusFilter, setStatusFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [currentFeeYear, setCurrentFeeYear] = useState(new Date().getFullYear())
  const [feeYears, setFeeYears] = useState([])
  const [periodFilter, setPeriodFilter] = useState('all')
  const [archiveFilter, setArchiveFilter] = useState('paid')
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showProcessModal, setShowProcessModal] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editingFee, setEditingFee] = useState(null)
  const [editForm, setEditForm] = useState({
    status: 'unpaid',
    invoice_date: '',
    due_date: '',
    fee_common: '0',
    fee_parking: '0',
    fee_waste: '0',
    fee_overdue_common: '0',
    fee_overdue_fine: '0',
    fee_overdue_notice: '0',
    fee_fine: '0',
    fee_notice: '0',
    fee_violation: '0',
    fee_other: '0',
    fee_discount: '0',
    note: '',
  })
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [payingFee, setPayingFee] = useState(null)
  const [showPrintActionModal, setShowPrintActionModal] = useState(false)
  const [runningPrintAction, setRunningPrintAction] = useState(false)
  const [printPayload, setPrintPayload] = useState({ fees: [], title: '', docType: 'invoice', noticeNoMap: {} })
  const [noticePrintCounts, setNoticePrintCounts] = useState({})
  const [feeSubmittedTotals, setFeeSubmittedTotals] = useState({})
  const [feeApprovedTotals, setFeeApprovedTotals] = useState({})
  const [feeApprovedItemTotals, setFeeApprovedItemTotals] = useState({})
  const [paymentForm, setPaymentForm] = useState({
    payment_method: 'transfer',
    paid_at: new Date().toISOString().slice(0, 16),
    selectedItems: [],
    itemAmounts: {},
    note: '',
  })
  const [processForm, setProcessForm] = useState({
    yearBE: String(new Date().getFullYear() + 543),
    period: 'first_half',
    overwritePending: false,
  })
  const showLegacyBillingActions = false

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

  const feeItemInputBaseStyle = {
    width: 132,
    height: 28,
    padding: '0 8px',
    textAlign: 'right',
    border: '1px solid var(--bo)',
    borderRadius: 6,
    background: '#fff',
    fontSize: 12,
    lineHeight: '28px',
    boxSizing: 'border-box',
  }

  const yearOptions = useMemo(() => (feeYears.length > 0 ? feeYears : [currentFeeYear]), [feeYears, currentFeeYear])

  const yearCards = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return [
      { value: currentYear, label: toBE(currentYear) },
      { value: currentYear - 1, label: toBE(currentYear - 1) },
      { value: currentYear - 2, label: toBE(currentYear - 2) },
    ]
  }, [])

  const processYearOptions = useMemo(() => {
    const currentBE = new Date().getFullYear() + 543
    return [currentBE + 1, currentBE, currentBE - 1, currentBE - 2, currentBE - 3]
  }, [])

  const loadFeeData = async (override = {}) => {
    try {
      setLoading(true)
      const effectiveStatus = override.status ?? statusFilter
      const queryStatus = effectiveStatus === 'partial' ? 'all' : effectiveStatus

      const [feeData, paymentData, houseData] = await Promise.all([
        listFees({
          status: queryStatus,
          year: override.year ?? yearFilter,
          period: override.period ?? periodFilter,
        }),
        listPayments({ limit: 10, feeOnly: true }),
        houses.length === 0 ? listHouses() : Promise.resolve(houses),
      ])

      const noticeCounts = await listNoticePrintCountsByFeeIds(feeData.map((row) => row.id))

      const years = Array.from(new Set((feeData || [])
        .map((row) => Number(row?.year || 0))
        .filter((year) => Number.isFinite(year) && year > 0)))

      if (years.length > 0) {
        const cycleRows = await Promise.all(years.map(async (year) => {
          try {
            const config = await getPaymentCycleConfigByYear(year)
            return [year, buildPeriodLabelMapFromCycle(config)]
          } catch {
            return [year, buildPeriodLabelMapFromCycle(null)]
          }
        }))

        const nextLookup = cycleRows.reduce((acc, [year, labelMap]) => {
          acc[year] = labelMap
          return acc
        }, {})
        setPeriodLabelMapByYear((prev) => ({ ...prev, ...nextLookup }))
      }

      const paymentTotals = await listPaymentTotalsByFeeIds(feeData.map((row) => row.id))
      const paymentItemTotals = await listApprovedPaymentItemTotalsByFeeIds(feeData.map((row) => row.id))
      setFeeSubmittedTotals(paymentTotals.submitted || {})
      setFeeApprovedTotals(paymentTotals.approved || {})
      setFeeApprovedItemTotals(paymentItemTotals || {})
      setNoticePrintCounts(noticeCounts || {})

      const filteredFees = effectiveStatus === 'partial'
        ? feeData.filter((fee) => {
          const submittedAmount = Number((paymentTotals.submitted || {})[fee.id] || 0)
          const totalAmount = Number(fee.total_amount || 0)
          return submittedAmount > 0 && submittedAmount < totalAmount
        })
        : feeData

      const sortedFees = [...filteredFees].sort((left, right) => {
        const soiCompare = normalizeSoiValue(left?.houses?.soi) - normalizeSoiValue(right?.houses?.soi)
        if (soiCompare !== 0) return soiCompare
        return houseSorter.compare(left?.houses?.house_no || '', right?.houses?.house_no || '')
      })

      setFees(sortedFees)
      setPayments(paymentData)
      setHouses(houseData)
    } catch (error) {
      console.error('Error loading fees:', error)
      const message = String(error?.message || error || '')
      if (/provided callback is no longer runnable/i.test(message)) {
        // Non-actionable browser/runtime callback cancellation (often after print dialog cancel).
        return
      }
      await Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      const latestYear = await getLatestFeeYear().catch(() => new Date().getFullYear())
      const allYears = await getFeeYears().catch(() => [latestYear])
      setCurrentFeeYear(latestYear)
      setYearFilter(latestYear)
      setFeeYears(allYears)
      setProcessForm((prev) => ({ ...prev, yearBE: String(new Date().getFullYear() + 543) }))
      await Promise.all([
        getSystemConfig().then(setSetup).catch(() => {}),
        loadFeeData({ year: latestYear, status: 'all', period: 'all' }),
      ])
    }

    init()
  }, [])

  useEffect(() => {
    const syncCurrentYearPeriods = async () => {
      const yearCE = Number(currentFeeYear || 0)
      if (!Number.isFinite(yearCE) || yearCE <= 0) {
        setCurrentYearPeriodLabels(buildPeriodLabelMapFromCycle(null))
        return
      }

      try {
        const cycleConfig = await getPaymentCycleConfigByYear(yearCE)
        setCurrentYearPeriodLabels(buildPeriodLabelMapFromCycle(cycleConfig))
      } catch {
        setCurrentYearPeriodLabels(buildPeriodLabelMapFromCycle(null))
      }
    }

    syncCurrentYearPeriods()
  }, [currentFeeYear])

  const resolvePeriodLabel = (period, year) => {
    const byYear = periodLabelMapByYear[Number(year)] || currentYearPeriodLabels
    return byYear?.[period] || periodLabel(period)
  }

  const summary = useMemo(() => {
    const totalInvoiced = fees
      .filter((fee) => fee.status !== 'cancelled')
      .reduce((sum, fee) => sum + Number(fee.total_amount || 0), 0)
    const totalCollected = fees
      .reduce((sum, fee) => sum + Math.min(Number(feeApprovedTotals[fee.id] || 0), Number(fee.total_amount || 0)), 0)
    const totalOutstanding = fees
      .filter((fee) => fee.status !== 'paid' && fee.status !== 'cancelled')
      .reduce((sum, fee) => sum + Math.max(0, Number(fee.total_amount || 0) - Number(feeSubmittedTotals[fee.id] || 0)), 0)

    return { totalInvoiced, totalCollected, totalOutstanding }
  }, [fees, feeApprovedTotals, feeSubmittedTotals])

  // Auto-computed total matching the DB trigger: SUM(all fee fields) where fee_other is stored as (fee_other - discount).
  const editTotal = useMemo(() => {
    const gross = ['fee_common', 'fee_parking', 'fee_waste', 'fee_overdue_common', 'fee_overdue_fine', 'fee_overdue_notice', 'fee_fine', 'fee_notice', 'fee_violation', 'fee_other']
      .reduce((acc, k) => acc + Number(editForm[k] || 0), 0)
    return Math.max(0, gross - Number(editForm.fee_discount || 0))
  }, [editForm])

  const displayFees = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return fees
    return fees.filter((fee) => {
      const houseNo = String(fee?.houses?.house_no || '').toLowerCase()
      const ownerName = String(fee?.houses?.owner_name || '').toLowerCase()
      const soi = String(fee?.houses?.soi || '').toLowerCase()
      const period = String(periodLabel(fee?.period || '')).toLowerCase()
      const dynamicPeriod = String(resolvePeriodLabel(fee?.period || '', fee?.year)).toLowerCase()
      return houseNo.includes(keyword) || ownerName.includes(keyword) || soi.includes(keyword) || period.includes(keyword) || dynamicPeriod.includes(keyword)
    })
  }, [fees, searchKeyword])

  const filteredFees = useMemo(() => {
    if (periodFilter === 'all') return displayFees
    return displayFees.filter((fee) => fee.period === periodFilter)
  }, [displayFees, periodFilter])

  const getApprovedAmountForFee = (fee) => Number(feeApprovedTotals[fee?.id] || 0)
  const getSubmittedAmountForFee = (fee) => Number(feeSubmittedTotals[fee?.id] || 0)

  const editApprovedAmount = useMemo(() => (editingFee ? getApprovedAmountForFee(editingFee) : 0), [editingFee, feeApprovedTotals])
  const editOutstandingAfterChange = useMemo(() => Math.max(0, editTotal - editApprovedAmount), [editTotal, editApprovedAmount])

  const getEditItemDueAmount = (itemKey) => {
    if (!editingFee) return 0
    if (itemKey === 'fee_other') {
      const feeOtherBase = Number(editForm.fee_other || 0)
      const discount = Math.max(0, Number(editForm.fee_discount || 0))
      return Math.max(0, feeOtherBase - discount)
    }
    return Math.max(0, Number(editForm[itemKey] || 0))
  }

  const getEditItemApprovedAmount = (itemKey) => {
    if (!editingFee) return 0
    return Number((feeApprovedItemTotals[editingFee.id] || {})[itemKey] || 0)
  }

  const getEditItemOutstandingAmount = (itemKey) => {
    const due = getEditItemDueAmount(itemKey)
    const approved = getEditItemApprovedAmount(itemKey)
    return Math.max(0, due - approved)
  }

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

  const isFeeFullyPaid = (fee) => {
    const approvedAmount = getApprovedAmountForFee(fee)
    return approvedAmount >= Number(fee?.total_amount || 0)
  }

  const hasAnyApprovedPaymentInYearForHouse = (fee) => fees.some((item) => (
    item.house_id === fee.house_id
    && item.year === fee.year
    && Number(feeApprovedTotals[item.id] || 0) > 0
  ))

  const canCalculateAnnualFee = (fee) => (
    fee?.period !== 'full_year'
    && fee?.status !== 'cancelled'
    && !isFeeFullyPaid(fee)
    && !hasAnyApprovedPaymentInYearForHouse(fee)
  )

  const getOutstandingAmountForFee = (fee) => {
    return getOutstandingItemRowsForFee(fee).reduce((sum, row) => sum + Number(row.outstandingAmount || 0), 0)
  }

  const getFeeStatusBadge = (fee) => {
    const approvedAmount = getApprovedAmountForFee(fee)
    const submittedAmount = getSubmittedAmountForFee(fee)
    const totalAmount = Number(fee?.total_amount || 0)

    if (fee?.status === 'cancelled') return { className: 'bd b-dg', label: 'ยกเลิก' }
    if (approvedAmount >= totalAmount && totalAmount > 0) return { className: 'bd b-ok', label: 'ชำระแล้ว' }
    if (submittedAmount > 0 && submittedAmount < totalAmount) return { className: 'bd b-ac', label: 'ชำระบางส่วน' }
    if (fee?.status === 'paid') return { className: 'bd b-ok', label: 'ชำระแล้ว' }
    if (fee?.status === 'pending') return { className: 'bd b-pr', label: 'รอตรวจสอบ' }
    if (fee?.status === 'overdue') return { className: 'bd b-dg', label: 'ค้างชำระ' }
    return { className: 'bd b-wn', label: 'ยังไม่ชำระ' }
  }

  const periodCards = useMemo(() => ([
    { value: 'all', label: 'ทั้งหมด', count: fees.length },
    { value: 'first_half', label: currentYearPeriodLabels.first_half, count: fees.filter((fee) => fee.period === 'first_half').length },
    { value: 'second_half', label: currentYearPeriodLabels.second_half, count: fees.filter((fee) => fee.period === 'second_half').length },
    { value: 'full_year', label: currentYearPeriodLabels.full_year, count: fees.filter((fee) => fee.period === 'full_year').length },
  ]), [fees, currentYearPeriodLabels])

  const activeFees = useMemo(() => filteredFees.filter((fee) => {
    if (fee.status === 'cancelled') return false
    if (isFeeFullyPaid(fee) || fee.status === 'paid') return false
    return getOutstandingAmountForFee(fee) > 0
  }), [filteredFees, feeApprovedTotals, feeSubmittedTotals])

  const archiveCards = useMemo(() => ([
    { value: 'paid', label: 'ชำระแล้ว', count: filteredFees.filter((fee) => isFeeFullyPaid(fee) || fee.status === 'paid').length },
    { value: 'cancelled', label: 'ยกเลิก', count: filteredFees.filter((fee) => fee.status === 'cancelled').length },
  ]), [filteredFees, feeApprovedTotals])

  const archiveFees = useMemo(() => filteredFees.filter((fee) => {
    if (archiveFilter === 'cancelled') return fee.status === 'cancelled'
    return isFeeFullyPaid(fee) || fee.status === 'paid'
  }), [filteredFees, archiveFilter, feeApprovedTotals])

  const handleOpenProcessModal = () => {
    setProcessForm({
      yearBE: String(new Date().getFullYear() + 543),
      period: 'first_half',
      overwritePending: false,
    })
    setShowProcessModal(true)
  }

  const handleProcessAll = async (event) => {
    event.preventDefault()
    try {
      setProcessing(true)
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
      await Swal.fire({
        icon: 'success',
        title: 'Process สำเร็จ',
        html: `สร้างใหม่ ${result.created} หลัง<br/>อัปเดต ${result.updated} หลัง<br/>ข้าม (ชำระแล้ว) ${result.skippedPaid} หลัง<br/>ข้าม (รอตรวจสอบ) ${result.skippedPending} หลัง${result.skippedFullYear > 0 ? `<br/>ข้าม (มีใบแจ้งหนี้เต็มปีแล้ว) <strong>${result.skippedFullYear}</strong> หลัง` : ''}${result.cancelledFirstHalf > 0 ? `<br/>ยกเลิกใบแจ้งหนี้ครึ่งปีแรกเดิม ${result.cancelledFirstHalf} หลัง` : ''}${processForm.overwritePending ? '<br/><span style="color:#0f766e">* เลือกทับรายการรอตรวจสอบแล้ว</span>' : ''}`,
      })
      setShowProcessModal(false)
      await loadFeeData({ status: statusFilter, year: yearFilter, period: periodFilter })
    } catch (error) {
      Swal.close()
      await Swal.fire({ icon: 'error', title: 'Process ไม่สำเร็จ', text: error.message })
    } finally {
      setProcessing(false)
    }
  }

  const handleEditFee = (fee) => {
    if (fee.status === 'cancelled') {
      Swal.fire({
        icon: 'info',
        title: 'ไม่สามารถแก้ไขได้',
        text: fee.note || 'รายการนี้ถูกยกเลิกโดยระบบอัตโนมัติหลังจากยกยอดไปใบแจ้งหนี้งวดถัดไปแล้ว',
      })
      return
    }
    const discountAmount = extractDiscountFromNote(fee.note)
    const feeOtherBase = Number(fee.fee_other || 0) + discountAmount

    setEditingFee(fee)
    setEditForm({
      status: fee.status || 'unpaid',
      invoice_date: fee.invoice_date || '',
      due_date: fee.due_date || '',
      fee_common: String(fee.fee_common || 0),
      fee_parking: String(fee.fee_parking || 0),
      fee_waste: String(fee.fee_waste || 0),
      fee_overdue_common: String(fee.fee_overdue_common || 0),
      fee_overdue_fine: String(fee.fee_overdue_fine || 0),
      fee_overdue_notice: String(fee.fee_overdue_notice || 0),
      fee_fine: String(fee.fee_fine || 0),
      fee_notice: String(fee.fee_notice || 0),
      fee_violation: String(fee.fee_violation || 0),
      fee_other: String(feeOtherBase),
      fee_discount: String(discountAmount),
      note: stripDiscountTag(fee.note || ''),
    })
    setShowEditModal(true)
  }

  const handleSubmitEdit = async (event) => {
    event.preventDefault()
    if (!editingFee) return

    try {
      const currentApprovedAmount = getApprovedAmountForFee(editingFee)
      const nextInvoiceTotal = Number(editTotal || 0)
      if (editForm.status === 'paid' && currentApprovedAmount < nextInvoiceTotal) {
        await Swal.fire({
          icon: 'warning',
          title: 'ยังตั้งเป็นชำระแล้วไม่ได้',
          text: `ยอดอนุมัติ ${currentApprovedAmount.toLocaleString('th-TH')} / ยอดรวมใหม่ ${nextInvoiceTotal.toLocaleString('th-TH')} บาท`,
        })
        return
      }

      setSavingEdit(true)
      const discountAmount = Math.max(0, Number(editForm.fee_discount || 0))
      const feeOtherNet = Number(editForm.fee_other || 0) - discountAmount
      const noteValue = `${discountAmount > 0 ? `[DISCOUNT:${discountAmount}] ` : ''}${editForm.note || ''}`.trim() || null
      const nextStatus = currentApprovedAmount >= nextInvoiceTotal
        ? 'paid'
        : editForm.status || 'unpaid'

      await updateFee(editingFee.id, {
        status: nextStatus,
        invoice_date: editForm.invoice_date || null,
        due_date: editForm.due_date || null,
        fee_common: Number(editForm.fee_common || 0),
        fee_parking: Number(editForm.fee_parking || 0),
        fee_waste: Number(editForm.fee_waste || 0),
        fee_overdue_common: Number(editForm.fee_overdue_common || 0),
        fee_overdue_fine: Number(editForm.fee_overdue_fine || 0),
        fee_overdue_notice: Number(editForm.fee_overdue_notice || 0),
        fee_fine: Number(editForm.fee_fine || 0),
        fee_notice: Number(editForm.fee_notice || 0),
        fee_violation: Number(editForm.fee_violation || 0),
        fee_other: feeOtherNet,
        note: noteValue,
      })
      setShowEditModal(false)
      setEditingFee(null)
      await loadFeeData({ status: statusFilter, year: yearFilter })
      await Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1200, showConfirmButton: false })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'แก้ไขไม่สำเร็จ', text: error.message })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleCalculateAnnual = async (fee) => {
    try {
      Swal.fire({
        title: 'กำลังคำนวณทั้งปี',
        text: 'ระบบกำลังรวมรายการและคำนวณส่วนลด',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
        showConfirmButton: false,
      })
      await calculateFullYearFeeByHouse({
        houseId: fee.house_id,
        year: fee.year,
        setup,
      })
      Swal.close()
      await Swal.fire({
        icon: 'success',
        title: 'คำนวณทั้งปีสำเร็จ',
        text: `ใช้ส่วนลดค่าส่วนกลาง ${Number(setup.early_pay_discount_pct || 0)}%`,
        timer: 1400,
        showConfirmButton: false,
      })
      await loadFeeData({ status: statusFilter, year: yearFilter })
    } catch (error) {
      Swal.close()
      await Swal.fire({ icon: 'error', title: 'คำนวณทั้งปีไม่สำเร็จ', text: error.message })
    }
  }

  const handleCalculateOverdue = async (fee) => {
    try {
      Swal.fire({
        title: 'กำลังคำนวณค่าปรับ',
        text: 'กำลังคำนวณเบี้ยปรับและค่าทวงถามตาม setup',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
        showConfirmButton: false,
      })
      await calculateOverdueFeeCharges(fee.id, setup)
      Swal.close()
      await Swal.fire({
        icon: 'success',
        title: 'คำนวณค่าปรับแล้ว',
        text: `ค่าปรับ ${Number(setup.overdue_fine_pct || 0)}% + ค่าทวงถาม ${Number(setup.notice_fee || 0).toLocaleString('th-TH')} บาท`,
        timer: 1400,
        showConfirmButton: false,
      })
      await loadFeeData({ status: statusFilter, year: yearFilter })
    } catch (error) {
      Swal.close()
      await Swal.fire({ icon: 'warning', title: 'ยังคำนวณไม่ได้', text: error.message })
    }
  }

  const handleDeleteFee = async (fee) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันลบใบแจ้งหนี้?',
      text: `${fee.houses?.house_no || '-'} ${resolvePeriodLabel(fee.period, fee.year)} ปี ${toBE(fee.year)}`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626',
    })
    if (!result.isConfirmed) return

    try {
      await deleteFee(fee.id)
      await loadFeeData({ status: statusFilter, year: yearFilter })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: error.message })
    }
  }

  const handleBulkOverdue = async () => {
    if (fees.length === 0) {
      await Swal.fire({ icon: 'info', title: 'ไม่มีรายการให้คำนวณ', text: 'กรองข้อมูลก่อนหรือสร้างใบแจ้งหนี้ก่อน' })
      return
    }

    const result = await Swal.fire({
      icon: 'question',
      title: 'คำนวณค่าปรับจากรายการที่แสดง?',
      text: `จะคำนวณจากรายการที่แสดงอยู่ตอนนี้ ${fees.length} รายการ`,
      showCancelButton: true,
      confirmButtonText: 'คำนวณ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#0f766e',
    })
    if (!result.isConfirmed) return

    try {
      Swal.fire({
        title: 'กำลังคำนวณค่าปรับทั้งหมด',
        text: 'ระบบกำลังประมวลผลรายการที่แสดงอยู่',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
        showConfirmButton: false,
      })
      const summaryResult = await calculateOverdueFeesByIds({
        feeIds: fees.map((item) => item.id),
        setup,
      })
      Swal.close()
      await Swal.fire({
        icon: 'success',
        title: 'คำนวณค่าปรับสำเร็จ',
        html: `อัปเดต ${summaryResult.updated} รายการ<br/>ข้าม (ยังไม่ถึงกำหนด/ไม่มี due) ${summaryResult.skippedNotDue} รายการ<br/>ข้าม (ชำระแล้ว) ${summaryResult.skippedPaid} รายการ`,
      })
      await loadFeeData({ status: statusFilter, year: yearFilter })
    } catch (error) {
      Swal.close()
      await Swal.fire({ icon: 'error', title: 'คำนวณไม่สำเร็จ', text: error.message })
    }
  }

  const isNoticePrintable = (fee) => {
    const penaltyTotal = Number(fee?.fee_fine || 0) + Number(fee?.fee_overdue_fine || 0)
    return penaltyTotal > 0 && fee?.status !== 'cancelled' && !isFeeFullyPaid(fee) && getOutstandingAmountForFee(fee) > 0
  }

  const openPrintActionModal = (targetFees, title, options = {}) => {
    if (!targetFees || targetFees.length === 0) {
      Swal.fire({ icon: 'info', title: 'ไม่พบใบแจ้งหนี้สำหรับพิมพ์' })
      return
    }
    setPrintPayload({
      fees: targetFees,
      title,
      docType: options.docType || 'invoice',
      noticeNoMap: options.noticeNoMap || {},
    })
    setShowPrintActionModal(true)
  }

  const getNoticeCountForFee = (fee) => {
    const dbCount = Number(noticePrintCounts[fee?.id] || 0)
    const legacyCount = extractNoticePrintCount(fee?.note)
    return Math.max(dbCount, legacyCount)
  }

  const persistNoticePrintCounts = async (mode) => {
    if (printPayload.docType !== 'notice') return
    const noticeNoMap = printPayload.noticeNoMap || {}
    const rows = (printPayload.fees || []).map((fee) => ({
      fee_id: fee.id,
      notice_no: Number(noticeNoMap[fee.id] || 0),
      print_mode: mode,
    }))
    await createNoticePrintLogs(rows)
  }

  // use shared resolveImageToDataUrl from lib/logoUtils

  const buildInvoiceHtml = async (targetFees, title, {
    autoPrint = false,
    forCapture = false,
    docType = 'invoice',
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

    // Two invoice sections per house (original + copy) — separate pages
    const invoiceBlocks = targetFees.flatMap((fee, feeIndex) => {
      const invoiceNo = buildInvoiceDocumentNo(fee)
      const periodText = `${resolvePeriodLabel(fee.period, fee.year)} ปี ${toBE(fee.year)}`
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
        // Original page
        `
          <section class="sheet page-break${isNotice ? ' notice-sheet' : ''}">
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
        // Copy page
        `
          <section class="sheet${isLastFee ? '' : ' page-break'}${isNotice ? ' notice-sheet' : ''}">
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
        `
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
            /* Setting page margin to 0 removes browser-injected header (date/title) and footer (URL/page no.).
               Body padding compensates so content is not flush against paper edges. */
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
            .page-break {}
            .head {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              padding: 10px 12px;
              background: #ffffff;
              margin-bottom: 4px;
            }
            .notice-sheet .head {
              border-color: #fdba74;
              background: #fff7ed;
            }
            .brand { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }
            .logo-wrap { width: 64px; height: 64px; border-radius: 12px; background: #f1f5f9; border: 1.5px solid #cbd5e1; padding: 6px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
            .logo-wrap img { width: 100%; height: 100%; display: block; object-fit: contain; border-radius: 8px; }
            .doc { font-size: 16px; font-weight: 700; line-height: 1.3; }
            .notice-sheet .doc { color: #9a3412; }
            .village { font-size: 11px; margin-top: 3px; font-weight: 600; }
            .sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
            .doc-meta { font-size: 10px; min-width: 180px; display: flex; flex-direction: column; gap: 2px; word-break: break-word; }
            .doc-meta span { color: #6b7280; font-weight: 500; }
            .copy-mark-row {
              display: flex;
              gap: 6px;
              justify-content: flex-end;
              margin-top: 10px;
              margin-right: -4px;
            }
            .copy-mark {
              border: none;
              border-radius: 4px;
              padding: 3px 10px;
              text-align: center;
              font-size: 14px;
              font-weight: 700;
              line-height: 1.3;
              color: #94a3b8;
              background: transparent;
            }
            .copy-mark--active {
              color: #0c4a6e;
              background: transparent;
            }
            .notice-sheet .copy-mark--active { color: #b45309; }
            .notice-alert {
              border: 1px dashed #fb923c;
              background: #fff7ed;
              color: #9a3412;
              border-radius: 4px;
              padding: 7px 10px;
              font-size: 10px;
              font-weight: 600;
              line-height: 1.45;
            }
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
            .amount-text {
              margin-top: 4px;
              font-size: 10px;
              color: #374151;
              font-weight: 500;
              text-align: right;
            }
            .payment-box { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
            .payment-title { font-size: 11px; font-weight: 700; color: #111827; }
            .payment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; word-break: break-word; }
            .payment-grid > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
            .payment-grid span { font-size: 9px; color: #6b7280; font-weight: 500; }
            .payment-grid strong { font-size: 11px; font-weight: 600; }
            .payment-note {
              border-top: 1px dashed #d1d5db;
              padding-top: 4px;
              font-size: 10px;
              color: #4b5563;
            }
            .foot {
              margin-top: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              padding: 10px 12px;
              display: flex;
              align-items: flex-end;
              justify-content: space-between;
              gap: 12px;
              background: #f9fafb;
            }
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
    // 794px = A4 width at 96dpi — must match exactly so html2canvas captures at A4 ratio
    iframe.style.width = '794px'
    iframe.style.height = `${sheetCount * 1200}px`
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    doc.open()
    doc.write(html)
    doc.close()
    // Wait for fonts + images to load
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return {
      iframe,
      doc,
      sheets: Array.from(doc.querySelectorAll('.sheet')),
    }
  }

  const runPrintAction = async (mode) => {
    if (!printPayload?.fees?.length) return
    try {
      setRunningPrintAction(true)

      if (mode === 'image' || mode === 'pdf') {
        // forCapture=true → each .sheet is fixed 794×1122px (exact A4 at 96dpi)
        const expectedSheets = printPayload.fees.length * 2 // original + copy per fee
        const html = await buildInvoiceHtml(printPayload.fees, printPayload.title, {
          autoPrint: false,
          forCapture: true,
          docType: printPayload.docType,
          noticeNoMap: printPayload.noticeNoMap,
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
            link.download = `${printPayload.title || 'invoice'}-${i + 1}.png`
            link.click()
          }
        } else {
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
          const A4W = pdf.internal.pageSize.getWidth()   // 210mm
          const A4H = pdf.internal.pageSize.getHeight()  // 297mm
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
            // canvas is exactly A4 ratio (794:1122 ≈ 210:297) → no distortion
            pdf.addImage(imgData, 'JPEG', 0, 0, A4W, A4H, undefined, 'FAST')
          }
          pdf.save(`${printPayload.title || 'invoice'}.pdf`)
        }

        await persistNoticePrintCounts(mode)
        document.body.removeChild(iframe)
        setShowPrintActionModal(false)
        await loadFeeData({ status: statusFilter, year: yearFilter, period: periodFilter })
        return
      }

      const html = await buildInvoiceHtml(printPayload.fees, printPayload.title, {
        autoPrint: true,
        docType: printPayload.docType,
        noticeNoMap: printPayload.noticeNoMap,
      })
      const w = openHtmlInWindow(html)
      if (!w) {
        await Swal.fire({ icon: 'warning', title: 'ไม่สามารถเปิดหน้าต่างพิมพ์ได้', text: 'กรุณาอนุญาต popup ของเบราว์เซอร์' })
        return
      }
      setShowPrintActionModal(false)
      // Avoid reloading immediately after opening print dialog; canceling print can invalidate callbacks in some runtimes.
      await persistNoticePrintCounts(mode).catch(() => {})
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ดำเนินการไม่สำเร็จ', text: error.message })
    } finally {
      setRunningPrintAction(false)
    }
  }

  const handlePrintInvoicesAll = () => {
    openPrintActionModal(filteredFees, 'ใบแจ้งหนี้ทั้งหมด', { docType: 'invoice' })
  }

  const handlePrintInvoiceByHouse = (fee) => {
    const title = `ใบแจ้งหนี้ ${fee.houses?.house_no || '-'} ${resolvePeriodLabel(fee.period, fee.year)} ปี ${toBE(fee.year)}`
    openPrintActionModal([fee], title, { docType: 'invoice' })
  }

  const handlePrintNoticeByHouse = (fee) => {
    if (!isNoticePrintable(fee)) {
      Swal.fire({ icon: 'info', title: 'ยังพิมพ์ใบเตือนไม่ได้', text: 'ต้องมีค่าปรับและเป็นรายการค้างชำระก่อน' })
      return
    }
    const nextNoticeNo = getNoticeCountForFee(fee) + 1
    const title = `ใบแจ้งเตือน ${fee.houses?.house_no || '-'} ครั้งที่ ${nextNoticeNo}`
    openPrintActionModal([fee], title, {
      docType: 'notice',
      noticeNoMap: { [fee.id]: nextNoticeNo },
    })
  }

  const handlePrintNoticesAll = () => {
    const noticeFees = filteredFees.filter(isNoticePrintable)
    if (noticeFees.length === 0) {
      Swal.fire({ icon: 'info', title: 'ไม่พบรายการที่พิมพ์ใบเตือน', text: 'ต้องมีค่าปรับและยังค้างชำระ' })
      return
    }
    const noticeNoMap = noticeFees.reduce((acc, fee) => {
      acc[fee.id] = getNoticeCountForFee(fee) + 1
      return acc
    }, {})
    openPrintActionModal(noticeFees, `ใบแจ้งเตือนค้างชำระทั้งหมด (${noticeFees.length} หลัง)`, {
      docType: 'notice',
      noticeNoMap,
    })
  }

  const handleAddPayment = (fee) => {
    const payableItems = getOutstandingItemRowsForFee(fee).map((row) => ({
      ...row,
      amount: Number(row.outstandingAmount || 0),
    }))

    const selectedItems = payableItems.map((item) => item.key)
    const itemAmounts = payableItems.reduce((acc, item) => {
      acc[item.key] = item.amount
      return acc
    }, {})

    setPayingFee(fee)
    setPaymentForm({
      payment_method: 'transfer',
      paid_at: new Date().toISOString().slice(0, 16),
      selectedItems,
      itemAmounts,
      note: '',
    })
    setShowPaymentModal(true)
  }

  const paymentSelectedAmount = useMemo(() => {
    if (!payingFee) return 0
    return paymentForm.selectedItems.reduce((sum, key) => sum + Number(paymentForm.itemAmounts?.[key] || 0), 0)
  }, [payingFee, paymentForm.selectedItems, paymentForm.itemAmounts])

  const payableFeeItems = useMemo(() => {
    if (!payingFee) return []
    return feeItemDefs
      .map((item) => ({ ...item, amount: Number(payingFee[item.key] || 0) }))
      .filter((item) => item.amount > 0)
  }, [payingFee])

  const paymentInvoiceTotal = useMemo(() => {
    if (!payingFee) return 0
    return payableFeeItems.reduce((sum, item) => sum + item.amount, 0)
  }, [payingFee, payableFeeItems])

  const paymentRemaining = Math.max(0, paymentInvoiceTotal - paymentSelectedAmount)
  const paymentCoveragePct = paymentInvoiceTotal > 0
    ? Math.min(100, Math.round((paymentSelectedAmount / paymentInvoiceTotal) * 100))
    : 0

  const togglePaymentItem = (itemKey, checked) => {
    setPaymentForm((prev) => {
      const exists = prev.selectedItems.includes(itemKey)
      const baseItem = payableFeeItems.find((item) => item.key === itemKey)
      const fullAmount = Number(baseItem?.amount || 0)
      if (checked && !exists) {
        return {
          ...prev,
          selectedItems: [...prev.selectedItems, itemKey],
          itemAmounts: {
            ...prev.itemAmounts,
            [itemKey]: fullAmount,
          },
        }
      }
      if (!checked && exists) {
        return {
          ...prev,
          selectedItems: prev.selectedItems.filter((key) => key !== itemKey),
          itemAmounts: {
            ...prev.itemAmounts,
            [itemKey]: 0,
          },
        }
      }
      return prev
    })
  }

  const handleChangeItemAmount = (itemKey, rawValue, maxAmount) => {
    let nextValue = Number(rawValue)
    if (!Number.isFinite(nextValue)) nextValue = 0
    if (nextValue < 0) nextValue = 0
    if (nextValue > maxAmount) nextValue = maxAmount

    setPaymentForm((prev) => ({
      ...prev,
      itemAmounts: {
        ...prev.itemAmounts,
        [itemKey]: nextValue,
      },
    }))
  }

  const selectAllPaymentItems = () => {
    setPaymentForm((prev) => ({
      ...prev,
      selectedItems: payableFeeItems.map((item) => item.key),
      itemAmounts: payableFeeItems.reduce((acc, item) => {
        acc[item.key] = Number(item.amount || 0)
        return acc
      }, {}),
    }))
  }

  const clearPaymentItems = () => {
    setPaymentForm((prev) => ({
      ...prev,
      selectedItems: [],
      itemAmounts: payableFeeItems.reduce((acc, item) => {
        acc[item.key] = 0
        return acc
      }, {}),
    }))
  }

  const selectBasePaymentItems = () => {
    const baseKeys = ['fee_common', 'fee_parking', 'fee_waste']
    setPaymentForm((prev) => ({
      ...prev,
      selectedItems: payableFeeItems
        .map((item) => item.key)
        .filter((key) => baseKeys.includes(key)),
      itemAmounts: payableFeeItems.reduce((acc, item) => {
        acc[item.key] = Number(prev.itemAmounts?.[item.key] ?? item.amount)
        return acc
      }, {}),
    }))
  }

  const setSelectedItemsToFullAmount = () => {
    setPaymentForm((prev) => ({
      ...prev,
      itemAmounts: payableFeeItems.reduce((acc, item) => {
        const isSelected = prev.selectedItems.includes(item.key)
        acc[item.key] = isSelected ? item.amount : Number(prev.itemAmounts?.[item.key] ?? item.amount)
        return acc
      }, {}),
    }))
  }

  const clearSelectedItemAmounts = () => {
    setPaymentForm((prev) => ({
      ...prev,
      itemAmounts: payableFeeItems.reduce((acc, item) => {
        const isSelected = prev.selectedItems.includes(item.key)
        acc[item.key] = isSelected ? 0 : Number(prev.itemAmounts?.[item.key] ?? item.amount)
        return acc
      }, {}),
    }))
  }

  const handleSubmitPayment = async (event) => {
    event.preventDefault()
    if (!payingFee) return
    if (paymentForm.selectedItems.length === 0) {
      await Swal.fire({ icon: 'warning', title: 'กรุณาเลือกรายการที่ชำระอย่างน้อย 1 รายการ' })
      return
    }

    if (paymentSelectedAmount <= 0) {
      await Swal.fire({ icon: 'warning', title: 'ยอดรับชำระต้องมากกว่า 0' })
      return
    }

    try {
      setSavingPayment(true)
      const selectedItemsMeta = feeItemDefs
        .filter((item) => paymentForm.selectedItems.includes(item.key))
        .map((item) => ({
          item_key: item.key,
          item_label: item.label,
          due_amount: Number(payingFee[item.key] || 0),
          paid_amount: Number(paymentForm.itemAmounts?.[item.key] || 0),
        }))

      const selectedLabels = feeItemDefs
        .filter((item) => paymentForm.selectedItems.includes(item.key))
        .map((item) => `${item.label} ${Number(paymentForm.itemAmounts?.[item.key] || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

      const noteParts = [`ชำระรายการ: ${selectedLabels.join(', ')}`]
      if (paymentForm.note.trim()) noteParts.push(paymentForm.note.trim())

      await createPayment({
        fee_id: payingFee.id,
        house_id: payingFee.house_id,
        amount: paymentSelectedAmount,
        payment_method: paymentForm.payment_method,
        paid_at: paymentForm.paid_at,
        note: noteParts.join(' | '),
        payment_items: selectedItemsMeta,
        setFeeStatusFromAmount: true,
      })

      setShowPaymentModal(false)
      setPayingFee(null)
      await loadFeeData({ status: statusFilter, year: yearFilter })
      await Swal.fire({ icon: 'success', title: 'บันทึกรับชำระแล้ว', timer: 1200, showConfirmButton: false })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'บันทึกการชำระไม่สำเร็จ', text: error.message })
    } finally {
      setSavingPayment(false)
    }
  }

  return (
    <div className="pane on houses-compact fees-compact" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">
              <img
                className="ph-ico-img"
                src={setup.village_logo_url || localStorage.getItem('vms-login-circle-logo-url') || villageLogo}
                alt="village-logo"
              />
            </div>
            <div>
              <div className="ph-h1">ค่าส่วนกลาง</div>
              <div className="ph-sub">ออกใบแจ้งหนี้ทุกหลังจาก setup ระบบ และจัดการรายหลัง</div>
            </div>
          </div>
        </div>

      </div>

      <div className="card report-filter-card admin-search-filter-card">
        <div className="cb" style={{ padding: 12 }}>
        <div className="houses-filter-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {yearCards.map((card) => {
              const active = currentFeeYear === card.value
              return (
                <button
                  key={card.value}
                  type="button"
                  onClick={() => {
                    setCurrentFeeYear(card.value)
                    setYearFilter(card.value)
                    loadFeeData({ year: card.value, status: 'all', period: 'all' })
                  }}
                  style={{
                    border: active ? '2px solid #0c4a6e' : '1px solid var(--bo)',
                    background: active ? '#eff6ff' : '#fff',
                    color: active ? '#0c4a6e' : '#334155',
                    borderRadius: 8,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    transition: 'all 0.15s',
                  }}
                >
                  {card.label}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <input
              className="houses-filter-input"
              placeholder="ค้นหา ซอย / บ้านเลขที่ / เจ้าของ"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ minWidth: 240 }}
            />
            <button
              type="button"
              className="btn btn-a btn-sm houses-filter-btn"
              onClick={() => {
                setSearchKeyword(searchInput.trim())
                loadFeeData({ year: currentFeeYear, status: 'all', period: 'all' })
              }}
            >
              ค้นหา
            </button>
          </div>
        </div>
        </div>
      </div>

      <div className="stats" style={{ gap: '12px' }}>
        <div className="sc" style={{ display: 'flex', padding: '12px 15px', flexDirection: 'row', alignItems: 'center', gap: '12px' }}><div className="sc-ico p" style={{ width: '42px', height: '42px', minWidth: '42px', fontSize: '24px', marginBottom: 0 }}>🧾</div><div><div className="sc-v" style={{ fontSize: '18px', fontWeight: 700 }}>{summary.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="sc-l" style={{ fontSize: '15px', marginTop: '1px' }}>ยอดออกใบแจ้งหนี้</div></div></div>
        <div className="sc" style={{ display: 'flex', padding: '12px 15px', flexDirection: 'row', alignItems: 'center', gap: '12px' }}><div className="sc-ico a" style={{ width: '42px', height: '42px', minWidth: '42px', fontSize: '24px', marginBottom: 0 }}>✅</div><div><div className="sc-v" style={{ fontSize: '18px', fontWeight: 700 }}>{summary.totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="sc-l" style={{ fontSize: '15px', marginTop: '1px' }}>ยอดชำระแล้ว</div></div></div>
        <div className="sc" style={{ display: 'flex', padding: '12px 15px', flexDirection: 'row', alignItems: 'center', gap: '12px' }}><div className="sc-ico d" style={{ width: '42px', height: '42px', minWidth: '42px', fontSize: '24px', marginBottom: 0 }}>⏳</div><div><div className="sc-v" style={{ fontSize: '18px', fontWeight: 700 }}>{summary.totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="sc-l" style={{ fontSize: '15px', marginTop: '1px' }}>ยอดค้างชำระ</div></div></div>
        <div className="sc" style={{ display: 'flex', padding: '12px 15px', flexDirection: 'row', alignItems: 'center', gap: '12px' }}><div className="sc-ico p" style={{ width: '42px', height: '42px', minWidth: '42px', fontSize: '24px', marginBottom: 0 }}>📊</div><div><div className="sc-v" style={{ fontSize: '18px', fontWeight: 700 }}>{summary.totalInvoiced > 0 ? `${((summary.totalCollected / summary.totalInvoiced) * 100).toFixed(1)}%` : '0%'}</div><div className="sc-l" style={{ fontSize: '15px', marginTop: '1px' }}>% ที่ชำระแล้ว</div></div></div>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">ใบแจ้งหนี้ค้างชำระ ({activeFees.length})</div>
          <div className="houses-list-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
            {showLegacyBillingActions && <button className="btn btn-p btn-sm" onClick={handleOpenProcessModal}>+ สร้างใบแจ้งหนี้</button>}
            {showLegacyBillingActions && <button className="btn btn-a btn-sm" onClick={handlePrintInvoicesAll}>🖨 พิมพ์ใบแจ้งหนี้ทั้งหมด</button>}
            {showLegacyBillingActions && <button className="btn btn-o btn-sm" onClick={handlePrintNoticesAll}>🔔 พิมพ์ใบแจ้งเตือนทั้งหมด</button>}
            {showLegacyBillingActions && <button className="btn btn-dg btn-sm" onClick={handleBulkOverdue}>⚖ คำนวณค่าปรับทั้งหมด</button>}
            <button className="btn btn-g btn-sm" onClick={() => loadFeeData({ year: currentFeeYear, status: 'all', period: 'all' })}>🔄 รีเฟรช</button>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {periodCards.map((item) => {
                const active = periodFilter === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setPeriodFilter(item.value)}
                    style={{
                      border: active ? '1px solid #0c4a6e' : '1px solid var(--bo)',
                      background: active ? '#eff6ff' : '#fff',
                      color: active ? '#0c4a6e' : '#334155',
                      borderRadius: 999,
                      padding: '6px 10px',
                      minHeight: 34,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span>{item.label}</span>
                    <span style={{
                      minWidth: 20,
                      height: 20,
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: active ? '#0c4a6e' : '#e2e8f0',
                      color: active ? '#fff' : '#475569',
                      fontSize: 11,
                      padding: '0 6px',
                    }}>
                      {item.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="cb houses-table-card-body houses-main-body">
          <div className="desktop-only">
            <div style={{ overflowX: 'auto' }}>
              <table className="tw houses-table houses-main-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>ซอย</th>
                    <th>บ้าน</th>
                    <th>ปี</th>
                    <th>งวด</th>
                    <th>ครบกำหนด</th>
                    <th>ยอดรวม</th>
                    <th>ยอดค้างชำระ</th>
                    <th>สถานะ</th>
                    <th style={{ textAlign: 'right' }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>กำลังโหลดข้อมูล...</td></tr>
                  ) : activeFees.length === 0 ? (
                    <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>ไม่พบข้อมูลตามเงื่อนไขค้นหา</td></tr>
                  ) : (
                    activeFees.map((fee) => {
                      const badge = getFeeStatusBadge(fee)
                      const outstanding = getOutstandingAmountForFee(fee)
                      return (
                        <tr key={fee.id}>
                          <td>{fee.houses?.soi || '-'}</td>
                          <td>{fee.houses?.house_no || '-'}<div style={{ fontSize: '11px', color: 'var(--mu)' }}>{fee.houses?.owner_name || '-'}</div></td>
                          <td>{toBE(fee.year)}</td>
                          <td>{resolvePeriodLabel(fee.period, fee.year)}</td>
                          <td>{formatDateDMY(fee.due_date)}</td>
                          <td><strong>{Number(fee.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                          <td><strong style={{ color: outstanding > 0 ? '#9a3412' : '#166534' }}>{outstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                          <td><span className={badge.className}>{badge.label}</span></td>
                          <td style={{ width: '1%', whiteSpace: 'nowrap' }}>
                            <div className="td-acts" style={{ justifyContent: 'flex-end', display: 'flex', width: '100%' }}>
                              <button className="btn btn-xs btn-a" onClick={() => handleEditFee(fee)}>แก้ไข</button>
                              {showLegacyBillingActions && <button className="btn btn-xs btn-g" onClick={() => handlePrintInvoiceByHouse(fee)}>พิมพ์</button>}
                              {showLegacyBillingActions && isNoticePrintable(fee) && <button className="btn btn-xs btn-o" onClick={() => handlePrintNoticeByHouse(fee)}>พิมพ์ใบเตือน</button>}
                              {canCalculateAnnualFee(fee) && <button className="btn btn-xs btn-o" onClick={() => handleCalculateAnnual(fee)}>คำนวณทั้งปี</button>}
                              {showLegacyBillingActions && !isFeeFullyPaid(fee) && <button className="btn btn-xs btn-dg" onClick={() => handleCalculateOverdue(fee)}>คำนวณค่าปรับ</button>}
                              <button className="btn btn-xs btn-dg" onClick={() => handleDeleteFee(fee)}>ลบ</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mobile-only">
            {loading ? (
              <div className="mcard-empty">กำลังโหลดข้อมูล...</div>
            ) : activeFees.length === 0 ? (
              <div className="mcard-empty">ยังไม่มีใบแจ้งหนี้</div>
            ) : activeFees.map((fee) => {
              const badge = getFeeStatusBadge(fee)
              const outstanding = getOutstandingAmountForFee(fee)
              return (
                <div key={fee.id} className="mcard">
                  <div className="mcard-top">
                    <div className="mcard-title">{fee.houses?.house_no || '-'}</div>
                    <div className="mcard-sub">ซอย {fee.houses?.soi || '-'} · {toBE(fee.year)} · {resolvePeriodLabel(fee.period, fee.year)}</div>
                    <span className={`${badge.className} mcard-badge`}>{badge.label}</span>
                  </div>
                  <div className="mcard-body">{fee.houses?.owner_name || '-'}</div>
                  <div className="mcard-meta">
                    <span><span className="mcard-label">ครบกำหนด</span> {formatDateDMY(fee.due_date)}</span>
                    <span><span className="mcard-label">ยอดรวม</span> {Number(fee.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span><span className="mcard-label">ยอดค้างชำระ</span> {outstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="mcard-actions">
                    <button className="btn btn-xs btn-a" onClick={() => handleEditFee(fee)}>แก้ไข</button>
                    {showLegacyBillingActions && <button className="btn btn-xs btn-g" onClick={() => handlePrintInvoiceByHouse(fee)}>พิมพ์</button>}
                    {showLegacyBillingActions && isNoticePrintable(fee) && <button className="btn btn-xs btn-o" onClick={() => handlePrintNoticeByHouse(fee)}>ใบเตือน</button>}
                    {canCalculateAnnualFee(fee) && <button className="btn btn-xs btn-o" onClick={() => handleCalculateAnnual(fee)}>ทั้งปี</button>}
                    {showLegacyBillingActions && !isFeeFullyPaid(fee) && <button className="btn btn-xs btn-dg" onClick={() => handleCalculateOverdue(fee)}>ค่าปรับ</button>}
                    <button className="btn btn-xs btn-dg" onClick={() => handleDeleteFee(fee)}>ลบ</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">ใบแจ้งหนี้ปิดรายการ ({archiveFees.length})</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {archiveCards.map((item) => {
              const active = archiveFilter === item.value
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`btn btn-sm ${active ? 'btn-a' : 'btn-g'}`}
                  onClick={() => setArchiveFilter(item.value)}
                >
                  {item.label} ({item.count})
                </button>
              )
            })}
          </div>
        </div>
        <div className="cb houses-table-card-body houses-main-body">
          <div className="desktop-only">
            <div style={{ overflowX: 'auto' }}>
              <table className="tw houses-table houses-main-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>ซอย</th>
                    <th>บ้าน</th>
                    <th>ปี</th>
                    <th>งวด</th>
                    <th>ครบกำหนด</th>
                    <th>ยอดรวม</th>
                    <th>สถานะ</th>
                    <th style={{ textAlign: 'right' }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {archiveFees.length === 0 ? (
                    <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>ยังไม่มีรายการ</td></tr>
                  ) : (
                    archiveFees.map((fee) => {
                      const badge = getFeeStatusBadge(fee)
                      return (
                      <tr key={fee.id}>
                        <td>{fee.houses?.soi || '-'}</td>
                        <td>{fee.houses?.house_no || '-'}<div style={{ fontSize: '11px', color: 'var(--mu)' }}>{fee.houses?.owner_name || '-'}</div></td>
                        <td>{toBE(fee.year)}</td>
                        <td>{resolvePeriodLabel(fee.period, fee.year)}</td>
                        <td>{formatDateDMY(fee.due_date)}</td>
                        <td><strong>{Number(fee.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                        <td><span className={badge.className}>{badge.label}</span></td>
                        <td style={{ width: '1%', whiteSpace: 'nowrap' }}>
                          <div className="td-acts" style={{ justifyContent: 'flex-end', display: 'flex', width: '100%' }}>
                            <button className="btn btn-xs btn-a" onClick={() => handleEditFee(fee)}>แก้ไข</button>
                            {showLegacyBillingActions && <button className="btn btn-xs btn-g" onClick={() => handlePrintInvoiceByHouse(fee)}>พิมพ์</button>}
                          </div>
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mobile-only">
            {archiveFees.length === 0 ? (
              <div className="mcard-empty">ยังไม่มีรายการ</div>
            ) : archiveFees.map((fee) => {
              const badge = getFeeStatusBadge(fee)
              return (
              <div key={fee.id} className="mcard">
                <div className="mcard-top">
                  <div className="mcard-title">{fee.houses?.house_no || '-'}</div>
                  <div className="mcard-sub">ซอย {fee.houses?.soi || '-'} · {toBE(fee.year)} · {resolvePeriodLabel(fee.period, fee.year)}</div>
                  <span className={`${badge.className} mcard-badge`}>{badge.label}</span>
                </div>
                <div className="mcard-body">{fee.houses?.owner_name || '-'}</div>
                <div className="mcard-meta">
                  <span><span className="mcard-label">ครบกำหนด</span> {formatDateDMY(fee.due_date)}</span>
                  <span><span className="mcard-label">ยอดรวม</span> {Number(fee.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="mcard-actions">
                  <button className="btn btn-xs btn-a" onClick={() => handleEditFee(fee)}>แก้ไข</button>
                  {showLegacyBillingActions && <button className="btn btn-xs btn-g" onClick={() => handlePrintInvoiceByHouse(fee)}>พิมพ์</button>}
                </div>
              </div>
            )})}
          </div>
        </div>
      </div>

      {showPrintActionModal && (
        <div className="house-mo">
          <div className="house-md house-md--xs">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">🖨 ตัวเลือกการพิมพ์</div>
                <div className="house-md-sub">{printPayload?.title || '-'}</div>
              </div>
            </div>
            <div className="house-md-body" style={{ display: 'grid', gap: 10 }}>
              <button
                className="btn btn-p"
                type="button"
                onClick={() => runPrintAction('paper')}
                disabled={runningPrintAction}
                style={{ justifyContent: 'space-between', padding: '12px 14px', fontFamily: 'inherit', letterSpacing: 0, fontStretch: 'normal' }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>พิมพ์เอกสาร</span>
                  <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.88 }}>เปิดหน้าพิมพ์สำหรับใบแจ้งหนี้ทั้งหมด</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{runningPrintAction ? 'กำลังดำเนินการ...' : 'Paper'}</span>
              </button>
              <button
                className="btn btn-a"
                type="button"
                onClick={() => runPrintAction('pdf')}
                disabled={runningPrintAction}
                style={{ justifyContent: 'space-between', padding: '12px 14px', fontFamily: 'inherit', letterSpacing: 0, fontStretch: 'normal' }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Save เป็น PDF</span>
                  <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.88 }}>ดาวน์โหลดไฟล์ PDF ลงเครื่องทันที</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{runningPrintAction ? 'กำลังดำเนินการ...' : 'PDF'}</span>
              </button>
              <button
                className="btn btn-g"
                type="button"
                onClick={() => runPrintAction('image')}
                disabled={runningPrintAction}
                style={{ justifyContent: 'space-between', padding: '12px 14px', fontFamily: 'inherit', letterSpacing: 0, fontStretch: 'normal' }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Save เป็น Image</span>
                  <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.88 }}>บันทึกเฉพาะหน้าเอกสารต้นฉบับ</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{runningPrintAction ? 'กำลังดำเนินการ...' : 'PNG'}</span>
              </button>
              <div style={{ fontSize: 12, color: 'var(--mu)' }}>
                หมายเหตุ: Save as Image จะบันทึกเฉพาะหน้าเอกสารต้นฉบับที่สร้างจริง ไม่มีการสร้างหน้าสำเนา
              </div>
            </div>
            <div className="house-md-foot">
              <button
                className="btn btn-g"
                type="button"
                onClick={() => {
                  if (runningPrintAction) return
                  setShowPrintActionModal(false)
                }}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingFee && (
        <div className="house-mo">
          <div className="house-md house-md--lg">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">🧾 แก้ไขใบแจ้งหนี้</div>
                <div className="house-md-sub">
                  {editingFee.houses?.house_no || '-'} · {editingFee.houses?.owner_name || '-'} · {resolvePeriodLabel(editingFee.period, editingFee.year)} · ปี {toBE(editingFee.year)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="bd b-ok">อนุมัติแล้ว {getApprovedAmountForFee(editingFee).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="bd b-pr">ใบแจ้งหนี้ {Number(editingFee.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitEdit}>
              <div className="house-md-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.9fr) minmax(0, 1.6fr)', gap: 16 }}>
                <section className="house-sec" style={{ paddingTop: 0, marginBottom: 0 }}>
                  <div className="house-sec-title">ข้อมูลเอกสาร</div>
                  <div className="house-grid" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
                    <label className="house-field">
                      <span>สถานะ</span>
                      <StyledSelect value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}>
                        <option value="unpaid">ยังไม่ชำระ</option>
                        <option value="pending">รอตรวจสอบ</option>
                        <option value="paid" disabled={editApprovedAmount < Number(editTotal || 0)}>ชำระแล้ว</option>
                        <option value="overdue">ค้างชำระ</option>
                      </StyledSelect>
                      <small style={{ color: 'var(--mu)' }}>
                        อนุมัติ {editApprovedAmount.toLocaleString('th-TH')} / ยอดรวมใหม่ {Number(editTotal || 0).toLocaleString('th-TH')} บาท
                      </small>
                    </label>
                    <label className="house-field">
                      <span>วันที่ออกใบแจ้งหนี้</span>
                      <input type="date" value={editForm.invoice_date} onChange={(e) => setEditForm((prev) => ({ ...prev, invoice_date: e.target.value }))} />
                    </label>
                    <label className="house-field">
                      <span>วันครบกำหนด</span>
                      <input type="date" value={editForm.due_date} onChange={(e) => setEditForm((prev) => ({ ...prev, due_date: e.target.value }))} />
                    </label>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 12px' }}>
                        <span style={{ color: '#1d4ed8' }}>ยอดใบแจ้งหนี้เดิม</span>
                        <strong>{Number(editingFee.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 12px' }}>
                        <span style={{ color: '#166534' }}>ยอดอนุมัติแล้ว</span>
                        <strong>{getApprovedAmountForFee(editingFee).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#0c4a6e', color: '#fff', borderRadius: 10, padding: '12px' }}>
                        <span style={{ opacity: .85 }}>ยอดรวมใหม่</span>
                        <strong style={{ fontSize: 20 }}>{editTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10, padding: '10px 12px' }}>
                        <span style={{ color: '#9a3412' }}>ยอดค้างใหม่ (ยอดรวมใหม่ - อนุมัติแล้ว)</span>
                        <strong style={{ color: '#9a3412' }}>{editOutstandingAfterChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                    <label className="house-field">
                      <span>หมายเหตุ</span>
                      <textarea
                        rows="5"
                        style={{ resize: 'vertical' }}
                        value={editForm.note}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
                      />
                    </label>
                  </div>
                </section>

                <section className="house-sec" style={{ marginBottom: 0 }}>
                  <div className="house-sec-title">รายการค่าใช้จ่าย</div>
                  <div style={{ border: '1px solid var(--bo)', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Base fees */}
                    <div style={{ background: '#f0f9ff', padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#0369a1', letterSpacing: '.03em', borderBottom: '1px solid var(--bo)' }}>
                      ค่าธรรมเนียมหลัก
                    </div>
                    {[
                      { label: 'ค่าส่วนกลาง', key: 'fee_common' },
                      { label: 'ค่าจอดรถ', key: 'fee_parking' },
                      { label: 'ค่าขยะ', key: 'fee_waste' },
                    ].map((item, i, arr) => (
                      <div key={item.key} style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', borderBottom: i < arr.length - 1 ? '1px solid var(--bo)' : undefined, gap: 8 }}>
                        <div style={{ flex: 1, display: 'grid', gap: 3 }}>
                          <span style={{ fontSize: 13 }}>{item.label}</span>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            ตั้งใหม่ {getEditItemDueAmount(item.key).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {' '}| อนุมัติแล้ว {getEditItemApprovedAmount(item.key).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {' '}| คงค้าง {getEditItemOutstandingAmount(item.key).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <input type="number" step="0.01" value={editForm[item.key]} onChange={(e) => setEditForm((prev) => ({ ...prev, [item.key]: e.target.value }))} style={feeItemInputBaseStyle} />
                      </div>
                    ))}

                    {/* Overdue / penalty fees */}
                    <div style={{ background: '#fff7ed', padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#92400e', letterSpacing: '.03em', borderTop: '1px solid var(--bo)', borderBottom: '1px solid var(--bo)' }}>
                      ยอดค้างชำระและค่าปรับ
                    </div>
                    {[
                      { label: 'ยอดค้างยกมา', key: 'fee_overdue_common' },
                      { label: 'ค่าปรับยอดค้าง', key: 'fee_overdue_fine' },
                      { label: 'ค่าทวงถามยอดค้าง', key: 'fee_overdue_notice' },
                      { label: 'ค่าปรับ', key: 'fee_fine' },
                      { label: 'ค่าทวงถาม', key: 'fee_notice' },
                      { label: 'ค่ากระทำผิด', key: 'fee_violation' },
                    ].map((item, i, arr) => {
                      const hasValue = Number(editForm[item.key] || 0) > 0
                      return (
                        <div key={item.key} style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', borderBottom: i < arr.length - 1 ? '1px solid var(--bo)' : undefined, gap: 8, background: hasValue ? '#fffbeb' : '#fff' }}>
                          <div style={{ flex: 1, display: 'grid', gap: 3 }}>
                            <span style={{ fontSize: 13, color: hasValue ? '#92400e' : 'inherit' }}>{item.label}</span>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              ตั้งใหม่ {getEditItemDueAmount(item.key).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {' '}| อนุมัติแล้ว {getEditItemApprovedAmount(item.key).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {' '}| คงค้าง {getEditItemOutstandingAmount(item.key).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <input type="number" step="0.01" value={editForm[item.key]} onChange={(e) => setEditForm((prev) => ({ ...prev, [item.key]: e.target.value }))} style={{ ...feeItemInputBaseStyle, borderColor: hasValue ? '#f59e0b' : undefined }} />
                        </div>
                      )
                    })}

                    {/* Other + discount */}
                    <div style={{ background: '#f0fdf4', padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#14532d', letterSpacing: '.03em', borderTop: '1px solid var(--bo)', borderBottom: '1px solid var(--bo)' }}>
                      ค่าอื่นๆ / ส่วนลด
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid var(--bo)', gap: 8 }}>
                      <div style={{ flex: 1, display: 'grid', gap: 3 }}>
                        <span style={{ fontSize: 13 }}>ค่าอื่นๆ</span>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          ตั้งใหม่ {getEditItemDueAmount('fee_other').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {' '}| อนุมัติแล้ว {getEditItemApprovedAmount('fee_other').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {' '}| คงค้าง {getEditItemOutstandingAmount('fee_other').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <input type="number" step="0.01" value={editForm.fee_other} onChange={(e) => setEditForm((prev) => ({ ...prev, fee_other: e.target.value }))} style={feeItemInputBaseStyle} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', gap: 8, background: Number(editForm.fee_discount || 0) > 0 ? '#fef2f2' : '#fff' }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#dc2626' }}>ส่วนลด (−)</span>
                      <input type="number" step="0.01" min="0" value={editForm.fee_discount} onChange={(e) => setEditForm((prev) => ({ ...prev, fee_discount: e.target.value }))} style={{ ...feeItemInputBaseStyle, color: '#dc2626', borderColor: Number(editForm.fee_discount || 0) > 0 ? '#dc2626' : undefined }} />
                    </div>
                  </div>
                </section>
                </div>
              </div>
              <div className="house-md-foot">
                <button className="btn btn-g" type="button" onClick={() => { if (!savingEdit) { setShowEditModal(false); setEditingFee(null) } }}>ยกเลิก</button>
                <button className="btn btn-p" type="submit" disabled={savingEdit}>{savingEdit ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaymentModal && payingFee && (
        <div className="house-mo">
          <div className="house-md house-md--xl">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">💳 บันทึกรับชำระ</div>
                <div className="house-md-sub">{payingFee.houses?.house_no || '-'} · {resolvePeriodLabel(payingFee.period, payingFee.year)} · ปี {toBE(payingFee.year)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="bd b-pr">ยอดคงค้างจริง {paymentInvoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="bd b-ok">เลือกแล้ว {paymentSelectedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="bd b-wn">คงเหลือ {paymentRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitPayment}>
              <div className="house-md-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 16 }}>
                  <section className="house-sec" style={{ marginBottom: 0 }}>
                    <div className="house-sec-title">เลือกรายการที่ชำระ</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <button type="button" className="btn btn-xs btn-a" onClick={selectAllPaymentItems}>เลือกทั้งหมด</button>
                      <button type="button" className="btn btn-xs btn-o" onClick={selectBasePaymentItems}>เลือกพื้นฐาน</button>
                      <button type="button" className="btn btn-xs btn-p" onClick={setSelectedItemsToFullAmount}>กรอกยอดเต็ม (ที่เลือก)</button>
                      <button type="button" className="btn btn-xs btn-g" onClick={clearSelectedItemAmounts}>ล้างยอด (ที่เลือก)</button>
                      <button type="button" className="btn btn-xs btn-g" onClick={clearPaymentItems}>ล้างการเลือก</button>
                    </div>

                    <div
                      style={{
                        height: 10,
                        borderRadius: 99,
                        background: '#e5e7eb',
                        overflow: 'hidden',
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          width: `${paymentCoveragePct}%`,
                          height: '100%',
                          background: paymentRemaining === 0 ? '#16a34a' : '#0ea5e9',
                          transition: 'width .2s ease',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 10 }}>
                      ครอบคลุมยอดชำระ {paymentCoveragePct}% {paymentRemaining > 0 ? `· คงเหลือ ${paymentRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '· ครบยอดแล้ว'}
                    </div>

                    <div style={{ border: '1px solid var(--bo)', borderRadius: 10, overflow: 'hidden' }}>
                      <table className="tw houses-table houses-main-table" style={{ width: '100%', minWidth: 420 }}>
                        <thead>
                          <tr>
                            <th>รายการ</th>
                            <th style={{ width: 80, textAlign: 'center' }}>เลือก</th>
                            <th style={{ width: 220, textAlign: 'right' }}>จำนวนเงินที่ชำระ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payableFeeItems.length === 0 ? (
                            <tr>
                              <td colSpan="3" style={{ textAlign: 'center', color: 'var(--mu)', padding: '14px 10px' }}>
                                ไม่พบรายการที่มียอดมากกว่า 0
                              </td>
                            </tr>
                          ) : (
                            payableFeeItems.map((item) => {
                              const checked = paymentForm.selectedItems.includes(item.key)
                              const value = Number(paymentForm.itemAmounts?.[item.key] ?? item.amount)
                              const isPartialRow = checked && value > 0 && value < item.amount
                              const isInvalidRow = checked && value <= 0
                              return (
                                <tr key={item.key} style={{ background: checked ? '#f0fdf4' : '#fff' }}>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{item.label}</div>
                                    <div style={{ fontSize: 12, color: 'var(--mu)' }}>ยอดเต็ม {item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    {isPartialRow && <div style={{ fontSize: 12, color: '#0f766e' }}>ชำระบางส่วนของรายการนี้</div>}
                                    {isInvalidRow && <div style={{ fontSize: 12, color: '#b91c1c' }}>โปรดระบุยอดมากกว่า 0</div>}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => togglePaymentItem(item.key, e.target.checked)}
                                      style={{ width: 16, height: 16 }}
                                    />
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <input
                                      type="number"
                                      min="0"
                                      max={item.amount}
                                      step="0.01"
                                      value={value}
                                      onChange={(e) => handleChangeItemAmount(item.key, e.target.value, item.amount)}
                                      disabled={!checked}
                                      style={{ width: 160, textAlign: 'right', borderColor: isInvalidRow ? '#dc2626' : undefined }}
                                    />
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th colSpan="2" style={{ textAlign: 'right' }}>รวมยอดที่ชำระ</th>
                            <th style={{ textAlign: 'right', color: '#166534' }}>{paymentSelectedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</th>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--mu)' }}>
                      คำแนะนำ: ติ๊กเฉพาะรายการที่ต้องรับชำระ, กรอกยอดมากกว่า 0 และไม่เกินยอดเต็มของแต่ละรายการ เพื่อลดความผิดพลาด
                    </div>
                  </section>

                  <section className="house-sec" style={{ marginBottom: 0 }}>
                    <div className="house-sec-title">รายละเอียดการรับชำระ</div>
                    <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid var(--bo)', borderRadius: 8, padding: '10px 12px' }}>
                        <span style={{ color: 'var(--mu)' }}>ยอดคงค้างจริง</span>
                        <strong>{paymentInvoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#ecfeff', border: '1px solid #99f6e4', borderRadius: 8, padding: '10px 12px' }}>
                        <span style={{ color: '#0f766e' }}>ยอดที่เลือกชำระ</span>
                        <strong style={{ color: '#166534' }}>{paymentSelectedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '10px 12px' }}>
                        <span style={{ color: '#9a3412' }}>ยอดคงเหลือ</span>
                        <strong style={{ color: '#9a3412' }}>{paymentRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                    </div>

                    <div className="house-grid" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
                      <label className="house-field">
                        <span>วิธีชำระ</span>
                        <StyledSelect value={paymentForm.payment_method} onChange={(e) => setPaymentForm((prev) => ({ ...prev, payment_method: e.target.value }))}>
                          <option value="transfer">โอนเงิน</option>
                          <option value="cash">เงินสด</option>
                          <option value="qr">QR</option>
                        </StyledSelect>
                      </label>
                      <label className="house-field">
                        <span>วันเวลา</span>
                        <input type="datetime-local" value={paymentForm.paid_at} onChange={(e) => setPaymentForm((prev) => ({ ...prev, paid_at: e.target.value }))} />
                      </label>
                      <label className="house-field">
                        <span>หมายเหตุ</span>
                        <textarea rows="3" value={paymentForm.note} onChange={(e) => setPaymentForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="รายละเอียดเพิ่มเติม" />
                      </label>
                    </div>
                  </section>
                </div>
              </div>
              <div className="house-md-foot">
                <button className="btn btn-g" type="button" onClick={() => { if (!savingPayment) { setShowPaymentModal(false); setPayingFee(null) } }}>
                  ยกเลิก
                </button>
                <button className="btn btn-p" type="submit" disabled={savingPayment || paymentSelectedAmount <= 0}>
                  {savingPayment ? 'กำลังบันทึก...' : 'บันทึกรับชำระ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProcessModal && (
        <div className="house-mo">
          <div className="house-md house-md--xs">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">🧾 สร้างใบแจ้งหนี้ทุกหลัง</div>
                <div className="house-md-sub">คำนวณอัตโนมัติจาก setup ระบบ (แก้ไขค่าในขั้นตอนนี้ไม่ได้)</div>
              </div>
            </div>

            <form onSubmit={handleProcessAll}>
              <div className="house-md-body">
                <section className="house-sec">
                  <div className="house-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <label className="house-field">
                      <span>ปี (พ.ศ.) *</span>
                      <StyledSelect
                        value={processForm.yearBE}
                        onChange={(e) => setProcessForm((prev) => ({ ...prev, yearBE: e.target.value }))}
                      >
                        {processYearOptions.map((yearBE) => (
                          <option key={yearBE} value={String(yearBE)}>{yearBE}</option>
                        ))}
                      </StyledSelect>
                    </label>
                    <label className="house-field">
                      <span>รอบ *</span>
                      <StyledSelect
                        value={processForm.period}
                        onChange={(e) => setProcessForm((prev) => ({ ...prev, period: e.target.value }))}
                      >
                        <option value="first_half">ครึ่งปีแรก (1/1 - 30/6)</option>
                        <option value="second_half">ครึ่งปีหลัง (1/7 - 31/12)</option>
                      </StyledSelect>
                    </label>
                    <label className="house-field" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={processForm.overwritePending}
                        onChange={(e) => setProcessForm((prev) => ({ ...prev, overwritePending: e.target.checked }))}
                        style={{ width: 16, height: 16 }}
                      />
                      <span>ทับใบที่อยู่สถานะรอตรวจสอบ (pending)</span>
                    </label>
                  </div>
                </section>

                <section className="house-sec">
                  <div style={{ fontSize: 13, color: 'var(--mu)', lineHeight: 1.8 }}>
                    <div>ค่าส่วนกลาง = พื้นที่บ้าน x 6 เดือน x อัตรา setup ({Number(setup.fee_rate_per_sqw || 0).toLocaleString('th-TH')})</div>
                    <div>ค่าจอดรถ = ผลรวมค่าจอดรถต่อเดือนของบ้าน x 6</div>
                    <div>ค่าขยะ = ค่า setup ต่อรอบ ({Number(setup.waste_fee_per_period || 0).toLocaleString('th-TH')})</div>
                    <div>Process นี้จะทำทุกหลังในระบบ</div>
                  </div>
                </section>
              </div>
              <div className="house-md-foot">
                <button className="btn btn-g" type="button" onClick={() => setShowProcessModal(false)} disabled={processing}>ยกเลิก</button>
                <button className="btn btn-p" type="submit" disabled={processing}>{processing ? 'กำลังประมวลผล...' : 'Process สร้างทั้งหมด'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminFees