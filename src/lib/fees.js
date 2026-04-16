import { supabase } from './supabase'

const REJECT_PREFIX = '[REJECT] '
const PAYMENT_SLIP_BUCKET = 'system-assets'
const PAYMENT_SLIP_TARGET_BYTES = 60 * 1024
const PAYMENT_SLIP_MAX_UPLOAD_BYTES = 12 * 1024 * 1024

function sanitizeHouseNoForFileName(houseNo) {
  const raw = String(houseNo || '').trim()
  if (!raw) return 'general'
  return raw.replace(/[^a-zA-Z0-9-]+/g, '-')
}

function getSlipTimestampParts(paidAt) {
  const targetDate = paidAt ? new Date(paidAt) : new Date()
  const safeDate = Number.isFinite(targetDate.getTime()) ? targetDate : new Date()
  const yyyy = safeDate.getFullYear()
  const mm = String(safeDate.getMonth() + 1).padStart(2, '0')
  const dd = String(safeDate.getDate()).padStart(2, '0')
  const hh = String(safeDate.getHours()).padStart(2, '0')
  const mi = String(safeDate.getMinutes()).padStart(2, '0')
  const ss = String(safeDate.getSeconds()).padStart(2, '0')
  return {
    datePart: `${yyyy}${mm}${dd}`,
    timePart: `${hh}${mi}${ss}`,
  }
}

function buildResidentSlipFileName({ houseNo, paidAt, runningNo = 1 } = {}) {
  const { datePart, timePart } = getSlipTimestampParts(paidAt)
  const seq = String(Number(runningNo) > 0 ? Number(runningNo) : 1).padStart(3, '0')
  return `${sanitizeHouseNoForFileName(houseNo)}_${datePart}_${timePart}_${seq}.JPG`
}

async function resolveNextSlipRunningNo({ houseId, houseNo, paidAt }) {
  const folder = String(houseId || 'general').trim()
  const safeHouseNo = sanitizeHouseNoForFileName(houseNo)
  const { datePart, timePart } = getSlipTimestampParts(paidAt)
  const prefix = `${safeHouseNo}_${datePart}_${timePart}_`

  const { data, error } = await supabase.storage
    .from(PAYMENT_SLIP_BUCKET)
    .list(`payment-slips/${folder}`, { limit: 100, sortBy: { column: 'name', order: 'desc' } })

  if (error) throw error

  let maxSeq = 0
  for (const item of data || []) {
    const name = String(item?.name || '')
    if (!name.startsWith(prefix)) continue
    const match = name.match(/_(\d{3})\.[a-zA-Z]+$/)
    if (!match) continue
    const seq = Number(match[1])
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
  }

  return maxSeq + 1
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('ไม่สามารถเปิดรูปภาพได้'))
    image.src = src
  })
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })
}

async function compressSlipImageToLimit(file, targetBytes = PAYMENT_SLIP_TARGET_BYTES) {
  if (!String(file?.type || '').startsWith('image/')) {
    throw new Error('รองรับเฉพาะไฟล์รูปภาพเท่านั้น')
  }

  if (Number(file.size || 0) > PAYMENT_SLIP_MAX_UPLOAD_BYTES) {
    throw new Error('ไฟล์รูปใหญ่เกิน 12MB')
  }

  const dataUrl = await readFileAsDataUrl(file)
  const image = await loadImage(dataUrl)
  const baseMax = 1600
  const baseScale = Math.min(1, baseMax / Math.max(image.naturalWidth, image.naturalHeight))
  const scales = [baseScale, baseScale * 0.85, baseScale * 0.7, baseScale * 0.58, baseScale * 0.48, baseScale * 0.4, baseScale * 0.32, baseScale * 0.26, baseScale * 0.2]
  const qualities = [0.86, 0.74, 0.62, 0.5, 0.4, 0.32, 0.25, 0.2, 0.15]

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ไม่สามารถเตรียมการย่อรูปได้')

  let bestBlob = null

  for (const rawScale of scales) {
    const scale = Math.max(0.08, Math.min(1, rawScale))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)

    for (const quality of qualities) {
      const blob = await canvasToJpegBlob(canvas, quality)
      if (!blob) continue
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob
      if (blob.size <= targetBytes) {
        return new File([blob], 'payment-slip.jpg', { type: 'image/jpeg' })
      }
    }
  }

  if (bestBlob && bestBlob.size <= targetBytes) {
    return new File([bestBlob], 'payment-slip.jpg', { type: 'image/jpeg' })
  }

  throw new Error('ไม่สามารถย่อรูปให้เหลือ 60KB ได้ กรุณาเลือกรูปที่ขนาดเล็กลง')
}

function stripRejectMarker(note) {
  const raw = String(note || '')
  if (!raw.startsWith(REJECT_PREFIX)) return raw
  const lines = raw.split('\n')
  lines.shift()
  return lines.join('\n').trim()
}

function isRejectedPaymentNote(note) {
  return String(note || '').startsWith(REJECT_PREFIX)
}

function toGregorianYear(yearValue) {
  const year = Number(yearValue)
  if (!Number.isFinite(year) || year <= 0) return null
  return year > 2400 ? year - 543 : year
}

