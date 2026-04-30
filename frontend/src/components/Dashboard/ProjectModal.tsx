import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { taskApi } from '../../services/api';
import { Modal, FormRow, Input, Select, Textarea, Btn } from '../Common';
import type { Project } from '../../types';

const COLORS = ['#4F46E5','#0EA5E9','#10B981','#F59E0B','#EC4899','#EF4444','#8B5CF6','#F97316'];

interface Props { project?: Project; onClose: () => void; }

interface ProjectForm {
  name: string;
  code: string;
  client: string;
  status: string;
  startDate: string;
  endDate: string;
  description: string;
  color: string;
  emailNotificationEnabled: boolean;
  emailNotificationMode: string;
  emailNotificationRecipients: string;
  emailNotificationTime: string;
}

function normalizeDescription(raw: string): string {
  if (!raw?.startsWith('__PM_META__:')) return raw || '';
  try {
    const parsed = JSON.parse(raw.replace('__PM_META__:', '')) as { notes?: string };
    return parsed.notes || '';
  } catch {
    return '';
  }
}

export default function ProjectModal({ project, onClose }: Props) {
  const { createProject, updateProject, projects, masterCodes } = useStore();
  const [saving, setSaving] = useState(false);
  const [copyFromProjectId, setCopyFromProjectId] = useState('');
  const [copyScope, setCopyScope] = useState<'all' | 'main'>('all');
  const [testing, setTesting] = useState(false);
  const statusOptions = masterCodes
    .filter((code) => code.codeType === 'project_status' && code.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((code) => ({ value: code.codeValue, label: code.label }));

  const [form, setForm] = useState({
    name:                        project?.name                        ?? '',
    code:                        project?.code                        ?? '',
    client:                      project?.client                      ?? '',
    status:                      project?.status ?? statusOptions[0]?.value ?? 'Planning',
    startDate:                   project?.startDate                   ?? '',
    endDate:                     project?.endDate                     ?? '',
    description:                 normalizeDescription(project?.description ?? ''),
    color:                       project?.color                       ?? '#4F46E5',
    emailNotificationEnabled:    project?.emailNotificationEnabled    ?? false,
    emailNotificationMode:       project?.emailNotificationMode       ?? 'task',
    emailNotificationRecipients: project?.emailNotificationRecipients ?? '',
    emailNotificationTime:       project?.emailNotificationTime       ?? '08:00',
  });

  const statusOptions = masterCodes
    .filter((code) => code.codeType === 'project_status' && code.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((code) => ({ value: code.codeValue, label: code.label }));

  const fallbackStatusOptions = [
    { value: 'Planning', label: 'Planning' },
    { value: 'Req & Design', label: 'Req & Design' },
    { value: 'Setup', label: 'Setup' },
    { value: 'Testing', label: 'Testing' },
    { value: 'Go Live', label: 'Go Live' },
    { value: 'Hyper Care', label: 'Hyper Care' },
  ];

  const statusDropdownOptions = (() => {
    const baseOptions = statusOptions.length > 0 ? statusOptions : fallbackStatusOptions;
    if (form.status && !baseOptions.some((option) => option.value === form.status)) {
      return [{ value: form.status, label: form.status }, ...baseOptions];
    }
    return baseOptions;
  })();

  const up = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Project name is required'); return; }
    setSaving(true);
    try {
      if (project) { await updateProject(project.id, form); toast.success('Project updated'); }
      else {
        const created = await createProject(form);
        if (copyFromProjectId) {
          await taskApi.copyFromProject(copyFromProjectId, created.id, copyScope);
          toast.success(copyScope === 'main' ? 'Project created with copied main tasks' : 'Project created with copied tasks');
        } else {
          toast.success('Project created');
        }
      }
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save project';
      toast.error(msg || 'Failed to save project');
    }
    setSaving(false);
  };

  const handleTestSend = async () => {
    if (!project?.id) return;
    setTesting(true);
    try {
      const res = await fetch('/api/send-task-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, test: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Test send failed');
      const result = data?.results?.[0];
      if (result?.error) {
        toast.error(`Test send failed: ${result.error}`);
      } else {
        toast.success('Test email sent successfully');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Test send failed';
      toast.error(msg);
    }
    setTesting(false);
  };

  return (
    <Modal title={project ? 'Edit Project' : 'New Project'} onClose={onClose} width={960}>
      <FormRow label="Project Name" required>
        <Input autoFocus value={form.name} onChange={v => up('name', v)} placeholder="e.g. E-Commerce Platform" />
      </FormRow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormRow label="Project Code">
          <Input value={form.code} onChange={v => up('code', v)} placeholder="e.g. ECP-2024" />
        </FormRow>
        <FormRow label="Status">
          <Select value={form.status} onChange={v => up('status', v)} options={statusDropdownOptions} />
        </FormRow>
        <FormRow label="Client">
          <Input value={form.client} onChange={v => up('client', v)} placeholder="Client company name" />
        </FormRow>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormRow label="Start Date"><Input type="date" value={form.startDate} onChange={v => up('startDate', v)} /></FormRow>
        <FormRow label="End Date"><Input type="date" value={form.endDate} onChange={v => up('endDate', v)} /></FormRow>
        <FormRow label="Color">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <div key={c} onClick={() => up('color', c)}
                style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '3px solid #0F172A' : '3px solid transparent', transition: 'all 0.15s' }} />
            ))}
          </div>
        </FormRow>
      </div>
      <FormRow label="Description">
        <Textarea value={form.description} onChange={v => up('description', v)} rows={2} placeholder="Brief project description…" />
      </FormRow>
      {!project && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
          <div />
          {copyFromProjectId && (
            <FormRow label="Copy Scope">
              <Select
                value={copyScope}
                onChange={(v) => setCopyScope(v as 'all' | 'main')}
                options={[
                  { value: 'all', label: 'Copy All Tasks (Main + Sub)' },
                  { value: 'main', label: 'Copy Main Tasks Only' },
                ]}
              />
            </FormRow>
          )}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormRow label="Enable Email Reminder">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={form.emailNotificationEnabled}
              onChange={(e) => up('emailNotificationEnabled', e.target.checked)}
            />
            <span style={{ fontSize: 13, color: '#334155' }}>Send daily reminder emails</span>
          </div>
        </FormRow>
        <FormRow label="Reminder Mode">
          <Select value={form.emailNotificationMode} onChange={v => up('emailNotificationMode', v)}
            options={[
              { value: 'task', label: 'Use task assignees and fallback recipients' },
              { value: 'custom', label: 'Send only to custom recipients' },
            ]} />
        </FormRow>
        <FormRow label="Reminder Time">
          <Input type="time" value={form.emailNotificationTime} onChange={v => up('emailNotificationTime', v)} />
        </FormRow>
      </div>
      <FormRow label="Custom Recipients">
        <Input
          value={form.emailNotificationRecipients}
          onChange={v => up('emailNotificationRecipients', v)}
          placeholder="somchai@domain.com, apichart@domain.com"
        />
      </FormRow>
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>
        If task assignee email is not available, fallback recipients from Custom Recipients will be used.
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
        {project && (
          <Btn variant="outline" onClick={handleTestSend} disabled={testing}>
            {testing ? 'Sending test…' : 'Send Test Email'}
          </Btn>
        )}
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : project ? 'Save Changes' : 'Create Project'}</Btn>
      </div>
    </Modal>
  );
}
