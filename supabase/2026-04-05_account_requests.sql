-- Account registration request workflow for resident self-register

create table if not exists account_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null default 'register',
  status text not null default 'pending', -- pending / approved / rejected / cancelled
  house_id uuid references houses(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  requested_username text not null,
  requested_phone text,
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint account_requests_request_type_check check (request_type in ('register')),
  constraint account_requests_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

create index if not exists idx_account_requests_status on account_requests(status);
create index if not exists idx_account_requests_house_id on account_requests(house_id);
create index if not exists idx_account_requests_profile_id on account_requests(profile_id);
create index if not exists idx_account_requests_created_at on account_requests(created_at desc);
