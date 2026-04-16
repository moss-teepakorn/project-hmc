import bcrypt from 'bcryptjs'
import { supabase } from './supabase'
import { isReservedAdminUsername } from './reservedUsernames'
import { assertCanActivateResident } from './userLimits'

const FALLBACK_ACCOUNT_REQUEST_PREFIX = 'fallback-profile-'
const FALLBACK_HOUSE_PROFILE_REQUEST_PREFIX = 'fallback-house-profile-'
const HOUSE_PROFILE_UPDATE_PREFIX = '[HOUSE_PROFILE_UPDATE] '
const HOUSE_PROFILE_REJECT_PREFIX = '[HOUSE_PROFILE_REJECT] '
const HOUSE_PROFILE_ISSUE_PREFIX = '[HOUSE_PROFILE_UPDATE_ISSUE] '
const ACCOUNT_REQUEST_SELECT = '*, houses(id, house_no, soi, owner_name, resident_name, contact_name, phone, line_id, email), profiles:profile_id(id, username, full_name, is_active, role)'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizePhoneDigits(value) {
  return normalizeText(value).replace(/[^0-9]/g, '')
}

function normalizeOptionalValue(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function buildHouseProfileUpdatePayload(input = {}) {
  return {
    resident_name: normalizeOptionalValue(input.resident_name),
    contact_name: normalizeOptionalValue(input.contact_name),
    phone: normalizeOptionalValue(input.phone),
    line_id: normalizeOptionalValue(input.line_id),
    email: normalizeOptionalValue(input.email),
  }
}

function hasHouseProfilePayloadValue(payload = {}) {
  return ['resident_name', 'contact_name', 'phone', 'line_id', 'email']
    .some((key) => String(payload?.[key] || '').trim().length > 0)
}

function parseHouseProfilePayloadFromNote(note) {
  const raw = String(note || '')
  const inline = raw.startsWith(HOUSE_PROFILE_UPDATE_PREFIX)
    ? raw.slice(HOUSE_PROFILE_UPDATE_PREFIX.length).trim()
    : ''
  const embeddedIdx = raw.indexOf(HOUSE_PROFILE_UPDATE_PREFIX)
  const embedded = embeddedIdx >= 0
    ? raw.slice(embeddedIdx + HOUSE_PROFILE_UPDATE_PREFIX.length).trim()
    : ''
  const payloadText = inline || embedded
  if (!payloadText) return null

  try {
    return buildHouseProfileUpdatePayload(JSON.parse(payloadText))
  } catch {
    return null
  }
}

function parseHouseProfileRejectReasonFromNote(note) {
  const raw = String(note || '').trim()
  if (!raw.startsWith(HOUSE_PROFILE_REJECT_PREFIX)) return ''
  const firstLine = raw.split('\n')[0]
  return firstLine.slice(HOUSE_PROFILE_REJECT_PREFIX.length).trim()
}

function parseHouseProfileIssuePayloadFromDetail(detail) {
  const raw = String(detail || '').trim()
  if (!raw.startsWith(HOUSE_PROFILE_ISSUE_PREFIX)) return null
  const text = raw.slice(HOUSE_PROFILE_ISSUE_PREFIX.length).trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    return {
      profile_id: parsed?.profile_id || null,
      requested_username: parsed?.requested_username || null,
      payload: buildHouseProfileUpdatePayload(parsed?.payload || {}),
    }
  } catch {
    return null
  }
}

function mapIssueStatusToRequestStatus(status) {
  if (status === 'pending' || status === 'in_progress' || status === 'new') return 'pending'
  if (status === 'resolved' || status === 'closed') return 'approved'
  if (status === 'not_fixed') return 'rejected'
  if (status === 'cancelled') return 'cancelled'
  return 'pending'
}

function isFallbackHouseProfileRequestId(requestId) {
  return String(requestId || '').startsWith(FALLBACK_HOUSE_PROFILE_REQUEST_PREFIX)
}

function getIssueIdFromFallbackHouseProfileRequestId(requestId) {
  if (!isFallbackHouseProfileRequestId(requestId)) return null
  return String(requestId || '').slice(FALLBACK_HOUSE_PROFILE_REQUEST_PREFIX.length) || null
}

