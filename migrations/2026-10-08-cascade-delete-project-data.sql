BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      DELETE FROM public.members AS member
      WHERE member.project_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.projects AS project WHERE project.id = member.project_id
        )
    $sql$;
    EXECUTE 'ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_project_id_fkey';
    EXECUTE $sql$
      ALTER TABLE public.members
        ADD CONSTRAINT members_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_reminder_logs' AND column_name = 'project_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.email_reminder_logs DROP CONSTRAINT IF EXISTS email_reminder_logs_project_id_fkey';
    EXECUTE $sql$
      ALTER TABLE public.email_reminder_logs
        ADD CONSTRAINT email_reminder_logs_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns AS related_column
    JOIN information_schema.columns AS id_column
      ON id_column.table_schema = related_column.table_schema
      AND id_column.table_name = related_column.table_name
      AND id_column.udt_name = related_column.udt_name
    WHERE related_column.table_schema = 'public'
      AND related_column.table_name = 'tasks'
      AND related_column.column_name = 'related_task'
      AND id_column.column_name = 'id'
  ) THEN
    EXECUTE 'ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_related_task_fkey';
    EXECUTE $sql$
      ALTER TABLE public.tasks
        ADD CONSTRAINT tasks_related_task_fkey
        FOREIGN KEY (related_task) REFERENCES public.tasks(id) ON DELETE SET NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'start_date'
  ) THEN
    EXECUTE 'ALTER TABLE public.tasks ALTER COLUMN start_date DROP NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'end_date'
  ) THEN
    EXECUTE 'ALTER TABLE public.tasks ALTER COLUMN end_date DROP NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'actual_finish'
  ) THEN
    EXECUTE 'ALTER TABLE public.tasks ALTER COLUMN actual_finish DROP NOT NULL';
  END IF;
END;
$$;

COMMIT;