import React, { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useStore } from '../../store';
import { useAuth } from '../../contexts/AuthContext';
import { Btn, Card, C, ConfirmModal, FormRow, Input, Modal, Select, TD, TH, Textarea } from '../Common';
import { fmtDate, todayISO } from '../../utils';
import type { Activity } from '../../types';

interface Props {
  projectId: string;
}

const CHANNEL_OPTIONS: Array<{ value: Activity['channel']; label: Activity['channel'] }> = [
  { value: 'Online', label: 'Online' },
  { value: 'Onsite', label: 'Onsite' },
  { value: 'Email', label: 'Email' },
  { value: 'MS Teams', label: 'MS Teams' },
  { value: 'Line', label: 'Line' },
  { value: 'Other', label: 'Other' },
];

const DEFAULT_ACTIVITY_TYPES = [
  { value: 'Document Delivery', label: 'Document Delivery' },
  { value: 'Onsite Visit', label: 'Onsite Visit' },
  { value: 'Training', label: 'Training' },
];

export default function ActivitiesTab({ projectId }: Props) {
  const {
    activities,
    masterCodes,
    activeProject,
    fetchActivities,
    createActivity,
    updateActivity,
    deleteActivity,
  } = useStore();
  const { profile } = useAuth();

  const [modal, setModal] = useState<Partial<Activity> | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;
  const canEdit = profile?.role !== 'client';

  useEffect(() => {
    fetchActivities(projectId);
  }, [projectId]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const typeOptions = useMemo(() => {
    const fromMaster = masterCodes
      .filter((code) => code.codeType === 'activity_type' && code.active)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .map((code) => ({ value: code.codeValue, label: code.label || code.codeValue }));
    return fromMaster.length ? fromMaster : DEFAULT_ACTIVITY_TYPES;
  }, [masterCodes]);

  const shown = useMemo(() => {
    const rows = activities.filter((row) => row.projectId === projectId);
    return [...rows].sort((a, b) => {
      const ta = a.activityDate ? new Date(a.activityDate).getTime() : 0;
      const tb = b.activityDate ? new Date(b.activityDate).getTime() : 0;
      return tb - ta;
    });
  }, [activities, projectId]);

  const handleSave = async (form: Partial<Activity>) => {
    try {
      if (form.id) {
        await updateActivity(form.id, { ...form, projectId });
        toast.success('Activity updated');
      } else {
        await createActivity({ ...form, projectId });
        toast.success('Activity added');
      }
      setModal(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save activity');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteActivity(deleting.id);
      toast.success('Deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete activity');
    }
    setDeleting(null);
  };

  const exportPDF = () => {
    const rows = [...shown].sort((a, b) => {
      const ta = a.activityDate ? new Date(a.activityDate).getTime() : 0;
      const tb = b.activityDate ? new Date(b.activityDate).getTime() : 0;
      return ta - tb;
    });
    if (!rows.length) {
      toast.error('No activities to export');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const reportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.roundedRect(10, 6, 277, 22, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(15);
    doc.text('Project Activities Report', 148.5, 15, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(10);
    doc.text(`Project: ${activeProject?.code || projectId} - ${activeProject?.name || ''}`, 14, 22);
    doc.text(`Print Date: ${reportDate}`, 283, 22, { align: 'right' });

    autoTable(doc, {
      startY: 34,
      head: [['Date', 'Type', 'Channel', 'Title', 'Description']],
      body: rows.map((row) => [
        row.activityDate ? fmtDate(row.activityDate) : '-',
        row.activityType || '-',
        row.channel || '-',
        row.title || '-',
        row.description || '-',
      ]),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.5, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 48 },
        2: { cellWidth: 28 },
        3: { cellWidth: 74 },
        4: { cellWidth: 106 },
      },
      margin: { left: 10, right: 10 },
    });

    doc.save(`activities-${projectId}.pdf`);
    toast.success('Exported activities PDF');
  };

  return (
    <div style={{ padding: isMobile ? 16 : 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: C.text2 }}>
          Sorted by latest date first. PDF report exports oldest to latest.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" small onClick={exportPDF}><Download size={13} /> Export PDF</Btn>
          {canEdit && (
            <Btn small onClick={() => setModal({})}><Plus size={14} /> Add Activity</Btn>
          )}
        </div>
      </div>

      <Card>
        {isMobile ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {shown.map((row) => (
              <Card key={row.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{row.title}</div>
                    <div style={{ fontSize: 10, color: C.text2, marginTop: 4 }}>{fmtDate(row.activityDate)} · {row.activityType}</div>
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: C.primaryBg, color: C.primary, fontWeight: 700 }}>{row.channel}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: C.text2 }}>{row.description || '-'}</div>
                {canEdit && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                    <button onClick={() => setModal(row)} style={{ background: C.primaryBg, border: 'none', borderRadius: 8, padding: '6px 10px', color: C.primary, cursor: 'pointer' }}><Pencil size={14} /></button>
                    <button onClick={() => setDeleting(row)} style={{ background: C.redBg, border: 'none', borderRadius: 8, padding: '6px 10px', color: C.red, cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {['Date', 'Type', 'Channel', 'Title', 'Description', ''].map((h) => <th key={h} style={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <tr key={row.id} style={{ background: index % 2 === 0 ? C.white : C.bg }}>
                  <td style={{ ...TD, whiteSpace: 'nowrap', fontSize: 11 }}>{fmtDate(row.activityDate)}</td>
                  <td style={{ ...TD, fontSize: 11 }}>{row.activityType}</td>
                  <td style={{ ...TD, fontSize: 11 }}>
                    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: C.primaryBg, color: C.primary, fontWeight: 700 }}>{row.channel}</span>
                  </td>
                  <td style={{ ...TD, fontSize: 11, fontWeight: 600 }}>{row.title}</td>
                  <td style={{ ...TD, fontSize: 11, color: C.text2 }}>{row.description || '-'}</td>
                  <td style={TD}>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                        <button onClick={() => setModal(row)} style={{ background: C.primaryBg, border: 'none', borderRadius: 6, padding: '4px 10px', color: C.primary, cursor: 'pointer' }}><Pencil size={11} /></button>
                        <button onClick={() => setDeleting(row)} style={{ background: C.redBg, border: 'none', borderRadius: 6, padding: '4px 10px', color: C.red, cursor: 'pointer' }}><Trash2 size={11} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {shown.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>No activities.</div>}
      </Card>

      {modal !== null && canEdit && (
        <ActivityModal
          data={modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          typeOptions={typeOptions}
        />
      )}
      {deleting && canEdit && (
        <ConfirmModal message={`Delete activity "${deleting.title}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}

function ActivityModal({
  data,
  onClose,
  onSave,
  typeOptions,
}: {
  data: Partial<Activity>;
  onClose: () => void;
  onSave: (f: Partial<Activity>) => void;
  typeOptions: Array<{ value: string; label: string }>;
}) {
  const [form, setForm] = useState<Partial<Activity>>({
    activityDate: todayISO(),
    activityType: typeOptions[0]?.value || 'Document Delivery',
    channel: 'Online',
    title: '',
    description: '',
    ...data,
  });

  const up = (key: keyof Activity, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal title={form.id ? 'Edit Activity' : 'Add Activity'} onClose={onClose} width={620}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormRow label="Date" required>
          <Input autoFocus type="date" value={form.activityDate ?? ''} onChange={(v) => up('activityDate', v)} />
        </FormRow>
        <FormRow label="Activity Type" required>
          <Select
            value={form.activityType ?? typeOptions[0]?.value ?? ''}
            onChange={(v) => up('activityType', v)}
            options={typeOptions}
          />
        </FormRow>
        <FormRow label="Channel" required>
          <Select
            value={form.channel ?? 'Online'}
            onChange={(v) => up('channel', v)}
            options={CHANNEL_OPTIONS}
          />
        </FormRow>
      </div>
      <FormRow label="Title" required>
        <Input value={form.title ?? ''} onChange={(v) => up('title', v)} placeholder="e.g. UAT Training Session" />
      </FormRow>
      <FormRow label="Description">
        <Textarea value={form.description ?? ''} onChange={(v) => up('description', v)} rows={3} placeholder="Additional details..." />
      </FormRow>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn
          onClick={() => {
            if (!form.activityDate || !form.activityType || !form.channel || !form.title?.trim()) return;
            onSave({
              ...form,
              title: form.title.trim(),
              description: (form.description || '').trim(),
            });
          }}
        >
          Save
        </Btn>
      </div>
    </Modal>
  );
}
