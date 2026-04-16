import { supabase } from './supabase'
import {
  createVehicle,
  updateVehicle,
  listVehicleImages,
  uploadVehicleImages,
  deleteVehicleImagesByPaths,
  resolveHouseVehicleLimitPolicy,
} from './vehicles'

const REQUEST_IMAGE_BUCKET = 'vehicle-images'
const MAX_REQUEST_IMAGE_BYTES = 100 * 1024
const ALLOWED_VEHICLE_TYPES = new Set(['รถยนต์', 'รถจักรยานยนต์', 'รถกระบะ', 'รถตู้'])

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function sanitizeVehicleType(value) {
  return ALLOWED_VEHICLE_TYPES.has(value) ? value : 'รถยนต์'
}

async function assertUniqueVehicleRequestCombo({ licensePlate, province, vehicleType, excludeVehicleId = null }) {
  const normalizedPlate = normalizeText(licensePlate)
  const normalizedProvince = normalizeText(province)
  const normalizedVehicleType = normalizeText(vehicleType)

  if (!normalizedPlate || !normalizedProvince || !normalizedVehicleType) {
    throw new Error('กรุณาระบุทะเบียนรถ ประเภทรถ และจังหวัด')
  }

  let vehicleQuery = supabase
    .from('vehicles')
    .select('id, license_plate, province, vehicle_type')
    .ilike('license_plate', licensePlate)
    .ilike('province', province)
    .eq('vehicle_type', vehicleType)
    .limit(30)

  if (excludeVehicleId) vehicleQuery = vehicleQuery.neq('id', excludeVehicleId)
  const { data: vehicles, error: vehicleError } = await vehicleQuery
  if (vehicleError) throw vehicleError

  const duplicateVehicle = (vehicles || []).find((item) => {
    return normalizeText(item.license_plate) === normalizedPlate
      && normalizeText(item.province) === normalizedProvince
      && normalizeText(item.vehicle_type) === normalizedVehicleType
  })
  if (duplicateVehicle) {
    throw new Error('ข้อมูลรถซ้ำในระบบ: ทะเบียน + ประเภทรถ + จังหวัด')
  }

  const { data: pendingRequests, error: requestError } = await supabase
    .from('vehicle_requests')
    .select('id, license_plate, province, vehicle_type, status')
    .in('status', ['pending'])
    .ilike('license_plate', licensePlate)
    .ilike('province', province)
    .eq('vehicle_type', vehicleType)
    .limit(30)

  if (requestError) throw requestError

  const duplicatePending = (pendingRequests || []).find((item) => {
    return normalizeText(item.license_plate) === normalizedPlate
      && normalizeText(item.province) === normalizedProvince
      && normalizeText(item.vehicle_type) === normalizedVehicleType
  })

  if (duplicatePending) {
    throw new Error('มีคำขอรถรายการนี้ค้างอยู่แล้ว (ทะเบียน + ประเภทรถ + จังหวัด)')
  }
}

export async function listVehicleRequests({ houseId = null, status = 'all' } = {}) {
  let query = supabase
    .from('vehicle_requests')
    .select('*, houses(id, house_no, soi, owner_name), vehicles(id, license_plate, brand, model, color, vehicle_type, parking_location, parking_lock_no, parking_fee, status)')
    .order('created_at', { ascending: false })

  if (houseId) query = query.eq('house_id', houseId)
  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createVehicleRequest(payload) {
  const vehicleType = sanitizeVehicleType(payload.vehicle_type)

  await assertUniqueVehicleRequestCombo({
    licensePlate: payload.license_plate,
    province: payload.province,
    vehicleType,
    excludeVehicleId: payload.request_type === 'edit' ? (payload.vehicle_id || null) : null,
  })

  let calculatedParkingFee = payload.parking_fee ? Number(payload.parking_fee) : 0
  if (payload.request_type === 'add' && payload.house_id) {
    const policy = await resolveHouseVehicleLimitPolicy(payload.house_id, {
      includePendingAddRequests: true,
      projectedAdds: 1,
      vehicleType,
    })

    if (policy.isOverLimit && !policy.allowExceedLimit) {
      throw new Error(`บ้านนี้มีสิทธิ์จอดรถ ${policy.parkingRights} คัน (ไม่นับรวมรถจักรยานยนต์) และตั้งค่าไม่อนุญาตให้เพิ่มเกินสิทธิ์`)
    }

    if (policy.isOverLimit && policy.allowExceedLimit) {
      calculatedParkingFee = policy.parkingFeePerVehicle
    }
  }

  const record = {
    house_id: payload.house_id,
    vehicle_id: payload.vehicle_id || null,
    request_type: payload.request_type || 'add',
    status: 'pending',
    license_plate: payload.license_plate?.trim() || null,
    province: payload.province?.trim() || null,
    brand: payload.brand?.trim() || null,
    model: payload.model?.trim() || null,
    color: payload.color?.trim() || null,
    vehicle_type: vehicleType,
    vehicle_status: payload.vehicle_status || 'active',
    parking_location: payload.parking_location || null,
    parking_lock_no: payload.parking_lock_no?.trim() || null,
    parking_fee: calculatedParkingFee,
    note: payload.note?.trim() || null,
    created_by_id: payload.created_by_id || null,
    image_urls: [],
  }

  const { data, error } = await supabase
    .from('vehicle_requests')
    .insert([record])
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateVehicleRequestImageUrls(id, imageUrls) {
  const { data, error } = await supabase
    .from('vehicle_requests')
    .update({ image_urls: imageUrls })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function listVehicleRequestImages(requestId) {
  const folder = `requests/${String(requestId || '').trim()}`
  if (folder === 'requests/') return []

  const { data, error } = await supabase.storage
    .from(REQUEST_IMAGE_BUCKET)
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
        .from(REQUEST_IMAGE_BUCKET)
        .getPublicUrl(path)

      return {
        name: item.name,
        path,
        url: publicUrlData?.publicUrl || '',
      }
    })
}

export async function deleteVehicleRequestImagesByPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return true

  const { error } = await supabase.storage
    .from(REQUEST_IMAGE_BUCKET)
    .remove(paths)

  if (error) throw error
  return true
}

