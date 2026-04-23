# AURA Backend

Backend service for the server-side parts of AURA:

- confidential Encrypt bridge
- decryption + dWallet execution lifecycle
- autonomous agent loop
- service-owned AI/operator keypair

## Required env

```bash
AURA_BACKEND_KEYPAIR=/abs/path/to/keypair.json
AURA_BACKEND_PORT=8787
```

Optional:

```bash
AURA_BACKEND_HOST=0.0.0.0
AURA_DEFAULT_RPC_URL=https://api.devnet.solana.com
AURA_DEFAULT_PROGRAM_ID=<override>
AURA_AGENT_INTERVAL_MS=30000
```

## Run

```bash
cp .env.example .env
bun run dev
```

Build and typecheck:

```bash
bun run typecheck
bun run build
```

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
