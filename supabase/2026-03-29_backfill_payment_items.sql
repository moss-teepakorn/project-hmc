-- Backfill payment_items for old payments that were saved before item rows existed.
-- Safe to run multiple times.

-- 1) Backfill from JSON metadata marker when available.
create or replace function public._safe_jsonb(raw text)
returns jsonb
language plpgsql
as $$
begin
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  return raw::jsonb;
exception when others then
  return null;
end;
$$;

with source_rows as (
  select
    p.id as payment_id,
    p.fee_id,
    p.house_id,
    public._safe_jsonb(nullif(split_part(coalesce(p.note, ''), '[PAYMENT_ITEMS_JSON]', 2), '')) as meta_json
  from public.payments p
  where p.fee_id is not null
    and coalesce(p.note, '') like '%[PAYMENT_ITEMS_JSON]%'
    and not exists (
      select 1 from public.payment_items pi where pi.payment_id = p.id
    )
), expanded as (
  select
    s.payment_id,
    s.fee_id,
    s.house_id,
    e.value as item
  from source_rows s
  cross join lateral jsonb_array_elements(coalesce(s.meta_json -> 'items', '[]'::jsonb)) as e(value)
)
insert into public.payment_items (
  payment_id,
  fee_id,
  house_id,
  item_key,
  item_label,
  due_amount,
  paid_amount
)
select
  x.payment_id,
  x.fee_id,
  x.house_id,
  coalesce(nullif(x.item ->> 'key', ''), 'legacy_item'),
  coalesce(nullif(x.item ->> 'label', ''), '-'),
  coalesce((x.item ->> 'dueAmount')::numeric, 0),
  greatest(coalesce((x.item ->> 'paidAmount')::numeric, 0), 0)
from expanded x
where jsonb_typeof(x.item) = 'object'
  and coalesce((x.item ->> 'paidAmount')::numeric, 0) > 0;

