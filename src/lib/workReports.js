import { supabase } from './supabase'

const WORK_REPORT_IMAGE_BUCKET = 'work-report-images'
const MAX_WORK_REPORT_IMAGE_BYTES = 100 * 1024
const MAX_WORK_REPORT_IMAGES = 10

export async function listWorkReports({ month = null, year = null, category = 'all', search = '' } = {}) {
  let query = supabase
    .from('work_reports')
    .select('id, month, year, category, summary, detail, image_urls, is_published, created_by, created_at, updated_at')
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  if (month !== null && month !== '') {
    const m = Number(month)
    if (m >= 1 && m <= 12) query = query.eq('month', m)
  }

  if (year !== null && year !== '') {
    query = query.eq('year', Number(year))
  }

  if (category !== 'all' && category !== '') {
    query = query.eq('category', category)
  }

  const keyword = String(search || '').trim()
  if (keyword) {
    query = query.or(`summary.ilike.%${keyword}%,detail.ilike.%${keyword}%,category.ilike.%${keyword}%`)
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

export async function createWorkReport(payload) {
  const { data: authData } = await supabase.auth.getUser()
  const newReport = {
    month: Number(payload.month || 0),
    year: Number(payload.year || new Date().getFullYear()),
    category: String(payload.category || '').trim(),
    summary: String(payload.summary || '').trim(),
    detail: String(payload.detail || '').trim(),
    image_urls: Array.isArray(payload.image_urls) ? payload.image_urls : [],
    is_published: Boolean(payload.is_published),
    created_by: authData?.user?.id || null,
  }

  const { data, error } = await supabase
    .from('work_reports')
    .insert([newReport])
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function getWorkReportById(id) {
  const { data, error } = await supabase
    .from('work_reports')
    .select('id, month, year, category, summary, detail, image_urls, is_published, created_by, created_at, updated_at')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function updateWorkReport(id, updates) {
  const { data: authData } = await supabase.auth.getUser()
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('work_reports')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function deleteWorkReport(id) {
  const { data, error } = await supabase
    .from('work_reports')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}

export async function uploadWorkReportImages(reportId, files) {
  const folder = String(reportId || '').trim()
  if (!folder || !Array.isArray(files) || files.length === 0) return []

  if (files.length > MAX_WORK_REPORT_IMAGES) {
    throw new Error(`แนบได้สูงสุด ${MAX_WORK_REPORT_IMAGES} รูป`)
  }

  const uploaded = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (file.size > MAX_WORK_REPORT_IMAGE_BYTES) {
      throw new Error(`ไฟล์ ${file.name} มีขนาดเกิน 100KB`)
    }

    const timestamp = Date.now()
    const sequence = String(i + 1).padStart(3, '0')
    const ext = String(file.name || 'jpg').split('.').pop().toLowerCase()
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
    const fileName = `WRK_${timestamp}_${sequence}.${safeExt}`
    const path = `${folder}/${fileName}`

    const { error } = await supabase.storage
      .from(WORK_REPORT_IMAGE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

    if (error) {
      const message = String(error.message || '').toLowerCase()
      if (message.includes('bucket') && message.includes('not found')) {
        throw new Error('ไม่พบบัคเก็ต work-report-images ใน Supabase Storage กรุณาสร้าง bucket นี้ก่อนอัปโหลดรูป')
      }
      throw error
    }

    const { data: publicUrlData } = supabase.storage
      .from(WORK_REPORT_IMAGE_BUCKET)
      .getPublicUrl(path)

    uploaded.push({ name: fileName, path, url: publicUrlData?.publicUrl || '' })
  }

  return uploaded
}

export async function deleteWorkReportImagesByPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return true

  const { error } = await supabase.storage
    .from(WORK_REPORT_IMAGE_BUCKET)
    .remove(paths)

  if (error) throw error
  return true
}

export async function listWorkReportImages(reportId) {
  const folder = String(reportId || '').trim()
  if (!folder) return []

  const { data, error } = await supabase.storage
    .from(WORK_REPORT_IMAGE_BUCKET)
    .list(folder)

  if (error) return []

  const images = (data ?? [])
    .filter(item => !item.isdir && item.name)
    .map(item => {
      const { data: publicUrlData } = supabase.storage
        .from(WORK_REPORT_IMAGE_BUCKET)
        .getPublicUrl(`${folder}/${item.name}`)
      return {
        name: item.name,
        path: `${folder}/${item.name}`,
        url: publicUrlData?.publicUrl || '',
      }
    })

  return images
}
