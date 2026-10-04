CREATE OR REPLACE FUNCTION public.can_access_project_checklist(p_project_id uuid, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.is_active IS DISTINCT FROM false
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active IS DISTINCT FROM false
        AND (
          p.project_access_scope = 'all'
          OR EXISTS (
            SELECT 1
            FROM public.project_members pm
            WHERE pm.project_id = p_project_id
              AND pm.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.members m
            WHERE m.project_id = p_project_id
              AND (
                m.user_id = auth.uid()
                OR lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
              )
          )
        )
        AND CASE
          WHEN p.screen_permissions IS NOT NULL THEN
            CASE p_action
              WHEN 'read' THEN p.screen_permissions ->> 'checklists' IN ('read', 'full')
              WHEN 'write' THEN p.screen_permissions ->> 'checklists' = 'full'
              ELSE false
            END
          ELSE
            CASE p_action
              WHEN 'read' THEN p.role IN ('pm', 'member', 'client')
              WHEN 'write' THEN p.role IN ('pm', 'member')
              ELSE false
            END
        END
    );
$$;

NOTIFY pgrst, 'reload schema';