-- 2) Backfill from legacy plain-text note format by known labels.
with base as (
  select
    p.id as payment_id,
    p.fee_id,
    p.house_id,
    regexp_replace(coalesce(p.note, ''), '\\s*\\[PAYMENT_ITEMS_JSON\\].*$', '') as note_base,
    f.*
  from public.payments p
  join public.fees f on f.id = p.fee_id
  where p.fee_id is not null
    and not exists (
      select 1 from public.payment_items pi where pi.payment_id = p.id
    )
), parsed as (
  select payment_id, fee_id, house_id, 'fee_common'::text as item_key, 'ค่าส่วนกลาง'::text as item_label,
         coalesce(fee_common, 0)::numeric as due_amount,
         coalesce(nullif(replace((regexp_match(note_base, 'ค่าส่วนกลาง\\s*฿?\\s*([0-9,]+(?:\\.[0-9]+)?)'))[1], ',', ''), '')::numeric, 0) as paid_amount
  from base
  union all
  select payment_id, fee_id, house_id, 'fee_parking', 'ค่าจอดรถ',
         coalesce(fee_parking, 0)::numeric,
         coalesce(nullif(replace((regexp_match(note_base, 'ค่าจอดรถ\\s*฿?\\s*([0-9,]+(?:\\.[0-9]+)?)'))[1], ',', ''), '')::numeric, 0)
  from base
  union all
  select payment_id, fee_id, house_id, 'fee_waste', 'ค่าขยะ',
         coalesce(fee_waste, 0)::numeric,
         coalesce(nullif(replace((regexp_match(note_base, 'ค่าขยะ\\s*฿?\\s*([0-9,]+(?:\\.[0-9]+)?)'))[1], ',', ''), '')::numeric, 0)
  from base
  union all
  select payment_id, fee_id, house_id, 'fee_overdue_common', 'ยอดค้างยกมา',
         coalesce(fee_overdue_common, 0)::numeric,
         coalesce(nullif(replace((regexp_match(note_base, 'ยอดค้างยกมา\\s*฿?\\s*([0-9,]+(?:\\.[0-9]+)?)'))[1], ',', ''), '')::numeric, 0)
  from base
  union all
  select payment_id, fee_id, house_id, 'fee_overdue_fine', 'ค่าปรับยอดค้าง',
         coalesce(fee_overdue_fine, 0)::numeric,
         coalesce(nullif(replace((regexp_match(note_base, 'ค่าปรับยอดค้าง\\s*฿?\\s*([0-9,]+(?:\\.[0-9]+)?)'))[1], ',', ''), '')::numeric, 0)
  from base
  union all
  select payment_id, fee_id, house_id, 'fee_overdue_notice', 'ค่าทวงถามยอดค้าง',
         coalesce(fee_overdue_notice, 0)::numeric,
         coalesce(nullif(replace((regexp_match(note_base, 'ค่าทวงถามยอดค้าง\\s*฿?\\s*([0-9,]+(?:\\.[0-9]+)?)'))[1], ',', ''), '')::numeric, 0)
  from base
  union all
  select payment_id, fee_id, house_id, 'fee_fine', 'ค่าปรับ',
         coalesce(fee_fine, 0)::numeric,
         coalesce(nullif(replace((regexp_match(note_base, 'ค่าปรับ\\s*฿?\\s*([0-9,]+(?:\\.[0-9]+)?)'))[1], ',', ''), '')::numeric, 0)
  from base
  union all
  select payment_id, fee_id, house_id, 'fee_notice', 'ค่าทวงถาม',
         coalesce(fee_notice, 0)::numeric,
         coalesce(nullif(replace((regexp_match(note_base, 'ค่าทวงถาม\\s*฿?\\s*([0-9,]+(?:\\.[0-9]+)?)'))[1], ',', ''), '')::numeric, 0)
  from base
  union all
  select payment_id, fee_id, house_id, 'fee_violation', 'ค่ากระทำผิด',
         coalesce(fee_violation, 0)::numeric,
         coalesce(nullif(replace((regexp_match(note_base, 'ค่ากระทำผิด\\s*฿?\\s*([0-9,]+(?:\\.[0-9]+)?)'))[1], ',', ''), '')::numeric, 0)
  from base
  union all
  select payment_id, fee_id, house_id, 'fee_other', 'ค่าอื่นๆ',
         coalesce(fee_other, 0)::numeric,
         coalesce(nullif(replace((regexp_match(note_base, 'ค่าอื่นๆ\\s*฿?\\s*([0-9,]+(?:\\.[0-9]+)?)'))[1], ',', ''), '')::numeric, 0)
  from base
)
insert into public.payment_items (
  payment_id,
  fee_id,
  house_id,
  item_key,
  item_label,
  due_amount,
  paid_amount
)
select
  p.payment_id,
  p.fee_id,
  p.house_id,
  p.item_key,
  p.item_label,
  p.due_amount,
  p.paid_amount
from parsed p
where p.paid_amount > 0
  and not exists (
    select 1 from public.payment_items pi where pi.payment_id = p.payment_id
  );

-- 3) Final fallback: if still missing rows, store one total row so old payments are not blank.
insert into public.payment_items (
  payment_id,
  fee_id,
  house_id,
  item_key,
  item_label,
  due_amount,
  paid_amount
)
select
  p.id,
  p.fee_id,
  p.house_id,
  'legacy_total',
  'ยอดชำระย้อนหลัง',
  coalesce(f.total_amount, coalesce(p.amount, 0)),
  greatest(coalesce(p.amount, 0), 0)
from public.payments p
left join public.fees f on f.id = p.fee_id
where p.fee_id is not null
  and coalesce(p.amount, 0) > 0
  and not exists (
    select 1 from public.payment_items pi where pi.payment_id = p.id
  );

-- Optional cleanup of helper function.
drop function if exists public._safe_jsonb(text);
