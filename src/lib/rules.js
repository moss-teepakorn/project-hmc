import { supabase } from './supabase'

const RULE_FILE_BUCKET = 'system-assets'
const MAX_RULE_FILE_BYTES = 5 * 1024 * 1024
const RULE_MANIFEST_PATH = 'rules/rule-documents.json'

const CATEGORY_LABELS = {
  village: 'กฎระเบียบหมู่บ้าน',
  living: 'ระเบียบการอยู่อาศัย',
}

function normalizeCategory(category) {
  return category === 'living' ? 'living' : 'village'
}

function normalizeTopicNo(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.floor(n)
}

function normalizeRuleItem(item) {
  const category = normalizeCategory(item?.category)
  return {
    id: String(item?.id || '').trim(),
    category,
    category_label: CATEGORY_LABELS[category],
    topic_no: normalizeTopicNo(item?.topic_no),
    title: String(item?.title || '').trim() || '-',
    description: String(item?.description || '').trim(),
    pdf_url: String(item?.pdf_url || '').trim(),
    pdf_path: String(item?.pdf_path || '').trim(),
    created_at: item?.created_at || new Date().toISOString(),
    updated_at: item?.updated_at || item?.created_at || new Date().toISOString(),
  }
}

function ruleSort(a, b) {
  if (a.category !== b.category) return a.category.localeCompare(b.category)
  if (a.topic_no !== b.topic_no) return a.topic_no - b.topic_no
  return String(a.created_at || '').localeCompare(String(b.created_at || ''))
}

async function readRuleManifest() {
  const { data } = supabase.storage
    .from(RULE_FILE_BUCKET)
    .getPublicUrl(RULE_MANIFEST_PATH)

  const url = data?.publicUrl
  if (!url) return { items: [] }

  try {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return { items: [] }
    const json = await response.json()
    const items = Array.isArray(json?.items) ? json.items.map(normalizeRuleItem).filter((item) => item.id) : []
    return { items }
  } catch {
    return { items: [] }
  }
}

async function writeRuleManifest(items) {
  const normalized = (Array.isArray(items) ? items : [])
    .map(normalizeRuleItem)
    .filter((item) => item.id)
    .sort(ruleSort)
  const payload = {
    version: 1,
    updated_at: new Date().toISOString(),
    items: normalized,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const { error } = await supabase.storage
    .from(RULE_FILE_BUCKET)
    .upload(RULE_MANIFEST_PATH, blob, { upsert: true, contentType: 'application/json' })

  if (error) throw error
  return normalized
}

function nextTopicNoForCategory(items, category) {
  const safeCategory = normalizeCategory(category)
  let maxTopic = 0
  for (const item of items || []) {
    if (item.category !== safeCategory) continue
    if (item.topic_no > maxTopic) maxTopic = item.topic_no
  }
  return maxTopic + 1
}

function makeRuleId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fallback below
  }
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function listRuleDocuments({ category = 'all', search = '' } = {}) {
  const { items } = await readRuleManifest()

  const keyword = String(search || '').trim().toLowerCase()
  return items
    .filter((item) => {
      if (category !== 'all' && item.category !== normalizeCategory(category)) return false
      if (!keyword) return true
      const haystack = [item.title, item.description, item.category_label, `เรื่องที่ ${item.topic_no}`].join(' ').toLowerCase()
      return haystack.includes(keyword)
    })
    .sort(ruleSort)
}

export async function createRuleDocument(payload) {
  const { items } = await readRuleManifest()
  const category = normalizeCategory(payload.category)
  const requestedTopicNo = normalizeTopicNo(payload.topic_no)
  const topicNo = requestedTopicNo > 0 ? requestedTopicNo : nextTopicNoForCategory(items, category)

  const created = normalizeRuleItem({
    id: makeRuleId(),
    category,
    topic_no: topicNo,
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    pdf_url: String(payload.pdf_url || '').trim(),
    pdf_path: String(payload.pdf_path || '').trim(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  const nextItems = [...items.filter((item) => item.id !== created.id), created]
  await writeRuleManifest(nextItems)
  return created
}

export async function updateRuleDocument(id, payload) {
  const targetId = String(id || '').trim()
  if (!targetId) throw new Error('ไม่พบข้อมูลกฎระเบียบที่ต้องการแก้ไข')

  const { items } = await readRuleManifest()
  const index = items.findIndex((item) => item.id === targetId)
  if (index < 0) throw new Error('ไม่พบข้อมูลกฎระเบียบที่ต้องการแก้ไข')

  const current = items[index]
  const updated = normalizeRuleItem({
    ...current,
    category: payload.category != null ? normalizeCategory(payload.category) : current.category,
    topic_no: payload.topic_no != null ? normalizeTopicNo(payload.topic_no) : current.topic_no,
    title: payload.title != null ? String(payload.title).trim() : current.title,
    description: payload.description != null ? String(payload.description).trim() : current.description,
    pdf_url: payload.pdf_url != null ? String(payload.pdf_url).trim() : current.pdf_url,
    pdf_path: payload.pdf_path != null ? String(payload.pdf_path).trim() : current.pdf_path,
    updated_at: new Date().toISOString(),
  })

  const nextItems = [...items]
  nextItems[index] = updated
  await writeRuleManifest(nextItems)
  return updated
}

export async function deleteRuleDocument(id) {
  const targetId = String(id || '').trim()
  if (!targetId) return true

  const { items } = await readRuleManifest()
  const nextItems = items.filter((item) => item.id !== targetId)
  await writeRuleManifest(nextItems)
  return true
}

export async function uploadRulePdf(file, { category = 'village' } = {}) {
  if (!file) return null

  const fileName = String(file.name || '').toLowerCase()
  const mimeType = String(file.type || '').toLowerCase()
  const isPdf = mimeType === 'application/pdf' || fileName.endsWith('.pdf')
  if (!isPdf) throw new Error('รองรับเฉพาะไฟล์ PDF เท่านั้น')
  if (file.size > MAX_RULE_FILE_BYTES) throw new Error('ไฟล์มีขนาดเกิน 5MB')

  const safeCategory = category === 'living' ? 'living' : 'village'
  const ts = Date.now()
  const path = `rules/${safeCategory}/RULE_${ts}_${Math.random().toString(36).slice(2, 8)}.pdf`

  const { error } = await supabase.storage
    .from(RULE_FILE_BUCKET)
    .upload(path, file, { upsert: true, contentType: 'application/pdf' })

  if (error) throw error

  const { data: publicUrlData } = supabase.storage
    .from(RULE_FILE_BUCKET)
    .getPublicUrl(path)

  return {
    path,
    url: publicUrlData?.publicUrl || '',
  }
}

export async function deleteRulePdfByPath(path) {
  const target = String(path || '').trim()
  if (!target) return true

  const { error } = await supabase.storage
    .from(RULE_FILE_BUCKET)
    .remove([target])

  if (error) throw error
  return true
}
