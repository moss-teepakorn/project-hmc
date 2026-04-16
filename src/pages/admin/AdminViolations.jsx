import React, { useEffect, useMemo, useRef, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import Swal from 'sweetalert2'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import villageLogo from '../../assets/village-logo.svg'
import juristicSignature from '../../assets/juristic-signature.svg'
import { listHouses } from '../../lib/houses'
import { getSystemConfig } from '../../lib/systemConfig'
import {
  createViolation,
  deleteViolation,
  deleteViolationImagesByPaths,
  generateNextViolationReportNo,
  listViolationImages,
  listViolations,
  updateViolation,
  uploadViolationImages,
} from '../../lib/violations'

const VIOLATION_TYPES = [
  'จอดรถขวาง', 'เสียงดังรบกวน', 'ทิ้งขยะผิดที่', 'สัตว์เลี้ยงหลุดออก',
  'ก่อความวุ่นวาย', 'ดัดแปลงโครงสร้าง', 'ต่อเติมโดยไม่ได้รับอนุญาต', 'อื่นๆ',
]

const EMPTY_FORM = {
  house_id: '',
  type: 'จอดรถขวาง',
  type_other: '',
  detail: '',
  occurred_at: '',
  status: 'new',
  due_date: '',
  report_no: '',
  report_date: '',
  warning_count: '0',
  fine_amount: '0',
  admin_note: '',
  resident_note: '',
}

const MAX_ATTACHMENTS = 5
const MAX_IMAGE_SIZE_BYTES = 100 * 1024
const MAX_IMAGE_TARGET_BYTES = 95 * 1024

function blurActiveElement() {
  const el = document.activeElement
  if (el instanceof HTMLElement) el.blur()
}

function showSwal(options) {
  blurActiveElement()
  return Swal.fire({ returnFocus: false, ...options })
}

const DEFAULT_REPORT_IDENTITY = {
  village_name: 'The Greenfield',
  juristic_name: 'นิติบุคคลหมู่บ้านเดอะกรีนฟิลด์',
  juristic_signature_url: '',
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isSvgSource(value) {
  const src = String(value || '').toLowerCase()
  return src.startsWith('data:image/svg+xml') || src.endsWith('.svg')
}

async function loadImageElement(url) {
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = objectUrl
    })
    URL.revokeObjectURL(objectUrl)
    return image
  } catch {
    return null
  }
}

function wrapTextByWidth(ctx, text, maxWidth) {
  const normalized = String(text || '-').replace(/\s+/g, ' ').trim() || '-'
  const lines = []
  let buffer = ''
  for (const char of normalized) {
    const testLine = `${buffer}${char}`
    if (ctx.measureText(testLine).width <= maxWidth || buffer.length === 0) {
      buffer = testLine
    } else {
      lines.push(buffer)
      buffer = char
    }
  }
  if (buffer) lines.push(buffer)
  return lines
}

function drawImageContain(ctx, image, x, y, width, height) {
  if (!image) {
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(x, y, width, height)
    ctx.fillStyle = '#6b7280'
    ctx.font = '28px Arial, Helvetica, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('ไม่มีรูปแนบ', x + (width / 2), y + (height / 2))
    ctx.textAlign = 'left'
    return
  }

  const imageRatio = image.width / image.height
  const boxRatio = width / height
  let drawWidth = width
  let drawHeight = height
  if (imageRatio > boxRatio) {
    drawHeight = width / imageRatio
  } else {
    drawWidth = height * imageRatio
  }
  const drawX = x + ((width - drawWidth) / 2)
  const drawY = y + ((height - drawHeight) / 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, width, height)
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
}

function drawImageContainWithInsetCrop(ctx, image, x, y, width, height, insetRatio = 0.08) {
  if (!image) return
  const srcInsetX = Math.floor(image.width * insetRatio)
  const srcInsetY = Math.floor(image.height * insetRatio)
  const srcWidth = Math.max(1, image.width - (srcInsetX * 2))
  const srcHeight = Math.max(1, image.height - (srcInsetY * 2))

  const srcRatio = srcWidth / srcHeight
  const boxRatio = width / height
  let drawWidth = width
  let drawHeight = height
  if (srcRatio > boxRatio) {
    drawHeight = width / srcRatio
  } else {
    drawWidth = height * srcRatio
  }

  const drawX = x + ((width - drawWidth) / 2)
  const drawY = y + ((height - drawHeight) / 2)
  ctx.drawImage(image, srcInsetX, srcInsetY, srcWidth, srcHeight, drawX, drawY, drawWidth, drawHeight)
}

function prepareSignatureImageForPdf(image) {
  if (!image) return null
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return image

  ctx.drawImage(image, 0, 0)
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imgData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 12) continue

    const isRedBorderLike = r > 150 && g < 125 && b < 125
    if (isRedBorderLike) {
      data[i + 3] = 0
      continue
    }

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    if (luminance > 242) {
      data[i + 3] = 0
      continue
    }

    data[i] = 18
    data[i + 1] = 18
    data[i + 2] = 18
  }

  ctx.putImageData(imgData, 0, 0)
  return canvas
}

async function buildCleanedSignatureSource(source) {
  if (!source || isSvgSource(source)) return source
  const image = await loadImageElement(source)
  if (!image) return source
  const cleanedCanvas = prepareSignatureImageForPdf(image)
  if (!cleanedCanvas || typeof cleanedCanvas.toDataURL !== 'function') return source
  return cleanedCanvas.toDataURL('image/png')
}