function toAmount(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function round2(value) {
  return Math.round(toAmount(value) * 100) / 100
}

function halfYearDates(yearCE, period) {
  if (period === 'first_half') {
    return {
      invoice_date: `${yearCE}-01-01`,
      due_date: `${yearCE}-07-31`,
    }
  }
  return {
    invoice_date: `${yearCE}-07-01`,
    due_date: `${yearCE + 1}-01-31`,
  }
}

async function getPaymentCycleConfigByYearCE(yearCE) {
  const targetYear = Number(yearCE)
  if (!Number.isFinite(targetYear) || targetYear <= 0) return null

  const { data: config, error: configError } = await supabase
    .from('payment_cycle_configs')
    .select('id, year_ce, frequency, is_active')
    .eq('year_ce', targetYear)
    .maybeSingle()

  if (configError) throw configError
  if (!config || config.is_active === false) return null

  const { data: periods, error: periodsError } = await supabase
    .from('payment_cycle_periods')
    .select('seq_no, period_label, start_date, end_date, due_date, due_year_offset, enable_penalty, penalty_start_date, penalty_year_offset')
    .eq('config_id', config.id)
    .order('seq_no', { ascending: true })

  if (periodsError) throw periodsError

  return {
    ...config,
    periods: periods || [],
  }
}

function getHalfYearPeriodRowFromCycle(cycleConfig, period) {
  if (!cycleConfig || !Array.isArray(cycleConfig.periods)) return null
  if (cycleConfig.frequency !== 'half_yearly') return null
  if (period === 'first_half') return cycleConfig.periods.find((row) => Number(row.seq_no) === 1) || null
  if (period === 'second_half') return cycleConfig.periods.find((row) => Number(row.seq_no) === 2) || null
  return null
}

function resolveHalfYearDatesFromCycle(yearCE, period, cycleConfig) {
  const fallback = halfYearDates(yearCE, period)
  const periodRow = getHalfYearPeriodRowFromCycle(cycleConfig, period)
  if (!periodRow) return fallback

  return {
    invoice_date: periodRow.start_date || fallback.invoice_date,
    due_date: periodRow.due_date || fallback.due_date,
  }
}

async function preloadCycleConfigByYears(years = [], cycleConfigByYear = {}) {
  const targets = [...new Set((Array.isArray(years) ? years : [])
    .map((year) => Number(year))
    .filter((year) => Number.isFinite(year) && year > 0))]

  if (targets.length === 0) return { ...(cycleConfigByYear || {}) }

  const resultMap = { ...(cycleConfigByYear || {}) }
  const missingYears = targets.filter((year) => !Object.prototype.hasOwnProperty.call(resultMap, String(year)))
  if (missingYears.length === 0) return resultMap

  const { data: configs, error: configError } = await supabase
    .from('payment_cycle_configs')
    .select('id, year_ce, frequency, is_active')
    .in('year_ce', missingYears)

  if (configError) throw configError

  const activeConfigs = (configs || []).filter((row) => row.is_active !== false)
  const configIdList = activeConfigs.map((row) => row.id).filter(Boolean)

  let periodsByConfigId = new Map()
  if (configIdList.length > 0) {
    const { data: periodRows, error: periodError } = await supabase
      .from('payment_cycle_periods')
      .select('config_id, seq_no, period_label, start_date, end_date, due_date, due_year_offset, enable_penalty, penalty_start_date, penalty_year_offset')
      .in('config_id', configIdList)
      .order('seq_no', { ascending: true })

    if (periodError) throw periodError

    periodsByConfigId = (periodRows || []).reduce((acc, row) => {
      const key = String(row.config_id || '')
      const current = acc.get(key) || []
      current.push(row)
      acc.set(key, current)
      return acc
    }, new Map())
  }

  for (const year of missingYears) {
    const config = activeConfigs.find((row) => Number(row.year_ce) === Number(year))
    if (!config) {
      resultMap[String(year)] = null
      continue
    }

    resultMap[String(year)] = {
      ...config,
      periods: periodsByConfigId.get(String(config.id)) || [],
    }
  }

  return resultMap
}

function resolvePenaltyPolicyForFee(fee, cycleConfigByYear = {}) {
  const year = Number(fee?.year || 0)
  if (!year) return { enabled: null, penaltyStartDate: null }

  const cycleConfig = cycleConfigByYear[String(year)]
  if (!cycleConfig || !Array.isArray(cycleConfig.periods)) {
    return { enabled: null, penaltyStartDate: null }
  }

  let periodRow = null
  if (fee?.period === 'first_half') {
    periodRow = getHalfYearPeriodRowFromCycle(cycleConfig, 'first_half')
  } else if (fee?.period === 'second_half') {
    periodRow = getHalfYearPeriodRowFromCycle(cycleConfig, 'second_half')
  } else if (fee?.period === 'full_year' && cycleConfig.frequency === 'yearly') {
    periodRow = cycleConfig.periods.find((row) => Number(row.seq_no) === 1) || null
  }

  if (!periodRow) return { enabled: null, penaltyStartDate: null }

  return {
    enabled: Boolean(periodRow.enable_penalty),
    penaltyStartDate: periodRow.penalty_start_date || null,
  }
}

function getNextHalfYearPeriod(yearCE, period) {
  if (period === 'first_half') {
    return { year: yearCE, period: 'second_half' }
  }
  return { year: yearCE + 1, period: 'first_half' }
}

function buildInvoiceDocumentNo(fee) {
  const yearSuffix = String(Number(fee?.year || 0)).slice(-2)
  const idPrefix = String(fee?.id || '').slice(0, 8).toUpperCase()
  return `INV-${yearSuffix}-${idPrefix}`
}

async function getParkingMonthlyByHouse() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('house_id, parking_fee, status')

  if (error) throw error

  const byHouse = new Map()
  for (const row of data || []) {
    if (!row?.house_id) continue
    if (row.status === 'removed') continue
    const monthly = toAmount(row.parking_fee)
    byHouse.set(row.house_id, toAmount(byHouse.get(row.house_id)) + monthly)
  }
  return byHouse
}

