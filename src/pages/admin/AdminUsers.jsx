import React, { useState, useEffect, useMemo } from 'react'
import StyledSelect from '../../components/StyledSelect'
import Swal from 'sweetalert2'
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  deleteUsersBulk,
  listHouseOptions,
  getHouseDetail,
  formatDateTime,
} from '../../lib/users'

const EMPTY_FORM = {
  username: '',
  password: '',
  full_name: '',
  email: '',
  phone: '',
  role: 'resident',
  is_active: true,
  house_id: '',
}

const AdminUsers = () => {
  const [users, setUsers] = useState([])
  const [houses, setHouses] = useState([])
  const [selectedHouse, setSelectedHouse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [statusFilter, setStatusFilter] = useState('all')
  const [soiFilter, setSoiFilter] = useState('all')
  const [houseFilter, setHouseFilter] = useState('all')
  const [selectedUserIds, setSelectedUserIds] = useState([])

  const houseById = useMemo(() => {
    return new Map((houses || []).map((house) => [String(house.id), house]))
  }, [houses])

  const soiOptions = useMemo(() => {
    return [...new Set((houses || []).map((house) => String(house.soi || '').trim()).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b))
  }, [houses])

  useEffect(() => {
    loadUsers()
    loadHouses()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const data = await getUsers()
      setUsers(data)
      setSelectedUserIds((prev) => {
        const available = new Set((data || []).map((user) => String(user.id)))
        return prev.filter((id) => available.has(id))
      })
    } catch (error) {
      console.error('Error loading users:', error)
      await Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  const loadHouses = async () => {
    try {
      const rows = await listHouseOptions()
      setHouses(rows)
    } catch (error) {
      console.error('Error loading houses:', error)
      await Swal.fire({ icon: 'error', title: 'โหลดบ้านไม่สำเร็จ', text: error.message })
    }
  }

  const getHouseNo = (houseId) => {
    if (!houseId) return '-'
    const house = houseById.get(String(houseId))
    return house?.house_no || '-'
  }

  const getHouseOwnerName = (houseId, fallback = '-') => {
    if (!houseId) return fallback
    const house = houseById.get(String(houseId))
    return house?.owner_name || fallback
  }

  const getRoleText = (role) => (role === 'admin' ? 'ผู้ดูแลระบบ' : 'ลูกบ้าน')

  const filteredUsers = users.filter((user) => {
    const house = houseById.get(String(user.house_id || ''))
    if (statusFilter === 'active' && !user.is_active) return false
    if (statusFilter === 'inactive' && user.is_active) return false
    if (soiFilter !== 'all' && String(house?.soi || '') !== String(soiFilter)) return false
    if (houseFilter !== 'all' && String(user.house_id || '') !== String(houseFilter)) return false
    return true
  })

  const selectedIdSet = new Set(selectedUserIds)
  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((user) => selectedIdSet.has(String(user.id)))

  const toggleUserSelection = (userId) => {
    const key = String(userId)
    setSelectedUserIds((prev) => (
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]
    ))
  }

  const toggleSelectAllFiltered = () => {
    setSelectedUserIds((prev) => {
      const prevSet = new Set(prev)
      if (allFilteredSelected) {
        return prev.filter((id) => !filteredUsers.some((user) => String(user.id) === id))
      }
      filteredUsers.forEach((user) => prevSet.add(String(user.id)))
      return Array.from(prevSet)
    })
  }

  const handleDeleteSelectedUsers = async () => {
    if (selectedUserIds.length === 0) return
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบผู้ใช้งานที่เลือก',
      text: `ต้องการลบ ${selectedUserIds.length} รายการหรือไม่`,
      showCancelButton: true,
      confirmButtonText: 'ลบทั้งหมด',
      cancelButtonText: 'ยกเลิก',
    })
    if (!result.isConfirmed) return

    try {
      const deletedCount = await deleteUsersBulk(selectedUserIds)
      await loadUsers()
      setSelectedUserIds([])
      await Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', text: `ลบผู้ใช้งานแล้ว ${deletedCount} รายการ` })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: error.message })
    }
  }

  const openAddModal = () => {
    setEditingUser(null)
    setSelectedHouse(null)
    setForm({ ...EMPTY_FORM, role: 'resident' })
    setShowModal(true)
  }

  const openEditModal = async (user) => {
    setEditingUser(user)
    setForm({
      username: user.username || '',
      password: '',
      full_name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'resident',
      is_active: user.is_active ?? true,
      house_id: user.house_id || '',
    })

    if (user.house_id) {
      try {
        const detail = await getHouseDetail(user.house_id)
        setSelectedHouse(detail)
      } catch {
        setSelectedHouse(null)
      }
    } else {
      setSelectedHouse(null)
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingUser(null)
    setForm(EMPTY_FORM)
    setSelectedHouse(null)
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    if (name === 'is_active') {
      setForm((prev) => ({ ...prev, is_active: value === 'true' }))
      return
    }
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectHouse = async (event) => {
    const houseId = event.target.value
    setForm((prev) => ({ ...prev, house_id: houseId }))

    if (!houseId) {
      setSelectedHouse(null)
      return
    }

    try {
      const detail = await getHouseDetail(houseId)
      setSelectedHouse(detail)
      setForm((prev) => ({
        ...prev,
        full_name: detail?.owner_name || detail?.resident_name || detail?.contact_name || prev.full_name,
        email: detail?.email || prev.email,
        phone: detail?.phone || prev.phone,
      }))
    } catch (error) {
      console.error('Error loading house detail:', error)
      setSelectedHouse(null)
      await Swal.fire({ icon: 'error', title: 'โหลดข้อมูลบ้านไม่สำเร็จ', text: error.message })
    }
  }

  const validateForm = () => {
    if (!form.house_id) return 'กรุณาเลือกบ้านเลขที่'
    if (!form.username.trim()) return 'กรุณากรอก username'
    if (!form.password.trim()) return 'กรุณากรอก password'
    if (!form.full_name.trim()) return 'กรุณากรอกชื่อ-นามสกุล'
    if (!form.email.trim()) return 'กรุณากรอก email'
    if (!form.phone.trim()) return 'กรุณากรอกเบอร์โทร'
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      await Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: validationError })
      return
    }

    setSaving(true)
    try {
      const payload = {
        username: form.username,
        password: form.password,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        is_active: form.is_active,
        house_id: form.house_id,
      }

      if (editingUser) {
        await updateUser(editingUser.id, payload)
      } else {
        await createUser(payload)
      }
      closeModal()
      await loadUsers()
      setSelectedUserIds([])
      await Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'บันทึกข้อมูลผู้ใช้เรียบร้อย' })
    } catch (error) {
      console.error('Save user failed:', error)
      await Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async (user) => {
    const result = await Swal.fire({
      icon: 'question',
      title: 'ยืนยันการลบผู้ใช้งาน',
      text: user.username || user.full_name || user.id,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
    })
    if (!result.isConfirmed) return

    try {
      await deleteUser(user.id)
      await loadUsers()
      setSelectedUserIds((prev) => prev.filter((id) => id !== String(user.id)))
      await Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', text: 'ลบผู้ใช้งานเรียบร้อย' })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: error.message })
    }
  }

  const handleQuickResetPassword = async (user) => {
    const result = await Swal.fire({
      title: `เปลี่ยนรหัสผ่าน: ${user.username}`,
      input: 'password',
      inputPlaceholder: 'กรอกรหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)',
      showCancelButton: true,
      confirmButtonText: 'บันทึก',
      cancelButtonText: 'ยกเลิก',
      inputValidator: (value) => {
        if (!value) return 'กรุณากรอกรหัสผ่านใหม่'
        if (value.length < 6) return 'รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร'
        return undefined
      },
    })
    if (!result.isConfirmed) return

    try {
      await updateUser(user.id, { password: result.value })
      await Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'เปลี่ยนรหัสผ่านเรียบร้อย' })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: error.message })
    }
  }

  return (
    <div className="pane on houses-compact">
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">👥</div>
            <div>
              <div className="ph-h1">ผู้ใช้งานระบบ</div>
              <div className="ph-sub">จัดการโปรไฟล์</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card report-filter-card admin-search-filter-card">
        <div className="cb">
          <div className="users-search-row">
            <StyledSelect className="users-search-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSelectedUserIds([]) }}>
              <option value="all">ทุกสถานะ</option>
              <option value="active">เฉพาะ Active</option>
              <option value="inactive">เฉพาะ Inactive</option>
            </StyledSelect>
            <StyledSelect className="users-search-select" value={soiFilter} onChange={(e) => { setSoiFilter(e.target.value); setHouseFilter('all'); setSelectedUserIds([]) }}>
              <option value="all">ทุกซอย</option>
              {soiOptions.map((soi) => (
                <option key={`soi-${soi}`} value={soi}>ซอย {soi}</option>
              ))}
            </StyledSelect>
            <StyledSelect className="users-search-select" value={houseFilter} onChange={(e) => { setHouseFilter(e.target.value); setSelectedUserIds([]) }}>
              <option value="all">ทุกบ้านเลขที่</option>
              {houses
                .filter((house) => soiFilter === 'all' || String(house.soi || '') === String(soiFilter))
                .map((house) => (
                  <option key={`house-${house.id}`} value={house.id}>{house.house_no}{house.soi ? ` (ซอย ${house.soi})` : ''}</option>
                ))}
            </StyledSelect>
            <button className="btn btn-a btn-sm users-search-refresh" onClick={loadUsers}>🔄 รีเฟรช</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">รายชื่อผู้ใช้งาน ({filteredUsers.length}/{users.length})</div>
          <div className="houses-list-actions">
            <button className="btn btn-sm" style={{ background: allFilteredSelected ? '#0f766e' : '#334155', color: '#fff', border: 'none' }} onClick={toggleSelectAllFiltered}>
              {allFilteredSelected ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
            <button className="btn btn-dg btn-sm" disabled={selectedUserIds.length === 0} onClick={handleDeleteSelectedUsers}>
              ลบที่เลือก ({selectedUserIds.length})
            </button>
            <button className="btn btn-p btn-sm" onClick={openAddModal}>+ เพิ่มผู้ใช้ใหม่</button>
          </div>
        </div>
        <div className="cb houses-table-card-body houses-main-body">
          <div className="desktop-only">
            <div style={{ overflowX: 'auto' }}>
              <table className="tw houses-table houses-main-table" style={{ width: '100%', minWidth: '1080px' }}>
                <thead><tr>
                  <th style={{ width: 44 }}>
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} />
                  </th>
                  <th>บ้านเลขที่</th>
                  <th>username</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>email</th>
                  <th>เบอร์โทร</th>
                  <th>บทบาท</th>
                  <th>สถานะ</th>
                  <th>วันที่สร้าง</th>
                  <th>ล่าสุดเข้าใช้งาน</th>
                  <th>จัดการ</th>
                </tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="11" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>กำลังโหลด...</td></tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr><td colSpan="11" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>ไม่มีข้อมูลผู้ใช้</td></tr>
                  ) : filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <input type="checkbox" checked={selectedIdSet.has(String(user.id))} onChange={() => toggleUserSelection(user.id)} />
                      </td>
                      <td>{getHouseNo(user.house_id)}</td>
                      <td>{user.username || '-'}</td>
                      <td>{getHouseOwnerName(user.house_id, user.full_name || '-')}</td>
                      <td>{user.email || '-'}</td>
                      <td>{user.phone || '-'}</td>
                      <td><span className="bd b-pr">{getRoleText(user.role)}</span></td>
                      <td>{user.is_active ? <span className="bd b-ok">active</span> : <span className="bd b-mu">inactive</span>}</td>
                      <td>{formatDateTime(user.created_at)}</td>
                      <td>{formatDateTime(user.last_login_at)}</td>
                      <td><div className="td-acts">
                        <button className="btn btn-xs btn-a" onClick={() => openEditModal(user)}>แก้ไข</button>
                        <button className="btn btn-xs btn-o" onClick={() => handleQuickResetPassword(user)}>เปลี่ยนรหัสผ่าน</button>
                        <button className="btn btn-xs btn-dg" onClick={() => handleDeleteUser(user)}>ลบ</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mobile-only">
            {loading ? (
              <div className="mcard-empty">กำลังโหลด...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="mcard-empty">ไม่มีข้อมูลผู้ใช้</div>
            ) : filteredUsers.map((user) => (
              <div key={user.id} className="mcard">
                <div className="mcard-top">
                  <input type="checkbox" checked={selectedIdSet.has(String(user.id))} onChange={() => toggleUserSelection(user.id)} style={{ marginRight: 8 }} />
                  <div>
                    <div className="mcard-title">{getHouseOwnerName(user.house_id, user.full_name || '-')}</div>
                    <div className="mcard-sub">{user.username || '-'} · บ้าน {getHouseNo(user.house_id)}</div>
                  </div>
                  <span className="bd b-pr mcard-badge">{getRoleText(user.role)}</span>
                </div>
                <div className="mcard-meta">
                  {user.email && <span><span className="mcard-label">email</span> {user.email}</span>}
                  {user.phone && <span><span className="mcard-label">เบอร์</span> {user.phone}</span>}
                  <span><span className="mcard-label">สถานะ</span> {user.is_active ? <span className="bd b-ok">active</span> : <span className="bd b-mu">inactive</span>}</span>
                </div>
                <div className="mcard-actions">
                  <button className="btn btn-xs btn-a" onClick={() => openEditModal(user)}>แก้ไข</button>
                  <button className="btn btn-xs btn-o" onClick={() => handleQuickResetPassword(user)}>เปลี่ยนรหัสผ่าน</button>
                  <button className="btn btn-xs btn-dg" onClick={() => handleDeleteUser(user)}>ลบ</button>
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
                <div className="house-md-title">👥 {editingUser ? 'แก้ไขผู้ใช้งานระบบ' : 'เพิ่มผู้ใช้งานระบบ'}</div>
                <div className="house-md-sub">{form.username || '-'} {selectedHouse?.owner_name ? `— ${selectedHouse.owner_name}` : ''}</div>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="house-md-body">
                <section className="house-sec">
                  <div className="house-sec-title">บ้านที่ผูกกับผู้ใช้</div>
                  <div className="house-grid house-grid-2">
                    <label className="house-field">
                      <span>บ้านเลขที่ <strong style={{ color: '#dc2626' }}>*</strong></span>
                      <StyledSelect name="house_id" value={form.house_id} onChange={handleSelectHouse}>
                        <option value="">-- เลือกบ้านเลขที่ --</option>
                        {houses.map((house) => (
                          <option key={house.id} value={house.id}>{house.house_no}{house.soi ? ` (ซอย ${house.soi})` : ''}</option>
                        ))}
                      </StyledSelect>
                    </label>
                    <label className="house-field">
                      <span>เจ้าของบ้าน</span>
                      <input value={selectedHouse?.owner_name || '-'} readOnly className="house-readonly" />
                    </label>
                    <label className="house-field house-field-span-2">
                      <span>ที่อยู่</span>
                      <input value={selectedHouse?.address || '-'} readOnly className="house-readonly" />
                    </label>
                    <label className="house-field">
                      <span>email</span>
                      <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="name@example.com" />
                    </label>
                    <label className="house-field">
                      <span>เบอร์โทร</span>
                      <input name="phone" value={form.phone} onChange={handleChange} placeholder="08x-xxx-xxxx" />
                    </label>
                  </div>
                </section>

                <section className="house-sec">
                  <div className="house-sec-title">ข้อมูลเข้าสู่ระบบ</div>
                  <div className="house-grid house-grid-2">
                    <label className="house-field">
                      <span>username <strong style={{ color: '#dc2626' }}>*</strong></span>
                      <input name="username" value={form.username} onChange={handleChange} placeholder="username" />
                    </label>
                    <label className="house-field">
                      <span>password <strong style={{ color: '#dc2626' }}>*</strong></span>
                      <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="อย่างน้อย 6 ตัวอักษร" />
                    </label>
                    <label className="house-field house-field-span-2">
                      <span>ชื่อ-นามสกุล</span>
                      <input name="full_name" value={form.full_name} onChange={handleChange} placeholder="ชื่อ-นามสกุล" />
                    </label>
                    <label className="house-field">
                      <span>บทบาท</span>
                      <StyledSelect name="role" value={form.role} onChange={handleChange} className="users-role-select">
                        <option value="admin">ผู้ดูแลระบบ</option>
                        <option value="resident">ลูกบ้าน</option>
                      </StyledSelect>
                    </label>
                    <label className="house-field house-field-span-2">
                      <span>สถานะ</span>
                      <StyledSelect name="is_active" value={String(form.is_active)} onChange={handleChange}>
                        <option value="true">active</option>
                        <option value="false">inactive</option>
                      </StyledSelect>
                    </label>
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
    </div>
  )
}

export default AdminUsers