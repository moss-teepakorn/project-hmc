import { supabase } from './supabase'

export async function listTechnicians({ status = 'all', search = '' } = {}) {
  const { data, error } = await supabase
    .from('technicians')
    .select('id, name, phone, line_id, rating, review_count, status, avatar_url, note, created_at, technician_services(id, skill, price_min, price_max, price_note)')
    .order('created_at', { ascending: false })

  if (error) throw error

  const keyword = (search || '').trim().toLowerCase()
  return (data ?? []).filter((item) => {
    if (status !== 'all' && item.status !== status) return false
    if (!keyword) return true
    const skills = (item.technician_services || []).map((s) => s.skill).join(' ')
    const searchable = [item.name, item.phone, item.line_id, skills]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return searchable.includes(keyword)
  })
}

export async function createTechnician(payload, services = []) {
  const record = {
    name: payload.name?.trim() || null,
    phone: payload.phone?.trim() || null,
    line_id: payload.line_id?.trim() || null,
    status: payload.status || 'pending',
    note: payload.note?.trim() || null,
  }

  const { data, error } = await supabase
    .from('technicians')
    .insert([record])
    .select('id')
    .single()

  if (error) throw error

  if (Array.isArray(services) && services.length > 0) {
    const serviceRecords = services
      .filter((s) => s.skill?.trim())
      .map((s) => ({
        tech_id: data.id,
        skill: s.skill.trim(),
        price_min: Number(s.price_min) || 0,
        price_max: Number(s.price_max) || 0,
        price_note: s.price_note?.trim() || null,
      }))
    if (serviceRecords.length > 0) {
      const { error: svcError } = await supabase
        .from('technician_services')
        .insert(serviceRecords)
      if (svcError) throw svcError
    }
  }

  const { data: full, error: fullError } = await supabase
    .from('technicians')
    .select('id, name, phone, line_id, rating, review_count, status, avatar_url, note, created_at, technician_services(id, skill, price_min, price_max, price_note)')
    .eq('id', data.id)
    .single()

  if (fullError) throw fullError
  return full
}

export async function updateTechnician(id, payload, services = null) {
  const record = {
    name: payload.name?.trim() || null,
    phone: payload.phone?.trim() || null,
    line_id: payload.line_id?.trim() || null,
    status: payload.status || 'pending',
    note: payload.note?.trim() || null,
  }

  const { error } = await supabase
    .from('technicians')
    .update(record)
    .eq('id', id)

  if (error) throw error

  if (Array.isArray(services)) {
    const { error: delError } = await supabase
      .from('technician_services')
      .delete()
      .eq('tech_id', id)
    if (delError) throw delError

    const serviceRecords = services
      .filter((s) => s.skill?.trim())
      .map((s) => ({
        tech_id: id,
        skill: s.skill.trim(),
        price_min: Number(s.price_min) || 0,
        price_max: Number(s.price_max) || 0,
        price_note: s.price_note?.trim() || null,
      }))

    if (serviceRecords.length > 0) {
      const { error: insError } = await supabase
        .from('technician_services')
        .insert(serviceRecords)
      if (insError) throw insError
    }
  }

  const { data: full, error: fullError } = await supabase
    .from('technicians')
    .select('id, name, phone, line_id, rating, review_count, status, avatar_url, note, created_at, technician_services(id, skill, price_min, price_max, price_note)')
    .eq('id', id)
    .single()

  if (fullError) throw fullError
  return full
}

export async function deleteTechnician(id) {
  const { error } = await supabase
    .from('technicians')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}
