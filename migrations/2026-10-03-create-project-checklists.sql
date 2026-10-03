BEGIN;

CREATE TABLE IF NOT EXISTS public.project_checklist_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('project', 'setup', 'migrate-data')),
  work_system text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT '',
  order_no integer NOT NULL DEFAULT 10 CHECK (order_no > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_checklist_topic_scope_check CHECK (
    (category = 'project' AND work_system = '' AND stage IN ('planning', 'requirements-design', 'setup', 'testing', 'go-live', 'hyper-care'))
    OR (category IN ('setup', 'migrate-data') AND work_system <> '' AND stage = '')
  )
);

CREATE INDEX IF NOT EXISTS idx_project_checklist_topics_category_system_order
  ON public.project_checklist_topics(category, work_system, stage, order_no);

CREATE TABLE IF NOT EXISTS public.project_checklist_progress (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.project_checklist_topics(id) ON DELETE CASCADE,
  done boolean NOT NULL DEFAULT false,
  completion_date date,
  completed_by text NOT NULL DEFAULT '',
  jira_id text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_project_checklist_progress_topic
  ON public.project_checklist_progress(topic_id);

CREATE OR REPLACE FUNCTION public.set_project_checklist_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_checklist_topics_updated_at ON public.project_checklist_topics;
CREATE TRIGGER trg_project_checklist_topics_updated_at
  BEFORE UPDATE ON public.project_checklist_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_project_checklist_updated_at();

DROP TRIGGER IF EXISTS trg_project_checklist_progress_updated_at ON public.project_checklist_progress;
CREATE TRIGGER trg_project_checklist_progress_updated_at
  BEFORE UPDATE ON public.project_checklist_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_project_checklist_updated_at();

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
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          (p_action = 'write' AND p.role IN ('pm', 'member'))
          OR (p_action = 'read' AND p.role IN ('pm', 'member', 'client'))
        )
        AND (
          EXISTS (
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
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_project_checklist(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_project_checklist(uuid, text) TO authenticated;

ALTER TABLE public.project_checklist_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_checklist_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_checklist_topics_authenticated_select ON public.project_checklist_topics;
CREATE POLICY project_checklist_topics_authenticated_select
  ON public.project_checklist_topics FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS project_checklist_topics_admin_insert ON public.project_checklist_topics;
CREATE POLICY project_checklist_topics_admin_insert
  ON public.project_checklist_topics FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS project_checklist_topics_admin_update ON public.project_checklist_topics;
CREATE POLICY project_checklist_topics_admin_update
  ON public.project_checklist_topics FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS project_checklist_topics_admin_delete ON public.project_checklist_topics;
CREATE POLICY project_checklist_topics_admin_delete
  ON public.project_checklist_topics FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS project_checklist_progress_project_select ON public.project_checklist_progress;
CREATE POLICY project_checklist_progress_project_select
  ON public.project_checklist_progress FOR SELECT TO authenticated
  USING (public.can_access_project_checklist(project_id, 'read'));

DROP POLICY IF EXISTS project_checklist_progress_project_insert ON public.project_checklist_progress;
CREATE POLICY project_checklist_progress_project_insert
  ON public.project_checklist_progress FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project_checklist(project_id, 'write'));

DROP POLICY IF EXISTS project_checklist_progress_project_update ON public.project_checklist_progress;
CREATE POLICY project_checklist_progress_project_update
  ON public.project_checklist_progress FOR UPDATE TO authenticated
  USING (public.can_access_project_checklist(project_id, 'write'))
  WITH CHECK (public.can_access_project_checklist(project_id, 'write'));

DROP POLICY IF EXISTS project_checklist_progress_project_delete ON public.project_checklist_progress;
CREATE POLICY project_checklist_progress_project_delete
  ON public.project_checklist_progress FOR DELETE TO authenticated
  USING (public.can_access_project_checklist(project_id, 'write'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_checklist_topics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_checklist_progress TO authenticated;

INSERT INTO public.masters_code (code_type, code_key, code_value, label, sort_order, active)
VALUES
  ('work_system', 'humatrix', 'Humatrix', 'Humatrix', 10, true),
  ('work_system', 'workplaze', 'Workplaze', 'Workplaze', 20, true)
ON CONFLICT (code_type, code_key) DO NOTHING;

WITH default_topics(category, work_system, stage, order_no, title) AS (
  VALUES
    ('project', '', 'planning', 10, 'Confirm project scope'),
    ('project', '', 'planning', 20, 'Agree success criteria'),
    ('project', '', 'requirements-design', 10, 'Review requirements'),
    ('project', '', 'requirements-design', 20, 'Approve solution design'),
    ('project', '', 'setup', 10, 'Configure project environment'),
    ('project', '', 'setup', 20, 'Prepare user access'),
    ('project', '', 'testing', 10, 'Complete integration testing'),
    ('project', '', 'testing', 20, 'Confirm user acceptance'),
    ('project', '', 'go-live', 10, 'Confirm production readiness'),
    ('project', '', 'go-live', 20, 'Complete go-live checklist'),
    ('project', '', 'hyper-care', 10, 'Review post-launch issues'),
    ('project', '', 'hyper-care', 20, 'Confirm transition to support')
)
INSERT INTO public.project_checklist_topics (category, work_system, stage, order_no, title)
SELECT defaults.category, defaults.work_system, defaults.stage, defaults.order_no, defaults.title
FROM default_topics defaults
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_checklist_topics existing
  WHERE existing.category = defaults.category
    AND existing.work_system = defaults.work_system
    AND existing.stage = defaults.stage
    AND existing.order_no = defaults.order_no
);

COMMIT;