async function listFallbackHouseProfileIssuesByHouse(houseId) {
  if (!houseId) return []

  const { data, error } = await supabase
    .from('issues')
    .select('id, house_id, title, detail, status, admin_note, created_at, resolved_at, houses(id, house_no, soi, owner_name, resident_name, contact_name, phone, line_id, email)')
    .eq('house_id', houseId)
    .in('status', ['pending', 'in_progress', 'new', 'resolved', 'closed', 'not_fixed', 'cancelled'])
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).filter((row) => parseHouseProfileIssuePayloadFromDetail(row.detail))
}

function mapFallbackIssueToHouseProfileRequest(issue, profileMap = new Map()) {
  const parsed = parseHouseProfileIssuePayloadFromDetail(issue.detail)
  if (!parsed) return null

  const profile = parsed.profile_id ? (profileMap.get(String(parsed.profile_id)) || null) : null
  const payload = parsed.payload || {}
  return {
    id: `${FALLBACK_HOUSE_PROFILE_REQUEST_PREFIX}${issue.id}`,
    request_type: 'house_profile_update',
    status: mapIssueStatusToRequestStatus(issue.status),
    house_id: issue.house_id,
    profile_id: parsed.profile_id,
    requested_username: parsed.requested_username || profile?.username || null,
    requested_phone: payload.phone || null,
    request_payload: payload,
    admin_note: issue.admin_note || '',
    created_at: issue.created_at,
    reviewed_at: issue.resolved_at || null,
    houses: issue.houses || null,
    profiles: profile
      ? {
        id: profile.id,
        username: profile.username,
        full_name: profile.full_name,
        is_active: profile.is_active,
        role: profile.role,
      }
      : null,
    is_fallback: true,
  }
}

export function extractHouseProfileUpdatePayload(note) {
  return parseHouseProfilePayloadFromNote(note)
}

export function extractHouseProfileUpdateRejectReason(note) {
  return parseHouseProfileRejectReasonFromNote(note)
}

function isAccountRequestInsertDenied(error) {
  const code = String(error?.code || '').toLowerCase()
  const statusRaw = error?.status
  const status = Number.isFinite(Number(statusRaw)) ? Number(statusRaw) : 0
  const message = String(error?.message || '').toLowerCase()
  const details = String(error?.details || '').toLowerCase()
  const hint = String(error?.hint || '').toLowerCase()
  const text = [message, details, hint, String(error || '').toLowerCase()].join(' | ')

  return code === '42501'
    || code === 'pgrst301'
    || status === 401
    || status === 403
    || text.includes('row-level security')
    || text.includes('policy')
    || text.includes('unauthorized')
    || text.includes('permission denied')
    || text.includes('not allowed')
}

function isHouseProfileRequestInsertUnsupported(error) {
  const text = [error?.message, error?.details, error?.hint, String(error || '')]
    .map((item) => String(item || '').toLowerCase())
    .join(' | ')
  return text.includes('account_requests_request_type_check')
    || (text.includes('check constraint') && text.includes('request_type'))
}

function isFallbackAccountRequestId(requestId) {
  return String(requestId || '').startsWith(FALLBACK_ACCOUNT_REQUEST_PREFIX)
}

async function hasSupabaseSession() {
  try {
    const { data } = await supabase.auth.getSession()
    return Boolean(data?.session)
  } catch {
    return false
  }
}

function getProfileIdFromFallbackRequestId(requestId) {
  if (!isFallbackAccountRequestId(requestId)) return null
  return String(requestId || '').slice(FALLBACK_ACCOUNT_REQUEST_PREFIX.length) || null
}

async function findHouseByHouseNoAndPhone({ houseNo, phone }) {
  const normalizedHouseNo = normalizeLower(houseNo)
  const normalizedPhone = normalizePhoneDigits(phone)

  if (!normalizedHouseNo || !normalizedPhone) {
    throw new Error('กรุณาระบุบ้านเลขที่และเบอร์โทรศัพท์')
  }

  const { data, error } = await supabase
    .from('houses')
    .select('id, house_no, soi, owner_name, phone')
    .ilike('house_no', houseNo)
    .limit(20)

  if (error) throw error

  const matched = (data || []).find((row) => {
    const rowHouseNo = normalizeLower(row.house_no)
    const rowPhone = normalizePhoneDigits(row.phone)
    return rowHouseNo === normalizedHouseNo && rowPhone === normalizedPhone
  })

  if (!matched) {
    throw new Error('ไม่พบข้อมูลบ้านเลขที่และเบอร์โทรศัพท์ที่ตรงกัน')
  }

  return matched
}

