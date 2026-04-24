# AURA Backend

Backend service for the server-side parts of AURA:

- confidential Encrypt bridge
- decryption + dWallet execution lifecycle
- autonomous agent loop
- service-owned AI/operator keypair

## Required env

```bash
AURA_BACKEND_KEYPAIR=../../wallet/wallet.json
AURA_BACKEND_PORT=8787
```

Optional:

```bash
AURA_BACKEND_HOST=127.0.0.1
AURA_DEFAULT_RPC_URL=https://api.devnet.solana.com
AURA_DEFAULT_PROGRAM_ID=G4XjdmHtwwuTdw7VxWqTuTaL8WkZTKnCEnyaV5V6zgVW
AURA_AGENT_INTERVAL_MS=30000
```

## Run

```bash
cp .env.example .env
bun run vendor:sync
bun run dev
```

The repo now includes a local `packages/backend/.env` pointing at the repo-local
wallet file:

```bash
../../wallet/wallet.json
```

Build and typecheck:

```bash
bun run vendor:sync
bun run typecheck
bun run build
```

## Generated Vendor Files

The backend keeps only the thin local adapter wrappers in git:

- `src/vendor/encrypt/grpc.ts`
- `src/vendor/ika/grpc.ts`

The generated gRPC TypeScript artifacts are synced from installed dependencies
via:

```bash
bun run vendor:sync
```

That script restores:

- `src/vendor/encrypt/generated/grpc/encrypt_service.ts`
- `src/vendor/ika/generated/grpc/ika_dwallet.ts`
- `src/vendor/ika/bcs-types.ts`

## Core endpoints

- `GET /health`
- `GET /v1/service/info`
- `POST /v1/confidential/encrypt-scalar`
- `POST /v1/confidential/propose`
- `POST /v1/confidential/request-decryption`
- `POST /v1/confidential/confirm-decryption`
- `POST /v1/execution/execute`
- `POST /v1/execution/finalize`
- `POST /v1/agent/start`
- `POST /v1/agent/stop`
- `GET /v1/agent/status`

## Frontend Integration

Set the web app backend URL to:

```bash
http://127.0.0.1:8787
```

The web app uses the backend for:

- confidential scalar encryption
- Encrypt deposit setup
- confidential proposal submission
- policy decryption request / confirmation
- execute / finalize lifecycle
- autonomous agent start, stop, and status polling
