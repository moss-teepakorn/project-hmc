// ── User Role Management (Admin Only) ─────────────────────────────────────
export async function updateUserRole(userId: string, newRole: 'admin' | 'member' | 'client'): Promise<void> {
  // Get current user profile for role
  const { data: userData } = await supabase.auth.getUser();
  let role = 'member';
  let myId = '';
  if (userData?.user?.id) {
    myId = userData.user.id;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', myId).single();
    if (profile?.role) role = profile.role;
  }
  if (role !== 'admin') throw new Error('FORBIDDEN');
  if (!['admin','member','client'].includes(newRole)) throw new Error('INVALID_ROLE');
  const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
  if (error) throw new Error(error.message);
}
// ── RBAC Utility ──────────────────────────────────────────────────────────
export async function checkProjectPermission(projectId: string, action: 'read' | 'write'): Promise<boolean> {
  const { role, userId, email } = await getCurrentUserRoleAndId();
  if (role === 'admin') return true;
  if (role === 'client') return action === 'read' && await isProjectMember(projectId, userId, email);
  if (role === 'member') return await isProjectMember(projectId, userId, email);
  return false;
}

async function getProjectIdsFromMembership(userId: string, email: string | null): Promise<string[]> {
  const ids = new Set<string>();

  if (userId) {
    const { data: pmData, error: pmErr } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', userId);
    if (pmErr) throw new Error(pmErr.message);
    (pmData || []).forEach((row: any) => { if (row.project_id) ids.add(row.project_id); });
  }

  if (ids.size === 0 && email) {
    const { data: memberRows, error: memberErr } = await supabase
      .from('members')
      .select('project_id')
      .ilike('email', email);
    if (memberErr) throw new Error(memberErr.message);
    (memberRows || []).forEach((row: any) => { if (row.project_id) ids.add(row.project_id); });
  }

  if (ids.size === 0 && userId) {
    const { data: memberRows, error: memberErr } = await supabase
      .from('members')
      .select('project_id')
      .eq('user_id', userId);
    if (memberErr) throw new Error(memberErr.message);
    (memberRows || []).forEach((row: any) => { if (row.project_id) ids.add(row.project_id); });
  }

  return Array.from(ids);
}

async function isProjectMember(projectId: string, userId: string, email: string | null): Promise<boolean> {
  const { data, error } = await supabase
    .from('project_members')
    .select('id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return true;

  if (!email) return false;
  const { data: memberData, error: memberErr } = await supabase
    .from('members')
    .select('project_id')
    .eq('project_id', projectId)
    .ilike('email', email)
    .limit(1);
  if (memberErr) throw new Error(memberErr.message);
  return Array.isArray(memberData) && memberData.length > 0;
}

// helper: get current user id and role (with short-lived cache to avoid lock contention)
let _authCache: { role: string; userId: string; email: string | null; expiresAt: number } | null = null;
const AUTH_CACHE_TTL_MS = 30_000;

export function clearAuthCache(): void {
  _authCache = null;
}

// Deduplicate concurrent calls: if a fetch is in-flight, queue behind it
let _authFetchPromise: Promise<{ role: string; userId: string; email: string | null }> | null = null;

export async function getCurrentUserRoleAndId(): Promise<{ role: string; userId: string; email: string | null }> {
  const now = Date.now();
  if (_authCache && _authCache.expiresAt > now) {
    return { role: _authCache.role, userId: _authCache.userId, email: _authCache.email };
  }
  if (_authFetchPromise) return _authFetchPromise;

  _authFetchPromise = (async () => {
    const { data: userData } = await supabase.auth.getUser();
    let role = 'member';
    let userId = '';
    let email: string | null = null;
    if (userData?.user?.id) {
      userId = userData.user.id;
      const { data: profile, error } = await supabase.from('profiles').select('role,email').eq('id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      if ((profile as any)?.role) role = (profile as any).role;
      if ((profile as any)?.email) email = (profile as any).email;
      if (!email && userData.user.email) {
        email = userData.user.email;
      }
    }
    _authCache = { role, userId, email, expiresAt: Date.now() + AUTH_CACHE_TTL_MS };
    return { role, userId, email };
  })().finally(() => { _authFetchPromise = null; });

  return _authFetchPromise;
}
import { compareWbs } from '../utils';

// ===== SUPABASE API SERVICE =====
// All data operations go through Supabase PostgreSQL directly.
// No custom backend needed.

import { supabase } from './supabase';
import { parseISO, isValid } from 'date-fns';
import type { Project, Task, Member, Milestone, Effort, ChangeRequest, CRItem, Issue, Risk, ProjectEnvironment, ProjectProgressSnapshot, MasterCode, TaskTemplate, TaskTemplateItem } from '../types';

// ── Snake ↔ Camel conversion helpers ────────────────────────────────────────

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function rowToObj<T>(row: Record<string, unknown>): T {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    obj[snakeToCamel(k)] = v;
  }
  return obj as T;
}

function objToRow(obj: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'monthly' || k === 'items') continue; // skip virtual fields
    row[camelToSnake(k)] = v;
  }
  return row;
}

function rowsToObjs<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => rowToObj<T>(r));
}

// ── Projects ────────────────────────────────────────────────────────────────

