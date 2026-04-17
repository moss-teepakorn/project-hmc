import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Project, ProjectEnvironment } from '../../types';
import { useStore } from '../../store';
import { Btn, C, Card, ConfirmModal, FormRow, Input, Modal, Select, TH, TD } from '../Common';

interface Props { project: Project; }

const ENV_OPTIONS: Array<ProjectEnvironment['environment']> = [
  'DEV',
  'QA',
  'UAT',
  'Production',
];

export default function ProjectEnvironmentTab({ project }: Props) {
  const {
    projectEnvironments,
    fetchProjectEnvironments,
    createProjectEnvironment,
    updateProjectEnvironment,
    deleteProjectEnvironment,
    updateProject,
  } = useStore();

  const [modal, setModal] = useState<Partial<ProjectEnvironment> | null>(null);
  const [deleting, setDeleting] = useState<ProjectEnvironment | null>(null);
  const [version, setVersion] = useState<Project['softwareVersion']>(project.softwareVersion || '');

  useEffect(() => {
    fetchProjectEnvironments(project.id);
  }, [project.id, fetchProjectEnvironments]);

  useEffect(() => {
    setVersion(project.softwareVersion || '');
  }, [project.softwareVersion, project.id]);

  const rows = useMemo(
    () => projectEnvironments
      .filter((e) => e.projectId === project.id)
      .sort((a, b) => ENV_OPTIONS.indexOf(a.environment) - ENV_OPTIONS.indexOf(b.environment)),
    [projectEnvironments, project.id]
  );

  const openUrl = (url: string) => {
    const trimmed = String(url || '').trim();
    const next = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    if (!next) {
      toast.error('URL is empty');
      return;
    }
    window.open(next, '_blank', 'noopener,noreferrer');
  };

  const saveVersion = async () => {
    try {
      await updateProject(project.id, {
        softwareVersion: version,
      });
      toast.success('Version saved');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save version';
      toast.error(msg || 'Failed to save version');
    }
  };

  const handleSaveEnvironment = async (form: Partial<ProjectEnvironment>) => {
    try {
      const payload: Partial<ProjectEnvironment> = {
        ...form,
        projectId: project.id,
      };
      if (form.id) {
        await updateProjectEnvironment(form.id, payload);
        toast.success('Environment updated');
      } else {
        await createProjectEnvironment(payload);
        toast.success('Environment created');
      }
      setModal(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save environment';
      toast.error(msg || 'Failed to save environment');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteProjectEnvironment(deleting.id);
      toast.success('Environment deleted');
      setDeleting(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete environment';
      toast.error(msg || 'Failed to delete environment');
    }
  };

  return (
    <div style={{ padding: 24, background: C.bg, height: '100%', overflowY: 'auto' }}>
      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 180 }}>
            <FormRow label="Software Version">
              <Select
                value={version}
                onChange={(v) => setVersion(v as Project['softwareVersion'])}
                options={[
                  { value: '', label: '— Select Version —' },
                  { value: 'Humatrix', label: 'Humatrix' },
                  { value: 'Workplaze', label: 'Workplaze' },
                ]}
              />
            </FormRow>
          </div>
          <div style={{ marginTop: 6 }}>
            <Btn small onClick={saveVersion}>Save Version</Btn>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <Btn small onClick={() => setModal({ environment: 'DEV', url: '', username: '', password: '' })}>
          <Plus size={14} /> Add Environment
        </Btn>
      </div>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {['Env', 'URL', 'User', 'Password', 'Open', ''].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} style={{ background: i % 2 === 0 ? C.white : C.bg }}>
                <td style={{ ...TD, fontWeight: 700 }}>{row.environment}</td>
                <td style={{ ...TD, color: C.text2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.url || '—'}</td>
                <td style={TD}>{row.username || '—'}</td>
                <td style={TD}>{row.password || '—'}</td>
                <td style={TD}>
                  <Btn variant="outline" small onClick={() => openUrl(row.url)} disabled={!row.url?.trim()}>
                    <ExternalLink size={12} /> Open URL
                  </Btn>
                </td>
                <td style={TD}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setModal(row)} style={{ background: C.primaryBg, border: 'none', borderRadius: 6, padding: '4px 10px', color: C.primary, cursor: 'pointer' }}><Pencil size={11} /></button>
                    <button onClick={() => setDeleting(row)} style={{ background: C.redBg, border: 'none', borderRadius: 6, padding: '4px 10px', color: C.red, cursor: 'pointer' }}><Trash2 size={11} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: C.text3 }}>No environment URLs yet.</div>}
      </Card>

      {modal !== null && (
        <EnvironmentModal data={modal} onClose={() => setModal(null)} onSave={handleSaveEnvironment} />
      )}
      {deleting && (
        <ConfirmModal
          message={`Delete ${deleting.environment} environment?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function EnvironmentModal({ data, onClose, onSave }: {
  data: Partial<ProjectEnvironment>;
  onClose: () => void;
  onSave: (f: Partial<ProjectEnvironment>) => void;
}) {
  const [form, setForm] = useState<Partial<ProjectEnvironment>>({
    environment: 'DEV',
    url: '',
    username: '',
    password: '',
    ...data,
  });

  const up = (k: keyof ProjectEnvironment, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title={form.id ? 'Edit Environment URL' : 'Add Environment URL'} onClose={onClose} width={520}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
        <FormRow label="Environment" required>
          <Select
            value={form.environment ?? 'DEV'}
            onChange={(v) => up('environment', v)}
            options={ENV_OPTIONS.map((e) => ({ value: e, label: e }))}
          />
        </FormRow>
        <FormRow label="URL" required>
          <Input value={form.url ?? ''} onChange={(v) => up('url', v)} placeholder="https://example.com" />
        </FormRow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormRow label="User"><Input value={form.username ?? ''} onChange={(v) => up('username', v)} placeholder="Username" /></FormRow>
          <FormRow label="Password"><Input value={form.password ?? ''} onChange={(v) => up('password', v)} placeholder="Password" /></FormRow>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => {
          if (!form.url?.trim()) {
            toast.error('URL is required');
            return;
          }
          onSave(form);
        }}>Save</Btn>
      </div>
    </Modal>
  );
}
