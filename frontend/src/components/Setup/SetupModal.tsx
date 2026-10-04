import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { projectChecklistApi } from '../../services/api';
import { Edit3, Plus, Save, Trash2, X } from 'lucide-react';
import { Modal, Input, Btn, C, Select } from '../Common';
import type { MasterCode } from '../../types';
import {
  PROJECT_CHECKLIST_CATEGORIES,
  PROJECT_CHECKLIST_STAGES,
  type ProjectChecklistStageId,
  type ProjectChecklistCategoryId,
  type ProjectChecklistTopic,
} from '../../utils/projectChecklist';

const TYPE_LABELS: Record<string, string> = {
  project_status: 'Project Status',
  task_phase: 'Task Phase',
  activity_type: 'Activity Type',
  work_system: 'Work System',
};

function ChecklistTopicsManager({ category, workSystems }: { category: ProjectChecklistCategoryId; workSystems: string[] }) {
  const [topics, setTopics] = useState<ProjectChecklistTopic[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [editing, setEditing] = useState<Record<string, ProjectChecklistTopic>>({});
  const [newStage, setNewStage] = useState<ProjectChecklistStageId>('planning');
  const [newWorkSystem, setNewWorkSystem] = useState('');
  const [newOrderNo, setNewOrderNo] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [savingTopics, setSavingTopics] = useState(false);
  const needsWorkSystem = category !== 'project';
  const needsStage = category === 'project';
  const compactFieldStyle: React.CSSProperties = { fontSize: 10, padding: '4px 8px', lineHeight: 1.3 };
  const compactSelectStyle: React.CSSProperties = { ...compactFieldStyle, paddingRight: 24 };
  const topicRowHeight = 36;

  useEffect(() => {
    let mounted = true;
    projectChecklistApi.getTopics()
      .then((loadedTopics) => {
        if (!mounted) return;
        setTopics(loadedTopics);
        setSavedSnapshot(JSON.stringify(loadedTopics));
      })
      .catch((error) => { if (mounted) toast.error(error instanceof Error ? error.message : 'Unable to load checklist topics'); })
      .finally(() => { if (mounted) setTopicsLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!needsWorkSystem) return;
    setNewWorkSystem((current) => workSystems.includes(current) ? current : workSystems[0] || '');
  }, [needsWorkSystem, workSystems]);

  const hasUnsavedChanges = JSON.stringify(topics) !== savedSnapshot;
  const workSystemOrderMap = new Map(workSystems.map((system, index) => [system.trim().toLocaleLowerCase(), index]));
  const categoryTopics = topics
    .filter((topic) => topic.category === category)
    .slice()
    .sort((left, right) => {
      if (needsStage) {
        const leftStageOrder = PROJECT_CHECKLIST_STAGES.findIndex((stage) => stage.id === left.stage);
        const rightStageOrder = PROJECT_CHECKLIST_STAGES.findIndex((stage) => stage.id === right.stage);
        if (leftStageOrder !== rightStageOrder) return (leftStageOrder < 0 ? Infinity : leftStageOrder) - (rightStageOrder < 0 ? Infinity : rightStageOrder);
      }
      if (needsWorkSystem && left.workSystem !== right.workSystem) {
        const leftModule = String(left.workSystem || '').trim();
        const rightModule = String(right.workSystem || '').trim();
        const leftOrder = workSystemOrderMap.get(leftModule.toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = workSystemOrderMap.get(rightModule.toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || leftModule.localeCompare(rightModule, undefined, { numeric: true, sensitivity: 'base' });
      }
      return left.orderNo - right.orderNo || left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: 'base' });
    });
  const orderGroupTopics = categoryTopics.filter((topic) =>
    (!needsStage || topic.stage === newStage) && (!needsWorkSystem || topic.workSystem === newWorkSystem)
  );
  const nextOrderNo = Math.max(0, ...orderGroupTopics.map((topic) => topic.orderNo)) + 10;
  const rowActionStyle: React.CSSProperties = { width: 28, height: 28, border: 'none', borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: C.bg2, color: C.text2 };

  const addTopic = () => {
    if (!newTitle.trim()) {
      toast.error('Enter a checklist topic first');
      return;
    }
    if (needsWorkSystem && !newWorkSystem) {
      toast.error('Add a Work System under Lookup Values first');
      return;
    }
    const orderNo = Number(newOrderNo || nextOrderNo);
    if (!Number.isFinite(orderNo) || orderNo < 1) {
      toast.error('Order No. must be a positive number');
      return;
    }
    setTopics((currentTopics) => [...currentTopics, {
      id: window.crypto.randomUUID(),
      category,
      workSystem: needsWorkSystem ? newWorkSystem : '',
      ...(needsStage ? { stage: newStage } : {}),
      orderNo,
      title: newTitle.trim(),
    }]);
    setNewTitle('');
    setNewOrderNo('');
  };

  const updateTopic = (id: string, updates: Partial<ProjectChecklistTopic>) => {
    setTopics((currentTopics) => currentTopics.map((topic) => topic.id === id ? { ...topic, ...updates } : topic));
  };

  const startEdit = (topic: ProjectChecklistTopic) => setEditing((current) => ({ ...current, [topic.id]: { ...topic } }));
  const cancelEdit = (id: string) => setEditing((current) => {
    const next = { ...current };
    delete next[id];
    return next;
  });
  const saveEdit = (id: string) => {
    const draft = editing[id];
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error('Topic is required');
      return;
    }
    if (needsWorkSystem && !draft.workSystem) {
      toast.error('Work System is required');
      return;
    }
    const orderNo = Number(draft.orderNo);
    if (!Number.isFinite(orderNo) || orderNo < 1) {
      toast.error('Order No. must be a positive number');
      return;
    }
    setTopics((currentTopics) => currentTopics.map((topic) => topic.id === id ? { ...draft, title: draft.title.trim(), orderNo } : topic));
    cancelEdit(id);
  };

  const saveTopics = async () => {
    const normalizedTopics = topics
      .map((topic) => ({ ...topic, title: topic.title.trim(), orderNo: Number(topic.orderNo) }))
      .filter((topic) => topic.title);
    if (!normalizedTopics.length) {
      toast.error('Add at least one checklist topic');
      return;
    }
    setSavingTopics(true);
    try {
      const savedTopics = await projectChecklistApi.replaceTopics(normalizedTopics);
      setTopics(savedTopics);
      setSavedSnapshot(JSON.stringify(savedTopics));
      window.dispatchEvent(new Event('checklist-topics-updated'));
      toast.success('Checklist topics saved');
    } catch {
      toast.error('Could not save checklist topics');
    } finally {
      setSavingTopics(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, color: C.text }}>{PROJECT_CHECKLIST_CATEGORIES.find((item) => item.id === category)?.label} Checklist Topics</h3>
          <p style={{ margin: '5px 0 0', color: C.text3, fontSize: 12 }}>Configure checklist topics and systems.</p>
        </div>
        <Btn onClick={saveTopics} disabled={topicsLoading || savingTopics || !hasUnsavedChanges} small><Save size={14} /> {savingTopics ? 'Saving…' : 'Save Topics'}</Btn>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 14, fontSize: 10, width: '100%', minWidth: 0 }}>
        <table style={{ width: '100%', minWidth: 0, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 10 }}>
          <colgroup>
            {needsWorkSystem && <col style={{ width: '18%' }} />}
            {needsStage && <col style={{ width: '22%' }} />}
            <col style={{ width: '11%' }} />
            <col />
            <col style={{ width: 72 }} />
          </colgroup>
          <thead>
            <tr style={{ background: C.bg2, color: C.text2, textAlign: 'left', fontWeight: 700, fontSize: 10 }}>
              {needsWorkSystem && <th style={{ padding: '8px 9px', overflowWrap: 'anywhere' }}>Work System</th>}
              {needsStage && <th style={{ padding: '8px 9px', overflowWrap: 'anywhere' }}>Stage</th>}
              <th style={{ padding: '8px 9px', overflowWrap: 'anywhere' }}>Order No.</th>
              <th style={{ padding: '8px 9px' }}>Topic</th>
              <th style={{ padding: '8px 6px' }} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {categoryTopics.map((topic) => {
              const draft = editing[topic.id];
              return (
                <tr key={topic.id} style={{ borderTop: `1px solid ${C.border}`, background: C.white, fontSize: 10, minHeight: topicRowHeight }}>
                  {needsWorkSystem && (
                    <td style={{ padding: '4px 7px', verticalAlign: 'middle', overflowWrap: 'anywhere' }}>
                      {draft ? <Select value={draft.workSystem || ''} onChange={(value) => setEditing((current) => ({ ...current, [topic.id]: { ...current[topic.id], workSystem: value } }))} options={workSystems.map((value) => ({ value, label: value }))} style={{ ...compactSelectStyle, width: '100%', minWidth: 0 }} /> : <span style={{ color: C.text, overflowWrap: 'anywhere' }}>{topic.workSystem || '—'}</span>}
                    </td>
                  )}
                  {needsStage && (
                    <td style={{ padding: '4px 7px', verticalAlign: 'middle', overflowWrap: 'anywhere' }}>
                      {draft ? <Select value={draft.stage || 'planning'} onChange={(value) => setEditing((current) => ({ ...current, [topic.id]: { ...current[topic.id], stage: value as ProjectChecklistStageId } }))} options={PROJECT_CHECKLIST_STAGES.map((stage) => ({ value: stage.id, label: stage.label }))} style={{ ...compactSelectStyle, width: '100%', minWidth: 0 }} /> : <span style={{ color: C.text, overflowWrap: 'anywhere' }}>{PROJECT_CHECKLIST_STAGES.find((stage) => stage.id === topic.stage)?.label || '—'}</span>}
                    </td>
                  )}
                  <td style={{ padding: '4px 7px', verticalAlign: 'middle' }}>
                    {draft ? <Input type="number" value={String(draft.orderNo)} onChange={(value) => setEditing((current) => ({ ...current, [topic.id]: { ...current[topic.id], orderNo: Number(value) } }))} style={{ ...compactFieldStyle, width: '100%', minWidth: 0 }} /> : <span style={{ color: C.text }}>{topic.orderNo}</span>}
                  </td>
                  <td style={{ padding: '4px 7px', verticalAlign: 'middle', overflowWrap: 'anywhere' }}>
                    {draft ? <Input value={draft.title} onChange={(value) => setEditing((current) => ({ ...current, [topic.id]: { ...current[topic.id], title: value } }))} placeholder="Checklist topic" style={{ ...compactFieldStyle, width: '100%', minWidth: 0 }} /> : <span style={{ color: C.text, overflowWrap: 'anywhere' }}>{topic.title}</span>}
                  </td>
                  <td style={{ padding: '4px 5px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {draft ? (
                      <>
                        <button type="button" aria-label={`Save ${topic.title || 'checklist topic'}`} onClick={() => saveEdit(topic.id)} style={{ ...rowActionStyle, background: C.primary, color: C.white }}><Save size={14} /></button>
                        <button type="button" aria-label={`Cancel ${topic.title || 'checklist topic'}`} onClick={() => cancelEdit(topic.id)} style={{ ...rowActionStyle, marginLeft: 5 }}><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <button type="button" aria-label={`Edit ${topic.title}`} onClick={() => startEdit(topic)} style={{ ...rowActionStyle, marginRight: 5 }}><Edit3 size={14} /></button>
                        <button type="button" aria-label={`Remove ${topic.title || 'checklist topic'}`} onClick={() => setTopics((currentTopics) => currentTopics.filter((item) => item.id !== topic.id))} style={{ ...rowActionStyle, background: C.redBg, color: C.red }}><Trash2 size={14} /></button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {categoryTopics.length === 0 && (
              <tr><td colSpan={(needsWorkSystem ? 1 : 0) + (needsStage ? 1 : 0) + 3} style={{ padding: 20, color: C.text3, textAlign: 'center' }}>No checklist topics configured for {PROJECT_CHECKLIST_CATEGORIES.find((item) => item.id === category)?.label}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${needsWorkSystem ? 'minmax(150px, 190px) ' : ''}${needsStage ? 'minmax(160px, 190px) ' : ''}90px minmax(220px, 1fr) auto`, gap: 8, alignItems: 'center' }}>
          {needsWorkSystem && <Select value={newWorkSystem} onChange={(value) => { setNewWorkSystem(value); setNewOrderNo(''); }} options={workSystems.length ? workSystems.map((value) => ({ value, label: value })) : [{ value: '', label: 'Add systems in Lookup Values' }]} disabled={!workSystems.length} style={compactSelectStyle} />}
          {needsStage && <Select value={newStage} onChange={(value) => { setNewStage(value as ProjectChecklistStageId); setNewOrderNo(''); }} options={PROJECT_CHECKLIST_STAGES.map((stage) => ({ value: stage.id, label: stage.label }))} style={compactSelectStyle} />}
          <Input type="number" value={newOrderNo || String(nextOrderNo)} onChange={setNewOrderNo} placeholder="Order No." style={compactFieldStyle} />
          <Input value={newTitle} onChange={setNewTitle} placeholder="Enter checklist topic" style={compactFieldStyle} />
          <Btn onClick={addTopic} small><Plus size={14} /> Add Topic</Btn>
        </div>
      </div>
    </div>
  );
}

export default function SetupModal({ onClose }: { onClose: () => void }) {
  const masterCodes = useStore((s) => s.masterCodes);
  const fetchMasterCodes = useStore((s) => s.fetchMasterCodes);
  const globalError = useStore((s) => s.error);
  const createMasterCode = useStore((s) => s.createMasterCode);
  const updateMasterCode = useStore((s) => s.updateMasterCode);
  const deleteMasterCode = useStore((s) => s.deleteMasterCode);
  const [activeType, setActiveType] = useState('project_status');
  const [checklistSetupOpen, setChecklistSetupOpen] = useState(false);
  const [activeChecklistCategory, setActiveChecklistCategory] = useState<ProjectChecklistCategoryId>('project');
  const [isMobile, setIsMobile] = useState(false);
  const [editing, setEditing] = useState<Record<string, MasterCode>>({});
  const [newCode, setNewCode] = useState<Partial<MasterCode>>({
    codeType: 'project_status',
    codeKey: '',
    codeValue: '',
    label: '',
    sortOrder: 100,
    active: true,
  });
  const ROW_HEIGHT = 36;
  const SMALL_INPUT_STYLE: React.CSSProperties = { fontSize: 10, padding: '4px 8px', lineHeight: 1.3 };
  const ICON_BUTTON_STYLE: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: C.bg2, color: C.text2 };
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const updateMobile = () => setIsMobile(window.innerWidth < 768);
    updateMobile();
    window.addEventListener('resize', updateMobile);
    return () => window.removeEventListener('resize', updateMobile);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const success = await fetchMasterCodes();
      if (!mounted) return;
      if (!success) {
        setLoadError(globalError || 'Unable to load lookup values');
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [fetchMasterCodes, globalError]);

  const codeTypes = useMemo(() => {
    const types = Array.from(new Set(masterCodes.map((code) => code.codeType)));
    if (!types.includes('project_status')) types.unshift('project_status');
    if (!types.includes('task_phase')) types.unshift('task_phase');
    if (!types.includes('activity_type')) types.unshift('activity_type');
    if (!types.includes('work_system')) types.push('work_system');
    return types;
  }, [masterCodes]);

  useEffect(() => {
    setNewCode((prev) => ({ ...prev, codeType: activeType }));
  }, [activeType]);

  useEffect(() => {
    if (!codeTypes.includes(activeType) && codeTypes.length > 0) {
      setActiveType(codeTypes[0]);
    }
  }, [activeType, codeTypes]);

  const codes = useMemo(
    () => masterCodes
      .filter((code) => code.codeType === activeType)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.codeValue.localeCompare(b.codeValue)),
    [masterCodes, activeType]
  );

  const workSystemOptions = useMemo(
    () => {
      const seen = new Set<string>();
      return masterCodes
        .filter((code) => code.codeType === 'work_system' && code.active)
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder || left.codeValue.localeCompare(right.codeValue))
        .map((code) => code.codeValue.trim())
        .filter((value) => {
          if (!value || seen.has(value)) return false;
          seen.add(value);
          return true;
        });
    },
    [masterCodes]
  );

  const startEdit = (code: MasterCode) => setEditing((prev) => ({ ...prev, [code.id]: code }));
  const cancelEdit = (id: string) => setEditing((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });

  const saveEdit = async (id: string) => {
    const updated = editing[id];
    if (!updated) return;
    if (!updated.codeKey.trim() || !updated.codeValue.trim()) {
      toast.error('Code key and value are required');
      return;
    }
    try {
      await updateMasterCode(id, {
        codeKey: updated.codeKey.trim(),
        codeValue: updated.codeValue.trim(),
        label: updated.label.trim() || updated.codeValue.trim(),
        sortOrder: Number(updated.sortOrder) || 100,
        active: updated.active,
      });
      cancelEdit(id);
      toast.success('Lookup value saved');
    } catch (error) {
      toast.error((error as Error).message || 'Unable to save lookup value');
    }
  };

  const handleAdd = async () => {
    if (!newCode.codeKey?.trim() || !newCode.codeValue?.trim()) {
      toast.error('Code key and value are required');
      return;
    }
    try {
      await createMasterCode({
        codeType: activeType,
        codeKey: newCode.codeKey.trim(),
        codeValue: newCode.codeValue.trim(),
        label: newCode.label?.trim() || newCode.codeValue?.trim() || '',
        sortOrder: Number(newCode.sortOrder) || 100,
        active: newCode.active ?? true,
      });
      setNewCode((prev) => ({ ...prev, codeKey: '', codeValue: '', label: '', sortOrder: prev.sortOrder, active: true }));
      toast.success('Lookup value added');
    } catch (error) {
      toast.error((error as Error).message || 'Unable to add lookup value');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMasterCode(id);
      toast.success('Lookup value deleted');
    } catch (error) {
      toast.error((error as Error).message || 'Unable to delete lookup value');
    }
  };

  const refreshMasterCodes = async () => {
    setLoading(true);
    setLoadError(null);
    const success = await fetchMasterCodes();
    if (!success) {
      setLoadError(globalError || 'Unable to load lookup values');
    }
    setLoading(false);
  };

  return (
    <Modal title="Admin Setup" onClose={onClose} width={1100} height="min(760px, 88vh)" contentStyle={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '190px minmax(0, 1fr)', gridTemplateRows: isMobile ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 18, height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <nav aria-label="Setup sections" style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: isMobile ? 'wrap' : 'nowrap', alignItems: 'stretch', gap: 4, paddingRight: isMobile ? 0 : 14, borderRight: isMobile ? 'none' : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : 'none', paddingBottom: isMobile ? 12 : 0 }}>
          <button type="button" aria-current={!checklistSetupOpen ? 'page' : undefined} onClick={() => setChecklistSetupOpen(false)}
            style={{ padding: '9px 12px', border: `1px solid ${!checklistSetupOpen ? C.primary : 'transparent'}`, borderRadius: 8, background: !checklistSetupOpen ? C.primaryBg : 'transparent', color: !checklistSetupOpen ? C.primary : C.text2, cursor: 'pointer', fontSize: 12, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>
            Lookup Values
          </button>
          {!checklistSetupOpen && (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: 'wrap', gap: 2, marginLeft: isMobile ? 0 : 10, paddingLeft: isMobile ? 0 : 10, borderLeft: isMobile ? 'none' : `1px solid ${C.border2}` }}>
              {codeTypes.map((type) => (
                <button key={type} type="button" aria-current={activeType === type ? 'page' : undefined} onClick={() => setActiveType(type)}
                  style={{ padding: '7px 10px', border: 'none', borderRadius: 6, background: activeType === type ? C.bg2 : 'transparent', color: activeType === type ? C.text : C.text2, cursor: 'pointer', fontSize: 11, fontWeight: activeType === type ? 700 : 500, textAlign: 'left', whiteSpace: 'nowrap' }}>
                  {TYPE_LABELS[type] ?? type}
                </button>
              ))}
            </div>
          )}
          <button type="button" aria-current={checklistSetupOpen ? 'page' : undefined} onClick={() => setChecklistSetupOpen(true)}
            style={{ padding: '9px 12px', border: `1px solid ${checklistSetupOpen ? C.primary : 'transparent'}`, borderRadius: 8, background: checklistSetupOpen ? C.primaryBg : 'transparent', color: checklistSetupOpen ? C.primary : C.text2, cursor: 'pointer', fontSize: 12, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>
            Checklist Topics
          </button>
          {checklistSetupOpen && (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: 'wrap', gap: 2, marginLeft: isMobile ? 0 : 10, paddingLeft: isMobile ? 0 : 10, borderLeft: isMobile ? 'none' : `1px solid ${C.border2}` }}>
              {PROJECT_CHECKLIST_CATEGORIES.map((category) => (
                <button key={category.id} type="button" aria-current={activeChecklistCategory === category.id ? 'page' : undefined} onClick={() => setActiveChecklistCategory(category.id)}
                  style={{ padding: '7px 10px', border: 'none', borderRadius: 6, background: activeChecklistCategory === category.id ? C.bg2 : 'transparent', color: activeChecklistCategory === category.id ? C.text : C.text2, cursor: 'pointer', fontSize: 11, fontWeight: activeChecklistCategory === category.id ? 700 : 500, textAlign: 'left', whiteSpace: 'nowrap' }}>
                  {category.label}
                </button>
              ))}
            </div>
          )}
        </nav>
        <div style={{ minWidth: 0, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingRight: isMobile ? 0 : 6 }}>
          {checklistSetupOpen ? <ChecklistTopicsManager category={activeChecklistCategory} workSystems={workSystemOptions} /> : <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: C.text }}>{TYPE_LABELS[activeType] ?? activeType}</h3>
              <button type="button" onClick={refreshMasterCodes}
                style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.text, cursor: 'pointer', fontSize: 12 }}>
                {loading ? 'Reloading…' : 'Refresh'}
              </button>
            </div>
      <div style={{ fontSize: 13, color: C.text2, marginBottom: 10 }}>
        Manage shared lookup values used by project and task dropdowns. Only admin users can change these values.
      </div>
      {loading && (
        <div style={{ padding: 16, borderRadius: 12, background: C.bg2, color: C.text3, marginBottom: 12 }}>
          Loading lookup values…
        </div>
      )}
      {loadError && (
        <div style={{ padding: 16, borderRadius: 12, background: C.redBg, color: C.red, marginBottom: 12 }}>
          Failed to load lookup values. <button type="button" onClick={refreshMasterCodes} style={{ border: 'none', background: 'transparent', color: C.primary, textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
        </div>
      )}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14, fontSize: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ background: C.bg2, color: C.text2, fontWeight: 700, fontSize: 10 }}>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Code Key</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Code Value</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Label</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 90 }}>Text Color</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 90 }}>Background</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 90 }}>Sort Order</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: 70 }}>Active</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => {
              const draft = editing[code.id];
              return (
                <tr key={code.id} style={{ borderTop: `1px solid ${C.border}`, background: C.white, fontSize: 10, height: ROW_HEIGHT }}>
                  <td style={{ padding: '4px 8px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input value={draft.codeKey} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], codeKey: v } }))} style={SMALL_INPUT_STYLE} />
                    ) : (
                      <span style={{ color: C.text }}>{code.codeKey}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input value={draft.codeValue} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], codeValue: v } }))} style={SMALL_INPUT_STYLE} />
                    ) : (
                      <span style={{ color: C.text }}>{code.codeValue}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input value={draft.label} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], label: v } }))} style={SMALL_INPUT_STYLE} />
                    ) : (
                      <span style={{ color: C.text }}>{code.label}</span>
                    )}
                  </td>
                  <td style={{ padding: '4px 8px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input type="color" value={draft.textColor} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], textColor: v } }))} style={{ width: 28, padding: 2, height: 26 }} />
                    ) : (
                      <span style={{ width: 18, height: 18, display: 'inline-block', borderRadius: 4, background: code.textColor, border: '1px solid #CBD5E1' }} />
                    )}
                  </td>
                  <td style={{ padding: '4px 8px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input type="color" value={draft.bgColor} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], bgColor: v } }))} style={{ width: 28, padding: 2, height: 26 }} />
                    ) : (
                      <span style={{ width: 18, height: 18, display: 'inline-block', borderRadius: 4, background: code.bgColor, border: '1px solid #CBD5E1' }} />
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input value={String(draft.sortOrder)} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], sortOrder: Number(v) || 0 } }))} style={SMALL_INPUT_STYLE} />
                    ) : (
                      <span style={{ color: C.text }}>{code.sortOrder}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                    {draft ? (
                      <input type="checkbox" checked={draft.active} onChange={(e) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], active: e.target.checked } }))} />
                    ) : (
                      <span>{code.active ? 'Yes' : 'No'}</span>
                    )}
                  </td>
                  <td style={{ padding: '4px 8px', verticalAlign: 'middle', textAlign: 'right' }}>
                    {draft ? (
                      <>
                        <button type="button" onClick={() => saveEdit(code.id)}
                          style={{ ...ICON_BUTTON_STYLE, background: C.primary, color: '#fff', width: 28, height: 28, padding: 0 }}>
                          <Edit3 size={14} />
                        </button>
                        <button type="button" onClick={() => cancelEdit(code.id)}
                          style={{ ...ICON_BUTTON_STYLE, marginLeft: 6, padding: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(code)}
                          style={{ ...ICON_BUTTON_STYLE, marginRight: 6, padding: 0 }}>
                          <Edit3 size={14} />
                        </button>
                        <button type="button" onClick={() => handleDelete(code.id)}
                          style={{ ...ICON_BUTTON_STYLE, background: C.redBg, color: C.red, padding: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {codes.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 16, textAlign: 'center', color: C.text3, background: C.bg2 }}>
                  No values found for this lookup type.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 90px 90px 90px 70px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <Input value={newCode.codeKey || ''} onChange={(v) => setNewCode((prev) => ({ ...prev, codeKey: v }))} placeholder="New code key" style={SMALL_INPUT_STYLE} />
          <Input value={newCode.codeValue || ''} onChange={(v) => setNewCode((prev) => ({ ...prev, codeValue: v }))} placeholder="New code value" style={SMALL_INPUT_STYLE} />
          <Input value={newCode.label || ''} onChange={(v) => setNewCode((prev) => ({ ...prev, label: v }))} placeholder="Label (optional)" style={SMALL_INPUT_STYLE} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input type="color" value={newCode.textColor || '#0F172A'} onChange={(v) => setNewCode((prev) => ({ ...prev, textColor: v }))} style={{ width: 28, padding: 2, height: 26 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input type="color" value={newCode.bgColor || '#EEF2FF'} onChange={(v) => setNewCode((prev) => ({ ...prev, bgColor: v }))} style={{ width: 28, padding: 2, height: 26 }} />
          </div>
          <Input value={String(newCode.sortOrder ?? 100)} onChange={(v) => setNewCode((prev) => ({ ...prev, sortOrder: Number(v) || 100 }))} placeholder="Order" style={SMALL_INPUT_STYLE} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input type="checkbox" checked={newCode.active ?? true} onChange={(e) => setNewCode((prev) => ({ ...prev, active: e.target.checked }))} />
          </div>
          <Btn onClick={handleAdd} style={{ width: '100%' }}>Save</Btn>
        </div>
      </div>
          </>}
        </div>
      </div>
    </Modal>
  );
}
