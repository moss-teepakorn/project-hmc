ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS screen_permissions jsonb,
  ADD COLUMN IF NOT EXISTS project_access_scope text NOT NULL DEFAULT 'member';

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
      WHERE permission.key NOT IN ('portfolio-overview', 'tasks', 'summary', 'members', 'ms', 'effort', 'checklists', 'cr', 'issues', 'risks', 'activities', 'env', 'onepage')
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