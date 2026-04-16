import { supabase } from './supabase'

export async function listPaymentItemTypes({ onlyActive = false } = {}) {
  let q = supabase.from('payment_item_types').select('*').order('code', { ascending: true })
  if (onlyActive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createPaymentItemType(payload = {}) {
  const row = {
    code: String(payload.code || '').trim(),
    label: String(payload.label || '').trim(),
    description: payload.description || null,
    default_amount: Number(payload.default_amount || 0),
    category: payload.category || null,
    is_active: payload.is_active === false ? false : true,
  }
  const { data, error } = await supabase.from('payment_item_types').insert([row]).select('*').single()
  if (error) throw error
  return data
}

export async function updatePaymentItemType(id, patch = {}) {
  const allowed = ['code', 'label', 'description', 'default_amount', 'category', 'is_active']
  const payload = {}
  for (const k of allowed) {
    if (k in patch) payload[k] = patch[k]
  }
  if (Object.keys(payload).length === 0) return null
  const { data, error } = await supabase.from('payment_item_types').update(payload).eq('id', id).select('*').single()
  if (error) throw error
  return data
}

export async function deletePaymentItemType(id) {
  const { error } = await supabase.from('payment_item_types').delete().eq('id', id)
  if (error) throw error
  return true
}
