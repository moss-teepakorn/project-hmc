import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import type { Note } from '../../types';
import { Btn, Card, C, ConfirmModal, FormRow, Input, Modal, Select, TD, TH, Textarea } from '../Common';
import { fmtDate } from '../../utils';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function emptyNote(): Partial<Note> {
  return {
    title: '',
    details: '',
    startDate: '',
    endDate: '',
    status: 'active',
  };
}

export default function SystemNotesModal({ onClose }: { onClose: () => void }) {
  const notes = useStore((s) => s.notes);
  const createNote = useStore((s) => s.createNote);
  const updateNote = useStore((s) => s.updateNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const [editing, setEditing] = useState<Partial<Note> | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }, [notes]);

  const openCreate = () => setEditing(emptyNote());

  const saveNote = async (form: Partial<Note>) => {
    const payload = {
      ...form,
      title: String(form.title || '').trim(),
      details: String(form.details || '').trim(),
      startDate: String(form.startDate || '').trim(),
      endDate: String(form.endDate || '').trim(),
      status: (form.status || 'active') as Note['status'],
    };

    if (!payload.title) {
      toast.error('Title is required');
      return;
    }

    try {
      if (payload.id) {
        await updateNote(payload.id, payload);
        toast.success('Note updated');
      } else {
        await createNote(payload);
        toast.success('Note created');
      }
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save note');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteNote(deleting.id);
      toast.success('Note deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete note');
    }
    setDeleting(null);
  };

  return (
    <Modal title="System Notes" onClose={onClose} width={1100}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: C.text2 }}>Admin-only records for system-level announcements and internal notes.</div>
        <Btn small onClick={openCreate}><Plus size={14} /> Add Note</Btn>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.bg }}>
              <th style={{ ...TH, width: 80 }}>ID</th>
              <th style={TH}>Title</th>
              <th style={TH}>Details</th>
              <th style={{ ...TH, width: 120 }}>Start</th>
              <th style={{ ...TH, width: 120 }}>End</th>
              <th style={{ ...TH, width: 100 }}>Status</th>
              <th style={{ ...TH, width: 110 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedNotes.map((note, index) => (
              <tr key={note.id} style={{ background: index % 2 === 0 ? C.white : C.bg }}>
                <td style={{ ...TD, fontSize: 11, color: C.text3, whiteSpace: 'nowrap' }}>{note.id}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{note.title}</td>
                <td style={{ ...TD, color: C.text2 }}>{note.details || '-'}</td>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{note.startDate ? fmtDate(note.startDate) : '-'}</td>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{note.endDate ? fmtDate(note.endDate) : '-'}</td>
                <td style={TD}>
                  <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: note.status === 'active' ? C.greenBg : C.bg2, color: note.status === 'active' ? C.green : C.text2 }}>
                    {note.status}
                  </span>
                </td>
                <td style={TD}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                    <button onClick={() => setEditing(note)} style={{ background: C.primaryBg, border: 'none', borderRadius: 6, padding: '4px 10px', color: C.primary, cursor: 'pointer' }}>
                      <Pencil size={11} />
                    </button>
                    <button onClick={() => setDeleting(note)} style={{ background: C.redBg, border: 'none', borderRadius: 6, padding: '4px 10px', color: C.red, cursor: 'pointer' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedNotes.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 30, textAlign: 'center', color: C.text3 }}>No notes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {editing !== null && (
        <NoteModal
          data={editing}
          onClose={() => setEditing(null)}
          onSave={saveNote}
        />
      )}

      {deleting && (
        <ConfirmModal
          message={`Delete note "${deleting.title}"?`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Modal>
  );
}

function NoteModal({
  data,
  onClose,
  onSave,
}: {
  data: Partial<Note>;
  onClose: () => void;
  onSave: (note: Partial<Note>) => void;
}) {
  const [form, setForm] = useState<Partial<Note>>({
    ...emptyNote(),
    ...data,
  });

  useEffect(() => {
    setForm({
      ...emptyNote(),
      ...data,
    });
  }, [data]);

  const up = (key: keyof Note, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal title={form.id ? 'Edit Note' : 'Add Note'} onClose={onClose} width={720}>
      <FormRow label="Title" required>
        <Input autoFocus value={form.title ?? ''} onChange={(v) => up('title', v)} placeholder="Topic" />
      </FormRow>
      <FormRow label="Details">
        <Textarea value={form.details ?? ''} onChange={(v) => up('details', v)} rows={5} placeholder="Details" />
      </FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormRow label="Start Date">
          <Input type="date" value={form.startDate ?? ''} onChange={(v) => up('startDate', v)} />
        </FormRow>
        <FormRow label="End Date">
          <Input type="date" value={form.endDate ?? ''} onChange={(v) => up('endDate', v)} />
        </FormRow>
        <FormRow label="Status">
          <Select value={form.status ?? 'active'} onChange={(v) => up('status', v)} options={STATUS_OPTIONS} />
        </FormRow>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => onSave(form)}>Save</Btn>
      </div>
    </Modal>
  );
}