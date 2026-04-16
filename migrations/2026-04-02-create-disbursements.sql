-- Create disbursements and disbursement_items tables for expense/outgoing payment system.
-- Supports partners and houses as recipients, VAT/WHT, 4-status workflow (draft→pending→approved→paid).
-- Board members are used as approver and payer references.
-- Uses local-auth architecture: RLS policies allow anon/authenticated roles.

BEGIN;

CREATE TABLE IF NOT EXISTS public.disbursements (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type      text           NOT NULL DEFAULT 'partner',
  partner_id          uuid           REFERENCES public.partners(id) ON DELETE SET NULL,
  house_id            uuid           REFERENCES public.houses(id) ON DELETE SET NULL,
  disbursement_date   date           NOT NULL,
  payment_method      text           NOT NULL DEFAULT 'transfer',
  bank_name           text,
  bank_account_no     text,
  bank_account_name   text,
  sub_total           numeric(15,2)  NOT NULL DEFAULT 0,
  vat_enabled         boolean        NOT NULL DEFAULT false,
  vat_rate            numeric(5,2)   NOT NULL DEFAULT 7.00,
  vat_amount          numeric(15,2)  NOT NULL DEFAULT 0,
  wht_enabled         boolean        NOT NULL DEFAULT false,
  wht_rate            numeric(5,2)   NOT NULL DEFAULT 3.00,
  wht_amount          numeric(15,2)  NOT NULL DEFAULT 0,
  total_amount        numeric(15,2)  NOT NULL DEFAULT 0,
  status              text           NOT NULL DEFAULT 'draft',
  approver_id         uuid           REFERENCES public.board_members(id) ON DELETE SET NULL,
  approved_at         timestamptz,
  payer_id            uuid           REFERENCES public.board_members(id) ON DELETE SET NULL,
  paid_at             timestamptz,
  note                text,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disbursements_status       ON public.disbursements(status);
CREATE INDEX IF NOT EXISTS idx_disbursements_partner_id   ON public.disbursements(partner_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_house_id     ON public.disbursements(house_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_approver_id  ON public.disbursements(approver_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_payer_id     ON public.disbursements(payer_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_date         ON public.disbursements(disbursement_date);

CREATE TABLE IF NOT EXISTS public.disbursement_items (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  disbursement_id   uuid          NOT NULL REFERENCES public.disbursements(id) ON DELETE CASCADE,
  item_type_id      uuid          REFERENCES public.payment_item_types(id) ON DELETE SET NULL,
  item_label        text          NOT NULL,
  amount            numeric(15,2) NOT NULL DEFAULT 0,
  note              text,
  sort_order        int           NOT NULL DEFAULT 0,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disbursement_items_disbursement_id ON public.disbursement_items(disbursement_id);

-- updated_at trigger for disbursements
CREATE OR REPLACE FUNCTION public.set_disbursements_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_disbursements_updated_at ON public.disbursements;
CREATE TRIGGER trg_disbursements_updated_at
  BEFORE UPDATE ON public.disbursements
  FOR EACH ROW EXECUTE FUNCTION public.set_disbursements_updated_at();

-- RLS (local-auth)
ALTER TABLE public.disbursements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disbursement_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS disbursements_public_select ON public.disbursements;
DROP POLICY IF EXISTS disbursements_public_insert ON public.disbursements;
DROP POLICY IF EXISTS disbursements_public_update ON public.disbursements;
DROP POLICY IF EXISTS disbursements_public_delete ON public.disbursements;

CREATE POLICY disbursements_public_select ON public.disbursements
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY disbursements_public_insert ON public.disbursements
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY disbursements_public_update ON public.disbursements
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY disbursements_public_delete ON public.disbursements
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS disbursement_items_public_select ON public.disbursement_items;
DROP POLICY IF EXISTS disbursement_items_public_insert ON public.disbursement_items;
DROP POLICY IF EXISTS disbursement_items_public_update ON public.disbursement_items;
DROP POLICY IF EXISTS disbursement_items_public_delete ON public.disbursement_items;

CREATE POLICY disbursement_items_public_select ON public.disbursement_items
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY disbursement_items_public_insert ON public.disbursement_items
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY disbursement_items_public_update ON public.disbursement_items
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY disbursement_items_public_delete ON public.disbursement_items
  FOR DELETE TO anon, authenticated USING (true);

COMMIT;
