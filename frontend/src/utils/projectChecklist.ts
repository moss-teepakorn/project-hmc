export const PROJECT_CHECKLIST_STAGES = [
  { id: 'planning', label: 'Planning' },
  { id: 'requirements-design', label: 'Req & Design' },
  { id: 'setup', label: 'Setup' },
  { id: 'testing', label: 'Testing' },
  { id: 'go-live', label: 'Go Live' },
  { id: 'hyper-care', label: 'Hyper Care' },
] as const;

export type ProjectChecklistStageId = (typeof PROJECT_CHECKLIST_STAGES)[number]['id'];

export const PROJECT_CHECKLIST_CATEGORIES = [
  { id: 'project', label: 'Project' },
  { id: 'setup', label: 'Setup' },
  { id: 'migrate-data', label: 'Migrate Data' },
] as const;

export type ProjectChecklistCategoryId = (typeof PROJECT_CHECKLIST_CATEGORIES)[number]['id'];

export interface ProjectChecklistTopic {
  id: string;
  category: ProjectChecklistCategoryId;
  workSystem?: string;
  stage?: ProjectChecklistStageId;
  orderNo: number;
  title: string;
}

export interface ProjectChecklistProgressEntry {
  done: boolean;
  completionDate: string;
  completedBy: string;
  jiraId: string;
  notes: string;
}

export type ProjectChecklistProgress = Record<string, ProjectChecklistProgressEntry>;