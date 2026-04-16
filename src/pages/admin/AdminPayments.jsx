import React, { useEffect, useMemo, useRef, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import Swal from 'sweetalert2'
import { useAuth } from '../../contexts/AuthContext'
import {
  approvePayment,
  createPayment,
  listFees,
  listPayments,
  rejectPayment,
  uploadPaymentSlip,
  getFeeById,
  updatePayment,
} from '../../lib/fees'
import { getSetupConfig } from '../../lib/setup'
import { buildReceiptHtmlAdminStyle } from '../../lib/printTemplates'
import villageLogo from '../../assets/village-logo.svg'

const REJECT_PREFIX = '[REJECT] '
const PAYMENT_META_PREFIX = '[PAYMENT_ITEMS_JSON]'

function getRejectedReason(note) {
  const raw = String(note || '')
  if (!raw.startsWith(REJECT_PREFIX)) return ''
  const firstLine = raw.split('\n')[0]
  return firstLine.replace(REJECT_PREFIX, '').trim()
}

function getDisplayNote(note) {
  const raw = String(note || '')
  const noMeta = raw.includes(PAYMENT_META_PREFIX)
    ? raw.slice(0, raw.indexOf(PAYMENT_META_PREFIX)).trim()
    : raw
  if (!noMeta.startsWith(REJECT_PREFIX)) return noMeta
  const lines = noMeta.split('\n')
  lines.shift()
  return lines.join('\n').trim()
}

function parsePaymentMeta(note) {
  const raw = String(note || '')
  const markerIndex = raw.indexOf(PAYMENT_META_PREFIX)
  if (markerIndex < 0) return null
  const jsonText = raw.slice(markerIndex + PAYMENT_META_PREFIX.length).trim()
  if (!jsonText) return null
  try {
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed?.items)) return null
    return parsed
  } catch {
    return null
  }
}

function parseItemizedRowsFromNote(note) {
  const raw = String(note || '')
  if (!raw) return []
  const noMeta = raw.includes(PAYMENT_META_PREFIX)
    ? raw.slice(0, raw.indexOf(PAYMENT_META_PREFIX)).trim()
    : raw
  const match = noMeta.match(/ชำระรายการ:\s*([^|\n]+)/)
  if (!match?.[1]) return []

  const section = String(match[1] || '').trim()
  if (!section) return []

  const rows = []
  const consumedRanges = []

  const overlaps = (start, end) => consumedRanges.some((r) => !(end <= r.start || start >= r.end))
  const pushRange = (start, end) => consumedRanges.push({ start, end })

  // Parse by known fee labels first to handle legacy notes with comma thousand separators.
  for (const def of feeItemDefs) {
    const escapedLabel = def.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`${escapedLabel}\\s*฿?\\s*([\\d,]+(?:\\.\\d{1,2})?)`, 'g')
    let m = regex.exec(section)
    while (m) {
      const full = String(m[0] || '')
      const amountRaw = String(m[1] || '0')
      const start = m.index
      const end = m.index + full.length
      if (!overlaps(start, end)) {
        const amount = Number(amountRaw.replace(/,/g, ''))
        rows.push({
          key: def.key,
          label: def.label,
          paidAmount: Number.isFinite(amount) ? amount : 0,
        })
        pushRange(start, end)
      }
      m = regex.exec(section)
    }
  }

  // Generic fallback for unknown labels.
  const genericRegex = /([^|]+?)\s*฿?\s*([\d,]+(?:\.\d{1,2})?)(?=\s*,\s*|$)/g
  let g = genericRegex.exec(section)
  while (g) {
    const full = String(g[0] || '')
    const label = String(g[1] || '').trim()
    const amountRaw = String(g[2] || '0')
    const start = g.index
    const end = g.index + full.length
    if (label && !overlaps(start, end)) {
      const amount = Number(amountRaw.replace(/,/g, ''))
      rows.push({
        label,
        paidAmount: Number.isFinite(amount) ? amount : 0,
      })
      pushRange(start, end)
    }
    g = genericRegex.exec(section)
  }

  return rows
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toBE(year) {
  const y = Number(year || 0)
  if (!y) return '-'
  return y > 2400 ? y : y + 543
}

function normalizeSoi(soi) {
  return String(soi || '').trim().toLowerCase()
}

function normalizeHouseNo(houseNo) {
  return String(houseNo || '').trim()
}

function compareHouseNo(a, b) {
  return normalizeHouseNo(a).localeCompare(normalizeHouseNo(b), 'th', { numeric: true, sensitivity: 'base' })
}

function openHtmlInWindow(html) {
  const popup = window.open('', '_blank', 'width=1200,height=900')
  if (!popup) return null
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  return popup
}

function formatMethod(method) {
  if (method === 'transfer') return 'โอนเงิน'
  if (method === 'cash') return 'เงินสด'
  if (method === 'qr') return 'QR'
  return method || '-'
}

function formatPeriod(period) {
  if (period === 'first_half') return 'ครึ่งปีแรก'
  if (period === 'second_half') return 'ครึ่งปีหลัง'
  if (period === 'full_year') return 'เต็มปี'
  return period || '-'
}

function buildReceiptNo(payment, receiptNoById = {}) {
  const fallbackDate = new Date(payment?.verified_at || payment?.paid_at || Date.now())
  const yy = String(fallbackDate.getFullYear()).slice(-2)
  const mm = String(fallbackDate.getMonth() + 1).padStart(2, '0')
  const dd = String(fallbackDate.getDate()).padStart(2, '0')
  const fallback = `RC-${yy}${mm}${dd}-001`
  if (!payment?.id) return fallback
  return receiptNoById[payment.id] || fallback
}

function toThaiBahtText(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount < 0) return '-'

  const digitsText = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const unitsText = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

  const convertChunk = (num) => {
    if (num === 0) return ''
    const digits = String(num).split('').map((d) => Number(d))
    const len = digits.length
    let text = ''

    digits.forEach((digit, i) => {
      const pos = len - i - 1
      if (digit === 0) return
      if (pos === 0 && digit === 1 && len > 1) {
        text += 'เอ็ด'
        return
      }
      if (pos === 1 && digit === 1) {
        text += 'สิบ'
        return
      }
      if (pos === 1 && digit === 2) {
        text += 'ยี่สิบ'
        return
      }
      text += `${digitsText[digit]}${unitsText[pos]}`
    })
    return text
  }

  const [intRaw, satangRaw = '00'] = amount.toFixed(2).split('.')
  let integer = Number(intRaw)
  const satang = Number(satangRaw)

  const chunks = []
  while (integer > 0) {
    chunks.unshift(integer % 1000000)
    integer = Math.floor(integer / 1000000)
  }

  const bahtText = (chunks
    .map((chunk, idx) => {
      const chunkText = convertChunk(chunk)
      if (!chunkText) return ''
      const isLast = idx === chunks.length - 1
      return isLast ? chunkText : `${chunkText}ล้าน`
    })
    .join('')) || 'ศูนย์'

  if (satang === 0) return `${bahtText}บาทถ้วน`
  return `${bahtText}บาท${convertChunk(satang)}สตางค์`
}

const feeItemDefs = [
  { key: 'fee_common', label: 'ค่าส่วนกลาง' },
  { key: 'fee_parking', label: 'ค่าจอดรถ' },
  { key: 'fee_waste', label: 'ค่าขยะ' },
  { key: 'fee_overdue_common', label: 'ยอดค่าส่วนกลางค้างเดิม' },
  { key: 'fee_overdue_fine', label: 'ยอดปรับค้างเดิม' },
  { key: 'fee_overdue_notice', label: 'ยอดทวงถามค้างเดิม' },
  { key: 'fee_fine', label: 'ค่าปรับงวดนี้' },
  { key: 'fee_notice', label: 'ค่าทวงถามงวดนี้' },
  { key: 'fee_violation', label: 'ค่าผิดระเบียบ' },
  { key: 'fee_other', label: 'ค่าอื่นๆ' },
]

