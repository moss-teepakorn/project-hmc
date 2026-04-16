import React, { useEffect, useMemo, useRef, useState } from 'react'
import DropdownList from '../../components/DropdownList'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'
import { listHouses } from '../../lib/houses'
import {
  assertUniqueVehiclePlateProvince,
  createVehicle,
  deleteVehicle,
  deleteVehicleImagesByPaths,
  listVehicleImages,
  resolveHouseVehicleLimitPolicy,
  listVehicles,
  updateVehicle,
  uploadVehicleImages,
} from '../../lib/vehicles'

const VEHICLE_TYPES = [
  { value: 'รถยนต์', label: 'รถยนต์' },
  { value: 'รถจักรยานยนต์', label: 'รถจักรยานยนต์' },
  { value: 'รถกระบะ', label: 'รถกระบะ' },
  { value: 'รถตู้', label: 'รถตู้' },
]

const BRAND_OPTIONS = [
  'Toyota', 'Honda', 'Isuzu', 'Mitsubishi', 'Nissan', 'Mazda', 'Ford', 'MG',
  'BYD', 'GWM', 'Suzuki', 'Subaru', 'Hyundai', 'Kia', 'Mercedes-Benz',
  'BMW', 'Audi', 'Volvo', 'Lexus', 'Chevrolet', 'Peugeot', 'Yamaha', 'Honda Motorcycle',
  'Kawasaki', 'Suzuki Motorcycle', 'Vespa', 'Ducati', 'Triumph', 'Royal Enfield', 'อื่นๆ',
]

const COLOR_OPTIONS = [
  'ขาว', 'ดำ', 'เทา', 'เงิน', 'น้ำเงิน', 'แดง', 'เขียว', 'เหลือง',
  'ส้ม', 'น้ำตาล', 'ม่วง', 'ชมพู', 'ทอง', 'ฟ้า', 'อื่นๆ',
]

const PROVINCE_OPTIONS = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา',
  'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก',
  'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน',
  'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา',
  'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต',
  'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี',
  'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม',
  'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์',
  'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี',
  'เบตง',
]

const PARKING_OPTIONS = [
  { value: 'ในบ้าน', label: 'ในบ้าน' },
  { value: 'หน้าบ้าน', label: 'หน้าบ้าน' },
  { value: 'ส่วนกลาง', label: 'ส่วนกลาง' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'ใช้งาน' },
  { value: 'pending', label: 'รออนุมัติ' },
  { value: 'removed', label: 'ยกเลิก' },
]

const EMPTY_FORM = {
  house_id: '',
  license_plate_prefix: '',
  license_plate_number: '',
  province: 'กรุงเทพมหานคร',
  vehicle_type: 'รถยนต์',
  brand: 'Toyota',
  brand_other: '',
  model: '',
  color: 'ขาว',
  color_other: '',
  parking_location: 'ในบ้าน',
  parking_lock_no: '',
  parking_fee: '0.00',
  status: 'pending',
  note: '',
}

const MAX_ATTACHMENTS = 5
const MAX_IMAGE_SIZE_BYTES = 100 * 1024
const MAX_IMAGE_TARGET_BYTES = 95 * 1024

const ALLOWED_VEHICLE_TYPES = new Set(VEHICLE_TYPES.map((item) => item.value))

const VEHICLE_EXCEL_COLUMN_ALIASES = {
  house_no: ['house_no', 'house no', 'บ้านเลขที่', 'เลขที่บ้าน'],
  soi: ['soi', 'ซอย'],
  license_plate: ['license_plate', 'ทะเบียนรถ', 'ทะเบียน'],
  license_plate_prefix: ['license_plate_prefix', 'ทะเบียนอักษร', 'ทะเบียนหน้า', 'prefix'],
  license_plate_number: ['license_plate_number', 'ทะเบียนตัวเลข', 'ทะเบียนหลัง', 'number'],
  province: ['province', 'จังหวัด'],
  vehicle_type: ['vehicle_type', 'ประเภทรถ', 'ประเภท'],
  brand: ['brand', 'ยี่ห้อ'],
  model: ['model', 'รุ่น'],
  color: ['color', 'สี'],
  parking_location: ['parking_location', 'ที่จอด'],
  parking_lock_no: ['parking_lock_no', 'ล็อกที่จอด', 'หมายเลขล็อก'],
  parking_fee: ['parking_fee', 'ค่าจอด'],
  status: ['status', 'สถานะ'],
  note: ['note', 'หมายเหตุ'],
}

const VEHICLE_IMPORT_TEMPLATE_ROWS = [
  {
    บ้านเลขที่: '10/1',
    ซอย: '1',
    ทะเบียนรถ: 'กข-1234',
    จังหวัด: 'กรุงเทพมหานคร',
    ประเภทรถ: 'รถยนต์',
    ยี่ห้อ: 'Toyota',
    รุ่น: 'Yaris',
    สี: 'ขาว',
    ที่จอด: 'ในบ้าน',
    ล็อกที่จอด: '',
    ค่าจอด: 0,
    สถานะ: 'active',
    หมายเหตุ: '',
  },
  {
    บ้านเลขที่: '12/8',
    ซอย: '2',
    ทะเบียนรถ: '1กฮ-9999',
    จังหวัด: 'กรุงเทพมหานคร',
    ประเภทรถ: 'รถจักรยานยนต์',
    ยี่ห้อ: 'Honda Motorcycle',
    รุ่น: 'Wave',
    สี: 'แดง',
    ที่จอด: 'ส่วนกลาง',
    ล็อกที่จอด: 'B-12',
    ค่าจอด: 300,
    สถานะ: 'pending',
    หมายเหตุ: 'ตัวอย่างนำเข้า',
  },
]

