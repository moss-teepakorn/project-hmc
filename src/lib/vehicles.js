import { supabase } from './supabase'

const VEHICLE_IMAGE_BUCKET = 'vehicle-images'
const MAX_VEHICLE_IMAGE_BYTES = 100 * 1024
const ALLOWED_VEHICLE_TYPES = new Set(['รถยนต์', 'รถจักรยานยนต์', 'รถกระบะ', 'รถตู้'])

const houseSorter = new Intl.Collator('th-TH', { numeric: true, sensitivity: 'base' })

function normalizeSoiValue(soi) {
  const numeric = Number.parseInt(String(soi || '').replace(/[^0-9]/g, ''), 10)
  return Number.isNaN(numeric) ? Number.MAX_SAFE_INTEGER : numeric
}

function sortVehicles(items) {
  return [...items].sort((left, right) => {
    const soiCompare = normalizeSoiValue(left.houses?.soi) - normalizeSoiValue(right.houses?.soi)
    if (soiCompare !== 0) return soiCompare
    const houseCompare = houseSorter.compare(left.houses?.house_no || '', right.houses?.house_no || '')
    if (houseCompare !== 0) return houseCompare
    return houseSorter.compare(left.license_plate || '', right.license_plate || '')
  })
}

function normalizeVehicleTypeValue(value) {
  return String(value || '').trim().toLowerCase()
}

function isMotorcycleVehicleType(value) {
  const type = normalizeVehicleTypeValue(value)
  return type === 'รถจักรยานยนต์' || type.includes('motorcycle') || type.includes('motorbike')
}

function sanitizeVehicleType(value) {
  return ALLOWED_VEHICLE_TYPES.has(value) ? value : 'รถยนต์'
}

export async function resolveHouseVehicleLimitPolicy(houseId, { includePendingAddRequests = false, projectedAdds = 1, vehicleType = null } = {}) {
  const targetHouseId = String(houseId || '').trim()
  if (!targetHouseId) {
    return {
      parkingRights: 0,
      allowExceedLimit: true,
      parkingFeePerVehicle: 0,
      currentVehicleCount: 0,
      pendingAddRequestCount: 0,
      projectedVehicleCount: 0,
      isOverLimit: false,
    }
  }

  const [houseResult, configResult, vehiclesResult, pendingResult] = await Promise.all([
    supabase
      .from('houses')
      .select('parking_rights')
      .eq('id', targetHouseId)
      .maybeSingle(),
    supabase
      .from('system_config')
      .select('allow_exceed_parking_limit, parking_fee_per_vehicle')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('vehicles')
      .select('id, vehicle_type')
      .eq('house_id', targetHouseId)
      .neq('status', 'removed'),
    includePendingAddRequests
      ? supabase
        .from('vehicle_requests')
        .select('id, vehicle_type')
        .eq('house_id', targetHouseId)
        .eq('status', 'pending')
        .eq('request_type', 'add')
      : Promise.resolve({ data: [] }),
  ])

  if (houseResult.error) throw houseResult.error
  if (configResult.error) throw configResult.error
  if (vehiclesResult.error) throw vehiclesResult.error
  if (pendingResult?.error) throw pendingResult.error

  const parsedRights = Number(houseResult.data?.parking_rights)
  const parkingRights = Number.isFinite(parsedRights) ? Math.max(0, parsedRights) : 1
  const allowExceedLimit = configResult.data?.allow_exceed_parking_limit ?? true
  const parkingFeePerVehicle = Math.max(0, Number(configResult.data?.parking_fee_per_vehicle ?? 0) || 0)
  const currentVehicleCount = Array.isArray(vehiclesResult.data)
    ? vehiclesResult.data.filter((item) => !isMotorcycleVehicleType(item.vehicle_type)).length
    : 0
  const pendingAddRequestCount = Array.isArray(pendingResult?.data)
    ? pendingResult.data.filter((item) => !isMotorcycleVehicleType(item.vehicle_type)).length
    : 0
  const projectedAddCount = isMotorcycleVehicleType(vehicleType)
    ? 0
    : Math.max(0, Number(projectedAdds || 0))
  const projectedVehicleCount = currentVehicleCount + pendingAddRequestCount + projectedAddCount
  const isOverLimit = projectedVehicleCount > parkingRights

  return {
    parkingRights,
    allowExceedLimit,
    parkingFeePerVehicle,
    currentVehicleCount,
    pendingAddRequestCount,
    projectedVehicleCount,
    isOverLimit,
  }
}

export async function listVehicles({ status = 'all', search = '', soi = 'all', vehicleType = 'all' } = {}) {
  const query = supabase
    .from('vehicles')
    .select('id, house_id, license_plate, province, brand, model, color, vehicle_type, parking_location, parking_lock_no, parking_fee, status, note, created_at, houses(id, house_no, soi, owner_name)')
    .order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) throw error

  const keyword = search.trim().toLowerCase()
  const filtered = (data ?? []).filter((item) => {
    if (status !== 'all' && item.status !== status) return false
    if (soi !== 'all' && String(item.houses?.soi || '') !== String(soi)) return false
    if (vehicleType !== 'all' && item.vehicle_type !== vehicleType) return false
    if (!keyword) return true

    const searchable = [
      item.license_plate,
      item.brand,
      item.model,
      item.color,
      item.houses?.house_no,
      item.houses?.owner_name,
      item.houses?.soi,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return searchable.includes(keyword)
  })

  return sortVehicles(filtered)
}

