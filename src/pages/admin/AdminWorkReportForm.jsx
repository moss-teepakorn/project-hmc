import React, { useEffect, useMemo, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import { useNavigate, useParams } from 'react-router-dom'
import Swal from 'sweetalert2'
import {
  createWorkReport,
  deleteWorkReportImagesByPaths,
  getWorkReportById,
  listWorkReportImages,
  updateWorkReport,
  uploadWorkReportImages,
} from '../../lib/workReports'
import './AdminDashboard.css'

const CATEGORIES = [
  { value: 'maintenance', label: 'บำรุงรักษา' },
  { value: 'cleaning', label: 'ความสะอาด' },
  { value: 'safety', label: 'ความปลอดภัย' },
  { value: 'activities', label: 'กิจกรรม' },
  { value: 'environment', label: 'สิ่งแวดล้อม' },
]

const EMPTY_FORM = {
  month: '',
  year: String(new Date().getFullYear()),
  category: 'maintenance',
  summary: '',
  detail: '',
  is_published: false,
}

const MAX_ATTACHMENTS = 10
const MAX_IMAGE_TARGET_BYTES = 100 * 1024

function revokeBlobUrls(items) {
  for (const item of items || []) {
    if (item?.url && String(item.url).startsWith('blob:')) {
      URL.revokeObjectURL(item.url)
    }
  }
}

async function resizeImageToLimit(file, sequence) {
  if (file.size <= MAX_IMAGE_TARGET_BYTES) {
    const fileName = `WRK_${Date.now()}_${String(sequence).padStart(3, '0')}.jpg`
    return new File([file], fileName, { type: file.type || 'image/jpeg' })
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })

  let scale = 1
  let quality = 0.85
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ไม่สามารถประมวลผลรูปภาพได้')
  let bestBlob = null

  for (let attempt = 0; attempt < 28; attempt += 1) {
    // Keep original aspect ratio by applying one shared scale factor.
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) break

    if (!bestBlob || blob.size < bestBlob.size) {
      bestBlob = blob
    }

    if (blob.size <= MAX_IMAGE_TARGET_BYTES) {
      const fileName = `WRK_${Date.now()}_${String(sequence).padStart(3, '0')}.jpg`
      return new File([blob], fileName, { type: 'image/jpeg' })
    }

    if (quality > 0.45) {
      quality -= 0.08
    } else {
      scale *= 0.9
      quality = 0.72
    }

    if (width <= 120 || height <= 120) break
  }

  if (bestBlob && bestBlob.size <= MAX_IMAGE_TARGET_BYTES) {
    const fileName = `WRK_${Date.now()}_${String(sequence).padStart(3, '0')}.jpg`
    return new File([bestBlob], fileName, { type: 'image/jpeg' })
  }

  throw new Error(`ไม่สามารถย่อรูป ${file.name} ให้ต่ำกว่า 100KB ได้`)
}