async function ensureUsernameAvailable(username) {
  const normalizedUsername = normalizeLower(username)
  if (!normalizedUsername) throw new Error('กรุณาระบุชื่อผู้ใช้')
  if (isReservedAdminUsername(normalizedUsername)) {
    throw new Error('ชื่อผู้ใช้นี้สงวนไว้สำหรับผู้ดูแลระบบ')
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (error) throw error
  if (data) throw new Error('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว')

  return normalizedUsername
}

async function ensureNoPendingInactiveResidentByHouse(houseId) {
  if (!houseId) return

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, is_active, house_id, role, last_login_at')
    .eq('role', 'resident')
    .eq('house_id', houseId)
    .eq('is_active', false)
    .limit(1)

  if (error) throw error
  const pendingProfile = (data || []).find((row) => !row.last_login_at)
  if (pendingProfile) {
    throw new Error('บ้านนี้มีบัญชีที่ยังไม่ได้อนุมัติอยู่แล้ว กรุณารอผู้ดูแลระบบดำเนินการ')
  }
}

async function createHouseProfileUpdateFallbackIssue({ profileId, houseId, profileRow, payload }) {
  const issuePayloadText = `${HOUSE_PROFILE_ISSUE_PREFIX}${JSON.stringify({
    profile_id: profileId,
    requested_username: profileRow.username || null,
    payload,
  })}`

  const { data: fallbackIssue, error: fallbackIssueError } = await supabase
    .from('issues')
    .insert([{
      house_id: houseId,
      title: 'คำขอแก้ไขข้อมูลส่วนตัว',
      detail: issuePayloadText,
      category: 'ทั่วไป',
      status: 'pending',
    }])
    .select('id, house_id, title, detail, status, admin_note, created_at, resolved_at, houses(id, house_no, soi, owner_name, resident_name, contact_name, phone, line_id, email)')
    .single()

  if (fallbackIssueError) throw fallbackIssueError

  const mapped = mapFallbackIssueToHouseProfileRequest(
    fallbackIssue,
    new Map([[String(profileRow.id), profileRow]]),
  )
  if (!mapped) throw new Error('สร้างคำขอสำรองไม่สำเร็จ')
  return mapped
}

export async function createAccountRegistrationRequest({ username, houseNo, phone, password }) {
  const normalizedUsername = await ensureUsernameAvailable(username)
  const house = await findHouseByHouseNoAndPhone({ houseNo, phone })
  await ensureNoPendingInactiveResidentByHouse(house.id)
  await assertCanActivateResident({ houseId: house.id })

  const passwordText = String(password || '')
  if (passwordText.length < 6) {
    throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
  }

  const passwordHash = await bcrypt.hash(passwordText, 10)

  const { data: createdProfile, error: profileError } = await supabase
    .from('profiles')
    .insert([{
      username: normalizedUsername,
      password_hash: passwordHash,
      full_name: house.owner_name || `บ้าน ${house.house_no}`,
      role: 'resident',
      house_id: house.id,
      phone: house.phone || normalizeText(phone),
      is_active: false,
      password_changed_at: new Date().toISOString(),
    }])
    .select('id, username')
    .single()

  if (profileError) throw profileError

  // This app uses local-profile auth, so resident registration is typically unauthenticated
  // at Supabase Auth level. In that mode, account_requests insert often gets 401 by RLS.
  let hasSupabaseSession = false
  try {
    const { data } = await supabase.auth.getSession()
    hasSupabaseSession = Boolean(data?.session)
  } catch {
    hasSupabaseSession = false
  }

  if (!hasSupabaseSession) {
    return {
      id: null,
      status: 'pending',
      created_at: new Date().toISOString(),
    }
  }

  try {
    const { data: request, error: requestError } = await supabase
      .from('account_requests')
      .insert([{
        request_type: 'register',
        status: 'pending',
        house_id: house.id,
        profile_id: createdProfile.id,
        requested_username: normalizedUsername,
        requested_phone: house.phone || normalizeText(phone),
      }])
      .select('id, status, created_at')
      .single()

    if (requestError) {
      if (isAccountRequestInsertDenied(requestError)) {
        return {
          id: null,
          status: 'pending',
          created_at: new Date().toISOString(),
        }
      }

      await supabase.from('profiles').delete().eq('id', createdProfile.id)
      throw requestError
    }

    return request
  } catch (requestError) {
    if (isAccountRequestInsertDenied(requestError)) {
      return {
        id: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      }
    }

    await supabase.from('profiles').delete().eq('id', createdProfile.id)
    throw requestError
  }
}

export async function createHouseProfileUpdateRequest({ profileId, houseId, payload }) {
  if (!profileId) throw new Error('ไม่พบข้อมูลผู้ใช้งาน')
  if (!houseId) throw new Error('ไม่พบบ้านของผู้ใช้งาน')

  const nextPayload = buildHouseProfileUpdatePayload(payload)
  if (!hasHouseProfilePayloadValue(nextPayload)) {
    throw new Error('กรุณากรอกข้อมูลที่ต้องการแก้ไขอย่างน้อย 1 รายการ')
  }

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', profileId)
    .maybeSingle()

  if (profileError) throw profileError
  if (!profileRow) throw new Error('ไม่พบข้อมูลผู้ใช้งาน')

  const { data: existingPending, error: pendingError } = await supabase
    .from('account_requests')
    .select('id')
    .eq('profile_id', profileId)
    .eq('house_id', houseId)
    .eq('request_type', 'house_profile_update')
    .eq('status', 'pending')
    .limit(1)

  if (pendingError) throw pendingError
  if ((existingPending || []).length > 0) {
    throw new Error('มีคำขอแก้ไขข้อมูลบ้านที่รออนุมัติอยู่แล้ว')
  }

  const fallbackPendingIssues = await listFallbackHouseProfileIssuesByHouse(houseId)
  const hasFallbackPending = fallbackPendingIssues.some((issue) => {
    const parsed = parseHouseProfileIssuePayloadFromDetail(issue.detail)
    if (!parsed) return false
    return String(parsed.profile_id || '') === String(profileId)
      && mapIssueStatusToRequestStatus(issue.status) === 'pending'
  })
  if (hasFallbackPending) {
    throw new Error('มีคำขอแก้ไขข้อมูลบ้านที่รออนุมัติอยู่แล้ว')
  }

  const hasSession = await hasSupabaseSession()
  if (!hasSession) {
    return createHouseProfileUpdateFallbackIssue({
      profileId,
      houseId,
      profileRow,
      payload: nextPayload,
    })
  }

  const serializedPayload = `${HOUSE_PROFILE_UPDATE_PREFIX}${JSON.stringify(nextPayload)}`

  const { data, error } = await supabase
    .from('account_requests')
    .insert([{
      request_type: 'house_profile_update',
      status: 'pending',
      house_id: houseId,
      profile_id: profileId,
      requested_username: profileRow.username || null,
      requested_phone: nextPayload.phone,
      admin_note: serializedPayload,
    }])
    .select(ACCOUNT_REQUEST_SELECT)
    .single()

  if (error) {
    if (!isAccountRequestInsertDenied(error) && !isHouseProfileRequestInsertUnsupported(error)) throw error
    return createHouseProfileUpdateFallbackIssue({
      profileId,
      houseId,
      profileRow,
      payload: nextPayload,
    })
  }
  return data
}

export async function listHouseProfileUpdateRequestsByProfile(profileId, { status = 'all' } = {}) {
  if (!profileId) return []

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, house_id, username, full_name, is_active, role')
    .eq('id', profileId)
    .maybeSingle()

  if (profileError) throw profileError

  const hasSession = await hasSupabaseSession()
  let requestRows = []
  if (hasSession) {
    let query = supabase
      .from('account_requests')
      .select(ACCOUNT_REQUEST_SELECT)
      .eq('profile_id', profileId)
      .eq('request_type', 'house_profile_update')
      .order('created_at', { ascending: false })

    if (status !== 'all') query = query.eq('status', status)

    const { data, error } = await query
    if (error && !isAccountRequestInsertDenied(error)) throw error
    requestRows = error ? [] : (data || [])
  }
  const fallbackIssues = profileRow?.house_id
    ? await listFallbackHouseProfileIssuesByHouse(profileRow.house_id)
    : []
  const mappedFallback = fallbackIssues
    .map((issue) => mapFallbackIssueToHouseProfileRequest(issue, new Map([[String(profileRow.id), profileRow]])))
    .filter(Boolean)
    .filter((item) => String(item.profile_id || '') === String(profileId))

  const combined = [...requestRows, ...mappedFallback]
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())

  if (status === 'all') return combined
  return combined.filter((item) => item.status === status)
}