function getFeeDueItems(fee) {
  return feeItemDefs
    .map((item) => ({ key: item.key, label: item.label, dueAmount: Number(fee?.[item.key] || 0) }))
    .filter((item) => item.dueAmount > 0)
}

function getOutstandingItemsForFee(fee, payments = []) {
  if (!fee?.id) return []

  const paidByKey = {}
  for (const payment of payments) {
    if (payment?.fee_id !== fee.id) continue
    if (getRejectedReason(payment?.note)) continue

    const rows = getPaymentItemRows(payment)
    for (const row of rows) {
      const keyFromLabel = feeItemDefs.find((def) => def.label === row?.label)?.key
      const key = row?.key || keyFromLabel
      if (!feeItemDefs.some((def) => def.key === key)) continue
      paidByKey[key] = Number(paidByKey[key] || 0) + Number(row?.paidAmount || 0)
    }
  }

  return feeItemDefs
    .map((item) => {
      const dueAmount = Number(fee?.[item.key] || 0)
      const paidToDate = Number(paidByKey[item.key] || 0)
      const amount = Math.max(0, dueAmount - paidToDate)
      return {
        ...item,
        amount,
        dueAmount,
        paidToDate,
      }
    })
    .filter((item) => item.amount > 0)
}

function getPaymentItemRows(payment) {
  if (Array.isArray(payment?.payment_items) && payment.payment_items.length > 0) {
    return payment.payment_items.map((item, index) => ({
      key: item.item_key || `item_${index + 1}`,
      label: item.item_label || '-',
      dueAmount: Number(item.due_amount || 0),
      paidAmount: Number(item.paid_amount || 0),
      outstandingAmount: Number(item.outstanding_amount || 0),
    }))
  }

  const parsedMeta = parsePaymentMeta(payment?.note)
  if (parsedMeta?.items?.length) {
    return parsedMeta.items.map((item) => ({
      key: item.key,
      label: item.label || '-',
      dueAmount: Number(item.dueAmount || 0),
      paidAmount: Number(item.paidAmount || 0),
    }))
  }

  const itemizedFromNote = parseItemizedRowsFromNote(payment?.note)
  if (itemizedFromNote.length > 0) {
    return itemizedFromNote.map((row, index) => {
      const matchedDef = feeItemDefs.find((item) => item.label === row.label)
      const dueAmount = matchedDef ? Number(payment?.fees?.[matchedDef.key] || 0) : Number(row.paidAmount || 0)
      return {
        key: matchedDef?.key || `legacy_${index + 1}`,
        label: row.label || '-',
        dueAmount,
        paidAmount: Number(row.paidAmount || 0),
      }
    })
  }

  const paidAmount = Number(payment?.amount || 0)
  return [{ key: 'paid_total', label: 'ยอดชำระที่บันทึก', dueAmount: Number(payment?.fees?.total_amount || paidAmount), paidAmount }]
}

