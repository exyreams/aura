create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.treasury_registry (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  treasury_pda text not null,
  owner_wallet text not null,
  label text,
  network text not null default 'devnet',
  program_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, program_id, treasury_pda)
);

create table if not exists public.wallet_registry (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  treasury_pda text not null,
  wallet_kind text not null,
  chain_id integer not null,
  chain_name text not null,
  dwallet_id text,
  dwallet_state_pda text,
  chain_address text not null,
  label text,
  status text not null default 'unknown',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_registry_kind_check check (
    wallet_kind in (
      'dwallet',
      'owner_wallet',
      'agent_fee_wallet',
      'external_recipient'
    )
  ),
  unique (owner_id, treasury_pda, chain_id, chain_address)
);

create table if not exists public.wallet_assets (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallet_registry(id) on delete cascade,
  network text not null,
  token_program text,
  mint text,
  token_account text,
  symbol text,
  decimals integer,
  last_raw_amount text,
  last_ui_amount numeric,
  last_refreshed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  agent_id text not null,
  agent_label text,
  treasury_pda text,
  scopes text[] not null default '{}',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint agent_sessions_status_check check (
    status in ('active', 'expired', 'revoked', 'suspended')
  )
);

create table if not exists public.agent_session_secrets (
  session_id uuid primary key references public.agent_sessions(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.device_codes (
  id uuid primary key default gen_random_uuid(),
  user_code text not null unique,
  owner_id uuid references public.profiles(id) on delete cascade,
  requested_agent_label text,
  requested_scopes text[] not null default '{}',
  requested_treasury_pda text,
  status text not null default 'pending',
  approved_session_id uuid references public.agent_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  denied_at timestamptz,
  consumed_at timestamptz,
  constraint device_codes_status_check check (
    status in ('pending', 'approved', 'denied', 'expired', 'consumed')
  )
);

create table if not exists public.device_code_secrets (
  device_code_id uuid primary key references public.device_codes(id) on delete cascade,
  device_code_hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  agent_session_id uuid references public.agent_sessions(id) on delete set null,
  treasury_pda text,
  request_kind text not null,
  status text not null default 'pending',
  payload jsonb not null,
  message text,
  transaction_base64 text,
  signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  constraint sign_requests_kind_check check (
    request_kind in (
      'device_approval',
      'owner_signature',
      'proposal_cancel',
      'emergency_revoke',
      'wallet_withdrawal_approval'
    )
  ),
  constraint sign_requests_status_check check (
    status in ('pending', 'approved', 'rejected', 'expired', 'consumed')
  )
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  agent_session_id uuid references public.agent_sessions(id) on delete set null,
  treasury_pda text,
  wallet_id uuid references public.wallet_registry(id) on delete set null,
  event_kind text not null,
  severity text not null default 'info',
  title text not null,
  summary text,
  tx_signature text,
  proposal_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_events_severity_check check (
    severity in ('info', 'success', 'warning', 'error')
  )
);

create table if not exists public.idempotency_keys (
  key text primary key,
  owner_id uuid references public.profiles(id) on delete cascade,
  agent_session_id uuid references public.agent_sessions(id) on delete cascade,
  request_hash text not null,
  response jsonb,
  status text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint idempotency_keys_status_check check (
    status in ('started', 'completed', 'failed')
  )
);

create index if not exists treasury_registry_owner_idx
  on public.treasury_registry (owner_id, network, program_id);

create index if not exists wallet_registry_owner_idx
  on public.wallet_registry (owner_id, treasury_pda, chain_id);

create index if not exists wallet_assets_wallet_idx
  on public.wallet_assets (wallet_id);

create unique index if not exists wallet_assets_identity_idx
  on public.wallet_assets (
    wallet_id,
    coalesce(token_program, ''),
    coalesce(mint, ''),
    coalesce(token_account, '')
  );

create index if not exists agent_sessions_owner_idx
  on public.agent_sessions (owner_id, status, created_at desc);

create index if not exists device_codes_user_code_idx
  on public.device_codes (user_code, status, expires_at);

create index if not exists sign_requests_owner_idx
  on public.sign_requests (owner_id, status, created_at desc);

create index if not exists activity_events_owner_idx
  on public.activity_events (owner_id, created_at desc);

create index if not exists activity_events_treasury_idx
  on public.activity_events (treasury_pda, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger treasury_registry_set_updated_at
  before update on public.treasury_registry
  for each row execute function public.set_updated_at();

create trigger wallet_registry_set_updated_at
  before update on public.wallet_registry
  for each row execute function public.set_updated_at();

create trigger agent_sessions_set_updated_at
  before update on public.agent_sessions
  for each row execute function public.set_updated_at();

create trigger device_codes_set_updated_at
  before update on public.device_codes
  for each row execute function public.set_updated_at();

create trigger sign_requests_set_updated_at
  before update on public.sign_requests
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.treasury_registry enable row level security;
alter table public.wallet_registry enable row level security;
alter table public.wallet_assets enable row level security;
alter table public.agent_sessions enable row level security;
alter table public.agent_session_secrets enable row level security;
alter table public.device_codes enable row level security;
alter table public.device_code_secrets enable row level security;
alter table public.sign_requests enable row level security;
alter table public.activity_events enable row level security;
alter table public.idempotency_keys enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "treasury_registry_select_own"
  on public.treasury_registry for select
  using (owner_id = auth.uid());

create policy "treasury_registry_insert_own"
  on public.treasury_registry for insert
  with check (owner_id = auth.uid());

create policy "treasury_registry_update_own"
  on public.treasury_registry for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "treasury_registry_delete_own"
  on public.treasury_registry for delete
  using (owner_id = auth.uid());

create policy "wallet_registry_select_own"
  on public.wallet_registry for select
  using (owner_id = auth.uid());

create policy "wallet_registry_insert_own"
  on public.wallet_registry for insert
  with check (owner_id = auth.uid());

create policy "wallet_registry_update_own"
  on public.wallet_registry for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "wallet_registry_delete_own"
  on public.wallet_registry for delete
  using (owner_id = auth.uid());

create policy "wallet_assets_select_own"
  on public.wallet_assets for select
  using (
    exists (
      select 1
      from public.wallet_registry wallets
      where wallets.id = wallet_assets.wallet_id
        and wallets.owner_id = auth.uid()
    )
  );

create policy "wallet_assets_insert_own"
  on public.wallet_assets for insert
  with check (
    exists (
      select 1
      from public.wallet_registry wallets
      where wallets.id = wallet_assets.wallet_id
        and wallets.owner_id = auth.uid()
    )
  );

create policy "wallet_assets_update_own"
  on public.wallet_assets for update
  using (
    exists (
      select 1
      from public.wallet_registry wallets
      where wallets.id = wallet_assets.wallet_id
        and wallets.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.wallet_registry wallets
      where wallets.id = wallet_assets.wallet_id
        and wallets.owner_id = auth.uid()
    )
  );

create policy "wallet_assets_delete_own"
  on public.wallet_assets for delete
  using (
    exists (
      select 1
      from public.wallet_registry wallets
      where wallets.id = wallet_assets.wallet_id
        and wallets.owner_id = auth.uid()
    )
  );

create policy "agent_sessions_select_own"
  on public.agent_sessions for select
  using (owner_id = auth.uid());

create policy "agent_sessions_update_own"
  on public.agent_sessions for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "device_codes_select_own"
  on public.device_codes for select
  using (owner_id = auth.uid());

create policy "sign_requests_select_own"
  on public.sign_requests for select
  using (owner_id = auth.uid());

create policy "sign_requests_update_own"
  on public.sign_requests for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "activity_events_select_own"
  on public.activity_events for select
  using (owner_id = auth.uid());

-- No browser policies are defined for agent_session_secrets,
-- device_code_secrets, or idempotency_keys. They are service-role-only.
