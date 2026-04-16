import { supabase } from './supabase'

const MARKETPLACE_IMAGE_BUCKET = 'marketplace-images'
const MAX_MARKETPLACE_IMAGE_BYTES = 100 * 1024
const MAX_MARKETPLACE_IMAGES = 2

export async function listMarketplace({ status = 'all', listing_type = 'all', search = '' } = {}) {
  const { data, error } = await supabase
    .from('marketplace')
    .select('id, house_id, title, detail, category, listing_type, price, contact, image_url, status, created_at, houses(id, house_no, soi, owner_name)')
    .order('created_at', { ascending: false })

  if (error) throw error

  const keyword = (search || '').trim().toLowerCase()
  return (data ?? []).filter((item) => {
    if (status !== 'all' && item.status !== status) return false
    if (listing_type !== 'all' && item.listing_type !== listing_type) return false
    if (!keyword) return true
    const searchable = [
      item.title,
      item.detail,
      item.category,
      item.contact,
      item.houses?.house_no,
      item.houses?.owner_name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return searchable.includes(keyword)
  })
}

export async function createMarketplaceItem(payload) {
  const record = {
    house_id: payload.house_id || null,
    title: payload.title?.trim() || null,
    detail: payload.detail?.trim() || null,
    category: payload.category?.trim() || null,
    listing_type: payload.listing_type || 'sell',
    price: Number(payload.price) || 0,
    contact: payload.contact?.trim() || null,
    image_url: payload.image_url?.trim() || null,
    status: payload.status || 'pending',
  }

  const { data, error } = await supabase
    .from('marketplace')
    .insert([record])
    .select('id, house_id, title, detail, category, listing_type, price, contact, image_url, status, created_at, houses(id, house_no, soi, owner_name)')
    .single()

  if (error) throw error
  return data
}

export async function updateMarketplaceItem(id, updates) {
  const { data, error } = await supabase
    .from('marketplace')
    .update(updates)
    .eq('id', id)
    .select('id, house_id, title, detail, category, listing_type, price, contact, image_url, status, created_at, houses(id, house_no, soi, owner_name)')
    .single()

  if (error) throw error
  return data
}

export async function deleteMarketplaceItem(id) {
  const { error } = await supabase
    .from('marketplace')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}

export async function uploadMarketplaceImages(itemId, files) {
  const folder = String(itemId || '').trim()
  if (!folder || !Array.isArray(files) || files.length === 0) return []

  if (files.length > MAX_MARKETPLACE_IMAGES) {
    throw new Error(`แนบได้สูงสุด ${MAX_MARKETPLACE_IMAGES} รูป`)
  }

  const uploaded = []
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]
    if (file.size > MAX_MARKETPLACE_IMAGE_BYTES) {
      throw new Error(`ไฟล์ ${file.name} มีขนาดเกิน 100KB`)
    }

    const timestamp = Date.now()
    const sequence = String(i + 1).padStart(3, '0')
    const ext = String(file.name || 'jpg').split('.').pop().toLowerCase()
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
    const fileName = `MKT_${timestamp}_${sequence}.${safeExt}`
    const path = `${folder}/${fileName}`

    const { error } = await supabase.storage
      .from(MARKETPLACE_IMAGE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

    if (error) {
      const message = String(error.message || '').toLowerCase()
      if (message.includes('bucket') && message.includes('not found')) {
        throw new Error('ไม่พบบัคเก็ต marketplace-images ใน Supabase Storage กรุณาสร้าง bucket นี้ก่อนอัปโหลดรูป')
      }
      throw error
    }

    const { data: publicUrlData } = supabase.storage
      .from(MARKETPLACE_IMAGE_BUCKET)
      .getPublicUrl(path)

    uploaded.push({ name: fileName, path, url: publicUrlData?.publicUrl || '' })
  }

  return uploaded
}

export async function deleteMarketplaceImagesByPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return true

  const { error } = await supabase.storage
    .from(MARKETPLACE_IMAGE_BUCKET)
    .remove(paths)

  if (error) throw error
  return true
}

export async function listMarketplaceImages(itemId) {
  const folder = String(itemId || '').trim()
  if (!folder) return []

  const { data, error } = await supabase.storage
    .from(MARKETPLACE_IMAGE_BUCKET)
    .list(folder, { limit: 100, offset: 0 })

  if (error) return []

  return (data ?? [])
    .filter((item) => !item.isdir && item.name)
    .map((item) => {
      const path = `${folder}/${item.name}`
      const { data: publicUrlData } = supabase.storage
        .from(MARKETPLACE_IMAGE_BUCKET)
        .getPublicUrl(path)
      return {
        name: item.name,
        path,
        url: publicUrlData?.publicUrl || '',
      }
    })
}

export async function deleteMarketplaceImageFolder(itemId, extraPaths = []) {
  const images = await listMarketplaceImages(itemId)
  const storagePaths = images.map((img) => img.path).filter(Boolean)
  const allPaths = Array.from(new Set([...
    storagePaths,
    ...(Array.isArray(extraPaths) ? extraPaths.filter(Boolean) : []),
  ]))

  if (allPaths.length === 0) return true
  return deleteMarketplaceImagesByPaths(allPaths)
}
