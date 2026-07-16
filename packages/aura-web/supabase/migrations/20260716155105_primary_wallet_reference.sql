alter table public.profiles
  add column if not exists primary_wallet_id uuid;

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
