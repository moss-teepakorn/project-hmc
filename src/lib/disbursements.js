import { supabase } from './supabase'

export async function listDisbursements() {
  const { data, error } = await supabase
    .from('disbursements')
    .select(`
      id, recipient_type, recipient_name, partner_id, house_id, disbursement_date,
      payment_method, bank_name, bank_account_no, bank_account_name,
      sub_total, vat_enabled, vat_rate, vat_amount,
      wht_enabled, wht_rate, wht_amount, total_amount,
      status, approver_id, payer_id, approved_at, paid_at, note, created_at, updated_at,
      partners:partner_id(id, name, tax_id),
      houses:house_id(id, house_no, owner_name),
      approver:board_members!approver_id(id, member_no, full_name, position),
      payer:board_members!payer_id(id, member_no, full_name, position),
      disbursement_items(id, item_type_id, item_label, amount, note, sort_order)
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((d) => ({
    ...d,
    disbursement_items: (d.disbursement_items || []).sort((a, b) => a.sort_order - b.sort_order),
  }))
}

function buildRow(payload, items) {
  const subTotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const vatEnabled = !!payload.vat_enabled
  const whtEnabled = !!payload.wht_enabled
  const vatRate = Number(payload.vat_rate ?? 7)
  const whtRate = Number(payload.wht_rate ?? 3)
  const vatAmount = vatEnabled ? +Number(payload.vat_amount ?? (subTotal * vatRate / 100)).toFixed(2) : 0
  const whtAmount = whtEnabled ? +Number(payload.wht_amount ?? (subTotal * whtRate / 100)).toFixed(2) : 0
  const totalAmount = +Number(subTotal + vatAmount - whtAmount).toFixed(2)

  return {
    recipient_type: payload.recipient_type || 'partner',
    recipient_name: String(payload.recipient_name || '').trim() || null,
    partner_id: payload.partner_id || null,
    house_id: payload.house_id || null,
    disbursement_date: payload.disbursement_date,
    payment_method: payload.payment_method || 'transfer',
    bank_name: String(payload.bank_name || '').trim() || null,
    bank_account_no: String(payload.bank_account_no || '').trim() || null,
    bank_account_name: String(payload.bank_account_name || '').trim() || null,
    sub_total: subTotal,
    vat_enabled: vatEnabled,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    wht_enabled: whtEnabled,
    wht_rate: whtRate,
    wht_amount: whtAmount,
    total_amount: totalAmount,
    approver_id: payload.approver_id || null,
    payer_id: payload.payer_id || null,
    approved_at: payload.approved_at || null,
    paid_at: payload.paid_at || null,
    status: payload.status || 'pending',
    note: String(payload.note || '').trim() || null,
  }
}

export async function createDisbursement(payload = {}) {
  if (!payload.disbursement_date) throw new Error('กรุณาระบุวันที่จ่าย')
  const items = Array.isArray(payload.items) ? payload.items : []
  if (items.length === 0) throw new Error('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ')

  const row = { ...buildRow(payload, items), status: payload.status || 'pending' }

  const { data, error } = await supabase
    .from('disbursements')
    .insert([row])
    .select('id')
    .single()
  if (error) throw error

  const itemRows = items.map((item, idx) => ({
    disbursement_id: data.id,
    item_type_id: item.item_type_id || null,
    item_label: String(item.item_label || '').trim(),
    amount: Number(item.amount || 0),
    note: String(item.note || '').trim() || null,
    sort_order: idx,
  }))
  const { error: itemErr } = await supabase.from('disbursement_items').insert(itemRows)
  if (itemErr) throw itemErr

  return data
}

export async function updateDisbursement(id, payload = {}) {
  if (!id) throw new Error('ไม่พบรหัสรายการ')
  if (!payload.disbursement_date) throw new Error('กรุณาระบุวันที่จ่าย')
  const items = Array.isArray(payload.items) ? payload.items : []
  if (items.length === 0) throw new Error('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ')

  const patch = buildRow(payload, items)
  const { error } = await supabase.from('disbursements').update(patch).eq('id', id)
  if (error) throw error

  const { error: delErr } = await supabase.from('disbursement_items').delete().eq('disbursement_id', id)
  if (delErr) throw delErr

  const itemRows = items.map((item, idx) => ({
    disbursement_id: id,
    item_type_id: item.item_type_id || null,
    item_label: String(item.item_label || '').trim(),
    amount: Number(item.amount || 0),
    note: String(item.note || '').trim() || null,
    sort_order: idx,
  }))
  if (itemRows.length > 0) {
    const { error: itemErr } = await supabase.from('disbursement_items').insert(itemRows)
    if (itemErr) throw itemErr
  }

  return true
}

export async function submitDisbursement(id) {
  if (!id) throw new Error('ไม่พบรหัสรายการ')
  const { error } = await supabase
    .from('disbursements')
    .update({ status: 'pending' })
    .eq('id', id)
  if (error) throw error
  return true
}

export async function approveDisbursement(id, approverId, approvedAt) {
  if (!id) throw new Error('ไม่พบรหัสรายการ')
  if (!approverId) throw new Error('กรุณาเลือกผู้อนุมัติ')
  const { error } = await supabase
    .from('disbursements')
    .update({
      status: 'approved',
      approver_id: approverId,
      approved_at: approvedAt || new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
  return true
}

export async function markPaidDisbursement(id, payerId, paidAt) {
  if (!id) throw new Error('ไม่พบรหัสรายการ')
  if (!payerId) throw new Error('กรุณาเลือกผู้จ่ายเงิน')
  const { error } = await supabase
    .from('disbursements')
    .update({
      status: 'paid',
      payer_id: payerId,
      paid_at: paidAt || new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
  return true
}

export async function deleteDisbursement(id) {
  if (!id) throw new Error('ไม่พบรหัสรายการ')
  const { error } = await supabase.from('disbursements').delete().eq('id', id)
  if (error) throw error
  return true
}
