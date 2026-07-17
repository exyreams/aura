alter table public.profiles
  alter column wallet_address drop not null;

alter table public.profiles
  add column if not exists email text,
  add column if not exists email_confirmed_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists auth_provider text not null default 'email',
  add column if not exists primary_wallet_id uuid;

create table if not exists public.account_wallets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  chain_id integer not null default 2,
  chain_name text not null default 'Solana',
  wallet_address text not null,
  wallet_address_canonical text not null,
  wallet_label text,
  is_primary boolean not null default false,
  verification_message text not null,
  verification_signature text not null,
  verification_method text not null default 'solana_sign_message',
  verification_version text not null default 'aura.wallet_link.v1',
  metadata jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint account_wallets_chain_check check (chain_id >= 0),
  constraint account_wallets_address_check check (length(wallet_address) <= 160),
  constraint account_wallets_canonical_check check (length(wallet_address_canonical) <= 160)
);

create table if not exists public.wallet_link_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  chain_id integer not null default 2,
  chain_name text not null default 'Solana',
  wallet_address text not null,
  wallet_address_canonical text not null,
  nonce text not null unique,
  message text not null,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  constraint wallet_link_challenges_status_check check (
    status in ('pending', 'used', 'expired')
  ),
  constraint wallet_link_challenges_chain_check check (chain_id >= 0)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_primary_wallet_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_primary_wallet_id_fkey
      foreign key (primary_wallet_id)
      references public.account_wallets(id)
      on delete set null;
  end if;
end $$;

create index if not exists profiles_primary_wallet_idx
  on public.profiles (primary_wallet_id)
  where primary_wallet_id is not null;

create unique index if not exists account_wallets_active_wallet_key
  on public.account_wallets (chain_id, wallet_address_canonical)
  where revoked_at is null;

create unique index if not exists account_wallets_primary_owner_key
  on public.account_wallets (owner_id)
  where is_primary and revoked_at is null;

create index if not exists account_wallets_owner_idx
  on public.account_wallets (owner_id, is_primary desc, created_at desc)
  where revoked_at is null;

create index if not exists wallet_link_challenges_owner_idx
  on public.wallet_link_challenges (owner_id, status, expires_at desc);

alter function public.set_updated_at()
  set search_path = public;

create trigger account_wallets_set_updated_at
  before update on public.account_wallets
  for each row execute function public.set_updated_at();

create or replace function public.sync_profile_primary_wallet()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  wallet_record record;
begin
  if new.primary_wallet_id is null then
    new.wallet_address = null;
    return new;
  end if;

  select id, owner_id, wallet_address, revoked_at
  into wallet_record
  from public.account_wallets
  where id = new.primary_wallet_id;

  if not found then
    raise exception 'Primary wallet % does not exist.', new.primary_wallet_id
      using errcode = '23503';
  end if;

  if wallet_record.owner_id <> new.id then
    raise exception 'Primary wallet must belong to the profile owner.'
      using errcode = '23514';
  end if;

  if wallet_record.revoked_at is not null then
    raise exception 'Primary wallet cannot be revoked.'
      using errcode = '23514';
  end if;

  new.wallet_address = wallet_record.wallet_address;
  return new;
end;
$$;

drop trigger if exists profiles_sync_primary_wallet on public.profiles;

create trigger profiles_sync_primary_wallet
  before insert or update of primary_wallet_id on public.profiles
  for each row execute function public.sync_profile_primary_wallet();

alter table public.account_wallets enable row level security;
alter table public.wallet_link_challenges enable row level security;

create policy "account_wallets_select_own"
  on public.account_wallets for select
  to authenticated
  using (owner_id = (select auth.uid()));

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

revoke all on table public.account_wallets from anon, authenticated;
grant select on table public.account_wallets to authenticated;
grant all on table public.account_wallets to service_role;

revoke all on table public.wallet_link_challenges from anon, authenticated;
grant all on table public.wallet_link_challenges to service_role;

insert into public.account_wallets (
  owner_id,
  chain_id,
  chain_name,
  wallet_address,
  wallet_address_canonical,
  wallet_label,
  is_primary,
  verification_message,
  verification_signature,
  verification_method,
  verification_version,
  metadata,
  linked_at,
  last_verified_at,
  created_at,
  updated_at
)
select
  id,
  2,
  'Solana',
  wallet_address,
  wallet_address,
  'Primary wallet',
  true,
  'Migrated from the legacy Supabase Web3 owner sign-in profile.',
  'legacy',
  'legacy_web3_sign_in',
  'aura.wallet_link.legacy.v1',
  jsonb_build_object('source', 'profiles.wallet_address'),
  created_at,
  updated_at,
  created_at,
  updated_at
from public.profiles
where wallet_address is not null
on conflict do nothing;

with primary_wallets as (
  select distinct on (owner_id)
    owner_id,
    id,
    wallet_address
  from public.account_wallets
  where is_primary
    and revoked_at is null
  order by owner_id, created_at asc
)
update public.profiles as profiles
set
  primary_wallet_id = primary_wallets.id,
  wallet_address = primary_wallets.wallet_address
from primary_wallets
where profiles.id = primary_wallets.owner_id
  and profiles.primary_wallet_id is null;
