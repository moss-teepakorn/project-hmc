import bcrypt from 'bcryptjs'
import { supabase } from './supabase'
import { normalizeUsername } from './reservedUsernames'

const PIN_TABLE = 'user_pin_devices'
const DEVICE_ID_KEY = 'vms-pin-device-id'
const USERNAME_HINT_KEY = 'vms-pin-username-hint'
const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15

function randomDeviceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getLockUntilIso() {
  const now = new Date()
  now.setMinutes(now.getMinutes() + LOCK_MINUTES)
  return now.toISOString()
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getOrCreateDeviceId() {
  const current = String(localStorage.getItem(DEVICE_ID_KEY) || '').trim()
  if (current) return current
  const next = randomDeviceId()
  localStorage.setItem(DEVICE_ID_KEY, next)
  return next
}

export function getPinUsernameHint() {
  return String(localStorage.getItem(USERNAME_HINT_KEY) || '').trim()
}

export function setPinUsernameHint(username) {
  const normalized = normalizeUsername(username)
  if (!normalized) return
  localStorage.setItem(USERNAME_HINT_KEY, normalized)
}

export async function hasPinEnrollmentForCurrentDevice() {
  try {
    const deviceId = getOrCreateDeviceId()
    const { data, error } = await supabase
      .from(PIN_TABLE)
      .select('id')
      .eq('device_id', deviceId)
      .eq('is_active', true)
      .limit(1)

    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

export async function enrollPinForCurrentDevice({ userId, username, pin }) {
  const normalizedPin = String(pin || '').trim()
  if (!/^\d{6}$/.test(normalizedPin)) {
    throw new Error('PIN ต้องเป็นตัวเลข 6 หลัก')
  }

  const deviceId = getOrCreateDeviceId()
  const pinHash = await bcrypt.hash(normalizedPin, 10)

  // Deactivate older records on this device for this user, keep latest clean state.
  await supabase
    .from(PIN_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('device_id', deviceId)

  const { error } = await supabase
    .from(PIN_TABLE)
    .insert([{
      user_id: userId,
      username: normalizeUsername(username),
      device_id: deviceId,
      pin_hash: pinHash,
      failed_attempts: 0,
      locked_until: null,
      is_active: true,
      last_used_at: null,
    }])

  if (error) {
    throw new Error(`บันทึก PIN ไม่สำเร็จ: ${error.message}`)
  }

  setPinUsernameHint(username)
  return true
}

export async function verifyPinForCurrentDevice({ username, pin }) {
  const normalizedUsername = normalizeUsername(username)
  const normalizedPin = String(pin || '').trim()

  if (!normalizedUsername) throw new Error('กรุณากรอก Username')
  if (!/^\d{6}$/.test(normalizedPin)) throw new Error('PIN ต้องเป็นตัวเลข 6 หลัก')

  const deviceId = getOrCreateDeviceId()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, role, house_id, full_name, phone, email, is_active, created_at, last_login_at')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (profileError) throw new Error(profileError.message)
  if (!profile) throw new Error('ไม่พบผู้ใช้งาน')
  if (!profile.is_active) throw new Error('บัญชีถูกปิดการใช้งาน')

  const { data: rows, error: pinError } = await supabase
    .from(PIN_TABLE)
    .select('id, pin_hash, failed_attempts, locked_until, is_active')
    .eq('user_id', profile.id)
    .eq('device_id', deviceId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (pinError) throw new Error('ยังไม่ได้ตั้งค่า PIN สำหรับอุปกรณ์นี้')

  const record = Array.isArray(rows) ? rows[0] : null
  if (!record) throw new Error('ยังไม่ได้ตั้งค่า PIN สำหรับอุปกรณ์นี้')

  const now = new Date()
  if (record.locked_until && new Date(record.locked_until) > now) {
    throw new Error('PIN ถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลัง')
  }

  const matched = await bcrypt.compare(normalizedPin, record.pin_hash || '')
  if (!matched) {
    const nextFailed = toNumber(record.failed_attempts, 0) + 1
    const lockedUntil = nextFailed >= MAX_FAILED_ATTEMPTS ? getLockUntilIso() : null

    await supabase
      .from(PIN_TABLE)
      .update({
        failed_attempts: nextFailed,
        locked_until: lockedUntil,
        updated_at: new Date().toISOString(),
      })
      .eq('id', record.id)

    if (lockedUntil) {
      throw new Error('กรอก PIN ผิดหลายครั้ง ระบบล็อกชั่วคราว 15 นาที')
    }

    throw new Error('PIN ไม่ถูกต้อง')
  }

  await supabase
    .from(PIN_TABLE)
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', record.id)

  setPinUsernameHint(profile.username)
  return profile
}

export async function resetPinForCurrentDevice({ userId }) {
  if (!userId) throw new Error('ไม่พบผู้ใช้งาน')

  const deviceId = getOrCreateDeviceId()
  const { error } = await supabase
    .from(PIN_TABLE)
    .update({
      is_active: false,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .eq('is_active', true)

  if (error) {
    throw new Error(`รีเซ็ต PIN ไม่สำเร็จ: ${error.message}`)
  }

  return true
}
