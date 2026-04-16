-- รายการย่อยการชำระต่อ 1 ธุรกรรม
create table if not exists public.payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  fee_id uuid references public.fees(id) on delete cascade,
  house_id uuid references public.houses(id),
  item_key text not null,
  item_label text not null,
  due_amount numeric default 0,
  paid_amount numeric not null default 0,
  outstanding_amount numeric generated always as (greatest(coalesce(due_amount, 0) - coalesce(paid_amount, 0), 0)) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_items_payment_id on public.payment_items(payment_id);
create index if not exists idx_payment_items_fee_id on public.payment_items(fee_id);
create index if not exists idx_payment_items_house_id on public.payment_items(house_id);

alter table public.payment_items enable row level security;

drop policy if exists "admin_all_payment_items" on public.payment_items;
create policy "admin_all_payment_items" on public.payment_items
for all
to authenticated
using ((select role from public.profiles where id = auth.uid()) = 'admin')
with check ((select role from public.profiles where id = auth.uid()) = 'admin');

drop policy if exists "resident_own_payment_items" on public.payment_items;
create policy "resident_own_payment_items" on public.payment_items
for select
to authenticated
using (
  house_id = (select house_id from public.profiles where id = auth.uid())
);
