create table if not exists public.policy_template_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_wallet text not null,
  cluster text not null default 'devnet',
  program_id text not null,
  template_pda text not null,
  template_id text not null,
  name text not null,
  description text not null default '',
  version integer not null default 0,
  onchain_created_at bigint,
  onchain_updated_at bigint,
  applied_count text not null default '0',
  shared boolean not null default false,
  source_preset integer,
  policy_config jsonb not null,
  config_fields jsonb not null,
  status text not null default 'active',
  last_tx_signature text,
  last_tx_slot bigint,
  last_synced_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint policy_template_snapshots_cluster_check check (
    cluster in ('devnet', 'mainnet-beta')
  ),
  constraint policy_template_snapshots_status_check check (
    status in ('active', 'closed')
  ),
  constraint policy_template_snapshots_source_preset_check check (
    source_preset is null or source_preset between 0 and 255
  ),
  unique (cluster, program_id, template_pda),
  unique (owner_id, cluster, program_id, owner_wallet, template_id)
);

create table if not exists public.treasury_policy_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_wallet text not null,
  cluster text not null default 'devnet',
  program_id text not null,
  treasury_pda text not null,
  template_pda text,
  template_id text,
  template_name text,
  policy_version integer,
  policy_config jsonb not null,
  status text not null default 'active',
  last_tx_signature text,
  last_tx_slot bigint,
  last_synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint treasury_policy_snapshots_cluster_check check (
    cluster in ('devnet', 'mainnet-beta')
  ),
  constraint treasury_policy_snapshots_status_check check (
    status in ('active', 'stale')
  ),
  unique (cluster, program_id, treasury_pda)
);

create index if not exists policy_template_snapshots_owner_idx
  on public.policy_template_snapshots (
    owner_id,
    cluster,
    program_id,
    status,
    onchain_updated_at desc nulls last,
    updated_at desc
  );

create index if not exists policy_template_snapshots_owner_wallet_idx
  on public.policy_template_snapshots (owner_wallet, cluster, program_id, status);

create index if not exists treasury_policy_snapshots_owner_idx
  on public.treasury_policy_snapshots (
    owner_id,
    cluster,
    program_id,
    status,
    updated_at desc
  );

create index if not exists treasury_policy_snapshots_treasury_idx
  on public.treasury_policy_snapshots (treasury_pda, cluster, program_id, status);

drop trigger if exists policy_template_snapshots_set_updated_at
  on public.policy_template_snapshots;

create trigger policy_template_snapshots_set_updated_at
  before update on public.policy_template_snapshots
  for each row execute function public.set_updated_at();

drop trigger if exists treasury_policy_snapshots_set_updated_at
  on public.treasury_policy_snapshots;

create trigger treasury_policy_snapshots_set_updated_at
  before update on public.treasury_policy_snapshots
  for each row execute function public.set_updated_at();

alter table public.policy_template_snapshots enable row level security;
alter table public.treasury_policy_snapshots enable row level security;

grant select on table public.policy_template_snapshots to authenticated;
grant select on table public.treasury_policy_snapshots to authenticated;
grant all on table public.policy_template_snapshots to service_role;
grant all on table public.treasury_policy_snapshots to service_role;

drop policy if exists "policy_template_snapshots_select_own"
  on public.policy_template_snapshots;

create policy "policy_template_snapshots_select_own"
  on public.policy_template_snapshots for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "treasury_policy_snapshots_select_own"
  on public.treasury_policy_snapshots;

create policy "treasury_policy_snapshots_select_own"
  on public.treasury_policy_snapshots for select
  to authenticated
  using (owner_id = (select auth.uid()));
