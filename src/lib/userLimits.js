import { supabase } from './supabase'

const DEFAULT_PER_HOUSE_LIMIT = 5
const DEFAULT_TOTAL_LIMIT = 1000

function normalizeLimit(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

export async function getUserLimitConfig() {
  const { data, error } = await supabase
    .from('system_config')
    .select('max_active_users_per_house, max_active_users_total')
    .limit(1)
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (!message.includes('column')) throw error
  }

  return {
    perHouseLimit: normalizeLimit(data?.max_active_users_per_house, DEFAULT_PER_HOUSE_LIMIT),
    totalLimit: normalizeLimit(data?.max_active_users_total, DEFAULT_TOTAL_LIMIT),
  }
}

export async function getActiveResidentCounts({ excludeProfileId = null } = {}) {
  let query = supabase
    .from('profiles')
    .select('id, house_id')
    .eq('role', 'resident')
    .eq('is_active', true)

  if (excludeProfileId) query = query.neq('id', excludeProfileId)

  const { data, error } = await query
  if (error) throw error

  const activeRows = data || []
  const perHouseCountMap = activeRows.reduce((acc, row) => {
    const key = String(row.house_id || '')
    if (!key) return acc
    acc.set(key, (acc.get(key) || 0) + 1)
    return acc
  }, new Map())

  return {
    activeTotal: activeRows.length,
    perHouseCountMap,
  }
}

export async function assertCanActivateResident({ houseId, excludeProfileId = null } = {}) {
  if (!houseId) throw new Error('กรุณาระบุบ้านสำหรับผู้ใช้งาน')

  const [{ perHouseLimit, totalLimit }, { activeTotal, perHouseCountMap }] = await Promise.all([
    getUserLimitConfig(),
    getActiveResidentCounts({ excludeProfileId }),
  ])

  const houseKey = String(houseId)
  const currentHouseActive = perHouseCountMap.get(houseKey) || 0

  if (currentHouseActive + 1 > perHouseLimit) {
    throw new Error(`บ้านนี้มีผู้ใช้งาน active ครบ limit แล้ว (กำหนด ${perHouseLimit} คน/บ้าน)`)
  }

  if (activeTotal + 1 > totalLimit) {
    throw new Error(`จำนวนผู้ใช้งาน active รวมครบ limit แล้ว (กำหนด ${totalLimit} คน)`)
  }

  return {
    perHouseLimit,
    totalLimit,
    activeTotal,
    currentHouseActive,
  }
}
