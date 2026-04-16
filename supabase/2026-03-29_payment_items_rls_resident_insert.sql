-- Fix RLS: allow resident to insert payment_items for own house only.

drop policy if exists "resident_own_payment_items" on public.payment_items;
drop policy if exists "resident_select_own_payment_items" on public.payment_items;
drop policy if exists "resident_insert_own_payment_items" on public.payment_items;

create policy "resident_select_own_payment_items" on public.payment_items
for select
to authenticated
using (
  house_id = (select house_id from public.profiles where id = auth.uid())
);

create policy "resident_insert_own_payment_items" on public.payment_items
for insert
to authenticated
with check (
  house_id = (select house_id from public.profiles where id = auth.uid())
  and exists (
    select 1
    from public.payments p
    where p.id = payment_id
      and p.house_id = (select house_id from public.profiles where id = auth.uid())
  )
);
