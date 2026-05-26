BEGIN;

CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  activity_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('Online', 'Onsite', 'Email', 'MS Teams', 'Line', 'Other')),
  title text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_project_id ON public.activities(project_id);
CREATE INDEX IF NOT EXISTS idx_activities_activity_date ON public.activities(activity_date);

CREATE OR REPLACE FUNCTION public.set_activities_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activities_updated_at ON public.activities;
CREATE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.set_activities_updated_at();

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activities_public_select ON public.activities;
DROP POLICY IF EXISTS activities_public_insert ON public.activities;
DROP POLICY IF EXISTS activities_public_update ON public.activities;
DROP POLICY IF EXISTS activities_public_delete ON public.activities;

CREATE POLICY activities_public_select ON public.activities
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY activities_public_insert ON public.activities
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY activities_public_update ON public.activities
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY activities_public_delete ON public.activities
  FOR DELETE TO anon, authenticated USING (true);

INSERT INTO public.masters_code (code_type, code_key, code_value, label, sort_order, text_color, bg_color)
VALUES
  ('activity_type', 'document_delivery', 'Document Delivery', 'Document Delivery', 10, '#0F172A', '#E0F2FE'),
  ('activity_type', 'onsite_visit', 'Onsite Visit', 'Onsite Visit', 20, '#0F172A', '#DCFCE7'),
  ('activity_type', 'training', 'Training', 'Training', 30, '#0F172A', '#FCE7F3')
ON CONFLICT (code_type, code_key) DO NOTHING;

COMMIT;
