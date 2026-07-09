# @aura-protocol/aura-web

New AURA control center package.

This app is intentionally separate from `packages/web` while the control-plane
model moves to Supabase and Conduit is rewritten around that shared state.

## Setup

Create `packages/aura-web/.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SOLANA_RPC_URL=
NEXT_PUBLIC_AURA_PROGRAM_ID=auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce
```

`NEXT_PUBLIC_SOLANA_RPC_URL` and `NEXT_PUBLIC_AURA_PROGRAM_ID` are optional.
The app defaults to Solana devnet and the deployed devnet AURA program ID.

Apply the first Supabase migration:

```bash
supabase db push
```

The migration creates owner profiles, wallet metadata, agent session metadata,
device-code records, sign requests, activity events, and service-only secret
tables. Browser reads are protected by RLS; bearer-token and device-code hashes
are service-role-only.

## Run

```bash
bun install
bun run dev
```

The first implemented surface is `/dashboard/wallets`:

- wallet metadata is read from Supabase
- Solana balances are read live from RPC
- fund movement is intentionally gated until the real AURA proposal and dWallet
  signing path is wired
