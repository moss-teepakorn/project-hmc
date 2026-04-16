import { supabase } from './supabase'

let cachedIp = ''

function getBrowserName(ua) {
  const value = String(ua || '')
  if (value.includes('Edg/')) return 'Edge'
  if (value.includes('Chrome/')) return 'Chrome'
  if (value.includes('Firefox/')) return 'Firefox'
  if (value.includes('Safari/') && !value.includes('Chrome/')) return 'Safari'
  return 'Unknown'
}

function getDeviceType(ua) {
  const value = String(ua || '')
  if (/mobile|iphone|android/i.test(value)) return 'mobile'
  if (/ipad|tablet/i.test(value)) return 'tablet'
  return 'desktop'
}

async function getClientIp() {
  if (cachedIp) return cachedIp
  try {
    const response = await fetch('https://api.ipify.org?format=json')
    if (!response.ok) return ''
    const json = await response.json()
    cachedIp = String(json?.ip || '')
    return cachedIp
  } catch {
    return ''
  }
}

/**
 * บันทึก login log เมื่อผู้ใช้ login สำเร็จ
 */
export async function insertLoginLog({ user_id, username, full_name, role, event_type = 'login', page_path = '', metadata = null }) {
  try {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const browser = getBrowserName(userAgent)
    const device_type = getDeviceType(userAgent)
    const ip_address = await getClientIp()

    const { error } = await supabase
      .from('login_logs')
      .insert([{
        user_id,
        username,
        full_name: full_name || null,
        role: role || null,
        event_type,
        page_path: page_path || null,
        ip_address: ip_address || null,
        browser,
        user_agent: userAgent || null,
        device_type,
        metadata: metadata || null,
      }])
    if (error) console.error('insertLoginLog error:', error)
  } catch (err) {
    console.error('insertLoginLog exception:', err)
  }
}

export async function insertPageViewLog({ user_id, username, full_name, role, page_path }) {
  if (!user_id || !username || !page_path) return
  await insertLoginLog({
    user_id,
    username,
    full_name,
    role,
    event_type: 'page_view',
    page_path,
  })
}

/**
 * ดึงรายการ login logs พร้อม filter ตัวเลือก
 * @param {{ search?: string, userId?: string, limit?: number }} opts
 */
export async function getLoginLogs({ search = '', userId = '', limit = 500 } = {}) {
  try {
    let query = supabase
      .from('login_logs')
      .select('id, user_id, username, full_name, role, event_type, page_path, ip_address, browser, user_agent, device_type, login_at')
      .order('login_at', { ascending: false })
      .limit(limit)

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query
    if (error) {
      console.error('getLoginLogs error:', error)
      return []
    }

    const keyword = (search || '').trim().toLowerCase()
    if (!keyword) return data ?? []

    return (data ?? []).filter((row) => {
      return (
        (row.username || '').toLowerCase().includes(keyword) ||
        (row.full_name || '').toLowerCase().includes(keyword) ||
        (row.page_path || '').toLowerCase().includes(keyword) ||
        (row.browser || '').toLowerCase().includes(keyword)
      )
    })
  } catch (err) {
    console.error('getLoginLogs exception:', err)
    return []
  }
}

/**
 * ลบ login logs ตาม array ของ id
 * @param {number[]} ids
 */
export async function deleteLoginLogs(ids) {
  if (!ids || ids.length === 0) return
  const { error } = await supabase
    .from('login_logs')
    .delete()
    .in('id', ids)
  if (error) throw error
}

/**
 * ลบ login logs ทั้งหมด
 */
export async function deleteAllLoginLogs() {
  // ใช้ gt(id, 0) เพื่อให้ Supabase ยอมรับ DELETE without filter
  const { error } = await supabase
    .from('login_logs')
    .delete()
    .gt('id', 0)
  if (error) throw error
}
