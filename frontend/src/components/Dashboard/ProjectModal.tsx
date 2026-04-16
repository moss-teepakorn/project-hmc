import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { taskApi } from '../../services/api';
import { Modal, FormRow, Input, Select, Textarea, Btn } from '../Common';
import type { Project } from '../../types';

const COLORS = ['#4F46E5','#0EA5E9','#10B981','#F59E0B','#EC4899','#EF4444','#8B5CF6','#F97316'];

interface Props { project?: Project; onClose: () => void; }

export default function ProjectModal({ project, onClose }: Props) {
  const { createProject, updateProject, projects } = useStore();
  const [saving, setSaving] = useState(false);
  const [copyFromProjectId, setCopyFromProjectId] = useState('');
  const [form, setForm] = useState({
    name:        project?.name        ?? '',
    code:        project?.code        ?? '',
    client:      project?.client      ?? '',
    status:      project?.status      ?? 'Planning',
    startDate:   project?.startDate   ?? '',
    endDate:     project?.endDate     ?? '',
    description: project?.description ?? '',
    color:       project?.color       ?? '#4F46E5',
  });

  const up = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Project name is required'); return; }
    setSaving(true);
    try {
      if (project) { await updateProject(project.id, form); toast.success('Project updated'); }
      else {
        const created = await createProject(form);
        if (copyFromProjectId) {
          await taskApi.copyFromProject(copyFromProjectId, created.id);
          toast.success('Project created with copied tasks');
        } else {
          toast.success('Project created');
        }
      }
      onClose();
    } catch { toast.error('Failed to save project'); }
    setSaving(false);
  };

  return (
    <Modal title={project ? 'Edit Project' : 'New Project'} onClose={onClose}>
      <FormRow label="Project Name" required>
        <Input autoFocus value={form.name} onChange={v => up('name', v)} placeholder="e.g. E-Commerce Platform" />
      </FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormRow label="Project Code">
          <Input value={form.code} onChange={v => up('code', v)} placeholder="e.g. ECP-2024" />
        </FormRow>
        <FormRow label="Status">
          <Select value={form.status} onChange={v => up('status', v)}
            options={[
              { value: 'Planning',     label: 'Planning' },
              { value: 'Req & Design', label: 'Req & Design' },
              { value: 'Setup',        label: 'Setup' },
              { value: 'Testing',      label: 'Testing' },
              { value: 'Go Live',      label: 'Go Live' },
              { value: 'Hyper Care',   label: 'Hyper Care' },
            ]} />
        </FormRow>
      </div>
      <FormRow label="Client">
        <Input value={form.client} onChange={v => up('client', v)} placeholder="Client company name" />
      </FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormRow label="Start Date"><Input type="date" value={form.startDate} onChange={v => up('startDate', v)} /></FormRow>
        <FormRow label="End Date"><Input type="date" value={form.endDate} onChange={v => up('endDate', v)} /></FormRow>
      </div>
      <FormRow label="Description">
        <Textarea value={form.description} onChange={v => up('description', v)} rows={2} placeholder="Brief project description…" />
      </FormRow>
      {!project && (
        <FormRow label="Copy Tasks From Previous Project">
          <Select
            value={copyFromProjectId}
            onChange={setCopyFromProjectId}
            options={[
              { value: '', label: '— Do not copy —' },
              ...projects
                .map(p => ({ value: p.id, label: `${p.code || p.id} - ${p.name}` })),
            ]}
          />
        </FormRow>
      )}
      <FormRow label="Color">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {COLORS.map(c => (
            <div key={c} onClick={() => up('color', c)}
              style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '3px solid #0F172A' : '3px solid transparent', transition: 'all 0.15s' }} />
          ))}
        </div>
      </FormRow>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : project ? 'Save Changes' : 'Create Project'}</Btn>
      </div>
    </Modal>
  );
}
