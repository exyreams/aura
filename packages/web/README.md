# @aura-protocol/web

New AURA control center package.

This app is the active AURA web package. The control-plane model now lives in
Supabase and Conduit is built around that shared state.

## Setup

Create `packages/web/.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
DWALLET_CREDENTIALS_KEY=
DWALLET_CREDENTIALS_KEY_VERSION=v1
IKA_DWALLET_GRPC_URL=pre-alpha-dev-1.ika.ika-network.net:443
NEXT_PUBLIC_SOLANA_RPC_URL=
NEXT_PUBLIC_AURA_PROGRAM_ID=auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce
```

`SUPABASE_SECRET_KEY` is server-only and is required for web-created agent
sessions because bearer-token hashes live in service-role-only tables.
`DWALLET_CREDENTIALS_KEY` is server-only and is required when AURA Web creates
an Ika dWallet because the Ika authority key, DKG session identifier, and
attestation are encrypted before storage. Generate it with
`openssl rand -base64 32`. Manual dWallet registration records public metadata
without storing credential material. `IKA_DWALLET_GRPC_URL` is optional and
defaults to Ika pre-alpha devnet.
`NEXT_PUBLIC_SOLANA_RPC_URL` and `NEXT_PUBLIC_AURA_PROGRAM_ID` are optional. The
app defaults to Solana devnet and the deployed devnet AURA program ID.

Apply the first Supabase migration:

```bash
supabase db push
```

The migration creates owner profiles, wallet metadata, agent session metadata,
device-code records, sign requests, activity events, and service-only secret
tables. Browser reads are protected by RLS; bearer-token and device-code hashes
are service-role-only. dWallet provider sessions are also service-role-only and
store encrypted envelopes when provider credentials exist.

## Run

```bash
bun install
bun run dev
```

The first implemented surface is `/dashboard/wallets`:

- wallet metadata is read from Supabase
- Solana balances are read live from RPC
- Ika dWallets can be created from the dashboard and stored with encrypted
  server-only session material
- fund movement requests are recorded for the signer runtime; full autonomous
  execution is handled outside the owner dashboard
