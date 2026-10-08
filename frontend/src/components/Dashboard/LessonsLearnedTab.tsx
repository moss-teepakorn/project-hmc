import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Btn, Card, C, ConfirmModal, FormRow, Input, Modal, Select, Textarea } from '../Common';
import { fmtDate, todayISO } from '../../utils';
import { useStore } from '../../store';
import { useRolePermissions } from '../../hooks/useRolePermissions';
import { useAuth } from '../../contexts/AuthContext';
import type { Project, ProjectLessonLearned } from '../../types';

type Category = 'success' | 'challenge' | 'process' | 'technical' | 'communication' | 'vendor';
type Status = 'Open' | 'In Progress' | 'Done';
type Lesson = ProjectLessonLearned;
type Draft = Omit<Lesson, 'id' | 'projectId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'dueDate'> & { dueDate: string };

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: 'success', label: 'Success' }, { value: 'challenge', label: 'Challenge' },
  { value: 'process', label: 'Process' }, { value: 'technical', label: 'Technical' },
  { value: 'communication', label: 'Communication' }, { value: 'vendor', label: 'Vendor' },
];
const PHASES = ['Planning', 'Requirements & Design', 'Setup', 'Testing', 'Go Live', 'Hyper Care', 'Cross-phase'];
const STATUSES: Array<{ value: Status | ''; label: string }> = [
  { value: '', label: 'All statuses' }, { value: 'Open', label: 'Open' },
  { value: 'In Progress', label: 'In Progress' }, { value: 'Done', label: 'Done' },
];
const BLANK: Draft = {
  title: '', category: 'success', phase: 'Planning', occurredAt: todayISO(), context: '', impact: '',
  rootCause: '', lesson: '', recommendation: '', followUp: '', owner: '', dueDate: '', status: 'Open', referenceUrl: '',
};

function badgeColors(value: string): { background: string; color: string } {
  if (value === 'success' || value === 'Done') return { background: C.greenBg, color: '#047857' };
  if (value === 'challenge') return { background: C.redBg, color: C.red };
  if (value === 'process' || value === 'In Progress') return { background: C.blueBg, color: '#1D4ED8' };
  if (value === 'technical') return { background: C.primaryBg, color: C.primary };
  if (value === 'communication') return { background: C.amberBg, color: '#92400E' };
  if (value === 'vendor') return { background: '#FCE7F3', color: '#9D174D' };
  return { background: C.amberBg, color: '#92400E' };
}

