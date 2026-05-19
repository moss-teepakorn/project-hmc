import { create } from 'zustand';
import type { Project, Task, Member, Milestone, Effort, ChangeRequest, CRItem, Issue, Risk, ProjectEnvironment, ProjectProgressSnapshot, MasterCode } from '../types';
import { projectApi, taskApi, memberApi, milestoneApi, effortApi, crApi, issueApi, riskApi, projectEnvironmentApi, projectProgressApi, masterCodeApi } from '../services/api';

interface Store {
  _pendingMutationCount: number;
  projects: Project[];
  projectsLoading: boolean;
  activeProject: Project | null;
  tasks: Task[];
  members: Member[];
  milestones: Milestone[];
  efforts: Effort[];
  changeRequests: (ChangeRequest & { items: CRItem[] })[];
  issues: Issue[];
  risks: Risk[];
  projectEnvironments: ProjectEnvironment[];
  projectProgressSnapshots: ProjectProgressSnapshot[];
  masterCodes: MasterCode[];
  dataLoading: boolean;
  error: string | null;

  fetchProjects: () => Promise<void>;
  fetchMasterCodes: () => Promise<boolean>;
  createMasterCode: (code: Partial<MasterCode>) => Promise<MasterCode>;
  updateMasterCode: (id: string, code: Partial<MasterCode>) => Promise<MasterCode>;
  deleteMasterCode: (id: string) => Promise<void>;
  createProject: (p: Partial<Project>) => Promise<Project>;
  updateProject: (id: string, p: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (p: Project | null) => void;

  fetchTasks:      (pid?: string) => Promise<void>;
  createTask:      (t: Partial<Task>) => Promise<void>;
  updateTask:      (id: string, t: Partial<Task>) => Promise<void>;
  reorderTasks:    (projectId: string, orderedIds: string[]) => Promise<void>;
  deleteTask:      (id: string) => Promise<void>;

  fetchMembers:    (pid: string) => Promise<void>;
  createMember:    (m: Partial<Member>) => Promise<void>;
  updateMember:    (id: string, m: Partial<Member>) => Promise<void>;
  deleteMember:    (id: string) => Promise<void>;

  fetchMilestones: (pid?: string) => Promise<void>;
  createMilestone: (m: Partial<Milestone>) => Promise<void>;
  updateMilestone: (id: string, m: Partial<Milestone>) => Promise<void>;
  deleteMilestone: (id: string) => Promise<void>;

  fetchEfforts:    (pid: string) => Promise<void>;
  createEffort:    (e: Partial<Effort>) => Promise<void>;
  updateEffort:    (id: string, e: Partial<Effort>) => Promise<void>;
  updateEffortMonthly: (id: string, month: string, manday: number) => Promise<void>;
  deleteEffort:    (id: string) => Promise<void>;

  fetchCRs:        (pid: string) => Promise<void>;
  createCR:        (c: Partial<ChangeRequest> & { items?: Partial<CRItem>[] }) => Promise<void>;
  updateCR:        (id: string, c: Partial<ChangeRequest> & { items?: Partial<CRItem>[] }) => Promise<void>;
  deleteCR:        (id: string) => Promise<void>;

  fetchIssues:     (pid: string) => Promise<void>;
  createIssue:     (i: Partial<Issue>) => Promise<void>;
  updateIssue:     (id: string, i: Partial<Issue>) => Promise<void>;
  deleteIssue:     (id: string) => Promise<void>;

  fetchRisks:      (pid: string) => Promise<void>;
  createRisk:      (r: Partial<Risk>) => Promise<void>;
  updateRisk:      (id: string, r: Partial<Risk>) => Promise<void>;
  deleteRisk:      (id: string) => Promise<void>;

  fetchProjectEnvironments: (pid: string) => Promise<void>;
  createProjectEnvironment: (env: Partial<ProjectEnvironment>) => Promise<void>;
  updateProjectEnvironment: (id: string, env: Partial<ProjectEnvironment>) => Promise<void>;
  deleteProjectEnvironment: (id: string) => Promise<void>;

  fetchProjectProgressSnapshots: (pid: string) => Promise<void>;
  saveProjectProgressSnapshot: (snapshot: Partial<ProjectProgressSnapshot>) => Promise<ProjectProgressSnapshot>;
  deleteProjectProgressSnapshot: (id: string) => Promise<void>;
}

export const useStore = create<Store>((set, get) => ({
  // Track pending save/delete operations globally for minimal UI loading state.
  _pendingMutationCount: 0,
  projects: [], projectsLoading: false, activeProject: null,
  tasks: [], members: [], milestones: [], efforts: [],
  changeRequests: [], issues: [], risks: [], projectEnvironments: [], projectProgressSnapshots: [], masterCodes: [],
  dataLoading: false, error: null,

  // ── Projects ───────────────────────────────────────────────────────────────
  fetchProjects: async () => {
    set({ projectsLoading: true, error: null });
    try { set({ projects: (await projectApi.getAll()).data, projectsLoading: false }); }
    catch (e) { set({ error: (e as Error).message, projectsLoading: false }); }
  },
  fetchMasterCodes: async () => {
    try {
      set({ masterCodes: (await masterCodeApi.getAll()).data });
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },
  createMasterCode: async (code) => {
    const res = await masterCodeApi.create(code);
    set((s) => ({ masterCodes: [...s.masterCodes, res.data] }));
    return res.data;
  },
  updateMasterCode: async (id, code) => {
    const res = await masterCodeApi.update(id, code);
    set((s) => ({ masterCodes: s.masterCodes.map((item) => item.id === id ? res.data : item) }));
    return res.data;
  },
  deleteMasterCode: async (id) => {
    await masterCodeApi.remove(id);
    set((s) => ({ masterCodes: s.masterCodes.filter((item) => item.id !== id) }));
  },
  createProject: async (p) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const res = await projectApi.create(p);
      set(s => ({ projects: [...s.projects, res.data] }));
      return res.data;
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  updateProject: async (id, p) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const res = await projectApi.update(id, p);
      set(s => ({ projects: s.projects.map(x => x.id === id ? res.data : x), activeProject: s.activeProject?.id === id ? res.data : s.activeProject }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  deleteProject: async (id) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      await projectApi.remove(id);
      set(s => ({ projects: s.projects.filter(p => p.id !== id), activeProject: null }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  setActiveProject: (p) => set({ activeProject: p, tasks: [], members: [], milestones: [], efforts: [], changeRequests: [], issues: [], risks: [], projectEnvironments: [] }),

  // ── Tasks ──────────────────────────────────────────────────────────────────
  fetchTasks: async (pid?: string) => {
    try { set({ tasks: (await taskApi.getByProject(pid)).data }); }
    catch (e) { set({ error: (e as Error).message }); }
  },
  createTask: async (t) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await taskApi.create(t);
      set({ tasks: r.allTasks ?? get().tasks });
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  updateTask: async (id, t) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await taskApi.update(id, t);
      set({ tasks: r.allTasks ?? get().tasks });
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  reorderTasks: async (projectId, orderedIds) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await taskApi.reorderSiblings(projectId, orderedIds);
      set({ tasks: r.allTasks ?? get().tasks });
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  deleteTask: async (id)    => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await taskApi.remove(id);
      set({ tasks: r.allTasks ?? get().tasks });
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },

  // ── Members ────────────────────────────────────────────────────────────────
  fetchMembers: async (pid?: string) => { set({ members: (await memberApi.getByProject(pid)).data }); },
  createMember: async (m)   => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await memberApi.create(m);
      set(s => ({ members: [...s.members, r.data] }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  updateMember: async (id, m) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await memberApi.update(id, m);
      set(s => ({ members: s.members.map(x => x.id === id ? r.data : x) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  deleteMember: async (id)  => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      await memberApi.remove(id);
      set(s => ({ members: s.members.filter(m => m.id !== id) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },

  // ── Milestones ─────────────────────────────────────────────────────────────
  fetchMilestones: async (pid?: string) => { set({ milestones: (await milestoneApi.getByProject(pid)).data }); },
  createMilestone: async (m)   => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await milestoneApi.create(m);
      set(s => ({ milestones: [...s.milestones, r.data] }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  updateMilestone: async (id, m) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await milestoneApi.update(id, m);
      set(s => ({ milestones: s.milestones.map(x => x.id === id ? r.data : x) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  deleteMilestone: async (id)  => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      await milestoneApi.remove(id);
      set(s => ({ milestones: s.milestones.filter(m => m.id !== id) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },

  // ── Efforts ────────────────────────────────────────────────────────────────
  fetchEfforts: async (pid?: string) => { set({ efforts: (await effortApi.getByProject(pid)).data }); },
  createEffort: async (e)   => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await effortApi.create(e);
      set(s => ({ efforts: [...s.efforts, r.data] }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  updateEffort: async (id, e) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await effortApi.update(id, e);
      set(s => ({ efforts: s.efforts.map(x => x.id === id ? { ...r.data, monthly: x.monthly } : x) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  updateEffortMonthly: async (id, month, manday) => {
    // Keep monthly typing smooth: optimistic update without global loading overlay.
    set(s => ({ efforts: s.efforts.map(e => e.id === id ? { ...e, monthly: { ...e.monthly, [month]: manday } } : e) }));
    await effortApi.updateMonthly(id, month, manday);
  },
  deleteEffort: async (id)  => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      await effortApi.remove(id);
      set(s => ({ efforts: s.efforts.filter(e => e.id !== id) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },

  // ── Change Requests ────────────────────────────────────────────────────────
  fetchCRs: async (pid?)    => { set({ changeRequests: (await crApi.getByProject(pid)).data }); },
  createCR: async (c)      => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await crApi.create(c);
      set(s => ({ changeRequests: [...s.changeRequests, r.data] }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  updateCR: async (id, c)  => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await crApi.update(id, c);
      set(s => ({ changeRequests: s.changeRequests.map(x => x.id === id ? r.data : x) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  deleteCR: async (id)     => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      await crApi.remove(id);
      set(s => ({ changeRequests: s.changeRequests.filter(c => c.id !== id) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },

  // ── Issues ─────────────────────────────────────────────────────────────────
  fetchIssues: async (pid?)   => { set({ issues: (await issueApi.getByProject(pid)).data }); },
  createIssue: async (i)     => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await issueApi.create(i);
      set(s => ({ issues: [...s.issues, r.data] }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  updateIssue: async (id, i) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const r = await issueApi.update(id, i);
      set(s => ({ issues: s.issues.map(x => x.id === id ? r.data : x) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  deleteIssue: async (id)    => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      await issueApi.remove(id);
      set(s => ({ issues: s.issues.filter(i => i.id !== id) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },

  // ── Risks ──────────────────────────────────────────────────────────────────
  fetchRisks: async (pid?)   => { set({ risks: (await riskApi.getByProject(pid)).data }); },
  createRisk: async (r)     => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const res = await riskApi.create(r);
      set(s => ({ risks: [...s.risks, res.data] }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  updateRisk: async (id, r) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const res = await riskApi.update(id, r);
      set(s => ({ risks: s.risks.map(x => x.id === id ? res.data : x) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  deleteRisk: async (id)    => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      await riskApi.remove(id);
      set(s => ({ risks: s.risks.filter(r => r.id !== id) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },

  // ── Project Environments ──────────────────────────────────────────────────
  fetchProjectEnvironments: async (pid?: string) => {
    try { set({ projectEnvironments: (await projectEnvironmentApi.getByProject(pid)).data }); }
    catch (e) { set({ error: (e as Error).message }); }
  },
  createProjectEnvironment: async (env) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const res = await projectEnvironmentApi.create(env);
      set(s => ({ projectEnvironments: [...s.projectEnvironments, res.data] }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  updateProjectEnvironment: async (id, env) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const res = await projectEnvironmentApi.update(id, env);
      set(s => ({ projectEnvironments: s.projectEnvironments.map(x => x.id === id ? res.data : x) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  deleteProjectEnvironment: async (id) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      await projectEnvironmentApi.remove(id);
      set(s => ({ projectEnvironments: s.projectEnvironments.filter(x => x.id !== id) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  fetchProjectProgressSnapshots: async (pid: string) => {
    try { set({ projectProgressSnapshots: (await projectProgressApi.getByProject(pid)).data }); }
    catch (e) { set({ error: (e as Error).message }); }
  },
  saveProjectProgressSnapshot: async (snapshot) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      const res = await projectProgressApi.save(snapshot);
      set(s => ({
        projectProgressSnapshots: snapshot.id
          ? s.projectProgressSnapshots.map(x => x.id === snapshot.id ? res.data : x)
          : [...s.projectProgressSnapshots, res.data],
      }));
      return res.data;
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
  deleteProjectProgressSnapshot: async (id) => {
    set((s: any) => ({ _pendingMutationCount: (s._pendingMutationCount || 0) + 1, dataLoading: true }));
    try {
      await projectProgressApi.remove(id);
      set(s => ({ projectProgressSnapshots: s.projectProgressSnapshots.filter(x => x.id !== id) }));
    } finally {
      set((s: any) => {
        const next = Math.max(0, (s._pendingMutationCount || 1) - 1);
        return { _pendingMutationCount: next, dataLoading: next > 0 };
      });
    }
  },
}));
