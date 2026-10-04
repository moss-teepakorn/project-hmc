DROP POLICY IF EXISTS email_reminder_logs_admin_select ON public.email_reminder_logs;
CREATE POLICY email_reminder_logs_admin_select
  ON public.email_reminder_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND coalesce(p.is_active, true)
    )
  );

DROP POLICY IF EXISTS email_reminder_logs_admin_delete ON public.email_reminder_logs;
CREATE POLICY email_reminder_logs_admin_delete
  ON public.email_reminder_logs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND coalesce(p.is_active, true)
    )
  );
