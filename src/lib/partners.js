import { supabase } from './supabase'

function normalizePartner(payload = {}) {
  return {
    name: String(payload.name || '').trim(),
    tax_id: String(payload.tax_id || '').trim() || null,
    address: String(payload.address || '').trim() || null,
    phone: String(payload.phone || '').trim() || null,
    note: String(payload.note || '').trim() || null,
    is_active: payload.is_active === false ? false : true,
  }
}

export async function listPartners({ onlyActive = false } = {}) {
  let query = supabase
    .from('partners')
    .select('id, name, tax_id, address, phone, note, is_active, created_at, updated_at')
    .order('name', { ascending: true })

  if (onlyActive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createPartner(payload = {}) {
  const row = normalizePartner(payload)
  if (!row.name) throw new Error('กรุณาระบุชื่อคู่ค้า')

  const { data, error } = await supabase
    .from('partners')
    .insert([row])
    .select('id, name, tax_id, address, phone, note, is_active, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updatePartner(id, patch = {}) {
  if (!id) throw new Error('ไม่พบรหัสคู่ค้า')
  const payload = normalizePartner({ ...patch })

  if (Object.keys(patch).length === 0) return null

  const allowed = ['name', 'tax_id', 'address', 'phone', 'note', 'is_active']
  const clean = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      clean[key] = payload[key]
    }
  }

  if (Object.keys(clean).length === 0) return null
  if (Object.prototype.hasOwnProperty.call(clean, 'name') && !String(clean.name || '').trim()) {
    throw new Error('กรุณาระบุชื่อคู่ค้า')
  }

  const { data, error } = await supabase
    .from('partners')
    .update(clean)
    .eq('id', id)
    .select('id, name, tax_id, address, phone, note, is_active, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

export async function deletePartner(id) {
  const { error } = await supabase.from('partners').delete().eq('id', id)
  if (error) throw error
  return true
}
