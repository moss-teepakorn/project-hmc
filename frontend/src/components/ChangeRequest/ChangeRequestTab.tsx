import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { Card, Btn, Badge, Modal, FormRow, Input, Select, Textarea, ConfirmModal, C, TH, TD } from '../Common';
import { fmtDate, fmtMoney, PROCESS_STATUS_STYLE, todayISO } from '../../utils';
import type { ChangeRequest, CRItem } from '../../types';

const STATUSES = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Implemented', 'Close'] as const;

interface Props { projectId: string; }

type CRWithItems = ChangeRequest & { items: CRItem[] };

export default function ChangeRequestTab({ projectId }: Props) {
  const { changeRequests, members, fetchCRs, fetchMembers, createCR, updateCR, deleteCR } = useStore();
  const [modal, setModal]       = useState<Partial<CRWithItems> | null>(null);
  const [deleting, setDeleting] = useState<CRWithItems | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    fetchCRs(projectId);
    fetchMembers(projectId);
  }, [projectId]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggle = (id: string) => setExpanded(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const totalMD    = changeRequests.reduce((s, c) => s + (c.totalManday || 0), 0);
  const totalDisc  = changeRequests.reduce((s, c) => s + (c.discount || 0), 0);
  const openCount  = changeRequests.filter(c => c.status === 'Submitted' || c.status === 'Under Review').length;

  const handleSave = async (form: Partial<CRWithItems>) => {
    try {
      if (form.id) { await updateCR(form.id, { ...form, projectId }); toast.success('CR updated'); }
      else         { await createCR({ ...form, projectId }); toast.success('CR created'); }
      setModal(null);
    } catch { toast.error('Failed to save CR'); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await deleteCR(deleting.id); toast.success('Deleted'); }
    catch { toast.error('Failed to delete'); }
    setDeleting(null);
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Total CRs',       value: changeRequests.length, color: C.primary, bg: C.primaryBg, icon: '📝' },
          { label: 'Total Manday',    value: `${totalMD} MD`,       color: C.amber,   bg: C.amberBg,   icon: '⚡' },
          { label: 'Open / Pending',  value: openCount,              color: openCount > 0 ? C.red : C.green, bg: openCount > 0 ? C.redBg : C.greenBg, icon: '🔄' },
        ].map(s => (
          <Card key={s.label} style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Btn onClick={() => setModal({})} small><Plus size={14} /> Add CR</Btn>
      </div>

      {changeRequests.length === 0 && (
        <Card style={{ padding: 40, textAlign: 'center', color: C.text3 }}>No change requests yet.</Card>
      )}

      {changeRequests.map((cr, i) => {
        const ss  = PROCESS_STATUS_STYLE[cr.status] ?? PROCESS_STATUS_STYLE['N/A'];
        const isExp = expanded.has(cr.id);
        return (
          <Card key={cr.id} style={{ marginBottom: 14, overflow: 'hidden' }}>
            {/* CR Header */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', padding: '12px 16px', background: i % 2 === 0 ? C.white : C.bg, gap: 12, cursor: 'pointer' }}
              onClick={() => toggle(cr.id)}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.primary, flexShrink: 0 }}>
                {cr.crId || `CR${i + 1}`}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{cr.title || '—'}</div>
                <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>
                  Requested by: {cr.requestedBy || '—'} · {fmtDate(cr.requestDate)} · {cr.totalManday} MD · Discount: {fmtMoney(cr.discount)}฿
                </div>
              </div>
              <Badge bg={ss.bg} color={ss.color}>{cr.status}</Badge>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                <button onClick={e => { e.stopPropagation(); setModal(cr); }}
                  style={{ background: C.primaryBg, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.primary, cursor: 'pointer', fontWeight: 600 }}>
                  <Pencil size={11} />
                </button>
                <button onClick={e => { e.stopPropagation(); setDeleting(cr); }}
                  style={{ background: C.redBg, border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.red, cursor: 'pointer', fontWeight: 600 }}>
                  <Trash2 size={11} />
                </button>
                {isExp ? <ChevronUp size={14} color={C.text3} /> : <ChevronDown size={14} color={C.text3} />}
              </div>
            </div>

            {/* CR Items — expanded */}
            {isExp && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '0 16px 12px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text2, padding: '10px 0 6px' }}>CR Items</div>
                {cr.items?.length === 0 && <div style={{ fontSize: 11, color: C.text3 }}>No items</div>}
                {cr.items?.map((item, j) => (
                  <div key={item.id} style={{ display: 'flex', gap: 12, padding: '6px 10px', background: j % 2 === 0 ? C.bg : C.white, borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: C.text2, minWidth: 20 }}>{j + 1}.</span>
                    <span style={{ flex: 1, color: C.text }}>{item.detail}</span>
                    <span style={{ fontWeight: 600, color: C.amber, flexShrink: 0 }}>{item.manday} MD</span>
                  </div>
                ))}
                {cr.notes && <div style={{ fontSize: 11, color: C.text2, marginTop: 8, padding: '8px 10px', background: C.bg, borderRadius: 6 }}>📌 {cr.notes}</div>}
                <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: C.text2 }}>
                  <span>Approved by: <strong>{cr.approvedBy || '—'}</strong></span>
                  <span>Approval date: <strong>{fmtDate(cr.approvalDate)}</strong></span>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {modal !== null && <CRModal data={modal} onClose={() => setModal(null)} onSave={handleSave} />}
      {deleting && <ConfirmModal message={`Delete CR "${deleting.crId}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}

// ── CR Modal ──────────────────────────────────────────────────────────────────
function CRModal({ data, onClose, onSave }: { data: Partial<CRWithItems>; onClose: () => void; onSave: (f: Partial<CRWithItems>) => void }) {
  const { members } = useStore();
  const [form, setForm] = useState<Partial<CRWithItems>>({
    crId: '', title: '', requestedBy: '', requestDate: todayISO(), approvedBy: '',
    approvalDate: '', totalManday: 0, discount: 0, status: 'Draft', notes: '', items: [],
    ...data,
  });
  const [items, setItems] = useState<Partial<CRItem>[]>(data.items ? [...data.items] : [{ detail: '', manday: 0 }]);
  const up = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }));
  const memberNames = members.map(m => m.name).filter(Boolean);

  const addItem   = () => setItems(p => [...p, { detail: '', manday: 0 }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, j) => j !== i));
  const updateItem = (i: number, k: string, v: string | number) =>
    setItems(p => p.map((item, j) => j === i ? { ...item, [k]: v } : item));

  const totalMD = items.reduce((s, i) => s + (Number(i.manday) || 0), 0);

  return (
    <Modal title={form.id ? 'Edit Change Request' : 'New Change Request'} onClose={onClose} width={640}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <FormRow label="CR ID" required><Input autoFocus value={form.crId ?? ''} onChange={v => up('crId', v)} placeholder="CR-001" /></FormRow>
        <FormRow label="Title" required><Input value={form.title ?? ''} onChange={v => up('title', v)} placeholder="Short description of the change" /></FormRow>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <FormRow label="Requested By"><>
          <Input value={form.requestedBy ?? ''} onChange={v => up('requestedBy', v)} placeholder="Requested by" list="cr-member-options" />
          <datalist id="cr-member-options">
            {memberNames.map(name => <option key={name} value={name} />)}
          </datalist>
        </></FormRow>
        <FormRow label="Request Date"><Input type="date" value={form.requestDate ?? ''} onChange={v => up('requestDate', v)} /></FormRow>
        <FormRow label="Status">
          <Select value={form.status ?? 'Draft'} onChange={v => up('status', v)} options={STATUSES.map(s => ({ value: s, label: s }))} />
        </FormRow>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <FormRow label="Approved By"><Input value={form.approvedBy ?? ''} onChange={v => up('approvedBy', v)} placeholder="Approved by" list="cr-member-options" /></FormRow>
        <FormRow label="Approval Date"><Input type="date" value={form.approvalDate ?? ''} onChange={v => up('approvalDate', v)} /></FormRow>
        <FormRow label="Discount (฿)"><Input type="number" value={form.discount ?? 0} onChange={v => up('discount', Number(v))} /></FormRow>
      </div>

      {/* Items */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            CR Items (Total: <span style={{ color: C.amber }}>{totalMD} MD</span>)
          </label>
          <Btn onClick={addItem} small variant="outline"><Plus size={12} /> Add Item</Btn>
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 80px 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <Input value={item.detail ?? ''} onChange={v => updateItem(i, 'detail', v)} placeholder={`Item ${i + 1} detail…`} />
            <Input type="number" value={item.manday ?? 0} onChange={v => updateItem(i, 'manday', Number(v))} />
            <button onClick={() => removeItem(i)}
              style={{ height: 34, background: C.redBg, border: 'none', borderRadius: 8, color: C.red, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        ))}
        <input type="hidden" value={totalMD} onChange={() => up('totalManday', totalMD)} />
      </div>

      <FormRow label="Notes"><Textarea value={form.notes ?? ''} onChange={v => up('notes', v)} rows={2} placeholder="Additional notes…" /></FormRow>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => { if (!form.crId?.trim() || !form.title?.trim()) return; onSave({ ...form, totalManday: totalMD, items: items as CRItem[] }); }}>Save</Btn>
      </div>
    </Modal>
  );
}
