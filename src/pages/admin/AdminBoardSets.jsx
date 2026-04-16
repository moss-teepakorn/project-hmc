import React, { useEffect, useMemo, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import Swal from 'sweetalert2'
import { listBoardSets, createBoardSet, updateBoardSet, saveBoardMembers, setActiveBoardSet, deleteBoardSet } from '../../lib/boardSets'

const POSITIONS = ['ประธานกรรมการ', 'กรรมการการเงิน', 'กรรมการ']

const emptyMembers = () =>
  Array.from({ length: 7 }, (_, i) => ({
    member_no: i + 1,
    full_name: '',
    position: i === 0 ? 'ประธานกรรมการ' : i === 1 ? 'กรรมการการเงิน' : 'กรรมการ',
    phone: '',
  }))

const EMPTY_FORM = { set_no: '', is_active: false, note: '', members: emptyMembers() }

export default function AdminBoardSets() {
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [mode, setMode] = useState('create')
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const sorted = useMemo(() => [...sets].sort((a, b) => a.set_no - b.set_no), [sets])

  const load = async () => {
    setLoading(true)
    try {
      setSets(await listBoardSets())
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: err.message })
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setMode('create')
    setEditingId('')
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (set) => {
    setMode('edit')
    setEditingId(set.id)
    const existing = (set.board_members || []).sort((a, b) => a.member_no - b.member_no)
    setForm({
      set_no: String(set.set_no || ''),
      is_active: !!set.is_active,
      note: set.note || '',
      members: Array.from({ length: 7 }, (_, i) => {
        const m = existing[i] || {}
        return {
          member_no: i + 1,
          full_name: m.full_name || '',
          position: m.position || (i === 0 ? 'ประธานกรรมการ' : i === 1 ? 'กรรมการการเงิน' : 'กรรมการ'),
          phone: m.phone || '',
        }
      }),
    })
    setShowModal(true)
  }

  const closeModal = () => {
    if (saving) return
    setShowModal(false)
    setMode('create')
    setEditingId('')
    setForm(EMPTY_FORM)
  }

  const save = async () => {
    const setNo = Number(form.set_no)
    if (!setNo || setNo < 1) {
      return Swal.fire({ icon: 'warning', title: 'กรุณาระบุชุดที่' })
    }
    try {
      setSaving(true)
      if (mode === 'edit' && editingId) {
        await updateBoardSet(editingId, { set_no: setNo, is_active: form.is_active, note: form.note })
        await saveBoardMembers(editingId, form.members)
      } else {
        await createBoardSet({ set_no: setNo, is_active: form.is_active, note: form.note, members: form.members })
      }
      closeModal()
      Swal.fire({ icon: 'success', title: mode === 'edit' ? 'บันทึกแล้ว' : 'สร้างแล้ว', timer: 1000, showConfirmButton: false })
      load()
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleSetActive = async (set) => {
    const res = await Swal.fire({
      icon: 'question',
      title: `ตั้งชุดที่ ${set.set_no} เป็นชุดปัจจุบัน?`,
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
    })
    if (!res.isConfirmed) return
    try {
      await setActiveBoardSet(set.id)
      load()
      Swal.fire({ icon: 'success', title: 'ตั้งค่าแล้ว', timer: 1000, showConfirmButton: false })
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message })
    }
  }

  const handleDelete = async (set) => {
    const res = await Swal.fire({
      icon: 'warning',
      title: `ลบชุดที่ ${set.set_no}?`,
      text: 'ข้อมูลกรรมการทั้งหมดในชุดนี้จะถูกลบด้วย',
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#dc2626',
    })
    if (!res.isConfirmed) return
    try {
      await deleteBoardSet(set.id)
      load()
      Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1000, showConfirmButton: false })
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: err.message })
    }
  }

  const updateMember = (idx, field, value) => {
    setForm((prev) => {
      const next = [...prev.members]
      next[idx] = { ...next[idx], [field]: value }
      return { ...prev, members: next }
    })
  }

  return (
    <div className="pane on houses-compact fees-compact payments-setup-compact">
      <div className="ph houses-ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="ph-ico">👥</div>
            <div>
              <div className="ph-h1">ทะเบียนกรรมการ</div>
              <div className="ph-sub">จัดการชุดคณะกรรมการนิติบุคคล</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card houses-main-card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">รายชื่อชุดกรรมการ</div>
          <div className="houses-list-actions">
            <button className="btn btn-p btn-sm" onClick={openCreate}>+ เพิ่มชุดกรรมการ</button>
          </div>
        </div>
        <div className="cb houses-table-card-body houses-main-body">
          <div className="houses-table-wrap houses-main-wrap payments-setup-table-wrap houses-desktop-only">
            <table className="tw houses-table houses-main-table" style={{ width: '100%', minWidth: 720 }}>
              <thead>
                <tr>
                  <th>ชุดที่</th>
                  <th>ประธานกรรมการ</th>
                  <th>กรรมการการเงิน</th>
                  <th style={{ textAlign: 'center' }}>จำนวนกรรมการ</th>
                  <th>สถานะ</th>
                  <th>หมายเหตุ</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--mu)', padding: '24px 0' }}>กำลังโหลด...</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--mu)', padding: '24px 0' }}>ยังไม่มีชุดกรรมการ</td></tr>
                ) : sorted.map((set) => {
                  const members = (set.board_members || []).sort((a, b) => a.member_no - b.member_no)
                  const chairman = members.find((m) => m.position === 'ประธานกรรมการ')
                  const finance = members.find((m) => m.position === 'กรรมการการเงิน')
                  return (
                    <tr key={set.id}>
                      <td><strong>ชุดที่ {set.set_no}</strong></td>
                      <td>{chairman?.full_name || '-'}</td>
                      <td>{finance?.full_name || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{members.filter((m) => m.full_name).length} / 7</td>
                      <td>
                        {set.is_active
                          ? <span style={{ color: '#16a34a', fontWeight: 700 }}>● ปัจจุบัน</span>
                          : <span style={{ color: '#9ca3af' }}>ไม่ใช้งาน</span>}
                      </td>
                      <td>{set.note || '-'}</td>
                      <td>
                        <button className="btn btn-xs btn-o" onClick={() => openEdit(set)}>แก้ไข</button>
                        {!set.is_active && (
                          <button className="btn btn-xs btn-p" style={{ marginLeft: 6 }} onClick={() => handleSetActive(set)}>ตั้งใช้งาน</button>
                        )}
                        <button className="btn btn-xs btn-dg" style={{ marginLeft: 6 }} onClick={() => handleDelete(set)}>ลบ</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="houses-mobile-only">
            {loading ? (
              <div className="mcard-empty">กำลังโหลด...</div>
            ) : sorted.length === 0 ? (
              <div className="mcard-empty">ยังไม่มีชุดกรรมการ</div>
            ) : sorted.map((set) => {
              const members = (set.board_members || []).sort((a, b) => a.member_no - b.member_no)
              const chairman = members.find((m) => m.position === 'ประธานกรรมการ')
              const finance = members.find((m) => m.position === 'กรรมการการเงิน')
              const memberCount = members.filter((m) => m.full_name).length
              return (
                <div key={`m-${set.id}`} className="mcard">
                  <div className="mcard-top">
                    <div className="mcard-title">ชุดที่ {set.set_no}</div>
                    <span className={`bd ${set.is_active ? 'b-ok' : 'b-mu'} mcard-badge`}>{set.is_active ? 'ปัจจุบัน' : 'ไม่ใช้งาน'}</span>
                  </div>
                  <div className="mcard-meta">
                    <span><span className="mcard-label">ประธาน</span> {chairman?.full_name || '-'}</span>
                    <span><span className="mcard-label">การเงิน</span> {finance?.full_name || '-'}</span>
                    <span><span className="mcard-label">จำนวนกรรมการ</span> {memberCount}/7</span>
                    <span><span className="mcard-label">หมายเหตุ</span> {set.note || '-'}</span>
                  </div>
                  <div className="mcard-actions">
                    <button className="btn btn-xs btn-o" onClick={() => openEdit(set)}>แก้ไข</button>
                    {!set.is_active && (
                      <button className="btn btn-xs btn-p" onClick={() => handleSetActive(set)}>ตั้งใช้งาน</button>
                    )}
                    <button className="btn btn-xs btn-dg" onClick={() => handleDelete(set)}>ลบ</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="house-mo">
          <div className="house-md house-md--md">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">{mode === 'edit' ? 'แก้ไขชุดกรรมการ' : 'เพิ่มชุดกรรมการ'}</div>
                <div className="house-md-sub">ข้อมูลคณะกรรมการนิติบุคคล</div>
              </div>
            </div>
            <div className="house-md-body">
              <section className="house-sec">
                <div className="house-grid" style={{ gridTemplateColumns: '1fr 1fr 2fr', gap: 10, marginBottom: 20 }}>
                  <label className="house-field">
                    <span>ชุดที่ *</span>
                    <input
                      type="number"
                      value={form.set_no}
                      min={1}
                      onChange={(e) => setForm((p) => ({ ...p, set_no: e.target.value }))}
                    />
                  </label>
                  <label className="house-field">
                    <span>สถานะ</span>
                    <StyledSelect
                      value={form.is_active ? '1' : '0'}
                      onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.value === '1' }))}
                    >
                      <option value="1">ชุดปัจจุบัน</option>
                      <option value="0">ไม่ใช้งาน</option>
                    </StyledSelect>
                  </label>
                  <label className="house-field">
                    <span>หมายเหตุ</span>
                    <input
                      value={form.note}
                      onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                      placeholder="เช่น วาระที่ 1/2566"
                    />
                  </label>
                </div>

                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx)', marginBottom: 8 }}>รายชื่อกรรมการ</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 36, textAlign: 'center', padding: '6px 8px', border: '1px solid var(--bo)', background: 'var(--bgl)', fontSize: 12 }}>ที่</th>
                        <th style={{ padding: '6px 8px', border: '1px solid var(--bo)', background: 'var(--bgl)', fontSize: 12 }}>ชื่อ-นามสกุล</th>
                        <th style={{ width: 172, padding: '6px 8px', border: '1px solid var(--bo)', background: 'var(--bgl)', fontSize: 12 }}>ตำแหน่ง</th>
                        <th style={{ width: 130, padding: '6px 8px', border: '1px solid var(--bo)', background: 'var(--bgl)', fontSize: 12 }}>เบอร์โทร</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.members.map((m, i) => (
                        <tr key={i}>
                          <td style={{ textAlign: 'center', padding: '5px 8px', border: '1px solid var(--bo)', fontSize: 12, color: 'var(--mu)' }}>{i + 1}</td>
                          <td style={{ padding: '4px 6px', border: '1px solid var(--bo)' }}>
                            <input
                              style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 12, padding: '2px 4px' }}
                              value={m.full_name}
                              onChange={(e) => updateMember(i, 'full_name', e.target.value)}
                              placeholder={`กรรมการที่ ${i + 1}`}
                            />
                          </td>
                          <td style={{ padding: '4px 6px', border: '1px solid var(--bo)' }}>
                            <StyledSelect
                              style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 12, padding: '2px 4px' }}
                              value={m.position}
                              onChange={(e) => updateMember(i, 'position', e.target.value)}
                            >
                              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                            </StyledSelect>
                          </td>
                          <td style={{ padding: '4px 6px', border: '1px solid var(--bo)' }}>
                            <input
                              style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 12, padding: '2px 4px' }}
                              value={m.phone}
                              onChange={(e) => updateMember(i, 'phone', e.target.value)}
                              placeholder="-"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <div className="house-md-foot">
              <button className="btn btn-p" type="button" disabled={saving} onClick={save}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button className="btn btn-g" type="button" disabled={saving} onClick={closeModal}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}