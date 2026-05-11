export interface Project {
  id: string;
  name: string;
  code: string;
  client: string;
  softwareVersion: '' | 'Humatrix' | 'Workplaze';
  status: string;
  startDate: string;
  endDate: string;
  description: string;
  color: string;
  emailNotificationEnabled: boolean;
  emailNotificationMode: 'task' | 'custom';
  emailNotificationRecipients: string;
  emailNotificationTime: string;
  emailNotificationLastSentAt?: string;
}

export interface MasterCode {
  id: string;
  codeType: string;
  codeKey: string;
  codeValue: string;
  label: string;
  sortOrder: number;
  active: boolean;
  textColor: string;
  bgColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectEnvironment {
  id: string;
  projectId: string;
  environment: 'DEV' | 'QA' | 'UAT' | 'Production';
  url: string;
  username: string;
  password: string;
}

export interface ProjectProgressSnapshot {
  id: string;
  projectId: string;
  snapshotDate: string;
  baselinePercent: number;
  actualPercent: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  wbs: string;
  taskName: string;
  effortManday: number;
  startDate: string;
  endDate: string;
  actualFinish: string;   // ← new: actual finish date
  phase?: string;
  duration: number;
  percentComplete: number;
  status: 'Todo' | 'In Progress' | 'Block/Delay' | 'Done';
  resource: string;
  relatedTask: string;
  relatedTaskType: 'FS' | 'SS' | 'FF' | 'SF';
  relatedTaskLagDays: number;
  parentId: string;
  level: number;
  sortOrder: number;
}

export interface Member {
  id: string;
  projectId: string;
  name: string;
  nickname: string;
  role: string;
  position: string;      // ← new
  email: string;
  tel: string;
  ext: string;
  type: 'internal' | 'client';
  notes: string;         // ← new
}

export interface Milestone {
  id: string;
  projectId: string;
  phase: string;
  name: string;
  percent: number;
  amount: number;
  phaseAmount: number;
  dueDate: string;
  billingDate: string;
  notes: string;
  status: 'pending' | 'billed' | 'paid';
}

export interface Effort {
  id: string;
  projectId: string;
  module: string;
  phase?: string;
  budgetAmount: number;
  budgetManday: number;
  monthly: Record<string, number>;
}

export interface TaskTemplate {
  id: string;
  templateNo: number;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTemplateItem {
  id: string;
  templateId: string;
  wbs: string;
  parentWbs: string;
  level: number;
  sortOrder: number;
  taskName: string;
  duration: number;
  effortManday: number;
  createdAt: string;
}

// ── Change Request ────────────────────────────────────────────────────────────
export interface ChangeRequest {
  id: string;
  projectId: string;
  crId: string;          // e.g. CR-001
  title: string;
  requestedBy: string;
  requestDate: string;
  approvedBy: string;
  approvalDate: string;
  totalManday: number;
  discount: number;
  status: 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Implemented' | 'Close';
  notes: string;
}

export interface CRItem {
  id: string;
  crId: string;          // FK → ChangeRequest.id
  detail: string;
  manday: number;
}

// ── Issue ─────────────────────────────────────────────────────────────────────
export interface Issue {
  id: string;
  projectId: string;
  issueDate: string;
  title: string;
  description: string;
  reportedBy: string;    // member name
  assignedTo: string;    // member name
  status: 'Open' | 'In Progress' | 'Resolved' | 'Blocked';
  resolvedDate: string;
  notes: string;
}

// ── Risk ──────────────────────────────────────────────────────────────────────
export interface Risk {
  id: string;
  projectId: string;
  riskDate: string;
  title: string;
  description: string;
  probability: 'Low' | 'Medium' | 'High';
  impact: 'Low' | 'Medium' | 'High';
  mitigation: string;
  owner: string;
  status: 'Monitoring' | 'Mitigating' | 'Closed';
}

export type ViewMode = 'table' | 'split' | 'gantt' | 'kanban';
export type ProjectStatus = Project['status'];

// ── Auth ──────────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'pm' | 'member' | 'client';

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