async function refreshFeeStatusFromPayments(feeId) {
  if (!feeId) return

  const { data: fee, error: feeError } = await supabase
    .from('fees')
    .select('id, total_amount')
    .eq('id', feeId)
    .maybeSingle()

  if (feeError) throw feeError
  if (!fee) return

  const { data: approvedPayments, error: paymentError } = await supabase
    .from('payments')
    .select('amount')
    .eq('fee_id', feeId)
    .not('verified_at', 'is', null)

  if (paymentError) throw paymentError

  const approvedTotal = (approvedPayments || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const nextStatus = approvedTotal >= Number(fee.total_amount || 0) ? 'paid' : 'pending'

  const { error: updateError } = await supabase
    .from('fees')
    .update({ status: nextStatus })
    .eq('id', feeId)

  if (updateError) throw updateError
}

export async function listFees({ status = 'all', year = 'all', period = 'all', search = '' } = {}) {
  let query = supabase
    .from('fees')
    .select('id, house_id, year, period, invoice_date, due_date, status, fee_common, fee_parking, fee_waste, fee_overdue_common, fee_overdue_fine, fee_overdue_notice, fee_fine, fee_notice, fee_violation, fee_other, total_amount, note, created_at, houses(id, house_no, soi, owner_name, area_sqw, fee_rate)')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (year && year !== 'all') {
    query = query.eq('year', Number(year))
  }

  if (period && period !== 'all') {
    query = query.eq('period', period)
  }

  if (search && search.trim()) {
    const keyword = search.trim()
    query = query.or(`period.ilike.%${keyword}%,note.ilike.%${keyword}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getFeeById(feeId) {
  if (!feeId) return null

  const { data, error } = await supabase
    .from('fees')
    .select('id, house_id, year, period, invoice_date, due_date, status, fee_common, fee_parking, fee_waste, fee_overdue_common, fee_overdue_fine, fee_overdue_notice, fee_fine, fee_notice, fee_violation, fee_other, total_amount, note, created_at, houses(id, house_no, soi, owner_name, area_sqw, fee_rate)')
    .eq('id', feeId)
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function getLatestFeeYear() {
  const { data, error } = await supabase
    .from('fees')
    .select('year')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return Number(data?.year || new Date().getFullYear())
}

export async function getFeeYears() {
  const { data, error } = await supabase
    .from('fees')
    .select('year')
    .order('year', { ascending: false })

  if (error) throw error

  return [...new Set((data || []).map((row) => Number(row.year)).filter(Boolean))].sort((a, b) => b - a)
}

export async function listHouseFees(houseId, { status = 'all', year = 'all' } = {}) {
  if (!houseId) return []

  let query = supabase
    .from('fees')
    .select('id, house_id, year, period, invoice_date, due_date, status, fee_common, fee_parking, fee_waste, fee_overdue_common, fee_overdue_fine, fee_overdue_notice, fee_fine, fee_notice, fee_violation, fee_other, total_amount, note, created_at')
    .eq('house_id', houseId)
    .order('year', { ascending: false })
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (year && year !== 'all') {
    query = query.eq('year', Number(year))
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createFee(payload) {
  const fee = {
    house_id: payload.house_id || null,
    year: Number(payload.year),
    period: payload.period || 'full_year',
    invoice_date: payload.invoice_date || null,
    due_date: payload.due_date || null,
    status: payload.status || 'unpaid',
    fee_common: Number(payload.fee_common || 0),
    fee_parking: Number(payload.fee_parking || 0),
    fee_waste: Number(payload.fee_waste || 0),
    fee_overdue_common: Number(payload.fee_overdue_common || 0),
    fee_overdue_fine: Number(payload.fee_overdue_fine || 0),
    fee_overdue_notice: Number(payload.fee_overdue_notice || 0),
    fee_fine: Number(payload.fee_fine || 0),
    fee_notice: Number(payload.fee_notice || 0),
    fee_violation: Number(payload.fee_violation || 0),
    fee_other: Number(payload.fee_other || 0),
    note: payload.note?.trim() || null,
  }

  const { data, error } = await supabase
    .from('fees')
    .insert([fee])
    .select('id, house_id, year, period, invoice_date, due_date, status, fee_common, fee_parking, fee_waste, fee_overdue_common, fee_overdue_fine, fee_overdue_notice, fee_fine, fee_notice, fee_violation, fee_other, total_amount, note, created_at, houses(id, house_no, soi, owner_name, area_sqw, fee_rate)')
    .single()

  if (error) throw error
  return data
}

export async function processHalfYearFeesAllHouses({ yearBE, period, setup, overwritePending = false, cycleConfig = null }) {
  const yearCE = toGregorianYear(yearBE)
  if (!yearCE) throw new Error('ปีไม่ถูกต้อง')
  if (!['first_half', 'second_half'].includes(period)) {
    throw new Error('งวดไม่ถูกต้อง')
  }

  // Enforce sequence after the first generation: H1 -> H2 -> next-year H1 -> ...
  const { data: latestHalfYearFee, error: latestHalfYearError } = await supabase
    .from('fees')
    .select('year, period, status')
    .in('period', ['first_half', 'second_half'])
    .neq('status', 'cancelled')
    .order('year', { ascending: false })
    .order('period', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestHalfYearError) throw latestHalfYearError

  if (latestHalfYearFee?.year && latestHalfYearFee?.period) {
    const latestYear = Number(latestHalfYearFee.year)
    const latestPeriod = latestHalfYearFee.period
    const sameTarget = latestYear === yearCE && latestPeriod === period
    const nextExpected = getNextHalfYearPeriod(latestYear, latestPeriod)
    const isExpectedNext = nextExpected.year === yearCE && nextExpected.period === period

    if (!sameTarget && !isExpectedNext) {
      const expectedLabel = `${nextExpected.period === 'first_half' ? 'ครึ่งปีแรก' : 'ครึ่งปีหลัง'} ปี ${nextExpected.year + 543}`
      throw new Error(`สร้างข้ามงวดไม่ได้: ถัดไปต้องเป็น ${expectedLabel}`)
    }
  }

  const ratePerSqw = toAmount(setup?.fee_rate_per_sqw)
  const wastePerPeriod = toAmount(setup?.waste_fee_per_period)
  const finePct = toAmount(setup?.overdue_fine_pct)
  const noticeFee = round2(toAmount(setup?.notice_fee))
  const resolvedCycleConfig = cycleConfig || await getPaymentCycleConfigByYearCE(yearCE)
  const dates = resolveHalfYearDatesFromCycle(yearCE, period, resolvedCycleConfig)

  // Fields required for accurate carry-forward calculation
  const CARRY_SELECT = 'id, house_id, status, fee_common, fee_overdue_common, fee_overdue_notice, fee_notice, note'

  const [housesResp, existingResp, fullYearResp, sameYearPrevResp, prevYearResp, parkingByHouse] = await Promise.all([
    supabase.from('houses').select('id, area_sqw'),
    supabase.from('fees').select('id, house_id, status').eq('year', yearCE).eq('period', period),
    // Check which houses already have a full_year invoice for this year
    supabase.from('fees').select('house_id').eq('year', yearCE).eq('period', 'full_year'),
    // For second_half: carry from first_half of same year (H1 → H2)
    period === 'second_half'
      ? supabase.from('fees').select(CARRY_SELECT).eq('year', yearCE).eq('period', 'first_half')
      : Promise.resolve({ data: [], error: null }),
    // For first_half: carry from second_half of previous year (H2 prev year → H1 new year)
    period === 'first_half'
      ? supabase.from('fees').select(CARRY_SELECT).eq('year', yearCE - 1).eq('period', 'second_half')
      : Promise.resolve({ data: [], error: null }),
    getParkingMonthlyByHouse(),
  ])

  if (housesResp.error) throw housesResp.error
  if (existingResp.error) throw existingResp.error
  if (fullYearResp.error) throw fullYearResp.error
  if (sameYearPrevResp.error) throw sameYearPrevResp.error
  if (prevYearResp.error) throw prevYearResp.error

  const existingByHouse = new Map((existingResp.data || []).map((row) => [row.house_id, row]))
  const fullYearHouseIds = new Set((fullYearResp.data || []).map((row) => row.house_id))
  // Merge both carry sources — each house can only appear in one of the two queries
  const prevFeeByHouse = new Map(
    [...(sameYearPrevResp.data || []), ...(prevYearResp.data || [])].map((row) => [row.house_id, row]),
  )
  const houses = housesResp.data || []

  const prevFeeIds = [...prevFeeByHouse.values()].map((f) => f.id)
  const prevPaymentFeeIds = new Set()
  if (prevFeeIds.length > 0) {
    const { data: prevPayments, error: prevPaymentError } = await supabase
      .from('payments')
      .select('fee_id')
      .in('fee_id', prevFeeIds)
      .gt('amount', 0)

    if (prevPaymentError) throw prevPaymentError
    for (const row of prevPayments || []) {
      if (row?.fee_id) prevPaymentFeeIds.add(row.fee_id)
    }
  }

  let created = 0
  let updated = 0
  let skippedPaid = 0
  let skippedPending = 0
  let skippedFullYear = 0
  let cancelledFirstHalf = 0

  for (const house of houses) {
    // Skip houses that already have a full_year invoice — no half-year duplicate allowed
    if (fullYearHouseIds.has(house.id)) {
      skippedFullYear += 1
      continue
    }

    const area = toAmount(house.area_sqw)
    const parkingMonthly = toAmount(parkingByHouse.get(house.id))
    const payload = {
      year: yearCE,
      period,
      invoice_date: dates.invoice_date,
      due_date: dates.due_date,
      status: 'unpaid',
      fee_common: round2(area * 6 * ratePerSqw),
      fee_parking: round2(parkingMonthly * 6),
      fee_waste: round2(wastePerPeriod),
      fee_overdue_common: 0,
      fee_overdue_fine: 0,
      fee_overdue_notice: 0,
      fee_fine: 0,
      fee_notice: 0,
      fee_violation: 0,
      fee_other: 0,
      note: null,
    }

    const prevFee = prevFeeByHouse.get(house.id)
    const canCarry = Boolean(
      prevFee
      && !prevPaymentFeeIds.has(prevFee.id)
      && ['unpaid', 'overdue'].includes(String(prevFee.status || ''))
    )

    if (canCarry) {
      // fee_overdue_common = prev.fee_common + prev.fee_overdue_common (ค่าส่วนกลางเท่านั้น)
      const overdueCommon = round2(toAmount(prevFee.fee_common) + toAmount(prevFee.fee_overdue_common))
      payload.fee_overdue_common = overdueCommon
      payload.fee_overdue_fine = overdueCommon > 0 ? round2(overdueCommon * (finePct / 100)) : 0
      // fee_overdue_notice สะสม: prev.fee_overdue_notice + notice_fee ต่อครั้งทวงถาม
      payload.fee_overdue_notice = overdueCommon > 0 ? round2(toAmount(prevFee.fee_overdue_notice) + noticeFee) : 0
      const prevDocNo = buildInvoiceDocumentNo(prevFee)
      payload.note = period === 'second_half'
        ? `รวมยอดค้างจากครึ่งปีแรก ปี ${yearCE + 543} เลขที่เอกสาร ${prevDocNo}`
        : `รวมยอดค้างจากครึ่งปีหลัง ปี ${yearCE - 1 + 543} เลขที่เอกสาร ${prevDocNo}`
    }

    const existing = existingByHouse.get(house.id)
    if (!existing) {
      const { data: insertedFee, error } = await supabase.from('fees').insert([{ house_id: house.id, ...payload }]).select('id').single()
      if (error) throw error

      if (canCarry) {
        const insertedDocNo = buildInvoiceDocumentNo({ year: yearCE, id: insertedFee?.id })
        const cancelNote = period === 'second_half'
          ? `ยกยอดไปใบแจ้งหนี้ครึ่งปีหลัง ปี ${yearCE + 543} เลขที่เอกสาร ${insertedDocNo} แล้ว — ระบบยกเลิกอัตโนมัติ ห้ามแก้ไข`
          : `ยกยอดไปใบแจ้งหนี้ครึ่งปีแรก ปี ${yearCE + 543} เลขที่เอกสาร ${insertedDocNo} แล้ว — ระบบยกเลิกอัตโนมัติ ห้ามแก้ไข`
        const { error: cancelError } = await supabase
          .from('fees')
          .update({ status: 'cancelled', note: cancelNote })
          .eq('id', prevFee.id)
        if (cancelError) throw cancelError
        cancelledFirstHalf += 1
      }

      created += 1
      continue
    }

    if (existing.status === 'paid') {
      skippedPaid += 1
      continue
    }

    if (existing.status === 'pending' && !overwritePending) {
      skippedPending += 1
      continue
    }

    const { error } = await supabase
      .from('fees')
      .update(payload)
      .eq('id', existing.id)
    if (error) throw error

    if (canCarry) {
      const existingDocNo = buildInvoiceDocumentNo({ year: yearCE, id: existing.id })
      const cancelNote = period === 'second_half'
        ? `ยกยอดไปใบแจ้งหนี้ครึ่งปีหลัง ปี ${yearCE + 543} เลขที่เอกสาร ${existingDocNo} แล้ว — ระบบยกเลิกอัตโนมัติ ห้ามแก้ไข`
        : `ยกยอดไปใบแจ้งหนี้ครึ่งปีแรก ปี ${yearCE + 543} เลขที่เอกสาร ${existingDocNo} แล้ว — ระบบยกเลิกอัตโนมัติ ห้ามแก้ไข`
      const { error: cancelError } = await supabase
        .from('fees')
        .update({ status: 'cancelled', note: cancelNote })
        .eq('id', prevFee.id)
      if (cancelError) throw cancelError
      cancelledFirstHalf += 1
    }

    updated += 1
  }

  return {
    created,
    updated,
    skippedPaid,
    skippedPending,
    skippedFullYear,
    cancelledFirstHalf,
    totalHouses: houses.length,
    yearCE,
    period,
  }
}

export async function calculateFullYearFeeByHouse({ houseId, year, setup }) {
  const yearCE = toGregorianYear(year)
  if (!houseId) throw new Error('ไม่พบบ้าน')
  if (!yearCE) throw new Error('ปีไม่ถูกต้อง')

  const ratePerSqw = toAmount(setup?.fee_rate_per_sqw)
  const wastePerPeriod = toAmount(setup?.waste_fee_per_period)
  const discountPct = toAmount(setup?.early_pay_discount_pct)

  const [houseResp, parkingByHouseResp, yearFeesResp] = await Promise.all([
    supabase.from('houses').select('id, area_sqw').eq('id', houseId).single(),
    getParkingMonthlyByHouse(),
    supabase
      .from('fees')
      .select('id, period, status, fee_common, fee_parking, fee_waste, fee_overdue_common, fee_overdue_fine, fee_overdue_notice, fee_fine, fee_notice, fee_violation, fee_other')
      .eq('house_id', houseId)
      .eq('year', yearCE)
      .in('period', ['first_half', 'second_half', 'full_year']),
  ])

  if (houseResp.error) throw houseResp.error
  if (yearFeesResp.error) throw yearFeesResp.error

  const yearFees = yearFeesResp.data || []
  const existingFullYear = yearFees.find((row) => row.period === 'full_year')
  const halfYearRows = yearFees.filter((row) => row.period === 'first_half' || row.period === 'second_half')

  if (halfYearRows.length > 0) {
    const halfYearIds = halfYearRows.map((row) => row.id)
    const { data: paymentRows, error: paymentError } = await supabase
      .from('payments')
      .select('id')
      .in('fee_id', halfYearIds)
      .gt('amount', 0)
      .limit(1)

    if (paymentError) throw paymentError
    if ((paymentRows || []).length > 0) {
      throw new Error('บ้านนี้มีรายการจ่ายค่าส่วนกลางแล้ว ไม่สามารถสร้างใบแจ้งหนี้ทั้งปีได้')
    }
  }

  const area = toAmount(houseResp.data?.area_sqw)
  const parkingMonthly = toAmount(parkingByHouseResp.get(houseId))
  const commonBeforeDiscount = round2(area * 12 * ratePerSqw)
  const discountAmount = round2(commonBeforeDiscount * (discountPct / 100))
  const feeParking = round2(parkingMonthly * 12)
  const feeWaste = round2(wastePerPeriod * 2)

  const hasSecondHalf = halfYearRows.some((row) => row.period === 'second_half')
  // Store fee_common as the FULL (pre-discount) amount and put the discount as a negative fee_other.
  // This follows the same [DISCOUNT:x] note pattern used by the edit modal, so when the admin
  // opens the edit form they see the discount properly in the "ส่วนลด" field.
  const payload = {
    house_id: houseId,
    year: yearCE,
    period: 'full_year',
    invoice_date: `${yearCE}-01-01`,
    due_date: `${yearCE + 1}-01-31`,
    status: 'unpaid',
    fee_common: round2(commonBeforeDiscount),
    fee_parking: feeParking,
    fee_waste: feeWaste,
    fee_overdue_common: 0,
    fee_overdue_fine: 0,
    fee_overdue_notice: 0,
    fee_fine: 0,
    fee_notice: 0,
    fee_violation: 0,
    fee_other: round2(-discountAmount),
    note: `[DISCOUNT:${discountAmount}] คำนวณทั้งปี ลดเฉพาะค่าส่วนกลาง ${discountPct}%`,
  }

  if (hasSecondHalf) {
    const sumField = (field) => halfYearRows.reduce((sum, row) => sum + toAmount(row[field]), 0)
    payload.fee_common = round2(sumField('fee_common'))
    payload.fee_parking = round2(sumField('fee_parking'))
    payload.fee_waste = round2(sumField('fee_waste'))
    payload.fee_overdue_common = round2(sumField('fee_overdue_common'))
    payload.fee_overdue_fine = round2(sumField('fee_overdue_fine'))
    payload.fee_overdue_notice = round2(sumField('fee_overdue_notice'))
    payload.fee_fine = round2(sumField('fee_fine'))
    payload.fee_notice = round2(sumField('fee_notice'))
    payload.fee_violation = round2(sumField('fee_violation'))
    payload.fee_other = round2(sumField('fee_other'))
    payload.note = 'รวมรายการจากใบแจ้งหนี้ครึ่งปีเป็นใบแจ้งหนี้เต็มปี (ไม่ใช้ส่วนลด)'
  }

  if (existingFullYear?.id) {
    const { data, error } = await supabase
      .from('fees')
      .update(payload)
      .eq('id', existingFullYear.id)
      .select('id, house_id, year, period, invoice_date, due_date, status, fee_common, fee_parking, fee_waste, fee_overdue_common, fee_overdue_fine, fee_overdue_notice, fee_fine, fee_notice, fee_violation, fee_other, total_amount, note, created_at, houses(id, house_no, owner_name)')
      .single()
    if (error) throw error

    if (halfYearRows.length > 0) {
      const { error: deleteHalfError } = await supabase
        .from('fees')
        .delete()
        .in('id', halfYearRows.map((row) => row.id))
      if (deleteHalfError) throw deleteHalfError
    }

    return data
  }

  const { data, error } = await supabase
    .from('fees')
    .insert([payload])
    .select('id, house_id, year, period, invoice_date, due_date, status, fee_common, fee_parking, fee_waste, fee_overdue_common, fee_overdue_fine, fee_overdue_notice, fee_fine, fee_notice, fee_violation, fee_other, total_amount, note, created_at, houses(id, house_no, owner_name)')
    .single()
  if (error) throw error

  if (halfYearRows.length > 0) {
    const { error: deleteHalfError } = await supabase
      .from('fees')
      .delete()
      .in('id', halfYearRows.map((row) => row.id))
    if (deleteHalfError) throw deleteHalfError
  }

  return data
}

export async function calculateOverdueFeeCharges(feeId, setup) {
  const { data: fee, error: feeError } = await supabase
    .from('fees')
    .select('id, year, period, status, due_date, fee_common, fee_overdue_common')
    .eq('id', feeId)
    .single()

  if (feeError) throw feeError

  if (fee.status === 'paid') {
    throw new Error('ใบแจ้งหนี้ชำระแล้ว ไม่สามารถคำนวณค่าปรับได้')
  }

  if (fee.status === 'cancelled') {
    throw new Error('ใบแจ้งหนี้ถูกยกเลิกโดยระบบ ไม่สามารถคำนวณค่าปรับได้')
  }

  const cycleConfigByYear = await preloadCycleConfigByYears([fee?.year], {})
  const penaltyPolicy = resolvePenaltyPolicyForFee(fee, cycleConfigByYear)
  const updatePayload = buildOverdueUpdatePayload(fee, setup, penaltyPolicy)

  if (!updatePayload) {
    throw new Error('ยังไม่ถึงเงื่อนไขการคำนวณค่าปรับ')
  }

  const { data, error } = await supabase
    .from('fees')
    .update(updatePayload)
    .eq('id', feeId)
    .select('id, house_id, year, period, invoice_date, due_date, status, fee_common, fee_parking, fee_waste, fee_overdue_common, fee_overdue_fine, fee_overdue_notice, fee_fine, fee_notice, fee_violation, fee_other, total_amount, note, created_at, houses(id, house_no, owner_name)')
    .single()

  if (error) throw error
  return data
}

export async function calculateOverdueFeesBulk({ year, setup } = {}) {
  let query = supabase
    .from('fees')
    .select('id, year, period, status, due_date, fee_common, fee_overdue_common')

  if (year && year !== 'all') {
    query = query.eq('year', Number(year))
  }

  const { data, error } = await query
  if (error) throw error

  const cycleConfigByYear = await preloadCycleConfigByYears((data || []).map((row) => row?.year), {})

  let updated = 0
  let skippedPaid = 0
  let skippedNotDue = 0

  for (const fee of data || []) {
    if (fee.status === 'paid') {
      skippedPaid += 1
      continue
    }

    if (fee.status === 'cancelled') {
      skippedNotDue += 1
      continue
    }

    const penaltyPolicy = resolvePenaltyPolicyForFee(fee, cycleConfigByYear)
    const updatePayload = buildOverdueUpdatePayload(fee, setup, penaltyPolicy)
    if (!updatePayload) {
      skippedNotDue += 1
      continue
    }

    const { error: updateError } = await supabase
      .from('fees')
      .update(updatePayload)
      .eq('id', fee.id)

    if (updateError) throw updateError
    updated += 1
  }

  return {
    updated,
    skippedPaid,
    skippedNotDue,
    total: (data || []).length,
  }
}

export async function calculateOverdueFeesByIds({ feeIds, setup } = {}) {
  const ids = Array.isArray(feeIds) ? feeIds.filter(Boolean) : []
  if (ids.length === 0) {
    return { updated: 0, skippedPaid: 0, skippedNotDue: 0, total: 0 }
  }

  const { data, error } = await supabase
    .from('fees')
    .select('id, year, period, status, due_date, fee_common, fee_overdue_common')
    .in('id', ids)

  if (error) throw error

  const cycleConfigByYear = await preloadCycleConfigByYears((data || []).map((row) => row?.year), {})

  let updated = 0
  let skippedPaid = 0
  let skippedNotDue = 0

  for (const fee of data || []) {
    if (fee.status === 'paid') {
      skippedPaid += 1
      continue
    }

    if (fee.status === 'cancelled') {
      skippedNotDue += 1
      continue
    }

    const penaltyPolicy = resolvePenaltyPolicyForFee(fee, cycleConfigByYear)
    const updatePayload = buildOverdueUpdatePayload(fee, setup, penaltyPolicy)
    if (!updatePayload) {
      skippedNotDue += 1
      continue
    }

    const { error: updateError } = await supabase
      .from('fees')
      .update(updatePayload)
      .eq('id', fee.id)

    if (updateError) throw updateError
    updated += 1
  }

  return {
    updated,
    skippedPaid,
    skippedNotDue,
    total: (data || []).length,
  }
}

export async function updateFee(id, updates) {
  const { data, error } = await supabase
    .from('fees')
    .update(updates)
    .eq('id', id)
    .select('id, house_id, year, period, invoice_date, due_date, status, fee_common, fee_parking, fee_waste, fee_overdue_common, fee_overdue_fine, fee_overdue_notice, fee_fine, fee_notice, fee_violation, fee_other, total_amount, note, created_at, houses(id, house_no, owner_name)')
    .single()

  if (error) throw error
  return data
}

export async function deleteFee(id) {
  const { error } = await supabase
    .from('fees')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}

const PAYMENT_SELECT = 'id, fee_id, house_id, amount, payment_method, slip_url, paid_at, verified_by, verified_at, note, payer_type, payer_name, payer_contact, payer_tax_id, payer_address, partner_id, receipt_no, verified_profile:verified_by(full_name), fees(id, year, period, status, total_amount, due_date, invoice_date), houses(id, house_no, soi, owner_name), partners(id, name, tax_id, address, phone), payment_items(id, item_key, item_label, due_amount, paid_amount, outstanding_amount)'

function applyPaymentKindFilter(query, { generalOnly = false, feeOnly = false } = {}) {
  if (generalOnly) return query.is('fee_id', null)
  if (feeOnly) return query.not('fee_id', 'is', null)
  return query
}

function buildReceiptDatePart(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date()
    return `${String(fallback.getFullYear()).slice(-2)}${String(fallback.getMonth() + 1).padStart(2, '0')}${String(fallback.getDate()).padStart(2, '0')}`
  }
  return `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

async function generateReceiptNo(paidAt, { excludePaymentId = null } = {}) {
  const date = paidAt ? new Date(paidAt) : new Date()
  if (Number.isNaN(date.getTime())) {
    throw new Error('วันที่ชำระไม่ถูกต้อง')
  }

  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0)).toISOString()
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0)).toISOString()

  let query = supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .gte('paid_at', start)
    .lt('paid_at', end)

  if (excludePaymentId) {
    query = query.neq('id', excludePaymentId)
  }

  const { count, error } = await query
  if (error) throw error

  const running = String(Number(count || 0) + 1).padStart(3, '0')
  return `RCT-${buildReceiptDatePart(date.toISOString())}-${running}`
}

async function getPaymentById(paymentId) {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .eq('id', paymentId)
    .single()

  if (error) throw error
  return data
}

export async function listPayments({ limit, generalOnly = false, feeOnly = false } = {}) {
  let query = supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .order('paid_at', { ascending: false })

  query = applyPaymentKindFilter(query, { generalOnly, feeOnly })

  if (limit) {
    query = query.limit(limit)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function listPaymentMonthOptions({ generalOnly = false, feeOnly = false } = {}) {
  let query = supabase
    .from('payments')
    .select('paid_at')
    .not('paid_at', 'is', null)
    .order('paid_at', { ascending: false })

  query = applyPaymentKindFilter(query, { generalOnly, feeOnly })

  const { data, error } = await query

  if (error) throw error

  const seen = new Set()
  const options = []
  for (const row of data || []) {
    const paidAt = row?.paid_at
    if (!paidAt) continue
    const d = new Date(paidAt)
    if (Number.isNaN(d.getTime())) continue
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ key, year, month })
  }

  return options
}

export async function listPaymentsByMonth({ year, month, generalOnly = false, feeOnly = false } = {}) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error('เดือน/ปีไม่ถูกต้อง')
  }

  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)).toISOString()
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)).toISOString()

  let query = supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .gte('paid_at', start)
    .lt('paid_at', end)
    .order('paid_at', { ascending: false })

  query = applyPaymentKindFilter(query, { generalOnly, feeOnly })

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function listHousePayments(houseId, { limit } = {}) {
  if (!houseId) return []

  let query = supabase
    .from('payments')
    .select('id, fee_id, house_id, amount, payment_method, slip_url, paid_at, verified_by, verified_at, note, verified_profile:verified_by(full_name), fees(id, year, period, status, total_amount, due_date, invoice_date), payment_items(id, item_key, item_label, due_amount, paid_amount, outstanding_amount)')
    .eq('house_id', houseId)
    .order('paid_at', { ascending: false })

  if (limit) {
    query = query.limit(limit)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function listPaymentTotalsByFeeIds(feeIds = []) {
  const ids = Array.isArray(feeIds) ? feeIds.filter(Boolean) : []
  if (ids.length === 0) return { submitted: {}, approved: {} }

  const { data, error } = await supabase
    .from('payments')
    .select('fee_id, amount, verified_at, note')
    .in('fee_id', ids)

  if (error) throw error

  const submitted = {}
  const approved = {}
  for (const row of data || []) {
    const feeId = row?.fee_id
    if (!feeId) continue
    if (isRejectedPaymentNote(row?.note)) continue

    const amount = Number(row.amount || 0)
    submitted[feeId] = Number(submitted[feeId] || 0) + amount
    if (row.verified_at) {
      approved[feeId] = Number(approved[feeId] || 0) + amount
    }
  }

  return { submitted, approved }
}

export async function listApprovedPaymentItemTotalsByFeeIds(feeIds = []) {
  const ids = Array.isArray(feeIds) ? feeIds.filter(Boolean) : []
  if (ids.length === 0) return {}

  const { data: approvedPayments, error: paymentError } = await supabase
    .from('payments')
    .select('id, fee_id, note, verified_at')
    .in('fee_id', ids)
    .not('verified_at', 'is', null)

  if (paymentError) throw paymentError

  const validPayments = (approvedPayments || []).filter((row) => !isRejectedPaymentNote(row?.note))
  const paymentIds = validPayments.map((row) => row.id).filter(Boolean)
  if (paymentIds.length === 0) return {}

  const feeByPaymentId = validPayments.reduce((acc, row) => {
    acc[row.id] = row.fee_id
    return acc
  }, {})

  const { data: itemRows, error: itemError } = await supabase
    .from('payment_items')
    .select('payment_id, fee_id, item_key, paid_amount')
    .in('payment_id', paymentIds)

  if (itemError) throw itemError

  const totals = {}
  for (const row of itemRows || []) {
    const feeId = row?.fee_id || feeByPaymentId[row?.payment_id]
    const itemKey = String(row?.item_key || '').trim()
    if (!feeId || !itemKey) continue
    if (!totals[feeId]) totals[feeId] = {}
    totals[feeId][itemKey] = Number(totals[feeId][itemKey] || 0) + Number(row?.paid_amount || 0)
  }

  return totals
}

export async function listNoticePrintCountsByFeeIds(feeIds = []) {
  const ids = Array.isArray(feeIds) ? feeIds.filter(Boolean) : []
  if (ids.length === 0) return {}

  const { data, error } = await supabase
    .from('fee_notice_print_logs')
    .select('fee_id, notice_no')
    .in('fee_id', ids)

  if (error) throw error

  const counts = {}
  for (const row of data || []) {
    const feeId = row?.fee_id
    if (!feeId) continue
    const noticeNo = Number(row?.notice_no || 0)
    counts[feeId] = Math.max(Number(counts[feeId] || 0), noticeNo)
  }
  return counts
}

export async function createNoticePrintLogs(rows = []) {
  const payload = (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.fee_id && Number(row?.notice_no || 0) > 0)
    .map((row) => ({
      fee_id: row.fee_id,
      notice_no: Number(row.notice_no),
      print_mode: row.print_mode || 'paper',
      printed_by: row.printed_by || null,
      printed_at: row.printed_at || new Date().toISOString(),
    }))

  if (payload.length === 0) return []

  const { data, error } = await supabase
    .from('fee_notice_print_logs')
    .insert(payload)
    .select('id, fee_id, notice_no, print_mode, printed_by, printed_at, created_at')

  if (error) throw error
  return data || []
}

export async function createPayment(payload) {
  const paymentItems = (Array.isArray(payload.payment_items) ? payload.payment_items : [])
    .filter((item) => String(item?.item_label || '').trim())
    .map((item, index) => ({
      // Normalize data for safe insert and reporting consistency.
      item_key: String(item?.item_key || item?.key || `item_${index + 1}`).trim(),
      item_label: String(item?.item_label || item?.label || '-').trim(),
      due_amount: Number.isFinite(Number(item?.due_amount ?? item?.dueAmount)) ? Number(item?.due_amount ?? item?.dueAmount) : 0,
      paid_amount: Number.isFinite(Number(item?.paid_amount ?? item?.paidAmount)) ? Number(item?.paid_amount ?? item?.paidAmount) : 0,
    }))

  const payment = {
    fee_id: payload.fee_id || null,
    house_id: payload.house_id || null,
    amount: Number(payload.amount || 0),
    payment_method: payload.payment_method || 'transfer',
    slip_url: payload.slip_url?.trim() || null,
    note: payload.note?.trim() || null,
    payer_type: payload.payer_type || null,
    payer_name: payload.payer_name?.trim() || null,
    payer_contact: payload.payer_contact?.trim() || null,
    payer_tax_id: payload.payer_tax_id?.trim() || null,
    payer_address: payload.payer_address?.trim() || null,
    partner_id: payload.partner_id || null,
    paid_at: payload.paid_at || new Date().toISOString(),
    verified_by: payload.verified_by || null,
    verified_at: payload.verified_at || null,
  }
  // Insert payment (including payer fields if provided)
  const { data: insertedPayment, error: insertError } = await supabase
    .from('payments')
    .insert([payment])
    .select(PAYMENT_SELECT)
    .single()

  if (insertError) throw insertError

  // Ensure a short receipt_no exists. If caller provided one in payload, persist it; otherwise generate.
  if (!insertedPayment.receipt_no) {
    const generated = await generateReceiptNo(insertedPayment.paid_at, { excludePaymentId: insertedPayment.id })

    const { data: updated, error: updErr } = await supabase
      .from('payments')
      .update({ receipt_no: generated })
      .eq('id', insertedPayment.id)
      .select('receipt_no')
      .single()

    if (updErr) throw updErr
    insertedPayment.receipt_no = updated.receipt_no
  } else if (payload.receipt_no) {
    // Persist provided receipt_no (overwrite if necessary)
    const { error: providedErr } = await supabase
      .from('payments')
      .update({ receipt_no: String(payload.receipt_no).trim() })
      .eq('id', insertedPayment.id)

    if (providedErr) throw providedErr
    insertedPayment.receipt_no = String(payload.receipt_no).trim()
  }

  // Insert payment items if any
  if (paymentItems.length > 0) {
    const itemRows = paymentItems.map((item) => ({
      payment_id: insertedPayment.id,
      fee_id: insertedPayment.fee_id,
      house_id: insertedPayment.house_id,
      item_key: item.item_key,
      item_label: item.item_label,
      due_amount: item.due_amount,
      paid_amount: item.paid_amount,
    }))

    const { error: itemError } = await supabase
      .from('payment_items')
      .insert(itemRows)

    if (itemError) throw itemError

    const { data: insertedItems, error: itemReadError } = await supabase
      .from('payment_items')
      .select('id, item_key, item_label, due_amount, paid_amount, outstanding_amount')
      .eq('payment_id', insertedPayment.id)

    if (itemReadError) throw itemReadError
    insertedPayment.payment_items = insertedItems || []
  }

  // If fee_id provided, possibly update fee status
  if (payload.fee_id) {
    if (payload.setFeeStatusFromAmount) {
      const { data: feeRow, error: feeReadError } = await supabase
        .from('fees')
        .select('id, total_amount')
        .eq('id', payload.fee_id)
        .single()

      if (feeReadError) throw feeReadError

      const { data: paymentRows, error: paymentReadError } = await supabase
        .from('payments')
        .select('amount, note')
        .eq('fee_id', payload.fee_id)

      if (paymentReadError) throw paymentReadError

      const submittedTotal = (paymentRows || [])
        .filter((row) => !isRejectedPaymentNote(row.note))
        .reduce((sum, row) => sum + Number(row.amount || 0), 0)
      const totalAmount = Number(feeRow?.total_amount || 0)

      const nextStatus = submittedTotal >= totalAmount
        ? 'paid'
        : submittedTotal > 0
          ? 'partial'
          : 'unpaid'

      const { error: feeError } = await supabase
        .from('fees')
        .update({ status: nextStatus })
        .eq('id', payload.fee_id)

      if (feeError) throw feeError
    } else {
      const { error: feeError } = await supabase
        .from('fees')
        .update({ status: 'pending' })
        .eq('id', payload.fee_id)

      if (feeError) throw feeError
    }
  }

  const { data: fullPayment, error: fullPaymentError } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .eq('id', insertedPayment.id)
    .single()

  if (fullPaymentError) throw fullPaymentError

  return fullPayment
}

export async function updatePayment(paymentId, payload = {}) {
  if (!paymentId) throw new Error('ไม่พบรายการที่ต้องการแก้ไข')
  const current = await getPaymentById(paymentId)

  const paymentItems = (Array.isArray(payload.payment_items) ? payload.payment_items : [])
    .filter((item) => String(item?.item_label || '').trim())
    .map((item, index) => ({
      item_key: String(item?.item_key || item?.key || `item_${index + 1}`).trim(),
      item_label: String(item?.item_label || item?.label || '-').trim(),
      due_amount: Number.isFinite(Number(item?.due_amount ?? item?.dueAmount)) ? Number(item?.due_amount ?? item?.dueAmount) : 0,
      paid_amount: Number.isFinite(Number(item?.paid_amount ?? item?.paidAmount)) ? Number(item?.paid_amount ?? item?.paidAmount) : 0,
    }))

  const nextPaidAt = payload.paid_at || new Date().toISOString()
  const updates = {
    house_id: payload.house_id || null,
    amount: Number(payload.amount || 0),
    payment_method: payload.payment_method || 'transfer',
    slip_url: payload.slip_url?.trim() || null,
    note: payload.note?.trim() || null,
    payer_type: payload.payer_type || null,
    payer_name: payload.payer_name?.trim() || null,
    payer_contact: payload.payer_contact?.trim() || null,
    payer_tax_id: payload.payer_tax_id?.trim() || null,
    payer_address: payload.payer_address?.trim() || null,
    partner_id: payload.partner_id || null,
    paid_at: nextPaidAt,
    verified_by: payload.verified_by || null,
    verified_at: payload.verified_at || null,
  }

  if (payload.receipt_no) {
    updates.receipt_no = String(payload.receipt_no).trim()
  } else if (current?.receipt_no) {
    updates.receipt_no = String(current.receipt_no).trim()
  } else {
    updates.receipt_no = await generateReceiptNo(nextPaidAt, { excludePaymentId: paymentId })
  }

  const { error: updateError } = await supabase
    .from('payments')
    .update(updates)
    .eq('id', paymentId)

  if (updateError) throw updateError

  const { error: deleteItemError } = await supabase
    .from('payment_items')
    .delete()
    .eq('payment_id', paymentId)

  if (deleteItemError) throw deleteItemError

  if (paymentItems.length > 0) {
    const itemRows = paymentItems.map((item) => ({
      payment_id: paymentId,
      fee_id: payload.fee_id || null,
      house_id: payload.house_id || null,
      item_key: item.item_key,
      item_label: item.item_label,
      due_amount: item.due_amount,
      paid_amount: item.paid_amount,
    }))

    const { error: insertItemError } = await supabase
      .from('payment_items')
      .insert(itemRows)

    if (insertItemError) throw insertItemError
  }

  const data = await getPaymentById(paymentId)

  if (data?.fee_id) {
    await refreshFeeStatusFromPayments(data.fee_id)
  }

  return data
}

export async function uploadPaymentSlip(file, { houseId, houseNo = null, paidAt = null, runningNo = 1 } = {}) {
  if (!file) throw new Error('ไม่พบไฟล์หลักฐานการชำระ')

  const compressedFile = await compressSlipImageToLimit(file, PAYMENT_SLIP_TARGET_BYTES)
  const folder = String(houseId || 'general').trim()
  const sequence = Number(runningNo) > 0
    ? Number(runningNo)
    : await resolveNextSlipRunningNo({ houseId, houseNo, paidAt })
  const fileName = buildResidentSlipFileName({ houseNo, paidAt, runningNo: sequence })
  const normalizedFile = new File([compressedFile], fileName, { type: 'image/jpeg' })
  const path = `payment-slips/${folder}/${normalizedFile.name}`

  const { error } = await supabase.storage
    .from(PAYMENT_SLIP_BUCKET)
    .upload(path, normalizedFile, { upsert: true, contentType: 'image/jpeg' })

  if (error) throw error

  const { data: publicUrlData } = supabase.storage
    .from(PAYMENT_SLIP_BUCKET)
    .getPublicUrl(path)

  return {
    path,
    url: publicUrlData?.publicUrl || '',
  }
}

export async function approvePayment(paymentId, approverId) {
  const verifiedAt = new Date().toISOString()

  const { data, error } = await supabase
    .from('payments')
    .update({ verified_by: approverId || null, verified_at: verifiedAt })
    .eq('id', paymentId)
    .select('id, fee_id, house_id, amount, payment_method, slip_url, paid_at, verified_by, verified_at, note, verified_profile:verified_by(full_name), fees(id, year, period, status, total_amount, due_date, invoice_date), houses(id, house_no, soi, owner_name), payment_items(id, item_key, item_label, due_amount, paid_amount, outstanding_amount)')
    .single()

  if (error) throw error

  if (data?.fee_id) {
    await refreshFeeStatusFromPayments(data.fee_id)
  }

  return data
}

export async function revokePaymentApproval(paymentId) {
  const { data, error } = await supabase
    .from('payments')
    .update({ verified_by: null, verified_at: null })
    .eq('id', paymentId)
    .select('id, fee_id, house_id, amount, payment_method, slip_url, paid_at, verified_by, verified_at, note, verified_profile:verified_by(full_name), fees(id, year, period, status, total_amount, due_date, invoice_date), houses(id, house_no, soi, owner_name), payment_items(id, item_key, item_label, due_amount, paid_amount, outstanding_amount)')
    .single()

  if (error) throw error

  if (data?.fee_id) {
    const { error: feeError } = await supabase
      .from('fees')
      .update({ status: 'unpaid' })
      .eq('id', data.fee_id)

    if (feeError) throw feeError
  }

  return data
}

export async function rejectPayment(paymentId, reason, approverId) {
  const normalizedReason = String(reason || '').trim()
  if (!normalizedReason) {
    throw new Error('กรุณาระบุเหตุผลการตีกลับ')
  }

  const { data: current, error: currentError } = await supabase
    .from('payments')
    .select('id, fee_id, note')
    .eq('id', paymentId)
    .single()

  if (currentError) throw currentError

  const originalNote = stripRejectMarker(current.note)
  const rejectNote = `${REJECT_PREFIX}${normalizedReason}${originalNote ? `\n${originalNote}` : ''}`

  const { data, error } = await supabase
    .from('payments')
    .update({ verified_by: approverId || null, verified_at: null, note: rejectNote })
    .eq('id', paymentId)
    .select('id, fee_id, house_id, amount, payment_method, slip_url, paid_at, verified_by, verified_at, note, verified_profile:verified_by(full_name), fees(id, year, period, status, total_amount, due_date, invoice_date), houses(id, house_no, soi, owner_name)')
    .single()

  if (error) throw error

  if (data?.fee_id) {
    const { error: feeError } = await supabase
      .from('fees')
      .update({ status: 'unpaid' })
      .eq('id', data.fee_id)

    if (feeError) throw feeError
  }

  return data
}

export function summarizeFees(fees, payments) {
  const totalInvoiced = fees.reduce((sum, fee) => sum + Number(fee.total_amount || 0), 0)
  const totalCollected = payments
    .filter((payment) => payment.verified_at)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const totalOutstanding = fees
    .filter((fee) => fee.status !== 'paid' && fee.status !== 'cancelled')
    .reduce((sum, fee) => sum + Number(fee.total_amount || 0), 0)

  return {
    totalInvoiced,
    totalCollected,
    totalOutstanding,
  }
}

function buildOverdueUpdatePayload(fee, setup, penaltyPolicy = { enabled: null, penaltyStartDate: null }) {
  const finePct = toAmount(setup?.overdue_fine_pct)
  const noticeFee = round2(toAmount(setup?.notice_fee))

  const now = new Date()
  const dueOver = fee?.due_date ? now > new Date(`${fee.due_date}T23:59:59`) : false
  let penaltyOver = dueOver

  if (penaltyPolicy?.enabled === false) {
    penaltyOver = false
  } else if (penaltyPolicy?.enabled === true && penaltyPolicy?.penaltyStartDate) {
    penaltyOver = now > new Date(`${penaltyPolicy.penaltyStartDate}T23:59:59`)
  }

  const carryBase = toAmount(fee?.fee_overdue_common)
  const currentBase = toAmount(fee?.fee_common)

  const overdueFineCarry = carryBase > 0 ? round2(carryBase * (finePct / 100)) : 0
  const overdueNoticeCarry = carryBase > 0 ? noticeFee : 0

  const overdueFineCurrent = penaltyOver && currentBase > 0 ? round2(currentBase * (finePct / 100)) : 0
  const overdueNoticeCurrent = penaltyOver && currentBase > 0 ? noticeFee : 0

  const hasAnyCharge = overdueFineCarry > 0 || overdueNoticeCarry > 0 || overdueFineCurrent > 0 || overdueNoticeCurrent > 0
  if (!hasAnyCharge) return null

  return {
    status: dueOver ? 'overdue' : fee?.status || 'unpaid',
    fee_overdue_fine: overdueFineCarry,
    fee_overdue_notice: overdueNoticeCarry,
    fee_fine: overdueFineCurrent,
    fee_notice: overdueNoticeCurrent,
  }
}