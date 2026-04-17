import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { Project } from '../../types';
import { useStore } from '../../store';
import { Btn, C, FormRow, Input, Select } from '../Common';
import { AppVersion, EnvKey, ProjectMeta, buildProjectDescription, normalizeUrl, parseProjectDescription } from '../../utils/projectMeta';

interface Props {
  project: Project;
}

const ENV_LIST: Array<{ key: EnvKey; label: string }> = [
  { key: 'dev', label: 'DEV' },
  { key: 'qa', label: 'QA' },
  { key: 'uat', label: 'UAT' },
  { key: 'production', label: 'Production' },
];

export default function ProjectEnvironmentTab({ project }: Props) {
  const updateProject = useStore((s) => s.updateProject);
  const [notes, setNotes] = useState('');
  const [meta, setMeta] = useState<ProjectMeta>(() => parseProjectDescription(project.description).meta);

  useEffect(() => {
    const parsed = parseProjectDescription(project.description);
    setNotes(parsed.notes);
    setMeta(parsed.meta);
  }, [project.id, project.description]);

  const updateEnv = (env: EnvKey, field: 'url' | 'username' | 'password', value: string) => {
    setMeta((prev) => ({
      ...prev,
      environments: {
        ...prev.environments,
        [env]: {
          ...prev.environments[env],
          [field]: value,
        },
      },
    }));
  };

  const openEnvUrl = (env: EnvKey) => {
    const next = normalizeUrl(meta.environments[env].url);
    if (!next) {
      toast.error('URL is empty');
      return;
    }
    window.open(next, '_blank', 'noopener,noreferrer');
  };

  const handleSave = async () => {
    try {
      await updateProject(project.id, {
        description: buildProjectDescription(notes, meta),
      });
      toast.success('Environment settings saved');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save environment settings';
      toast.error(msg || 'Failed to save environment settings');
    }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, padding: 16 }}>
      <div style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
        boxShadow: C.shadow,
        marginBottom: 12,
      }}>
        <FormRow label="Project Version">
          <Select
            value={meta.version}
            onChange={(v) => setMeta((prev) => ({ ...prev, version: v as AppVersion }))}
            options={[
              { value: '', label: '— Select Version —' },
              { value: 'Humatrix', label: 'Humatrix' },
              { value: 'Workplaze', label: 'Workplaze' },
            ]}
          />
        </FormRow>
        <div style={{ fontSize: 12, color: C.text3, marginTop: -6 }}>
          Select which program version this project is using.
        </div>
      </div>

      {ENV_LIST.map((env) => {
        const cfg = meta.environments[env.key];
        return (
          <div
            key={env.key}
            style={{
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 16,
              boxShadow: C.shadow,
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{env.label}</div>
              <Btn
                variant="outline"
                small
                onClick={() => openEnvUrl(env.key)}
                disabled={!cfg.url.trim()}
              >
                Open URL
              </Btn>
            </div>

            <FormRow label={`${env.label} URL`}>
              <Input
                value={cfg.url}
                onChange={(v) => updateEnv(env.key, 'url', v)}
                placeholder="https://example.com"
              />
            </FormRow>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormRow label="User">
                <Input
                  value={cfg.username}
                  onChange={(v) => updateEnv(env.key, 'username', v)}
                  placeholder="Username"
                />
              </FormRow>
              <FormRow label="Password">
                <Input
                  type="text"
                  value={cfg.password}
                  onChange={(v) => updateEnv(env.key, 'password', v)}
                  placeholder="Password"
                />
              </FormRow>
            </div>
          </div>
        );
      })}

      <div style={{ position: 'sticky', bottom: 0, background: C.bg, paddingTop: 6, paddingBottom: 6, display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={handleSave}>Save Environment Settings</Btn>
      </div>
    </div>
  );
}
