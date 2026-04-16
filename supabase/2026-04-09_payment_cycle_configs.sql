create table if not exists public.payment_cycle_configs (
  id uuid primary key default gen_random_uuid(),
  year_ce integer not null,
  frequency text not null check (frequency in ('monthly', 'quarterly', 'half_yearly', 'yearly')),
  is_active boolean not null default true,
  created_by_id uuid references public.profiles(id) on delete set null,
  updated_by_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_payment_cycle_configs_year_ce
  on public.payment_cycle_configs(year_ce);

create table if not exists public.payment_cycle_periods (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.payment_cycle_configs(id) on delete cascade,
  seq_no integer not null,
  period_label text not null,
  start_date date not null,
  end_date date not null,
  due_date date not null,
  due_year_offset integer not null default 0 check (due_year_offset in (0, 1)),
  enable_penalty boolean not null default false,
  penalty_start_date date,
  penalty_year_offset integer not null default 0 check (penalty_year_offset in (0, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_payment_cycle_period_dates check (end_date >= start_date),
  constraint chk_payment_cycle_penalty_date check (
    (enable_penalty = false and penalty_start_date is null)
    or (enable_penalty = true and penalty_start_date is not null)
  )
);

create unique index if not exists uq_payment_cycle_periods_config_seq
  on public.payment_cycle_periods(config_id, seq_no);

create index if not exists idx_payment_cycle_periods_config_id
  on public.payment_cycle_periods(config_id);

alter table public.payment_cycle_configs enable row level security;
alter table public.payment_cycle_periods enable row level security;

drop policy if exists payment_cycle_configs_public_all on public.payment_cycle_configs;
create policy payment_cycle_configs_public_all
on public.payment_cycle_configs
for all
to public
using (true)
with check (true);

drop policy if exists payment_cycle_periods_public_all on public.payment_cycle_periods;
create policy payment_cycle_periods_public_all
on public.payment_cycle_periods
for all
to public
using (true)
with check (true);
