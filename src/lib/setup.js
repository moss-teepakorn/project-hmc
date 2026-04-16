import { supabase } from './supabase'
import { buildSystemAssetPublicUrl } from './systemConfig'

const DEFAULT_SETUP = {
  villageName: 'The Greenfield',
  appLineMain: 'Village Management',
  appLineTail: 'System',
  version: 'v12.3',
  address: 'Gusto Suksawat 26 -1',
  juristicName: 'นิติบุคคลหมู่บ้านเดอะกรีนฟิลด์',
  juristicAddress: 'Gusto Suksawat 26 -1',
  loginCircleLogoUrl: '',
  villageLogoUrl: '',
  juristicSignatureUrl: '',
  bankName: '',
  bankAccountNo: '',
  bankAccountName: '',
  feeRatePerSqw: 0,
  invoiceMessage: `กรุณาชำระภายในวันที่กำหนด หากพ้นกำหนดจะคิดค่าปรับ 10%\nไม่รับชำระเงินเป็นเงินสดทุกกรณี คณะกรรมการจะไม่รับผิดชอบจากการชำระด้วยเงินสด\nขอให้ท่านส่งหลักฐานการชำระเงินเข้ามาที่ Line Official ID : @gusto.ssw26 หรือทำผ่านระบบ`,
}


function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

function resolveLogoPath(row) {
  return firstNonEmpty(
    row?.login_circle_logo_path,
    row?.village_logo_path,
    row?.login_logo_path,
    row?.logo_path,
    row?.assets?.login_circle_logo_path,
    row?.assets?.village_logo_path,
  )
}

function resolveLogoUrl(row, derivedLogoUrl, fromLocalLogo) {
  return firstNonEmpty(
    row?.login_circle_logo_url,
    row?.village_logo_url,
    row?.login_logo_url,
    row?.logo_url,
    row?.assets?.login_circle_logo_url,
    row?.assets?.village_logo_url,
    derivedLogoUrl,
    fromLocalLogo,
  )
}
let setupCache = null

function toSetup(row) {
  const villageName = row?.village_name?.trim() || DEFAULT_SETUP.villageName
  const juristicName = row?.juristic_name?.trim() || DEFAULT_SETUP.juristicName
  const juristicAddress = row?.juristic_address?.trim() || juristicName || DEFAULT_SETUP.juristicAddress
  const address = juristicAddress || DEFAULT_SETUP.address
  const fromLocalLogo = String(localStorage.getItem('vms-login-circle-logo-url') || '').trim()
  const logoPath = resolveLogoPath(row)
  const derivedLogoUrl = logoPath ? buildSystemAssetPublicUrl(logoPath) : ''
  const derivedSignatureUrl = row?.juristic_signature_path ? buildSystemAssetPublicUrl(row.juristic_signature_path) : ''
  const loginCircleLogoUrl = resolveLogoUrl(row, derivedLogoUrl, fromLocalLogo)
  const villageLogoUrl = firstNonEmpty(
    row?.village_logo_url,
    row?.login_circle_logo_url,
    row?.logo_url,
    derivedLogoUrl,
    loginCircleLogoUrl,
  )
  const juristicSignatureUrl = String(row?.juristic_signature_url || derivedSignatureUrl || '').trim()
  return {
    ...DEFAULT_SETUP,
    villageName,
    address,
    juristicName,
    juristicAddress,
    loginCircleLogoUrl,
    villageLogoUrl,
    juristicSignatureUrl,
    bankName: row?.bank_name?.trim() || DEFAULT_SETUP.bankName,
    bankAccountNo: row?.bank_account_no?.trim() || DEFAULT_SETUP.bankAccountNo,
    bankAccountName: row?.bank_account_name?.trim() || DEFAULT_SETUP.bankAccountName,
    feeRatePerSqw: Number(row?.fee_rate_per_sqw || DEFAULT_SETUP.feeRatePerSqw || 0),
    invoiceMessage: String(row?.invoice_message || DEFAULT_SETUP.invoiceMessage || '').trim() || DEFAULT_SETUP.invoiceMessage,
  }
}

export async function getSetupConfig({ forceRefresh = false } = {}) {
  if (!forceRefresh && setupCache) return setupCache

  const fromLocal = localStorage.getItem('vms-setup-village-name')
  const fromLocalLogo = localStorage.getItem('vms-login-circle-logo-url')

  try {
    const { data: systemData, error: systemError } = await supabase
      .from('system_config')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (!systemError && systemData) {
      setupCache = toSetup(systemData)
      localStorage.setItem('vms-setup-village-name', setupCache.villageName)
      if (setupCache.loginCircleLogoUrl) {
        localStorage.setItem('vms-login-circle-logo-url', setupCache.loginCircleLogoUrl)
      }
      return setupCache
    }

    const { data: publicData, error: publicError } = await supabase
      .from('public_config')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (!publicError && publicData) {
      setupCache = toSetup(publicData)
      localStorage.setItem('vms-setup-village-name', setupCache.villageName)
      if (setupCache.loginCircleLogoUrl) {
        localStorage.setItem('vms-login-circle-logo-url', setupCache.loginCircleLogoUrl)
      }
      return setupCache
    }
  } catch (error) {
    console.warn('getSetupConfig fallback:', error)
  }

  setupCache = {
    ...DEFAULT_SETUP,
    villageName: fromLocal || DEFAULT_SETUP.villageName,
    loginCircleLogoUrl: fromLocalLogo || DEFAULT_SETUP.loginCircleLogoUrl,
    villageLogoUrl: fromLocalLogo || DEFAULT_SETUP.villageLogoUrl,
  }
  return setupCache
}

export function buildDocumentTitle(villageName) {
  return `${villageName} — Village Management System`
}

export function applyDocumentTitle(villageName) {
  document.title = buildDocumentTitle(villageName)
}
