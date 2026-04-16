-- Create vehicle_requests table for resident vehicle add/edit requests.
-- Residents submit requests to add a new vehicle or edit existing vehicle data.
-- Admin can approve (writes to vehicles table), reject (with reason), or cancel.
-- Residents can also cancel a pending/rejected request.
-- Uses local-auth architecture: RLS policies allow anon/authenticated roles.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vehicle_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id          uuid        NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  vehicle_id        uuid        REFERENCES public.vehicles(id) ON DELETE SET NULL,   -- NULL for 'add' requests
  request_type      text        NOT NULL DEFAULT 'add'
                                CHECK (request_type IN ('add', 'edit')),
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  -- requested vehicle fields
  license_plate     text,
  province          text,
  brand             text,
  model             text,
  color             text,
  vehicle_type      text,
  vehicle_status    text        DEFAULT 'active',   -- active / inactive (for edit requests)
  parking_location  text,
  parking_lock_no   text,
  parking_fee       numeric     DEFAULT 0,
  note              text,
  -- attached photo URLs (uploaded to vehicle-images/requests/{id}/)
  image_urls        text[]      DEFAULT '{}',
  -- admin review
  admin_note        text,
  reviewed_at       timestamptz,
  -- submitter
  created_by_id     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_requests_house_id     ON public.vehicle_requests(house_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_requests_vehicle_id   ON public.vehicle_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_requests_status       ON public.vehicle_requests(status);
CREATE INDEX IF NOT EXISTS idx_vehicle_requests_request_type ON public.vehicle_requests(request_type);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_vehicle_requests_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vehicle_requests_updated_at ON public.vehicle_requests;
CREATE TRIGGER trg_vehicle_requests_updated_at
  BEFORE UPDATE ON public.vehicle_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_vehicle_requests_updated_at();

-- RLS (local-auth: no Supabase JWT, use anon/authenticated)
ALTER TABLE public.vehicle_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_requests_public_select ON public.vehicle_requests;
DROP POLICY IF EXISTS vehicle_requests_public_insert ON public.vehicle_requests;
DROP POLICY IF EXISTS vehicle_requests_public_update ON public.vehicle_requests;
DROP POLICY IF EXISTS vehicle_requests_public_delete ON public.vehicle_requests;

CREATE POLICY vehicle_requests_public_select ON public.vehicle_requests
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY vehicle_requests_public_insert ON public.vehicle_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY vehicle_requests_public_update ON public.vehicle_requests
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY vehicle_requests_public_delete ON public.vehicle_requests
  FOR DELETE TO anon, authenticated USING (true);

COMMIT;
