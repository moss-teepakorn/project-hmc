import { useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { useStore } from '../store';

/**
 * Subscribe to Supabase Realtime changes for the active project.
 * Automatically refetches data when inserts/updates/deletes occur.
 */
export function useRealtimeSubscription(projectId: string | undefined) {
  const {
    fetchTasks,
    fetchMembers,
    fetchMilestones,
    fetchEfforts,
    fetchCRs,
    fetchIssues,
    fetchRisks,
    fetchProjects,
  } = useStore();

  useEffect(() => {
    if (!isSupabaseConfigured() || !projectId) return;

    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        () => { fetchTasks(projectId); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `project_id=eq.${projectId}` },
        () => { fetchMembers(projectId); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'milestones', filter: `project_id=eq.${projectId}` },
        () => { fetchMilestones(projectId); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'efforts', filter: `project_id=eq.${projectId}` },
        () => { fetchEfforts(projectId); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'change_requests', filter: `project_id=eq.${projectId}` },
        () => { fetchCRs(projectId); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'issues', filter: `project_id=eq.${projectId}` },
        () => { fetchIssues(projectId); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'risks', filter: `project_id=eq.${projectId}` },
        () => { fetchRisks(projectId); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchTasks, fetchMembers, fetchMilestones, fetchEfforts, fetchCRs, fetchIssues, fetchRisks]);

  // Also subscribe to project-level changes (dashboard refresh)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const projectChannel = supabase
      .channel('projects-global')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => { fetchProjects(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_members' },
        () => { fetchProjects(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(projectChannel);
    };
  }, [fetchProjects]);
}
