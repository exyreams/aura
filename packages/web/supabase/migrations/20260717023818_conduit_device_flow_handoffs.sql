alter table public.device_codes
  add column if not exists client_name text,
  add column if not exists requested_agent_id text,
  add column if not exists requested_caps jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists interval_seconds integer not null default 5;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'device_codes_interval_seconds_check'
      and conrelid = 'public.device_codes'::regclass
  ) then
    alter table public.device_codes
      add constraint device_codes_interval_seconds_check
      check (interval_seconds between 1 and 60);
  end if;
end;
$$;

create table if not exists public.device_token_handoffs (
  device_code_id uuid primary key references public.device_codes(id) on delete cascade,
  agent_session_id uuid not null references public.agent_sessions(id) on delete cascade,
  token_ciphertext text not null,
  token_iv text not null,
  token_tag text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists device_token_handoffs_expires_idx
  on public.device_token_handoffs (expires_at);

alter table public.device_token_handoffs enable row level security;

-- No browser policies are defined for device_token_handoffs.
-- One-time bearer token handoff rows are service-role-only.
revoke all on table public.device_token_handoffs from anon, authenticated;
grant all on table public.device_token_handoffs to service_role;

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
