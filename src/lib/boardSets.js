import { supabase } from './supabase'

export async function listBoardSets() {
  const { data, error } = await supabase
    .from('board_sets')
    .select('id, set_no, is_active, note, created_at, updated_at, board_members(id, set_id, member_no, full_name, position, phone)')
    .order('set_no', { ascending: true })
  if (error) throw error
  return (data || []).map((set) => ({
    ...set,
    board_members: (set.board_members || []).sort((a, b) => a.member_no - b.member_no),
  }))
}

export async function getActiveBoardMembers() {
  const { data, error } = await supabase
    .from('board_sets')
    .select('board_members(id, set_id, member_no, full_name, position, phone)')
    .eq('is_active', true)
    .order('set_no', { ascending: false })
    .limit(1)
  if (error) throw error
  if (!data || data.length === 0) return []
  return (data[0].board_members || []).sort((a, b) => a.member_no - b.member_no)
}

export async function createBoardSet(payload = {}) {
  const setNo = Number(payload.set_no || 0)
  if (!setNo || setNo < 1) throw new Error('กรุณาระบุชุดที่ให้ถูกต้อง')

  const members = Array.isArray(payload.members) ? payload.members : []

  const { data: setData, error: setError } = await supabase
    .from('board_sets')
    .insert([{ set_no: setNo, is_active: payload.is_active !== false, note: payload.note || null }])
    .select('id, set_no, is_active, note, created_at, updated_at')
    .single()
  if (setError) throw setError

  const memberRows = Array.from({ length: 7 }, (_, i) => {
    const m = members[i] || {}
    return {
      set_id: setData.id,
      member_no: i + 1,
      full_name: String(m.full_name || '').trim(),
      position: String(m.position || 'กรรมการ').trim(),
      phone: String(m.phone || '').trim() || null,
    }
  })

  const { error: mErr } = await supabase.from('board_members').insert(memberRows)
  if (mErr) throw mErr

  return setData
}

export async function updateBoardSet(id, patch = {}) {
  if (!id) throw new Error('ไม่พบรหัส board set')
  const clean = {}
  if (Object.prototype.hasOwnProperty.call(patch, 'set_no')) clean.set_no = Number(patch.set_no || 0)
  if (Object.prototype.hasOwnProperty.call(patch, 'is_active')) clean.is_active = !!patch.is_active
  if (Object.prototype.hasOwnProperty.call(patch, 'note')) clean.note = String(patch.note || '').trim() || null

  if (Object.keys(clean).length > 0) {
    const { error } = await supabase.from('board_sets').update(clean).eq('id', id)
    if (error) throw error
  }
  return true
}

export async function saveBoardMembers(setId, members = []) {
  if (!setId) throw new Error('ไม่พบรหัส board set')

  // Delete all existing members and re-insert 7 rows
  const { error: delErr } = await supabase.from('board_members').delete().eq('set_id', setId)
  if (delErr) throw delErr

  const rows = Array.from({ length: 7 }, (_, i) => {
    const m = members[i] || {}
    return {
      set_id: setId,
      member_no: i + 1,
      full_name: String(m.full_name || '').trim(),
      position: String(m.position || 'กรรมการ').trim(),
      phone: String(m.phone || '').trim() || null,
    }
  })

  const { error: insErr } = await supabase.from('board_members').insert(rows)
  if (insErr) throw insErr
  return true
}

export async function setActiveBoardSet(id) {
  if (!id) throw new Error('ไม่พบรหัส board set')

  const { error: deactivateErr } = await supabase
    .from('board_sets')
    .update({ is_active: false })
    .neq('id', id)
  if (deactivateErr) throw deactivateErr

  const { data, error } = await supabase
    .from('board_sets')
    .update({ is_active: true })
    .eq('id', id)
    .select('id, set_no, is_active')
    .single()
  if (error) throw error
  return data
}

export async function deleteBoardSet(id) {
  if (!id) throw new Error('ไม่พบรหัส board set')
  const { error } = await supabase.from('board_sets').delete().eq('id', id)
  if (error) throw error
  return true
}
