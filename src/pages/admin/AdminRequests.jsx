import React, { useCallback, useEffect, useState } from 'react'
import StyledSelect from '../../components/StyledSelect'
import Swal from 'sweetalert2'
import {
  listVehicleRequests,
  approveVehicleRequest,
  updateVehicleRequestStatus,
  cancelVehicleRequest,
} from '../../lib/vehicleRequests'
import { listVehicles, updateVehicle } from '../../lib/vehicles'
import {
  listAccountRequests,
  approveAccountRequest,
  updateAccountRequestStatus,
  cancelAccountRequest,
  extractHouseProfileUpdatePayload,
  extractHouseProfileUpdateRejectReason,
  rejectHouseProfileUpdateRequest,
} from '../../lib/accountRequests'
import { useAuth } from '../../contexts/AuthContext'

function blurActive() {
  const el = document.activeElement
  if (el instanceof HTMLElement) el.blur()
}

function showSwal(options) {
  blurActive()
  return Swal.fire({ returnFocus: false, ...options })
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('th-TH')
}

function getRequestStatusBadge(status) {
  if (status === 'pending') return { className: 'bd b-wn', label: 'รอดำเนินการ' }
  if (status === 'approved') return { className: 'bd b-ok', label: 'อนุมัติแล้ว' }
  if (status === 'rejected') return { className: 'bd b-dg', label: 'ปฏิเสธ' }
  if (status === 'cancelled') return { className: 'bd b-mu', label: 'ยกเลิก' }
  return { className: 'bd b-mu', label: status }
}

const CATEGORY_LIST = [
  { key: 'all', icon: '📋', label: 'ทั้งหมด' },
  { key: 'vehicle_add', icon: '🆕', label: 'ขอเพิ่มรถ' },
  { key: 'vehicle_edit', icon: '✏️', label: 'ขอแก้ไขรถ' },
  { key: 'account_register', icon: '👤', label: 'ลงทะเบียนผู้ใช้งาน' },
  { key: 'house_profile_update', icon: '🏠', label: 'แก้ไขข้อมูลส่วนตัว' },
]