const AdminWorkReportForm = ({ modalMode = false, forceCreate = false, reportId = null, onSaved = null, onCancel = null }) => {
  const navigate = useNavigate()
  const { id: routeId } = useParams()
  // In modal edit mode, use reportId prop; on the standalone edit page, use route param
  const id = reportId ?? routeId
  const isEdit = forceCreate ? false : Boolean(id)

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [attachments, setAttachments] = useState([])
  const [originalImagePaths, setOriginalImagePaths] = useState([])
  const [removedExistingPaths, setRemovedExistingPaths] = useState([])

  useEffect(() => () => revokeBlobUrls(attachments), [attachments])

  useEffect(() => {
    const loadRecord = async () => {
      if (!isEdit) return
      try {
        setLoading(true)
        const report = await getWorkReportById(id)
        const images = await listWorkReportImages(id)

        setForm({
          month: String(report.month || ''),
          year: String(report.year || new Date().getFullYear()),
          category: report.category || 'maintenance',
          summary: report.summary || '',
          detail: report.detail || '',
          is_published: Boolean(report.is_published),
        })

        setAttachments(images.map((img) => ({ source: 'existing', ...img })))
        setOriginalImagePaths(images.map((img) => img.path).filter(Boolean))
        setRemovedExistingPaths([])
      } catch (error) {
        await Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error.message })
        navigate('/admin/work-reports')
      } finally {
        setLoading(false)
      }
    }

    loadRecord()
  }, [id, isEdit, navigate])

  const years = useMemo(() => [2024, 2025, 2026, 2027, 2028], [])

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleAttachFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    const remain = MAX_ATTACHMENTS - attachments.length
    if (remain <= 0) {
      await Swal.fire({ icon: 'warning', title: 'แนบรูปได้สูงสุด 10 รูป' })
      return
    }

    const accepted = files.slice(0, remain)
    if (files.length > remain) {
      await Swal.fire({ icon: 'info', title: `รับได้แค่ ${remain} รูป`, text: 'ระบบจะใช้เฉพาะรูปชุดแรก' })
    }

    try {
      const prepared = []
      for (let index = 0; index < accepted.length; index += 1) {
        const resized = await resizeImageToLimit(accepted[index], attachments.length + index + 1)
        prepared.push({
          source: 'new',
          file: resized,
          name: resized.name,
          url: URL.createObjectURL(resized),
        })
      }
      setAttachments((prev) => [...prev, ...prepared])
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ประมวลผลรูปไม่สำเร็จ', text: error.message })
    }
  }

  const handleRemoveAttachment = (index) => {
    setAttachments((prev) => {
      const next = [...prev]
      const item = next[index]
      if (item?.source === 'existing' && item.path) {
        setRemovedExistingPaths((paths) => (paths.includes(item.path) ? paths : [...paths, item.path]))
      }
      if (item?.url && String(item.url).startsWith('blob:')) {
        URL.revokeObjectURL(item.url)
      }
      next.splice(index, 1)
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!form.month || !form.year || !form.category || !String(form.summary).trim()) {
      await Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูลให้ครบถ้วน' })
      return
    }

    try {
      setSaving(true)

      const keptExistingPaths = attachments
        .filter((item) => item.source === 'existing' && item.path)
        .map((item) => item.path)

      const newFiles = attachments
        .filter((item) => item.source === 'new' && item.file)
        .map((item) => item.file)

      const payload = {
        month: Number(form.month),
        year: Number(form.year),
        category: form.category,
        summary: String(form.summary).trim(),
        detail: String(form.detail || '').trim(),
        is_published: Boolean(form.is_published),
        image_urls: [],
      }

      let saved
      if (isEdit) {
        const deletePaths = Array.from(new Set([
          ...removedExistingPaths,
          ...originalImagePaths.filter((path) => !keptExistingPaths.includes(path)),
        ]))
        if (deletePaths.length > 0) {
          await deleteWorkReportImagesByPaths(deletePaths)
        }
        saved = await updateWorkReport(id, payload)
      } else {
        saved = await createWorkReport(payload)
      }

      if (newFiles.length > 0) {
        try {
          await uploadWorkReportImages(saved.id, newFiles)
        } catch (uploadError) {
          // Record is already saved — show a warning but do not block completion
          await Swal.fire({
            icon: 'warning',
            title: 'บันทึกแล้ว แต่แนบรูปไม่ได้',
            text: String(uploadError?.message || 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'),
          })
        }
      }

      const currentImages = await listWorkReportImages(saved.id)
      await updateWorkReport(saved.id, {
        image_urls: currentImages.map((img) => img.url).filter(Boolean),
      })

      await Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1200, showConfirmButton: false })
      revokeBlobUrls(attachments)
      if (typeof onSaved === 'function') {
        onSaved(saved)
      } else {
        navigate('/admin/work-reports')
      }
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="pane on"><div className="card"><div className="cb">กำลังโหลด...</div></div></div>
  }

  const cancelHandler = () => {
    if (typeof onCancel === 'function') onCancel()
    else navigate('/admin/work-reports')
  }

  const formFields = (
    <>
      <section className="house-sec">
        <div className="house-sec-title">ข้อมูลผลงาน</div>
        <div className="house-grid house-grid-3">
          <label className="house-field">
            <span>เดือน *</span>
            <StyledSelect name="month" value={form.month} onChange={handleFormChange}>
              <option value="">เลือกเดือน</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>{new Date(2024, m - 1).toLocaleDateString('th-TH', { month: 'long' })}</option>
              ))}
            </StyledSelect>
          </label>
          <label className="house-field">
            <span>ปี *</span>
            <StyledSelect name="year" value={form.year} onChange={handleFormChange}>
              {years.map((y) => <option key={y} value={y}>{y + 543}</option>)}
            </StyledSelect>
          </label>
          <label className="house-field">
            <span>หมวดหมู่ *</span>
            <StyledSelect name="category" value={form.category} onChange={handleFormChange}>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </StyledSelect>
          </label>
        </div>
      </section>

      <section className="house-sec">
        <div className="house-sec-title">รายละเอียด</div>
        <div className="house-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label className="house-field">
            <span>สรุปผลงาน *</span>
            <input name="summary" value={form.summary} onChange={handleFormChange} type="text" placeholder="เช่น ซ่อมไฟถนน, ตัดแต่งต้นไม้" />
          </label>
          <label className="house-field">
            <span>รายละเอียด</span>
            <textarea name="detail" value={form.detail} onChange={handleFormChange} rows={7} placeholder="รายละเอียดงานเพิ่มเติม" />
          </label>
          <label className="house-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', paddingTop: '2px' }}>
            <input type="checkbox" name="is_published" checked={form.is_published} onChange={handleFormChange} style={{ width: 'auto', minHeight: 'auto', flex: 'none' }} />
            <span style={{ fontWeight: 600 }}>เผยแพร่ให้ลูกบ้านเห็น</span>
          </label>
        </div>
      </section>

      <section className="house-sec" style={{ borderBottom: 0 }}>
        <div className="house-sec-title">รูปภาพ (ไม่เกิน 10 รูป, รูปละไม่เกิน 100KB)</div>
        <label className="btn btn-o btn-sm" style={{ cursor: 'pointer', display: 'inline-block' }}>
          <input type="file" accept="image/*" multiple onChange={handleAttachFiles} style={{ display: 'none' }} disabled={attachments.length >= MAX_ATTACHMENTS} />
          แนบไฟล์
        </label>
        <div style={{ marginTop: '6px', color: 'var(--mu)', fontSize: '12px' }}>แนบแล้ว {attachments.length}/{MAX_ATTACHMENTS} รูป</div>
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
            {attachments.map((img, index) => (
              <div key={img.path || img.name || index} style={{ position: 'relative', width: '84px' }}>
                <img src={img.url} alt={img.name || 'img'} style={{ width: '84px', height: '84px', objectFit: 'cover', borderRadius: '6px' }} />
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(index)}
                  style={{ position: 'absolute', top: '2px', right: '2px', width: '20px', height: '20px', border: 'none', borderRadius: '50%', background: 'rgba(0,0,0,.65)', color: '#fff', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )

  if (modalMode) {
    return (
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="house-md-body">{formFields}</div>
        <div className="house-md-foot">
          <button type="button" className="btn btn-g" onClick={cancelHandler} disabled={saving}>ยกเลิก</button>
          <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        </div>
      </form>
    )
  }

  return (
    <div className="pane on" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">📝</div>
            <div>
              <div className="ph-h1">{isEdit ? 'แก้ไขผลงานนิติ' : 'เพิ่มผลงานนิติ'}</div>
              <div className="ph-sub">บันทึกผลงาน พร้อมแนบรูปไม่เกิน 10 รูป</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ch">
          <div className="ct">แบบฟอร์มผลงานนิติ</div>
        </div>
        <div className="cb" style={{ padding: '8px 14px 16px' }}>
          <form onSubmit={handleSubmit}>
            {formFields}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '14px' }}>
              <button type="button" className="btn btn-g" onClick={cancelHandler} disabled={saving}>ยกเลิก</button>
              <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AdminWorkReportForm