create table if not exists public.conduit_device_approval_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_code_id uuid not null references public.device_codes(id) on delete cascade,
  wallet_id uuid references public.account_wallets(id) on delete set null,
  wallet_address text not null,
  wallet_address_canonical text not null,
  nonce text not null unique,
  message text not null,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  used_at timestamptz,
  constraint conduit_device_approval_challenges_status_check check (
    status in ('pending', 'used', 'expired')
  )
);

create index if not exists conduit_device_approval_challenges_owner_idx
  on public.conduit_device_approval_challenges (owner_id, status, expires_at desc);

create index if not exists conduit_device_approval_challenges_device_code_idx
  on public.conduit_device_approval_challenges (device_code_id, status, created_at desc);

alter table public.conduit_device_approval_challenges enable row level security;

-- Browser clients request and consume challenges through API routes only.
-- Challenge rows include exact messages and signatures, so keep them service-role-only.
revoke all on table public.conduit_device_approval_challenges from anon, authenticated;
grant all on table public.conduit_device_approval_challenges to service_role;