const AdminViolations = () => {
  const [violations, setViolations] = useState([])
  const [houses, setHouses] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [attachments, setAttachments] = useState([])
  const [removedImagePaths, setRemovedImagePaths] = useState([])
  const [reportIdentity, setReportIdentity] = useState(DEFAULT_REPORT_IDENTITY)
  const [showPrintPreviewModal, setShowPrintPreviewModal] = useState(false)
  const [printPreviewHtml, setPrintPreviewHtml] = useState('')
  const [printPreviewTitle, setPrintPreviewTitle] = useState('รายงานการกระทำผิด')
  const printPreviewIframeRef = useRef(null)

  const houseOptions = useMemo(() => ([
    { value: '', label: 'เลือกบ้าน' },
    ...houses.map((h) => ({
      value: h.id,
      label: `ซอย ${h.soi || '-'} • ${h.house_no}${h.owner_name ? ` - ${h.owner_name}` : ''}`,
    })),
  ]), [houses])

  const loadData = async (override = {}) => {
    try {
      setLoading(true)
      const [vioData, houseData] = await Promise.all([
        listViolations({ status: override.status ?? statusFilter, search: override.search ?? searchTerm }),
        houses.length === 0 ? listHouses() : Promise.resolve(houses),
      ])
      setViolations(vioData)
      setHouses(houseData)
    } catch (err) {
      await showSwal({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const loadReportIdentity = async () => {
      try {
        const config = await getSystemConfig()
        setReportIdentity({
          village_name: config?.village_name || DEFAULT_REPORT_IDENTITY.village_name,
          juristic_name: config?.juristic_name || DEFAULT_REPORT_IDENTITY.juristic_name,
          juristic_signature_url: config?.juristic_signature_url || '',
        })
      } catch {
        setReportIdentity(DEFAULT_REPORT_IDENTITY)
      }
    }
    loadReportIdentity()
  }, [])

  const getStatusBadge = (status) => {
    if (status === 'new') return { className: 'bd b-dg', label: 'ใหม่ (รอดำเนินการ)' }
    if (status === 'resolved') return { className: 'bd b-ok', label: 'ลูกบ้านแจ้งว่าแก้ไขแล้ว' }
    if (status === 'in_progress') return { className: 'bd b-ac', label: 'ลูกบ้านกำลังดำเนินการ' }
    if (status === 'not_fixed') return { className: 'bd b-wn', label: 'ส่งกลับไปดำเนินการใหม่' }
    if (status === 'pending') return { className: 'bd b-dg', label: 'ใหม่ (รอดำเนินการ)' }
    if (status === 'closed') return { className: 'bd b-ok', label: 'ปิดรายการ' }
    if (status === 'cancelled') return { className: 'bd b-dg', label: 'ยกเลิก' }
    return { className: 'bd b-mu', label: status }
  }

  const openAddModal = async () => {
    setEditingItem(null)
    const today = new Date().toISOString().slice(0, 10)
    let reportNo = ''
    try {
      reportNo = await generateNextViolationReportNo(today)
    } catch {
      reportNo = ''
    }
    setForm({ ...EMPTY_FORM, report_date: today, report_no: reportNo })
    setAttachments([])
    setRemovedImagePaths([])
    setShowModal(true)
  }

  const openEditModal = async (item) => {
    const baseType = VIOLATION_TYPES.includes(item.type || '') ? item.type : 'อื่นๆ'
    setEditingItem(item)
    setForm({
      house_id: item.house_id || '',
      type: baseType,
      type_other: baseType === 'อื่นๆ' ? (item.type || '') : '',
      detail: item.detail || '',
      occurred_at: item.occurred_at || '',
      status: item.status || 'new',
      due_date: item.due_date || '',
      report_no: item.report_no || '',
      report_date: item.report_date || '',
      warning_count: String(item.warning_count ?? 0),
      fine_amount: String(item.fine_amount ?? 0),
      admin_note: '',
      resident_note: item.resident_note || '',
    })
    try {
      const imgs = await listViolationImages(item.id)
      const mapped = imgs.map((img) => ({ ...img, source: 'existing' }))
      if (mapped.length > 0) {
        setAttachments(mapped)
      } else if (item.image_url) {
        setAttachments([{ source: 'existing', name: 'legacy-image', path: null, url: item.image_url }])
      } else {
        setAttachments([])
      }
    } catch (err) {
      await showSwal({ icon: 'warning', title: 'โหลดรูปแนบไม่สำเร็จ', text: err.message || 'ไม่สามารถโหลดรูปจาก Storage ได้' })
      setAttachments([])
    }
    setRemovedImagePaths([])
    setShowModal(true)
  }

  const closeModal = (force = false) => {
    if (saving && !force) return
    setShowModal(false)
    setEditingItem(null)
    setForm(EMPTY_FORM)
    setAttachments([])
    setRemovedImagePaths([])
  }

  const formatFileName = (index) => {
    const now = new Date()
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    return `VIO_${date}_${time}_${String(index).padStart(3, '0')}.jpg`
  }

  const readImageElement = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const canvasToBlob = (canvas, quality) => new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })

  const resizeImageToLimit = async (file, sequence) => {
    const image = await readImageElement(file)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('ไม่สามารถประมวลผลรูปภาพได้')
    let w = image.width, h = image.height
    const maxDim = 1600
    if (w > maxDim || h > maxDim) {
      const scale = Math.min(maxDim / w, maxDim / h)
      w = Math.round(w * scale); h = Math.round(h * scale)
    }
    canvas.width = w; canvas.height = h
    ctx.drawImage(image, 0, 0, w, h)
    let quality = 0.9
    let blob = await canvasToBlob(canvas, quality)
    while (blob && blob.size > MAX_IMAGE_TARGET_BYTES && quality > 0.25) {
      quality -= 0.08; blob = await canvasToBlob(canvas, quality)
    }
    while (blob && blob.size > MAX_IMAGE_TARGET_BYTES && (canvas.width > 480 || canvas.height > 480)) {
      canvas.width = Math.round(canvas.width * 0.9)
      canvas.height = Math.round(canvas.height * 0.9)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      quality = 0.82; blob = await canvasToBlob(canvas, quality)
      while (blob && blob.size > MAX_IMAGE_TARGET_BYTES && quality > 0.25) {
        quality -= 0.08; blob = await canvasToBlob(canvas, quality)
      }
    }
    if (!blob || blob.size > MAX_IMAGE_SIZE_BYTES) throw new Error(`ไม่สามารถย่อรูป ${file.name} ได้`)
    return new File([blob], formatFileName(sequence), { type: 'image/jpeg' })
  }

  const handleAttachFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const existingCount = attachments.filter((item) => item.source === 'existing').length
    const newCount = attachments.filter((item) => item.source === 'new').length
    const remaining = MAX_ATTACHMENTS - (existingCount + newCount)
    if (remaining <= 0) { await showSwal({ icon: 'warning', title: 'แนบรูปได้สูงสุด 5 รูป' }); return }
    const toProcess = files.slice(0, remaining)
    if (files.length > remaining) await showSwal({ icon: 'info', title: `รับได้แค่ ${remaining} รูป`, text: 'ระบบจะใช้เฉพาะรูปชุดแรก' })
    try {
      const start = existingCount + newCount + 1
      const prepared = []
      for (let i = 0; i < toProcess.length; i++) {
        const resized = await resizeImageToLimit(toProcess[i], start + i)
        prepared.push({ source: 'new', name: resized.name, file: resized, url: URL.createObjectURL(resized) })
      }
      setAttachments((cur) => [...cur, ...prepared])
    } catch (err) {
      await showSwal({ icon: 'error', title: 'แนบรูปไม่สำเร็จ', text: err.message })
    }
  }

  const handleRemoveAttachment = (target) => {
    setAttachments((cur) => {
      const next = cur.filter((item) => item !== target)
      if (target.source === 'new' && target.url) URL.revokeObjectURL(target.url)
      if (target.source === 'existing' && target.path) setRemovedImagePaths((p) => [...p, target.path])
      return next
    })
  }

  const handlePreviewAttachment = (target) => {
    if (!target.url) return
    showSwal({ imageUrl: target.url, imageAlt: target.name, showConfirmButton: false, showCloseButton: true, width: 'auto', background: '#0f172a' })
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((cur) => ({ ...cur, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.house_id) { await showSwal({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณาเลือกบ้าน' }); return }
    const typeName = form.type === 'อื่นๆ' ? form.type_other.trim() : form.type
    if (!typeName) { await showSwal({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณาระบุประเภทการกระทำผิด' }); return }
    const warningCount = Number(form.warning_count || 0)
    const fineAmount = Number(form.fine_amount || 0)
    if (warningCount < 0) { await showSwal({ icon: 'warning', title: 'ข้อมูลไม่ถูกต้อง', text: 'จำนวนครั้งเตือนต้องไม่ติดลบ' }); return }
    if (fineAmount < 0) { await showSwal({ icon: 'warning', title: 'ข้อมูลไม่ถูกต้อง', text: 'ค่าปรับต้องไม่ติดลบ' }); return }
    if (form.status === 'not_fixed' && fineAmount <= 0) { await showSwal({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรณีไม่แก้ไข ต้องระบุค่าปรับมากกว่า 0' }); return }
    try {
      setSaving(true)
      const payload = {
        house_id: form.house_id,
        type: typeName,
        detail: form.detail,
        occurred_at: form.occurred_at || null,
        status: form.status,
        due_date: form.due_date || null,
        report_no: form.report_no || null,
        report_date: form.report_date || new Date().toISOString().slice(0, 10),
        warning_count: warningCount,
        fine_amount: fineAmount,
        admin_note: form.admin_note,
      }
      if (editingItem) {
        const updated = await updateViolation(editingItem.id, payload)
        if (removedImagePaths.length > 0) await deleteViolationImagesByPaths(removedImagePaths)
        const newFiles = attachments.filter((a) => a.source === 'new' && a.file).map((a) => a.file)
        if (newFiles.length > 0) await uploadViolationImages(updated.id, newFiles)
        await showSwal({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1400, showConfirmButton: false })
      } else {
        const created = await createViolation(payload)
        const newFiles = attachments.filter((a) => a.source === 'new' && a.file).map((a) => a.file)
        if (newFiles.length > 0) await uploadViolationImages(created.id, newFiles)
        await showSwal({ icon: 'success', title: 'เพิ่มรายการสำเร็จ', timer: 1400, showConfirmButton: false })
      }
      closeModal(true)
      await loadData({ status: statusFilter, search: searchTerm })
    } catch (err) {
      await showSwal({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    const result = await showSwal({
      icon: 'warning',
      title: 'ยืนยันการลบ',
      text: `ลบรายการ "${item.type}" ของบ้าน ${item.houses?.house_no || '-'} ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#c0392b',
    })
    if (!result.isConfirmed) return
    try {
      await deleteViolation(item.id)
      await showSwal({ icon: 'success', title: 'ลบสำเร็จ', timer: 1200, showConfirmButton: false })
      await loadData({ status: statusFilter, search: searchTerm })
    } catch (err) {
      await showSwal({ icon: 'error', title: 'ลบไม่สำเร็จ', text: err.message })
    }
  }

  const buildReportDocumentParts = (item, images, includeToolbar = true, signatureSourceOverride = '') => {
    const isPdfMode = !includeToolbar
    const signatureSource = reportIdentity.juristic_signature_url || juristicSignature
    const signatureRenderSource = signatureSourceOverride || signatureSource
    const signatureImageAllowed = !isPdfMode || !isSvgSource(signatureRenderSource)
    const logoImageAllowed = !isPdfMode || !isSvgSource(villageLogo)
    const detailRows = `
      <tr><td class="k">บ้าน/เจ้าของ</td><td class="v">${escapeHtml(item.houses?.house_no || '-')} ${escapeHtml(item.houses?.owner_name ? `- ${item.houses.owner_name}` : '')}</td></tr>
      <tr><td class="k">ประเภทการกระทำผิด</td><td class="v">${escapeHtml(item.type || '-')}</td></tr>
      <tr><td class="k">วันเกิดเหตุ</td><td class="v">${escapeHtml(formatDate(item.occurred_at))}</td></tr>
      <tr><td class="k">วันครบกำหนดแก้ไข</td><td class="v">${escapeHtml(formatDate(item.due_date))}</td></tr>
      <tr><td class="k">ครั้งที่เตือน</td><td class="v">${escapeHtml(item.warning_count ?? 0)}</td></tr>
      <tr><td class="k">ค่าปรับ</td><td class="v">${escapeHtml(Number(item.fine_amount || 0).toLocaleString('th-TH'))} บาท</td></tr>
      <tr><td class="k">รายละเอียด</td><td class="v">${escapeHtml(item.detail || '-')}</td></tr>
      <tr><td class="k">หมายเหตุจากนิติ</td><td class="v">${escapeHtml(item.admin_note || '-')}</td></tr>
      <tr><td class="k">อัปเดตจากลูกบ้าน</td><td class="v">${escapeHtml(item.resident_note || '-')}</td></tr>
    `

    const firstImage = images[0]?.url
      ? `<img src="${images[0].url}" alt="หลักฐาน" class="evd" />`
      : '<div class="noimg">ไม่มีรูปแนบ</div>'

    const extraPages = images.slice(1).map((img, index) => `
      <section class="a4 page-break">
        <div class="page-title">หลักฐานเพิ่มเติม ${index + 2}</div>
        <div class="img-wrap full">
          <img src="${img.url}" alt="หลักฐานเพิ่มเติม ${index + 2}" class="evd" />
        </div>
      </section>
    `).join('')

    const styles = `
            * { box-sizing: border-box; }
            body { margin: 0; background: #f3f4f6; font-family: Arial, Helvetica, sans-serif; color: #111827; }
            .toolbar { position: sticky; top: 0; z-index: 20; background: #111827; color: #fff; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; }
            .toolbar .actions { display: flex; gap: 8px; }
            .toolbar button { border: none; border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 13px; }
            .btn-print { background: #2563eb; color: #fff; }
            .btn-image { background: #16a34a; color: #fff; }
            .btn-close { background: #e5e7eb; color: #111827; }
            .canvas { padding: ${includeToolbar ? '16px 0 30px' : '0'}; }
            .a4 { width: 210mm; min-height: 297mm; margin: 0 auto 16px; background: #fff; border: 1px solid #d1d5db; padding: 9mm 11mm; display: block; }
            .head { display: flex; align-items: center; gap: 12px; margin-bottom: 3mm; }
            .logo { width: 44px; height: 44px; object-fit: contain; }
            .logo-fallback { width: 44px; height: 44px; border-radius: 12px; background: #0d9488; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
            .head h1 { margin: 0 0 2mm; font-size: 18px; }
            .village { font-size: 11px; color: #374151; margin-bottom: 2mm; }
            .meta { font-size: 11px; color: #4b5563; margin-bottom: 4mm; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            td { padding: 1.8mm 0; vertical-align: top; }
            td.k { width: 42mm; font-weight: 700; }
            td.v { word-break: break-word; }
            .img-title { margin-top: 3mm; font-weight: 700; font-size: 12px; page-break-inside: avoid; break-inside: avoid; }
            .img-wrap { margin-top: 2mm; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; min-height: 90mm; height: 90mm; display: flex; align-items: center; justify-content: center; page-break-inside: avoid; break-inside: avoid; }
            .img-wrap.full { min-height: 250mm; }
            .evd { width: 100%; height: 100%; object-fit: cover; background: #fff; }
            .noimg { color: #6b7280; font-size: 14px; }
            .page-title { margin-bottom: 4mm; font-size: 16px; font-weight: 700; }
            .signature { margin-top: 4mm; display: flex; justify-content: flex-end; page-break-inside: avoid; break-inside: avoid; }
            .signature-box { width: 58mm; text-align: center; }
            .signature-crop { width: 100%; max-height: 20mm; overflow: hidden; display: flex; align-items: center; justify-content: center; }
            .signature-img { width: 118%; max-height: 22mm; object-fit: cover; }
            .signature-line { border-top: 1px solid #111827; margin-top: 2mm; padding-top: 2mm; font-size: 11px; }
            .page-break { page-break-before: always; break-before: page; }
            @media print {
              body { background: #fff; }
              .toolbar { display: none !important; }
              .canvas { padding: 0; }
              .a4 { margin: 0; border: none; page-break-after: always; }
              .a4:last-child { page-break-after: auto; }
            }
    `

    const toolbarHtml = includeToolbar ? `
      <div class="toolbar">
            <div>ตัวอย่างรายงาน A4 • ${escapeHtml(item.report_no || '-')}</div>
            <div class="actions">
              <button class="btn-print" onclick="window.print()">Print</button>
              <button class="btn-image" onclick="if (window.opener && typeof window.opener.__downloadViolationImageFromPreview === 'function') { window.opener.__downloadViolationImageFromPreview(window); }">Image</button>
              <button class="btn-close" onclick="window.close()">ปิด</button>
            </div>
          </div>
    ` : ''

    const canvasHtml = `
      <div class="canvas">
        <section class="a4">
              <div class="head">
                ${logoImageAllowed
      ? `<img src="${villageLogo}" class="logo" alt="logo" />`
      : '<div class="logo-fallback">GF</div>'}
                <div>
                  <h1>รายงานการกระทำผิด</h1>
                  <div class="village">${escapeHtml(reportIdentity.village_name || DEFAULT_REPORT_IDENTITY.village_name)}</div>
                  <div class="meta">เลขที่รายงาน: ${escapeHtml(item.report_no || '-')} • วันที่รายงาน: ${escapeHtml(formatDate(item.report_date))}</div>
                </div>
              </div>
              <table><tbody>${detailRows}</tbody></table>
              <div class="img-title">รูปภาพหลักฐาน</div>
              <div class="img-wrap">${firstImage}</div>
              <div class="signature">
                <div class="signature-box">
                  ${signatureImageAllowed
      ? `<div class="signature-crop"><img src="${signatureRenderSource}" class="signature-img" alt="signature" /></div>`
      : ''}
                  <div class="signature-line">(${escapeHtml(reportIdentity.juristic_name || DEFAULT_REPORT_IDENTITY.juristic_name)})</div>
                </div>
              </div>
            </section>
            ${extraPages}
      </div>
    `

    return { styles, toolbarHtml, canvasHtml }
  }

  const buildReportPreviewHtml = async (item, images, { includeToolbar = true } = {}) => {
    const signatureSource = reportIdentity.juristic_signature_url || juristicSignature
    const cleanedSignatureSource = await buildCleanedSignatureSource(signatureSource)
    const { styles, toolbarHtml, canvasHtml } = buildReportDocumentParts(item, images, includeToolbar, cleanedSignatureSource)
    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>รายงานการกระทำผิด ${escapeHtml(item.report_no || '')}</title>
          <style>${styles}</style>
        </head>
        <body>
          ${toolbarHtml}
          ${canvasHtml}
        </body>
      </html>
    `
  }

  const buildViolationReportPages = async (item, images) => {
    const pageWidthPx = 1240
    const pageHeightPx = 1754
    const marginX = 48
    const marginY = 56
    const contentWidth = pageWidthPx - (marginX * 2)
    const lineHeight = 30
    const labelWidth = 300
    const bodyBottomY = pageHeightPx - marginY

    const createPageCanvas = () => {
      const canvas = document.createElement('canvas')
      canvas.width = pageWidthPx
      canvas.height = pageHeightPx
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('ไม่สามารถสร้างเอกสารรายงานได้')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, pageWidthPx, pageHeightPx)
      return { canvas, ctx }
    }

    const pages = []
    let pageIndex = 0
    let page = null
    let ctx = null
    let cursorY = marginY

    const startNewPage = (isFirstPage = false) => {
      page = createPageCanvas()
      ctx = page.ctx
      pages.push(page)
      pageIndex += 1

      if (isFirstPage) {
        ctx.fillStyle = '#0d9488'
        ctx.fillRect(marginX, marginY, 64, 64)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 24px Arial, Helvetica, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('GF', marginX + 32, marginY + 42)
        ctx.textAlign = 'left'

        ctx.fillStyle = '#111827'
        ctx.font = 'bold 40px Arial, Helvetica, sans-serif'
        ctx.fillText('รายงานการกระทำผิด', marginX + 86, marginY + 34)
        ctx.fillStyle = '#374151'
        ctx.font = '22px Arial, Helvetica, sans-serif'
        ctx.fillText(reportIdentity.village_name || DEFAULT_REPORT_IDENTITY.village_name, marginX + 86, marginY + 70)
        ctx.fillStyle = '#4b5563'
        ctx.font = '18px Arial, Helvetica, sans-serif'
        ctx.fillText(`เลขที่รายงาน: ${item.report_no || '-'}   วันที่รายงาน: ${formatDate(item.report_date)}`, marginX, marginY + 118)
        cursorY = marginY + 162
      } else {
        ctx.fillStyle = '#111827'
        ctx.font = 'bold 28px Arial, Helvetica, sans-serif'
        ctx.fillText('รายงานการกระทำผิด (ต่อ)', marginX, marginY + 14)
        ctx.fillStyle = '#4b5563'
        ctx.font = '18px Arial, Helvetica, sans-serif'
        ctx.fillText(`เลขที่รายงาน: ${item.report_no || '-'} • บ้าน: ${item.houses?.house_no || '-'}`, marginX, marginY + 44)
        cursorY = marginY + 74
      }
    }

    const ensureSpace = (requiredHeight) => {
      if (!ctx) startNewPage(true)
      if ((cursorY + requiredHeight) <= bodyBottomY) return
      startNewPage(false)
    }

    const drawFieldRow = (label, value) => {
      ctx.fillStyle = '#111827'
      ctx.font = '20px Arial, Helvetica, sans-serif'
      const valueLines = wrapTextByWidth(ctx, value, contentWidth - labelWidth)
      const blockHeight = Math.max(lineHeight, valueLines.length * lineHeight) + 8
      ensureSpace(blockHeight)

      ctx.fillStyle = '#111827'
      ctx.font = 'bold 20px Arial, Helvetica, sans-serif'
      ctx.fillText(label, marginX, cursorY)

      ctx.font = '20px Arial, Helvetica, sans-serif'
      valueLines.forEach((line, idx) => {
        ctx.fillText(line, marginX + labelWidth, cursorY + (idx * lineHeight))
      })

      cursorY += blockHeight
    }

    const drawEvidenceSection = async (title, image, includeSignature = false) => {
      const sectionTitleHeight = 32
      const evidenceHeight = includeSignature ? 360 : (pageHeightPx - marginY - cursorY - 90)
      const safeEvidenceHeight = Math.max(320, evidenceHeight)
      const signatureBlockHeight = includeSignature ? 150 : 0
      ensureSpace(sectionTitleHeight + safeEvidenceHeight + signatureBlockHeight)

      ctx.fillStyle = '#111827'
      ctx.font = 'bold 22px Arial, Helvetica, sans-serif'
      ctx.fillText(title, marginX, cursorY + 18)
      const evidenceY = cursorY + 34

      ctx.strokeStyle = '#d1d5db'
      ctx.lineWidth = 2
      ctx.strokeRect(marginX, evidenceY, contentWidth, safeEvidenceHeight)
      drawImageContain(ctx, image, marginX + 2, evidenceY + 2, contentWidth - 4, safeEvidenceHeight - 4)

      cursorY = evidenceY + safeEvidenceHeight + 10

      if (includeSignature) {
        const signatureSource = reportIdentity.juristic_signature_url || juristicSignature
        const signatureRawImage = isSvgSource(signatureSource) ? null : await loadImageElement(signatureSource)
        const signatureImage = prepareSignatureImageForPdf(signatureRawImage)
        const signBoxWidth = 320
        const signBoxX = marginX + contentWidth - signBoxWidth
        const signBaseY = cursorY + 8
        if (signatureImage) {
          drawImageContainWithInsetCrop(ctx, signatureImage, signBoxX, signBaseY, signBoxWidth, 72, 0.08)
        }

        ctx.strokeStyle = '#111827'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(signBoxX, signBaseY + 90)
        ctx.lineTo(signBoxX + signBoxWidth, signBaseY + 90)
        ctx.stroke()

        ctx.fillStyle = '#111827'
        ctx.font = '18px Arial, Helvetica, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`(${reportIdentity.juristic_name || DEFAULT_REPORT_IDENTITY.juristic_name})`, signBoxX + (signBoxWidth / 2), signBaseY + 120)
        ctx.textAlign = 'left'

        cursorY = signBaseY + 130
      }
    }

    startNewPage(true)

    const rows = [
      ['บ้าน/เจ้าของ', `${item.houses?.house_no || '-'} ${item.houses?.owner_name ? `- ${item.houses.owner_name}` : ''}`],
      ['ประเภทการกระทำผิด', item.type || '-'],
      ['วันเกิดเหตุ', formatDate(item.occurred_at)],
      ['วันครบกำหนดแก้ไข', formatDate(item.due_date)],
      ['ครั้งที่เตือน', String(item.warning_count ?? 0)],
      ['ค่าปรับ', `${Number(item.fine_amount || 0).toLocaleString('th-TH')} บาท`],
      ['รายละเอียด', item.detail || '-'],
      ['หมายเหตุจากนิติ', item.admin_note || '-'],
      ['อัปเดตจากลูกบ้าน', item.resident_note || '-'],
    ]

    rows.forEach(([label, value]) => drawFieldRow(label, value))

    const firstEvidenceImage = await loadImageElement(images[0]?.url)
    await drawEvidenceSection('รูปภาพหลักฐาน', firstEvidenceImage, true)

    for (let index = 1; index < images.length; index += 1) {
      startNewPage(false)
      const evidenceImage = await loadImageElement(images[index]?.url)
      await drawEvidenceSection(`หลักฐานเพิ่มเติม ${index + 1}`, evidenceImage, false)
    }

    return pages
  }

  const downloadViolationReportPdf = async (item) => {
    const images = await listViolationImages(item.id)
    const pages = await buildViolationReportPages(item, images)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    pages.forEach((entry, index) => {
      if (index > 0) pdf.addPage('a4', 'portrait')
      pdf.addImage(entry.canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)
    })

    pdf.save(`${item.report_no || `violation-${item.id}`}.pdf`)
  }

  const downloadViolationReportImageFromPreview = async (previewWindow, item) => {
    if (!previewWindow || previewWindow.closed) {
      throw new Error('ไม่พบหน้าพรีวิวสำหรับจับภาพ')
    }

    const pageElements = Array.from(previewWindow.document.querySelectorAll('.a4'))
    if (pageElements.length === 0) {
      throw new Error('ไม่พบหน้าเอกสารในหน้าพรีวิว')
    }

    const pageCanvases = []
    for (const pageEl of pageElements) {
      const pageCanvas = await html2canvas(pageEl, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      })
      pageCanvases.push(pageCanvas)
    }

    const baseName = item.report_no || `violation-${item.id}`
    const firstPage = pageCanvases[0]
    if (!firstPage) throw new Error('ไม่สามารถจับภาพเอกสารได้')

    const pageGap = 16
    const totalHeight = pageCanvases.reduce((sum, entry, index) => sum + entry.height + (index > 0 ? pageGap : 0), 0)

    if (totalHeight > 30000) {
      throw new Error('รูปภาพยาวเกินขีดจำกัดระบบ แนะนำใช้ PDF สำหรับเอกสารยาวมาก')
    }

    const mergedCanvas = document.createElement('canvas')
    mergedCanvas.width = firstPage.width
    mergedCanvas.height = totalHeight
    const mergedCtx = mergedCanvas.getContext('2d')
    if (!mergedCtx) throw new Error('ไม่สามารถสร้างไฟล์รูปภาพได้')

    mergedCtx.fillStyle = '#ffffff'
    mergedCtx.fillRect(0, 0, mergedCanvas.width, mergedCanvas.height)

    let offsetY = 0
    pageCanvases.forEach((entry, index) => {
      if (index > 0) {
        mergedCtx.fillStyle = '#e5e7eb'
        mergedCtx.fillRect(0, offsetY, mergedCanvas.width, pageGap)
        offsetY += pageGap
      }
      mergedCtx.drawImage(entry, 0, offsetY)
      offsetY += entry.height
    })

    const link = document.createElement('a')
    link.href = mergedCanvas.toDataURL('image/jpeg', 0.95)
    link.download = `${baseName}.jpg`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleOpenPrintPreview = async (item) => {
    try {
      const images = await listViolationImages(item.id)
      const html = await buildReportPreviewHtml(item, images, { includeToolbar: false })
      setPrintPreviewHtml(html)
      setPrintPreviewTitle(`รายงานการกระทำผิด ${item.report_no || ''}`.trim())
      setShowPrintPreviewModal(true)
    } catch (error) {
      await showSwal({ icon: 'error', title: 'เปิดพรีวิวไม่สำเร็จ', text: error.message })
    }
  }

  const closePrintPreviewModal = () => {
    setShowPrintPreviewModal(false)
    setPrintPreviewHtml('')
    setPrintPreviewTitle('รายงานการกระทำผิด')
  }

  const handlePrintFromModal = () => {
    const frameWindow = printPreviewIframeRef.current?.contentWindow
    if (!frameWindow) return
    frameWindow.focus()
    frameWindow.print()
  }

  const handleDownloadPdf = async (item) => {
    try {
      console.info('[ViolationPDF] engine=canvas-direct build=', typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'unknown')
      await downloadViolationReportPdf(item)
      await showSwal({ icon: 'success', title: 'ดาวน์โหลด PDF สำเร็จ', timer: 1000, showConfirmButton: false })
    } catch (error) {
      await showSwal({
        icon: 'error',
        title: 'ดาวน์โหลด PDF ไม่สำเร็จ',
        text: `${error.message} (build ${typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'unknown'})`,
      })
    }
  }

  const formatDate = (str) => {
    if (!str) return '-'
    return new Date(str).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <div className="pane on houses-compact violations-page">
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">⚠️</div>
            <div>
              <div className="ph-h1">แจ้งกระทำผิด</div>
              <div className="ph-sub">บันทึกการละเมิดข้อบังคับของหมู่บ้าน</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card report-filter-card admin-search-filter-card">
        <div className="cb" style={{ padding: 12 }}>
        <div className="houses-filter-row">
          <input
            className="houses-filter-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหา ประเภท / บ้าน / เจ้าของ"
          />
          <StyledSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">ทุกสถานะ</option>
            <option value="new">ใหม่ (รอดำเนินการ)</option>
            <option value="in_progress">ลูกบ้านกำลังดำเนินการ</option>
            <option value="not_fixed">ส่งกลับไปดำเนินการใหม่</option>
            <option value="resolved">ลูกบ้านแจ้งว่าแก้ไขแล้ว</option>
            <option value="closed">ปิดรายการ</option>
            <option value="cancelled">ยกเลิก</option>
          </StyledSelect>
          <button className="btn btn-a btn-sm houses-filter-btn" onClick={() => loadData({ status: statusFilter, search: searchTerm })}>ค้นหา</button>
        </div>
        </div>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">รายการทั้งหมด ({violations.length} รายการ)</div>
          <div className="houses-list-actions">
            <button className="btn btn-p btn-sm" onClick={openAddModal}>+ แจ้งกระทำผิดใหม่</button>
            <button className="btn btn-g btn-sm" onClick={() => loadData({ status: statusFilter, search: searchTerm })}>🔄 รีเฟรช</button>
          </div>
        </div>
        <div className="cb houses-table-card-body houses-main-body">
          <div className="desktop-only">
            <div style={{ overflowX: 'auto' }}>
              <table className="tw houses-table houses-main-table" style={{ width: '100%', minWidth: '900px' }}>
                <thead><tr>
                  <th>ซอย</th>
                  <th>บ้าน / เจ้าของ</th>
                  <th>ประเภท</th>
                  <th>รายละเอียด</th>
                  <th>วันเกิดเหตุ</th>
                  <th>เลขที่รายงาน</th>
                  <th>วันที่รายงาน</th>
                  <th>เตือน</th>
                  <th>ค่าปรับ</th>
                  <th>วันครบกำหนด</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="12" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>กำลังโหลด...</td></tr>
                  ) : violations.length === 0 ? (
                    <tr><td colSpan="12" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>ไม่พบข้อมูล</td></tr>
                  ) : violations.map((item) => {
                    const badge = getStatusBadge(item.status)
                    return (
                      <tr key={item.id}>
                        <td>{item.houses?.soi ? `ซอย ${item.houses.soi}` : '-'}</td>
                        <td>
                          <div><strong>{item.houses?.house_no || '-'}</strong> {item.houses?.owner_name ? `- ${item.houses.owner_name}` : ''}</div>
                        </td>
                        <td>{item.type || '-'}</td>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.detail || '-'}</td>
                        <td>{formatDate(item.occurred_at)}</td>
                        <td>{item.report_no || '-'}</td>
                        <td>{formatDate(item.report_date)}</td>
                        <td>{item.warning_count ?? 0}</td>
                        <td>{Number(item.fine_amount || 0).toLocaleString('th-TH')}</td>
                        <td>{formatDate(item.due_date)}</td>
                        <td><span className={badge.className}>{badge.label}</span></td>
                        <td><div className="td-acts">
                          <button className="btn btn-xs btn-o" onClick={() => handleOpenPrintPreview(item)}>พิมพ์</button>
                          <button className="btn btn-xs btn-p" onClick={() => handleDownloadPdf(item)}>PDF</button>
                          <button className="btn btn-xs btn-a" onClick={() => openEditModal(item)}>แก้ไข</button>
                          <button className="btn btn-xs btn-dg" onClick={() => handleDelete(item)}>ลบ</button>
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mobile-only">
            {loading ? (
              <div className="mcard-empty">กำลังโหลด...</div>
            ) : violations.length === 0 ? (
              <div className="mcard-empty">ไม่พบข้อมูล</div>
            ) : violations.map((item) => {
              const badge = getStatusBadge(item.status)
              return (
                <div key={item.id} className="mcard">
                  <div className="mcard-top">
                    <div className="mcard-title">{item.houses?.house_no || '-'}</div>
                    <div className="mcard-sub">{item.houses?.soi ? `ซอย ${item.houses.soi}` : '-'}</div>
                    <span className={`${badge.className} mcard-badge`}>{badge.label}</span>
                  </div>
                  <div className="mcard-body">{item.type || '-'}</div>
                  <div className="mcard-meta">
                    <span><span className="mcard-label">วันเกิดเหตุ</span> {formatDate(item.occurred_at)}</span>
                    <span><span className="mcard-label">เลขที่รายงาน</span> {item.report_no || '-'}</span>
                    <span><span className="mcard-label">เตือนครั้งที่</span> {item.warning_count ?? 0}</span>
                    <span><span className="mcard-label">ค่าปรับ</span> {Number(item.fine_amount || 0).toLocaleString('th-TH')} บาท</span>
                  </div>
                  <div className="mcard-actions">
                    <button className="btn btn-xs btn-o" onClick={() => handleOpenPrintPreview(item)}>พิมพ์</button>
                    <button className="btn btn-xs btn-p" onClick={() => handleDownloadPdf(item)}>PDF</button>
                    <button className="btn btn-xs btn-a" onClick={() => openEditModal(item)}>แก้ไข</button>
                    <button className="btn btn-xs btn-dg" onClick={() => handleDelete(item)}>ลบ</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="house-mo">
          <div className="house-md house-md--xl">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">⚠️ {editingItem ? 'แก้ไขรายการกระทำผิด' : 'แจ้งกระทำผิดใหม่'}</div>
                <div className="house-md-sub">{form.type !== 'อื่นๆ' ? form.type : form.type_other || 'ประเภทการกระทำผิด'}</div>
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="house-md-body">
                <section className="house-sec">
                  <div className="house-sec-title">บ้านและการกระทำผิด</div>
                  <div className="house-grid house-grid-3">
                    <label className="house-field">
                      <span>บ้าน *</span>
                      <StyledSelect name="house_id" value={form.house_id} onChange={handleChange}>
                        {houseOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </StyledSelect>
                    </label>
                    <label className="house-field">
                      <span>ประเภทการกระทำผิด *</span>
                      <StyledSelect name="type" value={form.type} onChange={handleChange}>
                        {VIOLATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </StyledSelect>
                    </label>
                    {form.type === 'อื่นๆ' && (
                      <label className="house-field">
                        <span>ระบุประเภท *</span>
                        <input name="type_other" value={form.type_other} onChange={handleChange} placeholder="ระบุการกระทำผิด" />
                      </label>
                    )}
                    <label className="house-field">
                      <span>วันที่เกิดเหตุ</span>
                      <input type="date" name="occurred_at" value={form.occurred_at} onChange={handleChange} />
                    </label>
                  </div>
                </section>

                <section className="house-sec">
                  <div className="house-sec-title">สถานะ รายงาน และกำหนดการ</div>
                  <div className="house-grid house-grid-3">
                    <label className="house-field">
                      <span>สถานะ</span>
                      <StyledSelect name="status" value={form.status} onChange={handleChange}>
                        <option value="new">ใหม่ (รอดำเนินการ)</option>
                        {(form.status === 'in_progress' || form.status === 'resolved') && (
                          <option value={form.status}>{form.status === 'in_progress' ? 'ลูกบ้านกำลังดำเนินการ' : 'ลูกบ้านแจ้งว่าแก้ไขแล้ว'}</option>
                        )}
                        <option value="not_fixed">ส่งกลับไปดำเนินการใหม่</option>
                        <option value="closed">ปิดรายการ</option>
                        <option value="cancelled">ยกเลิก</option>
                      </StyledSelect>
                    </label>
                    <label className="house-field">
                      <span>เลขที่รายงาน</span>
                      <input name="report_no" value={form.report_no} onChange={handleChange} placeholder="Auto Run" readOnly />
                    </label>
                    <label className="house-field">
                      <span>วันที่ออกรายงาน</span>
                      <input type="date" name="report_date" value={form.report_date} onChange={handleChange} />
                    </label>
                    <label className="house-field">
                      <span>ครั้งที่เตือน</span>
                      <input type="number" min="0" name="warning_count" value={form.warning_count} onChange={handleChange} />
                    </label>
                    <label className="house-field">
                      <span>ค่าปรับ (บาท)</span>
                      <input type="number" min="0" name="fine_amount" value={form.fine_amount} onChange={handleChange} placeholder="0" />
                    </label>
                    <label className="house-field">
                      <span>วันครบกำหนดแก้ไข</span>
                      <input type="date" name="due_date" value={form.due_date} onChange={handleChange} />
                    </label>
                  </div>
                </section>

                <section className="house-sec">
                  <div className="house-sec-title">รายละเอียด</div>
                  <div className="house-grid house-grid-2">
                    <label className="house-field">
                      <span>รายละเอียดการกระทำผิด</span>
                      <textarea name="detail" value={form.detail} onChange={handleChange} rows="3" placeholder="อธิบายรายละเอียด" />
                    </label>
                    <label className="house-field">
                      <span>ข้อความตอบกลับรอบนี้จากนิติ</span>
                      <textarea name="admin_note" value={form.admin_note} onChange={handleChange} rows="3" placeholder="พิมพ์ข้อความรอบใหม่ ระบบจะเก็บประวัติให้อัตโนมัติ" />
                    </label>
                    <label className="house-field">
                      <span>ประวัติข้อความจากลูกบ้าน</span>
                      <textarea name="resident_note" value={form.resident_note} onChange={handleChange} rows="3" placeholder="ยังไม่มีข้อความจากลูกบ้าน" readOnly />
                    </label>
                  </div>
                </section>

                <section className="house-sec">
                  <div className="house-sec-title">รูปภาพหลักฐาน (สูงสุด 5 รูป)</div>
                  <div className="house-grid house-grid-3">
                    <label className="house-field house-field-span-3">
                      <span>แนบไฟล์รูปภาพ</span>
                      <input type="file" accept="image/*" multiple onChange={handleAttachFiles} disabled={attachments.length >= MAX_ATTACHMENTS} />
                    </label>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--mu)' }}>
                    แนบแล้ว {attachments.length}/{MAX_ATTACHMENTS} รูป • ระบบย่อไฟล์ไม่เกิน 100KB และตั้งชื่อ VIO_YYYYMMDD_HHMMSS_001.jpg
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {attachments.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--mu)' }}>ยังไม่มีรูปแนบ</div>
                    ) : attachments.map((img, idx) => (
                      <div key={`${img.name}-${idx}`} style={{ width: '64px' }}>
                        <button type="button" onClick={() => handlePreviewAttachment(img)} style={{ width: '64px', height: '64px', borderRadius: '8px', border: '1px solid var(--bo)', background: '#fff', padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
                          <img src={img.url} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </button>
                        <button type="button" className="btn btn-xs btn-dg" onClick={() => handleRemoveAttachment(img)} style={{ marginTop: '4px', width: '100%' }}>ลบ</button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <div className="house-md-foot">
                <button className="btn btn-g" type="button" onClick={() => closeModal()}>ยกเลิก</button>
                <button className="btn btn-p" type="submit" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPrintPreviewModal && (
        <div className="house-mo" style={{ zIndex: 9950 }}>
          <div className="house-md" style={{ width: 'min(96vw, 1140px)', maxWidth: '1140px', height: 'min(94vh, 900px)' }}>
            <div className="house-md-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="house-md-title">🖨️ {printPreviewTitle}</div>
                <div className="house-md-sub">ตัวอย่างก่อนพิมพ์ (Responsive Modal)</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-a btn-sm" onClick={handlePrintFromModal}>พิมพ์</button>
                <button type="button" className="btn btn-g btn-sm" onClick={closePrintPreviewModal}>ปิด</button>
              </div>
            </div>
            <div className="house-md-body" style={{ padding: 0, overflow: 'hidden' }}>
              <iframe
                ref={printPreviewIframeRef}
                title={printPreviewTitle}
                srcDoc={printPreviewHtml}
                style={{ width: '100%', height: '100%', minHeight: '68vh', border: 'none', background: '#fff' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminViolations