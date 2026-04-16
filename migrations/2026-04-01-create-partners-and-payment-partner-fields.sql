-- Create partners table for external payers and add payment-level snapshot fields.
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text,
  address text,
  phone text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_partners_name on public.partners(name);
create index if not exists idx_partners_is_active on public.partners(is_active);

create or replace function public.set_partners_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_partners_updated_at on public.partners;
create trigger trg_partners_updated_at
before update on public.partners
for each row execute function public.set_partners_updated_at();

alter table if exists public.payments
  add column if not exists partner_id uuid references public.partners(id) on delete set null,
  add column if not exists payer_tax_id text,
  add column if not exists payer_address text;

create index if not exists idx_payments_partner_id on public.payments(partner_id);

alter table public.partners enable row level security;

drop policy if exists partners_select_authenticated on public.partners;
create policy partners_select_authenticated
on public.partners
for select
to authenticated
using (true);

drop policy if exists partners_insert_admin on public.partners;
create policy partners_insert_admin
on public.partners
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_admin, false) = true
  )
);

drop policy if exists partners_update_admin on public.partners;
create policy partners_update_admin
on public.partners
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_admin, false) = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_admin, false) = true
  )
);

drop policy if exists partners_delete_admin on public.partners;
create policy partners_delete_admin
on public.partners
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_admin, false) = true
  )
);