export async function listAccountRequests({ status = 'all' } = {}) {
  const hasSession = await hasSupabaseSession()
  let requestRows = []
  if (hasSession) {
    let query = supabase
      .from('account_requests')
      .select(ACCOUNT_REQUEST_SELECT)
      .order('created_at', { ascending: false })

    if (status !== 'all') query = query.eq('status', status)

    const { data, error } = await query

    requestRows = data || []
    if (error) {
      const msg = String(error.message || '').toLowerCase()
      const isMissingTable = msg.includes('account_requests') && (msg.includes('does not exist') || msg.includes('relation'))
      if (!isMissingTable && !isAccountRequestInsertDenied(error)) {
        throw error
      }
      requestRows = []
    }
  }

  let fallbackHouseProfileRows = []
  try {
    let issueRows = []
    {
      const { data, error } = await supabase
        .from('issues')
        .select('id, house_id, title, detail, status, admin_note, created_at, resolved_at, houses(id, house_no, soi, owner_name, resident_name, contact_name, phone, line_id, email)')
        .order('created_at', { ascending: false })

      if (!error) {
        issueRows = data || []
      } else {
        // Fallback query without relation embedding if relation policies or schema drift block the nested select.
        const { data: plainRows, error: plainError } = await supabase
          .from('issues')
          .select('id, house_id, title, detail, status, admin_note, created_at, resolved_at')
          .order('created_at', { ascending: false })

        if (plainError) throw plainError
        issueRows = plainRows || []
      }
    }

    const parsedRows = (issueRows || [])
      .map((issue) => ({ issue, parsed: parseHouseProfileIssuePayloadFromDetail(issue.detail) }))
      .filter((entry) => entry.parsed)

    const profileIds = [...new Set(parsedRows.map((entry) => entry.parsed.profile_id).filter(Boolean))]
    let profileById = new Map()
    if (profileIds.length > 0) {
      const { data: profiles, error: profileMapError } = await supabase
        .from('profiles')
        .select('id, username, full_name, is_active, role')
        .in('id', profileIds)

      if (!profileMapError) {
        profileById = new Map((profiles || []).map((item) => [String(item.id), item]))
      }
    }

    const mappedFallbackRows = parsedRows
      .map((entry) => mapFallbackIssueToHouseProfileRequest(entry.issue, profileById))
      .filter(Boolean)

    fallbackHouseProfileRows = status === 'all'
      ? mappedFallbackRows
      : mappedFallbackRows.filter((row) => row.status === status)
  } catch {
    fallbackHouseProfileRows = []
  }

  if (status !== 'all' && status !== 'pending') {
    return [...requestRows, ...fallbackHouseProfileRows]
      .filter((row) => row.status === status)
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
  }

  const { data: inactiveProfiles, error: inactiveProfilesError } = await supabase
    .from('profiles')
    .select('id, username, full_name, is_active, role, house_id, phone, created_at, last_login_at')
    .eq('role', 'resident')
    .eq('is_active', false)
    .not('house_id', 'is', null)
    .order('created_at', { ascending: false })

  if (inactiveProfilesError) throw inactiveProfilesError

  const existingProfileIdSet = new Set(
    requestRows
      .map((row) => row.profile_id)
      .filter(Boolean)
      .map((id) => String(id)),
  )

  const profileCandidates = (inactiveProfiles || []).filter((profile) => {
    if (existingProfileIdSet.has(String(profile.id))) return false
    if (profile.last_login_at) return false

    const createdAt = profile.created_at ? new Date(profile.created_at).getTime() : 0
    const maxAgeMs = 1000 * 60 * 60 * 24 * 30
    return createdAt > 0 && (Date.now() - createdAt) <= maxAgeMs
  })

  const profileIds = profileCandidates.map((profile) => profile.id).filter(Boolean)
  if (profileIds.length === 0) {
    return [...requestRows, ...fallbackHouseProfileRows]
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
  }

  let relatedRequests = []
  if (hasSession) {
    const { data: relatedData, error: relatedRequestsError } = await supabase
      .from('account_requests')
      .select('profile_id')
      .eq('request_type', 'register')
      .in('profile_id', profileIds)

    if (relatedRequestsError) {
      const msg = String(relatedRequestsError.message || '').toLowerCase()
      const isMissingTable = msg.includes('account_requests') && (msg.includes('does not exist') || msg.includes('relation'))
      if (!isMissingTable && !isAccountRequestInsertDenied(relatedRequestsError)) {
        throw relatedRequestsError
      }
    }
    relatedRequests = relatedData || []
  }

  const relatedProfileIdSet = new Set((relatedRequests || []).map((row) => String(row.profile_id || '')).filter(Boolean))
  const fallbackProfiles = profileCandidates.filter((profile) => !relatedProfileIdSet.has(String(profile.id)))
  if (fallbackProfiles.length === 0) {
    return [...requestRows, ...fallbackHouseProfileRows]
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
  }

  const houseIds = [...new Set(fallbackProfiles.map((profile) => profile.house_id).filter(Boolean))]
  let houseById = new Map()
  if (houseIds.length > 0) {
    const { data: houses, error: houseError } = await supabase
      .from('houses')
      .select('id, house_no, soi, owner_name, phone')
      .in('id', houseIds)

    if (houseError) throw houseError
    houseById = new Map((houses || []).map((house) => [String(house.id), house]))
  }

  const fallbackRows = fallbackProfiles.map((profile) => ({
    id: `${FALLBACK_ACCOUNT_REQUEST_PREFIX}${profile.id}`,
    request_type: 'register',
    status: 'pending',
    house_id: profile.house_id,
    profile_id: profile.id,
    requested_username: profile.username,
    requested_phone: profile.phone,
    created_at: profile.created_at || new Date().toISOString(),
    houses: houseById.get(String(profile.house_id)) || null,
    profiles: {
      id: profile.id,
      username: profile.username,
      full_name: profile.full_name,
      is_active: profile.is_active,
      role: profile.role,
    },
    is_fallback: true,
  }))

  return [...requestRows, ...fallbackRows, ...fallbackHouseProfileRows]
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
}

