BEGIN;

CREATE TABLE IF NOT EXISTS public.project_lessons_learned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  category text NOT NULL CHECK (category IN ('success', 'challenge', 'process', 'technical', 'communication', 'vendor')),
  phase text NOT NULL DEFAULT 'Planning',
  occurred_at date NOT NULL DEFAULT CURRENT_DATE,
  context text NOT NULL DEFAULT '',
  impact text NOT NULL DEFAULT '',
  root_cause text NOT NULL DEFAULT '',
  lesson text NOT NULL DEFAULT '',
  recommendation text NOT NULL DEFAULT '',
  follow_up text NOT NULL DEFAULT '',
  owner text NOT NULL DEFAULT '',
  due_date date,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Done')),
  reference_url text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_lessons_project_occurred
  ON public.project_lessons_learned(project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_lessons_project_status
  ON public.project_lessons_learned(project_id, status);

CREATE OR REPLACE FUNCTION public.set_project_lessons_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_lessons_updated_at ON public.project_lessons_learned;
CREATE TRIGGER trg_project_lessons_updated_at
  BEFORE UPDATE ON public.project_lessons_learned
  FOR EACH ROW EXECUTE FUNCTION public.set_project_lessons_updated_at();

CREATE OR REPLACE FUNCTION public.can_access_project_lessons(p_project_id uuid, p_action text)
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
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid()
          )
        )
        AND CASE
          WHEN p.screen_permissions IS NOT NULL AND jsonb_typeof(p.screen_permissions) = 'array' THEN
            CASE p_action
              WHEN 'read' THEN p.screen_permissions ? 'lessons'
              WHEN 'write' THEN p.role IN ('pm', 'member') AND p.screen_permissions ? 'lessons'
              ELSE false
            END
          WHEN p.screen_permissions IS NOT NULL
            AND jsonb_typeof(p.screen_permissions) = 'object'
            AND p.screen_permissions ? 'lessons' THEN
            CASE p_action
              WHEN 'read' THEN p.screen_permissions ->> 'lessons' IN ('read', 'full')
              WHEN 'write' THEN p.role IN ('pm', 'member') AND p.screen_permissions ->> 'lessons' = 'full'
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

REVOKE ALL ON FUNCTION public.can_access_project_lessons(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_project_lessons(uuid, text) TO authenticated;

ALTER TABLE public.project_lessons_learned ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_lessons_select ON public.project_lessons_learned;
CREATE POLICY project_lessons_select
  ON public.project_lessons_learned FOR SELECT TO authenticated
  USING (public.can_access_project_lessons(project_id, 'read'));

DROP POLICY IF EXISTS project_lessons_insert ON public.project_lessons_learned;
CREATE POLICY project_lessons_insert
  ON public.project_lessons_learned FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project_lessons(project_id, 'write'));

DROP POLICY IF EXISTS project_lessons_update ON public.project_lessons_learned;
CREATE POLICY project_lessons_update
  ON public.project_lessons_learned FOR UPDATE TO authenticated
  USING (public.can_access_project_lessons(project_id, 'write'))
  WITH CHECK (public.can_access_project_lessons(project_id, 'write'));

DROP POLICY IF EXISTS project_lessons_delete ON public.project_lessons_learned;
CREATE POLICY project_lessons_delete
  ON public.project_lessons_learned FOR DELETE TO authenticated
  USING (public.can_access_project_lessons(project_id, 'write'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_lessons_learned TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_user_access(
  p_user_id uuid,
  p_is_active boolean DEFAULT NULL,
  p_screen_permissions jsonb DEFAULT NULL,
  p_project_access_scope text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  target_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_user_id = auth.uid() AND p_is_active IS FALSE THEN
    RAISE EXCEPTION 'CANNOT_DEACTIVATE_SELF';
  END IF;

  SELECT role INTO target_role FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;
  IF target_role = 'admin' THEN
    RAISE EXCEPTION 'ADMIN_ACCESS_IS_FIXED';
  END IF;
  IF p_project_access_scope IS NOT NULL AND p_project_access_scope NOT IN ('member', 'all') THEN
    RAISE EXCEPTION 'INVALID_PROJECT_ACCESS_SCOPE';
  END IF;
  IF p_screen_permissions IS NOT NULL THEN
    IF jsonb_typeof(p_screen_permissions) <> 'object' OR EXISTS (
      SELECT 1
      FROM jsonb_each_text(p_screen_permissions) permission
      WHERE permission.key NOT IN ('portfolio-overview', 'tasks', 'summary', 'members', 'ms', 'effort', 'checklists', 'lessons', 'cr', 'issues', 'risks', 'activities', 'env', 'onepage')
        OR permission.value NOT IN ('hidden', 'read', 'full')
    ) THEN
      RAISE EXCEPTION 'INVALID_SCREEN_PERMISSIONS';
    END IF;
  END IF;

  UPDATE public.profiles
  SET is_active = coalesce(p_is_active, is_active),
      screen_permissions = coalesce(p_screen_permissions, screen_permissions),
      project_access_scope = coalesce(p_project_access_scope, project_access_scope)
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_access(uuid, boolean, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user_access(uuid, boolean, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
