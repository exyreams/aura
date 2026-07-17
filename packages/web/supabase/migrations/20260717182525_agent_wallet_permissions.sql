create table if not exists public.agent_wallet_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  agent_session_id uuid not null references public.agent_sessions(id) on delete cascade,
  wallet_id uuid not null references public.wallet_registry(id) on delete cascade,
  scopes text[] not null default '{}',
  status text not null default 'active',
  grant_source text not null default 'owner',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint agent_wallet_permissions_status_check check (
    status in ('active', 'revoked')
  ),
  constraint agent_wallet_permissions_source_check check (
    grant_source in ('owner', 'conduit_agent', 'system_backfill')
  ),
  constraint agent_wallet_permissions_scopes_check check (
    scopes <@ array['wallet:read', 'wallet:create', 'wallet:transfer']::text[]
  ),
  unique (owner_id, agent_session_id, wallet_id)
);

create index if not exists agent_wallet_permissions_owner_idx
  on public.agent_wallet_permissions (owner_id, status, updated_at desc);

create index if not exists agent_wallet_permissions_agent_idx
  on public.agent_wallet_permissions (agent_session_id, status, wallet_id);

create index if not exists agent_wallet_permissions_wallet_idx
  on public.agent_wallet_permissions (wallet_id, status, agent_session_id);

drop trigger if exists agent_wallet_permissions_set_updated_at
  on public.agent_wallet_permissions;

create trigger agent_wallet_permissions_set_updated_at
  before update on public.agent_wallet_permissions
  for each row execute function public.set_updated_at();

alter table public.agent_wallet_permissions enable row level security;

grant select, insert, update, delete on table public.agent_wallet_permissions to authenticated;
grant all on table public.agent_wallet_permissions to service_role;

drop policy if exists "agent_wallet_permissions_select_own"
  on public.agent_wallet_permissions;

create policy "agent_wallet_permissions_select_own"
  on public.agent_wallet_permissions for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "agent_wallet_permissions_insert_own"
  on public.agent_wallet_permissions;

create policy "agent_wallet_permissions_insert_own"
  on public.agent_wallet_permissions for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.agent_sessions agents
      where agents.id = agent_wallet_permissions.agent_session_id
        and agents.owner_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.wallet_registry wallets
      where wallets.id = agent_wallet_permissions.wallet_id
        and wallets.owner_id = (select auth.uid())
    )
  );

drop policy if exists "agent_wallet_permissions_update_own"
  on public.agent_wallet_permissions;

create policy "agent_wallet_permissions_update_own"
  on public.agent_wallet_permissions for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.agent_sessions agents
      where agents.id = agent_wallet_permissions.agent_session_id
        and agents.owner_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.wallet_registry wallets
      where wallets.id = agent_wallet_permissions.wallet_id
        and wallets.owner_id = (select auth.uid())
    )
  );

drop policy if exists "agent_wallet_permissions_delete_own"
  on public.agent_wallet_permissions;

create policy "agent_wallet_permissions_delete_own"
  on public.agent_wallet_permissions for delete
  to authenticated
  using (owner_id = (select auth.uid()));

with linked_permissions as (
  select
    wallets.owner_id,
    wallets.agent_session_id,
    wallets.id as wallet_id,
    array_remove(array[
      case when 'wallet:read' = any(agents.scopes) then 'wallet:read' end,
      case when 'wallet:create' = any(agents.scopes) then 'wallet:create' end,
      case when 'wallet:transfer' = any(agents.scopes) then 'wallet:transfer' end
    ]::text[], null) as scopes
  from public.wallet_registry wallets
  join public.agent_sessions agents
    on agents.id = wallets.agent_session_id
   and agents.owner_id = wallets.owner_id
  where wallets.agent_session_id is not null
)
insert into public.agent_wallet_permissions (
  owner_id,
  agent_session_id,
  wallet_id,
  scopes,
  status,
  grant_source,
  metadata
)
select
  owner_id,
  agent_session_id,
  wallet_id,
  scopes,
  case when array_length(scopes, 1) > 0 then 'active' else 'revoked' end,
  'system_backfill',
  jsonb_build_object(
    'version', 'aura.agent_wallet_permission.v1',
    'backfilled_from', 'wallet_registry.agent_session_id'
  )
from linked_permissions
on conflict (owner_id, agent_session_id, wallet_id) do update
set
  scopes = excluded.scopes,
  status = excluded.status,
  grant_source = excluded.grant_source,
  metadata = agent_wallet_permissions.metadata || excluded.metadata,
  revoked_at = case
    when excluded.status = 'revoked' then now()
    else null
  end;
