-- 2026-05-01: Align project status storage with masterCodes codeValue values
BEGIN;

-- Convert any existing label values to master code values before tightening the constraint.
UPDATE projects SET status = 'planning'   WHERE status = 'Planning';
UPDATE projects SET status = 'req_design'  WHERE status = 'Req & Design';
UPDATE projects SET status = 'setup'       WHERE status = 'Setup';
UPDATE projects SET status = 'testing'     WHERE status = 'Testing';
UPDATE projects SET status = 'go_live'     WHERE status = 'Go Live';
UPDATE projects SET status = 'hyper_care'  WHERE status = 'Hyper Care';

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_status_check,
  ADD CONSTRAINT projects_status_check CHECK (status IN ('planning','req_design','setup','testing','go_live','hyper_care'));

COMMIT;
