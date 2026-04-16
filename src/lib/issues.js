import { supabase } from './supabase'

const ISSUE_IMAGE_BUCKET = 'issue-images'
const MAX_ISSUE_IMAGE_BYTES = 100 * 1024
const INTERNAL_HOUSE_PROFILE_ISSUE_PREFIX = '[HOUSE_PROFILE_UPDATE_ISSUE] '

const ISSUE_CATEGORY_LABELS = {
  general: 'ทั่วไป',
  electrical: 'ไฟฟ้า',
  plumbing: 'ประปา',
  security: 'ความปลอดภัย',
  cleaning: 'ความสะอาด',
  structure: 'โครงสร้าง',
  road: 'ถนน',
  other: 'อื่นๆ',
}

function normalizeIssueCategory(category) {
  const raw = String(category || '').trim()
  if (!raw) return 'อื่นๆ'
  return ISSUE_CATEGORY_LABELS[raw] || raw
}

function isInternalHouseProfileIssue(item) {
  const detail = String(item?.detail || '').trim()
  return detail.startsWith(INTERNAL_HOUSE_PROFILE_ISSUE_PREFIX)
}

export async function listIssues({ status = 'all', category = 'all', search = '' } = {}) {
  const { data, error } = await supabase
    .from('issues')
    .select('id, house_id, title, detail, category, status, image_url, admin_note, rating, rating_note, resolved_at, created_at, houses(id, house_no, soi, owner_name)')
    .order('created_at', { ascending: false })

  if (error) throw error

  const normalizedRows = (data ?? [])
    .filter((item) => !isInternalHouseProfileIssue(item))
    .map((item) => ({
      ...item,
      category: normalizeIssueCategory(item.category),
    }))

  const keyword = (search || '').trim().toLowerCase()
  return normalizedRows.filter((item) => {
    if (status !== 'all' && item.status !== status) return false
    if (category !== 'all' && normalizeIssueCategory(item.category) !== category) return false
    if (!keyword) return true
    const searchable = [
      item.title,
      item.detail,
      normalizeIssueCategory(item.category),
      item.houses?.house_no,
      item.houses?.owner_name,
      item.houses?.soi,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return searchable.includes(keyword)
  })
}

export async function createIssue(payload) {
  const record = {
    house_id: payload.house_id || null,
    title: payload.title?.trim() || null,
    detail: payload.detail?.trim() || null,
    category: normalizeIssueCategory(payload.category),
    status: payload.status || 'pending',
    admin_note: payload.admin_note?.trim() || null,
  }

  const { data, error } = await supabase
    .from('issues')
    .insert([record])
    .select('id, house_id, title, detail, category, status, image_url, admin_note, rating, rating_note, resolved_at, created_at, houses(id, house_no, soi, owner_name)')
    .single()

  if (error) throw error
  return data
}

export async function updateIssue(id, updates) {
  const patch = { ...updates }
  if (Object.prototype.hasOwnProperty.call(patch, 'category')) {
    patch.category = normalizeIssueCategory(patch.category)
  }
  if (patch.status === 'resolved' && !patch.resolved_at) {
    patch.resolved_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('issues')
    .update(patch)
    .eq('id', id)
    .select('id, house_id, title, detail, category, status, image_url, admin_note, rating, rating_note, resolved_at, created_at, houses(id, house_no, soi, owner_name)')
    .single()

  if (error) throw error
  return data
}

export async function deleteIssue(id) {
  const { error } = await supabase
    .from('issues')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}

export async function listIssueImages(issueId) {
  const folder = String(issueId || '').trim()
  if (!folder) return []

  const { data, error } = await supabase.storage
    .from(ISSUE_IMAGE_BUCKET)
    .list(folder, { limit: 20, sortBy: { column: 'name', order: 'asc' } })

  if (error) {
    if (String(error.message || '').toLowerCase().includes('not found')) return []
    throw error
  }

  return (data || [])
    .filter((item) => item.name)
    .map((item) => {
      const path = `${folder}/${item.name}`
      const { data: publicUrlData } = supabase.storage
        .from(ISSUE_IMAGE_BUCKET)
        .getPublicUrl(path)
      return {
        name: item.name,
        path,
        url: publicUrlData?.publicUrl || '',
      }
    })
}

export async function uploadIssueImages(issueId, files) {
  const folder = String(issueId || '').trim()
  if (!folder || !Array.isArray(files) || files.length === 0) return []

  const uploaded = []
  for (const file of files) {
    if (file.size > MAX_ISSUE_IMAGE_BYTES) {
      throw new Error(`ไฟล์ ${file.name} มีขนาดเกิน 100KB`)
    }

    const path = `${folder}/${file.name}`
    const { error } = await supabase.storage
      .from(ISSUE_IMAGE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

    if (error) throw error

    const { data: publicUrlData } = supabase.storage
      .from(ISSUE_IMAGE_BUCKET)
      .getPublicUrl(path)

    uploaded.push({ name: file.name, path, url: publicUrlData?.publicUrl || '' })
  }

  return uploaded
}

export async function deleteIssueImagesByPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return true

  const { error } = await supabase.storage
    .from(ISSUE_IMAGE_BUCKET)
    .remove(paths)

  if (error) throw error
  return true
}
