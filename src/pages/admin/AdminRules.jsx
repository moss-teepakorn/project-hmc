import React, { useEffect, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import Swal from 'sweetalert2'
import {
  createRuleDocument,
  deleteRuleDocument,
  deleteRulePdfByPath,
  listRuleDocuments,
  updateRuleDocument,
  uploadRulePdf,
} from '../../lib/rules'

const CATEGORY_OPTIONS = [
  { value: 'village', label: 'กฎระเบียบหมู่บ้าน' },
  { value: 'living', label: 'ระเบียบการอยู่อาศัย' },
]

const EMPTY_FORM = {
  category: 'village',
  topic_no: '',
  title: '',
  description: '',
}

function blurActiveElement() {
  const el = document.activeElement
  if (el instanceof HTMLElement) el.blur()
}

function showSwal(options) {
  blurActiveElement()
  return Swal.fire({ returnFocus: false, ...options })
}

function formatDate(str) {
  if (!str) return '-'
  return new Date(str).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function nextTopicNo(items, category) {
  const list = (items || []).filter((item) => item.category === category)
  const maxNo = list.reduce((max, item) => Math.max(max, Number(item.topic_no || 0)), 0)
  return maxNo + 1
}

export default function AdminRules() {
  const [rules, setRules] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [pdfFile, setPdfFile] = useState(null)
  const [existingPdf, setExistingPdf] = useState({ url: '', path: '' })
  const [showPdfViewerModal, setShowPdfViewerModal] = useState(false)
  const [pdfViewerUrl, setPdfViewerUrl] = useState('')
  const [pdfViewerTitle, setPdfViewerTitle] = useState('เอกสาร PDF')

  const loadData = async (override = {}) => {
    try {
      setLoading(true)
      const data = await listRuleDocuments({ category: override.category ?? categoryFilter, search: override.search ?? searchTerm })
      setRules(data)
    } catch (error) {
      await showSwal({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const openAddModal = () => {
    setEditingItem(null)
    setForm({ ...EMPTY_FORM, topic_no: String(nextTopicNo(rules, 'village')) })
    setPdfFile(null)
    setExistingPdf({ url: '', path: '' })
    setShowModal(true)
  }

  const openEditModal = (item) => {
    setEditingItem(item)
    setForm({
      category: item.category || 'village',
      topic_no: String(item.topic_no || ''),
      title: item.title || '',
      description: item.description || '',
    })
    setPdfFile(null)
    setExistingPdf({ url: item.pdf_url || '', path: item.pdf_path || '' })
    setShowModal(true)
  }

  const closeModal = () => {
    if (saving) return
    setShowModal(false)
    setEditingItem(null)
    setForm(EMPTY_FORM)
    setPdfFile(null)
    setExistingPdf({ url: '', path: '' })
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const isPdf = String(file.type || '').toLowerCase() === 'application/pdf' || String(file.name || '').toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      await showSwal({ icon: 'warning', title: 'รองรับเฉพาะไฟล์ PDF เท่านั้น' })
      return
    }

    setPdfFile(file)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) { await showSwal({ icon: 'warning', title: 'กรุณากรอกหัวข้อเรื่อง' }); return }
    const topicNo = Number(form.topic_no || 0)
    if (!Number.isFinite(topicNo) || topicNo <= 0) { await showSwal({ icon: 'warning', title: 'กรุณาระบุเลขเรื่องเป็นจำนวนเต็มมากกว่า 0' }); return }
    if (!editingItem && !pdfFile) { await showSwal({ icon: 'warning', title: 'กรุณาแนบไฟล์ PDF' }); return }

    try {
      setSaving(true)
      let nextPdfUrl = existingPdf.url || ''
      let nextPdfPath = existingPdf.path || ''

      if (pdfFile) {
        const uploaded = await uploadRulePdf(pdfFile, { category: form.category })
        nextPdfUrl = uploaded?.url || ''
        nextPdfPath = uploaded?.path || ''
      }

      if (editingItem) {
        await updateRuleDocument(editingItem.id, {
          category: form.category,
          topic_no: topicNo,
          title: form.title,
          description: form.description,
          pdf_url: nextPdfUrl,
          pdf_path: nextPdfPath,
        })
        if (pdfFile && existingPdf.path && existingPdf.path !== nextPdfPath) {
          await deleteRulePdfByPath(existingPdf.path)
        }
        await showSwal({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1200, showConfirmButton: false })
      } else {
        await createRuleDocument({
          category: form.category,
          topic_no: topicNo,
          title: form.title,
          description: form.description,
          pdf_url: nextPdfUrl,
          pdf_path: nextPdfPath,
        })
        await showSwal({ icon: 'success', title: 'เพิ่มกฎระเบียบสำเร็จ', timer: 1200, showConfirmButton: false })
      }

      closeModal()
      await loadData({ category: categoryFilter, search: searchTerm })
    } catch (error) {
      await showSwal({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    const result = await showSwal({
      icon: 'warning',
      title: 'ยืนยันการลบ',
      text: `ลบเรื่อง "${item.title}" ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#c0392b',
    })
    if (!result.isConfirmed) return

    try {
      await deleteRuleDocument(item.id)
      if (item.pdf_path) await deleteRulePdfByPath(item.pdf_path)
      await showSwal({ icon: 'success', title: 'ลบสำเร็จ', timer: 1000, showConfirmButton: false })
      await loadData({ category: categoryFilter, search: searchTerm })
    } catch (error) {
      await showSwal({ icon: 'error', title: 'ลบไม่สำเร็จ', text: error.message })
    }
  }

  const openPdfViewer = (url, title) => {
    const targetUrl = String(url || '').trim()
    if (!targetUrl) {
      showSwal({ icon: 'warning', title: 'ไม่พบไฟล์ PDF' })
      return
    }
    setPdfViewerUrl(targetUrl)
    setPdfViewerTitle(title || 'เอกสาร PDF')
    setShowPdfViewerModal(true)
  }

  const closePdfViewer = () => {
    setShowPdfViewerModal(false)
    setPdfViewerUrl('')
    setPdfViewerTitle('เอกสาร PDF')
  }

  return (
    <div className="pane on houses-compact">
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">📘</div>
            <div>
              <div className="ph-h1">กฎระเบียบ</div>
              <div className="ph-sub">จัดการกฎระเบียบหมู่บ้านและระเบียบการอยู่อาศัย (ไฟล์ PDF)</div>
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
            placeholder="ค้นหา หัวข้อ / รายละเอียด"
          />
          <StyledSelect value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">ทุกหมวด</option>
            {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </StyledSelect>
          <button className="btn btn-a btn-sm houses-filter-btn" onClick={() => loadData({ category: categoryFilter, search: searchTerm })}>ค้นหา</button>
        </div>
        </div>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">รายการทั้งหมด ({rules.length} เรื่อง)</div>
          <div className="houses-list-actions">
            <button className="btn btn-p btn-sm" onClick={openAddModal}>+ เพิ่มเรื่องใหม่</button>
            <button className="btn btn-g btn-sm" onClick={() => loadData({ category: categoryFilter, search: searchTerm })}>🔄 รีเฟรช</button>
          </div>
        </div>

        <div className="cb houses-table-card-body houses-main-body">
          <div className="houses-desktop-only" style={{ overflowX: 'auto' }}>
            <table className="tw houses-table houses-main-table" style={{ width: '100%', minWidth: '860px' }}>
              <thead>
                <tr>
                  <th>หมวด</th>
                  <th>เรื่องที่</th>
                  <th>หัวข้อ</th>
                  <th>รายละเอียด</th>
                  <th>ไฟล์ PDF</th>
                  <th>วันที่</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>กำลังโหลด...</td></tr>
                ) : rules.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>ยังไม่มีข้อมูล</td></tr>
                ) : rules.map((item) => (
                  <tr key={item.id}>
                    <td>{item.category_label}</td>
                    <td>{item.topic_no || '-'}</td>
                    <td><strong>{item.title}</strong></td>
                    <td style={{ maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '-'}</td>
                    <td>
                      {item.pdf_url ? (
                        <button type="button" className="btn btn-xs btn-o" onClick={() => openPdfViewer(item.pdf_url, item.title)}>📄 เปิด PDF</button>
                      ) : '-'}
                    </td>
                    <td>{formatDate(item.announcement_date || item.created_at)}</td>
                    <td>
                      <div className="td-acts">
                        <button className="btn btn-xs btn-a" onClick={() => openEditModal(item)}>แก้ไข</button>
                        <button className="btn btn-xs btn-dg" onClick={() => handleDelete(item)}>ลบ</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="houses-mobile-only" style={{ gap: 10, padding: '4px 0' }}>
            {loading ? (
              <div className="mcard-empty">กำลังโหลด...</div>
            ) : rules.length === 0 ? (
              <div className="mcard-empty">ยังไม่มีข้อมูล</div>
            ) : rules.map((item) => (
              <div key={`m-${item.id}`} className="mcard">
                <div className="mcard-top">
                  <div className="mcard-title">เรื่องที่ {item.topic_no || '-'} · {item.title}</div>
                  <span className="bd b-pr mcard-badge">{item.category_label}</span>
                </div>
                <div className="mcard-meta">
                  <span><span className="mcard-label">วันที่</span> {formatDate(item.announcement_date || item.created_at)}</span>
                  <span><span className="mcard-label">รายละเอียด</span> {item.description || '-'}</span>
                </div>
                <div className="mcard-actions">
                  {item.pdf_url && <button type="button" className="btn btn-xs btn-o" onClick={() => openPdfViewer(item.pdf_url, item.title)}>📄 เปิด PDF</button>}
                  <button className="btn btn-xs btn-a" onClick={() => openEditModal(item)}>แก้ไข</button>
                  <button className="btn btn-xs btn-dg" onClick={() => handleDelete(item)}>ลบ</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="house-mo">
          <div className="house-md house-md--md">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">📘 {editingItem ? 'แก้ไขกฎระเบียบ' : 'เพิ่มกฎระเบียบใหม่'}</div>
                <div className="house-md-sub">รองรับเฉพาะไฟล์ PDF เท่านั้น</div>
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="house-md-body">
                <section className="house-sec">
                  <div className="house-grid house-grid-2">
                    <label className="house-field">
                      <span>หมวดหมู่ *</span>
                      <StyledSelect value={form.category} onChange={(e) => setForm((cur) => ({ ...cur, category: e.target.value, topic_no: editingItem ? cur.topic_no : String(nextTopicNo(rules, e.target.value)) }))}>
                        {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </StyledSelect>
                    </label>
                    <label className="house-field">
                      <span>เรื่องที่ *</span>
                      <input type="number" min="1" step="1" value={form.topic_no} onChange={(e) => setForm((cur) => ({ ...cur, topic_no: e.target.value }))} placeholder="เช่น 1" />
                    </label>
                    <label className="house-field">
                      <span>หัวข้อเรื่อง *</span>
                      <input value={form.title} onChange={(e) => setForm((cur) => ({ ...cur, title: e.target.value }))} placeholder="เช่น ระเบียบการจอดรถ" />
                    </label>
                    <label className="house-field house-field-span-2">
                      <span>รายละเอียด (ไม่บังคับ)</span>
                      <textarea rows="4" value={form.description} onChange={(e) => setForm((cur) => ({ ...cur, description: e.target.value }))} placeholder="สรุปรายละเอียดสั้นๆ" />
                    </label>
                    <label className="house-field house-field-span-2">
                      <span>ไฟล์ PDF {editingItem ? '(เลือกใหม่เมื่อต้องการเปลี่ยนไฟล์)' : '*'}</span>
                      <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
                    </label>
                    <div className="house-field house-field-span-2" style={{ fontSize: '12px', color: 'var(--mu)' }}>
                      {pdfFile ? `ไฟล์ใหม่: ${pdfFile.name}` : (existingPdf.url ? 'ใช้ไฟล์เดิม' : 'ยังไม่ได้แนบไฟล์')}
                      {existingPdf.url && !pdfFile && (
                        <a href={existingPdf.url} target="_blank" rel="noreferrer" style={{ marginLeft: '8px', textDecoration: 'none' }}>เปิดไฟล์ปัจจุบัน</a>
                      )}
                    </div>
                  </div>
                </section>
              </div>
              <div className="house-md-foot">
                <button className="btn btn-g" type="button" onClick={closeModal}>ยกเลิก</button>
                <button className="btn btn-p" type="submit" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPdfViewerModal && (
        <div className="house-mo" style={{ zIndex: 9900 }}>
          <div className="house-md" style={{ width: 'min(96vw, 1120px)', maxWidth: '1120px', height: 'min(92vh, 860px)' }}>
            <div className="house-md-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="house-md-title">📄 {pdfViewerTitle}</div>
                <div className="house-md-sub">แสดงตัวอย่างเอกสาร PDF</div>
              </div>
              <button type="button" className="btn btn-g btn-xs" onClick={closePdfViewer}>✕ ปิด</button>
            </div>
            <div className="house-md-body" style={{ padding: 0, overflow: 'hidden' }}>
              {pdfViewerUrl ? (
                <iframe
                  title={pdfViewerTitle}
                  src={pdfViewerUrl}
                  style={{ width: '100%', height: '100%', minHeight: '66vh', border: 'none', background: '#fff' }}
                />
              ) : (
                <div style={{ padding: 16, color: 'var(--mu)' }}>ไม่พบไฟล์ PDF</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}