export default function AdminPayments() {
  const { profile } = useAuth()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [savingReceive, setSavingReceive] = useState(false)
  const [uploadingSlip, setUploadingSlip] = useState(false)
  const [receiveSlipFile, setReceiveSlipFile] = useState(null)
  const [receiveSlipPreview, setReceiveSlipPreview] = useState('')
  const [approveTarget, setApproveTarget] = useState(null)
  const [approving, setApproving] = useState(false)
  const [approveFeeSnapshot, setApproveFeeSnapshot] = useState(null)
  const [approveItemDraft, setApproveItemDraft] = useState({})
  const [loadingApproveItems, setLoadingApproveItems] = useState(false)

  function buildPaymentMetaNote(baseNote, rows = []) {
    const selectedItemsMeta = rows
      .filter((row) => Number(row?.paidAmount || 0) > 0)
      .map((row) => ({
        key: row.key,
        label: row.label,
        dueAmount: Number(row.dueAmount || 0),
        paidAmount: Number(row.paidAmount || 0),
      }))

    const noteParts = []
    if (String(baseNote || '').trim()) noteParts.push(String(baseNote || '').trim())
    if (selectedItemsMeta.length > 0) {
      noteParts.push(`${PAYMENT_META_PREFIX}${JSON.stringify({ items: selectedItemsMeta })}`)
    }
    return noteParts.join(' | ')
  }

  function getOutstandingItemsForApproval(fee, payments = [], { excludePaymentId = null } = {}) {
    if (!fee?.id) return []

    const paidByKey = {}
    for (const payment of payments) {
      if (payment?.fee_id !== fee.id) continue
      if (excludePaymentId && String(payment.id) === String(excludePaymentId)) continue
      if (!payment?.verified_at) continue
      if (getRejectedReason(payment?.note)) continue

      const rows = getPaymentItemRows(payment)
      for (const row of rows) {
        const keyFromLabel = feeItemDefs.find((def) => def.label === row?.label)?.key
        const key = row?.key || keyFromLabel
        if (!feeItemDefs.some((def) => def.key === key)) continue
        paidByKey[key] = Number(paidByKey[key] || 0) + Number(row?.paidAmount || 0)
      }
    }

    return feeItemDefs
      .map((item) => {
        const dueAmount = Number(fee?.[item.key] || 0)
        const paidToDate = Number(paidByKey[item.key] || 0)
        const outstanding = Math.max(0, dueAmount - paidToDate)
        return {
          ...item,
          dueAmount,
          paidToDate,
          outstanding,
        }
      })
      .filter((item) => item.outstanding > 0)
  }

  function buildAllocationDraft(items = [], totalAmount = 0) {
    let remain = Number(totalAmount || 0)
    const draft = {}
    for (const item of items) {
      const max = Number(item?.outstanding || 0)
      const allocated = Math.max(0, Math.min(max, remain))
      draft[item.key] = allocated
      remain = Math.max(0, remain - allocated)
    }
    return draft
  }
  const [showReceiptPrintPreviewModal, setShowReceiptPrintPreviewModal] = useState(false)
  const [receiptPrintPreviewHtml, setReceiptPrintPreviewHtml] = useState('')
  const [receiptPrintPreviewTitle, setReceiptPrintPreviewTitle] = useState('ตัวอย่างใบเสร็จ')
  const [receiptPrintPreviewFileBase, setReceiptPrintPreviewFileBase] = useState('receipt')
  const [receiptPrintPreviewExporting, setReceiptPrintPreviewExporting] = useState(false)
  const receiptPrintPreviewIframeRef = useRef(null)
  const [feeOptions, setFeeOptions] = useState([])
  const [receiveForm, setReceiveForm] = useState({
    fee_id: '',
    amount: '',
    payment_method: 'transfer',
    paid_at: new Date().toISOString().slice(0, 16),
    selectedItems: [],
    itemAmounts: {},
    note: '',
  })
  const [setup, setSetup] = useState({
    villageName: 'The Greenfield',
    address: '',
    loginCircleLogoUrl: '',
    juristicSignatureUrl: '',
    bankName: '',
    bankAccountName: '',
    bankAccountNo: '',
  })

  const selectedReceiveFee = useMemo(
    () => feeOptions.find((fee) => fee.id === receiveForm.fee_id) || null,
    [feeOptions, receiveForm.fee_id],
  )

  const receivePayableItems = useMemo(() => {
    if (!selectedReceiveFee) return []
    return getOutstandingItemsForFee(selectedReceiveFee, payments)
  }, [selectedReceiveFee, payments])

  const receiveSelectedAmount = useMemo(() => (
    receiveForm.selectedItems.reduce((sum, key) => sum + Number(receiveForm.itemAmounts?.[key] || 0), 0)
  ), [receiveForm.selectedItems, receiveForm.itemAmounts])

  const filteredByYear = useMemo(() => {
    return payments.filter((payment) => {
      const feeYear = Number(payment.fees?.year || 0)
      const passYear = yearFilter === 'all' || String(feeYear) === String(yearFilter)
      return passYear
    })
  }, [payments, yearFilter])

  const filteredByYearPeriod = useMemo(() => {
    return filteredByYear.filter((payment) => {
      const feePeriod = String(payment.fees?.period || '')
      return periodFilter === 'all' || feePeriod === periodFilter
    })
  }, [filteredByYear, periodFilter])

  const summary = useMemo(() => {
    const totalAmount = filteredByYearPeriod.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const approved = filteredByYearPeriod.filter((payment) => payment.verified_at)
    const rejected = filteredByYearPeriod.filter((payment) => !payment.verified_at && getRejectedReason(payment.note))
    const pending = filteredByYearPeriod.filter((payment) => !payment.verified_at && !getRejectedReason(payment.note))
    return {
      totalAmount,
      approvedAmount: approved.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      pendingAmount: pending.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      approvedCount: approved.length,
      pendingCount: pending.length,
      rejectedCount: rejected.length,
    }
  }, [filteredByYearPeriod])

  const yearCards = useMemo(() => {
    const counts = new Map()
    for (const payment of payments) {
      const y = Number(payment.fees?.year || 0)
      if (!y) continue
      counts.set(y, Number(counts.get(y) || 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, count]) => ({ value: String(year), label: String(toBE(year)), count }))
  }, [payments])

  const periodCards = useMemo(() => {
    const rows = filteredByYear
    return [
      { value: 'all', label: 'ทั้งหมด', count: rows.length },
      { value: 'first_half', label: 'ครึ่งปีแรก', count: rows.filter((p) => p.fees?.period === 'first_half').length },
      { value: 'second_half', label: 'ครึ่งปีหลัง', count: rows.filter((p) => p.fees?.period === 'second_half').length },
      { value: 'full_year', label: 'เต็มปี', count: rows.filter((p) => p.fees?.period === 'full_year').length },
    ]
  }, [filteredByYear])

  const receiptNoById = useMemo(() => {
    const approved = payments
      .filter((payment) => payment?.verified_at)
      .slice()
      .sort((a, b) => {
        const timeA = new Date(a.verified_at || a.paid_at || 0).getTime()
        const timeB = new Date(b.verified_at || b.paid_at || 0).getTime()
        if (timeA !== timeB) return timeA - timeB
        return String(a.id || '').localeCompare(String(b.id || ''))
      })

    const dailyCount = {}
    const byId = {}
    for (const payment of approved) {
      const date = new Date(payment.verified_at || payment.paid_at || Date.now())
      const yy = String(date.getFullYear()).slice(-2)
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      const key = `${yy}${mm}${dd}`
      const seq = Number(dailyCount[key] || 0) + 1
      dailyCount[key] = seq
      byId[payment.id] = `RC-${key}-${String(seq).padStart(3, '0')}`
    }
    return byId
  }, [payments])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    const searched = !kw
      ? filteredByYearPeriod
      : filteredByYearPeriod.filter((payment) => (
      (payment.houses?.house_no || '').toLowerCase().includes(kw)
      || (payment.houses?.soi || '').toLowerCase().includes(kw)
      || (payment.payment_method || '').toLowerCase().includes(kw)
      || formatPeriod(payment.fees?.period || '').toLowerCase().includes(kw)
      || (payment.verified_at ? 'อนุมัติแล้ว' : getRejectedReason(payment.note) ? 'ตีกลับ' : 'รอตรวจสอบ').includes(kw)
    ))

    return [...searched].sort((a, b) => {
      const soiCmp = normalizeSoi(a.houses?.soi).localeCompare(normalizeSoi(b.houses?.soi), 'th', { numeric: true, sensitivity: 'base' })
      if (soiCmp !== 0) return soiCmp
      return compareHouseNo(a.houses?.house_no, b.houses?.house_no)
    })
  }, [filteredByYearPeriod, search])

  const loadPayments = async () => {
    try {
      setLoading(true)
      setPayments(await listPayments({ feeOnly: true }))
    } catch (error) {
      console.error('Error loading payments:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getSetupConfig().then(setSetup).catch(() => {})
    loadPayments()
  }, [])

  useEffect(() => () => {
    if (receiveSlipPreview) {
      URL.revokeObjectURL(receiveSlipPreview)
    }
  }, [receiveSlipPreview])

  const openReceiveModal = async () => {
    try {
      const feeRows = await listFees({ status: 'all' })
      const baseCandidates = feeRows.filter((fee) => (
        fee.status !== 'paid'
        && fee.status !== 'cancelled'
        && Number(fee.total_amount || 0) > 0
      ))

      const candidates = baseCandidates.filter((fee) => getOutstandingItemsForFee(fee, payments).length > 0)

      if (candidates.length === 0) {
        await Swal.fire({ icon: 'info', title: 'ไม่มีใบแจ้งหนี้ที่รับชำระได้' })
        return
      }

      const first = candidates[0]
      const payableItems = getOutstandingItemsForFee(first, payments)
      const selectedItems = payableItems.map((item) => item.key)
      const itemAmounts = payableItems.reduce((acc, item) => {
        acc[item.key] = item.amount
        return acc
      }, {})

      setFeeOptions(candidates)
      setReceiveForm({
        fee_id: first.id,
        amount: String(Number(first.total_amount || 0)),
        payment_method: 'transfer',
        paid_at: new Date().toISOString().slice(0, 16),
        selectedItems,
        itemAmounts,
        note: '',
      })
      if (receiveSlipPreview) {
        URL.revokeObjectURL(receiveSlipPreview)
      }
      setReceiveSlipPreview('')
      setReceiveSlipFile(null)
      setShowReceiveModal(true)
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'โหลดใบแจ้งหนี้ไม่สำเร็จ', text: error.message })
    }
  }

  const handleChangeReceiveFee = (feeId) => {
    const nextFee = feeOptions.find((fee) => fee.id === feeId)
    const payableItems = getOutstandingItemsForFee(nextFee, payments)
    const selectedItems = payableItems.map((item) => item.key)
    const itemAmounts = payableItems.reduce((acc, item) => {
      acc[item.key] = item.amount
      return acc
    }, {})

    setReceiveForm((prev) => ({
      ...prev,
      fee_id: feeId,
      amount: nextFee ? String(Number(nextFee.total_amount || 0)) : prev.amount,
      selectedItems,
      itemAmounts,
    }))
  }

  const toggleReceiveItem = (itemKey, checked) => {
    setReceiveForm((prev) => {
      const exists = prev.selectedItems.includes(itemKey)
      const baseItem = receivePayableItems.find((item) => item.key === itemKey)
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

  const handleChangeReceiveItemAmount = (itemKey, rawValue, maxAmount) => {
    let nextValue = Number(rawValue)
    if (!Number.isFinite(nextValue)) nextValue = 0
    if (nextValue < 0) nextValue = 0
    if (nextValue > maxAmount) nextValue = maxAmount

    setReceiveForm((prev) => ({
      ...prev,
      itemAmounts: {
        ...prev.itemAmounts,
        [itemKey]: nextValue,
      },
    }))
  }

  const selectAllReceiveItems = () => {
    setReceiveForm((prev) => ({
      ...prev,
      selectedItems: receivePayableItems.map((item) => item.key),
      itemAmounts: receivePayableItems.reduce((acc, item) => {
        acc[item.key] = Number(item.amount || 0)
        return acc
      }, {}),
    }))
  }

  const clearReceiveItems = () => {
    setReceiveForm((prev) => ({
      ...prev,
      selectedItems: [],
      itemAmounts: receivePayableItems.reduce((acc, item) => {
        acc[item.key] = 0
        return acc
      }, {}),
    }))
  }

  const handleChangeReceiveSlip = (event) => {
    const file = event.target.files?.[0] || null
    if (!file) {
      if (receiveSlipPreview) URL.revokeObjectURL(receiveSlipPreview)
      setReceiveSlipPreview('')
      setReceiveSlipFile(null)
      return
    }

    if (!String(file.type || '').startsWith('image/')) {
      Swal.fire({ icon: 'warning', title: 'แนบได้เฉพาะไฟล์รูปภาพ' })
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      Swal.fire({ icon: 'warning', title: 'ไฟล์ใหญ่เกิน 5MB' })
      event.target.value = ''
      return
    }

    if (receiveSlipPreview) URL.revokeObjectURL(receiveSlipPreview)
    setReceiveSlipFile(file)
    setReceiveSlipPreview(URL.createObjectURL(file))
  }

  useEffect(() => {
    setReceiveForm((prev) => {
      const nextAmount = String(receiveSelectedAmount)
      if (prev.amount === nextAmount) return prev
      return { ...prev, amount: nextAmount }
    })
  }, [receiveSelectedAmount])

  const handleSubmitReceive = async (event) => {
    event.preventDefault()

    const targetFee = feeOptions.find((fee) => fee.id === receiveForm.fee_id)
    if (!targetFee) {
      await Swal.fire({ icon: 'warning', title: 'กรุณาเลือกใบแจ้งหนี้' })
      return
    }

    if (receiveForm.selectedItems.length === 0) {
      await Swal.fire({ icon: 'warning', title: 'กรุณาเลือกรายการที่รับชำระอย่างน้อย 1 รายการ' })
      return
    }

    const amount = Number(receiveSelectedAmount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      await Swal.fire({ icon: 'warning', title: 'ยอดรับชำระต้องมากกว่า 0' })
      return
    }

    if (!receiveSlipFile) {
      await Swal.fire({ icon: 'warning', title: 'กรุณาแนบรูปหลักฐานการชำระ' })
      return
    }

    try {
      setSavingReceive(true)
      setUploadingSlip(true)
      const uploadedSlip = await uploadPaymentSlip(receiveSlipFile, {
        houseId: targetFee.house_id,
        houseNo: targetFee?.houses?.house_no || '-',
        paidAt: receiveForm.paid_at,
        runningNo: null,
      })
      const selectedItemsMeta = receivePayableItems
        .filter((item) => receiveForm.selectedItems.includes(item.key))
        .map((item) => ({
          key: item.key,
          label: item.label,
          dueAmount: Number(item.amount || 0),
          paidAmount: Number(receiveForm.itemAmounts?.[item.key] || 0),
        }))
      const selectedLabels = selectedItemsMeta
        .map((item) => `${item.label} ฿${Number(item.paidAmount || 0).toLocaleString('th-TH')}`)
      const noteParts = []
      if (selectedLabels.length > 0) noteParts.push(`ชำระรายการ: ${selectedLabels.join(', ')}`)
      if (receiveForm.note.trim()) noteParts.push(receiveForm.note.trim())
      noteParts.push(`${PAYMENT_META_PREFIX}${JSON.stringify({ items: selectedItemsMeta })}`)

      await createPayment({
        fee_id: targetFee.id,
        house_id: targetFee.house_id,
        amount,
        payment_method: receiveForm.payment_method,
        slip_url: uploadedSlip?.url || '',
        paid_at: receiveForm.paid_at,
        note: noteParts.join(' | '),
        payment_items: selectedItemsMeta.map((item) => ({
          item_key: item.key,
          item_label: item.label,
          due_amount: item.dueAmount,
          paid_amount: item.paidAmount,
        })),
        setFeeStatusFromAmount: true,
      })
      if (receiveSlipPreview) {
        URL.revokeObjectURL(receiveSlipPreview)
      }
      setReceiveSlipPreview('')
      setReceiveSlipFile(null)
      setShowReceiveModal(false)
      await loadPayments()
      await Swal.fire({ icon: 'success', title: 'บันทึกรับชำระแล้ว', timer: 1200, showConfirmButton: false })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'รับชำระไม่สำเร็จ', text: error.message })
    } finally {
      setUploadingSlip(false)
      setSavingReceive(false)
    }
  }

  const openApproveModal = async (payment) => {
    setApproveTarget(payment)
    setApproveFeeSnapshot(null)
    setApproveItemDraft({})

    if (!payment?.fee_id) return

    try {
      setLoadingApproveItems(true)
      const fee = await getFeeById(payment.fee_id)
      if (!fee) return

      const outstandingItems = getOutstandingItemsForApproval(fee, payments, { excludePaymentId: payment.id })
      const totalAmount = Number(payment.amount || 0)
      setApproveFeeSnapshot(fee)
      setApproveItemDraft(buildAllocationDraft(outstandingItems, totalAmount))
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'โหลดรายละเอียดตัดหนี้ไม่สำเร็จ', text: error.message })
    } finally {
      setLoadingApproveItems(false)
    }
  }

  const handleApproveConfirmed = async () => {
    if (!approveTarget) return
    try {
      setApproving(true)

      if (approveTarget?.fee_id && approveFeeSnapshot) {
        const outstandingItems = getOutstandingItemsForApproval(approveFeeSnapshot, payments, { excludePaymentId: approveTarget.id })
        const outstandingTotal = outstandingItems.reduce((sum, item) => sum + Number(item.outstanding || 0), 0)

        const approvalRows = outstandingItems
          .map((item) => {
            const paidAmount = Number(approveItemDraft[item.key] || 0)
            return {
              key: item.key,
              label: item.label,
              dueAmount: Number(item.outstanding || 0),
              paidAmount,
            }
          })
          .filter((row) => row.paidAmount > 0)

        const approvedTotal = approvalRows.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0)
        const targetAmount = Number(approveTarget.amount || 0)

        if (approvalRows.length === 0) {
          await Swal.fire({ icon: 'warning', title: 'กรุณาระบุรายการที่ตัดหนี้อย่างน้อย 1 รายการ' })
          return
        }

        if (targetAmount - outstandingTotal > 0.009) {
          await Swal.fire({
            icon: 'warning',
            title: 'ยอดที่ลูกบ้านชำระเกินยอดเรียกเก็บ',
            text: `ยอดเรียกเก็บคงค้าง ${formatMoney(outstandingTotal)} แต่ยอดที่ลูกบ้านชำระ ${formatMoney(targetAmount)} จึงไม่สามารถบันทึกอนุมัติได้`,
          })
          return
        }

        if (approvedTotal - targetAmount > 0.009) {
          await Swal.fire({
            icon: 'warning',
            title: 'ยอดอนุมัติเกินยอดที่ลูกบ้านชำระ',
            text: `ยอดชำระ ${formatMoney(targetAmount)} แต่ยอดตัดหนี้ ${formatMoney(approvedTotal)}`,
          })
          return
        }

        const noteWithMeta = buildPaymentMetaNote(getDisplayNote(approveTarget.note), approvalRows)

        await updatePayment(approveTarget.id, {
          fee_id: approveTarget.fee_id,
          house_id: approveTarget.house_id,
          amount: approvedTotal,
          payment_method: approveTarget.payment_method,
          slip_url: approveTarget.slip_url,
          paid_at: approveTarget.paid_at,
          verified_by: null,
          verified_at: null,
          note: noteWithMeta,
          payment_items: approvalRows.map((row) => ({
            item_key: row.key,
            item_label: row.label,
            due_amount: row.dueAmount,
            paid_amount: row.paidAmount,
          })),
        })
      }

      const approved = await approvePayment(approveTarget.id, profile?.id)
      setPayments((prev) => prev.map((item) => (item.id === approved.id ? approved : item)))
      setApproveTarget(null)
      setApproveFeeSnapshot(null)
      setApproveItemDraft({})
      await Swal.fire({ icon: 'success', title: 'อนุมัติแล้ว', timer: 1200, showConfirmButton: false })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'อนุมัติไม่สำเร็จ', text: error.message })
    } finally {
      setApproving(false)
    }
  }

  const handleOpenSlip = (payment) => {
    if (!payment.slip_url) return
    window.open(payment.slip_url, '_blank', 'noopener,noreferrer')
  }

  const approveOutstandingItems = useMemo(() => {
    if (!approveTarget?.fee_id || !approveFeeSnapshot) return []
    return getOutstandingItemsForApproval(approveFeeSnapshot, payments, { excludePaymentId: approveTarget.id })
  }, [approveTarget, approveFeeSnapshot, payments])

  const approveDraftTotal = useMemo(() => {
    if (!approveOutstandingItems.length) return 0
    return approveOutstandingItems.reduce((sum, item) => sum + Number(approveItemDraft[item.key] || 0), 0)
  }, [approveOutstandingItems, approveItemDraft])

  const handleApproveDraftAmountChange = (itemKey, rawValue, maxAmount) => {
    let nextValue = Number(rawValue)
    if (!Number.isFinite(nextValue)) nextValue = 0
    if (nextValue < 0) nextValue = 0
    if (nextValue > maxAmount) nextValue = maxAmount

    setApproveItemDraft((prev) => ({
      ...prev,
      [itemKey]: nextValue,
    }))
  }

  const handleAutoAllocateApproveDraft = () => {
    if (!approveOutstandingItems.length || !approveTarget) return
    setApproveItemDraft(buildAllocationDraft(approveOutstandingItems, Number(approveTarget.amount || 0)))
  }

  const handleClearApproveDraft = () => {
    const next = {}
    approveOutstandingItems.forEach((item) => { next[item.key] = 0 })
    setApproveItemDraft(next)
  }

  const handleReject = async (payment) => {
    const { value: reason } = await Swal.fire({
      icon: 'warning',
      title: 'ตีกลับหลักฐานการชำระ',
      input: 'text',
      inputLabel: 'เหตุผลการตีกลับ',
      inputPlaceholder: 'เช่น ยอดไม่ตรงกับใบแจ้งหนี้',
      showCancelButton: true,
      confirmButtonText: 'ตีกลับ',
      cancelButtonText: 'ปิด',
      confirmButtonColor: '#dc2626',
      inputValidator: (value) => (!String(value || '').trim() ? 'กรุณาระบุเหตุผล' : undefined),
    })

    if (!reason) return false

    try {
      const rejected = await rejectPayment(payment.id, reason, profile?.id)
      setPayments((prev) => prev.map((item) => (item.id === rejected.id ? rejected : item)))
      await Swal.fire({ icon: 'success', title: 'ตีกลับแล้ว', timer: 1200, showConfirmButton: false })
      return true
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ตีกลับไม่สำเร็จ', text: error.message })
      return false
    }
  }

  const buildReceiptHtml = (payment, { autoPrint = false, forCapture = false } = {}) => {
    if (!payment?.verified_at) return ''
    return buildReceiptHtmlAdminStyle({
      payment,
      setup,
      receiptNo: buildReceiptNo(payment, receiptNoById),
      logoUrl: setup.loginCircleLogoUrl || villageLogo,
      signatureUrl: setup.juristicSignatureUrl || '',
      itemRows: getPaymentItemRows(payment),
      autoPrint,
      forCapture,
      displayNote: getDisplayNote(payment.note),
    })
  }

  const sanitizeFileBaseName = (input, fallback = 'receipt') => {
    const safe = String(input || '')
      .trim()
      .replace(/[^\w\-.]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
    return safe || fallback
  }

  const openReceiptPrintPreviewModal = ({ html, title, fileBase }) => {
    setReceiptPrintPreviewHtml(html)
    setReceiptPrintPreviewTitle(title || 'ตัวอย่างใบเสร็จ')
    setReceiptPrintPreviewFileBase(sanitizeFileBaseName(fileBase, 'receipt'))
    setShowReceiptPrintPreviewModal(true)
  }

  const closeReceiptPrintPreviewModal = () => {
    if (receiptPrintPreviewExporting) return
    setShowReceiptPrintPreviewModal(false)
    setReceiptPrintPreviewHtml('')
    setReceiptPrintPreviewTitle('ตัวอย่างใบเสร็จ')
    setReceiptPrintPreviewFileBase('receipt')
  }

  const handlePrintReceiptFromPreview = () => {
    const frameWindow = receiptPrintPreviewIframeRef.current?.contentWindow
    if (!frameWindow) {
      Swal.fire({ icon: 'warning', title: 'ยังไม่พร้อมพิมพ์', text: 'กรุณารอสักครู่แล้วลองอีกครั้ง' })
      return
    }
    frameWindow.focus()
    frameWindow.print()
  }

  const captureReceiptPreviewSheets = async () => {
    const html = String(receiptPrintPreviewHtml || '').trim()
    if (!html) throw new Error('ไม่พบเอกสารสำหรับดาวน์โหลด')

    const host = document.createElement('iframe')
    host.setAttribute('aria-hidden', 'true')
    host.style.position = 'fixed'
    host.style.left = '-99999px'
    host.style.top = '-99999px'
    host.style.width = '820px'
    host.style.height = '1200px'
    host.style.visibility = 'hidden'
    host.style.pointerEvents = 'none'

    document.body.appendChild(host)

    try {
      await new Promise((resolve, reject) => {
        host.onload = () => resolve()
        host.onerror = () => reject(new Error('โหลดเอกสารไม่สำเร็จ'))
        host.srcdoc = html
      })

      const doc = host.contentDocument
      if (!doc) throw new Error('ไม่สามารถเข้าถึงเอกสารสำหรับดาวน์โหลด')
      if (doc.fonts?.ready) {
        await doc.fonts.ready.catch(() => {})
      }

      const sheets = Array.from(doc.querySelectorAll('.sheet'))
      if (sheets.length === 0) throw new Error('ไม่พบหน้าสำหรับดาวน์โหลด')

      const canvases = []
      for (const sheet of sheets) {
        const rect = sheet.getBoundingClientRect()
        const width = Math.max(794, Math.ceil(rect.width || 794))
        const height = Math.max(1123, Math.ceil(rect.height || 1123))
        const canvas = await html2canvas(sheet, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          width,
          height,
          windowWidth: width,
          windowHeight: height,
          scrollX: 0,
          scrollY: 0,
        })
        canvases.push(canvas)
      }

      return canvases
    } finally {
      host.remove()
    }
  }

  const downloadReceiptPreviewAsPdf = async () => {
    if (receiptPrintPreviewExporting) return
    try {
      setReceiptPrintPreviewExporting(true)
      const canvases = await captureReceiptPreviewSheets()
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      canvases.forEach((canvas, index) => {
        if (index > 0) pdf.addPage()
        const imgData = canvas.toDataURL('image/jpeg', 0.95)
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
      })
      pdf.save(`${receiptPrintPreviewFileBase}.pdf`)
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ดาวน์โหลด PDF ไม่สำเร็จ', text: error.message || 'โปรดลองอีกครั้ง' })
    } finally {
      setReceiptPrintPreviewExporting(false)
    }
  }

  const downloadReceiptPreviewAsImage = async () => {
    if (receiptPrintPreviewExporting) return
    try {
      setReceiptPrintPreviewExporting(true)
      const canvases = await captureReceiptPreviewSheets()
      canvases.forEach((canvas, index) => {
        const anchor = document.createElement('a')
        const suffix = canvases.length > 1 ? `-${index + 1}` : ''
        anchor.href = canvas.toDataURL('image/png')
        anchor.download = `${receiptPrintPreviewFileBase}${suffix}.png`
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ดาวน์โหลดรูปภาพไม่สำเร็จ', text: error.message || 'โปรดลองอีกครั้ง' })
    } finally {
      setReceiptPrintPreviewExporting(false)
    }
  }

  const handlePrintReceipt = (payment) => {
    if (!payment?.verified_at) return
    const receiptNo = buildReceiptNo(payment, receiptNoById)
    const html = buildReceiptHtml(payment)
    openReceiptPrintPreviewModal({
      html,
      title: `ใบเสร็จ ${payment.houses?.house_no || '-'} · ${formatPeriod(payment.fees?.period)} ปี ${toBE(payment.fees?.year)}`,
      fileBase: `receipt-${receiptNo}`,
    })
  }

  const handleRejectFromApproveModal = async () => {
    if (!approveTarget) return
    const success = await handleReject(approveTarget)
    if (success) {
      setApproveTarget(null)
    }
  }

  const getStatusBadge = (payment) => {
    if (payment.verified_at) return { className: 'bd b-ok', label: 'อนุมัติแล้ว' }
    if (getRejectedReason(payment.note)) return { className: 'bd b-dg', label: 'ตีกลับ' }
    return { className: 'bd b-wn', label: 'รอตรวจสอบ' }
  }

  return (
    <div className="pane on houses-compact payments-compact">
      <div className="ph houses-ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">
              <img className="ph-ico-img" src={setup.loginCircleLogoUrl || villageLogo} alt="system-logo" />
            </div>
            <div>
              <div className="ph-h1">จ่ายค่าส่วนกลาง</div>
              <div className="ph-sub">ตรวจสอบการชำระ อนุมัติ และออกใบเสร็จ · {setup.villageName}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card report-filter-card admin-search-filter-card">
        <div className="cb" style={{ padding: 12 }}>
          <div className="houses-filter-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="houses-filter-input"
              placeholder="ค้นหา ซอย / บ้าน / วิธีชำระ / สถานะ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 220px', minWidth: 0 }}
            />
            <button className="btn btn-a btn-sm" onClick={loadPayments} disabled={loading} style={{ height: '34px' }}>ค้นหา</button>
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--mu)' }}>ปี:</span>
            <button
              type="button"
              onClick={() => setYearFilter('all')}
              style={{ border: yearFilter === 'all' ? '2px solid #0c4a6e' : '1px solid var(--bo)', background: yearFilter === 'all' ? '#eff6ff' : '#fff', color: '#0f172a', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              ทั้งหมด
            </button>
            {yearCards.map((card) => (
              <button
                key={card.value}
                type="button"
                onClick={() => setYearFilter(card.value)}
                style={{ border: yearFilter === card.value ? '2px solid #0c4a6e' : '1px solid var(--bo)', background: yearFilter === card.value ? '#eff6ff' : '#fff', color: '#0f172a', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {card.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="sc"><div className="sc-ico a">💵</div><div><div className="sc-v">฿{formatMoney(summary.totalAmount)}</div><div className="sc-l">ยอดชำระทั้งหมด</div></div></div>
        <div className="sc"><div className="sc-ico p">✅</div><div><div className="sc-v">{summary.approvedCount}</div><div className="sc-l">อนุมัติแล้ว ฿{formatMoney(summary.approvedAmount)}</div></div></div>
        <div className="sc"><div className="sc-ico d">⏳</div><div><div className="sc-v">{summary.pendingCount}</div><div className="sc-l">รอตรวจสอบ ฿{formatMoney(summary.pendingAmount)}</div></div></div>
        <div className="sc"><div className="sc-ico d">⛔</div><div><div className="sc-v">{summary.rejectedCount}</div><div className="sc-l">ตีกลับ</div></div></div>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">รายการชำระเงินทั้งหมด {filtered.length} รายการ</div>
          <div className="houses-list-actions">
            <button className="btn btn-p btn-sm" onClick={openReceiveModal}>+ รับชำระ</button>
            <button className="btn btn-g btn-sm" onClick={loadPayments} disabled={loading}>🔄 รีเฟรช</button>
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
                    <span style={{ minWidth: 20, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: active ? '#0c4a6e' : '#e2e8f0', color: active ? '#fff' : '#475569', fontSize: 11, padding: '0 6px' }}>
                      {item.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="cb houses-table-card-body houses-main-body">
            <div className="houses-table-wrap houses-desktop-only payments-main-wrap">
              <table className="tw houses-table houses-main-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ width: '13%' }}>เลขที่ใบเสร็จ</th>
                    <th style={{ width: '8%' }}>ซอย</th>
                    <th style={{ width: '8%' }}>บ้าน</th>
                    <th style={{ width: '12%' }}>งวด</th>
                    <th style={{ width: '10%' }}>จำนวนเงิน</th>
                    <th style={{ width: '9%' }}>วิธีชำระ</th>
                    <th style={{ width: '11%' }}>วันที่</th>
                    <th style={{ width: '9%' }}>สถานะ</th>
                    <th style={{ width: '20%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>กำลังโหลดข้อมูล...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>ยังไม่มีรายการชำระเงิน</td></tr>
                  ) : (
                    filtered.map((payment) => {
                      const badge = getStatusBadge(payment)
                      return (
                      <tr key={payment.id}>
                        <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{payment.verified_at ? buildReceiptNo(payment, receiptNoById) : '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{payment.houses?.soi || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{payment.houses?.house_no || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{payment.fees ? `${formatPeriod(payment.fees.period)} ${toBE(payment.fees.year)}` : '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatMoney(payment.amount)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatMethod(payment.payment_method)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(payment.paid_at)}</td>
                        <td><span className={badge.className}>{badge.label}</span></td>
                        <td>
                          <div className="td-acts payments-row-acts">
                            {payment.slip_url && <button className="btn btn-xs btn-o" onClick={() => handleOpenSlip(payment)}>สลิป</button>}
                            {!payment.verified_at && <button className="btn btn-xs btn-ok" onClick={() => openApproveModal(payment)}>อนุมัติ</button>}
                            {!payment.verified_at && <button className="btn btn-xs btn-dg" onClick={() => handleReject(payment)}>ตีกลับ</button>}
                            {payment.verified_at && <button className="btn btn-xs btn-a" onClick={() => handlePrintReceipt(payment)}>ใบเสร็จ</button>}
                          </div>
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
          </div>

          <div className="houses-mobile-only" style={{ gap: 10, padding: '4px 0' }}>
            {loading ? (
              <div className="mcard-empty">กำลังโหลดข้อมูล...</div>
            ) : filtered.length === 0 ? (
              <div className="mcard-empty">ยังไม่มีรายการชำระเงิน</div>
            ) : filtered.map((payment) => {
              const badge = getStatusBadge(payment)
              return (
              <div key={payment.id} className="houses-mcard">
                <div className="houses-mcard-top">
                  <div>
                    <div className="houses-mcard-no">{payment.houses?.house_no || '-'}</div>
                    <div className="mcard-sub">ซอย {payment.houses?.soi || '-'} · {payment.fees ? `${formatPeriod(payment.fees.period)} ${toBE(payment.fees.year)}` : '-'}</div>
                  </div>
                  <span className={`${badge.className} houses-mcard-badge`}>{badge.label}</span>
                </div>
                <div className="mcard-meta" style={{ marginTop: 4 }}>
                  {payment.verified_at && <span><span className="mcard-label">เลขใบเสร็จ</span> {buildReceiptNo(payment, receiptNoById)}</span>}
                  <span><span className="mcard-label">จำนวนเงิน</span> {formatMoney(payment.amount)}</span>
                  <span><span className="mcard-label">วิธีชำระ</span> {formatMethod(payment.payment_method)}</span>
                  <span><span className="mcard-label">วันที่ชำระ</span> {formatDateTime(payment.paid_at)}</span>
                  {getRejectedReason(payment.note) && <span><span className="mcard-label">เหตุผลตีกลับ</span> {getRejectedReason(payment.note)}</span>}
                </div>
                <div className="mcard-actions">
                  {payment.slip_url && <button className="btn btn-xs btn-o" onClick={() => handleOpenSlip(payment)}>สลิป</button>}
                  {!payment.verified_at && <button className="btn btn-xs btn-ok" onClick={() => openApproveModal(payment)}>อนุมัติ</button>}
                  {!payment.verified_at && <button className="btn btn-xs btn-dg" onClick={() => handleReject(payment)}>ตีกลับ</button>}
                  {payment.verified_at && <button className="btn btn-xs btn-a" onClick={() => handlePrintReceipt(payment)}>ใบเสร็จ</button>}
                </div>
              </div>
            )})}
          </div>
        </div>
      </div>

      {showReceiveModal && (
        <div className="house-mo">
          <div className="house-md house-md--md">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">💳 รับชำระค่าส่วนกลาง</div>
                <div className="house-md-sub">บันทึกรายการรับชำระและส่งเข้ารอตรวจสอบ</div>
              </div>
            </div>
            <form onSubmit={handleSubmitReceive}>
              <div className="house-md-body">
                <section className="house-sec">
                  <div className="house-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="house-field">
                      <span>ใบแจ้งหนี้ *</span>
                      <StyledSelect value={receiveForm.fee_id} onChange={(e) => handleChangeReceiveFee(e.target.value)}>
                        {feeOptions.map((fee) => (
                          <option key={fee.id} value={fee.id}>
                            {fee.houses?.house_no || '-'} · {formatPeriod(fee.period)} {fee.year} · ยอดรวม ฿{Number(fee.total_amount || 0).toLocaleString('th-TH')}
                          </option>
                        ))}
                      </StyledSelect>
                    </label>
                    <div className="house-field" style={{ gap: 10, gridColumn: '1 / -1' }}>
                      <span>เลือกรายการรับชำระ</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-xs btn-a" onClick={selectAllReceiveItems} style={{ padding: '3px 8px', fontSize: 10 }}>เลือกทั้งหมด</button>
                        <button type="button" className="btn btn-xs btn-g" onClick={clearReceiveItems} style={{ padding: '3px 8px', fontSize: 10 }}>ล้างการเลือก</button>
                      </div>
                      <div className="houses-table-wrap payments-receive-wrap" style={{ maxHeight: '280px', overflow: 'auto' }}>
                        <table className="tw receive-items-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '40px', textAlign: 'center' }}>เลือก</th>
                              <th>รายการ</th>
                              <th style={{ width: '180px' }}>ยอดที่ต้องชำระ</th>
                              <th style={{ width: '180px' }}>ยอดชำระจริง</th>
                            </tr>
                          </thead>
                          <tbody>
                            {receivePayableItems.length === 0 ? (
                              <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--mu)', padding: '14px' }}>ไม่มีรายการที่มียอดเรียกเก็บ</td></tr>
                            ) : receivePayableItems.map((item) => {
                              const checked = receiveForm.selectedItems.includes(item.key)
                              return (
                                <tr key={item.key}>
                                  <td style={{ textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => toggleReceiveItem(item.key, e.target.checked)}
                                    />
                                  </td>
                                  <td>{item.label}</td>
                                  <td>฿{item.amount.toLocaleString('th-TH')}</td>
                                  <td>
                                    <input
                                      type="number"
                                      min="0"
                                      max={item.amount}
                                      step="0.01"
                                      value={receiveForm.itemAmounts?.[item.key] ?? item.amount}
                                      disabled={!checked}
                                      onChange={(e) => handleChangeReceiveItemAmount(item.key, e.target.value, item.amount)}
                                      style={{ width: '100%' }}
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', color: 'var(--mu)', fontSize: 13 }}>
                        <span>ยอดใบแจ้งหนี้: ฿{Number(selectedReceiveFee?.total_amount || 0).toLocaleString('th-TH')}</span>
                        <span style={{ fontWeight: 700, color: 'var(--tx)' }}>ยอดรับชำระรวม: ฿{Number(receiveSelectedAmount || 0).toLocaleString('th-TH')}</span>
                      </div>
                    </div>
                    <label className="house-field">
                      <span>วิธีชำระ *</span>
                      <StyledSelect
                        value={receiveForm.payment_method}
                        onChange={(e) => setReceiveForm((prev) => ({ ...prev, payment_method: e.target.value }))}
                      >
                        <option value="transfer">โอนเงิน</option>
                        <option value="cash">เงินสด</option>
                        <option value="qr">QR</option>
                      </StyledSelect>
                    </label>
                    <label className="house-field">
                      <span>วันเวลา *</span>
                      <input
                        type="datetime-local"
                        value={receiveForm.paid_at}
                        onChange={(e) => setReceiveForm((prev) => ({ ...prev, paid_at: e.target.value }))}
                      />
                    </label>
                    <label className="house-field" style={{ gridColumn: '1 / -1' }}>
                      <span>แนบหลักฐานการชำระ (รูปภาพ) *</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleChangeReceiveSlip}
                      />
                      <div style={{ fontSize: 12, color: 'var(--mu)' }}>บังคับแนบเฉพาะรูปภาพ ระบบจะย่ออัตโนมัติให้ไม่เกิน 50KB และเปลี่ยนชื่อไฟล์ไม่ซ้ำ</div>
                      {receiveSlipPreview && (
                        <img
                          src={receiveSlipPreview}
                          alt="receive-slip-preview"
                          style={{ width: '100%', maxWidth: '300px', borderRadius: 8, border: '1px solid var(--bo)', marginTop: 6 }}
                        />
                      )}
                    </label>
                    <label className="house-field" style={{ gridColumn: '1 / -1' }}>
                      <span>หมายเหตุ</span>
                      <textarea
                        rows="2"
                        value={receiveForm.note}
                        onChange={(e) => setReceiveForm((prev) => ({ ...prev, note: e.target.value }))}
                        placeholder="รายละเอียดเพิ่มเติม"
                        style={{ minHeight: 60, maxHeight: 60 }}
                      />
                    </label>
                  </div>
                </section>
              </div>
              <div className="house-md-foot">
                <button
                  className="btn btn-g"
                  type="button"
                  onClick={() => {
                    if (receiveSlipPreview) URL.revokeObjectURL(receiveSlipPreview)
                    setReceiveSlipPreview('')
                    setReceiveSlipFile(null)
                    setShowReceiveModal(false)
                  }}
                  disabled={savingReceive || uploadingSlip}
                >
                  ปิด
                </button>
                <button className="btn btn-p" type="submit" disabled={savingReceive || uploadingSlip}>
                  {savingReceive || uploadingSlip ? 'กำลังบันทึก...' : 'บันทึกรับชำระ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReceiptPrintPreviewModal && (
        <div className="house-mo">
          <div className="house-md house-md--xl" style={{ '--house-md-max-w': '1120px', '--house-md-max-h': 'calc(100dvh - 36px)' }}>
            <div className="house-md-head">
              <div>
                <div className="house-md-title">🖨 {receiptPrintPreviewTitle}</div>
                <div className="house-md-sub">แสดงตัวอย่างก่อนพิมพ์และดาวน์โหลดเอกสาร</div>
              </div>
            </div>
            <div className="house-md-body" style={{ padding: 10, background: '#eef2f7' }}>
              <div style={{ border: '1px solid var(--bo)', borderRadius: 10, overflow: 'hidden', background: '#fff', height: 'calc(100dvh - 220px)', minHeight: 420 }}>
                <iframe
                  ref={receiptPrintPreviewIframeRef}
                  title={receiptPrintPreviewTitle}
                  srcDoc={receiptPrintPreviewHtml}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              </div>
            </div>
            <div className="house-md-foot">
              <button className="btn btn-o" type="button" onClick={downloadReceiptPreviewAsPdf} disabled={receiptPrintPreviewExporting}>{receiptPrintPreviewExporting ? 'กำลังสร้างไฟล์...' : '⬇ PDF'}</button>
              <button className="btn btn-o" type="button" onClick={downloadReceiptPreviewAsImage} disabled={receiptPrintPreviewExporting}>{receiptPrintPreviewExporting ? 'กำลังสร้างไฟล์...' : '⬇ Image'}</button>
              <button className="btn btn-a" type="button" onClick={handlePrintReceiptFromPreview} disabled={receiptPrintPreviewExporting}>🖨 พิมพ์</button>
              <button
                className="btn btn-g"
                type="button"
                onClick={closeReceiptPrintPreviewModal}
                disabled={receiptPrintPreviewExporting}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {approveTarget && (
        <div className="house-mo">
          <div className="house-md house-md--md">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">ตรวจสอบรายการก่อนอนุมัติ</div>
                <div className="house-md-sub">แสดงข้อมูลที่ลูกบ้านบันทึกมา ก่อนยืนยันอนุมัติ/ไม่อนุมัติ</div>
              </div>
            </div>
            <div className="house-md-body">
              <section className="house-sec">
                <div className="house-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="house-field"><span>บ้านเลขที่</span><strong>{approveTarget.houses?.house_no || '-'}</strong></div>
                  <div className="house-field"><span>วิธีชำระ</span><strong>{formatMethod(approveTarget.payment_method)}</strong></div>
                  <div className="house-field"><span>วันที่ชำระ</span><strong>{formatDateTime(approveTarget.paid_at)}</strong></div>
                  <div className="house-field"><span>ยอดชำระรวม</span><strong>฿{formatMoney(approveTarget.amount)}</strong></div>
                </div>
              </section>

              <section className="house-sec">
                <div className="house-field" style={{ gap: 8 }}>
                  <span>รายการที่ลูกบ้านแจ้งชำระ</span>
                  <div className="houses-table-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
                    <table className="tw" style={{ width: '100%', minWidth: 560 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 60, textAlign: 'center' }}>ลำดับ</th>
                          <th>รายการ</th>
                          <th style={{ width: 170 }}>ยอดที่ต้องชำระ</th>
                          <th style={{ width: 170 }}>ยอดชำระจริง</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getPaymentItemRows(approveTarget).map((row, index) => (
                          <tr key={`${approveTarget.id}-${row.key}-${index}`}>
                            <td style={{ textAlign: 'center' }}>{index + 1}</td>
                            <td>{row.label}</td>
                            <td>฿{Number(row.dueAmount || 0).toLocaleString('th-TH')}</td>
                            <td>฿{Number(row.paidAmount || 0).toLocaleString('th-TH')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {approveTarget.fee_id && (
                <section className="house-sec">
                  <div className="house-field" style={{ gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>ระบุรายการตัดหนี้ (ใช้ตอนอนุมัติ)</span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-xs btn-a" type="button" onClick={handleAutoAllocateApproveDraft} disabled={loadingApproveItems || approving}>เติมอัตโนมัติ</button>
                        <button className="btn btn-xs btn-g" type="button" onClick={handleClearApproveDraft} disabled={loadingApproveItems || approving}>ล้างค่า</button>
                      </div>
                    </div>

                    {loadingApproveItems ? (
                      <div style={{ fontSize: 13, color: 'var(--mu)' }}>กำลังโหลดรายการคงค้าง...</div>
                    ) : approveOutstandingItems.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--mu)' }}>ไม่พบยอดคงค้างแยกรายการ</div>
                    ) : (
                      <div className="houses-table-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
                        <table className="tw" style={{ width: '100%', minWidth: 620 }}>
                          <thead>
                            <tr>
                              <th style={{ width: 60, textAlign: 'center' }}>ลำดับ</th>
                              <th>รายการ</th>
                              <th style={{ width: 160 }}>ยอดคงค้าง</th>
                              <th style={{ width: 180 }}>ยอดอนุมัติ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {approveOutstandingItems.map((row, index) => (
                              <tr key={`${approveTarget.id}-approve-draft-${row.key}`}>
                                <td style={{ textAlign: 'center' }}>{index + 1}</td>
                                <td>{row.label}</td>
                                <td>฿{Number(row.outstanding || 0).toLocaleString('th-TH')}</td>
                                <td>
                                  <input
                                    type="number"
                                    min="0"
                                    max={row.outstanding}
                                    step="0.01"
                                    value={approveItemDraft[row.key] ?? 0}
                                    onChange={(e) => handleApproveDraftAmountChange(row.key, e.target.value, Number(row.outstanding || 0))}
                                    disabled={approving}
                                    style={{ width: '100%' }}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', color: 'var(--mu)', fontSize: 13 }}>
                      <span>ยอดชำระที่ลูกบ้านแจ้ง: ฿{formatMoney(approveTarget.amount)}</span>
                      <span style={{ fontWeight: 700, color: Number(approveDraftTotal || 0) - Number(approveTarget.amount || 0) > 0.009 ? 'var(--dg)' : 'var(--ac)' }}>
                        ยอดตัดหนี้รวม: ฿{formatMoney(approveDraftTotal)}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              <section className="house-sec">
                <div className="house-field" style={{ gap: 8 }}>
                  <span>หลักฐานการชำระ</span>
                  {approveTarget.slip_url ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <img
                        src={approveTarget.slip_url}
                        alt="submitted-slip"
                        style={{ width: '100%', maxWidth: 360, borderRadius: 8, border: '1px solid var(--bo)' }}
                      />
                      <div>
                        <button className="btn btn-xs btn-o" onClick={() => handleOpenSlip(approveTarget)}>เปิดรูปเต็ม</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--mu)', fontSize: 13 }}>ไม่พบหลักฐานแนบ</div>
                  )}
                </div>
                {getDisplayNote(approveTarget.note) && (
                  <div className="house-field" style={{ marginTop: 10 }}>
                    <span>หมายเหตุจากผู้ชำระ</span>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{getDisplayNote(approveTarget.note)}</div>
                  </div>
                )}
              </section>
            </div>
            <div className="house-md-foot">
              <button className="btn btn-g" type="button" onClick={() => setApproveTarget(null)} disabled={approving}>ปิด</button>
              <button className="btn btn-dg" type="button" onClick={handleRejectFromApproveModal} disabled={approving}>ไม่อนุมัติ</button>
              <button className="btn btn-ok" type="button" onClick={handleApproveConfirmed} disabled={approving}>{approving ? 'กำลังอนุมัติ...' : 'ยืนยันอนุมัติ'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}