export async function createVehicle(payload) {
  let parkingFee = payload.parking_fee ? Number(payload.parking_fee) : 0
  const vehicleType = sanitizeVehicleType(payload.vehicle_type)
  if (payload.house_id) {
    const policy = await resolveHouseVehicleLimitPolicy(payload.house_id, { projectedAdds: 1, vehicleType })
    if (policy.isOverLimit && !policy.allowExceedLimit) {
      throw new Error(`บ้านนี้มีสิทธิ์จอดรถ ${policy.parkingRights} คัน (ไม่นับรวมรถจักรยานยนต์) และตั้งค่าไม่อนุญาตให้เพิ่มเกินสิทธิ์`)
    }
    if (policy.isOverLimit && policy.allowExceedLimit) {
      parkingFee = policy.parkingFeePerVehicle
    }
  }

  const vehicle = {
    house_id: payload.house_id || null,
    license_plate: payload.license_plate?.trim() || null,
    province: payload.province?.trim() || null,
    brand: payload.brand?.trim() || null,
    model: payload.model?.trim() || null,
    color: payload.color?.trim() || null,
    vehicle_type: vehicleType,
    parking_location: payload.parking_location || 'ในบ้าน',
    parking_lock_no: payload.parking_lock_no?.trim() || null,
    parking_fee: parkingFee,
    status: payload.status || 'active',
    note: payload.note?.trim() || null,
  }

  const { data, error } = await supabase
    .from('vehicles')
    .insert([vehicle])
    .select('id, house_id, license_plate, province, brand, model, color, vehicle_type, parking_location, parking_lock_no, parking_fee, status, note, created_at, houses(id, house_no, soi, owner_name)')
    .single()

  if (error) throw error
  return data
}

export async function assertUniqueVehiclePlateProvince({ licensePlate, province, vehicleType = null, excludeId = null }) {
  const normalizedPlate = String(licensePlate || '').trim().toLowerCase()
  const normalizedProvince = String(province || '').trim().toLowerCase()
  const normalizedVehicleType = String(vehicleType || '').trim().toLowerCase()

  if (!normalizedPlate || !normalizedProvince || !normalizedVehicleType) {
    throw new Error('กรุณาระบุทะเบียนรถ ประเภทรถ และจังหวัด')
  }

  let query = supabase
    .from('vehicles')
    .select('id, license_plate, province, vehicle_type')
    .ilike('license_plate', licensePlate)
    .ilike('province', province)
    .limit(30)

  if (vehicleType) query = query.eq('vehicle_type', vehicleType)

  const { data, error } = await query

  if (error) throw error

  const duplicate = (data || []).find((item) => {
    if (excludeId && item.id === excludeId) return false
    return String(item.license_plate || '').trim().toLowerCase() === normalizedPlate
      && String(item.province || '').trim().toLowerCase() === normalizedProvince
      && String(item.vehicle_type || '').trim().toLowerCase() === normalizedVehicleType
  })

  if (duplicate) {
    throw new Error('ทะเบียนรถ ประเภทรถ และจังหวัดนี้มีอยู่แล้วในระบบ')
  }

  return true
}

export async function updateVehicle(id, updates) {
  const { data, error } = await supabase
    .from('vehicles')
    .update(updates)
    .eq('id', id)
    .select('id, house_id, license_plate, province, brand, model, color, vehicle_type, parking_location, parking_lock_no, parking_fee, status, note, created_at, houses(id, house_no, soi, owner_name)')
    .single()

  if (error) throw error
  return data
}

export async function deleteVehicle(id) {
  const { error } = await supabase
    .from('vehicles')
    .update({ status: 'removed' })
    .eq('id', id)

  if (error) throw error
  return true
}

export async function listVehicleImages(vehicleId) {
  const folder = String(vehicleId || '').trim()
  if (!folder) return []

  const { data, error } = await supabase.storage
    .from(VEHICLE_IMAGE_BUCKET)
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
        .from(VEHICLE_IMAGE_BUCKET)
        .getPublicUrl(path)

      return {
        name: item.name,
        path,
        url: publicUrlData?.publicUrl || '',
      }
    })
}

export async function uploadVehicleImages(vehicleId, files) {
  const folder = String(vehicleId || '').trim()
  if (!folder || !Array.isArray(files) || files.length === 0) return []

  const uploaded = []
  for (const file of files) {
    if (file.size > MAX_VEHICLE_IMAGE_BYTES) {
      throw new Error(`ไฟล์ ${file.name} มีขนาดเกิน 100KB`)
    }

    const fileName = file.name
    const path = `${folder}/${fileName}`
    const { error } = await supabase.storage
      .from(VEHICLE_IMAGE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

    if (error) throw error

    const { data: publicUrlData } = supabase.storage
      .from(VEHICLE_IMAGE_BUCKET)
      .getPublicUrl(path)

    uploaded.push({
      name: fileName,
      path,
      url: publicUrlData?.publicUrl || '',
    })
  }

  return uploaded
}

export async function deleteVehicleImagesByPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return true

  const { error } = await supabase.storage
    .from(VEHICLE_IMAGE_BUCKET)
    .remove(paths)

  if (error) throw error
  return true
}