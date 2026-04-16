import React, { useEffect, useMemo, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import Swal from 'sweetalert2'
import { useAuth } from '../../contexts/AuthContext'
import { listPaymentItemTypes } from '../../lib/paymentItemTypes'
import { listHouses } from '../../lib/houses'
import { createPayment, listPayments, updatePayment } from '../../lib/fees'
import { listPartners } from '../../lib/partners'
import { getSetupConfig } from '../../lib/setup'
import villageLogo from '../../assets/village-logo.svg'

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

function formatMethod(method) {
  if (method === 'transfer') return 'โอนเงิน'
  if (method === 'cash') return 'เงินสด'
  if (method === 'qr') return 'QR'
  return method || '-'
}

function openHtmlInWindow(html) {
  const popup = window.open('', '_blank', 'width=1200,height=900')
  if (!popup) return null
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  return popup
}

function compareHouseNo(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'th', { numeric: true, sensitivity: 'base' })
}

function buildLocalDateTimeValue(date = new Date()) {
  const tzOffset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16)
}

function getReceiptNo(payment) {
  return String(payment?.receipt_no || '').trim() || String(payment?.id || '-')
}

function toThaiBahtText(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount < 0) return '-'

  const digitsText = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const unitsText = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

  const convertChunk = (num) => {
    if (num === 0) return ''
    const digits = String(num).split('').map((digit) => Number(digit))
    const len = digits.length
    let text = ''

    digits.forEach((digit, index) => {
      const pos = len - index - 1
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
    .map((chunk, index) => {
      const chunkText = convertChunk(chunk)
      if (!chunkText) return ''
      const isLast = index === chunks.length - 1
      return isLast ? chunkText : `${chunkText}ล้าน`
    })
    .join('')) || 'ศูนย์'

  if (satang === 0) return `${bahtText}บาทถ้วน`
  return `${bahtText}บาท${convertChunk(satang)}สตางค์`
}

function getPaymentItemRows(payment) {
  if (Array.isArray(payment?.payment_items) && payment.payment_items.length > 0) {
    return payment.payment_items.map((item, index) => ({
      key: item.item_key || `item_${index + 1}`,
      label: item.item_label || '-',
      dueAmount: Number(item.due_amount || 0),
      paidAmount: Number(item.paid_amount || 0),
    }))
  }

  const paidAmount = Number(payment?.amount || 0)
  return [{ key: 'paid_total', label: 'ยอดชำระที่บันทึก', dueAmount: paidAmount, paidAmount }]
}

function emptyForm() {
  return {
    payerType: 'resident',
    houseId: '',
    partnerId: '',
    paymentMethod: 'transfer',
    paidAt: buildLocalDateTimeValue(),
    note: '',
    selectedItems: [],
    pendingItemId: '',
  }
}

function mapPaymentToEditForm(payment) {
  const rows = getPaymentItemRows(payment).map((row) => ({
    item_key: row.key,
    item_label: row.label,
    due_amount: Number(row.dueAmount || 0),
    paid_amount: Number(row.paidAmount || 0),
  }))
  return {
    payerType: payment?.payer_type === 'external' ? 'external' : 'resident',
    houseId: payment?.house_id || '',
    partnerId: payment?.partner_id || '',
    paymentMethod: payment?.payment_method || 'transfer',
    paidAt: buildLocalDateTimeValue(payment?.paid_at ? new Date(payment.paid_at) : new Date()),
    note: payment?.note || '',
    selectedItems: rows,
    pendingItemId: '',
  }
}

export default function AdminFeatureReceivePayment() {
  const { profile } = useAuth()
  const [setup, setSetup] = useState({ villageName: 'The Greenfield' })
  const [items, setItems] = useState([])
  const [houses, setHouses] = useState([])
  const [partners, setPartners] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [savingReceive, setSavingReceive] = useState(false)
  const [receiveForm, setReceiveForm] = useState(() => emptyForm())
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState(() => String(new Date().getFullYear()))
  const [monthFilter, setMonthFilter] = useState(() => String(new Date().getMonth() + 1))
  const [detailTarget, setDetailTarget] = useState(null)
  const [detailForm, setDetailForm] = useState(() => emptyForm())
  const [savingEdit, setSavingEdit] = useState(false)
  const [editableMap, setEditableMap] = useState({})
  const [receiptPrintTarget, setReceiptPrintTarget] = useState(null)
  const [showReceiptPrintActionModal, setShowReceiptPrintActionModal] = useState(false)
  const [runningReceiptPrintAction, setRunningReceiptPrintAction] = useState(false)

  const loadPageData = async () => {
    setLoading(true)
    try {
      const [paymentRows, itemRows, houseRows, partnerRows, setupConfig] = await Promise.all([
        listPayments({ generalOnly: true }),
        listPaymentItemTypes({ onlyActive: true }),
        listHouses(),
        listPartners({ onlyActive: true }),
        getSetupConfig().catch(() => ({})),
      ])

      setPayments(paymentRows || [])
      setItems(itemRows || [])
      setHouses((houseRows || []).slice().sort((a, b) => {
        const soiCompare = String(a?.soi || '').localeCompare(String(b?.soi || ''), 'th', { numeric: true, sensitivity: 'base' })
        if (soiCompare !== 0) return soiCompare
        return compareHouseNo(a?.house_no, b?.house_no)
      }))
      setPartners(partnerRows || [])
      setSetup(setupConfig || {})
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPageData()
  }, [])

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const years = new Set([currentYear])
    payments.forEach((payment) => {
      const paidAt = payment?.paid_at ? new Date(payment.paid_at) : null
      if (paidAt && !Number.isNaN(paidAt.getTime())) years.add(paidAt.getFullYear())
    })
    return [...years].sort((a, b) => b - a)
  }, [payments])

  const summary = useMemo(() => {
    const residentCount = payments.filter((payment) => payment.payer_type !== 'external').length
    const externalCount = payments.filter((payment) => payment.payer_type === 'external').length
    const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    return {
      totalCount: payments.length,
      totalAmount,
      residentCount,
      externalCount,
    }
  }, [payments])

  const filteredPayments = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return payments.filter((payment) => {
      const paidAt = payment?.paid_at ? new Date(payment.paid_at) : null
      if (!paidAt || Number.isNaN(paidAt.getTime())) return false

      const yearMatches = yearFilter === 'all' || String(paidAt.getFullYear()) === String(yearFilter)
      const monthMatches = monthFilter === 'all' || String(paidAt.getMonth() + 1) === String(monthFilter)
      if (!yearMatches || !monthMatches) return false

      if (!keyword) return true

      const haystack = [
        getReceiptNo(payment),
        payment.houses?.soi,
        payment.houses?.house_no,
        payment.houses?.owner_name,
        payment.payer_name,
        payment.partners?.name,
        payment.payment_method,
        payment.note,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(keyword)
    })
  }, [payments, search, yearFilter, monthFilter])

  const selectedHouse = useMemo(
    () => houses.find((house) => String(house.id) === String(receiveForm.houseId)) || null,
    [houses, receiveForm.houseId],
  )

  const selectedPartner = useMemo(
    () => partners.find((partner) => String(partner.id) === String(receiveForm.partnerId)) || null,
    [partners, receiveForm.partnerId],
  )

  const receiveTotal = useMemo(
    () => receiveForm.selectedItems.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0),
    [receiveForm.selectedItems],
  )

  const detailTotal = useMemo(
    () => detailForm.selectedItems.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0),
    [detailForm.selectedItems],
  )

  const isDetailEditable = Boolean(detailTarget?.id && editableMap[detailTarget.id])

  const openReceiveModal = async () => {
    try {
      const itemRows = await listPaymentItemTypes({ onlyActive: true })
      setItems(itemRows || [])
    } catch {
      // Keep current options if setup fetch fails.
    }
    setReceiveForm(emptyForm())
    setShowReceiveModal(true)
  }

  const closeReceiveModal = () => {
    if (savingReceive) return
    setShowReceiveModal(false)
    setReceiveForm(emptyForm())
  }

  const addSelectedItem = (formSetter, formState) => {
    if (!formState.pendingItemId) return
    const item = items.find((row) => String(row.id) === String(formState.pendingItemId))
    if (!item) return

    formSetter((prev) => {
      if (prev.selectedItems.some((selectedItem) => String(selectedItem.item_key) === String(item.code || item.id))) {
        return { ...prev, pendingItemId: '' }
      }

      return {
        ...prev,
        pendingItemId: '',
        selectedItems: [
          ...prev.selectedItems,
          {
            item_key: item.code || `item_${prev.selectedItems.length + 1}`,
            item_label: item.label,
            due_amount: Number(item.default_amount || 0),
            paid_amount: Number(item.default_amount || 0),
          },
        ],
      }
    })
  }

  const handleItemAmountChange = (formSetter, index, field, value) => {
    formSetter((prev) => ({
      ...prev,
      selectedItems: prev.selectedItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        return {
          ...item,
          [field]: Number(value || 0),
        }
      }),
    }))
  }

  const handleItemLabelChange = (formSetter, index, value) => {
    formSetter((prev) => ({
      ...prev,
      selectedItems: prev.selectedItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        return {
          ...item,
          item_label: value,
        }
      }),
    }))
  }

  const removeSelectedItem = (formSetter, index) => {
    formSetter((prev) => ({
      ...prev,
      selectedItems: prev.selectedItems.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const buildReceiptHtml = (payment, { autoPrint = false, forCapture = false } = {}) => {
    const receiptNo = getReceiptNo(payment)
    const issueDate = formatDateTime(payment.verified_at || payment.paid_at)
    const houseNo = payment.houses?.house_no || '-'
    const ownerName = payment.payer_name || payment.houses?.owner_name || payment.partners?.name || '-'
    const invoiceLabel = 'รับชำระทั่วไป'
    const invoiceNo = '-'
    const totalAmount = Number(payment.amount || 0)
    const paymentDate = formatDateTime(payment.paid_at)
    const itemRows = getPaymentItemRows(payment)
    const totalPaid = itemRows.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0) || totalAmount
    const totalDue = itemRows.reduce((sum, row) => sum + Number(row.dueAmount || 0), 0) || totalPaid
    const totalOutstanding = Math.max(0, totalDue - totalPaid)
    const displayNote = String(payment.note || '').trim()
    const signatureSource = setup.juristicSignatureUrl || ''
    const renderTableRows = () => itemRows.map((row, index) => (`
      <tr>
        <td class="c">${index + 1}</td>
        <td>${row.label}</td>
        <td class="r">${Number(row.dueAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="r">${Number(row.paidAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `)).join('')

    const renderSheet = (copyLabel) => (`
      <div class="sheet page-break">
        <div class="head">
          <div class="brand">
            <img src="${setup.loginCircleLogoUrl || villageLogo}" alt="logo" />
            <div>
              <div class="doc">ใบเสร็จรับเงิน</div>
              <div class="village">${setup.villageName || 'Village Management System'}</div>
              <div class="sub">${setup.address || '-'}</div>
              <div class="sub">อ้างอิงใบแจ้งหนี้ ${invoiceNo}</div>
            </div>
          </div>
          <div class="doc-meta">
            <div><span>เลขที่ใบเสร็จ:</span> <strong>${receiptNo}</strong></div>
            <div><span>วันที่รับชำระ:</span> <strong>${paymentDate}</strong></div>
            <div><span>วันที่อนุมัติ:</span> <strong>${issueDate}</strong></div>
            <div class="copy-mark-row"><div class="copy-mark">${copyLabel}</div></div>
          </div>
        </div>

        <section class="box">
          <div class="grid">
            <div><span>บ้านเลขที่</span><strong>${houseNo}</strong></div>
            <div><span>ชื่อผู้ชำระ</span><strong>${ownerName}</strong></div>
            <div><span>รอบใบแจ้งหนี้</span><strong>${invoiceLabel}</strong></div>
            <div><span>วิธีชำระ</span><strong>${formatMethod(payment.payment_method)}</strong></div>
          </div>
        </section>

        <section class="box">
          <table>
            <thead>
              <tr>
                <th class="c" style="width:56px;">ลำดับ</th>
                <th>รายการ</th>
                <th class="r" style="width:170px;">ยอดที่ต้องชำระ (บาท)</th>
                <th class="r" style="width:170px;">ยอดชำระจริง (บาท)</th>
              </tr>
            </thead>
            <tbody>
              ${renderTableRows()}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" class="r"><strong>ยอดรวมที่ต้องชำระ</strong></td>
                <td class="r"><strong>${totalDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                <td class="r"><strong>${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
              </tr>
              <tr>
                <td colspan="3" class="r"><strong>ยอดคงค้างหลังชำระ</strong></td>
                <td class="r"><strong>${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
              </tr>
            </tfoot>
          </table>
          <div class="note-box">ยอดชำระรวม ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท (${toThaiBahtText(totalPaid)})</div>
          ${displayNote ? `<div class="note-box">${displayNote}</div>` : ''}
        </section>

        <section class="foot">
          <div class="note">
            ออกใบเสร็จหลังจากตรวจสอบการชำระเรียบร้อยแล้ว<br />
            บัญชีอ้างอิง ${setup.bankAccountName || '-'} ${setup.bankAccountNo || ''}
          </div>
          <div class="sign-wrap">
            ${signatureSource ? `<img src="${signatureSource}" alt="juristic-signature" class="sign-img" />` : ''}
            <div class="sign-line"></div>
            <div>ผู้ตรวจสอบ / ผู้ออกใบเสร็จ</div>
          </div>
        </section>
      </div>
    `)

    return `
      <html>
        <head>
          <title>ใบเสร็จรับเงิน ${receiptNo}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700&display=swap" rel="stylesheet">
          <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; }
            html, body { font-family: 'Sarabun', 'TH Sarabun New', Tahoma, sans-serif; margin: 0; padding: 0; color: #111827; background: #fff; }
            .sheet { position: relative; width: ${forCapture ? '794px' : '100%'}; ${forCapture ? 'height: 1122px; overflow: hidden;' : 'page-break-after: always; break-after: page; break-inside: avoid;'} background: #fff; padding: 24px 28px; display: flex; flex-direction: column; gap: 8px; }
            .head { display: flex; justify-content: space-between; gap: 12px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; background: #ffffff; }
            .brand { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }
            .brand img { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; border: 1px solid #cbd5e1; }
            .doc { font-size: 16px; font-weight: 700; line-height: 1.3; }
            .village { font-size: 11px; margin-top: 3px; font-weight: 600; }
            .sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
            .doc-meta { font-size: 10px; min-width: 200px; display: flex; flex-direction: column; gap: 2px; word-break: break-word; }
            .doc-meta span { color: #6b7280; font-weight: 500; }
            .copy-mark-row { display: flex; justify-content: flex-end; margin-top: 10px; }
            .copy-mark { border: none; border-radius: 4px; padding: 3px 10px; text-align: center; font-size: 14px; font-weight: 700; line-height: 1.3; color: #0c4a6e; background: transparent; }
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
            tfoot td { background: #f8fafc; font-weight: 700; }
            .note-box { border-top: 1px dashed #d1d5db; padding-top: 4px; font-size: 10px; color: #4b5563; margin-top: 4px; }
            .foot { margin-top: 8px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; background: #f9fafb; }
            .note { font-size: 9px; color: #64748b; line-height: 1.4; }
            .sign-wrap { min-width: 180px; text-align: center; font-size: 9px; color: #64748b; }
            .sign-img { max-width: 160px; max-height: 52px; width: auto; height: auto; display: block; margin: 0 auto 6px; object-fit: contain; }
            .sign-line { border-top: 1px solid #cbd5e1; margin: 36px 0 4px; }
            @media print {
              html, body { background: #fff; }
              .sheet { page-break-after: always; break-after: page; break-inside: avoid; }
              .sheet:last-child { page-break-after: avoid; break-after: avoid; }
            }
          </style>
        </head>
        <body>
          ${renderSheet('ต้นฉบับ')}
          ${renderSheet('สำเนา')}
          ${autoPrint ? '<script>window.onload = () => window.print();</script>' : ''}
        </body>
      </html>
    `
  }

  const renderReceiptsInIframe = async (html, sheetCount = 2) => {
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
      sheets: Array.from(doc.querySelectorAll('.sheet')),
    }
  }

  const handlePrintReceipt = (payment) => {
    setReceiptPrintTarget(payment)
    setShowReceiptPrintActionModal(true)
  }

  const runReceiptPrintAction = async (mode) => {
    if (!receiptPrintTarget) return
    setRunningReceiptPrintAction(true)

    try {
      const target = receiptPrintTarget
      const fileLabel = `receipt-${getReceiptNo(target)}`
      if (mode === 'paper') {
        const html = buildReceiptHtml(target, { autoPrint: true })
        const popup = openHtmlInWindow(html)
        if (!popup) {
          await Swal.fire({ icon: 'warning', title: 'ไม่สามารถเปิดหน้าต่างพิมพ์ได้', text: 'กรุณาอนุญาต popup ของเบราว์เซอร์' })
        }
        setShowReceiptPrintActionModal(false)
        return
      }

      const html = buildReceiptHtml(target, { autoPrint: false, forCapture: true })
      const { iframe, sheets } = await renderReceiptsInIframe(html, 2)
      if (sheets.length === 0) {
        document.body.removeChild(iframe)
        throw new Error('ไม่พบหน้าสำหรับพิมพ์ใบเสร็จ')
      }

      if (mode === 'image') {
        for (let index = 0; index < sheets.length; index += 1) {
          const canvas = await html2canvas(sheets[index], {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: 794,
            height: 1122,
          })
          const link = document.createElement('a')
          link.href = canvas.toDataURL('image/png')
          link.download = `${fileLabel}-${index + 1}.png`
          link.click()
        }
      } else {
        const pdf = new jsPDF('p', 'mm', 'a4')
        for (let index = 0; index < sheets.length; index += 1) {
          const canvas = await html2canvas(sheets[index], {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: 794,
            height: 1122,
          })
          const imageData = canvas.toDataURL('image/jpeg', 1)
          if (index > 0) pdf.addPage()
          pdf.addImage(imageData, 'JPEG', 0, 0, 210, 297)
        }
        pdf.save(`${fileLabel}.pdf`)
      }

      document.body.removeChild(iframe)
      setShowReceiptPrintActionModal(false)
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'พิมพ์ใบเสร็จไม่สำเร็จ', text: error.message })
    } finally {
      setRunningReceiptPrintAction(false)
    }
  }

  const handleSubmitReceive = async (event) => {
    event.preventDefault()

    if (receiveForm.selectedItems.length === 0) {
      await Swal.fire({ icon: 'warning', title: 'ยังไม่มีรายการรับชำระ', text: 'กรุณาเลือกรายการอย่างน้อย 1 รายการ' })
      return
    }

    if (receiveForm.payerType === 'resident' && !receiveForm.houseId) {
      await Swal.fire({ icon: 'warning', title: 'กรุณาเลือกบ้าน', text: 'ต้องระบุบ้านผู้ชำระก่อนบันทึก' })
      return
    }

    if (receiveForm.payerType === 'external' && !receiveForm.partnerId) {
      await Swal.fire({ icon: 'warning', title: 'กรุณาเลือกคู่ค้า', text: 'ต้องระบุคู่ค้าภายนอกจากหน้าตั้งค่า' })
      return
    }

    const paidAtIso = receiveForm.paidAt ? new Date(receiveForm.paidAt).toISOString() : new Date().toISOString()
    const payload = {
      fee_id: null,
      house_id: receiveForm.payerType === 'resident' ? receiveForm.houseId : null,
      amount: receiveTotal,
      payment_method: receiveForm.paymentMethod,
      paid_at: paidAtIso,
      note: receiveForm.note?.trim() || null,
      payer_type: receiveForm.payerType,
      payer_name: receiveForm.payerType === 'external' ? selectedPartner?.name : selectedHouse?.owner_name,
      payer_contact: receiveForm.payerType === 'external' ? selectedPartner?.phone : null,
      payer_tax_id: receiveForm.payerType === 'external' ? selectedPartner?.tax_id : null,
      payer_address: receiveForm.payerType === 'external' ? selectedPartner?.address : null,
      partner_id: receiveForm.payerType === 'external' ? selectedPartner?.id : null,
      verified_by: profile?.id || null,
      verified_at: new Date().toISOString(),
      payment_items: receiveForm.selectedItems.map((item, index) => ({
        item_key: item.item_key || `item_${index + 1}`,
        item_label: item.item_label,
        due_amount: Number(item.due_amount || 0),
        paid_amount: Number(item.paid_amount || 0),
      })),
    }

    setSavingReceive(true)
    try {
      const created = await createPayment(payload)
      const paidDate = new Date(created.paid_at || paidAtIso)
      setYearFilter(String(paidDate.getFullYear()))
      setMonthFilter(String(paidDate.getMonth() + 1))
      await loadPageData()
      setReceiveForm(emptyForm())
      setReceiptPrintTarget(created)
      setShowReceiptPrintActionModal(true)
      await Swal.fire({ icon: 'success', title: 'บันทึกรับชำระเรียบร้อย (อนุมัติอัตโนมัติ)', timer: 1400, showConfirmButton: false })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'บันทึกรับชำระไม่สำเร็จ', text: error.message })
    } finally {
      setSavingReceive(false)
    }
  }

  const openDetail = (payment) => {
    setDetailTarget(payment)
    setDetailForm(mapPaymentToEditForm(payment))
  }

  const toggleEditable = (payment) => {
    setEditableMap((prev) => {
      const nextValue = !prev[payment.id]
      const next = { ...prev, [payment.id]: nextValue }
      return next
    })
  }

  const handleUpdatePayment = async () => {
    if (!detailTarget) return
    if (!isDetailEditable) {
      await Swal.fire({ icon: 'warning', title: 'ยังแก้ไขไม่ได้', text: 'กรุณากดปุ่มเปลี่ยนสถานะเพื่อแก้ไขก่อน' })
      return
    }
    if (detailForm.selectedItems.length === 0) {
      await Swal.fire({ icon: 'warning', title: 'ยังไม่มีรายการรับชำระ', text: 'กรุณาเลือกรายการอย่างน้อย 1 รายการ' })
      return
    }

    const selectedDetailPartner = partners.find((partner) => String(partner.id) === String(detailForm.partnerId)) || null
    const selectedDetailHouse = houses.find((house) => String(house.id) === String(detailForm.houseId)) || null

    setSavingEdit(true)
    try {
      const payload = {
        fee_id: null,
        house_id: detailForm.payerType === 'resident' ? detailForm.houseId : null,
        amount: detailTotal,
        payment_method: detailForm.paymentMethod,
        paid_at: detailForm.paidAt ? new Date(detailForm.paidAt).toISOString() : new Date().toISOString(),
        note: detailForm.note?.trim() || null,
        payer_type: detailForm.payerType,
        payer_name: detailForm.payerType === 'external' ? selectedDetailPartner?.name : selectedDetailHouse?.owner_name,
        payer_contact: detailForm.payerType === 'external' ? selectedDetailPartner?.phone : null,
        payer_tax_id: detailForm.payerType === 'external' ? selectedDetailPartner?.tax_id : null,
        payer_address: detailForm.payerType === 'external' ? selectedDetailPartner?.address : null,
        partner_id: detailForm.payerType === 'external' ? selectedDetailPartner?.id : null,
        verified_by: profile?.id || null,
        verified_at: new Date().toISOString(),
        payment_items: detailForm.selectedItems.map((item, index) => ({
          item_key: item.item_key || `item_${index + 1}`,
          item_label: item.item_label,
          due_amount: Number(item.due_amount || 0),
          paid_amount: Number(item.paid_amount || 0),
        })),
      }

      const updated = await updatePayment(detailTarget.id, payload)
      setPayments((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
      setDetailTarget(updated)
      setDetailForm(mapPaymentToEditForm(updated))
      setEditableMap((prev) => ({ ...prev, [updated.id]: false }))
      await Swal.fire({ icon: 'success', title: 'แก้ไขรายการเรียบร้อย', timer: 1200, showConfirmButton: false })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'แก้ไขไม่สำเร็จ', text: error.message })
    } finally {
      setSavingEdit(false)
    }
  }

  const getStatusBadge = (payment) => {
    if (editableMap[payment?.id]) return { className: 'bd b-wn', label: 'พร้อมแก้ไข' }
    return { className: 'bd b-ok', label: 'ออกใบเสร็จแล้ว' }
  }

  const handleSearch = async () => {
    await loadPageData()
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
              <div className="ph-h1">รับชำระเงิน</div>
              <div className="ph-sub">แยกจากหน้าชำระค่าส่วนกลาง และอนุมัติอัตโนมัติเมื่อบันทึก</div>
            </div>
          </div>
        </div>

      </div>

      <div className="card report-filter-card admin-search-filter-card">
        <div className="cb">
        <div className="houses-filter-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            className="houses-filter-input"
            placeholder="ค้นหาเลขที่ใบเสร็จ / ซอย / บ้าน / ผู้ชำระ / วิธีชำระ"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ flex: '1 1 240px', minWidth: 0 }}
          />
          <button className="btn btn-p btn-sm" onClick={handleSearch} disabled={loading} style={{ height: '34px' }}>ค้นหา</button>
          <StyledSelect value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} style={{ width: 180 }}>
            <option value="all">ทุกปี</option>
            {yearOptions.map((year) => (
              <option key={year} value={String(year)}>{year + 543}</option>
            ))}
          </StyledSelect>
          <StyledSelect value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} style={{ width: 160 }}>
            <option value="all">ทุกเดือน</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={String(month)}>
                {new Date(2000, month - 1, 1).toLocaleString('th-TH', { month: 'long' })}
              </option>
            ))}
          </StyledSelect>
          <button className="btn btn-g btn-sm" onClick={loadPageData} disabled={loading} style={{ height: '34px' }}>รีเฟรช</button>
        </div>
        </div>
      </div>

      {!showReceiveModal && (
        <>
      <div className="stats">
        <div className="sc"><div className="sc-ico a">🧾</div><div><div className="sc-v">{summary.totalCount}</div><div className="sc-l">รายการรับชำระทั้งหมด</div></div></div>
        <div className="sc"><div className="sc-ico p">💵</div><div><div className="sc-v">฿{formatMoney(summary.totalAmount)}</div><div className="sc-l">ยอดรับชำระทั้งหมด</div></div></div>
        <div className="sc"><div className="sc-ico d">🏠</div><div><div className="sc-v">{summary.residentCount}</div><div className="sc-l">ผู้ชำระเป็นลูกบ้าน</div></div></div>
        <div className="sc"><div className="sc-ico d">🏢</div><div><div className="sc-v">{summary.externalCount}</div><div className="sc-l">ผู้ชำระภายนอก</div></div></div>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">รายการรับชำระ {filteredPayments.length} รายการ</div>
          <div className="houses-list-actions">
            <button className="btn btn-p btn-sm" onClick={openReceiveModal}>+ เพิ่มการรับชำระ</button>
            <button className="btn btn-g btn-sm" onClick={loadPageData} disabled={loading}>รีเฟรช</button>
          </div>
        </div>
        <div className="cb houses-table-card-body houses-main-body">
          <div className="houses-table-wrap houses-desktop-only payments-main-wrap">
            <table className="tw houses-table houses-main-table" style={{ width: '100%', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>เลขที่ใบเสร็จ</th>
                  <th style={{ width: '8%' }}>ซอย</th>
                  <th style={{ width: '8%' }}>บ้าน</th>
                  <th style={{ width: '16%' }}>ผู้ชำระ</th>
                  <th style={{ width: '11%' }}>จำนวนเงิน</th>
                  <th style={{ width: '10%' }}>วิธีชำระ</th>
                  <th style={{ width: '12%' }}>วันที่</th>
                  <th style={{ width: '10%' }}>สถานะ</th>
                  <th style={{ width: '20%' }}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>กำลังโหลดข้อมูล...</td></tr>
                ) : filteredPayments.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>ยังไม่มีรายการรับชำระ</td></tr>
                ) : (
                  filteredPayments.map((payment) => {
                    const badge = getStatusBadge(payment)
                    const payerName = payment.payer_name || payment.houses?.owner_name || payment.partners?.name || '-'
                    return (
                      <tr key={payment.id}>
                        <td>{getReceiptNo(payment)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{payment.houses?.soi || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{payment.houses?.house_no || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{payerName}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>฿{formatMoney(payment.amount)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatMethod(payment.payment_method)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(payment.paid_at)}</td>
                        <td><span className={badge.className}>{badge.label}</span></td>
                        <td>
                          <div className="td-acts payments-row-acts">
                            <button className="btn btn-xs btn-g" onClick={() => openDetail(payment)}>รายละเอียด</button>
                            <button className="btn btn-xs btn-o" onClick={() => toggleEditable(payment)}>{editableMap[payment.id] ? 'ล็อกแก้ไข' : 'เปลี่ยนสถานะเพื่อแก้ไข'}</button>
                            <button className="btn btn-xs btn-a" onClick={() => handlePrintReceipt(payment)}>ใบเสร็จ</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="houses-mobile-only" style={{ gap: 10, padding: '4px 0' }}>
            {loading ? (
              <div className="mcard-empty">กำลังโหลดข้อมูล...</div>
            ) : filteredPayments.length === 0 ? (
              <div className="mcard-empty">ยังไม่มีรายการรับชำระ</div>
            ) : filteredPayments.map((payment) => {
              const badge = getStatusBadge(payment)
              const payerName = payment.payer_name || payment.houses?.owner_name || payment.partners?.name || '-'
              const itemCount = Array.isArray(payment.payment_items) ? payment.payment_items.length : 0
              return (
                <div key={`mobile-${payment.id}`} className="houses-mcard">
                  <div className="houses-mcard-top">
                    <div>
                      <div className="houses-mcard-no">{getReceiptNo(payment)}</div>
                      <div className="mcard-sub">{payment.houses?.soi ? `ซอย ${payment.houses.soi}` : '-'} · บ้าน {payment.houses?.house_no || '-'}</div>
                    </div>
                    <span className={`${badge.className} houses-mcard-badge`}>{badge.label}</span>
                  </div>
                  <div className="houses-mcard-owner">{payerName}</div>
                  <div className="mcard-meta" style={{ marginTop: 4 }}>
                    <span><span className="mcard-label">จำนวนเงิน</span> ฿{formatMoney(payment.amount)}</span>
                    <span><span className="mcard-label">วิธีชำระ</span> {formatMethod(payment.payment_method)}</span>
                    <span><span className="mcard-label">วันที่</span> {formatDateTime(payment.paid_at)}</span>
                    <span><span className="mcard-label">รายการ</span> {itemCount}</span>
                  </div>
                  <div className="mcard-actions">
                    <button className="btn btn-xs btn-g" onClick={() => openDetail(payment)}>รายละเอียด</button>
                    <button className="btn btn-xs btn-o" onClick={() => toggleEditable(payment)}>{editableMap[payment.id] ? 'ล็อกแก้ไข' : 'เปลี่ยนสถานะเพื่อแก้ไข'}</button>
                    <button className="btn btn-xs btn-a" onClick={() => handlePrintReceipt(payment)}>ใบเสร็จ</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
        </>
      )}

      {showReceiveModal && (
        <div className="card">
          <div className="ch houses-list-head houses-main-head">
            <div>
              <div className="ct">สร้างรายการรับชำระเงิน</div>
              <div className="ph-sub" style={{ marginTop: 4 }}>ค่าอื่นๆ นอกเหนือจากค่าส่วนกลาง (อนุมัติอัตโนมัติ)</div>
            </div>
            <div className="houses-list-actions">
              <button className="btn btn-g btn-sm" onClick={closeReceiveModal} disabled={savingReceive}>← Back</button>
            </div>
          </div>
          <div className="cb houses-table-card-body houses-main-body">
            <form onSubmit={handleSubmitReceive}>
              <div style={{ padding: 12 }}>
                <section className="house-sec">
                  <div className="house-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label className="house-field">
                      <span>ประเภทผู้ชำระ *</span>
                      <StyledSelect value={receiveForm.payerType} onChange={(event) => setReceiveForm((prev) => ({ ...prev, payerType: event.target.value, houseId: '', partnerId: '' }))}>
                        <option value="resident">ลูกบ้าน</option>
                        <option value="external">บุคคลภายนอก</option>
                      </StyledSelect>
                    </label>
                    {receiveForm.payerType === 'resident' ? (
                      <label className="house-field">
                        <span>บ้าน *</span>
                        <StyledSelect value={receiveForm.houseId} onChange={(event) => setReceiveForm((prev) => ({ ...prev, houseId: event.target.value }))}>
                          <option value="">เลือกบ้าน</option>
                          {houses.map((house) => (
                            <option key={house.id} value={house.id}>{house.soi || '-'} · {house.house_no || '-'} · {house.owner_name || '-'}</option>
                          ))}
                        </StyledSelect>
                      </label>
                    ) : (
                      <label className="house-field">
                        <span>คู่ค้า/ผู้ชำระภายนอก *</span>
                        <StyledSelect value={receiveForm.partnerId} onChange={(event) => setReceiveForm((prev) => ({ ...prev, partnerId: event.target.value }))}>
                          <option value="">เลือกคู่ค้า</option>
                          {partners.map((partner) => (
                            <option key={partner.id} value={partner.id}>{partner.name}</option>
                          ))}
                        </StyledSelect>
                      </label>
                    )}
                    <label className="house-field">
                      <span>วิธีชำระ *</span>
                      <StyledSelect value={receiveForm.paymentMethod} onChange={(event) => setReceiveForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}>
                        <option value="transfer">โอนเงิน</option>
                        <option value="cash">เงินสด</option>
                        <option value="qr">QR</option>
                      </StyledSelect>
                    </label>
                    <label className="house-field">
                      <span>วันเวลา *</span>
                      <input type="datetime-local" value={receiveForm.paidAt} onChange={(event) => setReceiveForm((prev) => ({ ...prev, paidAt: event.target.value }))} />
                    </label>

                    <div className="house-field" style={{ gap: 10, gridColumn: '1 / -1' }}>
                      <span>เลือกรายการรับชำระ</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <StyledSelect value={receiveForm.pendingItemId} onChange={(event) => setReceiveForm((prev) => ({ ...prev, pendingItemId: event.target.value }))} style={{ flex: '1 1 280px' }}>
                          <option value="">เลือกรายการจาก setup</option>
                          {items.map((item) => (
                            <option key={item.id} value={item.id}>{item.label} · ฿{formatMoney(item.default_amount)}</option>
                          ))}
                        </StyledSelect>
                        <button type="button" className="btn btn-xs btn-a" onClick={() => addSelectedItem(setReceiveForm, receiveForm)}>เพิ่มรายการ</button>
                      </div>
                      <div className="houses-table-wrap payments-receive-wrap" style={{ maxHeight: '280px', overflow: 'auto' }}>
                        <table className="tw receive-items-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '44px', textAlign: 'center' }}>#</th>
                              <th>รายการ</th>
                              <th style={{ width: '170px' }}>ยอดที่ต้องชำระ</th>
                              <th style={{ width: '170px' }}>ยอดชำระจริง</th>
                              <th style={{ width: '72px' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {receiveForm.selectedItems.length === 0 ? (
                              <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--mu)', padding: '14px' }}>ยังไม่มีรายการรับชำระ</td></tr>
                            ) : receiveForm.selectedItems.map((item, index) => (
                              <tr key={`${item.item_key}-${index}`}>
                                <td style={{ textAlign: 'center' }}>{index + 1}</td>
                                <td>{item.item_label}</td>
                                <td><input type="number" min="0" step="0.01" value={item.due_amount} onChange={(event) => handleItemAmountChange(setReceiveForm, index, 'due_amount', event.target.value)} style={{ width: '100%' }} /></td>
                                <td><input type="number" min="0" step="0.01" value={item.paid_amount} onChange={(event) => handleItemAmountChange(setReceiveForm, index, 'paid_amount', event.target.value)} style={{ width: '100%' }} /></td>
                                <td><button type="button" className="btn btn-xs btn-dg" onClick={() => removeSelectedItem(setReceiveForm, index)}>ลบ</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', color: 'var(--mu)', fontSize: 13 }}>
                        <span>จำนวนรายการ {receiveForm.selectedItems.length} รายการ</span>
                        <span style={{ fontWeight: 700, color: 'var(--tx)' }}>ยอดรับชำระรวม: ฿{formatMoney(receiveTotal)}</span>
                      </div>
                    </div>

                    <label className="house-field" style={{ gridColumn: '1 / -1' }}>
                      <span>หมายเหตุ</span>
                      <textarea rows="2" value={receiveForm.note} onChange={(event) => setReceiveForm((prev) => ({ ...prev, note: event.target.value }))} placeholder="รายละเอียดเพิ่มเติม" style={{ minHeight: 60, maxHeight: 60 }} />
                    </label>
                  </div>
                </section>
              </div>
              <div className="house-md-foot" style={{ padding: '8px 0 0 0' }}>
                <button className="btn btn-g" type="button" onClick={closeReceiveModal} disabled={savingReceive}>← Back</button>
                <button className="btn btn-p" type="submit" disabled={savingReceive}>{savingReceive ? 'กำลังบันทึก...' : 'บันทึกรับชำระ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailTarget && (
        <div className="house-mo">
          <div className="house-md house-md--md">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">รายละเอียดการรับชำระ</div>
                <div className="house-md-sub">เลขที่ใบเสร็จ {getReceiptNo(detailTarget)} · {isDetailEditable ? 'แก้ไขได้' : 'อ่านอย่างเดียว'}</div>
              </div>
            </div>
            <div className="house-md-body">
              <section className="house-sec">
                <div className="house-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label className="house-field"><span>ผู้ชำระ (ชื่อ)</span><input disabled={!isDetailEditable} value={detailForm.payerType === 'external' ? (partners.find((p) => String(p.id) === String(detailForm.partnerId))?.name || '') : (houses.find((h) => String(h.id) === String(detailForm.houseId))?.owner_name || '')} readOnly /></label>
                  <label className="house-field"><span>วิธีชำระ</span><StyledSelect disabled={!isDetailEditable} value={detailForm.paymentMethod} onChange={(event) => setDetailForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}><option value="transfer">โอนเงิน</option><option value="cash">เงินสด</option><option value="qr">QR</option></StyledSelect></label>
                  <label className="house-field"><span>วันที่ชำระ</span><input disabled={!isDetailEditable} type="datetime-local" value={detailForm.paidAt} onChange={(event) => setDetailForm((prev) => ({ ...prev, paidAt: event.target.value }))} /></label>
                  <label className="house-field"><span>จำนวนเงินรวม</span><input value={formatMoney(detailTotal)} readOnly /></label>
                </div>
              </section>

              <section className="house-sec">
                <div className="house-field" style={{ gap: 8 }}>
                  <span>รายการชำระ</span>
                  {isDetailEditable && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <StyledSelect value={detailForm.pendingItemId} onChange={(event) => setDetailForm((prev) => ({ ...prev, pendingItemId: event.target.value }))} style={{ flex: '1 1 280px' }}>
                        <option value="">เลือกรายการจาก setup</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>{item.label} · ฿{formatMoney(item.default_amount)}</option>
                        ))}
                      </StyledSelect>
                      <button type="button" className="btn btn-xs btn-a" onClick={() => addSelectedItem(setDetailForm, detailForm)}>เพิ่มรายการ</button>
                    </div>
                  )}
                  <div className="houses-table-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
                    <table className="tw" style={{ width: '100%', minWidth: 560 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 60, textAlign: 'center' }}>ลำดับ</th>
                          <th>รายการ</th>
                          <th style={{ width: 170 }}>ยอดที่ต้องชำระ</th>
                          <th style={{ width: 170 }}>ยอดชำระจริง</th>
                          {isDetailEditable && <th style={{ width: 72 }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {detailForm.selectedItems.map((row, index) => (
                          <tr key={`${detailTarget.id}-${row.item_key}-${index}`}>
                            <td style={{ textAlign: 'center' }}>{index + 1}</td>
                            <td>{isDetailEditable ? <input value={row.item_label} onChange={(event) => handleItemLabelChange(setDetailForm, index, event.target.value)} style={{ width: '100%' }} /> : row.item_label}</td>
                            <td>{isDetailEditable ? <input type="number" min="0" step="0.01" value={row.due_amount} onChange={(event) => handleItemAmountChange(setDetailForm, index, 'due_amount', event.target.value)} style={{ width: '100%' }} /> : `฿${formatMoney(row.due_amount)}`}</td>
                            <td>{isDetailEditable ? <input type="number" min="0" step="0.01" value={row.paid_amount} onChange={(event) => handleItemAmountChange(setDetailForm, index, 'paid_amount', event.target.value)} style={{ width: '100%' }} /> : `฿${formatMoney(row.paid_amount)}`}</td>
                            {isDetailEditable && <td><button type="button" className="btn btn-xs btn-dg" onClick={() => removeSelectedItem(setDetailForm, index)}>ลบ</button></td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="house-sec">
                <label className="house-field">
                  <span>หมายเหตุ</span>
                  <textarea disabled={!isDetailEditable} rows="2" value={detailForm.note} onChange={(event) => setDetailForm((prev) => ({ ...prev, note: event.target.value }))} />
                </label>
              </section>
            </div>
            <div className="house-md-foot">
              <button className="btn btn-g" type="button" onClick={() => setDetailTarget(null)}>ปิด</button>
              <button className="btn btn-o" type="button" onClick={() => { if (detailTarget) toggleEditable(detailTarget) }}>{isDetailEditable ? 'ล็อกแก้ไข' : 'เปลี่ยนสถานะเพื่อแก้ไข'}</button>
              {isDetailEditable && <button className="btn btn-p" type="button" disabled={savingEdit} onClick={handleUpdatePayment}>{savingEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</button>}
              <button className="btn btn-a" type="button" onClick={() => handlePrintReceipt(detailTarget)}>ใบเสร็จ</button>
            </div>
          </div>
        </div>
      )}

      {showReceiptPrintActionModal && receiptPrintTarget && (
        <div className="house-mo">
          <div className="house-md house-md--xs">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">ตัวเลือกการพิมพ์</div>
                <div className="house-md-sub">ใบเสร็จ {getReceiptNo(receiptPrintTarget)}</div>
              </div>
            </div>
            <div className="house-md-body" style={{ display: 'grid', gap: 10 }}>
              <button className="btn btn-p" type="button" onClick={() => runReceiptPrintAction('paper')} disabled={runningReceiptPrintAction}>พิมพ์เอกสาร</button>
              <button className="btn btn-a" type="button" onClick={() => runReceiptPrintAction('pdf')} disabled={runningReceiptPrintAction}>Save เป็น PDF</button>
              <button className="btn btn-g" type="button" onClick={() => runReceiptPrintAction('image')} disabled={runningReceiptPrintAction}>Save เป็น Image</button>
            </div>
            <div className="house-md-foot">
              <button className="btn btn-g" type="button" onClick={() => setShowReceiptPrintActionModal(false)} disabled={runningReceiptPrintAction}>ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}