import React, { useEffect, useState } from 'react'
import Swal from 'sweetalert2'
import {
  buildSystemAssetPublicUrl,
  deleteSystemAssetByPath,
  extractSystemAssetPath,
  getSystemConfig,
  syncPublicSetupConfig,
  updateSystemConfig,
  uploadVillageLogo,
  uploadJuristicSignature,
} from '../../lib/systemConfig'
import './AdminConfig.css'

const NUMBER_FIELDS = [
  'fee_rate_per_sqw',
  'fee_periods_per_year',
  'fee_due_day',
  'waste_fee_per_period',
  'parking_fee_per_vehicle',
  'early_pay_discount_pct',
  'overdue_fine_pct',
  'overdue_grace_days',
  'notice_fee',
  'zone_count',
  'total_houses',
  'common_parking_slots',
  'max_active_users_per_house',
  'max_active_users_total',
]

const MAX_LOGIN_LOGO_BYTES = 50 * 1024

function getDailyFallbackAdminPassword() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = String(now.getFullYear())
  return `${dd}${mm}${yyyy}`
}

async function requestSpecialAdminCredential() {
  const { isConfirmed, value } = await Swal.fire({
    title: 'ยืนยันสิทธิ์แก้ไข Limit รวมผู้ใช้งาน',
    html: `
      <div style="display:grid;gap:8px;text-align:left">
        <div style="font-size:12px;color:#64748b">ต้องใช้บัญชีพิเศษเท่านั้น (username: admin)</div>
        <input id="special-admin-username" class="swal2-input" placeholder="username" style="margin:0" />
        <input id="special-admin-password" type="password" class="swal2-input" placeholder="password" style="margin:0" />
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'ยืนยัน',
    cancelButtonText: 'ยกเลิก',
    preConfirm: () => {
      const username = String(document.getElementById('special-admin-username')?.value || '').trim().toLowerCase()
      const password = String(document.getElementById('special-admin-password')?.value || '').trim()
      if (!username || !password) {
        Swal.showValidationMessage('กรุณากรอก username และ password')
        return false
      }
      if (username !== 'admin' || password !== getDailyFallbackAdminPassword()) {
        Swal.showValidationMessage('สิทธิ์ไม่ถูกต้องสำหรับการแก้ไข limit รวม')
        return false
      }
      return { username }
    },
  })

  return isConfirmed ? value : null
}

async function readImageFromFile(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = dataUrl
  })
}

async function compressImageToMaxBytes(file, maxBytes) {
  if (!file || file.size <= maxBytes) return file
  const image = await readImageFromFile(file)

  let width = image.width
  let height = image.height
  let quality = 0.9
  let blob = null

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return file

  for (let attempt = 0; attempt < 14; attempt += 1) {
    canvas.width = Math.max(120, Math.round(width))
    canvas.height = Math.max(120, Math.round(height))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) break
    if (blob.size <= maxBytes) {
      return new File([blob], `login-logo-${Date.now()}.jpg`, { type: 'image/jpeg' })
    }

    if (quality > 0.45) {
      quality -= 0.08
    } else {
      width *= 0.88
      height *= 0.88
    }
  }

  if (blob) {
    return new File([blob], `login-logo-${Date.now()}.jpg`, { type: 'image/jpeg' })
  }
  return file
}

const AdminConfig = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [configId, setConfigId] = useState('')
  const [form, setForm] = useState({})
  const [originalForm, setOriginalForm] = useState({})
  const [signatureFile, setSignatureFile] = useState(null)
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState('')
  const [removeSignature, setRemoveSignature] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('')
  const [removeLogo, setRemoveLogo] = useState(false)
  const [autoCleanedJuristicLogo, setAutoCleanedJuristicLogo] = useState(false)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true)
        const config = await getSystemConfig()
        setConfigId(config.id)
        setSignatureFile(null)
        setLogoFile(null)
        setRemoveSignature(false)
        setRemoveLogo(false)
        setSignaturePreviewUrl(config.juristic_signature_url || '')

        // Prefer the explicit login-circle fields, fallback to village_logo
        const loginLogoUrl = config.login_circle_logo_url || config.village_logo_url || ''
        const loginLogoPath = config.login_circle_logo_path || config.village_logo_path || extractSystemAssetPath(loginLogoUrl)
        const isJuristicLogo = loginLogoPath.includes('juristic/')

        if (isJuristicLogo && loginLogoPath) {
          // Auto-delete old juristic file
          try {
            await deleteSystemAssetByPath(loginLogoPath)
          } catch (deleteError) {
            console.warn('Could not delete old juristic logo:', deleteError)
          }
          
          // Clear the fields
          const cleanedConfig = { ...config, village_logo_url: null, village_logo_path: null, login_circle_logo_url: null, login_circle_logo_path: null }
          setForm(cleanedConfig)
          setOriginalForm(cleanedConfig)
          setLogoPreviewUrl('')
          setAutoCleanedJuristicLogo(true)

          // Auto-save cleanup
          try {
            await updateSystemConfig(config.id, { village_logo_url: null, village_logo_path: null, login_circle_logo_url: null, login_circle_logo_path: null })
          } catch (updateError) {
            console.warn('Could not update config to clear juristic logo:', updateError)
          }
        } else {
          setForm(config)
          setOriginalForm(config)
          setLogoPreviewUrl(loginLogoUrl || localStorage.getItem('vms-login-circle-logo-url') || '')
          setAutoCleanedJuristicLogo(false)
        }
      } catch (error) {
        await Swal.fire({ icon: 'error', title: 'โหลดค่าระบบไม่สำเร็จ', text: error.message })
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
  }, [])

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    if (NUMBER_FIELDS.includes(name)) {
      setForm((prev) => ({ ...prev, [name]: value }))
      return
    }

    if (type === 'checkbox') {
      setForm((prev) => ({ ...prev, [name]: checked }))
      return
    }

    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSignatureFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowed.includes(file.type)) {
      Swal.fire({ icon: 'warning', title: 'ไฟล์ไม่รองรับ', text: 'กรุณาอัปโหลดไฟล์ PNG/JPG/WEBP' })
      return
    }

    if (signaturePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(signaturePreviewUrl)
    }

    setSignatureFile(file)
    setRemoveSignature(false)
    setSignaturePreviewUrl(URL.createObjectURL(file))
  }

  const handleLogoFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowed.includes(file.type)) {
      Swal.fire({ icon: 'warning', title: 'ไฟล์ไม่รองรับ', text: 'กรุณาอัปโหลดไฟล์ PNG/JPG/WEBP' })
      return
    }

    if (logoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreviewUrl)
    }

    const compressedFile = await compressImageToMaxBytes(file, MAX_LOGIN_LOGO_BYTES)
    if (compressedFile.size > MAX_LOGIN_LOGO_BYTES) {
      await Swal.fire({ icon: 'warning', title: 'ไฟล์ยังใหญ่เกินไป', text: 'กรุณาใช้รูปที่เล็กลงให้ไม่เกิน 50KB' })
      return
    }

    setLogoFile(compressedFile)
    setRemoveLogo(false)
    setLogoPreviewUrl(URL.createObjectURL(compressedFile))
  }

  const handleRemoveSignature = () => {
    if (signaturePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(signaturePreviewUrl)
    }
    setSignatureFile(null)
    setSignaturePreviewUrl('')
    setRemoveSignature(true)
  }

  const handleRemoveLogo = () => {
    if (logoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreviewUrl)
    }
    setLogoFile(null)
    setLogoPreviewUrl('')
    setRemoveLogo(true)
  }

  const handleSave = async () => {
    if (!configId) return

    let uploadedLogo = null
    let uploadedSignature = null

    try {
      setSaving(true)

      const nextTotalLimit = Number(form.max_active_users_total || 0)
      const previousTotalLimit = Number(originalForm.max_active_users_total || 0)
      const totalLimitChanged = Number.isFinite(nextTotalLimit) && Number.isFinite(previousTotalLimit) && nextTotalLimit !== previousTotalLimit
      if (totalLimitChanged) {
        const authenticated = await requestSpecialAdminCredential()
        if (!authenticated) {
          setSaving(false)
          return
        }
      }

      const payload = { ...form }
      NUMBER_FIELDS.forEach((field) => {
        payload[field] = Number(payload[field] || 0)
      })

      if (!Object.prototype.hasOwnProperty.call(form, 'village_logo_url')) {
        payload.village_logo_url = null
      }
      if (!Object.prototype.hasOwnProperty.call(form, 'village_logo_path')) {
        payload.village_logo_path = null
      }
      // Ensure login-circle fields exist in payload for newer schema
      if (!Object.prototype.hasOwnProperty.call(form, 'login_circle_logo_url')) {
        payload.login_circle_logo_url = null
      }
      if (!Object.prototype.hasOwnProperty.call(form, 'login_circle_logo_path')) {
        payload.login_circle_logo_path = null
      }

      const previousSignaturePath = form.juristic_signature_path || extractSystemAssetPath(form.juristic_signature_url)

      if (removeSignature) {
        payload.juristic_signature_url = null
        payload.juristic_signature_path = null
      }

      const previousLogoPath = form.login_circle_logo_path || form.village_logo_path || extractSystemAssetPath(form.login_circle_logo_url || form.village_logo_url)
      const isJuristicPath = previousLogoPath.includes('juristic/')

      // Auto-clean if logo path is from juristic
      const shouldRemoveLogo = removeLogo || isJuristicPath

      if (shouldRemoveLogo) {
        payload.village_logo_url = null
        payload.village_logo_path = null
        payload.login_circle_logo_url = null
        payload.login_circle_logo_path = null
      }

      if (logoFile) {
        uploadedLogo = await uploadVillageLogo(logoFile)
        payload.village_logo_url = uploadedLogo?.url || null
        payload.village_logo_path = uploadedLogo?.path || null
        // also store separately as login circle logo
        payload.login_circle_logo_url = uploadedLogo?.url || null
        payload.login_circle_logo_path = uploadedLogo?.path || null
      }

      if (signatureFile) {
        uploadedSignature = await uploadJuristicSignature(signatureFile)
        payload.juristic_signature_url = uploadedSignature?.url || null
        payload.juristic_signature_path = uploadedSignature?.path || null
      }

      const updated = await updateSystemConfig(configId, payload)

      const nextLogoPath = updated.login_circle_logo_path || updated.village_logo_path || payload.login_circle_logo_path || payload.village_logo_path || ''
      const nextLogoUrl = updated.login_circle_logo_url || updated.village_logo_url || payload.login_circle_logo_url || payload.village_logo_url || buildSystemAssetPublicUrl(nextLogoPath, { cacheBust: Date.now() }) || ''
      const nextPublicSetup = {
        village_name: updated.village_name || payload.village_name || '',
        village_logo_url: nextLogoUrl || null,
        village_logo_path: nextLogoPath || null,
        login_circle_logo_url: nextLogoUrl || null,
        login_circle_logo_path: nextLogoPath || null,
        juristic_name: updated.juristic_name || payload.juristic_name || '',
        juristic_address: updated.juristic_address || payload.juristic_address || '',
        bank_name: updated.bank_name || payload.bank_name || '',
        bank_account_no: updated.bank_account_no || payload.bank_account_no || '',
        bank_account_name: updated.bank_account_name || payload.bank_account_name || '',
      }

      await syncPublicSetupConfig(nextPublicSetup)

      if ((shouldRemoveLogo || logoFile) && previousLogoPath && previousLogoPath !== uploadedLogo?.path) {
        await deleteSystemAssetByPath(previousLogoPath)
      }
      if ((removeSignature || signatureFile) && previousSignaturePath && previousSignaturePath !== uploadedSignature?.path) {
        await deleteSystemAssetByPath(previousSignaturePath)
      }

      setForm(updated)
      setOriginalForm(updated)
      setSignatureFile(null)
      setLogoFile(null)
      setRemoveSignature(false)
      setRemoveLogo(false)
      if (signaturePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(signaturePreviewUrl)
      }
      if (logoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreviewUrl)
      }
      setSignaturePreviewUrl(updated.juristic_signature_url || '')
      setLogoPreviewUrl(nextLogoUrl)
      if (nextLogoUrl) {
        localStorage.setItem('vms-login-circle-logo-url', nextLogoUrl)
        localStorage.setItem('vms-login-circle-logo-path', nextLogoPath)
      } else {
        localStorage.removeItem('vms-login-circle-logo-url')
        localStorage.removeItem('vms-login-circle-logo-path')
      }
      await Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1200, showConfirmButton: false })
    } catch (error) {
      if (uploadedLogo?.path) {
        await deleteSystemAssetByPath(uploadedLogo.path).catch(() => {})
      }
      if (uploadedSignature?.path) {
        await deleteSystemAssetByPath(uploadedSignature.path).catch(() => {})
      }
      await Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pane on houses-compact cfg-modern">
      <div className="ph">
        <div className="ph-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="ph-ico">⚙️</div>
            <div>
              <div className="ph-h1">Config ระบบ</div>
              <div className="ph-sub">ตั้งค่าหลักของโครงการและการคำนวณ</div>
            </div>
          </div>
        </div>
      </div>

      <div className="cfg-wrap">
        {loading ? (
          <div className="card"><div className="cb" style={{ color: 'var(--mu)' }}>กำลังโหลดข้อมูล...</div></div>
        ) : (
          <>
            <section className="card cfg-section-card">
              <div className="ch"><div className="ct">ข้อมูลหมู่บ้าน</div></div>
              <div className="cb cfg-section-body cfg-grid cfg-grid-2">
                <label className="cfg-field">
                  <span>ชื่อหมู่บ้าน</span>
                  <input name="village_name" placeholder="กรอกชื่อหมู่บ้าน" value={form.village_name || ''} onChange={handleChange} />
                </label>
                <label className="cfg-field">
                  <span>ชื่อนิติบุคคล</span>
                  <input name="juristic_name" placeholder="กรอกชื่อนิติบุคคล" value={form.juristic_name || ''} onChange={handleChange} />
                </label>
                <label className="cfg-field cfg-span-full">
                  <span>ที่อยู่นิติบุคคล</span>
                  <textarea name="juristic_address" rows="2" placeholder="กรอกที่อยู่เต็มของนิติบุคคล" value={form.juristic_address || ''} onChange={handleChange} />
                </label>
              </div>
            </section>

            <section className="card cfg-section-card">
              <div className="ch"><div className="ct">ข้อมูลติดต่อ</div></div>
              <div className="cb cfg-section-body cfg-grid cfg-grid-2">
                <label className="cfg-field">
                  <span>โทรนิติบุคคล</span>
                  <input name="juristic_phone" placeholder="ตัวอย่าง: 081-xxx-xxxx" value={form.juristic_phone || ''} onChange={handleChange} />
                </label>
                <label className="cfg-field">
                  <span>อีเมลนิติบุคคล</span>
                  <input name="juristic_email" placeholder="example@village.com" value={form.juristic_email || ''} onChange={handleChange} />
                </label>
              </div>
            </section>

            <section className="card cfg-section-card">
              <div className="ch"><div className="ct">โลโก้และลายเซ็น</div></div>
              <div className="cb cfg-section-body cfg-grid cfg-grid-2">
                <div className="cfg-upload-box">
                  <div className="cfg-upload-title">โลโก้ระบบ</div>
                  <div className="cfg-upload-hint">PNG/JPG/WEBP ขนาดไม่เกิน 50KB</div>
                  <label className="cfg-upload-btn">
                    อัปโหลดโลโก้
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoFile} />
                  </label>
                  <div className="cfg-preview-row">
                    {logoPreviewUrl ? (
                      <>
                        <div className="cfg-logo-preview"><img src={logoPreviewUrl} alt="login-logo" /></div>
                        <button type="button" className="btn btn-g btn-xs" onClick={handleRemoveLogo}>ลบรูป</button>
                      </>
                    ) : <div className="cfg-empty">ยังไม่มีโลโก้</div>}
                  </div>
                </div>

                <div className="cfg-upload-box">
                  <div className="cfg-upload-title">ลายเซ็นนิติบุคคล</div>
                  <div className="cfg-upload-hint">ใช้แบบอัปโหลดไฟล์เท่านั้น</div>
                  <label className="cfg-upload-btn">
                    อัปโหลดลายเซ็น
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleSignatureFile} />
                  </label>
                  <div className="cfg-preview-row">
                    {signaturePreviewUrl ? (
                      <>
                        <div className="cfg-sign-preview"><img src={signaturePreviewUrl} alt="juristic-signature" /></div>
                        <button type="button" className="btn btn-g btn-xs" onClick={handleRemoveSignature}>ลบรูป</button>
                      </>
                    ) : <div className="cfg-empty">ยังไม่มีลายเซ็น</div>}
                  </div>
                </div>
              </div>
            </section>

            <section className="card cfg-section-card">
              <div className="ch"><div className="ct">ข้อมูลธนาคาร</div></div>
              <div className="cb cfg-section-body cfg-grid cfg-grid-3">
                <label className="cfg-field">
                  <span>ธนาคาร</span>
                  <input name="bank_name" placeholder="เช่น กสิกรไทย" value={form.bank_name || ''} onChange={handleChange} />
                </label>
                <label className="cfg-field">
                  <span>เลขบัญชี</span>
                  <input name="bank_account_no" placeholder="กรอกเลขบัญชี" value={form.bank_account_no || ''} onChange={handleChange} />
                </label>
                <label className="cfg-field">
                  <span>ชื่อบัญชี</span>
                  <input name="bank_account_name" placeholder="ชื่อนิติบุคคลหรือชื่อบัญชี" value={form.bank_account_name || ''} onChange={handleChange} />
                </label>
              </div>
            </section>

            <section className="card cfg-section-card">
              <div className="ch"><div className="ct">การตั้งค่าค่าบริการ</div></div>
              <div className="cb cfg-section-body cfg-grid cfg-grid-3">
                <label className="cfg-field"><span>อัตราค่าส่วนกลาง/ตร.ว.</span><input type="number" name="fee_rate_per_sqw" value={form.fee_rate_per_sqw ?? ''} onChange={handleChange} /></label>
                <label className="cfg-field"><span>ค่าขยะ/รอบ</span><input type="number" name="waste_fee_per_period" value={form.waste_fee_per_period ?? ''} onChange={handleChange} /></label>
                <label className="cfg-field"><span>ค่าจอด/คัน</span><input type="number" name="parking_fee_per_vehicle" value={form.parking_fee_per_vehicle ?? ''} onChange={handleChange} /></label>
                <label className="cfg-field"><span>ค่าทวงถาม</span><input type="number" name="notice_fee" value={form.notice_fee ?? ''} onChange={handleChange} /></label>
              </div>
            </section>

            <section className="card cfg-section-card">
              <div className="ch"><div className="ct">เงื่อนไขและระบบ</div></div>
              <div className="cb cfg-section-body cfg-grid cfg-grid-3">
                <label className="cfg-field"><span>ส่วนลดจ่ายเร็ว (%)</span><input type="number" name="early_pay_discount_pct" value={form.early_pay_discount_pct ?? ''} onChange={handleChange} /></label>
                <label className="cfg-field"><span>ค่าปรับค้างชำระ (%)</span><input type="number" name="overdue_fine_pct" value={form.overdue_fine_pct ?? ''} onChange={handleChange} /></label>
                <label className="cfg-field cfg-span-full"><span>ข้อความท้ายใบแจ้งหนี้</span><textarea name="invoice_message" rows="2" placeholder="ข้อความแสดงท้ายใบแจ้งหนี้" value={form.invoice_message || ''} onChange={handleChange} /></label>
                <label className="cfg-field"><span>รูปแบบวันที่</span><input name="date_format" placeholder="เช่น DD/MM/YYYY (พ.ศ.)" value={form.date_format || ''} onChange={handleChange} /></label>
                <label className="cfg-field"><span>ภาษา</span><input name="system_language" placeholder="เช่น ภาษาไทย" value={form.system_language || ''} onChange={handleChange} /></label>
                <label className="cfg-field"><span>จำนวนผู้ใช้ active ต่อบ้าน (Limit)</span><input type="number" min="1" name="max_active_users_per_house" value={form.max_active_users_per_house ?? ''} onChange={handleChange} /></label>
                <label className="cfg-field"><span>จำนวนผู้ใช้ active รวมทั้งหมด (Limit)</span><input type="number" min="1" name="max_active_users_total" value={form.max_active_users_total ?? ''} onChange={handleChange} /></label>
                <div className="cfg-field cfg-span-full cfg-toggles">
                  <label className="cfg-toggle"><input className="cfg-checkbox" type="checkbox" name="allow_exceed_parking_limit" checked={Boolean(form.allow_exceed_parking_limit)} onChange={handleChange} /><span>อนุญาตเพิ่มรถเกินสิทธิ์จอด</span></label>
                  <label className="cfg-toggle"><input className="cfg-checkbox" type="checkbox" name="enable_marketplace" checked={Boolean(form.enable_marketplace)} onChange={handleChange} /><span>เปิด Marketplace</span></label>
                  <label className="cfg-toggle"><input className="cfg-checkbox" type="checkbox" name="enable_technicians" checked={Boolean(form.enable_technicians)} onChange={handleChange} /><span>เปิดทำเนียบช่าง</span></label>
                </div>
              </div>
            </section>

            <section className="card cfg-section-card">
              <div className="ch"><div className="ct">โซน/เฟส</div></div>
              <div className="cb cfg-section-body cfg-grid cfg-grid-3">
                <label className="cfg-field"><span>จำนวนโซน</span><input type="number" name="zone_count" value={form.zone_count ?? ''} onChange={handleChange} /></label>
                <label className="cfg-field"><span>จำนวนบ้านทั้งหมด</span><input type="number" name="total_houses" value={form.total_houses ?? ''} onChange={handleChange} /></label>
                <label className="cfg-field"><span>ที่จอดส่วนกลาง</span><input type="number" name="common_parking_slots" value={form.common_parking_slots ?? ''} onChange={handleChange} /></label>
              </div>
            </section>

            <div className="cfg-sticky-actions">
              <button className="btn btn-p cfg-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AdminConfig