function formatDecimal(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function blurActiveElement() {
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement) {
    activeElement.blur()
  }
}

function showSwal(options) {
  blurActiveElement()
  return Swal.fire({ returnFocus: false, ...options })
}

const AdminVehicles = () => {
  const [vehicles, setVehicles] = useState([])
  const [houses, setHouses] = useState([])
  const [soiFilter, setSoiFilter] = useState('all')
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [attachments, setAttachments] = useState([])
  const [removedImagePaths, setRemovedImagePaths] = useState([])

  const parsePlate = (plate) => {
    const [prefix = '', number = ''] = String(plate || '').split('-')
    return {
      prefix: prefix.trim(),
      number: number.trim(),
    }
  }

  const buildHouseLabel = (house) => `ซอย ${house.soi || '-'} • ${house.house_no}${house.owner_name ? ` - ${house.owner_name}` : ''}`

  const soiOptions = useMemo(() => {
    const soies = [...new Set(houses.map((house) => house.soi).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b))
    return soies
  }, [houses])

  const houseOptions = useMemo(
    () => houses.map((house) => ({ value: String(house.id), label: buildHouseLabel(house) })),
    [houses]
  )

  const soiFilterOptions = useMemo(
    () => [{ value: 'all', label: 'ทุกซอย' }, ...soiOptions.map((soi) => ({ value: soi, label: `ซอย ${soi}` }))],
    [soiOptions]
  )

  const vehicleTypeFilterOptions = useMemo(
    () => [{ value: 'all', label: 'ทุกประเภท' }, ...VEHICLE_TYPES],
    []
  )

  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'ทั้งหมด' },
      { value: 'active', label: 'ใช้งาน' },
      { value: 'pending', label: 'รออนุมัติ' },
      { value: 'removed', label: 'ยกเลิก' },
    ],
    []
  )

  const loadVehicles = async (override = {}) => {
    try {
      setLoading(true)
      const [vehicleData, houseData] = await Promise.all([
        listVehicles({
          status: override.status ?? statusFilter,
          search: override.search ?? searchTerm,
          soi: override.soi ?? soiFilter,
          vehicleType: override.vehicleType ?? vehicleTypeFilter,
        }),
        houses.length === 0 ? listHouses() : Promise.resolve(houses),
      ])
      setVehicles(vehicleData)
      setHouses(houseData)
    } catch (error) {
      console.error('Error loading vehicles:', error)
      await showSwal({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVehicles()
  }, [])

  const getStatusBadge = (status) => {
    if (status === 'active') return { className: 'bd b-ok', label: 'ใช้งาน' }
    if (status === 'pending') return { className: 'bd b-wn', label: 'รออนุมัติ' }
    if (status === 'removed') return { className: 'bd b-dg', label: 'ยกเลิก' }
    return { className: 'bd b-mu', label: status }
  }

  const openAddModal = () => {
    setEditingVehicle(null)
    setForm(EMPTY_FORM)
    setAttachments([])
    setRemovedImagePaths([])
    setShowModal(true)
  }

  const openEditModal = async (vehicle) => {
    const baseBrand = BRAND_OPTIONS.includes(vehicle.brand || '') ? vehicle.brand : 'อื่นๆ'
    const baseColor = COLOR_OPTIONS.includes(vehicle.color || '') ? vehicle.color : 'อื่นๆ'

    setEditingVehicle(vehicle)
    const parsedPlate = parsePlate(vehicle.license_plate)
    setForm({
      house_id: vehicle.house_id ? String(vehicle.house_id) : '',
      license_plate_prefix: parsedPlate.prefix,
      license_plate_number: parsedPlate.number,
      province: vehicle.province || 'กรุงเทพมหานคร',
      vehicle_type: ALLOWED_VEHICLE_TYPES.has(vehicle.vehicle_type) ? vehicle.vehicle_type : 'รถยนต์',
      brand: baseBrand,
      brand_other: baseBrand === 'อื่นๆ' ? (vehicle.brand || '') : '',
      model: vehicle.model || '',
      color: baseColor,
      color_other: baseColor === 'อื่นๆ' ? (vehicle.color || '') : '',
      parking_location: vehicle.parking_location || 'ในบ้าน',
      parking_lock_no: vehicle.parking_lock_no || '',
      parking_fee: formatDecimal(vehicle.parking_fee || 0),
      status: vehicle.status || 'pending',
      note: vehicle.note || '',
    })

    try {
      const currentImages = await listVehicleImages(vehicle.id)
      setAttachments(currentImages.map((image) => ({ ...image, source: 'existing' })))
    } catch (error) {
      console.error('Error loading vehicle images:', error)
      await showSwal({ icon: 'error', title: 'โหลดรูปภาพไม่สำเร็จ', text: error.message })
      setAttachments([])
    }

    setRemovedImagePaths([])
    setShowModal(true)
  }

  const closeModal = (force = false) => {
    if (saving && !force) return
    setShowModal(false)
    setEditingVehicle(null)
    setForm(EMPTY_FORM)
    setAttachments([])
    setRemovedImagePaths([])
  }

  const formatFileName = (index) => {
    const now = new Date()
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const running = String(index).padStart(3, '0')
    return `CAR_${date}_${time}_${running}.jpg`
  }

  const readImageElement = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const canvasToBlob = (canvas, quality) => new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })

  const resizeImageToLimit = async (file, sequence) => {
    const image = await readImageElement(file)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('ไม่สามารถประมวลผลรูปภาพได้')

    let width = image.width
    let height = image.height
    const maxDimension = 1600
    if (width > maxDimension || height > maxDimension) {
      const scale = Math.min(maxDimension / width, maxDimension / height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    canvas.width = width
    canvas.height = height
    context.drawImage(image, 0, 0, width, height)

    let quality = 0.9
    let blob = await canvasToBlob(canvas, quality)

    while (blob && blob.size > MAX_IMAGE_TARGET_BYTES && quality > 0.25) {
      quality -= 0.08
      blob = await canvasToBlob(canvas, quality)
    }

    while (blob && blob.size > MAX_IMAGE_TARGET_BYTES && (canvas.width > 480 || canvas.height > 480)) {
      canvas.width = Math.round(canvas.width * 0.9)
      canvas.height = Math.round(canvas.height * 0.9)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      quality = 0.82
      blob = await canvasToBlob(canvas, quality)

      while (blob && blob.size > MAX_IMAGE_TARGET_BYTES && quality > 0.25) {
        quality -= 0.08
        blob = await canvasToBlob(canvas, quality)
      }
    }

    if (!blob || blob.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(`ไม่สามารถย่อรูป ${file.name} ให้ต่ำกว่า 100KB ได้`)
    }

    const fileName = formatFileName(sequence)
    return new File([blob], fileName, { type: 'image/jpeg' })
  }

  const handleAttachFiles = async (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (selectedFiles.length === 0) return

    const remainingSlots = MAX_ATTACHMENTS - attachments.length
    if (remainingSlots <= 0) {
      await showSwal({ icon: 'warning', title: 'แนบรูปได้สูงสุด 5 รูป' })
      return
    }

    const filesToProcess = selectedFiles.slice(0, remainingSlots)
    if (selectedFiles.length > remainingSlots) {
      await showSwal({ icon: 'info', title: `รับได้แค่ ${remainingSlots} รูป`, text: 'ระบบจะใช้เฉพาะรูปชุดแรก' })
    }

    try {
      const startIndex = attachments.length + 1
      const prepared = []

      for (let index = 0; index < filesToProcess.length; index += 1) {
        const resizedFile = await resizeImageToLimit(filesToProcess[index], startIndex + index)
        prepared.push({
          source: 'new',
          name: resizedFile.name,
          file: resizedFile,
          url: URL.createObjectURL(resizedFile),
        })
      }

      setAttachments((current) => [...current, ...prepared])
    } catch (error) {
      await showSwal({ icon: 'error', title: 'แนบรูปไม่สำเร็จ', text: error.message })
    }
  }

  const handleRemoveAttachment = (target) => {
    setAttachments((current) => {
      const next = current.filter((item) => item !== target)
      if (target.source === 'new' && target.url) {
        URL.revokeObjectURL(target.url)
      }
      if (target.source === 'existing' && target.path) {
        setRemovedImagePaths((paths) => [...paths, target.path])
      }
      return next
    })
  }

  const handlePreviewAttachment = (target) => {
    if (!target.url) return
    showSwal({
      imageUrl: target.url,
      imageAlt: target.name,
      showConfirmButton: false,
      showCloseButton: true,
      width: 'auto',
      background: '#0f172a',
    })
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    applyFormValue(name, value)
  }

  const applyFormValue = (name, value) => {
    setForm((current) => {
      const next = { ...current, [name]: value }

      if (name === 'brand' && value !== 'อื่นๆ') {
        next.brand_other = ''
      }

      if (name === 'color' && value !== 'อื่นๆ') {
        next.color_other = ''
      }

      if (name === 'parking_location' && value !== 'ส่วนกลาง') {
        next.parking_lock_no = ''
      }

      return next
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.house_id) {
      await showSwal({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณาเลือกบ้าน' })
      return
    }

    if (!form.license_plate_prefix.trim() || !form.license_plate_number.trim()) {
      await showSwal({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณากรอกทะเบียนรถ' })
      return
    }

    if (form.brand === 'อื่นๆ' && !form.brand_other.trim()) {
      await showSwal({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณากรอกยี่ห้อรถ (อื่นๆ)' })
      return
    }

    if (form.color === 'อื่นๆ' && !form.color_other.trim()) {
      await showSwal({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณากรอกสีรถ (อื่นๆ)' })
      return
    }

    const licensePlate = `${form.license_plate_prefix.trim()}-${form.license_plate_number.trim()}`
    const brandName = form.brand === 'อื่นๆ' ? form.brand_other : form.brand

    try {
      setSaving(true)

      await assertUniqueVehiclePlateProvince({
        licensePlate,
        province: form.province,
        vehicleType: form.vehicle_type,
        excludeId: editingVehicle?.id || null,
      })

      const payload = {
        house_id: form.house_id,
        license_plate: licensePlate,
        province: form.province,
        vehicle_type: form.vehicle_type,
        brand: brandName,
        model: form.model,
        color: form.color === 'อื่นๆ' ? form.color_other : form.color,
        parking_location: form.parking_location,
        parking_lock_no: form.parking_location === 'ส่วนกลาง' ? form.parking_lock_no : null,
        parking_fee: Number(String(form.parking_fee).replace(/,/g, '')) || 0,
        status: form.status,
        note: form.note,
      }

      if (!editingVehicle) {
        const policy = await resolveHouseVehicleLimitPolicy(form.house_id, { projectedAdds: 1, vehicleType: form.vehicle_type })
        if (policy.isOverLimit && !policy.allowExceedLimit) {
          throw new Error(`บ้านนี้มีสิทธิ์จอดรถ ${policy.parkingRights} คัน (ไม่นับรวมรถจักรยานยนต์) และตั้งค่าไม่อนุญาตให้เพิ่มเกินสิทธิ์`)
        }
        if (policy.isOverLimit && policy.allowExceedLimit) {
          payload.parking_fee = policy.parkingFeePerVehicle
        }
      }

      if (editingVehicle) {
        const updated = await updateVehicle(editingVehicle.id, payload)
        if (removedImagePaths.length > 0) {
          await deleteVehicleImagesByPaths(removedImagePaths)
        }
        const newFiles = attachments
          .filter((item) => item.source === 'new' && item.file)
          .map((item) => item.file)
        if (newFiles.length > 0) {
          await uploadVehicleImages(updated.id, newFiles)
        }
        await showSwal({ icon: 'success', title: 'บันทึกสำเร็จ', text: `แก้ไขทะเบียน ${licensePlate} แล้ว`, timer: 1400, showConfirmButton: false })
      } else {
        const created = await createVehicle(payload)
        const newFiles = attachments
          .filter((item) => item.source === 'new' && item.file)
          .map((item) => item.file)
        if (newFiles.length > 0) {
          await uploadVehicleImages(created.id, newFiles)
        }
        await showSwal({ icon: 'success', title: 'เพิ่มข้อมูลสำเร็จ', text: `เพิ่มทะเบียน ${licensePlate} แล้ว`, timer: 1400, showConfirmButton: false })
      }

      closeModal(true)
      await loadVehicles({ status: statusFilter, search: searchTerm, soi: soiFilter, vehicleType: vehicleTypeFilter })
    } catch (error) {
      console.error('Error saving vehicle:', error)
      await showSwal({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteVehicle = async (vehicle) => {
    const result = await showSwal({
      icon: 'warning',
      title: 'ยืนยันการเปลี่ยนเป็นไม่ใช้งาน',
      text: `ต้องการเปลี่ยนทะเบียน ${vehicle.license_plate} เป็นไม่ใช้งานใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'เปลี่ยนเป็นไม่ใช้งาน',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#c0392b',
    })

    if (!result.isConfirmed) return

    try {
      await deleteVehicle(vehicle.id)
      await showSwal({ icon: 'success', title: 'อัปเดตสำเร็จ', text: 'เปลี่ยนสถานะเป็นไม่ใช้งานแล้ว', timer: 1200, showConfirmButton: false })
      await loadVehicles({ status: statusFilter, search: searchTerm, soi: soiFilter, vehicleType: vehicleTypeFilter })
    } catch (error) {
      console.error('Error deleting vehicle:', error)
      await showSwal({ icon: 'error', title: 'ลบไม่สำเร็จ', text: error.message })
    }
  }

  const normalizeImportKey = (value) => String(value || '').trim().toLowerCase().replace(/[_\-]/g, ' ').replace(/\s+/g, ' ')

  const pickCellValue = (row, aliases) => {
    const targets = new Set(aliases.map((item) => normalizeImportKey(item)))
    for (const key of Object.keys(row || {})) {
      if (targets.has(normalizeImportKey(key))) return row[key]
    }
    return ''
  }

  const toNumber = (value, fallback = 0) => {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim())
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const splitPlate = (plateValue, prefixValue, numberValue) => {
    if (prefixValue || numberValue) {
      return {
        prefix: String(prefixValue || '').trim(),
        number: String(numberValue || '').trim(),
      }
    }
    const raw = String(plateValue || '').trim()
    const [prefix = '', number = ''] = raw.split('-')
    return { prefix: prefix.trim(), number: number.trim() }
  }

  const normalizeVehicleStatus = (statusValue) => {
    const normalized = String(statusValue || '').trim().toLowerCase()
    if (normalized === 'active' || normalized === 'pending' || normalized === 'removed') return normalized
    if (normalized === 'ใช้งาน') return 'active'
    if (normalized === 'รออนุมัติ') return 'pending'
    if (normalized === 'ยกเลิก') return 'removed'
    return 'pending'
  }

  const normalizeVehicleType = (typeValue) => {
    const value = String(typeValue || '').trim()
    return ALLOWED_VEHICLE_TYPES.has(value) ? value : 'รถยนต์'
  }

  const parseVehicleExcelFile = async (file) => {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetNames = workbook.SheetNames || []
    if (sheetNames.length === 0) return []

    const isRowEmpty = (row) => Object.values(row || {}).every((value) => String(value || '').trim() === '')

    const isExampleRow = (row) => {
      const note = String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.note) || '').trim().toLowerCase()
      return note.includes('ตัวอย่าง') || note.includes('example')
    }

    const scoreSheet = (sheetName, rows) => {
      const normalizedName = String(sheetName || '').trim().toLowerCase()
      const importableRows = rows.filter((row) => {
        const houseNo = String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.house_no) || '').trim()
        const plate = String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.license_plate) || '').trim()
        const prefix = String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.license_plate_prefix) || '').trim()
        const number = String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.license_plate_number) || '').trim()
        return houseNo || plate || prefix || number
      })

      const exampleCount = importableRows.filter(isExampleRow).length
      let score = importableRows.length - (exampleCount * 2)

      if (normalizedName.includes('template') || normalizedName.includes('ตัวอย่าง')) {
        score -= 5
      }

      return { score, importableRows }
    }

    const candidates = sheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }).filter((row) => !isRowEmpty(row))
      const { score, importableRows } = scoreSheet(sheetName, rows)
      return { sheetName, score, rows: importableRows }
    })

    const best = candidates.sort((a, b) => b.score - a.score)[0]
    if (!best || best.rows.length === 0) return []

    return best.rows.filter((row) => !isExampleRow(row))
  }

  const downloadVehicleTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(VEHICLE_IMPORT_TEMPLATE_ROWS)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'vehicles-template')
    XLSX.writeFile(wb, 'vehicle-import-template.xlsx')
  }

  const importVehiclesFromFile = async (file) => {
    try {
      Swal.fire({
        title: 'กำลังอ่านไฟล์...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
      })

      const [rows, houseData, existingVehicles] = await Promise.all([
        parseVehicleExcelFile(file),
        listHouses({ status: 'all', soi: 'all', search: '' }),
        listVehicles({ status: 'all', search: '', soi: 'all', vehicleType: 'all' }),
      ])

      if (!rows.length) {
        await showSwal({ icon: 'warning', title: 'ไม่พบข้อมูลในไฟล์', text: 'กรุณาตรวจสอบไฟล์ที่นำเข้า' })
        return
      }

      const houseByKey = new Map()
      for (const house of houseData) {
        const houseNo = String(house.house_no || '').trim().toLowerCase()
        const soi = String(house.soi || '').trim()
        houseByKey.set(`${houseNo}|${soi}`, house)
        if (!houseByKey.has(`${houseNo}|`)) houseByKey.set(`${houseNo}|`, house)
      }

      const vehicleByKey = new Map(
        existingVehicles.map((vehicle) => {
          const key = `${String(vehicle.license_plate || '').trim().toLowerCase()}|${String(vehicle.province || '').trim().toLowerCase()}|${String(vehicle.vehicle_type || '').trim().toLowerCase()}`
          return [key, vehicle]
        }),
      )

      let createdCount = 0
      let updatedCount = 0
      let failedCount = 0
      const failedItems = []

      for (const row of rows) {
        const houseNo = String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.house_no) || '').trim()
        if (!houseNo) continue

        const soi = String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.soi) || '').trim()
        const house = houseByKey.get(`${houseNo.toLowerCase()}|${soi}`) || houseByKey.get(`${houseNo.toLowerCase()}|`)
        if (!house?.id) {
          failedCount += 1
          failedItems.push(`${houseNo}: ไม่พบบ้านเลขที่ในระบบ`)
          continue
        }

        const plate = splitPlate(
          pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.license_plate),
          pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.license_plate_prefix),
          pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.license_plate_number),
        )

        if (!plate.prefix || !plate.number) {
          failedCount += 1
          failedItems.push(`${houseNo}: กรุณาระบุทะเบียนรถให้ครบ`)
          continue
        }

        const licensePlate = `${plate.prefix}-${plate.number}`
        const province = String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.province) || 'กรุงเทพมหานคร').trim() || 'กรุงเทพมหานคร'
        const vehicleType = normalizeVehicleType(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.vehicle_type))
        const vehicleKey = `${licensePlate.toLowerCase()}|${province.toLowerCase()}|${vehicleType.toLowerCase()}`

        const payload = {
          house_id: house.id,
          license_plate: licensePlate,
          province,
          vehicle_type: vehicleType,
          brand: String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.brand) || '').trim() || 'อื่นๆ',
          model: String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.model) || '').trim(),
          color: String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.color) || '').trim() || 'อื่นๆ',
          parking_location: String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.parking_location) || '').trim() || 'ในบ้าน',
          parking_lock_no: String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.parking_lock_no) || '').trim() || null,
          parking_fee: Math.max(0, toNumber(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.parking_fee), 0)),
          status: normalizeVehicleStatus(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.status)),
          note: String(pickCellValue(row, VEHICLE_EXCEL_COLUMN_ALIASES.note) || '').trim(),
        }

        try {
          const existed = vehicleByKey.get(vehicleKey)
          if (existed?.id) {
            await updateVehicle(existed.id, payload)
            updatedCount += 1
          } else {
            await assertUniqueVehiclePlateProvince({
              licensePlate: payload.license_plate,
              province: payload.province,
              vehicleType: payload.vehicle_type,
              excludeId: null,
            })
            const created = await createVehicle(payload)
            vehicleByKey.set(vehicleKey, created)
            createdCount += 1
          }
        } catch (error) {
          failedCount += 1
          failedItems.push(`${houseNo}/${licensePlate}: ${error?.message || 'เกิดข้อผิดพลาด'}`)
        }
      }

      await loadVehicles({ status: statusFilter, search: searchTerm, soi: soiFilter, vehicleType: vehicleTypeFilter })

      await showSwal({
        icon: failedCount > 0 ? 'warning' : 'success',
        title: 'นำเข้าเสร็จสิ้น',
        html: `เพิ่มใหม่ ${createdCount} รายการ<br/>อัปเดต ${updatedCount} รายการ<br/>ไม่สำเร็จ ${failedCount} รายการ${failedItems.length ? `<br/><br/><small style="text-align:left;display:block;max-height:160px;overflow:auto">${failedItems.map((line) => `• ${line}`).join('<br/>')}</small>` : ''}`,
      })
    } catch (error) {
      await showSwal({ icon: 'error', title: 'นำเข้าไม่สำเร็จ', text: error?.message || 'เกิดข้อผิดพลาด' })
    }
  }

  const handleOpenImportVehicleExcel = async () => {
    const result = await showSwal({
      title: 'นำเข้าข้อมูลรถจาก Excel',
      width: 760,
      showCancelButton: true,
      confirmButtonText: 'นำเข้าข้อมูล',
      cancelButtonText: 'ยกเลิก',
      html: `
        <div style="text-align:left;display:grid;gap:12px">
          <div style="font-size:13px;color:#334155">1) ดาวน์โหลดไฟล์ template แล้วกรอกข้อมูลตัวอย่าง</div>
          <button id="download-vehicle-template" type="button" class="swal2-confirm swal2-styled" style="margin:0;display:inline-flex;width:auto;background:#0f766e">ดาวน์โหลด Template</button>
          <div style="font-size:13px;color:#334155">2) เลือกไฟล์ Excel ที่ต้องการนำเข้า</div>
          <input id="vehicle-import-file" type="file" accept=".xlsx,.xls" style="padding:6px 0" />
          <div style="font-size:12px;color:#64748b">ระบบจะใช้คีย์ ทะเบียนรถ + จังหวัด + ประเภทรถ: ไม่มีข้อมูลจะเพิ่มใหม่, มีอยู่แล้วจะอัปเดต</div>
        </div>
      `,
      didOpen: () => {
        const html = Swal.getHtmlContainer()
        const downloadBtn = html?.querySelector('#download-vehicle-template')
        downloadBtn?.addEventListener('click', downloadVehicleTemplate)
      },
      preConfirm: () => {
        const html = Swal.getHtmlContainer()
        const input = html?.querySelector('#vehicle-import-file')
        const file = input?.files?.[0]
        if (!file) {
          Swal.showValidationMessage('กรุณาเลือกไฟล์ Excel ก่อนนำเข้า')
          return null
        }
        return file
      },
      allowOutsideClick: () => !Swal.isLoading(),
    })

    if (result.isConfirmed && result.value) {
      await importVehiclesFromFile(result.value)
    }
  }

  return (
    <div className="pane on houses-compact vehicles-page">
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">🚗</div>
            <div>
              <div className="ph-h1">ข้อมูลรถ</div>
              <div className="ph-sub">จัดการยานพาหนะของลูกบ้านและพื้นที่จอดรถ</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card report-filter-card admin-search-filter-card">
        <div className="cb" style={{ padding: 12 }}>
        <div className="houses-filter-row">
          <input
            className="houses-filter-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหา ทะเบียน / บ้าน / เจ้าของ / ยี่ห้อ / สี"
          />
          <DropdownList
            compact
            value={soiFilter}
            options={soiFilterOptions}
            onChange={setSoiFilter}
            placeholder="เลือกซอย"
          />
          <DropdownList
            compact
            value={vehicleTypeFilter}
            options={vehicleTypeFilterOptions}
            onChange={setVehicleTypeFilter}
            placeholder="เลือกประเภทรถ"
          />
          <DropdownList
            compact
            value={statusFilter}
            options={statusFilterOptions}
            onChange={setStatusFilter}
            placeholder="เลือกสถานะ"
          />
          <button className="btn btn-a btn-sm houses-filter-btn" onClick={() => loadVehicles({ status: statusFilter, search: searchTerm, soi: soiFilter, vehicleType: vehicleTypeFilter })}>ค้นหา</button>
        </div>
        </div>
      </div>

      <div className="card vehicles-list-card houses-main-card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">ยานพาหนะทั้งหมด ({vehicles.length} รายการ)</div>
          <div className="houses-list-actions">
            <button className="btn btn-p btn-sm" onClick={openAddModal}>+ ลงทะเบียนรถใหม่</button>
            <button className="btn btn-o btn-sm" onClick={handleOpenImportVehicleExcel}>📥 นำเข้า Excel</button>
            <button className="btn btn-g btn-sm" onClick={() => loadVehicles({ status: statusFilter, search: searchTerm, soi: soiFilter, vehicleType: vehicleTypeFilter })}>🔄 รีเฟรช</button>
          </div>
        </div>
        <div className="cb houses-table-card-body houses-main-body vehicles-page-table-body">
          <div className="desktop-only">
            <div className="houses-main-wrap" style={{ overflowX: 'auto' }}>
              <table className="tw houses-table houses-main-table" style={{ width: '100%', minWidth: '1120px' }}>
                <thead><tr>
                  <th>ซอย</th>
                  <th>บ้านเลขที่ / เจ้าของบ้าน</th>
                  <th>ทะเบียนรถ</th>
                  <th>ประเภทรถ</th>
                  <th>ยี่ห้อ / รุ่น</th>
                  <th>สี</th>
                  <th>ที่จอด</th>
                  <th>ค่าจอด</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="10" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>กำลังโหลดข้อมูล...</td></tr>
                  ) : vehicles.length === 0 ? (
                    <tr><td colSpan="10" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>ไม่พบข้อมูลรถ</td></tr>
                  ) : (
                    vehicles.map((vehicle) => {
                      const badge = getStatusBadge(vehicle.status)
                      return (
                        <tr key={vehicle.id}>
                          <td>{vehicle.houses?.soi ? `ซอย ${vehicle.houses.soi}` : '-'}</td>
                          <td>
                            <div><strong>{vehicle.houses?.house_no || '-'}</strong> {vehicle.houses?.owner_name ? `- ${vehicle.houses.owner_name}` : ''}</div>
                            <div style={{ fontSize: '11px', color: 'var(--mu)' }}>{vehicle.province ? `(${vehicle.province})` : '-'}</div>
                          </td>
                          <td><strong>{vehicle.license_plate || '-'}</strong></td>
                          <td>{vehicle.vehicle_type || '-'}</td>
                          <td>{vehicle.brand || '-'} {vehicle.model || ''}</td>
                          <td>{vehicle.color || '-'}</td>
                          <td>{vehicle.parking_location || '-'}{vehicle.parking_lock_no ? ` (${vehicle.parking_lock_no})` : ''}</td>
                          <td>{formatDecimal(vehicle.parking_fee)}</td>
                          <td><span className={badge.className}>{badge.label}</span></td>
                          <td><div className="td-acts">
                            <button className="btn btn-xs btn-a" onClick={() => openEditModal(vehicle)}>แก้ไข</button>
                            <button className="btn btn-xs btn-dg" onClick={() => handleDeleteVehicle(vehicle)}>ลบ</button>
                          </div></td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mobile-only vehicles-mobile-list">
            {loading ? (
              <div className="mcard-empty">กำลังโหลดข้อมูล...</div>
            ) : vehicles.length === 0 ? (
              <div className="mcard-empty">ไม่พบข้อมูลรถ</div>
            ) : vehicles.map((vehicle) => {
              const badge = getStatusBadge(vehicle.status)
              return (
                <div key={vehicle.id} className="mcard vehicles-mcard">
                  <div className="mcard-top">
                    <div>
                      <div className="mcard-title">{vehicle.license_plate || '-'}</div>
                      <div className="mcard-sub">{vehicle.houses?.soi ? `ซอย ${vehicle.houses.soi} · ` : ''}{vehicle.houses?.house_no || '-'}{vehicle.houses?.owner_name ? ` · ${vehicle.houses.owner_name}` : ''}</div>
                    </div>
                    <span className={`${badge.className} mcard-badge`}>{badge.label}</span>
                  </div>
                  <div className="mcard-meta">
                    <span><span className="mcard-label">ประเภท</span> {vehicle.vehicle_type || '-'}</span>
                    <span><span className="mcard-label">ยี่ห้อ/รุ่น</span> {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '-'}</span>
                    {vehicle.color && <span><span className="mcard-label">สี</span> {vehicle.color}</span>}
                    {vehicle.parking_location && <span><span className="mcard-label">ที่จอด</span> {vehicle.parking_location}{vehicle.parking_lock_no ? ` (${vehicle.parking_lock_no})` : ''}</span>}
                    <span><span className="mcard-label">ค่าจอด</span> {formatDecimal(vehicle.parking_fee)}</span>
                  </div>
                  <div className="mcard-actions">
                    <button className="btn btn-xs btn-a" onClick={() => openEditModal(vehicle)}>แก้ไข</button>
                    <button className="btn btn-xs btn-dg" onClick={() => handleDeleteVehicle(vehicle)}>ลบ</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="house-mo">
          <div className="house-md house-md--xl">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">🚗 {editingVehicle ? 'แก้ไขข้อมูลรถ' : 'ลงทะเบียนรถใหม่'}</div>
                <div className="house-md-sub">{(form.license_plate_prefix || form.license_plate_number) ? `${form.license_plate_prefix || ''}${form.license_plate_prefix && form.license_plate_number ? '-' : ''}${form.license_plate_number || ''}` : '-'} {form.model ? `— ${form.model}` : ''}</div>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="house-md-body">
                <section className="house-sec">
                  <div className="house-sec-title">บ้านและข้อมูลทะเบียน</div>
                  <div className="house-grid house-grid-4">
                    <label className="house-field">
                      <span>บ้าน *</span>
                      <DropdownList
                        value={form.house_id}
                        options={[{ value: '', label: 'เลือกบ้าน' }, ...houseOptions]}
                        onChange={(nextValue) => applyFormValue('house_id', nextValue)}
                        placeholder="พิมพ์ค้นหา บ้านเลขที่ / เจ้าของ / ซอย"
                      />
                    </label>
                    <label className="house-field">
                      <span>ทะเบียนรถ *</span>
                      <div className="plate-split-wrap">
                        <input
                          className="plate-prefix"
                          name="license_plate_prefix"
                          value={form.license_plate_prefix}
                          onChange={handleChange}
                          placeholder="7กจ"
                        />
                        <span className="plate-dash">-</span>
                        <input
                          className="plate-number"
                          name="license_plate_number"
                          value={form.license_plate_number}
                          onChange={handleChange}
                          placeholder="5533"
                        />
                      </div>
                    </label>
                    <label className="house-field house-field-province">
                      <span>จังหวัด</span>
                      <DropdownList
                        value={form.province}
                        options={PROVINCE_OPTIONS.map((province) => ({ value: province, label: province }))}
                        onChange={(nextValue) => applyFormValue('province', nextValue)}
                        placeholder="เลือกจังหวัด"
                      />
                    </label>
                    <label className="house-field">
                      <span>ประเภทรถ</span>
                      <DropdownList
                        value={form.vehicle_type}
                        options={VEHICLE_TYPES}
                        onChange={(nextValue) => applyFormValue('vehicle_type', nextValue)}
                        placeholder="เลือกประเภทรถ"
                      />
                    </label>
                  </div>
                </section>

                <section className="house-sec">
                  <div className="house-sec-title">รายละเอียดรถ</div>
                  <div className="house-grid house-grid-3">
                    <label className="house-field">
                      <span>ยี่ห้อ</span>
                      <DropdownList
                        value={form.brand}
                        options={BRAND_OPTIONS.map((brand) => ({ value: brand, label: brand }))}
                        onChange={(nextValue) => applyFormValue('brand', nextValue)}
                        placeholder="เลือกยี่ห้อ"
                      />
                    </label>
                    {form.brand === 'อื่นๆ' ? (
                      <label className="house-field">
                        <span>ระบุยี่ห้ออื่นๆ *</span>
                        <input name="brand_other" value={form.brand_other} onChange={handleChange} placeholder="เช่น NETA" />
                      </label>
                    ) : (
                      <div />
                    )}
                  </div>
                  <div className="house-grid house-grid-3" style={{ marginTop: '8px' }}>
                    <label className="house-field">
                      <span>รุ่น</span>
                      <input name="model" value={form.model} onChange={handleChange} placeholder="เช่น City / Revo" />
                    </label>
                    <label className="house-field">
                      <span>สี</span>
                      <DropdownList
                        value={form.color}
                        options={COLOR_OPTIONS.map((color) => ({ value: color, label: color }))}
                        onChange={(nextValue) => applyFormValue('color', nextValue)}
                        placeholder="เลือกสี"
                      />
                    </label>
                    {form.color === 'อื่นๆ' ? (
                      <label className="house-field">
                        <span>ระบุสีอื่นๆ *</span>
                        <input name="color_other" value={form.color_other} onChange={handleChange} placeholder="เช่น เทาอมฟ้า" />
                      </label>
                    ) : (
                      <div />
                    )}
                  </div>
                </section>

                <section className="house-sec">
                  <div className="house-sec-title">ที่จอดและสถานะ</div>
                  <div className="house-grid house-grid-3">
                    <label className="house-field">
                      <span>ตำแหน่งจอด</span>
                      <DropdownList
                        value={form.parking_location}
                        options={PARKING_OPTIONS}
                        onChange={(nextValue) => applyFormValue('parking_location', nextValue)}
                        placeholder="เลือกตำแหน่งจอด"
                      />
                    </label>
                    <label className="house-field">
                      <span>Lock no (ส่วนกลางเท่านั้น)</span>
                      <input
                        name="parking_lock_no"
                        value={form.parking_lock_no}
                        onChange={handleChange}
                        placeholder="เช่น C-12"
                        disabled={form.parking_location !== 'ส่วนกลาง'}
                      />
                    </label>
                    <label className="house-field">
                      <span>ค่าจอด</span>
                      <input name="parking_fee" value={form.parking_fee} onChange={handleChange} placeholder="0.00" />
                    </label>
                    <label className="house-field">
                      <span>สถานะ</span>
                      <DropdownList
                        value={form.status}
                        options={STATUS_OPTIONS}
                        onChange={(nextValue) => applyFormValue('status', nextValue)}
                        placeholder="เลือกสถานะ"
                      />
                    </label>
                    <label className="house-field house-field-span-2">
                      <span>หมายเหตุ</span>
                      <textarea name="note" value={form.note} onChange={handleChange} rows="1" placeholder="รายละเอียดเพิ่มเติม" />
                    </label>
                  </div>
                </section>

                <section className="house-sec">
                  <div className="house-sec-title">รูปภาพรถ (สูงสุด 5 รูป)</div>
                  <div className="house-grid house-grid-3">
                    <label className="house-field house-field-span-3">
                      <span>แนบไฟล์รูปภาพ</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleAttachFiles}
                        disabled={attachments.length >= MAX_ATTACHMENTS}
                      />
                    </label>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--mu)' }}>
                    แนบแล้ว {attachments.length}/{MAX_ATTACHMENTS} รูป • ระบบย่อไฟล์ไม่เกิน 100KB และตั้งชื่อ CAR_YYYYMMDD_HHMMSS_001.jpg
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {attachments.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--mu)' }}>ยังไม่มีรูปแนบ</div>
                    ) : attachments.map((image, index) => (
                      <div key={`${image.name}-${index}`} style={{ width: '64px' }}>
                        <button
                          type="button"
                          onClick={() => handlePreviewAttachment(image)}
                          style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '8px',
                            border: '1px solid var(--bo)',
                            background: '#fff',
                            padding: '0',
                            overflow: 'hidden',
                            cursor: 'pointer',
                          }}
                        >
                          <img src={image.url} alt={image.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(image)}
                          className="btn btn-xs btn-dg"
                          style={{ marginTop: '4px', width: '100%' }}
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="house-md-foot">
                <button className="btn btn-g" type="button" onClick={closeModal}>ยกเลิก</button>
                <button className="btn btn-p" type="submit" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminVehicles
