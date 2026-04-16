import { supabase } from './supabase'

const houseSorter = new Intl.Collator('th-TH', { numeric: true, sensitivity: 'base' })

function normalizeSoiValue(soi) {
  const numeric = Number.parseInt(String(soi || '').replace(/[^0-9]/g, ''), 10)
  return Number.isNaN(numeric) ? Number.MAX_SAFE_INTEGER : numeric
}

function sortHouses(items) {
  return [...items].sort((left, right) => {
    const soiCompare = normalizeSoiValue(left.soi) - normalizeSoiValue(right.soi)
    if (soiCompare !== 0) return soiCompare
    return houseSorter.compare(left.house_no || '', right.house_no || '')
  })
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST204' && message.includes(`'${String(columnName || '').toLowerCase()}'`) && message.includes('column')
}

function stripUnsupportedHouseColumns(payload, error) {
  if (!payload || typeof payload !== 'object') return payload

  const next = { ...payload }
  if (isMissingColumnError(error, 'floor_no')) delete next.floor_no
  if (isMissingColumnError(error, 'room_no')) delete next.room_no
  return next
}

export async function listHouses({ status = 'all', search = '', soi = 'all' } = {}) {
  let query = supabase
    .from('houses')
    .select('*')

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (soi && soi !== 'all') {
    query = query.eq('soi', soi)
  }

  if (search && search.trim()) {
    const keyword = search.trim()
    query = query.or(`house_no.ilike.%${keyword}%,owner_name.ilike.%${keyword}%,resident_name.ilike.%${keyword}%,contact_name.ilike.%${keyword}%,phone.ilike.%${keyword}%`)
  }

  const { data, error } = await query

  if (error) throw error
  return sortHouses(data ?? [])
}

export async function getHouseSetup() {
  const { data, error } = await supabase
    .from('system_config')
    .select('fee_rate_per_sqw, village_name')
    .limit(1)
    .maybeSingle()

  if (error) throw error

  return {
    feeRatePerSqw: Number(data?.fee_rate_per_sqw ?? 85),
    villageName: data?.village_name || 'The Greenfield',
  }
}

export async function updateAllHousesFeeRate(feeRatePerSqw) {
  const rate = Number(feeRatePerSqw || 0)

  const { data, error } = await supabase
    .from('houses')
    .update({ fee_rate: rate })
    .not('id', 'is', null)
    .select('id')

  if (error) throw error
  return data?.length ?? 0
}

export async function createHouse(payload) {
  const house = {
    house_no:       payload.house_no?.trim() || null,
    soi:            payload.soi?.trim() || null,
    floor_no:       Number.isFinite(Number(payload.floor_no)) ? Math.min(99, Math.max(0, Math.trunc(Number(payload.floor_no)))) : 0,
    room_no:        payload.room_no?.trim() || null,
    address:        payload.address?.trim() || null,
    owner_name:     payload.owner_name?.trim() || null,
    resident_name:  payload.resident_name?.trim() || null,
    contact_name:   payload.contact_name?.trim() || null,
    phone:          payload.phone?.trim() || null,
    line_id:        payload.line_id?.trim() || null,
    email:          payload.email?.trim() || null,
    house_type:     payload.house_type || 'อยู่เอง',
    area_sqw:       payload.area_sqw ? Number(payload.area_sqw) : 0,
    fee_rate:       payload.fee_rate ? Number(payload.fee_rate) : 10,
    parking_rights: Number.isFinite(Number(payload.parking_rights)) ? Math.max(0, Number(payload.parking_rights)) : 1,
    status:         payload.status || 'normal',
    note:           payload.note?.trim() || null,
  }

  let requestPayload = house

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase
      .from('houses')
      .insert([requestPayload])
      .select('*')
      .single()

    if (!error) return data

    const fallbackPayload = stripUnsupportedHouseColumns(requestPayload, error)
    if (attempt === 0 && Object.keys(fallbackPayload).length !== Object.keys(requestPayload).length) {
      requestPayload = fallbackPayload
      continue
    }

    throw error
  }

  return null
}

export async function updateHouse(id, updates) {
  const payload = {
    ...updates,
    floor_no: Number.isFinite(Number(updates.floor_no)) ? Math.min(99, Math.max(0, Math.trunc(Number(updates.floor_no)))) : 0,
    room_no: updates.room_no?.trim() || null,
    address: updates.address?.trim() || null,
    contact_name: updates.contact_name?.trim() || null,
    line_id: updates.line_id?.trim() || null,
    parking_rights: Number.isFinite(Number(updates.parking_rights)) ? Math.max(0, Number(updates.parking_rights)) : 1,
  }

  let requestPayload = payload

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase
      .from('houses')
      .update(requestPayload)
      .eq('id', id)
      .select('*')
      .single()

    if (!error) return data

    const fallbackPayload = stripUnsupportedHouseColumns(requestPayload, error)
    if (attempt === 0 && Object.keys(fallbackPayload).length !== Object.keys(requestPayload).length) {
      requestPayload = fallbackPayload
      continue
    }

    throw error
  }

  return null
}

export async function deleteHouse(id) {
  const { error } = await supabase
    .from('houses')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}
