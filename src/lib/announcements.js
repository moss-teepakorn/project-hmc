import { supabase } from './supabase'

const ANNOUNCEMENT_IMAGE_BUCKET = 'announcement-images'
const MAX_ANNOUNCEMENT_IMAGE_BYTES = 100 * 1024
const RULE_PREFIX = 'RULEDOC::'

export async function listAnnouncements({ type = 'all', search = '' } = {}) {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, announcement_no, announcement_date, title, content, type, image_url, is_pinned, created_by, created_at')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  const keyword = (search || '').trim().toLowerCase()
  return (data ?? []).filter((item) => {
    if (String(item.content || '').startsWith(RULE_PREFIX)) return false
    if (type !== 'all' && item.type !== type) return false
    if (!keyword) return true
    const searchable = [item.title, item.content]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return searchable.includes(keyword)
  })
}

export async function createAnnouncement(payload) {
  const record = {
    announcement_no: payload.announcement_no?.trim() || null,
    announcement_date: payload.announcement_date || null,
    title: payload.title?.trim() || null,
    content: payload.content?.trim() || null,
    type: payload.type || 'normal',
    is_pinned: Boolean(payload.is_pinned),
    image_url: payload.image_url?.trim() || null,
    created_by: payload.created_by || null,
  }

  const { data, error } = await supabase
    .from('announcements')
    .insert([record])
    .select('id, announcement_no, announcement_date, title, content, type, image_url, is_pinned, created_by, created_at')
    .single()

  if (error) throw error
  return data
}

export async function updateAnnouncement(id, updates) {
  const { data, error } = await supabase
    .from('announcements')
    .update(updates)
    .eq('id', id)
    .select('id, announcement_no, announcement_date, title, content, type, image_url, is_pinned, created_by, created_at')
    .single()

  if (error) throw error
  return data
}

export async function deleteAnnouncement(id) {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}

export async function listAnnouncementImages(announcementId) {
  const folder = String(announcementId || '').trim()
  if (!folder) return []

  const { data, error } = await supabase.storage
    .from(ANNOUNCEMENT_IMAGE_BUCKET)
    .list(folder, { limit: 5, sortBy: { column: 'name', order: 'asc' } })

  if (error) {
    if (String(error.message || '').toLowerCase().includes('not found')) return []
    throw error
  }

  return (data || [])
    .filter((item) => item.name)
    .map((item) => {
      const path = `${folder}/${item.name}`
      const { data: publicUrlData } = supabase.storage
        .from(ANNOUNCEMENT_IMAGE_BUCKET)
        .getPublicUrl(path)
      return {
        name: item.name,
        path,
        url: publicUrlData?.publicUrl || '',
      }
    })
}

export async function uploadAnnouncementImage(announcementId, file) {
  const folder = String(announcementId || '').trim()
  if (!folder || !file) return null

  if (file.size > MAX_ANNOUNCEMENT_IMAGE_BYTES) {
    throw new Error(`ไฟล์ ${file.name} มีขนาดเกิน 100KB`)
  }

  const path = `${folder}/${file.name}`
  const { error } = await supabase.storage
    .from(ANNOUNCEMENT_IMAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

  if (error) throw error

  const { data: publicUrlData } = supabase.storage
    .from(ANNOUNCEMENT_IMAGE_BUCKET)
    .getPublicUrl(path)

  return { name: file.name, path, url: publicUrlData?.publicUrl || '' }
}

export async function deleteAnnouncementImagesByPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return true

  const { error } = await supabase.storage
    .from(ANNOUNCEMENT_IMAGE_BUCKET)
    .remove(paths)

  if (error) throw error
  return true
}
