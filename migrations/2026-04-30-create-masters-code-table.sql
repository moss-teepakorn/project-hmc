CREATE TABLE IF NOT EXISTS public.masters_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_type text NOT NULL,
  code_key text NOT NULL,
  code_value text NOT NULL,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  text_color text NOT NULL DEFAULT '#0F172A',
  bg_color text NOT NULL DEFAULT '#EEF2FF',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS masters_code_code_type_key_idx ON public.masters_code (code_type, code_key);

INSERT INTO public.masters_code (code_type, code_key, code_value, label, sort_order, text_color, bg_color)
VALUES
  ('project_status', 'planning',     'Planning',               'Planning',     10, '#92400E', '#FEF3C7'),
  ('project_status', 'req_design',   'Req & Design',           'Req & Design', 20, '#1E40AF', '#DBEAFE'),
  ('project_status', 'setup',        'Setup',                  'Setup',        30, '#9A3412', '#FED7AA'),
  ('project_status', 'testing',      'Testing',                'Testing',      40, '#6B21A8', '#E9D5FF'),
  ('project_status', 'go_live',      'Go Live',                'Go Live',      50, '#065F46', '#D1FAE5'),
  ('project_status', 'hyper_care',   'Hyper Care',             'Hyper Care',   60, '#475569', '#F1F5F9'),
  ('task_phase',   'project_initiation',          'Project Initiation',          'Project Initiation',          10, '#0F172A', '#F8FAFF'),
  ('task_phase',   'requirement_gap_analysis',    'Requirement & Gap Analysis',  'Requirement & Gap Analysis',  20, '#0F172A', '#F8FAFF'),
  ('task_phase',   'business_blueprint',          'Business Blueprint',         'Business Blueprint',          30, '#0F172A', '#F8FAFF'),
  ('task_phase',   'system_configuration',        'System Configuration',       'System Configuration',        40, '#0F172A', '#F8FAFF'),
  ('task_phase',   'data_migration',              'Data Migration',             'Data Migration',              50, '#0F172A', '#F8FAFF'),
  ('task_phase',   'uat_parallel_run',            'UAT & Parallel Run',         'UAT & Parallel Run',          60, '#0F172A', '#F8FAFF'),
  ('task_phase',   'go_live_hypercare',           'Go-live & Hypercare',        'Go-live & Hypercare',         70, '#0F172A', '#F8FAFF')
ON CONFLICT (code_type, code_key) DO NOTHING;