export async function updateAccountRequestStatus(requestId, { status, adminNote = null, reviewedById = null } = {}) {
  if (isFallbackHouseProfileRequestId(requestId)) {
    const issueId = getIssueIdFromFallbackHouseProfileRequestId(requestId)
    if (!issueId) throw new Error('ไม่พบคำขอสำรอง')

    const issueStatus = status === 'approved'
      ? 'resolved'
      : status === 'rejected'
        ? 'not_fixed'
        : status === 'cancelled'
          ? 'cancelled'
          : 'pending'

    const { data: updatedIssue, error: issueError } = await supabase
      .from('issues')
      .update({
        status: issueStatus,
        admin_note: adminNote,
        resolved_at: issueStatus === 'pending' ? null : new Date().toISOString(),
      })
      .eq('id', issueId)
      .select('id, house_id, title, detail, status, admin_note, created_at, resolved_at, houses(id, house_no, soi, owner_name, resident_name, contact_name, phone, line_id, email)')
      .single()

    if (issueError) throw issueError

    const parsed = parseHouseProfileIssuePayloadFromDetail(updatedIssue.detail)
    let profile = null
    if (parsed?.profile_id) {
      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, full_name, is_active, role')
        .eq('id', parsed.profile_id)
        .maybeSingle()
      if (profileError) throw profileError
      profile = profileRow || null
    }

    const mapped = mapFallbackIssueToHouseProfileRequest(
      updatedIssue,
      profile ? new Map([[String(profile.id), profile]]) : new Map(),
    )
    if (!mapped) throw new Error('อัปเดตคำขอสำรองไม่สำเร็จ')
    return mapped
  }

  if (isFallbackAccountRequestId(requestId)) {
    const profileId = getProfileIdFromFallbackRequestId(requestId)
    if (!profileId) throw new Error('ไม่พบผู้ใช้งานที่เชื่อมโยงกับคำขอ')

    const shouldActivate = status === 'approved'
    const reviewedAt = new Date().toISOString()

    const { data: currentProfile, error: currentProfileError } = await supabase
      .from('profiles')
      .select('id, house_id')
      .eq('id', profileId)
      .maybeSingle()

    if (currentProfileError) throw currentProfileError
    if (!currentProfile) throw new Error('ไม่พบผู้ใช้งาน')

    if (shouldActivate) {
      await assertCanActivateResident({ houseId: currentProfile.house_id, excludeProfileId: currentProfile.id })
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .update({ is_active: shouldActivate, updated_at: reviewedAt })
      .eq('id', profileId)
      .select('id, username, full_name, is_active, role, house_id, phone, created_at')
      .maybeSingle()

    if (profileError) throw profileError
    if (!profileRow) throw new Error('ไม่พบผู้ใช้งาน')

    let house = null
    if (profileRow.house_id) {
      const { data: houseRow, error: houseError } = await supabase
        .from('houses')
        .select('id, house_no, soi, owner_name, phone')
        .eq('id', profileRow.house_id)
        .maybeSingle()

      if (houseError) throw houseError
      house = houseRow || null
    }

    return {
      id: requestId,
      request_type: 'register',
      status,
      admin_note: adminNote,
      reviewed_at: reviewedAt,
      reviewed_by_id: reviewedById || null,
      house_id: profileRow.house_id || null,
      profile_id: profileRow.id,
      requested_username: profileRow.username,
      requested_phone: profileRow.phone,
      created_at: profileRow.created_at || reviewedAt,
      houses: house,
      profiles: {
        id: profileRow.id,
        username: profileRow.username,
        full_name: profileRow.full_name,
        is_active: profileRow.is_active,
        role: profileRow.role,
      },
      is_fallback: true,
    }
  }

  const updates = {
    status,
    admin_note: adminNote,
    reviewed_at: new Date().toISOString(),
    reviewed_by_id: reviewedById || null,
  }

  const { data, error } = await supabase
    .from('account_requests')
    .update(updates)
    .eq('id', requestId)
    .select(ACCOUNT_REQUEST_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function cancelAccountRequest(requestId, { reviewedById = null } = {}) {
  return updateAccountRequestStatus(requestId, { status: 'cancelled', reviewedById })
}

export async function approveAccountRequest(requestId, { reviewedById = null } = {}) {
  if (isFallbackHouseProfileRequestId(requestId)) {
    const issueId = getIssueIdFromFallbackHouseProfileRequestId(requestId)
    if (!issueId) throw new Error('ไม่พบคำขอสำรอง')

    const { data: issueRow, error: issueError } = await supabase
      .from('issues')
      .select('id, house_id, detail')
      .eq('id', issueId)
      .maybeSingle()

    if (issueError) throw issueError
    if (!issueRow) throw new Error('ไม่พบคำขอ')

    const parsed = parseHouseProfileIssuePayloadFromDetail(issueRow.detail)
    const payload = parsed?.payload || null
    if (!payload || !hasHouseProfilePayloadValue(payload)) {
      throw new Error('คำขอแก้ไขข้อมูลบ้านไม่มีข้อมูลที่ใช้งานได้')
    }

    const { error: houseError } = await supabase
      .from('houses')
      .update({
        resident_name: payload.resident_name,
        contact_name: payload.contact_name,
        phone: payload.phone,
        line_id: payload.line_id,
        email: payload.email,
      })
      .eq('id', issueRow.house_id)

    if (houseError) throw houseError

    return updateAccountRequestStatus(requestId, { status: 'approved', reviewedById })
  }

  if (isFallbackAccountRequestId(requestId)) {
    return updateAccountRequestStatus(requestId, { status: 'approved', reviewedById })
  }

  const { data: request, error: requestError } = await supabase
    .from('account_requests')
    .select('id, profile_id, house_id, status, request_type, admin_note')
    .eq('id', requestId)
    .maybeSingle()

  if (requestError) throw requestError
  if (!request) throw new Error('ไม่พบคำขอ')
  if (!request.profile_id) throw new Error('คำขอไม่มีผู้ใช้งานที่เชื่อมโยง')

  if (request.request_type === 'house_profile_update') {
    const payload = parseHouseProfilePayloadFromNote(request.admin_note)
    if (!payload || !hasHouseProfilePayloadValue(payload)) {
      throw new Error('คำขอแก้ไขข้อมูลบ้านไม่มีข้อมูลที่ใช้งานได้')
    }

    const { error: houseError } = await supabase
      .from('houses')
      .update({
        resident_name: payload.resident_name,
        contact_name: payload.contact_name,
        phone: payload.phone,
        line_id: payload.line_id,
        email: payload.email,
      })
      .eq('id', request.house_id)

    if (houseError) throw houseError

    return updateAccountRequestStatus(requestId, { status: 'approved', reviewedById })
  }

  const { data: profileBeforeUpdate, error: profileBeforeUpdateError } = await supabase
    .from('profiles')
    .select('id, house_id')
    .eq('id', request.profile_id)
    .maybeSingle()

  if (profileBeforeUpdateError) throw profileBeforeUpdateError
  if (!profileBeforeUpdate) throw new Error('ไม่พบผู้ใช้งานที่เชื่อมโยง')

  await assertCanActivateResident({ houseId: profileBeforeUpdate.house_id, excludeProfileId: profileBeforeUpdate.id })

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', request.profile_id)

  if (profileError) throw profileError

  return updateAccountRequestStatus(requestId, { status: 'approved', reviewedById })
}

export async function rejectHouseProfileUpdateRequest(requestId, { reason, reviewedById = null } = {}) {
  const rejectReason = String(reason || '').trim()
  if (!rejectReason) throw new Error('กรุณาระบุเหตุผลการปฏิเสธ')

  if (isFallbackHouseProfileRequestId(requestId)) {
    return updateAccountRequestStatus(requestId, {
      status: 'rejected',
      adminNote: `${HOUSE_PROFILE_REJECT_PREFIX}${rejectReason}`,
      reviewedById,
    })
  }

  const { data: request, error: requestError } = await supabase
    .from('account_requests')
    .select('id, request_type, admin_note')
    .eq('id', requestId)
    .maybeSingle()

  if (requestError) throw requestError
  if (!request) throw new Error('ไม่พบคำขอ')
  if (request.request_type !== 'house_profile_update') {
    return updateAccountRequestStatus(requestId, {
      status: 'rejected',
      adminNote: rejectReason,
      reviewedById,
    })
  }

  const payload = parseHouseProfilePayloadFromNote(request.admin_note)
  const preservedPayloadText = payload ? `${HOUSE_PROFILE_UPDATE_PREFIX}${JSON.stringify(payload)}` : ''
  const adminNote = [
    `${HOUSE_PROFILE_REJECT_PREFIX}${rejectReason}`,
    preservedPayloadText,
  ].filter(Boolean).join('\n')

  return updateAccountRequestStatus(requestId, {
    status: 'rejected',
    adminNote,
    reviewedById,
  })
}

export async function resetPasswordByIdentity({ username, houseNo, phone, newPassword }) {
  const normalizedUsername = normalizeLower(username)
  if (!normalizedUsername) throw new Error('กรุณาระบุชื่อผู้ใช้')

  const passwordText = String(newPassword || '')
  if (passwordText.length < 6) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, house_id')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (profileError) throw profileError
  if (!profile) throw new Error('ไม่พบชื่อผู้ใช้งาน')
  if (!profile.house_id) throw new Error('บัญชีนี้ไม่ได้ผูกกับบ้าน')

  const house = await findHouseByHouseNoAndPhone({ houseNo, phone })
  if (house.id !== profile.house_id) {
    throw new Error('ข้อมูลชื่อผู้ใช้ บ้านเลขที่ หรือเบอร์โทรศัพท์ไม่ตรงกัน')
  }

  const passwordHash = await bcrypt.hash(passwordText, 10)

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      password_hash: passwordHash,
      password_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id)

  if (updateError) throw updateError
  return true
}
