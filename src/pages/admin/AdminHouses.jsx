import React, { useEffect, useMemo, useRef, useState } from 'react'
import DropdownList from '../../components/DropdownList'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'
import { createHouse, deleteHouse, getHouseSetup, listHouses, updateAllHousesFeeRate, updateHouse } from '../../lib/houses'

const SOI_OPTIONS = Array.from({ length: 26 }, (_, index) => ({
  value: String(index),
  label: `ซอย ${index}`,
}))
const filterTypeOptions = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'normal', label: 'ปกติ' },
  { value: 'overdue', label: 'ค้างชำระ' },
  { value: 'suspended', label: 'ระงับกรมที่ดิน' },
  { value: 'lawsuit', label: 'ฟ้องร้อง' },
]
const HOUSE_TYPE_OPTIONS = [
  { value: 'อยู่เอง', label: 'อยู่เอง' },
  { value: 'ให้เช่า', label: 'ให้เช่า' },
  { value: 'ว่าง', label: 'ว่าง' },
]

const HOUSE_STATUS_OPTIONS = [
  { value: 'normal', label: 'ปกติ' },
  { value: 'overdue', label: 'ค้างชำระ' },
  { value: 'suspended', label: 'ระงับกรมที่ดิน' },
  { value: 'lawsuit', label: 'ฟ้องร้อง' },
]

const HOUSE_TYPE_VALUES = new Set(HOUSE_TYPE_OPTIONS.map((item) => item.value))
const HOUSE_STATUS_VALUES = new Set(HOUSE_STATUS_OPTIONS.map((item) => item.value))

const STATUS_LABEL_TO_VALUE = {
  ปกติ: 'normal',
  ค้างชำระ: 'overdue',
  ระงับกรมที่ดิน: 'suspended',
  ฟ้องร้อง: 'lawsuit',
  normal: 'normal',
  overdue: 'overdue',
  suspended: 'suspended',
  lawsuit: 'lawsuit',
}

const EXCEL_COLUMN_ALIASES = {
  house_no: ['house_no', 'house no', 'เลขที่บ้าน', 'บ้านเลขที่', 'เลขที่'],
  soi: ['soi', 'ซอย'],
  floor_no: ['floor_no', 'floor', 'ชั้น', 'ชั้นที่'],
  room_no: ['room_no', 'room', 'ห้อง', 'หมายเลขห้อง'],
  address: ['address', 'ที่อยู่', 'ถนน'],
  owner_name: ['owner_name', 'owner', 'เจ้าของ', 'ชื่อเจ้าของ', 'เจ้าของกรรมสิทธิ์'],
  resident_name: ['resident_name', 'resident', 'ผู้อยู่อาศัย', 'ผู้เช่า'],
  contact_name: ['contact_name', 'contact', 'ผู้ติดต่อ'],
  phone: ['phone', 'เบอร์', 'เบอร์โทร', 'โทรศัพท์'],
  line_id: ['line_id', 'line', 'line id', 'ไลน์', 'ไลน์ไอดี'],
  email: ['email', 'อีเมล'],
  area_sqw: ['area_sqw', 'area', 'พื้นที่', 'ตรว', 'ตร.ว.'],
  parking_rights: ['parking_rights', 'parking', 'สิทธิ์จอดรถ', 'สิทธิจอดรถ', 'ที่จอดรถ'],
  house_type: ['house_type', 'type', 'ประเภท'],
  status: ['status', 'สถานะ'],
  note: ['note', 'หมายเหตุ'],
}

const HOUSE_IMPORT_TEMPLATE_ROWS = [
  {
    บ้านเลขที่: '10/1',
    ซอย: '1',
    ชั้นที่: 2,
    หมายเลขห้อง: '201',
    ที่อยู่: 'ถนนเมนโครงการ',
    เจ้าของ: 'สมชาย ใจดี',
    ผู้อยู่อาศัย: 'สมชาย ใจดี',
    ผู้ติดต่อ: 'สมชาย ใจดี',
    เบอร์โทร: '0812345678',
    'ไลน์ไอดี': 'somchai.id',
    อีเมล: 'somchai@example.com',
    พื้นที่: 52,
    สิทธิ์จอดรถ: 1,
    ประเภท: 'อยู่เอง',
    สถานะ: 'ปกติ',
    หมายเหตุ: '',
  },
  {
    บ้านเลขที่: '12/8',
    ซอย: '2',
    ชั้นที่: 5,
    หมายเลขห้อง: 'A-502',
    ที่อยู่: 'ถนนสวนกลาง',
    เจ้าของ: 'สุดา งามดี',
    ผู้อยู่อาศัย: 'สุดา งามดี',
    ผู้ติดต่อ: 'สุดา งามดี',
    เบอร์โทร: '0891112233',
    'ไลน์ไอดี': 'suda.ngamdee',
    อีเมล: 'suda@example.com',
    พื้นที่: 60,
    สิทธิ์จอดรถ: 2,
    ประเภท: 'ให้เช่า',
    สถานะ: 'ค้างชำระ',
    หมายเหตุ: 'ตัวอย่างข้อมูล',
  },
]

