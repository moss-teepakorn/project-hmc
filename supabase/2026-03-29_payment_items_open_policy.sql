-- Compatibility policy for deployments that use custom app auth (anon role).
-- This prevents payment save failures caused by payment_items RLS checks.

drop policy if exists "payment_items_open_access" on public.payment_items;
create policy "payment_items_open_access" on public.payment_items
for all
to public
using (true)
with check (true);
