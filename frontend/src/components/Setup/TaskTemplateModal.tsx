import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, FolderOpen, Layers, Plus, Save, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { useAuth } from '../../contexts/AuthContext';
import { taskApi, taskTemplateApi } from '../../services/api';
import type { TaskTemplateItem, TaskTemplate } from '../../types';
import { Btn, C, FormRow, Input, Modal, Select } from '../Common';

function getTodayPassword(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

type CopySourceMode = 'project' | 'template';

interface Props {
  onClose: () => void;
}

export default function TaskTemplateModal({ onClose }: Props) {
  const { profile } = useAuth();
  const { activeProject, projects, fetchProjects, fetchTasks } = useStore();

  const [activeView, setActiveView] = useState<'copy' | 'templates'>('copy');
  const [loading, setLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [sourceMode, setSourceMode] = useState<CopySourceMode>('project');
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [sourceTemplateId, setSourceTemplateId] = useState('');
  const [password, setPassword] = useState('');

  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [itemsDraft, setItemsDraft] = useState<TaskTemplateItem[]>([]);

  const [createName, setCreateName] = useState('');
  const [createSourceProjectId, setCreateSourceProjectId] = useState('');

  const isAdmin = profile?.role === 'admin';

  const sourceProjectOptions = useMemo(() => {
    const currentId = activeProject?.id || '';
    return projects
      .filter((p) => p.id !== currentId)
      .map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }));
  }, [projects, activeProject?.id]);

  const allProjectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
    [projects],
  );

  const templateOptions = useMemo(
    () => templates.map((t) => ({ value: t.id, label: `Template ${t.templateNo} - ${t.name}` })),
    [templates],
  );

  useEffect(() => {
    if (!sourceProjectId && sourceProjectOptions.length > 0) {
      setSourceProjectId(sourceProjectOptions[0].value);
    }
    if (!createSourceProjectId && allProjectOptions.length > 0) {
      setCreateSourceProjectId(allProjectOptions[0].value);
    }
  }, [sourceProjectId, createSourceProjectId, sourceProjectOptions, allProjectOptions]);

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await taskTemplateApi.getAll();
      setTemplates(res.data);
      if (!selectedTemplateId && res.data.length > 0) {
        setSelectedTemplateId(res.data[0].id);
      }
      if (!sourceTemplateId && res.data.length > 0) {
        setSourceTemplateId(res.data[0].id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const loadTemplateItems = async (templateId: string) => {
    if (!templateId) {
      setItemsDraft([]);
      return;
    }
    try {
      const [templateRes, itemRes] = await Promise.all([
        taskTemplateApi.getAll(),
        taskTemplateApi.getItems(templateId),
      ]);
      const found = templateRes.data.find((t) => t.id === templateId);
      setTemplateNameDraft(found?.name || '');
      setItemsDraft(itemRes.data);
      setTemplates(templateRes.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load template items');
    }
  };

  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      loadTemplateItems(selectedTemplateId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId]);

  const handleConfirmCopy = async () => {
    if (!activeProject?.id) {
      toast.error('Please open a project first');
      return;
    }
    if (password.trim() !== getTodayPassword()) {
      toast.error('Invalid password');
      return;
    }

    setLoading(true);
    try {
      if (sourceMode === 'project') {
        if (!sourceProjectId) {
          toast.error('Please select source project');
          return;
        }
        await taskApi.replaceFromProject(sourceProjectId, activeProject.id);
      } else {
        if (!sourceTemplateId) {
          toast.error('Please select template');
          return;
        }
        await taskTemplateApi.applyToProject(sourceTemplateId, activeProject.id);
      }

      await fetchTasks(activeProject.id);
      toast.success('Tasks copied successfully');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Copy failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!isAdmin) {
      toast.error('Admin only');
      return;
    }
    if (!createName.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (!createSourceProjectId) {
      toast.error('Please select source project');
      return;
    }

    setLoading(true);
    try {
      const res = await taskTemplateApi.createFromProject(createName.trim(), createSourceProjectId);
      toast.success(`Created Template ${res.data.templateNo}`);
      setCreateName('');
      await loadTemplates();
      setSelectedTemplateId(res.data.id);
      setActiveView('templates');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create template');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplateName = async () => {
    if (!isAdmin) return;
    if (!selectedTemplateId || !templateNameDraft.trim()) {
      toast.error('Template name is required');
      return;
    }
    setLoading(true);
    try {
      await taskTemplateApi.updateTemplate(selectedTemplateId, { name: templateNameDraft.trim() });
      await loadTemplates();
      toast.success('Template name updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update template');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveItems = async () => {
    if (!isAdmin) return;
    if (!selectedTemplateId) {
      toast.error('Please select template');
      return;
    }
    setLoading(true);
    try {
      await taskTemplateApi.replaceItems(
        selectedTemplateId,
        itemsDraft.map((item) => ({
          wbs: item.wbs,
          parentWbs: item.parentWbs,
          level: Number(item.level || 0),
          sortOrder: Number(item.sortOrder || 0),
          taskName: item.taskName,
          duration: Number(item.duration || 0),
          effortManday: Number(item.effortManday || 0),
        })),
      );
      toast.success('Template items updated');
      await loadTemplateItems(selectedTemplateId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!isAdmin) return;
    if (!selectedTemplateId) return;
    if (!window.confirm('Delete this template?')) return;

    setLoading(true);
    try {
      await taskTemplateApi.removeTemplate(selectedTemplateId);
      toast.success('Template deleted');
      const remaining = templates.filter((t) => t.id !== selectedTemplateId);
      setSelectedTemplateId(remaining[0]?.id || '');
      setItemsDraft([]);
      await loadTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete template');
    } finally {
      setLoading(false);
    }
  };

  const updateItemField = (index: number, field: keyof TaskTemplateItem, value: string) => {
    setItemsDraft((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      if (field === 'duration' || field === 'effortManday' || field === 'sortOrder' || field === 'level') {
        next[index] = { ...current, [field]: Number(value || 0) } as TaskTemplateItem;
      } else {
        next[index] = { ...current, [field]: value } as TaskTemplateItem;
      }
      return next;
    });
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <Modal title="Task Copy & WBS Template" onClose={onClose} width={980}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn small variant={activeView === 'copy' ? 'primary' : 'ghost'} onClick={() => setActiveView('copy')}>
            <Copy size={14} /> Copy Tasks
          </Btn>
          <Btn small variant={activeView === 'templates' ? 'primary' : 'ghost'} onClick={() => setActiveView('templates')}>
            <Layers size={14} /> Templates
          </Btn>
        </div>

        {activeView === 'copy' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 13, color: C.text2 }}>
              Target Project: <strong>{activeProject?.name || '-'}</strong>
            </div>

            <FormRow label="Copy Source">
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setSourceMode('project')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${sourceMode === 'project' ? C.primary : C.border}`,
                    background: sourceMode === 'project' ? C.primaryBg : C.white,
                    color: sourceMode === 'project' ? C.primary : C.text,
                    cursor: 'pointer',
                  }}
                >
                  From Project
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('template')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${sourceMode === 'template' ? C.primary : C.border}`,
                    background: sourceMode === 'template' ? C.primaryBg : C.white,
                    color: sourceMode === 'template' ? C.primary : C.text,
                    cursor: 'pointer',
                  }}
                >
                  From Template
                </button>
              </div>
            </FormRow>

            {sourceMode === 'project' ? (
              <FormRow label="Source Project" required>
                <Select
                  value={sourceProjectId}
                  onChange={setSourceProjectId}
                  options={sourceProjectOptions.length ? sourceProjectOptions : [{ value: '', label: 'No source project available' }]}
                  disabled={!sourceProjectOptions.length}
                />
              </FormRow>
            ) : (
              <FormRow label="Template" required>
                <Select
                  value={sourceTemplateId}
                  onChange={setSourceTemplateId}
                  options={templateOptions.length ? templateOptions : [{ value: '', label: 'No template available' }]}
                  disabled={!templateOptions.length || templatesLoading}
                />
              </FormRow>
            )}

            <FormRow label="Password (ddmmyyyy)" required>
              <Input value={password} onChange={setPassword} placeholder="ddmmyyyy" />
            </FormRow>

            <div style={{ padding: '10px 12px', borderRadius: 10, background: C.amberBg, fontSize: 12, color: C.text2 }}>
              This action replaces all tasks in the target project.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
              <Btn
                onClick={handleConfirmCopy}
                disabled={loading || !activeProject?.id || !password.trim() || (sourceMode === 'project' ? !sourceProjectId : !sourceTemplateId)}
              >
                {loading ? 'Copying…' : 'Confirm Copy'}
              </Btn>
            </div>
          </div>
        )}

        {activeView === 'templates' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {!isAdmin && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: C.redBg, color: C.red, fontSize: 12 }}>
                Template create/edit/delete is available for admin only.
              </div>
            )}

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Create Template From Project</div>
              <FormRow label="Template Name" required>
                <Input value={createName} onChange={setCreateName} placeholder="Template name" />
              </FormRow>
              <FormRow label="Source Project" required>
                <Select
                  value={createSourceProjectId}
                  onChange={setCreateSourceProjectId}
                  options={allProjectOptions.length ? allProjectOptions : [{ value: '', label: 'No source project available' }]}
                  disabled={!allProjectOptions.length}
                />
              </FormRow>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn onClick={handleCreateTemplate} disabled={!isAdmin || loading || !createName.trim() || !createSourceProjectId}>
                  <Plus size={14} /> Create Template
                </Btn>
              </div>
            </div>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Edit Template</div>
                <Btn small variant="ghost" onClick={loadTemplates} disabled={templatesLoading}>
                  <FolderOpen size={14} /> Refresh
                </Btn>
              </div>

              <FormRow label="Template">
                <Select
                  value={selectedTemplateId}
                  onChange={setSelectedTemplateId}
                  options={templateOptions.length ? templateOptions : [{ value: '', label: 'No template available' }]}
                  disabled={!templateOptions.length}
                />
              </FormRow>

              {selectedTemplate && (
                <>
                  <FormRow label="Template Name">
                    <Input value={templateNameDraft} onChange={setTemplateNameDraft} />
                  </FormRow>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, color: C.text2 }}>
                      Template {selectedTemplate.templateNo}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn small onClick={handleSaveTemplateName} disabled={!isAdmin || loading || !templateNameDraft.trim()}>
                        <Save size={14} /> Save Name
                      </Btn>
                      <Btn small variant="danger" onClick={handleDeleteTemplate} disabled={!isAdmin || loading}>
                        <Trash2 size={14} /> Delete
                      </Btn>
                    </div>
                  </div>

                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '90px 100px 1fr 100px 110px', background: C.bg2 }}>
                      {['WBS', 'Parent WBS', 'Task Name', 'Duration', 'Effort'].map((label) => (
                        <div key={label} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: C.text2 }}>
                          {label}
                        </div>
                      ))}
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {itemsDraft.map((item, index) => (
                        <div key={item.id || `${item.wbs}-${index}`} style={{ display: 'grid', gridTemplateColumns: '90px 100px 1fr 100px 110px', borderTop: `1px solid ${C.border}` }}>
                          <div style={{ padding: 6 }}>
                            <Input value={item.wbs} onChange={(v) => updateItemField(index, 'wbs', v)} />
                          </div>
                          <div style={{ padding: 6 }}>
                            <Input value={item.parentWbs || ''} onChange={(v) => updateItemField(index, 'parentWbs', v)} />
                          </div>
                          <div style={{ padding: 6 }}>
                            <Input value={item.taskName} onChange={(v) => updateItemField(index, 'taskName', v)} />
                          </div>
                          <div style={{ padding: 6 }}>
                            <Input value={String(item.duration || 0)} onChange={(v) => updateItemField(index, 'duration', v)} type="number" />
                          </div>
                          <div style={{ padding: 6 }}>
                            <Input value={String(item.effortManday || 0)} onChange={(v) => updateItemField(index, 'effortManday', v)} type="number" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Btn onClick={handleSaveItems} disabled={!isAdmin || loading || !itemsDraft.length}>
                      <Save size={14} /> Save Template Items
                    </Btn>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