async function copyRequestImagesToVehicle(requestId, vehicleId, { replaceExisting = false } = {}) {
  const requestImages = await listVehicleRequestImages(requestId)
  if (requestImages.length === 0 || !vehicleId) return []

  if (replaceExisting) {
    const currentVehicleImages = await listVehicleImages(vehicleId)
    const currentPaths = currentVehicleImages.map((item) => item.path).filter(Boolean)
    if (currentPaths.length > 0) await deleteVehicleImagesByPaths(currentPaths)
  }

  const files = []
  for (const image of requestImages) {
    const response = await fetch(image.url)
    if (!response.ok) throw new Error('โหลดรูปรถจากคำขอไม่สำเร็จ')
    const blob = await response.blob()
    files.push(new File([blob], image.name, { type: blob.type || 'image/jpeg' }))
  }

  if (files.length === 0) return []
  return uploadVehicleImages(vehicleId, files)
}

export async function updateVehicleRequestStatus(id, { status, adminNote = null }) {
  const updates = {
    status,
    admin_note: adminNote,
    reviewed_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('vehicle_requests')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function cancelVehicleRequest(id) {
  return updateVehicleRequestStatus(id, { status: 'cancelled' })
}

export async function resubmitVehicleRequest(id) {
  const { data, error } = await supabase
    .from('vehicle_requests')
    .update({ status: 'pending', admin_note: null, reviewed_at: null })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

// Admin: approve a request (applies changes to vehicles table)
export async function approveVehicleRequest(requestId, request) {
  const approvedParkingLockNo = request.parking_location === 'ส่วนกลาง'
    ? (request.parking_lock_no?.trim() || null)
    : null
  let approvedParkingFee = Number(request.parking_fee || 0) || 0

  const vehicleType = sanitizeVehicleType(request.vehicle_type)

  if (request.request_type === 'add' && request.house_id) {
    const policy = await resolveHouseVehicleLimitPolicy(request.house_id, { projectedAdds: 1, vehicleType })
    if (policy.isOverLimit && !policy.allowExceedLimit) {
      throw new Error(`บ้านนี้มีสิทธิ์จอดรถ ${policy.parkingRights} คัน (ไม่นับรวมรถจักรยานยนต์) และตั้งค่าไม่อนุญาตให้เพิ่มเกินสิทธิ์`)
    }
    if (policy.isOverLimit && policy.allowExceedLimit) {
      approvedParkingFee = policy.parkingFeePerVehicle
    }
  }

  const { error: requestUpdateError } = await supabase
    .from('vehicle_requests')
    .update({
      parking_lock_no: approvedParkingLockNo,
      parking_fee: approvedParkingFee,
    })
    .eq('id', requestId)

  if (requestUpdateError) throw requestUpdateError

  if (request.request_type === 'add') {
    // Create new vehicle record
    const createdVehicle = await createVehicle({
      house_id: request.house_id,
      license_plate: request.license_plate,
      province: request.province,
      brand: request.brand,
      model: request.model,
      color: request.color,
      vehicle_type: vehicleType,
      parking_location: request.parking_location,
      parking_lock_no: approvedParkingLockNo,
      parking_fee: approvedParkingFee,
      status: request.vehicle_status || 'active',
      note: request.note,
    })
    await supabase
      .from('vehicle_requests')
      .update({ vehicle_id: createdVehicle.id })
      .eq('id', requestId)

    if (Array.isArray(request.image_urls) && request.image_urls.length > 0) {
      await copyRequestImagesToVehicle(requestId, createdVehicle.id, { replaceExisting: true })
    }
  } else if (request.request_type === 'edit' && request.vehicle_id) {
    // Update existing vehicle record (only allowed edit fields)
    const updates = {}
    if (request.license_plate) updates.license_plate = request.license_plate
    if (request.province) updates.province = request.province
    if (request.color) updates.color = request.color
    if (request.vehicle_status) updates.status = request.vehicle_status
    if (request.parking_location) updates.parking_location = request.parking_location
    updates.parking_lock_no = approvedParkingLockNo
    updates.parking_fee = approvedParkingFee
    await updateVehicle(request.vehicle_id, updates)

    if (Array.isArray(request.image_urls) && request.image_urls.length > 0) {
      await copyRequestImagesToVehicle(requestId, request.vehicle_id, { replaceExisting: true })
    }
  }

  return updateVehicleRequestStatus(requestId, { status: 'approved' })
}

export async function uploadVehicleRequestImages(requestId, files) {
  const folder = `requests/${String(requestId)}`
  const uploaded = []

  for (const file of files) {
    if (file.size > MAX_REQUEST_IMAGE_BYTES) {
      throw new Error(`ไฟล์ ${file.name} มีขนาดเกิน 100KB`)
    }

    const path = `${folder}/${file.name}`
    const { error } = await supabase.storage
      .from(REQUEST_IMAGE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

    if (error) throw error

    const { data: urlData } = supabase.storage.from(REQUEST_IMAGE_BUCKET).getPublicUrl(path)
    uploaded.push(urlData?.publicUrl || '')
  }

  return uploaded
}