function Tag({ value }: { value: string }) {
  const colors = badgeColors(value);
  const label = CATEGORIES.find((item) => item.value === value)?.label || value;
  return <span style={{ padding: '3px 8px', borderRadius: 4, background: colors.background, color: colors.color, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>;
}

export default function LessonsLearnedTab({ project }: { project: Project }) {
  const lessons = useStore((state) => state.projectLessonsLearned);
  const fetchLessons = useStore((state) => state.fetchProjectLessonsLearned);
  const createLesson = useStore((state) => state.createProjectLessonLearned);
  const updateLesson = useStore((state) => state.updateProjectLessonLearned);
  const deleteLesson = useStore((state) => state.deleteProjectLessonLearned);
  const permission = useRolePermissions();
  const { profile } = useAuth();
  const canEdit = profile?.role !== 'client' && permission.getScreenAccess('lessons') === 'full';
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Lesson | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    fetchLessons(project.id).then((loaded) => {
      if (active && !loaded) setLoadError(useStore.getState().error || 'Could not load lessons learned');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [fetchLessons, project.id]);

  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth < 768);
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...lessons]
      .filter((item) => !categoryFilter || item.category === categoryFilter)
      .filter((item) => !statusFilter || item.status === statusFilter)
      .filter((item) => !term || [item.title, item.context, item.lesson, item.recommendation, item.owner].some((value) => String(value || '').toLowerCase().includes(term)))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [categoryFilter, lessons, query, statusFilter]);

  const openNew = () => {
    setEditingId(null);
    setDraft({ ...BLANK, occurredAt: todayISO() });
    setModalOpen(true);
  };

  const openEdit = (lesson: Lesson) => {
    const { id, createdAt, createdBy, updatedAt, ...values } = lesson;
    setEditingId(id);
    setDraft({ ...values, dueDate: lesson.dueDate || '' });
    setModalOpen(true);
  };

  const save = async () => {
    if (!draft.title.trim() || !draft.occurredAt || !draft.context.trim() || !draft.lesson.trim()) {
      toast.error('Add a topic, date, event and context, and lesson learned');
      return;
    }
    if (draft.referenceUrl && !/^https?:\/\//i.test(draft.referenceUrl)) {
      toast.error('Reference link must start with http:// or https://');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateLesson(editingId, { ...draft, projectId: project.id });
        toast.success('Lesson updated');
      } else {
        await createLesson({ ...draft, projectId: project.id });
        toast.success('Lesson added');
      }
      setModalOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save lesson');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteLesson(deleting.id);
      setDeleting(null);
      toast.success('Lesson deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete lesson');
    }
  };

  const followUps = lessons.filter((item) => item.followUp.trim() && item.status !== 'Done').length;
  const done = lessons.filter((item) => item.status === 'Done').length;
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: isMobile ? 14 : 24, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BookOpen size={18} color={C.primary} /><h2 style={{ margin: 0, color: C.text, fontSize: 18, fontWeight: 800 }}>Lessons Learned</h2></div>
          <p style={{ margin: '5px 0 0', color: C.text3, fontSize: 11 }}>Project lessons and follow-up actions</p>
        </div>
        {canEdit && <Btn onClick={openNew} small><Plus size={14} /> Add Lesson</Btn>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total lessons', value: lessons.length, color: C.primary },
          { label: 'Open follow-ups', value: followUps, color: '#B45309' },
          { label: 'Completed actions', value: done, color: '#047857' },
        ].map((item) => <Card key={item.label} style={{ padding: '11px 14px', borderRadius: 6, boxShadow: 'none' }}>
          <div style={{ color: C.text3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{item.label}</div>
          <div style={{ marginTop: 3, color: item.color, fontSize: 21, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
        </Card>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(220px, 1fr) 180px 170px', gap: 8, marginBottom: 14 }}>
        <div style={{ position: 'relative' }}><Search size={14} color={C.text3} style={{ position: 'absolute', top: 11, left: 11 }} /><Input value={query} onChange={setQuery} placeholder="Search lessons, context, or owner" style={{ paddingLeft: 32, fontSize: 12 }} /></div>
        <Select value={categoryFilter} onChange={setCategoryFilter} options={[{ value: '', label: 'All categories' }, ...CATEGORIES]} />
        <Select value={statusFilter} onChange={(value) => setStatusFilter(value as Status | '')} options={STATUSES} />
      </div>

      {loadError ? <div role="alert" style={{ padding: 14, border: `1px solid ${C.red}44`, borderRadius: 6, background: C.redBg, color: C.red, fontSize: 12 }}>{loadError}</div>
      : loading ? <div style={{ padding: 36, color: C.text3, textAlign: 'center', fontSize: 12 }}>Loading lessons…</div>
      : visible.length ? <div style={{ display: 'grid', gap: 10 }}>
        {visible.map((item) => <Card key={item.id} style={{ padding: isMobile ? 13 : '15px 18px', borderRadius: 6, boxShadow: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <Tag value={item.category} /><Tag value={item.status} />
                <span style={{ color: C.text3, fontSize: 10 }}>{fmtDate(item.occurredAt)}</span>
                <span style={{ color: C.text3, fontSize: 10 }}>{item.phase}</span>
              </div>
              <h3 style={{ margin: '0 0 8px', color: C.text, fontSize: 14, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{item.title}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Event and context', value: item.context },
                  { label: 'Impact / outcome', value: item.impact },
                  { label: 'Root cause', value: item.rootCause },
                  { label: 'Lesson learned', value: item.lesson },
                  { label: 'Recommendation', value: item.recommendation },
                  { label: 'Follow-up action', value: item.followUp },
                ].map((field) => <div key={field.label}>
                  <div style={{ color: C.text3, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{field.label}</div>
                  <div style={{ color: C.text2, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{field.value || '—'}</div>
                </div>)}
              </div>
              {(item.owner || item.dueDate || item.referenceUrl) && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 9, color: C.text3, fontSize: 10 }}>
                {item.owner && <span>Owner: <strong style={{ color: C.text2 }}>{item.owner}</strong></span>}
                {item.dueDate && <span>Due: <strong style={{ color: C.text2 }}>{fmtDate(item.dueDate)}</strong></span>}
                {item.referenceUrl && <a href={item.referenceUrl} target="_blank" rel="noreferrer" style={{ color: C.primary, overflowWrap: 'anywhere' }}>Reference</a>}
              </div>}
            </div>
            {canEdit && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" aria-label={`Edit ${item.title}`} title="Edit lesson" onClick={() => openEdit(item)} style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.text2, cursor: 'pointer' }}><Pencil size={14} /></button>
              <button type="button" aria-label={`Delete ${item.title}`} title="Delete lesson" onClick={() => setDeleting(item)} style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 5, background: C.white, color: C.red, cursor: 'pointer' }}><Trash2 size={14} /></button>
            </div>}
          </div>
        </Card>)}
      </div> : <div style={{ display: 'grid', placeItems: 'center', minHeight: 230, padding: 24, border: `1px dashed ${C.border2}`, borderRadius: 6, background: C.white, textAlign: 'center' }}>
        <div><BookOpen size={22} color={C.text3} /><h3 style={{ margin: '8px 0 4px', color: C.text, fontSize: 14 }}>{lessons.length ? 'No matching lessons' : 'No lessons recorded yet'}</h3>
          <p style={{ margin: 0, color: C.text3, fontSize: 11 }}>{lessons.length ? 'Adjust filters to see more results.' : 'Add the first lesson for this project.'}</p>
          {!lessons.length && canEdit && <Btn onClick={openNew} small style={{ marginTop: 14 }}><Plus size={13} /> Add Lesson</Btn>}
        </div>
      </div>}

      {modalOpen && <Modal title={editingId ? 'Edit Lesson' : 'Add Lesson'} onClose={() => setModalOpen(false)} width={920} closeOnBackdrop={false}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 14px' }}>
          <FormRow label="Topic" required><Input value={draft.title} onChange={(value) => update('title', value)} placeholder="Short lesson title" /></FormRow>
          <FormRow label="Category" required><Select value={draft.category} onChange={(value) => update('category', value as Category)} options={CATEGORIES} /></FormRow>
          <FormRow label="Project phase"><Select value={draft.phase} onChange={(value) => update('phase', value)} options={PHASES.map((value) => ({ value, label: value }))} /></FormRow>
          <FormRow label="Date occurred" required><Input type="date" value={draft.occurredAt} onChange={(value) => update('occurredAt', value)} /></FormRow>
          <div style={{ gridColumn: '1 / -1' }}><FormRow label="Event and context" required><Textarea rows={3} value={draft.context} onChange={(value) => update('context', value)} placeholder="What happened? Include relevant context." /></FormRow></div>
          <FormRow label="Impact / outcome"><Textarea rows={3} value={draft.impact} onChange={(value) => update('impact', value)} placeholder="Effect on schedule, quality, cost, or users" /></FormRow>
          <FormRow label="Root cause"><Textarea rows={3} value={draft.rootCause} onChange={(value) => update('rootCause', value)} placeholder="What contributed to the outcome?" /></FormRow>
          <div style={{ gridColumn: '1 / -1' }}><FormRow label="Lesson learned" required><Textarea rows={3} value={draft.lesson} onChange={(value) => update('lesson', value)} placeholder="What should the team remember?" /></FormRow></div>
          <FormRow label="Recommendation"><Textarea rows={3} value={draft.recommendation} onChange={(value) => update('recommendation', value)} placeholder="What should be repeated or changed next time?" /></FormRow>
          <FormRow label="Follow-up action"><Textarea rows={3} value={draft.followUp} onChange={(value) => update('followUp', value)} placeholder="Action to carry forward" /></FormRow>
          <FormRow label="Action owner"><Input value={draft.owner} onChange={(value) => update('owner', value)} placeholder="Name" /></FormRow>
          <FormRow label="Due date"><Input type="date" value={draft.dueDate} onChange={(value) => update('dueDate', value)} /></FormRow>
          <FormRow label="Follow-up status"><Select value={draft.status} onChange={(value) => update('status', value as Status)} options={STATUSES.filter((item) => item.value)} /></FormRow>
          <FormRow label="Reference link"><Input value={draft.referenceUrl} onChange={(value) => update('referenceUrl', value)} placeholder="https://" /></FormRow>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Btn variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}><X size={13} /> Cancel</Btn><Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : <><Check size={13} /> Save Lesson</>}</Btn>
        </div>
      </Modal>}
      {deleting && canEdit && <ConfirmModal message={`Delete lesson "${deleting.title}"?`} onConfirm={remove} onCancel={() => setDeleting(null)} />}
    </div>
  );
}