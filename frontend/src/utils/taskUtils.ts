import type { Task } from '../types';

/** Build a flat ordered list for rendering (depth-first). */
export function flattenTree(tasks: Task[], expandedIds: Set<string>): Task[] {
  const rootTasks = tasks
    .filter((t) => !t.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const result: Task[] = [];

  function walk(task: Task) {
    result.push(task);
    if (expandedIds.has(task.id)) {
      const children = tasks
        .filter((t) => t.parentId === task.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      children.forEach(walk);
    }
  }

  rootTasks.forEach(walk);
  return result;
}

/** Check if a task has children. */
export function hasChildren(tasks: Task[], taskId: string): boolean {
  return tasks.some((t) => t.parentId === taskId);
}

/** Get all descendant ids. */
export function getDescendantIds(tasks: Task[], taskId: string): string[] {
  const ids: string[] = [];
  function walk(id: string) {
    const children = tasks.filter((t) => t.parentId === id);
    children.forEach((c) => {
      ids.push(c.id);
      walk(c.id);
    });
  }
  walk(taskId);
  return ids;
}

/** Get ancestor ids (bottom-up). */
export function getAncestorIds(tasks: Task[], taskId: string): string[] {
  const ids: string[] = [];
  let current = tasks.find((t) => t.id === taskId);
  while (current?.parentId) {
    ids.push(current.parentId);
    current = tasks.find((t) => t.id === current!.parentId);
  }
  return ids;
}

/** Avatar colour based on name string. */
export function avatarColor(name: string): string {
  const colors = [
    '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
    '#10B981', '#06B6D4', '#EF4444', '#F97316',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/** Get initials from resource name. */
export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