const EMPTY_FORM = {
  house_no: '',
  soi: '1',
  floor_no: '0',
  room_no: '',
  address: '',
  owner_name: '',
  resident_name: '',
  contact_name: '',
  phone: '',
  line_id: '',
  email: '',
  area_sqw: '',
  parking_rights: '1',
  house_type: 'อยู่เอง',
  status: 'normal',
  note: '',
}

function formatDecimal(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const AdminHouses = () => {
  const [filterType, setFilterType] = useState('all')
  const [soiFilter, setSoiFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [houses, setHouses] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingHouse, setEditingHouse] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [setup, setSetup] = useState({ feeRatePerSqw: 85, villageName: 'The Greenfield' })

  const normalizeKey = (value) => String(value || '').trim().toLowerCase().replace(/[_\-]/g, ' ').replace(/\s+/g, ' ')

  const pickCellValue = (row, aliases) => {
    const targetKeys = new Set(aliases.map((key) => normalizeKey(key)))
    for (const key of Object.keys(row || {})) {
      if (targetKeys.has(normalizeKey(key))) return row[key]
    }
    return ''
  }

  const toNumber = (value, fallback = 0) => {
    const parsed = Number(String(value ?? '').toString().replace(/,/g, '').trim())
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const normalizeStatus = (value) => {
    const trimmed = String(value || '').trim()
    const mapped = STATUS_LABEL_TO_VALUE[trimmed]
    return HOUSE_STATUS_VALUES.has(mapped) ? mapped : 'normal'
  }

  const normalizeHouseType = (value) => {
    const trimmed = String(value || '').trim()
    return HOUSE_TYPE_VALUES.has(trimmed) ? trimmed : 'อยู่เอง'
  }

  const buildHousePayloadFromRow = (row) => {
    const houseNo = String(pickCellValue(row, EXCEL_COLUMN_ALIASES.house_no) || '').trim()
    if (!houseNo) return null

    const payload = {
      house_no: houseNo,
      soi: String(pickCellValue(row, EXCEL_COLUMN_ALIASES.soi) || '').trim() || '1',
      floor_no: Math.min(99, Math.max(0, Math.trunc(toNumber(pickCellValue(row, EXCEL_COLUMN_ALIASES.floor_no), 0)))),
      room_no: String(pickCellValue(row, EXCEL_COLUMN_ALIASES.room_no) || '').trim(),
      address: String(pickCellValue(row, EXCEL_COLUMN_ALIASES.address) || '').trim(),
      owner_name: String(pickCellValue(row, EXCEL_COLUMN_ALIASES.owner_name) || '').trim(),
      resident_name: String(pickCellValue(row, EXCEL_COLUMN_ALIASES.resident_name) || '').trim(),
      contact_name: String(pickCellValue(row, EXCEL_COLUMN_ALIASES.contact_name) || '').trim(),
      phone: String(pickCellValue(row, EXCEL_COLUMN_ALIASES.phone) || '').trim(),
      line_id: String(pickCellValue(row, EXCEL_COLUMN_ALIASES.line_id) || '').trim(),
      email: String(pickCellValue(row, EXCEL_COLUMN_ALIASES.email) || '').trim(),
      area_sqw: Math.max(0, toNumber(pickCellValue(row, EXCEL_COLUMN_ALIASES.area_sqw), 0)),
      parking_rights: Math.max(0, Math.trunc(toNumber(pickCellValue(row, EXCEL_COLUMN_ALIASES.parking_rights), 1))),
      fee_rate: Number(setup.feeRatePerSqw || 0),
      house_type: normalizeHouseType(pickCellValue(row, EXCEL_COLUMN_ALIASES.house_type)),
      status: normalizeStatus(pickCellValue(row, EXCEL_COLUMN_ALIASES.status)),
      note: String(pickCellValue(row, EXCEL_COLUMN_ALIASES.note) || '').trim(),
    }

    return payload
  }

  const parseExcelFile = async (file) => {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) return []
    const sheet = workbook.Sheets[firstSheetName]
    return XLSX.utils.sheet_to_json(sheet, { defval: '' })
  }

  const handleDownloadHouseTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(HOUSE_IMPORT_TEMPLATE_ROWS)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'houses-template')
    XLSX.writeFile(wb, 'house-import-template.xlsx')
  }

  const importHousesFromFile = async (file) => {
    try {
      Swal.fire({
        title: 'กำลังอ่านไฟล์...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
      })

      const rows = await parseExcelFile(file)
      const parsedPayloads = rows
        .map((row) => buildHousePayloadFromRow(row))
        .filter(Boolean)

      if (parsedPayloads.length === 0) {
        await Swal.fire({ icon: 'warning', title: 'ไม่พบข้อมูลที่นำเข้าได้', text: 'ตรวจสอบว่าไฟล์มีคอลัมน์บ้านเลขที่' })
        return
      }

      const uniquePayloadMap = new Map()
      for (const payload of parsedPayloads) {
        uniquePayloadMap.set(payload.house_no, payload)
      }
      const uniquePayloads = Array.from(uniquePayloadMap.values())

      const existing = await listHouses({ status: 'all', soi: 'all', search: '' })
      const existingByHouseNo = new Map(existing.map((house) => [String(house.house_no || '').trim(), house]))

      let createdCount = 0
      let updatedCount = 0
      let failedCount = 0
      const failedItems = []

      for (const payload of uniquePayloads) {
        try {
          const existed = existingByHouseNo.get(payload.house_no)
          if (existed?.id) {
            await updateHouse(existed.id, payload)
            updatedCount += 1
          } else {
            await createHouse(payload)
            createdCount += 1
          }
        } catch (error) {
          failedCount += 1
          failedItems.push(`${payload.house_no}: ${error?.message || 'เกิดข้อผิดพลาด'}`)
        }
      }

      await loadHouses({ status: filterType, soi: soiFilter, search: searchTerm })

      await Swal.fire({
        icon: failedCount > 0 ? 'warning' : 'success',
        title: 'นำเข้าเสร็จสิ้น',
        html: `เพิ่มใหม่ ${createdCount} หลัง<br/>อัปเดต ${updatedCount} หลัง<br/>ไม่สำเร็จ ${failedCount} หลัง${failedItems.length ? `<br/><br/><small style="text-align:left;display:block;max-height:160px;overflow:auto">${failedItems.map((line) => `• ${line}`).join('<br/>')}</small>` : ''}`,
      })
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'นำเข้าไม่สำเร็จ', text: error?.message || 'เกิดข้อผิดพลาด' })
    }
  }

  const handleOpenImportExcel = async () => {
    const result = await Swal.fire({
      title: 'นำเข้าข้อมูลบ้านจาก Excel',
      width: 760,
      showCancelButton: true,
      confirmButtonText: 'นำเข้าข้อมูล',
      cancelButtonText: 'ยกเลิก',
      html: `
        <div style="text-align:left;display:grid;gap:12px">
          <div style="font-size:13px;color:#334155">1) ดาวน์โหลดไฟล์ template และกรอกข้อมูลตามตัวอย่าง (มีตัวอย่างให้ 2 รายการ)</div>
          <button id="download-house-template" type="button" class="swal2-confirm swal2-styled" style="margin:0;display:inline-flex;width:auto;background:#0f766e">ดาวน์โหลด Template</button>
          <div style="font-size:13px;color:#334155">2) เลือกไฟล์ Excel ที่เตรียมไว้</div>
          <input id="house-import-file" type="file" accept=".xlsx,.xls" style="padding:6px 0" />
          <div style="font-size:12px;color:#64748b">ระบบจะใช้ "บ้านเลขที่" เป็นคีย์ตรวจสอบ: ไม่มีข้อมูลจะเพิ่มใหม่, มีอยู่แล้วจะอัปเดต และรองรับฟิลด์ ชั้นที่/หมายเลขห้อง</div>
        </div>
      `,
      didOpen: () => {
        const html = Swal.getHtmlContainer()
        const downloadBtn = html?.querySelector('#download-house-template')
        downloadBtn?.addEventListener('click', handleDownloadHouseTemplate)
      },
      preConfirm: () => {
        const html = Swal.getHtmlContainer()
        const input = html?.querySelector('#house-import-file')
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
      await importHousesFromFile(result.value)
    }
  }

  const loadHouses = async (override = {}) => {
    try {
      setLoading(true)
      const data = await listHouses({
        status: override.status ?? filterType,
        soi: override.soi ?? soiFilter,
        search: override.search ?? searchTerm,
      })
      setHouses(data)
    } catch (error) {
      console.error('Error loading houses:', error)
      await Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true)
        const [houseData, houseSetup] = await Promise.all([
          listHouses({ status: filterType, soi: soiFilter, search: searchTerm }),
          getHouseSetup(),
        ])
        setHouses(houseData)
        setSetup(houseSetup)
      } catch (error) {
        console.error('Error loading houses:', error)
        await Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error.message })
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()
  }, [])

  const annualFee = useMemo(() => {
    const area = Number(form.area_sqw || 0)
    return area * 12 * Number(setup.feeRatePerSqw || 0)
  }, [form.area_sqw, setup.feeRatePerSqw])

  const soiOptions = useMemo(() => {
    const values = [...new Set(houses.map((house) => house.soi).filter(Boolean))]
      .sort((left, right) => Number(left) - Number(right))
    return values.map((soi) => ({ value: String(soi), label: `ซอย ${soi}` }))
  }, [houses])

  const getStatusBadge = (status) => {
    if (status === 'normal')   return { className: 'bd b-ok', label: 'ปกติ' }
    if (status === 'overdue')  return { className: 'bd b-wn', label: 'ค้างชำระ' }
    if (status === 'suspended') return { className: 'bd b-dg', label: 'ระงับกรมที่ดิน' }
    if (status === 'lawsuit')  return { className: 'bd b-pr', label: 'ฟ้องร้อง' }
    return { className: 'bd b-mu', label: status }
  }

  const openAddModal = () => {
    setEditingHouse(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEditModal = (house) => {
    setEditingHouse(house)
    setForm({
      house_no: house.house_no || '',
      soi: house.soi || '1',
      floor_no: String(house.floor_no ?? 0),
      room_no: house.room_no || '',
      address: house.address || '',
      owner_name: house.owner_name || '',
      resident_name: house.resident_name || '',
      contact_name: house.contact_name || '',
      phone: house.phone || '',
      line_id: house.line_id || '',
      email: house.email || '',
      area_sqw: String(house.area_sqw || ''),
      parking_rights: String(house.parking_rights ?? 1),
      house_type: house.house_type || 'อยู่เอง',
      status: house.status || 'normal',
      note: house.note || '',
    })
    setShowModal(true)
  }

  const closeModal = (force = false) => {
    if (saving && !force) return
    setShowModal(false)
    setEditingHouse(null)
    setForm(EMPTY_FORM)
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.house_no.trim()) {
      await Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณากรอกเลขที่บ้าน' })
      return
    }

    try {
      setSaving(true)

      const payload = {
        house_no: form.house_no,
        soi: form.soi,
        floor_no: Math.min(99, Math.max(0, Math.trunc(Number(form.floor_no || 0)))),
        room_no: form.room_no,
        address: form.address,
        owner_name: form.owner_name,
        resident_name: form.resident_name,
        contact_name: form.contact_name,
        phone: form.phone,
        line_id: form.line_id,
        email: form.email,
        area_sqw: Number(form.area_sqw || 0),
        parking_rights: Math.max(0, Number(form.parking_rights || 0)),
        fee_rate: Number(setup.feeRatePerSqw || 0),
        house_type: form.house_type,
        status: form.status,
        note: form.note,
      }

      if (editingHouse) {
        await updateHouse(editingHouse.id, payload)
        await Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: `อัปเดตบ้าน ${form.house_no} แล้ว`, timer: 1500, showConfirmButton: false })
      } else {
        await createHouse(payload)
        await Swal.fire({ icon: 'success', title: 'เพิ่มข้อมูลสำเร็จ', text: `เพิ่มบ้าน ${form.house_no} แล้ว`, timer: 1500, showConfirmButton: false })
      }

      closeModal(true)
      await loadHouses({ status: filterType, soi: soiFilter, search: searchTerm })
    } catch (error) {
      console.error('Error saving house:', error)
      await Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteHouse = async (house) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบ',
      text: `ต้องการลบบ้านเลขที่ ${house.house_no} ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบข้อมูล',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#c0392b',
    })

    if (!result.isConfirmed) return

    try {
      await deleteHouse(house.id)
      await Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1400, showConfirmButton: false })
      await loadHouses({ status: filterType, soi: soiFilter, search: searchTerm })
    } catch (error) {
      console.error('Error deleting house:', error)
      await Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: error.message })
    }
  }

  const handleBulkUpdateAnnualFee = async () => {
    const confirmResult = await Swal.fire({
      icon: 'question',
      title: 'อัปเดตค่าส่วนกลางทั้งระบบ',
      text: `ต้องการอัปเดตอัตราค่าส่วนกลางเป็น ${formatDecimal(setup.feeRatePerSqw)} บาท/ตร.ว./ปี ให้ทุกหลังหรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'อัปเดต',
      cancelButtonText: 'ยกเลิก',
    })

    if (!confirmResult.isConfirmed) return

    Swal.fire({
      title: 'กำลังประมวลผล...',
      text: 'รอสักครู่ ระบบกำลังอัปเดตข้อมูลบ้านทั้งหมด',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading()
      },
    })

    try {
      const affectedRows = await updateAllHousesFeeRate(setup.feeRatePerSqw)
      await loadHouses({ status: filterType, soi: soiFilter, search: searchTerm })
      await Swal.fire({
        icon: 'success',
        title: 'อัปเดตสำเร็จ',
        text: `อัปเดตค่าส่วนกลางแล้ว ${affectedRows} หลัง`,
      })
    } catch (error) {
      await Swal.fire({
        icon: 'error',
        title: 'อัปเดตไม่สำเร็จ',
        text: error.message,
      })
    }
  }

  return (
    <div className="pane on houses-compact">
      <div className="ph houses-ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">🏠</div>
            <div>
              <div className="ph-h1">ข้อมูลบ้าน</div>
              <div className="ph-sub">จัดการข้อมูลบ้านทั้งหมด {houses.length} หลัง</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card report-filter-card admin-search-filter-card">
        <div className="cb" style={{ padding: 12 }}>
        <div className="houses-filter-row">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาเลขที่บ้าน / เจ้าของ / หมายเลขห้อง..."
            className="houses-filter-input"
          />
          <DropdownList
            compact
            value={filterType}
            options={filterTypeOptions}
            onChange={setFilterType}
            placeholder="เลือกสถานะ"
          />
          <DropdownList
            compact
            value={soiFilter}
            options={[{ value: 'all', label: 'ทุกซอย' }, ...soiOptions]}
            onChange={setSoiFilter}
            placeholder="เลือกซอย"
          />
          <button className="btn btn-a btn-sm houses-filter-btn" onClick={() => loadHouses({ status: filterType, soi: soiFilter, search: searchTerm })}>ค้นหา</button>
        </div>
        </div>
      </div>

      {/* Houses Table */}
      <div className="card houses-main-card">
        <div className="ch houses-list-head houses-main-head">
          <div className="ct">รายการบ้านทั้งหมด ({houses.length} หลัง)</div>
          <div className="houses-list-actions">
            <button className="btn btn-p btn-sm" onClick={openAddModal}>+ เพิ่มบ้าน</button>
            <button className="btn btn-o btn-sm" onClick={handleOpenImportExcel}>📥 นำเข้า Excel</button>
            <button className="btn btn-a btn-sm" onClick={handleBulkUpdateAnnualFee}>⏳ อัปเดตค่าส่วนกลาง</button>
            <button className="btn btn-g btn-sm" onClick={() => loadHouses()}>🔄 รีเฟรช</button>
          </div>
        </div>
        <div className="cb houses-table-card-body houses-main-body">
          {/* Desktop Table */}
          <div className="houses-table-wrap houses-desktop-only houses-main-wrap">
            <table className="tw houses-table houses-main-table" style={{ width: '100%', minWidth: '540px' }}>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ซอย</th>
                  <th>ชั้น</th>
                  <th>ห้อง</th>
                  <th>เจ้าของกรรมสิทธิ์</th>
                  <th>ประเภท</th>
                  <th>พื้นที่ (ตร.ว.)</th>
                  <th>สิทธิ์จอดรถ</th>
                  <th>ค่าส่วนกลาง/ปี</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="11" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>กำลังโหลดข้อมูล...</td></tr>
                ) : houses.length === 0 ? (
                  <tr><td colSpan="11" style={{ textAlign: 'center', color: 'var(--mu)', padding: '20px' }}>ไม่พบข้อมูลบ้าน</td></tr>
                ) : (
                  houses.map((house) => {
                    const badge = getStatusBadge(house.status)
                    const annualFee = formatDecimal(house.annual_fee)
                    return (
                      <tr key={house.id}>
                        <td><strong>{house.house_no}</strong></td>
                        <td>{house.soi ? `ซอย ${house.soi}` : '-'}</td>
                        <td>{Number.isFinite(Number(house.floor_no)) ? Number(house.floor_no) : '-'}</td>
                        <td>{house.room_no || '-'}</td>
                        <td><div className="houses-owner-main">{house.owner_name || '-'}</div></td>
                        <td>{house.house_type || '-'}</td>
                        <td>{house.area_sqw ? formatDecimal(house.area_sqw) : '-'}</td>
                        <td>{Number(house.parking_rights ?? 1)}</td>
                        <td>{annualFee}</td>
                        <td><span className={`${badge.className} houses-status houses-status-${house.status}`}>{badge.label}</span></td>
                        <td className="houses-actions-cell">
                          <div className="houses-actions-inner">
                            <button className="btn btn-xs btn-a houses-action-btn" onClick={() => openEditModal(house)}>แก้ไข</button>
                            <button className="btn btn-xs houses-action-btn houses-action-delete" onClick={() => handleDeleteHouse(house)}>ลบ</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="houses-mobile-only">
            {loading ? (
              <div className="houses-card-empty">กำลังโหลดข้อมูล...</div>
            ) : houses.length === 0 ? (
              <div className="houses-card-empty">ไม่พบข้อมูลบ้าน</div>
            ) : (
              houses.map((house) => {
                const badge = getStatusBadge(house.status)
                const annualFee = formatDecimal(house.annual_fee)
                return (
                  <div key={house.id} className="houses-mcard">
                    <div className="houses-mcard-top">
                      <div className="houses-mcard-no">{house.house_no}</div>
                      <div className="houses-mcard-soi">{house.soi ? `ซอย ${house.soi}` : '-'}</div>
                      <span className={`${badge.className} houses-status houses-status-${house.status} houses-mcard-badge`}>{badge.label}</span>
                    </div>
                    <div className="houses-mcard-owner">{house.owner_name || '-'}</div>
                    <div className="houses-mcard-meta">
                      <span><span className="houses-mcard-label">ชั้น</span> {Number.isFinite(Number(house.floor_no)) ? Number(house.floor_no) : '-'}</span>
                      <span><span className="houses-mcard-label">ห้อง</span> {house.room_no || '-'}</span>
                      <span><span className="houses-mcard-label">ประเภท</span> {house.house_type || '-'}</span>
                      <span><span className="houses-mcard-label">พื้นที่</span> {house.area_sqw ? formatDecimal(house.area_sqw) : '-'} ตร.ว.</span>
                      <span><span className="houses-mcard-label">สิทธิ์จอดรถ</span> {Number(house.parking_rights ?? 1)} คัน</span>
                      <span><span className="houses-mcard-label">ค่าส่วนกลาง/ปี</span> {annualFee}</span>
                    </div>
                    <div className="houses-mcard-actions">
                      <button className="btn btn-xs btn-a houses-action-btn" onClick={() => openEditModal(house)}>แก้ไข</button>
                      <button className="btn btn-xs houses-action-btn houses-action-delete" onClick={() => handleDeleteHouse(house)}>ลบ</button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="house-mo">
          <div className="house-md house-md--md">
            <div className="house-md-head">
              <div>
                <div className="house-md-title">🏠 {editingHouse ? 'แก้ไขข้อมูลบ้าน' : 'เพิ่มข้อมูลบ้าน'}</div>
                <div className="house-md-sub">{form.house_no || '-'} {form.owner_name ? `— ${form.owner_name}` : `— ${setup.villageName}`}</div>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="house-md-body">
                <section className="house-sec">
                  <div className="house-sec-title">ที่อยู่</div>
                  <div className="house-grid house-grid-3">
                    <label className="house-field">
                      <span>บ้านเลขที่</span>
                      <input name="house_no" value={form.house_no} onChange={handleChange} placeholder="10/1" />
                    </label>
                    <label className="house-field">
                      <span>ซอย</span>
                      <DropdownList
                        value={form.soi}
                        options={SOI_OPTIONS}
                        onChange={(nextValue) => setForm((current) => ({ ...current, soi: nextValue }))}
                        placeholder="เลือกซอย"
                      />
                    </label>
                    <label className="house-field">
                      <span>ชั้นที่</span>
                      <input name="floor_no" type="number" min="0" max="99" step="1" value={form.floor_no} onChange={handleChange} placeholder="0" />
                    </label>
                    <label className="house-field">
                      <span>หมายเลขห้อง</span>
                      <input name="room_no" value={form.room_no} onChange={handleChange} placeholder="เช่น A-502" />
                    </label>
                    <label className="house-field house-field-span-1">
                      <span>ถนน / ที่อยู่</span>
                      <input name="address" value={form.address} onChange={handleChange} placeholder="ถนนใหญ่ 1" />
                    </label>
                  </div>
                </section>

                <section className="house-sec">
                  <div className="house-sec-title">เจ้าของ / ผู้อาศัย</div>
                  <div className="house-grid house-grid-2">
                    <label className="house-field">
                      <span>เจ้าของกรรมสิทธิ์</span>
                      <input name="owner_name" value={form.owner_name} onChange={handleChange} placeholder="สมชาย ใจดี" />
                    </label>
                    <label className="house-field">
                      <span>ผู้เช่า / ผู้อาศัย</span>
                      <input name="resident_name" value={form.resident_name} onChange={handleChange} placeholder="ไม่มี" />
                    </label>
                    <label className="house-field">
                      <span>ผู้ติดต่อ</span>
                      <input name="contact_name" value={form.contact_name} onChange={handleChange} placeholder="สมชาย ใจดี" />
                    </label>
                    <label className="house-field">
                      <span>เบอร์โทร</span>
                      <input name="phone" value={form.phone} onChange={handleChange} placeholder="081-234-5678" />
                    </label>
                    <label className="house-field">
                      <span>Line ID</span>
                      <input name="line_id" value={form.line_id} onChange={handleChange} placeholder="somchai.id" />
                    </label>
                    <label className="house-field">
                      <span>EMAIL</span>
                      <input name="email" value={form.email} onChange={handleChange} placeholder="somchai@email.com" />
                    </label>
                  </div>
                </section>

                <section className="house-sec">
                  <div className="house-sec-title">การเงิน</div>
                  <div className="house-grid house-grid-3">
                    <label className="house-field">
                      <span>ขนาด ตร.ว.</span>
                      <input name="area_sqw" type="number" min="0" step="0.01" value={form.area_sqw} onChange={handleChange} placeholder="52" />
                    </label>
                    <label className="house-field">
                      <span>สิทธิ์จอดรถ (คัน)</span>
                      <input name="parking_rights" type="number" min="0" step="1" value={form.parking_rights} onChange={handleChange} placeholder="1" />
                    </label>
                    <label className="house-field">
                      <span>อัตราค่าส่วนกลางจาก setup</span>
                      <input value={formatDecimal(setup.feeRatePerSqw)} readOnly className="house-readonly" />
                    </label>
                    <label className="house-field">
                      <span>ค่าส่วนกลาง/ปี</span>
                      <input value={formatDecimal(annualFee)} readOnly className="house-readonly" />
                    </label>
                    <label className="house-field">
                      <span>ประเภท</span>
                      <DropdownList
                        value={form.house_type}
                        options={HOUSE_TYPE_OPTIONS}
                        onChange={(nextValue) => setForm((current) => ({ ...current, house_type: nextValue }))}
                        placeholder="เลือกประเภท"
                      />
                    </label>
                    <label className="house-field house-field-span-2">
                      <span>สถานะบ้าน</span>
                      <DropdownList
                        value={form.status}
                        options={HOUSE_STATUS_OPTIONS}
                        onChange={(nextValue) => setForm((current) => ({ ...current, status: nextValue }))}
                        placeholder="เลือกสถานะ"
                      />
                    </label>
                    <label className="house-field house-field-span-3">
                      <span>หมายเหตุ</span>
                      <textarea name="note" value={form.note} onChange={handleChange} rows="2" placeholder="รายละเอียดเพิ่มเติม" />
                    </label>
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

export default AdminHouses
