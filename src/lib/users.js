import { supabase } from './supabase'
import bcrypt from 'bcryptjs'
import { isReservedAdminUsername } from './reservedUsernames'
import { assertCanActivateResident } from './userLimits'

function toLowerOrNull(value) {
  const trimmed = (value || '').trim().toLowerCase()
  return trimmed || null
}

function generateUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0
    const value = char === 'x' ? random : (random & 0x3 | 0x8)
    return value.toString(16)
  })
}

export async function getUsers() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, email, phone, role, house_id, is_active, created_at, last_login_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching users:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error in getUsers:', error)
    return []
  }
}

export async function createUser(userData) {
  try {
    const nextRole = userData.role || 'resident'
    if (nextRole === 'resident' && isReservedAdminUsername(userData.username)) {
      throw new Error('ชื่อผู้ใช้นี้สงวนไว้สำหรับผู้ดูแลระบบ')
    }

    if (nextRole === 'resident' && (userData.is_active ?? true)) {
      await assertCanActivateResident({ houseId: userData.house_id })
    }

    const passwordHash = await bcrypt.hash(userData.password || '', 10)

    const payload = {
      id: userData.id || generateUuid(),
      username: toLowerOrNull(userData.username),
      password_hash: passwordHash,
      full_name: userData.full_name,
      email: userData.email,
      phone: userData.phone,
      role: userData.role || 'resident',
      house_id: userData.house_id || null,
      is_active: userData.is_active ?? true,
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert([payload])
      .select()

    if (error) {
      throw new Error(error.message)
    }

    return data?.[0]
  } catch (error) {
    console.error('Error creating user:', error)
    throw error
  }
}

export async function updateUser(userId, updates) {
  try {
    const nextRole = typeof updates.role !== 'undefined' ? updates.role : null
    if (nextRole === 'resident' && typeof updates.username !== 'undefined' && isReservedAdminUsername(updates.username)) {
      throw new Error('ชื่อผู้ใช้นี้สงวนไว้สำหรับผู้ดูแลระบบ')
    }

    const { data: currentUser, error: currentUserError } = await supabase
      .from('profiles')
      .select('id, role, house_id, is_active')
      .eq('id', userId)
      .maybeSingle()

    if (currentUserError) throw new Error(currentUserError.message)
    if (!currentUser) throw new Error('ไม่พบผู้ใช้งาน')

    const effectiveRole = typeof updates.role !== 'undefined' ? updates.role : currentUser.role
    const effectiveHouseId = typeof updates.house_id !== 'undefined' ? (updates.house_id || null) : currentUser.house_id
    const effectiveActive = typeof updates.is_active !== 'undefined' ? updates.is_active : currentUser.is_active

    if (effectiveRole === 'resident' && effectiveActive) {
      await assertCanActivateResident({ houseId: effectiveHouseId, excludeProfileId: userId })
    }

    const payload = {}
    if (typeof updates.username !== 'undefined') payload.username = toLowerOrNull(updates.username)
    if (typeof updates.full_name !== 'undefined') payload.full_name = updates.full_name
    if (typeof updates.email !== 'undefined') payload.email = updates.email
    if (typeof updates.phone !== 'undefined') payload.phone = updates.phone
    if (typeof updates.role !== 'undefined') payload.role = updates.role
    if (typeof updates.house_id !== 'undefined') payload.house_id = updates.house_id || null
    if (typeof updates.is_active !== 'undefined') payload.is_active = updates.is_active
    if (typeof updates.password !== 'undefined' && updates.password) {
      payload.password_hash = await bcrypt.hash(updates.password, 10)
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select()

    if (error) {
      throw new Error(error.message)
    }

    return data?.[0]
  } catch (error) {
    console.error('Error updating user:', error)
    throw error
  }
}

export async function deleteUser(userId) {
  try {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (error) {
      throw new Error(error.message)
    }

    return true
  } catch (error) {
    console.error('Error deleting user:', error)
    throw error
  }
}

export async function deleteUsersBulk(userIds) {
  const ids = Array.isArray(userIds) ? userIds.map((id) => String(id || '')).filter(Boolean) : []
  if (ids.length === 0) return 0

  try {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .in('id', ids)

    if (error) {
      throw new Error(error.message)
    }

    return ids.length
  } catch (error) {
    console.error('Error deleting users bulk:', error)
    throw error
  }
}

export async function sendResetPasswordEmail(email) {
  throw new Error('ระบบนี้ไม่ใช้ Supabase Auth แล้ว กรุณาใช้การตั้งรหัสผ่านใหม่ในหน้าผู้ใช้ระบบ')
}

export async function listHouseOptions() {
  const { data, error } = await supabase
    .from('houses')
    .select('id, house_no, soi, owner_name, address, status')
    .order('house_no', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getHouseDetail(houseId) {
  if (!houseId) return null
  const { data, error } = await supabase
    .from('houses')
    .select('*')
    .eq('id', houseId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    ...data,
    floor_no: data.floor_no ?? data.FLOOR_NO ?? null,
    room_no: data.room_no ?? data.ROOM_NO ?? null,
    owner_name: data.owner_name || data.OWNER_NAME || '',
    resident_name: data.resident_name || data.RESIDENT_NAME || '',
    contact_name: data.contact_name || data.CONTACT_NAME || '',
    phone: data.phone || data.PHONE || '',
    email: data.email || data.EMAIL || data.contact_email || data.CONTACT_EMAIL || '',
    address: data.address || data.ADDRESS || '',
  }
}

export function formatDateTime(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}
