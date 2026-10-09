import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Download, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
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
    return lessons
      .filter((item) => item.projectId === project.id)
      .filter((item) => !categoryFilter || item.category === categoryFilter)
      .filter((item) => !statusFilter || item.status === statusFilter)
      .filter((item) => !term || [item.title, item.context, item.lesson, item.recommendation, item.owner].some((value) => String(value || '').toLowerCase().includes(term)))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [categoryFilter, lessons, project.id, query, statusFilter]);

  const projectLessons = useMemo(
    () => lessons.filter((item) => item.projectId === project.id),
    [lessons, project.id],
  );

  const exportPDF = async () => {
    let exportHost: HTMLDivElement | null = null;
    let exportRoot: HTMLDivElement | null = null;
    const thaiFontUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf';
    const thaiBoldFontUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Bold.ttf';
    const applyTextFont = (element: HTMLElement, value: string, bold = false) => {
      element.style.fontFamily = 'Sarabun, sans-serif';
      element.style.fontWeight = bold ? '700' : '400';
    };

    try {
      const { default: html2canvas } = await import('html2canvas');
      const loadFont = async (family: string, weight: string, url: string) => {
        const face = new FontFace(family, `url(${url})`, { weight });
        await face.load();
        document.fonts.add(face);
      };
      await Promise.all([
        loadFont('Sarabun', '400', thaiFontUrl),
        loadFont('Sarabun', '700', thaiBoldFontUrl),
      ]);
      await document.fonts.ready;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      const footerY = pageHeight - 12;
      const topY = 10;
      const generatedDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      exportHost = document.createElement('div');
      exportHost.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:-1;';
      exportRoot = document.createElement('div');
      exportRoot.style.cssText = 'width:794px;background:#fff;color:#1e293b;padding:0;';
      exportHost.appendChild(exportRoot);
      document.body.appendChild(exportHost);

      const createText = (text: string, style: Partial<CSSStyleDeclaration> = {}, bold = false) => {
        const element = document.createElement('div');
        element.textContent = text;
        applyTextFont(element, text, bold);
        Object.assign(element.style, style);
        return element;
      };

      const header = document.createElement('div');
      header.style.cssText = 'padding:14px 22px 16px;background:#1e293b;border-bottom:4px solid #14b8a6;color:#fff;';
      const headerTop = document.createElement('div');
      headerTop.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:20px;';
      headerTop.appendChild(createText('PROJECT LESSONS LEARNED', { color: '#cbd5e1', fontSize: '12px', letterSpacing: '1px' }, true));
      headerTop.appendChild(createText(`GENERATED ${generatedDate.toUpperCase()}`, { color: '#cbd5e1', fontSize: '11px', textAlign: 'right' }));
      header.appendChild(headerTop);
      const projectHeading = `${project.name || 'Project'}${project.code ? `  |  ${project.code}` : ''}`;
      header.appendChild(createText(projectHeading, { marginTop: '8px', color: '#fff', fontSize: '23px', lineHeight: '1.3' }, true));
      if (project.client) header.appendChild(createText(project.client, { marginTop: '3px', color: '#cbd5e1', fontSize: '14px' }));
      exportRoot.appendChild(header);

      const total = projectLessons.length;
      const openCount = projectLessons.filter((item) => item.followUp.trim() && item.status !== 'Done').length;
      const doneCount = projectLessons.filter((item) => item.status === 'Done').length;
      const summary = document.createElement('div');
      summary.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0 22px;';
      [
        { label: 'TOTAL LESSONS', value: total, color: '#0f766e' },
        { label: 'OPEN FOLLOW-UPS', value: openCount, color: '#b45309' },
        { label: 'COMPLETED', value: doneCount, color: '#047857' },
      ].forEach((item) => {
        const stat = document.createElement('div');
        stat.style.cssText = 'padding:10px 16px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;';
        stat.appendChild(createText(item.label, { color: '#64748b', fontSize: '11px' }, true));
        stat.appendChild(createText(String(item.value), { marginTop: '5px', color: item.color, fontSize: '24px' }, true));
        summary.appendChild(stat);
      });
      exportRoot.appendChild(summary);

      const summaryCanvas = await html2canvas(summary, { scale: 2, backgroundColor: '#fff', logging: false });
      const headerCanvas = await html2canvas(header, { scale: 2, backgroundColor: '#172534', logging: false });
      const pageHeaderHeight = (headerCanvas.height * contentWidth) / headerCanvas.width;
      let y = topY;
      const addPageHeader = () => {
        doc.addImage(headerCanvas.toDataURL('image/png'), 'PNG', margin, topY, contentWidth, pageHeaderHeight);
        y = topY + pageHeaderHeight + 7;
      };
      const addPage = () => {
        doc.addPage();
        addPageHeader();
      };
      addPageHeader();

      const addCanvas = (canvas: HTMLCanvasElement) => {
        const imageHeight = (canvas.height * contentWidth) / canvas.width;
        const availableHeight = footerY - 5 - y;
        if (imageHeight <= availableHeight) {
          doc.addImage(canvas.toDataURL('image/png'), 'PNG', margin, y, contentWidth, imageHeight);
          y += imageHeight + 5;
          return;
        }
        if (y > topY + pageHeaderHeight + 8) addPage();
        const maxSliceHeight = Math.max(1, Math.floor(((footerY - 5 - y) * canvas.width) / contentWidth));
        let sourceY = 0;
        while (sourceY < canvas.height) {
          const sliceHeight = Math.min(maxSliceHeight, canvas.height - sourceY);
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = sliceHeight;
          const context = slice.getContext('2d');
          if (!context) throw new Error('Unable to render PDF page');
          context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
          const drawnHeight = (sliceHeight * contentWidth) / canvas.width;
          doc.addImage(slice.toDataURL('image/png'), 'PNG', margin, y, contentWidth, drawnHeight);
          sourceY += sliceHeight;
          if (sourceY < canvas.height) addPage();
          else y += drawnHeight + 5;
        }
      };

      addCanvas(summaryCanvas);
      if (!total) {
        const empty = createText('No lessons have been recorded for this project.', { padding: '20px', color: '#64748b', fontSize: '14px' });
        exportRoot.replaceChildren(empty);
        addCanvas(await html2canvas(empty, { scale: 2, backgroundColor: '#fff', logging: false }));
      }

      for (const [index, item] of projectLessons.entries()) {
        const card = document.createElement('article');
        card.style.cssText = 'margin:0 0 12px;border:1px solid #dbe4e8;border-radius:6px;overflow:hidden;background:#fff;';
        const cardHeading = document.createElement('div');
        cardHeading.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;background:#1e293b;';
        cardHeading.appendChild(createText(`${String(index + 1).padStart(2, '0')}  ${item.title || 'Untitled lesson'}`, { color: '#fff', fontSize: '16px', lineHeight: '1.45', overflowWrap: 'anywhere', flex: '1' }, true));
        cardHeading.appendChild(createText(String(item.status || 'Open').toUpperCase(), { flexShrink: '0', color: '#99f6e4', fontSize: '11px' }, true));
        card.appendChild(cardHeading);
        const metadata = `${item.category}  |  ${item.phase}  |  ${fmtDate(item.occurredAt)}`;
        card.appendChild(createText(metadata, { padding: '8px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: '12px' }));
        const fieldList = document.createElement('div');
        fieldList.style.cssText = 'padding:13px 16px 2px;';

        const fields = [
          ['Event and context', item.context], ['Impact / outcome', item.impact],
          ['Root cause', item.rootCause], ['Lesson learned', item.lesson],
          ['Recommendation', item.recommendation], ['Follow-up action', item.followUp],
        ].filter(([, value]) => String(value || '').trim());
        fields.forEach(([label, value]) => {
          const field = document.createElement('section');
          field.style.cssText = 'margin:0 0 10px;';
          field.appendChild(createText(String(label).toUpperCase(), {
            boxSizing: 'border-box',
            minHeight: '27px',
            marginBottom: '5px',
            padding: '4px 9px',
            borderLeft: '3px solid #0f766e',
            background: '#ecfeff',
            color: '#115e59',
            fontSize: '12px',
            lineHeight: '19px',
          }, true));
          field.appendChild(createText(String(value), { color: '#334155', fontSize: '13px', lineHeight: '1.55', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }));
          fieldList.appendChild(field);
        });
        const actionDetails = [item.owner && `Owner: ${item.owner}`, item.dueDate && `Due: ${fmtDate(item.dueDate)}`, item.referenceUrl && `Reference: ${item.referenceUrl}`]
          .filter(Boolean).join('  |  ');
        if (actionDetails) fieldList.appendChild(createText(actionDetails, { padding: '9px 0 10px', borderTop: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', lineHeight: '1.5', overflowWrap: 'anywhere' }));
        card.appendChild(fieldList);
        exportRoot.replaceChildren(card);
        addCanvas(await html2canvas(card, { scale: 2, backgroundColor: '#fff', logging: false }));
      }

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        const footer = document.createElement('div');
        footer.style.cssText = 'box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;width:794px;height:42px;padding:0 12px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:20px;';
        footer.appendChild(createText('Project Lessons Learned', { lineHeight: '20px' }));
        footer.appendChild(createText(`Page ${page} of ${pageCount}`, { textAlign: 'right', lineHeight: '20px' }));
        exportRoot.replaceChildren(footer);
        const footerCanvas = await html2canvas(footer, { scale: 2, backgroundColor: '#fff', logging: false });
        const footerHeight = (footerCanvas.height * contentWidth) / footerCanvas.width;
        doc.addImage(footerCanvas.toDataURL('image/png'), 'PNG', margin, footerY - footerHeight, contentWidth, footerHeight);
      }

      const customerAbbreviation = String(project.customerAbbreviation || project.code || 'Project')
        .trim()
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ');
      doc.save(`${customerAbbreviation} Lessons Learned.pdf`);
      toast.success('Lessons Learned PDF exported');
    } catch {
      toast.error('Could not create PDF. Check your connection and try again.');
    } finally {
      exportHost?.remove();
    }
  };

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

  const followUps = projectLessons.filter((item) => item.followUp.trim() && item.status !== 'Done').length;
  const done = projectLessons.filter((item) => item.status === 'Done').length;
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: isMobile ? 14 : 24, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BookOpen size={18} color={C.primary} /><h2 style={{ margin: 0, color: C.text, fontSize: 18, fontWeight: 800 }}>Lessons Learned</h2></div>
          <p style={{ margin: '5px 0 0', color: C.text3, fontSize: 11 }}>Project lessons and follow-up actions</p>
        </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={exportPDF} small><Download size={13} /> Export PDF</Btn>
            {canEdit && <Btn onClick={openNew} small><Plus size={14} /> Add Lesson</Btn>}
          </div>
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
        <div><BookOpen size={22} color={C.text3} /><h3 style={{ margin: '8px 0 4px', color: C.text, fontSize: 14 }}>{projectLessons.length ? 'No matching lessons' : 'No lessons recorded yet'}</h3>
          <p style={{ margin: 0, color: C.text3, fontSize: 11 }}>{projectLessons.length ? 'Adjust filters to see more results.' : 'Add the first lesson for this project.'}</p>
          {!projectLessons.length && canEdit && <Btn onClick={openNew} small style={{ marginTop: 14 }}><Plus size={13} /> Add Lesson</Btn>}
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