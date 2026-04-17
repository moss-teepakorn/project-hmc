export type AppVersion = 'Humatrix' | 'Workplaze' | '';
export type EnvKey = 'dev' | 'qa' | 'uat' | 'production';

export interface EnvConfig {
  url: string;
  username: string;
  password: string;
}

export interface ProjectMeta {
  version: AppVersion;
  environments: Record<EnvKey, EnvConfig>;
}

const META_PREFIX = '__PM_META__:';

const emptyEnv = (): EnvConfig => ({ url: '', username: '', password: '' });

export const defaultProjectMeta = (): ProjectMeta => ({
  version: '',
  environments: {
    dev: emptyEnv(),
    qa: emptyEnv(),
    uat: emptyEnv(),
    production: emptyEnv(),
  },
});

export function parseProjectDescription(description: string): { notes: string; meta: ProjectMeta } {
  const raw = String(description || '');
  if (!raw.startsWith(META_PREFIX)) {
    return { notes: raw, meta: defaultProjectMeta() };
  }

  try {
    const payload = JSON.parse(raw.slice(META_PREFIX.length)) as {
      notes?: string;
      meta?: Partial<ProjectMeta>;
    };

    const base = defaultProjectMeta();
    const merged: ProjectMeta = {
      version: payload.meta?.version === 'Humatrix' || payload.meta?.version === 'Workplaze' ? payload.meta.version : '',
      environments: {
        dev: { ...base.environments.dev, ...(payload.meta?.environments?.dev || {}) },
        qa: { ...base.environments.qa, ...(payload.meta?.environments?.qa || {}) },
        uat: { ...base.environments.uat, ...(payload.meta?.environments?.uat || {}) },
        production: { ...base.environments.production, ...(payload.meta?.environments?.production || {}) },
      },
    };

    return { notes: String(payload.notes || ''), meta: merged };
  } catch {
    return { notes: raw, meta: defaultProjectMeta() };
  }
}

export function buildProjectDescription(notes: string, meta: ProjectMeta): string {
  const payload = {
    notes: String(notes || ''),
    meta,
  };
  return `${META_PREFIX}${JSON.stringify(payload)}`;
}

export function normalizeUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}