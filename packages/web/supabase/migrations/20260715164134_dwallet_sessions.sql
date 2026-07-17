alter table public.wallet_registry
  add column if not exists agent_session_id uuid references public.agent_sessions(id) on delete set null;

alter table public.wallet_registry
  alter column treasury_pda drop not null;

create index if not exists wallet_registry_agent_session_idx
  on public.wallet_registry (owner_id, agent_session_id, created_at desc);

create unique index if not exists wallet_registry_owner_chain_address_key
  on public.wallet_registry (owner_id, chain_id, chain_address);

drop policy if exists "wallet_registry_insert_own"
  on public.wallet_registry;

create policy "wallet_registry_insert_own"
  on public.wallet_registry for insert
  with check (
    owner_id = auth.uid()
    and (
      agent_session_id is null
      or exists (
        select 1
        from public.agent_sessions agents
        where agents.id = wallet_registry.agent_session_id
          and agents.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "wallet_registry_update_own"
  on public.wallet_registry;

create policy "wallet_registry_update_own"
  on public.wallet_registry for update
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      agent_session_id is null
      or exists (
        select 1
        from public.agent_sessions agents
        where agents.id = wallet_registry.agent_session_id
          and agents.owner_id = auth.uid()
      )
    )
  );

create table if not exists public.dwallet_sessions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallet_registry(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  agent_session_id uuid references public.agent_sessions(id) on delete set null,
  provider text not null default 'manual',
  provider_session_id text,
  status text not null default 'metadata_only',
  session_ciphertext jsonb,
  key_version text,
  public_key_hex text,
  authorized_user_pubkey text,
  message_metadata_digest text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint dwallet_sessions_status_check check (
    status in ('metadata_only', 'provisioning', 'active', 'failed', 'revoked')
  ),
  constraint dwallet_sessions_provider_check check (
    provider in ('manual', 'ika', 'conduit')
  )
);

create unique index if not exists dwallet_sessions_wallet_key
  on public.dwallet_sessions (wallet_id);

create unique index if not exists dwallet_sessions_provider_session_key
  on public.dwallet_sessions (owner_id, provider, provider_session_id)
  where provider_session_id is not null;

create index if not exists dwallet_sessions_owner_idx
  on public.dwallet_sessions (owner_id, status, created_at desc);

create index if not exists dwallet_sessions_agent_idx
  on public.dwallet_sessions (agent_session_id, status, created_at desc);

create trigger dwallet_sessions_set_updated_at
  before update on public.dwallet_sessions
  for each row execute function public.set_updated_at();

alter table public.dwallet_sessions enable row level security;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

grant select, insert, update, delete on table public.treasury_registry to authenticated;
grant all on table public.treasury_registry to service_role;

grant select, insert, update, delete on table public.wallet_registry to authenticated;
grant all on table public.wallet_registry to service_role;

grant select, insert, update, delete on table public.wallet_assets to authenticated;
grant all on table public.wallet_assets to service_role;

grant select, update on table public.agent_sessions to authenticated;
grant all on table public.agent_sessions to service_role;

grant all on table public.agent_session_secrets to service_role;

grant select on table public.device_codes to authenticated;
grant all on table public.device_codes to service_role;

grant all on table public.device_code_secrets to service_role;

grant select, update on table public.sign_requests to authenticated;
grant all on table public.sign_requests to service_role;

grant select on table public.activity_events to authenticated;
grant all on table public.activity_events to service_role;

grant all on table public.idempotency_keys to service_role;

revoke all on table public.dwallet_sessions from anon, authenticated;
grant all on table public.dwallet_sessions to service_role;

-- No browser policies are defined for dwallet_sessions. dWallet provider
-- sessions and encrypted credential envelopes are service-role-only.