export const projectApi = {
  getAll: async (): Promise<{ data: Project[] }> => {
    const { role, userId, email } = await getCurrentUserRoleAndId();
    if (role === 'admin') {
      // Admin เห็นทุก project
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return { data: rowsToObjs<Project>(data || []) };
    } else {
      // Member/Client เห็นเฉพาะ project ที่อยู่ใน project_members หรือ members
      const projectIds = await getProjectIdsFromMembership(userId, email);
      if (!projectIds.length) return { data: [] };
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .in('id', projectIds)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return { data: rowsToObjs<Project>(data || []) };
    }
  },

  create: async (p: Partial<Project>): Promise<{ data: Project }> => {
    const { role } = await getCurrentUserRoleAndId();
    if (role !== 'admin') throw new Error('FORBIDDEN');
    const row = objToRow(p as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    delete row.updated_at;
    const { data, error } = await supabase
      .from('projects')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<Project>(data) };
  },

  update: async (id: string, p: Partial<Project>): Promise<{ data: Project }> => {
    const can = await checkProjectPermission(id, 'write');
    if (!can) throw new Error('FORBIDDEN');
    const row = objToRow(p as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    delete row.updated_at;
    const { data, error } = await supabase
      .from('projects')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<Project>(data) };
  },

  remove: async (id: string): Promise<void> => {
    const can = await checkProjectPermission(id, 'write');
    if (!can) throw new Error('FORBIDDEN');
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ── Project Environments ───────────────────────────────────────────────────

export const projectEnvironmentApi = {
  getByProject: async (pid?: string): Promise<{ data: ProjectEnvironment[] }> => {
    let q = supabase.from('project_environments').select('*');
    if (pid) q = q.eq('project_id', pid);
    q = q.order('created_at', { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: rowsToObjs<ProjectEnvironment>(data || []) };
  },

  create: async (env: Partial<ProjectEnvironment>): Promise<{ data: ProjectEnvironment }> => {
    const row = objToRow(env as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('project_environments')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<ProjectEnvironment>(data) };
  },

  update: async (id: string, env: Partial<ProjectEnvironment>): Promise<{ data: ProjectEnvironment }> => {
    const row = objToRow(env as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('project_environments')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<ProjectEnvironment>(data) };
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('project_environments').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

export const projectProgressApi = {
  getByProject: async (pid?: string): Promise<{ data: ProjectProgressSnapshot[] }> => {
    const q = supabase.from('project_progress_snapshots').select('*').order('snapshot_date', { ascending: true });
    const query = pid ? q.eq('project_id', pid) : q;
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { data: rowsToObjs<ProjectProgressSnapshot>(data || []) };
  },

  save: async (snapshot: Partial<ProjectProgressSnapshot>): Promise<{ data: ProjectProgressSnapshot }> => {
    if (!snapshot.projectId) throw new Error('MISSING_PROJECT_ID');
    const can = await checkProjectPermission(snapshot.projectId, 'write');
    if (!can) throw new Error('FORBIDDEN');
    const row = objToRow(snapshot as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    delete row.updated_at;

    if (snapshot.id) {
      const { data, error } = await supabase
        .from('project_progress_snapshots')
        .update(row)
        .eq('id', snapshot.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { data: rowToObj<ProjectProgressSnapshot>(data) };
    }

    const { data, error } = await supabase
      .from('project_progress_snapshots')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<ProjectProgressSnapshot>(data) };
  },

  remove: async (id: string): Promise<void> => {
    const { data, error: fetchErr } = await supabase.from('project_progress_snapshots').select('project_id').eq('id', id).maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    const projectId = (data as any)?.project_id;
    if (!projectId) throw new Error('MISSING_PROJECT_ID');
    const can = await checkProjectPermission(projectId, 'write');
    if (!can) throw new Error('FORBIDDEN');
    const { error } = await supabase.from('project_progress_snapshots').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

export const masterCodeApi = {
  getAll: async (codeType?: string): Promise<{ data: MasterCode[] }> => {
    let q = supabase.from('masters_code').select('*');
    if (codeType) q = q.eq('code_type', codeType);
    q = q.order('sort_order', { ascending: true }).order('code_value', { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: rowsToObjs<MasterCode>(data || []) };
  },

  create: async (m: Partial<MasterCode>): Promise<{ data: MasterCode }> => {
    const user = await getCurrentUserRoleAndId();
    if (user.role !== 'admin') throw new Error('FORBIDDEN');
    const row = objToRow(m as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    delete row.updated_at;
    const { data, error } = await supabase.from('masters_code').insert(row).select().single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<MasterCode>(data) };
  },

  update: async (id: string, m: Partial<MasterCode>): Promise<{ data: MasterCode }> => {
    const user = await getCurrentUserRoleAndId();
    if (user.role !== 'admin') throw new Error('FORBIDDEN');
    const row = objToRow(m as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    delete row.updated_at;
    const { data, error } = await supabase.from('masters_code').update(row).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<MasterCode>(data) };
  },

  remove: async (id: string): Promise<void> => {
    const user = await getCurrentUserRoleAndId();
    if (user.role !== 'admin') throw new Error('FORBIDDEN');
    const { error } = await supabase.from('masters_code').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ── Tasks ───────────────────────────────────────────────────────────────────

export const taskApi = {
  getByProject: async (pid?: string): Promise<{ data: Task[] }> => {
    let q = supabase.from('tasks').select('*');
    if (pid) q = q.eq('project_id', pid);
    q = q.order('order', { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const tasks = rowsToObjs<Task>(data || []);
    const normalized = tasks.map((task) => {
      const normalizedEffort = normalizeEffortManday((task as any).effortManday);
      const withEffort = normalizedEffort !== Number((task as any).effortManday || 0)
        ? { ...task, effortManday: normalizedEffort }
        : { ...task, effortManday: Number((task as any).effortManday || 0) };
      if (!task.startDate || !task.endDate) return withEffort;
      const calculated = calcDurationFromDates(task);
      return withEffort.duration !== calculated ? { ...withEffort, duration: calculated } : withEffort;
    });
    const mismatches = normalized.filter((task, index) => task.duration !== tasks[index].duration);
    if (mismatches.length > 0) {
      for (const task of mismatches) {
        await supabase.from('tasks').update({ duration: task.duration }).eq('id', task.id);
      }
    }
    return { data: normalized };
  },

  create: async (t: Partial<Task>): Promise<{ data: Task; allTasks: Task[] }> => {
    const row = objToRow(t as Record<string, unknown>);
        if (row.effort_manday !== undefined) {
          row.effort_manday = normalizeEffortManday(row.effort_manday);
        }

    delete row.id;
    delete row.created_at;

    const requestedOrder = Number(row.order);
    const projectId = String(row.project_id || '');
    const normalizeParent = (v: unknown): string => {
      if (v === null || v === undefined || v === '') return '';
      return String(v);
    };

    // Insert-before/after from UI sends .5 order markers. Convert them to integer slots.
    if (projectId && Number.isFinite(requestedOrder) && !Number.isInteger(requestedOrder)) {
      const insertSlot = Math.max(1, Math.ceil(requestedOrder));
      const targetParent = normalizeParent(row.parent_id);

      const { data: siblingRows, error: siblingErr } = await supabase
        .from('tasks')
        .select('id, "order", parent_id')
        .eq('project_id', projectId);
      if (siblingErr) throw new Error(siblingErr.message);

      const siblings = (siblingRows || [])
        .filter((s) => normalizeParent(s.parent_id) === targetParent)
        .filter((s) => Number(s.order) >= insertSlot)
        .sort((a, b) => Number(b.order) - Number(a.order));

      for (const s of siblings) {
        await supabase
          .from('tasks')
          .update({ order: Number(s.order) + 1 })
          .eq('id', s.id);
      }

      row.order = insertSlot;
    }

    if (Number.isFinite(requestedOrder) && Number.isInteger(requestedOrder)) {
      row.order = requestedOrder;
    }

    // permission: must have write access to project
    if (!projectId) throw new Error('MISSING_PROJECT_ID');
    const okCreate = await checkProjectPermission(projectId, 'write');
    if (!okCreate) throw new Error('FORBIDDEN');

    const { data, error } = await supabase
      .from('tasks')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    const created = rowToObj<Task>(data);
    // Fetch all tasks and recalc full structure + parent dates/percent
    const all = await taskApi.getByProject(created.projectId);
    const structured = recalcStructure(all.data);
    const allTasks = recalcParents(structured);
    await persistTaskChanges(all.data, allTasks);
    return { data: created, allTasks };
  },

  update: async (id: string, t: Partial<Task>): Promise<{ data: Task; allTasks: Task[] }> => {
    const row = objToRow(t as Record<string, unknown>);
        if (row.effort_manday !== undefined) {
          row.effort_manday = normalizeEffortManday(row.effort_manday);
        }

    delete row.id;
    delete row.created_at;
    // permission: must have write access to project
    const { data: existing } = await supabase.from('tasks').select('project_id').eq('id', id).maybeSingle();
    const projectIdForUpdate = (existing as any)?.project_id || row.project_id;
    if (!projectIdForUpdate) throw new Error('MISSING_PROJECT_ID');
    const okUpdate = await checkProjectPermission(projectIdForUpdate, 'write');
    if (!okUpdate) throw new Error('FORBIDDEN');

    const { data, error } = await supabase
      .from('tasks')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    let updatedData = data;
    if (error) {
      const statusValue = row.status as string | undefined;
      if (statusValue !== undefined) {
        const statusAlternatives: Record<string, string> = {
          'Block/Delay': 'Blocked/Delay',
          'Blocked/Delay': 'Block/Delay',
          'Review': 'Block/Delay',
        };
        const altStatus = statusAlternatives[statusValue];
        if (altStatus) {
          const retry = await supabase
            .from('tasks')
            .update({ ...row, status: altStatus })
            .eq('id', id)
            .select()
            .single();
          if (!retry.error) {
            updatedData = retry.data;
          }
        }
      }
      if (!updatedData) {
        const fallbackRow = { ...row } as Record<string, unknown>;
        delete fallbackRow.status;
        if (fallbackRow.percent_complete === undefined && statusValue !== undefined) {
          if (statusValue === 'Todo') fallbackRow.percent_complete = 0;
          else if (statusValue === 'Done') fallbackRow.percent_complete = 100;
          else fallbackRow.percent_complete = 1;
        }
        const retry = await supabase
          .from('tasks')
          .update(fallbackRow)
          .eq('id', id)
          .select()
          .single();
        if (retry.error) throw new Error(retry.error.message);
        updatedData = retry.data;
      }
    }
    const updated = rowToObj<Task>(updatedData);

    // If this is a main/root task and its phase was updated, propagate the phase to all descendant subtasks.
    if (row.phase !== undefined && (!updated.parentId || updated.parentId === '')) {
      const allTasksForProject = await taskApi.getByProject(updated.projectId);
      const childrenByParent = allTasksForProject.data.reduce<Record<string, Task[]>>((map, task) => {
        const pid = String(task.parentId || '');
        map[pid] = map[pid] || [];
        map[pid].push(task);
        return map;
      }, {});
      const descendantIds: string[] = [];
      const queue = [updated.id];
      while (queue.length) {
        const parentId = queue.shift()!;
        const children = childrenByParent[parentId] || [];
        for (const child of children) {
          descendantIds.push(child.id);
          queue.push(child.id);
        }
      }
      if (descendantIds.length) {
        const { error: phaseErr } = await supabase
          .from('tasks')
          .update({ phase: updated.phase })
          .in('id', descendantIds);
        if (phaseErr) throw new Error(phaseErr.message);
      }
    }

    const all = await taskApi.getByProject(updated.projectId);
    const structured = recalcStructure(all.data);
    const allTasks = recalcParents(structured);
    await persistTaskChanges(all.data, allTasks);
    return { data: updated, allTasks };
  },

  setComplete: async (id: string, pct: number): Promise<{ allTasks: Task[] }> => {
    const { data, error } = await supabase
      .from('tasks')
      .update({ percent_complete: pct })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    const task = rowToObj<Task>(data);
    // Recalculate full structure + parent percentages and dates on client side
    const all = await taskApi.getByProject(task.projectId);
    const structured = recalcStructure(all.data);
    const allTasks = recalcParents(structured);
    await persistTaskChanges(all.data, allTasks);
    return { allTasks };
  },

  remove: async (id: string): Promise<{ allTasks: Task[] }> => {
    // Get task first to know project
    const { data: taskData } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', id)
      .single();
    const projectId = taskData?.project_id;
    if (!projectId) throw new Error('MISSING_PROJECT_ID');
    const okRemove = await checkProjectPermission(projectId, 'write');
    if (!okRemove) throw new Error('FORBIDDEN');
    // Delete task and children
    await deleteTaskAndChildren(id);
    if (projectId) {
      const all = await taskApi.getByProject(projectId);
      const structured = recalcStructure(all.data);
      const allTasks = recalcParents(structured);
      await persistTaskChanges(all.data, allTasks);
      return { allTasks };
    }
    return { allTasks: [] };
  },

  copyFromProject: async (sourceProjectId: string, targetProjectId: string, scope: 'all' | 'main' = 'all'): Promise<{ data: Task[] }> => {
    const canWriteTarget = await checkProjectPermission(targetProjectId, 'write');
    if (!canWriteTarget) throw new Error('FORBIDDEN');
    const src = await taskApi.getByProject(sourceProjectId);
    const selectedSource = scope === 'main'
      ? src.data.filter((t) => !t.parentId)
      : src.data;

    const usesEmptyStringRelations = selectedSource.some(
      (t) => t.parentId === '' || t.relatedTask === ''
    );
    const emptyRelationValue: string | null = usesEmptyStringRelations ? '' : null;

    const sourceTasks = [...selectedSource].sort((a, b) => {
      const al = Number(a.level || 0);
      const bl = Number(b.level || 0);
      if (al !== bl) return al - bl;
      return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    });

    const idMap = new Map<string, string>();
    const createdByOld = new Map<string, Task>();

    for (const srcTask of sourceTasks) {
      const row = objToRow({
        ...srcTask,
        projectId: targetProjectId,
        parentId: srcTask.parentId ? (idMap.get(srcTask.parentId) || srcTask.parentId) : emptyRelationValue,
        relatedTask: emptyRelationValue,
      } as Record<string, unknown>);
      delete row.id;
      delete row.created_at;

      const { data, error } = await supabase
        .from('tasks')
        .insert(row)
        .select()
        .single();

      if (error) throw new Error(error.message);
      const created = rowToObj<Task>(data);
      idMap.set(srcTask.id, created.id);
      createdByOld.set(srcTask.id, created);
    }

    // Remap predecessor links after all ids are known.
    for (const srcTask of sourceTasks) {
      if (!srcTask.relatedTask) continue;
      const newTask = createdByOld.get(srcTask.id);
      const mappedPred = idMap.get(srcTask.relatedTask);
      if (!newTask || !mappedPred) continue;
      await supabase
        .from('tasks')
        .update({ related_task: mappedPred })
        .eq('id', newTask.id);
    }

    const all = await taskApi.getByProject(targetProjectId);
    const structured = recalcStructure(all.data);
    const allTasks = recalcParents(structured);
    await persistTaskChanges(all.data, allTasks);

    return { data: allTasks };
  },

  replaceFromProject: async (sourceProjectId: string, targetProjectId: string): Promise<{ data: Task[] }> => {
    const canWriteTarget = await checkProjectPermission(targetProjectId, 'write');
    if (!canWriteTarget) throw new Error('FORBIDDEN');

    const existing = await taskApi.getByProject(targetProjectId);
    if (existing.data.length) {
      const { error: deleteErr } = await supabase.from('tasks').delete().eq('project_id', targetProjectId);
      if (deleteErr) throw new Error(deleteErr.message);
    }

    const copied = await taskApi.copyFromProject(sourceProjectId, targetProjectId, 'all');
    return { data: copied.data };
  },

  replaceByImport: async (projectId: string, importedTasks: Array<Partial<Task> & { parentWbs?: string; predecessorWbs?: string }>): Promise<{ data: Task[] }> => {
    if (!projectId) throw new Error('MISSING_PROJECT_ID');
    const okWrite = await checkProjectPermission(projectId, 'write');
    if (!okWrite) throw new Error('FORBIDDEN');

    const clean = (value: unknown) => String(value ?? '').trim();
    const toDate = (value: unknown) => {
      const text = clean(value);
      if (!text) return '';
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
    };
    const toPercent = (value: unknown) => {
      const num = Number(value ?? 0);
      return Number.isFinite(num) ? Math.min(100, Math.max(0, Math.round(num))) : 0;
    };
    const toEffort = (value: unknown) => normalizeEffortManday(Number(value ?? 0));
    const allowedStatuses = new Set(['Todo', 'In Progress', 'Block/Delay', 'Done']);

    const rows = importedTasks.map((item, index) => ({
      sourceRow: index + 2,
      wbs: clean(item.wbs),
      taskName: clean(item.taskName),
      startDate: toDate(item.startDate),
      endDate: toDate(item.endDate),
      actualFinish: toDate(item.actualFinish),
      percentComplete: toPercent(item.percentComplete),
      status: clean(item.status) || 'Todo',
      phase: clean(item.phase),
      resource: clean(item.resource),
      relatedTask: '',
      parentWbs: clean(item.parentWbs),
      predecessorWbs: clean(item.predecessorWbs),
      orderHint: clean((item as any).order),
      levelHint: clean((item as any).level),
      effortManday: toEffort(item.effortManday),
    }));

    if (!rows.length) throw new Error('IMPORT_FILE_EMPTY');

    const wbsSet = new Set<string>();
    const phaseOptions = (await masterCodeApi.getAll('task_phase')).data
      .filter((code: MasterCode) => code.active)
      .map((code: MasterCode) => String(code.codeValue || '').trim());
    const allowAnyPhase = phaseOptions.length === 0;

    for (const row of rows) {
      if (!row.wbs) throw new Error(`Row ${row.sourceRow}: WBS is required`);
      if (wbsSet.has(row.wbs)) throw new Error(`Row ${row.sourceRow}: duplicate WBS '${row.wbs}'`);
      wbsSet.add(row.wbs);
      if (!row.taskName) throw new Error(`Row ${row.sourceRow}: Task Name is required`);
      if (!row.startDate) throw new Error(`Row ${row.sourceRow}: Start Date must be YYYY-MM-DD`);
      if (!row.endDate) throw new Error(`Row ${row.sourceRow}: End Date must be YYYY-MM-DD`);
      if (row.actualFinish && !row.actualFinish) throw new Error(`Row ${row.sourceRow}: Actual Finish must be YYYY-MM-DD`);
      if (!allowedStatuses.has(row.status)) throw new Error(`Row ${row.sourceRow}: invalid Status '${row.status}'`);
      if (!allowAnyPhase && row.phase && !phaseOptions.includes(row.phase)) throw new Error(`Row ${row.sourceRow}: invalid Phase '${row.phase}'`);
    }

    for (const row of rows) {
      if (row.parentWbs && !wbsSet.has(row.parentWbs)) {
        throw new Error(`Row ${row.sourceRow}: Parent WBS '${row.parentWbs}' not found`);
      }
      if (row.predecessorWbs && !wbsSet.has(row.predecessorWbs)) {
        throw new Error(`Row ${row.sourceRow}: Predecessor WBS '${row.predecessorWbs}' not found`);
      }
    }

    const sorted = [...rows].sort((a, b) => compareWbs(a.wbs, b.wbs));
    const existing = await taskApi.getByProject(projectId);
    const existingIds = existing.data.map((task) => task.id);
    if (existingIds.length) {
      const { error: deleteErr } = await supabase.from('tasks').delete().eq('project_id', projectId);
      if (deleteErr) throw new Error(deleteErr.message);
    }

    const createdByWbs = new Map<string, Task>();
    let runningOrder = 1;
    for (const row of sorted) {
      const parentTask = row.parentWbs ? createdByWbs.get(row.parentWbs) : null;
      const level = parentTask ? (Number(parentTask.level || 0) + 1) : 0;
      const payload = objToRow({
        projectId,
        wbs: row.wbs,
        taskName: row.taskName,
        effortManday: row.effortManday,
        startDate: row.startDate,
        endDate: row.endDate,
        actualFinish: row.actualFinish,
        phase: row.phase,
        duration: calcDurationFromDates({ startDate: row.startDate, endDate: row.endDate } as Task),
        percentComplete: row.percentComplete,
        status: row.status,
        resource: row.resource,
        relatedTask: '',
        parentId: parentTask?.id || '',
        level,
        order: runningOrder++,
      } as Record<string, unknown>);
      delete payload.id;
      delete payload.created_at;

      const { data, error } = await supabase.from('tasks').insert(payload).select().single();
      if (error) throw new Error(`Row ${row.sourceRow}: ${error.message}`);
      createdByWbs.set(row.wbs, rowToObj<Task>(data));
    }

    for (const row of sorted) {
      if (!row.predecessorWbs) continue;
      const task = createdByWbs.get(row.wbs);
      const predecessor = createdByWbs.get(row.predecessorWbs);
      if (!task || !predecessor) continue;
      const { error: relationErr } = await supabase
        .from('tasks')
        .update({ related_task: predecessor.id })
        .eq('id', task.id);
      if (relationErr) throw new Error(`Row ${row.sourceRow}: ${relationErr.message}`);
    }

    const all = await taskApi.getByProject(projectId);
    const structured = recalcStructure(all.data);
    const allTasks = recalcParents(structured);
    await persistTaskChanges(all.data, allTasks);
    return { data: allTasks };
  },
};

// ── Task Templates (System-wide) ───────────────────────────────────────────

type UpsertTemplateItem = {
  wbs: string;
  parentWbs: string;
  level: number;
  sortOrder: number;
  taskName: string;
  duration: number;
  effortManday: number;
};

async function ensureAdminRole(): Promise<string> {
  const { role, userId } = await getCurrentUserRoleAndId();
  if (role !== 'admin') throw new Error('FORBIDDEN');
  return userId;
}

export const taskTemplateApi = {
  getAll: async (): Promise<{ data: TaskTemplate[] }> => {
    const { data, error } = await supabase
      .from('task_templates')
      .select('*')
      .order('template_no', { ascending: true });
    if (error) throw new Error(error.message);
    return { data: rowsToObjs<TaskTemplate>(data || []) };
  },

  getItems: async (templateId: string): Promise<{ data: TaskTemplateItem[] }> => {
    const { data, error } = await supabase
      .from('task_template_items')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    return { data: rowsToObjs<TaskTemplateItem>(data || []) };
  },

  createFromProject: async (name: string, sourceProjectId: string): Promise<{ data: TaskTemplate }> => {
    const createdBy = await ensureAdminRole();
    const source = await taskApi.getByProject(sourceProjectId);
    const sourceTasks = [...source.data].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    if (!sourceTasks.length) throw new Error('SOURCE_PROJECT_HAS_NO_TASKS');

    const { data: tplRow, error: tplErr } = await supabase
      .from('task_templates')
      .insert({ name: String(name || '').trim(), created_by: createdBy })
      .select()
      .single();
    if (tplErr) throw new Error(tplErr.message);

    const parentById = new Map<string, Task>(sourceTasks.map((t) => [t.id, t]));
    const items = sourceTasks.map((t) => ({
      template_id: (tplRow as any).id,
      wbs: t.wbs || '',
      parent_wbs: t.parentId ? (parentById.get(t.parentId)?.wbs || '') : '',
      level: Number(t.level || 0),
      sort_order: Number(t.sortOrder || 0),
      task_name: t.taskName || '',
      duration: Number(t.duration || 0),
      effort_manday: normalizeEffortManday(t.effortManday),
    }));

    const { error: itemErr } = await supabase.from('task_template_items').insert(items);
    if (itemErr) throw new Error(itemErr.message);

    return { data: rowToObj<TaskTemplate>(tplRow as Record<string, unknown>) };
  },

  updateTemplate: async (templateId: string, updates: Partial<Pick<TaskTemplate, 'name'>>): Promise<{ data: TaskTemplate }> => {
    await ensureAdminRole();
    const row = objToRow(updates as Record<string, unknown>);
    const { data, error } = await supabase
      .from('task_templates')
      .update(row)
      .eq('id', templateId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<TaskTemplate>(data as Record<string, unknown>) };
  },

  replaceItems: async (templateId: string, items: UpsertTemplateItem[]): Promise<{ data: TaskTemplateItem[] }> => {
    await ensureAdminRole();
    const normalized = items
      .filter((item) => String(item.taskName || '').trim())
      .map((item) => ({
        template_id: templateId,
        wbs: String(item.wbs || '').trim(),
        parent_wbs: String(item.parentWbs || '').trim(),
        level: Math.max(0, Number(item.level || 0)),
        sort_order: Number(item.sortOrder || 0),
        task_name: String(item.taskName || '').trim(),
        duration: Math.max(0, Number(item.duration || 0)),
        effort_manday: normalizeEffortManday(item.effortManday),
      }));

    const { error: deleteErr } = await supabase
      .from('task_template_items')
      .delete()
      .eq('template_id', templateId);
    if (deleteErr) throw new Error(deleteErr.message);

    if (!normalized.length) return { data: [] };

    const { data, error } = await supabase
      .from('task_template_items')
      .insert(normalized)
      .select()
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    return { data: rowsToObjs<TaskTemplateItem>(data || []) };
  },

  removeTemplate: async (templateId: string): Promise<void> => {
    await ensureAdminRole();
    const { error } = await supabase.from('task_templates').delete().eq('id', templateId);
    if (error) throw new Error(error.message);
  },

  applyToProject: async (templateId: string, targetProjectId: string): Promise<{ data: Task[] }> => {
    const canWriteTarget = await checkProjectPermission(targetProjectId, 'write');
    if (!canWriteTarget) throw new Error('FORBIDDEN');

    const { data: itemRows, error: itemErr } = await supabase
      .from('task_template_items')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true });
    if (itemErr) throw new Error(itemErr.message);

    const items = rowsToObjs<TaskTemplateItem>(itemRows || []);
    if (!items.length) throw new Error('TEMPLATE_HAS_NO_ITEMS');

    const { error: deleteErr } = await supabase.from('tasks').delete().eq('project_id', targetProjectId);
    if (deleteErr) throw new Error(deleteErr.message);

    const createdByWbs = new Map<string, Task>();
    const sorted = [...items].sort((a, b) => {
      const levelDiff = Number(a.level || 0) - Number(b.level || 0);
      if (levelDiff !== 0) return levelDiff;
      return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    });

    for (const item of sorted) {
      const parentTask = item.parentWbs ? createdByWbs.get(item.parentWbs) : null;
      const payload = objToRow({
        projectId: targetProjectId,
        wbs: item.wbs,
        taskName: item.taskName,
        effortManday: normalizeEffortManday(item.effortManday),
        startDate: '',
        endDate: '',
        actualFinish: '',
        phase: '',
        duration: Math.max(0, Number(item.duration || 0)),
        percentComplete: 0,
        status: 'Todo',
        resource: '',
        relatedTask: '',
        parentId: parentTask?.id || '',
        level: Number(item.level || 0),
        sortOrder: Number(item.sortOrder || 0),
      } as Record<string, unknown>);
      delete payload.id;
      delete payload.created_at;

      const { data, error } = await supabase.from('tasks').insert(payload).select().single();
      if (error) throw new Error(error.message);
      const createdTask = rowToObj<Task>(data as Record<string, unknown>);
      createdByWbs.set(item.wbs, createdTask);
    }

    const all = await taskApi.getByProject(targetProjectId);
    const structured = recalcStructure(all.data);
    const allTasks = recalcParents(structured);
    await persistTaskChanges(all.data, allTasks);

    return { data: allTasks };
  },
};

async function deleteTaskAndChildren(taskId: string): Promise<void> {
  // Find children
  const { data: children } = await supabase
    .from('tasks')
    .select('id')
    .eq('parent_id', taskId);
  if (children) {
    for (const child of children) {
      await deleteTaskAndChildren(child.id);
    }
  }
  await supabase.from('tasks').delete().eq('id', taskId);
}

async function persistTaskChanges(origTasks: Task[], newTasks: Task[]): Promise<void> {
  for (const t of newTasks) {
    const orig = origTasks.find((o) => o.id === t.id);
    if (!orig) continue;
    const updates: Record<string, unknown> = {};
    if (orig.wbs !== t.wbs) updates.wbs = t.wbs;
    if (orig.level !== t.level) updates.level = t.level;
    if (orig.sortOrder !== t.sortOrder) updates.sort_order = t.sortOrder;
    if ((orig.parentId || '') !== (t.parentId || '')) updates.parent_id = t.parentId || null;
    if (orig.percentComplete !== t.percentComplete) updates.percent_complete = t.percentComplete;
    if (orig.startDate !== t.startDate) updates.start_date = t.startDate;
    if (orig.endDate !== t.endDate) updates.end_date = t.endDate;
    if (Number(orig.effortManday || 0) !== Number(t.effortManday || 0)) updates.effort_manday = normalizeEffortManday(t.effortManday);
    const calculatedDuration = calcDurationFromDates(t);
    if (t.startDate && t.endDate && orig.duration !== calculatedDuration) updates.duration = calculatedDuration;
    if ((orig.actualFinish || '') !== (t.actualFinish || '')) updates.actual_finish = t.actualFinish || '';
    if (Object.keys(updates).length > 0) {
      await supabase.from('tasks').update(updates).eq('id', t.id);
    }
  }
}

function recalcStructure(tasks: Task[]): Task[] {
  const result = tasks.map((t) => ({ ...t }));
  const byParent = new Map<string, Task[]>();

  const pushChild = (parentId: string, task: Task) => {
    const list = byParent.get(parentId) || [];
    list.push(task);
    byParent.set(parentId, list);
  };

  for (const t of result) {
    const pid = t.parentId || '';
    pushChild(pid, t);
  }

  const sortSiblings = (items: Task[]) =>
    [...items].sort((a, b) => {
      const ao = Number(a.sortOrder || 0);
      const bo = Number(b.sortOrder || 0);
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });

  let runningOrder = 1;
  const walk = (parentId: string, level: number, prefix: string) => {
    const siblings = sortSiblings(byParent.get(parentId) || []);
    siblings.forEach((task, idx) => {
      const wbs = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
      task.wbs = wbs;
      task.level = level;
      task.sortOrder = runningOrder++;
      walk(task.id, level + 1, wbs);
    });
  };

  walk('', 0, '');
  return result;
}

function recalcParents(tasks: Task[]): Task[] {
  const result = tasks.map((t) => ({ ...t }));
  // Process bottom-up: find all parent IDs, then recalc each
  const parentIds = [...new Set(result.filter((t) => t.parentId).map((t) => t.parentId))];

  // Multiple passes to handle nested parents (bottom-up)
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    for (const pid of parentIds) {
      const parent = result.find((t) => t.id === pid);
      if (!parent) continue;
      const children = result.filter((t) => t.parentId === pid);
      if (children.length === 0) {
        if (!parent.parentId && Number(parent.effortManday || 0) !== 0) {
          parent.effortManday = 0;
          changed = true;
        }
        continue;
      }

      // Recalc percent complete (weighted by duration)
      const totalDuration = children.reduce((s, c) => s + (c.duration || 1), 0);
      const weighted = children.reduce((s, c) => s + c.percentComplete * (c.duration || 1), 0);
      const allChildrenComplete = children.every((c) => c.percentComplete === 100);
      const newPct = allChildrenComplete ? 100 : (totalDuration > 0 ? Math.round(weighted / totalDuration) : 0);
      if (parent.percentComplete !== newPct) {
        parent.percentComplete = newPct;
        changed = true;
      }

      // Recalc parent effort manday as sum of direct children.
      const summedEffort = normalizeEffortManday(children.reduce((s, c) => s + Number(c.effortManday || 0), 0));
      if (Number(parent.effortManday || 0) !== summedEffort) {
        parent.effortManday = summedEffort;
        changed = true;
      }

      // Recalc start date = min of children start dates
      const childStarts = children.map((c) => c.startDate).filter(Boolean).sort();
      if (childStarts.length > 0 && parent.startDate !== childStarts[0]) {
        parent.startDate = childStarts[0];
        changed = true;
      }

      // Recalc end date = max of children end dates
      const childEnds = children.map((c) => c.endDate).filter(Boolean).sort();
      if (childEnds.length > 0 && parent.endDate !== childEnds[childEnds.length - 1]) {
        parent.endDate = childEnds[childEnds.length - 1];
        changed = true;
      }

      // If all direct children are complete, set actual finish from latest child end date
      if (allChildrenComplete && childEnds.length > 0) {
        const latestChildEnd = childEnds[childEnds.length - 1];
        if (parent.actualFinish !== latestChildEnd) {
          parent.actualFinish = latestChildEnd;
          changed = true;
        }
      }

      // Recalc duration from new dates
      if (parent.startDate && parent.endDate) {
        const s = new Date(parent.startDate).getTime();
        const e = new Date(parent.endDate).getTime();
        const dur = Math.max(0, Math.round((e - s) / 86400000));
        if (parent.duration !== dur) {
          parent.duration = dur;
        }
      }
    }
  }
  return result;
}

function normalizeEffortManday(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = 0.025;
  const rounded = Math.round(n / step) * step;
  return Number(rounded.toFixed(3));
}

function calcDurationFromDates(task: Task): number {
  if (!task.startDate || !task.endDate) return task.duration || 0;
  const start = parseISO(task.startDate);
  const end = parseISO(task.endDate);
  if (!isValid(start) || !isValid(end) || end < start) return 0;

  let count = 0;
  const current = new Date(start.getTime());
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count += 1;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// ── Members ─────────────────────────────────────────────────────────────────

export const memberApi = {
  getByProject: async (pid?: string): Promise<{ data: Member[] }> => {
    if (pid) {
      const ok = await checkProjectPermission(pid, 'read');
      if (!ok) throw new Error('FORBIDDEN');
    }
    let q = supabase.from('members').select('*');
    if (pid) q = q.eq('project_id', pid);
    q = q.order('created_at', { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: rowsToObjs<Member>(data || []) };
  },

  create: async (m: Partial<Member>): Promise<{ data: Member }> => {
    const projectId = String((m as any).projectId || '');
    if (!projectId) throw new Error('MISSING_PROJECT_ID');
    const ok = await checkProjectPermission(projectId, 'write');
    if (!ok) throw new Error('FORBIDDEN');

    const row = objToRow(m as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('members')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<Member>(data) };
  },

  update: async (id: string, m: Partial<Member>): Promise<{ data: Member }> => {
    // ensure write permission for the member's project
    const { data: orig } = await supabase.from('members').select('project_id').eq('id', id).maybeSingle();
    const pid = (orig as any)?.project_id || (m as any).projectId;
    if (!pid) throw new Error('MISSING_PROJECT_ID');
    const ok = await checkProjectPermission(pid, 'write');
    if (!ok) throw new Error('FORBIDDEN');

    const row = objToRow(m as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('members')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<Member>(data) };
  },

  remove: async (id: string): Promise<void> => {
    const { data: orig } = await supabase.from('members').select('project_id').eq('id', id).maybeSingle();
    const pid = (orig as any)?.project_id;
    if (!pid) throw new Error('MISSING_PROJECT_ID');
    const ok = await checkProjectPermission(pid, 'write');
    if (!ok) throw new Error('FORBIDDEN');
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ── Milestones ──────────────────────────────────────────────────────────────

export const milestoneApi = {
  getByProject: async (pid?: string): Promise<{ data: Milestone[] }> => {
    let q = supabase.from('milestones').select('*');
    if (pid) q = q.eq('project_id', pid);
    q = q.order('created_at', { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: rowsToObjs<Milestone>(data || []) };
  },

  create: async (m: Partial<Milestone>): Promise<{ data: Milestone }> => {
    const row = objToRow(m as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('milestones')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<Milestone>(data) };
  },

  update: async (id: string, m: Partial<Milestone>): Promise<{ data: Milestone }> => {
    const row = objToRow(m as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('milestones')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<Milestone>(data) };
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('milestones').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ── Efforts ─────────────────────────────────────────────────────────────────

export const effortApi = {
  getByProject: async (pid?: string): Promise<{ data: Effort[] }> => {
    let q = supabase.from('efforts').select('*, effort_monthly(*)');
    if (pid) q = q.eq('project_id', pid);
    q = q.order('created_at', { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    // Transform effort_monthly rows into a monthly Record
    return {
      data: (data || []).map((row) => {
        const effort = rowToObj<Effort>(row);
        const monthly: Record<string, number> = {};
        const monthlyRows = (row as Record<string, unknown>).effort_monthly as
          | Array<{ month: string; manday: number }>
          | undefined;
        if (monthlyRows) {
          for (const em of monthlyRows) {
            monthly[em.month] = Number(em.manday) || 0;
          }
        }
        effort.monthly = monthly;
        return effort;
      }),
    };
  },

  create: async (e: Partial<Effort>): Promise<{ data: Effort }> => {
    const base: Record<string, unknown> = {
      project_id: e.projectId,
      module: e.module ?? '',
      budget_amount: e.budgetAmount ?? 0,
      budget_manday: e.budgetManday ?? 0,
    };
    // Try with phase; fall back without it if DB column is absent
    let { data, error } = await supabase.from('efforts').insert({ ...base, phase: e.phase ?? '' }).select().single();
    if (error) {
      const retry = await supabase.from('efforts').insert(base).select().single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw new Error(error.message);
    const effort = rowToObj<Effort>(data);
    effort.monthly = {};
    return { data: effort };
  },

  update: async (id: string, e: Partial<Effort>): Promise<{ data: Effort }> => {
    const base: Record<string, unknown> = {
      module: e.module ?? '',
      budget_amount: e.budgetAmount ?? 0,
      budget_manday: e.budgetManday ?? 0,
    };
    // Try with phase; fall back without it if DB column is absent
    let { data, error } = await supabase.from('efforts').update({ ...base, phase: e.phase ?? '' }).eq('id', id).select().single();
    if (error) {
      const retry = await supabase.from('efforts').update(base).eq('id', id).select().single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw new Error(error.message);
    const effort = rowToObj<Effort>(data);
    effort.monthly = {};
    return { data: effort };
  },

  updateMonthly: async (id: string, month: string, manday: number): Promise<void> => {
    // Upsert monthly record
    const { error } = await supabase
      .from('effort_monthly')
      .upsert(
        { effort_id: id, month, manday },
        { onConflict: 'effort_id,month' }
      );
    if (error) throw new Error(error.message);
  },

  remove: async (id: string): Promise<void> => {
    // effort_monthly cascades via FK
    const { error } = await supabase.from('efforts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ── Change Requests ─────────────────────────────────────────────────────────

export const crApi = {
  getByProject: async (
    pid?: string
  ): Promise<{ data: (ChangeRequest & { items: CRItem[] })[] }> => {
    let q = supabase.from('change_requests').select('*, cr_items(*)');
    if (pid) q = q.eq('project_id', pid);
    q = q.order('created_at', { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return {
      data: (data || []).map((row) => {
        const cr = rowToObj<ChangeRequest>(row);
        const itemRows = (row as Record<string, unknown>).cr_items as
          | Array<Record<string, unknown>>
          | undefined;
        const items = itemRows ? rowsToObjs<CRItem>(itemRows) : [];
        return { ...cr, items };
      }),
    };
  },

  create: async (
    c: Partial<ChangeRequest> & { items?: Partial<CRItem>[] }
  ): Promise<{ data: ChangeRequest & { items: CRItem[] } }> => {
    const { items, ...rest } = c;
    const row = objToRow(rest as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('change_requests')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    const cr = rowToObj<ChangeRequest>(data);

    // Insert items
    let crItems: CRItem[] = [];
    if (items && items.length > 0) {
      const itemRows = items.map((item) => ({
        cr_id: cr.id,
        detail: item.detail || '',
        manday: item.manday || 0,
      }));
      const { data: itemData, error: itemErr } = await supabase
        .from('cr_items')
        .insert(itemRows)
        .select();
      if (itemErr) throw new Error(itemErr.message);
      crItems = rowsToObjs<CRItem>(itemData || []);
    }

    return { data: { ...cr, items: crItems } };
  },

  update: async (
    id: string,
    c: Partial<ChangeRequest> & { items?: Partial<CRItem>[] }
  ): Promise<{ data: ChangeRequest & { items: CRItem[] } }> => {
    const { items, ...rest } = c;
    const row = objToRow(rest as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('change_requests')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    const cr = rowToObj<ChangeRequest>(data);

    // Replace items
    let crItems: CRItem[] = [];
    if (items) {
      await supabase.from('cr_items').delete().eq('cr_id', id);
      if (items.length > 0) {
        const itemRows = items.map((item) => ({
          cr_id: id,
          detail: item.detail || '',
          manday: item.manday || 0,
        }));
        const { data: itemData, error: itemErr } = await supabase
          .from('cr_items')
          .insert(itemRows)
          .select();
        if (itemErr) throw new Error(itemErr.message);
        crItems = rowsToObjs<CRItem>(itemData || []);
      }
    }

    return { data: { ...cr, items: crItems } };
  },

  remove: async (id: string): Promise<void> => {
    // cr_items cascades via FK
    const { error } = await supabase.from('change_requests').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ── Issues ──────────────────────────────────────────────────────────────────

export const issueApi = {
  getByProject: async (pid?: string): Promise<{ data: Issue[] }> => {
    let q = supabase.from('issues').select('*');
    if (pid) q = q.eq('project_id', pid);
    q = q.order('created_at', { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: rowsToObjs<Issue>(data || []) };
  },

  create: async (i: Partial<Issue>): Promise<{ data: Issue }> => {
    const row = objToRow(i as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('issues')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<Issue>(data) };
  },

  update: async (id: string, i: Partial<Issue>): Promise<{ data: Issue }> => {
    const row = objToRow(i as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('issues')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<Issue>(data) };
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('issues').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ── Risks ───────────────────────────────────────────────────────────────────

export const riskApi = {
  getByProject: async (pid?: string): Promise<{ data: Risk[] }> => {
    let q = supabase.from('risks').select('*');
    if (pid) q = q.eq('project_id', pid);
    q = q.order('created_at', { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { data: rowsToObjs<Risk>(data || []) };
  },

  create: async (r: Partial<Risk>): Promise<{ data: Risk }> => {
    const row = objToRow(r as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('risks')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<Risk>(data) };
  },

  update: async (id: string, r: Partial<Risk>): Promise<{ data: Risk }> => {
    const row = objToRow(r as Record<string, unknown>);
    delete row.id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('risks')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { data: rowToObj<Risk>(data) };
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('risks').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