const AdminRequests = () => {
  const { profile } = useAuth()
  const [vehicleRequests, setVehicleRequests] = useState([])
  const [adminPendingVehicles, setAdminPendingVehicles] = useState([])
  const [accountRequests, setAccountRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [saving, setSaving] = useState(false)
  const [approvalDrafts, setApprovalDrafts] = useState({})

  const loadRequests = useCallback(async (override = {}) => {
    try {
      setLoading(true)
      const status = override.status ?? statusFilter
      const [vehicleRows, accountRows, pendingVehicles] = await Promise.all([
        listVehicleRequests({ status }),
        listAccountRequests({ status }),
        status === 'all' || status === 'pending'
          ? listVehicles({ status: 'pending' })
          : Promise.resolve([]),
      ])

      const requestVehicleKeySet = new Set(
        (vehicleRows || [])
          .filter((row) => row.status === 'pending')
          .map((row) => [
            String(row.house_id || ''),
            String(row.license_plate || '').trim().toLowerCase(),
            String(row.province || '').trim().toLowerCase(),
            String(row.vehicle_type || '').trim().toLowerCase(),
          ].join('|')),
      )

      const fallbackVehicles = (pendingVehicles || [])
        .filter((row) => {
          const key = [
            String(row.house_id || ''),
            String(row.license_plate || '').trim().toLowerCase(),
            String(row.province || '').trim().toLowerCase(),
            String(row.vehicle_type || '').trim().toLowerCase(),
          ].join('|')
          return !requestVehicleKeySet.has(key)
        })
        .map((row) => ({
          id: `fallback-vehicle-${row.id}`,
          vehicle_id: row.id,
          house_id: row.house_id,
          request_type: 'add',
          status: 'pending',
          license_plate: row.license_plate,
          province: row.province,
          brand: row.brand,
          model: row.model,
          color: row.color,
          vehicle_type: row.vehicle_type,
          vehicle_status: row.status,
          parking_location: row.parking_location,
          parking_lock_no: row.parking_lock_no,
          parking_fee: row.parking_fee,
          note: row.note,
          created_at: row.created_at,
          houses: row.houses || null,
          __kind: 'vehicle_fallback',
          is_fallback: true,
        }))

      setVehicleRequests(vehicleRows)
      setAdminPendingVehicles(fallbackVehicles)
      setAccountRequests(accountRows)
    } catch (error) {
      await showSwal({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error.message })
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const requests = [
    ...vehicleRequests.map((request) => ({ ...request, __kind: 'vehicle' })),
    ...adminPendingVehicles,
    ...accountRequests.map((request) => ({ ...request, __kind: 'account' })),
  ].sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())

  const filteredRequests = requests.filter((request) => {
    if (categoryFilter === 'vehicle_add') {
      return (request.__kind === 'vehicle' && request.request_type === 'add') || request.__kind === 'vehicle_fallback'
    }
    if (categoryFilter === 'vehicle_edit') return request.__kind === 'vehicle' && request.request_type === 'edit'
    if (categoryFilter === 'account_register') return request.__kind === 'account' && request.request_type === 'register'
    if (categoryFilter === 'house_profile_update') return request.__kind === 'account' && request.request_type === 'house_profile_update'
    return true
  })

  const pendingVehicleAddCount = vehicleRequests.filter((request) => request.status === 'pending' && request.request_type === 'add').length + adminPendingVehicles.length
  const pendingVehicleEditCount = vehicleRequests.filter((request) => request.status === 'pending' && request.request_type === 'edit').length
  const pendingAccountRegisterCount = accountRequests.filter((request) => request.status === 'pending' && request.request_type === 'register').length
  const pendingHouseProfileUpdateCount = accountRequests.filter((request) => request.status === 'pending' && request.request_type === 'house_profile_update').length
  const pendingAllCount = pendingVehicleAddCount + pendingVehicleEditCount + pendingAccountRegisterCount + pendingHouseProfileUpdateCount

  function getApprovalDraft(req) {
    return approvalDrafts[req.id] || {
      parking_lock_no: req.parking_lock_no || req.vehicles?.parking_lock_no || '',
      parking_fee: String(req.parking_fee ?? req.vehicles?.parking_fee ?? 0),
    }
  }

  function handleApprovalDraftChange(req, field, value) {
    setApprovalDrafts((prev) => ({
      ...prev,
      [req.id]: {
        ...getApprovalDraft(req),
        [field]: value,
      },
    }))
  }

  async function handleApproveVehicle(req) {
    if (req.__kind === 'vehicle_fallback') {
      const { isConfirmed } = await showSwal({
        icon: 'question',
        title: 'อนุมัติรถรายการนี้?',
        text: `จะเปลี่ยนสถานะรถ ${req.license_plate || '-'} เป็น ใช้งาน`,
        showCancelButton: true,
        confirmButtonText: 'อนุมัติ',
        cancelButtonText: 'ยกเลิก',
      })
      if (!isConfirmed) return

      try {
        setSaving(true)
        await updateVehicle(req.vehicle_id, { status: 'active' })
        await showSwal({ icon: 'success', title: 'อนุมัติเรียบร้อย', timer: 1400, showConfirmButton: false })
        await loadRequests({ status: statusFilter })
      } catch (error) {
        await showSwal({ icon: 'error', title: 'อนุมัติไม่สำเร็จ', text: error.message })
      } finally {
        setSaving(false)
      }
      return
    }

    const draft = getApprovalDraft(req)
    const approvedRequest = {
      ...req,
      parking_lock_no: req.parking_location === 'ส่วนกลาง' ? draft.parking_lock_no.trim() : null,
      parking_fee: Number(String(draft.parking_fee).replace(/,/g, '')) || 0,
    }

    const { isConfirmed } = await showSwal({
      icon: 'question',
      title: 'อนุมัติคำขอ?',
      text: req.request_type === 'add'
        ? `ระบบจะสร้างรถ ${approvedRequest.license_plate || '-'} ในระบบ`
        : `ระบบจะอัปเดตข้อมูลรถ ${approvedRequest.license_plate || '-'}`,
      showCancelButton: true,
      confirmButtonText: 'อนุมัติ',
      cancelButtonText: 'ยกเลิก',
    })
    if (!isConfirmed) return

    try {
      setSaving(true)
      await approveVehicleRequest(req.id, approvedRequest)
      await showSwal({ icon: 'success', title: 'อนุมัติเรียบร้อย', timer: 1400, showConfirmButton: false })
      await loadRequests({ status: statusFilter })
      setApprovalDrafts((prev) => {
        const next = { ...prev }
        delete next[req.id]
        return next
      })
    } catch (error) {
      await showSwal({ icon: 'error', title: 'อนุมัติไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleApproveAccount(req) {
    const isHouseProfileUpdateRequest = req.request_type === 'house_profile_update'
    const { isConfirmed } = await showSwal({
      icon: 'question',
      title: isHouseProfileUpdateRequest ? 'อนุมัติคำขอแก้ไขข้อมูลบ้าน?' : 'อนุมัติคำขอลงทะเบียน?',
      text: isHouseProfileUpdateRequest
        ? `จะอัปเดตข้อมูลบ้าน ${req.houses?.house_no || '-'} ตามคำขอของลูกบ้าน`
        : `จะเปิดใช้งานบัญชี ${req.requested_username || req.profiles?.username || '-'}`,
      showCancelButton: true,
      confirmButtonText: 'อนุมัติ',
      cancelButtonText: 'ยกเลิก',
    })
    if (!isConfirmed) return

    try {
      setSaving(true)
      await approveAccountRequest(req.id, { reviewedById: profile?.id || null })
      await showSwal({ icon: 'success', title: 'อนุมัติเรียบร้อย', timer: 1400, showConfirmButton: false })
      await loadRequests({ status: statusFilter })
    } catch (error) {
      await showSwal({ icon: 'error', title: 'อนุมัติไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleReject(req) {
    const { isConfirmed, value: reason } = await showSwal({
      icon: 'warning',
      title: 'ปฏิเสธคำขอ',
      html: '<p style="margin-bottom:8px;font-size:13px;">กรุณาระบุเหตุผล เพื่อให้ผู้ใช้งานแก้ไขและส่งใหม่</p>',
      input: 'textarea',
      inputPlaceholder: 'เช่น ข้อมูลไม่ครบ / เบอร์โทรไม่ตรงกับทะเบียนบ้าน',
      inputAttributes: { rows: 3 },
      showCancelButton: true,
      confirmButtonText: 'ปฏิเสธ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#c0392b',
      preConfirm: (val) => {
        if (!val?.trim()) { Swal.showValidationMessage('กรุณาระบุเหตุผล'); return false }
        return val.trim()
      },
    })
    if (!isConfirmed || !reason) return

    try {
      setSaving(true)
      if (req.__kind === 'account') {
        if (req.request_type === 'house_profile_update') {
          await rejectHouseProfileUpdateRequest(req.id, { reason, reviewedById: profile?.id || null })
        } else {
          await updateAccountRequestStatus(req.id, { status: 'rejected', adminNote: reason, reviewedById: profile?.id || null })
        }
      } else if (req.__kind === 'vehicle_fallback') {
        await updateVehicle(req.vehicle_id, { status: 'removed', note: reason })
      } else {
        await updateVehicleRequestStatus(req.id, { status: 'rejected', adminNote: reason })
      }
      await showSwal({ icon: 'info', title: 'ปฏิเสธแล้ว', text: 'ผู้ส่งคำขอจะเห็นเหตุผลในระบบ', timer: 1600, showConfirmButton: false })
      await loadRequests({ status: statusFilter })
    } catch (error) {
      await showSwal({ icon: 'error', title: 'ไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(req) {
    const { isConfirmed } = await showSwal({
      icon: 'warning',
      title: 'ยกเลิกคำขอ?',
      text: 'เมื่อยกเลิกแล้วจะแก้ไขไม่ได้อีก',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ไม่',
      confirmButtonColor: '#c0392b',
    })
    if (!isConfirmed) return

    try {
      setSaving(true)
      if (req.__kind === 'account') {
        await cancelAccountRequest(req.id, { reviewedById: profile?.id || null })
      } else if (req.__kind === 'vehicle_fallback') {
        await updateVehicle(req.vehicle_id, { status: 'removed' })
      } else {
        await cancelVehicleRequest(req.id)
      }
      await showSwal({ icon: 'success', title: 'ยกเลิกแล้ว', timer: 1200, showConfirmButton: false })
      await loadRequests({ status: statusFilter })
    } catch (error) {
      await showSwal({ icon: 'error', title: 'ไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pane on requests-compact">
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="ph-ico">📝</div>
            <div>
              <div className="ph-h1">คำขอแก้ไข</div>
              <div className="ph-sub">รายการรอการอนุมัติ ({pendingAllCount} รายการ)</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card report-filter-card admin-search-filter-card">
        <div className="cb">
          <div className="houses-filter-row request-search-row">
            <StyledSelect className="request-search-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="pending">รอดำเนินการ</option>
              <option value="approved">อนุมัติแล้ว</option>
              <option value="rejected">ปฏิเสธ</option>
              <option value="cancelled">ยกเลิก</option>
              <option value="all">ทั้งหมด</option>
            </StyledSelect>
            <button className="btn btn-a btn-sm request-search-refresh" onClick={() => loadRequests({ status: statusFilter })}>🔄 รีเฟรช</button>
          </div>
        </div>
      </div>

      <div className="request-layout" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start', marginTop: 14 }}>
        <div className="card request-filter-card" style={{ position: 'sticky', top: 16 }}>
          <div className="ch"><div className="ch-ico">📋</div><div className="ct">หมวดคำขอ</div></div>
          <div className="cb request-filter-grid" style={{ padding: '8px 0' }}>
            {CATEGORY_LIST.map((cat) => {
              const count = cat.key === 'all'
                ? pendingAllCount
                : cat.key === 'vehicle_add'
                  ? pendingVehicleAddCount
                  : cat.key === 'vehicle_edit'
                    ? pendingVehicleEditCount
                    : cat.key === 'account_register'
                      ? pendingAccountRegisterCount
                      : pendingHouseProfileUpdateCount

              return (
                <div
                  key={cat.key}
                  onClick={() => setCategoryFilter(cat.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    cursor: 'pointer',
                    borderRadius: 8,
                    margin: '2px 8px',
                    background: categoryFilter === cat.key ? 'var(--prl)' : 'transparent',
                    color: categoryFilter === cat.key ? 'var(--pr)' : 'var(--tx)',
                    fontWeight: categoryFilter === cat.key ? 700 : 400,
                    transition: 'background .15s',
                  }}
                >
                  <span>{cat.icon} {cat.label}</span>
                  {count > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{count}</span>}
                </div>
              )
            })}
          </div>
          <div className="cb" style={{ padding: '8px 16px', borderTop: '1px solid var(--bo)' }}>
            <div style={{ fontSize: 12, color: 'var(--mu)', textAlign: 'center' }}>
              รวมรอดำเนินการ: <strong style={{ color: 'var(--pr)' }}>{pendingAllCount}</strong> รายการ
            </div>
          </div>
        </div>

        <div className="request-item-list">
          {loading ? (
            <div className="card"><div className="cb" style={{ textAlign: 'center', color: 'var(--mu)', padding: '24px 0' }}>กำลังโหลด...</div></div>
          ) : filteredRequests.length === 0 ? (
            <div className="card"><div className="cb" style={{ textAlign: 'center', color: 'var(--mu)', padding: '24px 0' }}>ไม่พบคำขอ</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredRequests.map((req) => {
                const badge = getRequestStatusBadge(req.status)
                const lockAfter = req.status === 'approved' || req.status === 'cancelled'
                const isAccountRequest = req.__kind === 'account'
                const isHouseProfileUpdateRequest = isAccountRequest && req.request_type === 'house_profile_update'
                const isFallbackVehicle = req.__kind === 'vehicle_fallback'
                const requestedHousePayload = isHouseProfileUpdateRequest
                  ? (extractHouseProfileUpdatePayload(req.admin_note) || req.request_payload || {})
                  : null
                const houseRejectReason = isHouseProfileUpdateRequest
                  ? extractHouseProfileUpdateRejectReason(req.admin_note)
                  : ''

                return (
                  <div key={`${req.__kind}-${req.id}`} className="card">
                    <div className="ch" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <div className="ch-ico">{isHouseProfileUpdateRequest ? '🏠' : isAccountRequest ? '👤' : req.request_type === 'add' ? '🆕' : '✏️'}</div>
                        <div>
                          <div className="ct">
                            {isAccountRequest
                              ? (isHouseProfileUpdateRequest
                                ? `แก้ไขข้อมูลบ้าน — บ้าน ${req.houses?.house_no || '-'} (${req.profiles?.full_name || req.houses?.owner_name || '-'})`
                                : `ลงทะเบียนผู้ใช้งาน — ${req.requested_username || req.profiles?.username || '-'}`)
                              : `${req.request_type === 'add' ? 'ขอเพิ่มรถ' : 'ขอแก้ไขรถ'} — ${req.license_plate || '-'}`}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.65)', marginTop: 2 }}>
                            บ้าน {req.houses?.house_no || '-'} ซอย {req.houses?.soi || '-'} · {formatDate(req.created_at)}
                            {isFallbackVehicle ? ' · บันทึกโดยผู้ดูแลระบบ' : ''}
                          </div>
                        </div>
                      </div>
                      <span className={badge.className}>{badge.label}</span>
                    </div>

                    <div className="cb" style={{ padding: 14 }}>
                      {isAccountRequest ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '6px 14px', marginBottom: 12 }}>
                          {(
                            isHouseProfileUpdateRequest
                              ? [
                                { label: 'บ้านเลขที่', value: req.houses?.house_no },
                                { label: 'ชื่อเจ้าของบ้าน', value: req.houses?.owner_name },
                                { label: 'ผู้อยู่อาศัย (เดิม)', value: req.houses?.resident_name || '-' },
                                { label: 'ผู้อยู่อาศัย (ขอแก้ไข)', value: requestedHousePayload?.resident_name || '-' },
                                { label: 'ผู้ติดต่อหลัก (เดิม)', value: req.houses?.contact_name || '-' },
                                { label: 'ผู้ติดต่อหลัก (ขอแก้ไข)', value: requestedHousePayload?.contact_name || '-' },
                                { label: 'เบอร์โทร (เดิม)', value: req.houses?.phone || '-' },
                                { label: 'เบอร์โทร (ขอแก้ไข)', value: requestedHousePayload?.phone || '-' },
                                { label: 'LINE ID (เดิม)', value: req.houses?.line_id || '-' },
                                { label: 'LINE ID (ขอแก้ไข)', value: requestedHousePayload?.line_id || '-' },
                                { label: 'Email (เดิม)', value: req.houses?.email || '-' },
                                { label: 'Email (ขอแก้ไข)', value: requestedHousePayload?.email || '-' },
                              ]
                              : [
                                { label: 'Username', value: req.requested_username || req.profiles?.username },
                                { label: 'บ้านเลขที่', value: req.houses?.house_no },
                                { label: 'ชื่อเจ้าของบ้าน', value: req.houses?.owner_name },
                                { label: 'เบอร์โทรบ้าน', value: req.requested_phone || req.houses?.phone },
                              ]
                          ).filter((f) => f.value).map((f) => (
                            <div key={f.label} style={{ fontSize: 12.5 }}>
                              <span style={{ color: 'var(--mu)', fontSize: 11 }}>{f.label}</span>
                              <div style={{ fontWeight: 600, color: 'var(--tx)', marginTop: 1 }}>{f.value}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '6px 14px', marginBottom: 12 }}>
                            {[
                              { label: 'ทะเบียน', value: req.license_plate },
                              { label: 'จังหวัด', value: req.province },
                              { label: 'ยี่ห้อ / รุ่น', value: [req.brand, req.model].filter(Boolean).join(' ') },
                              { label: 'สี', value: req.color },
                              { label: 'ประเภทรถ', value: req.vehicle_type },
                              { label: 'สถานะการใช้', value: req.vehicle_status === 'active' ? 'ใช้งาน' : req.vehicle_status === 'inactive' ? 'ไม่ได้ใช้' : req.vehicle_status },
                              { label: 'ที่จอด', value: req.parking_location },
                              { label: 'Lock No.', value: req.parking_lock_no },
                              { label: 'ค่าจอด', value: req.parking_fee > 0 ? `฿${formatMoney(req.parking_fee)}` : null },
                            ].filter((f) => f.value).map((f) => (
                              <div key={f.label} style={{ fontSize: 12.5 }}>
                                <span style={{ color: 'var(--mu)', fontSize: 11 }}>{f.label}</span>
                                <div style={{ fontWeight: 600, color: 'var(--tx)', marginTop: 1 }}>{f.value}</div>
                              </div>
                            ))}
                          </div>

                          {req.note && (
                            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, marginBottom: 10 }}>
                              📝 หมายเหตุลูกบ้าน: {req.note}
                            </div>
                          )}

                          {req.status === 'pending' && !isFallbackVehicle && (
                            <div style={{ background: '#f8fafc', border: '1px solid var(--bo)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>ข้อมูลที่นิติกำหนดก่อนอนุมัติ</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                                <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
                                  <span style={{ color: 'var(--mu)', fontSize: 11 }}>Lock No.</span>
                                  <input
                                    value={getApprovalDraft(req).parking_lock_no}
                                    onChange={(e) => handleApprovalDraftChange(req, 'parking_lock_no', e.target.value)}
                                    placeholder={req.parking_location === 'ส่วนกลาง' ? 'เช่น A-12' : 'ไม่มีการใช้ Lock No.'}
                                    disabled={req.parking_location !== 'ส่วนกลาง' || saving}
                                  />
                                </label>
                                <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
                                  <span style={{ color: 'var(--mu)', fontSize: 11 }}>ค่าจอด</span>
                                  <input
                                    value={getApprovalDraft(req).parking_fee}
                                    onChange={(e) => handleApprovalDraftChange(req, 'parking_fee', e.target.value)}
                                    placeholder="0"
                                    inputMode="numeric"
                                    disabled={saving}
                                  />
                                </label>
                              </div>
                            </div>
                          )}

                          {Array.isArray(req.image_urls) && req.image_urls.length > 0 && (
                            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
                              {req.image_urls.map((url, idx) => (
                                <button
                                  key={`${url}-${idx}`}
                                  type="button"
                                  onClick={() => showSwal({ imageUrl: url, showConfirmButton: false, showCloseButton: true, width: 'auto', background: '#0f172a' })}
                                  style={{ width: 72, height: 72, borderRadius: 8, border: '1px solid var(--bo)', padding: 0, overflow: 'hidden', cursor: 'pointer', background: 'var(--bg)' }}
                                >
                                  <img src={url} alt={`car-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </button>
                              ))}
                            </div>
                          )}

                          {req.request_type === 'edit' && req.vehicles && (
                            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                              <div style={{ fontWeight: 700, color: 'var(--mu)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 10.5 }}>ข้อมูลปัจจุบันของรถ</div>
                              <span>{req.vehicles.license_plate} {req.vehicles.brand} {req.vehicles.model} · {req.vehicles.color} · {req.vehicles.parking_location}</span>
                            </div>
                          )}
                        </>
                      )}

                      {isHouseProfileUpdateRequest && houseRejectReason && (
                        <div style={{ background: 'var(--prl)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12.5, color: 'var(--dg)' }}>
                          💬 หมายเหตุนิติ: {houseRejectReason}
                        </div>
                      )}

                      {req.admin_note && !isHouseProfileUpdateRequest && (
                        <div style={{ background: 'var(--prl)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12.5, color: 'var(--dg)' }}>
                          💬 หมายเหตุนิติ: {req.admin_note}
                        </div>
                      )}

                      {!lockAfter && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                          {req.status === 'pending' && (
                            <>
                              <button className="btn btn-p btn-sm" disabled={saving} onClick={() => (isAccountRequest ? handleApproveAccount(req) : handleApproveVehicle(req))}>✅ อนุมัติ</button>
                              <button className="btn btn-sm" style={{ background: '#f97316', color: '#fff', border: 'none' }} disabled={saving} onClick={() => handleReject(req)}>❌ ปฏิเสธ</button>
                            </>
                          )}
                          <button className="btn btn-dg btn-sm" disabled={saving} onClick={() => handleCancel(req)}>🚫 ยกเลิก</button>
                        </div>
                      )}

                      {lockAfter && (
                        <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 4 }}>
                          {req.status === 'approved' ? `✅ อนุมัติเมื่อ ${formatDate(req.reviewed_at)}` : `🚫 ยกเลิกแล้ว`}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminRequests