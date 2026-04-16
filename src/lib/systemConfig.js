import { supabase } from './supabase'

const SYSTEM_ASSET_BUCKET = 'system-assets'
const PUBLIC_SETUP_FIELDS = [
  'village_name',
  'village_logo_url',
  'village_logo_path',
  // new public exposure for the login-circle logo
  'login_circle_logo_url',
  'login_circle_logo_path',
  'juristic_name',
  'juristic_address',
  'bank_name',
  'bank_account_no',
  'bank_account_name',
]

const DEFAULT_SYSTEM_CONFIG = {
  village_name: 'The Greenfield',
  village_logo_url: '',
  village_logo_path: '',
  juristic_name: 'นิติบุคคลหมู่บ้านเดอะกรีนฟิลด์',
  juristic_address: '',
  juristic_phone: '02-123-4567',
  juristic_email: 'niti@greenfield.co.th',
  juristic_signature_url: '',
  juristic_signature_path: '',
  // login circle logo (separate from village_logo fields)
  login_circle_logo_url: '',
  login_circle_logo_path: '',
  bank_name: 'กสิกรไทย',
  bank_account_no: '',
  bank_account_name: 'นิติบุคคลหมู่บ้าน เดอะกรีนฟิลด์',
  fee_rate_per_sqw: 85,
  fee_periods_per_year: 2,
  fee_due_day: 31,
  waste_fee_per_period: 100,
  parking_fee_per_vehicle: 200,
  allow_exceed_parking_limit: true,
  early_pay_discount_pct: 3,
  overdue_fine_pct: 10,
  overdue_grace_days: 30,
  notice_fee: 200,
  invoice_message: 'กรุณาชำระภายในวันที่กำหนด หากพ้นกำหนดจะคิดค่าปรับ 10%',
  zone_count: 2,
  total_houses: 128,
  common_parking_slots: 30,
  max_active_users_per_house: 5,
  max_active_users_total: 1000,
  enable_marketplace: true,
  enable_technicians: true,
  date_format: 'DD/MM/YYYY (พ.ศ.)',
  system_language: 'ภาษาไทย',
}

function normalizeConfigRow(row) {
  if (!row) return { ...DEFAULT_SYSTEM_CONFIG }
  return {
    ...DEFAULT_SYSTEM_CONFIG,
    ...row,
  }
}

export async function getSystemConfig() {
  const { data, error } = await supabase
    .from('system_config')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  if (!data) {
    const { data: created, error: createError } = await supabase
      .from('system_config')
      .insert([DEFAULT_SYSTEM_CONFIG])
      .select('*')
      .single()

    if (createError) throw createError
    return created
  }

  return normalizeConfigRow(data)
}

export async function updateSystemConfig(configId, updates) {
  const { data: authData } = await supabase.auth.getUser()
  const incomingPayload = {
    ...updates,
    updated_by: authData?.user?.id || null,
  }

  // Fetch row first and keep only columns that really exist in this deployment schema.
  const { data: currentRow, error: currentError } = await supabase
    .from('system_config')
    .select('*')
    .eq('id', configId)
    .maybeSingle()

  if (currentError) throw currentError

  const allowedColumns = new Set(Object.keys(currentRow || {}))
  let payload = Object.entries(incomingPayload).reduce((acc, [key, value]) => {
    if (allowedColumns.has(key)) acc[key] = value
    return acc
  }, {})

  // If nothing is updatable for this schema, treat as no-op and return current data.
  if (Object.keys(payload).length === 0) {
    return normalizeConfigRow(currentRow)
  }

  let data = null
  let error = null

  // Some deployments have very old `system_config` schemas and can miss many columns.
  // Keep stripping unknown columns from the payload until the update succeeds.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await supabase
      .from('system_config')
      .update(payload)
      .eq('id', configId)
      .select('*')
      .single()

    data = result.data
    error = result.error

    if (!error) break

    const errorMessage = String(error?.message || '')
    const matches = [
      ...errorMessage.matchAll(/Could not find the '([^']+)' column/g),
      ...errorMessage.matchAll(/column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/g),
      ...errorMessage.matchAll(/'([a-zA-Z0-9_]+)'\s+column/gi),
    ]
    if (matches.length === 0) break

    let removedAny = false
    for (const match of matches) {
      const missingColumn = String(match?.[1] || '').trim()
      if (!missingColumn) continue
      if (Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
        delete payload[missingColumn]
        removedAny = true
      }
    }

    if (!removedAny) break
  }

  if (error) throw error
  return normalizeConfigRow(data)
}

export function extractSystemAssetPath(publicUrl) {
  const value = String(publicUrl || '').trim()
  if (!value) return ''
  const marker = `/storage/v1/object/public/${SYSTEM_ASSET_BUCKET}/`
  const index = value.indexOf(marker)
  if (index < 0) return ''
  return decodeURIComponent(value.slice(index + marker.length).split('?')[0])
}

export function buildSystemAssetPublicUrl(path, { cacheBust } = {}) {
  const target = String(path || '').trim()
  if (!target) return ''

  const { data } = supabase.storage
    .from(SYSTEM_ASSET_BUCKET)
    .getPublicUrl(target)

  const publicUrl = String(data?.publicUrl || '').trim()
  if (!publicUrl) return ''
  if (!cacheBust) return publicUrl
  const separator = publicUrl.includes('?') ? '&' : '?'
  return `${publicUrl}${separator}v=${encodeURIComponent(String(cacheBust))}`
}

export async function uploadJuristicSignature(file) {
  if (!file) return null
  const extension = String(file.name || 'png').split('.').pop()?.toLowerCase() || 'png'
  const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(extension) ? extension : 'png'
  const fileName = `signature_${Date.now()}.${safeExt}`
  const path = `juristic/${fileName}`

  const { error } = await supabase.storage
    .from(SYSTEM_ASSET_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/png' })

  if (error) throw error

  const { data: publicUrlData } = supabase.storage
    .from(SYSTEM_ASSET_BUCKET)
    .getPublicUrl(path)

  return {
    path,
    url: publicUrlData?.publicUrl || '',
  }
}

export async function uploadVillageLogo(file) {
  if (!file) return null
  // Fixed filename — always overwrite the same path regardless of input extension
  const FIXED_PATH = 'logo/vms_logo.png'

  const { error } = await supabase.storage
    .from(SYSTEM_ASSET_BUCKET)
    .upload(FIXED_PATH, file, { upsert: true, contentType: 'image/png' })

  if (error) throw error

  // Clean up any legacy filename variants
  const legacyPaths = [
    'logo/login-circle.png',
    'logo/login-circle.jpg',
    'logo/login-circle.jpeg',
    'logo/login-circle.webp',
  ]
  await supabase.storage.from(SYSTEM_ASSET_BUCKET).remove(legacyPaths).catch(() => null)

  return {
    path: FIXED_PATH,
    url: buildSystemAssetPublicUrl(FIXED_PATH, { cacheBust: Date.now() }),
  }
}

export async function deleteSystemAssetByPath(path) {
  const target = String(path || '').trim()
  if (!target) return true

  const { error } = await supabase.storage
    .from(SYSTEM_ASSET_BUCKET)
    .remove([target])

  if (error) throw error
  return true
}

function filterPayloadByColumns(payload, columns) {
  const allowedColumns = new Set(columns || [])
  return Object.entries(payload).reduce((acc, [key, value]) => {
    if (allowedColumns.has(key)) acc[key] = value
    return acc
  }, {})
}

export async function syncPublicSetupConfig(updates) {
  const incomingPayload = Object.entries(updates || {}).reduce((acc, [key, value]) => {
    if (PUBLIC_SETUP_FIELDS.includes(key)) acc[key] = value
    return acc
  }, {})

  if (Object.keys(incomingPayload).length === 0) return null

  try {
    const { data: currentRow, error: currentError } = await supabase
      .from('public_config')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (currentError) throw currentError

    if (!currentRow) {
      const { data: inserted, error: insertError } = await supabase
        .from('public_config')
        .insert([incomingPayload])
        .select('*')
        .maybeSingle()

      if (insertError) throw insertError
      return inserted || null
    }

    // If the public_config row exists but does not expose an `id` column
    // (common when `public_config` is a VIEW), avoid calling `.eq('id', ...)`
    // which would produce `id=eq.undefined` in the REST call. Instead,
    // short-circuit to persisting into `system_config` so the public view
    // reflects the change.
    if (!Object.prototype.hasOwnProperty.call(currentRow, 'id') || currentRow.id == null) {
      try {
        const sys = await getSystemConfig()
        if (sys && sys.id) {
          await updateSystemConfig(sys.id, incomingPayload)
          const refreshed = await getSystemConfig()
          return refreshed || currentRow
        }
      } catch (fallbackError) {
        console.warn('syncPublicSetupConfig early fallback to system_config failed:', fallbackError)
      }
      // Nothing else we can do here against the public view; return currentRow
      return currentRow
    }

    let payload = filterPayloadByColumns(incomingPayload, Object.keys(currentRow))
    if (Object.keys(payload).length === 0) return currentRow

    let data = null
    let error = null
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await supabase
        .from('public_config')
        .update(payload)
        .eq('id', currentRow.id)
        .select('*')
        .maybeSingle()

      data = result.data
      error = result.error

      if (!error) break

      const errorMessage = String(error?.message || '')

      // Special-case: some deployments expose `public_config` as a VIEW without
      // an `id` column. When we attempted `.eq('id', currentRow.id)` the
      // database can error with "column public_config.id does not exist".
      // Detect that and retry the update WITHOUT the `.eq(...)` filter.
      if (/public_config\.id\s+does not exist/i.test(errorMessage) || /column\s+"?public_config\.id"?\s+does not exist/i.test(errorMessage)) {
        try {
          const retry = await supabase
            .from('public_config')
            .update(payload)
            .select('*')
            .maybeSingle()

          data = retry.data
          error = retry.error
          if (!error) break
        } catch (retryErr) {
          // fall through to normal handling
          error = retryErr || error
        }
      }

      const matches = [
        ...errorMessage.matchAll(/Could not find the '([^']+)' column/g),
        ...errorMessage.matchAll(/column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/g),
        ...errorMessage.matchAll(/'([a-zA-Z0-9_]+)'\s+column/gi),
      ]
      if (matches.length === 0) break

      let removedAny = false
      for (const match of matches) {
        const missingColumn = String(match?.[1] || '').trim()
        if (!missingColumn) continue
        if (Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
          delete payload[missingColumn]
          removedAny = true
        }
      }

      if (!removedAny || Object.keys(payload).length === 0) break
    }

    if (error) throw error
    // If public_config update failed due to view constraints (no id / requires WHERE),
    // attempt to persist the incoming public setup into the canonical `system_config`
    // row so the public view will reflect the change.
    if (error) {
      const em = String(error?.message || '')
      const code = String(error?.code || '')
      const isViewError = /public_config\.id\s+does not exist/i.test(em) || /UPDATE requires a WHERE clause/i.test(em) || code === '21000' || code === '42703'
      if (isViewError) {
        try {
          const sys = await getSystemConfig()
          if (sys && sys.id) {
            await updateSystemConfig(sys.id, incomingPayload)
            const refreshed = await getSystemConfig()
            return refreshed || currentRow
          }
        } catch (fallbackError) {
          console.warn('syncPublicSetupConfig fallback to system_config failed:', fallbackError)
        }
      }
      throw error
    }
    return data || currentRow
  } catch (error) {
    console.warn('syncPublicSetupConfig fallback:', error)
    return null
  }
}
