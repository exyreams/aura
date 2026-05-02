# AURA Backend

Backend service for the server-side parts of AURA:

- confidential Encrypt bridge
- decryption + dWallet execution lifecycle
- autonomous agent loop
- service-owned AI/operator keypair
- structured JSON request logging
- CORS, bearer auth, and in-memory rate limiting

## Environment

Required:

```bash
AURA_BACKEND_KEYPAIR=../../wallet/wallet.json   # path to keypair (local/docker)
# OR
AURA_KEYPAIR_B64=<base64-encoded wallet.json>   # for Railway / cloud deployments
```

Optional:

```bash
AURA_BACKEND_HOST=127.0.0.1
AURA_BACKEND_PORT=8787
AURA_DEFAULT_RPC_URL=https://api.devnet.solana.com
AURA_DEFAULT_PROGRAM_ID=2fHkM5fb8iLt5ojkubAcLpAjgkF1QL1iEXivKZmPw3ya
AURA_AGENT_INTERVAL_MS=30000
AURA_BODY_LIMIT_BYTES=1000000
AURA_RATE_LIMIT_WINDOW_MS=60000
AURA_RATE_LIMIT_MAX_REQUESTS=120
AURA_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
AURA_API_TOKEN=
AURA_LOG_LEVEL=info
```

Notes:

- `AURA_KEYPAIR_B64` takes precedence over `AURA_BACKEND_KEYPAIR` when both are set.
- `AURA_ALLOWED_ORIGINS` should list the web frontend origins allowed to call the backend.
- When `AURA_API_TOKEN` is set, every route except `GET /health` and `GET /v1/service/info` requires `Authorization: Bearer <token>`.
- If `AURA_API_TOKEN` is left empty, the server starts in local-dev mode and logs a warning.

## Local Development

```bash
cp .env.example .env
bun install
bun run dev
```

Typecheck and build:

```bash
bun run typecheck
bun run build
```

## Docker

The image uses a multi-stage build: `oven/bun:1-alpine` to build and bundle, `gcr.io/distroless/nodejs24-debian12:nonroot` as the runtime. No `node_modules` are shipped — esbuild bundles everything into a single file. Final image size is ~207MB.

Build and run with Compose (uses `../../wallet/wallet.json` mounted as a read-only secret):

```bash
# Build
docker compose build

# Start (detached)
docker compose up -d

# Start with fresh build
docker compose up -d --build

# View logs
docker compose logs -f

# Stop (keep container)
docker compose stop

# Stop and remove container
docker compose down
```

Build and run manually:

```bash
docker build -t aura-backend .

docker run --rm \
  -p 8787:8787 \
  --env-file .env \
  -v /absolute/path/to/wallet.json:/run/secrets/aura-backend-keypair.json:ro \
  -e AURA_BACKEND_KEYPAIR=/run/secrets/aura-backend-keypair.json \
  aura-backend
```

## Railway Deployment

Railway does not support file mounts. Pass the keypair as a base64 env var instead:

```bash
# Encode your keypair locally
base64 -w 0 wallet/wallet.json
```

Set the output as `AURA_KEYPAIR_B64` in Railway's environment variables (mark it as a secret). The `AURA_BACKEND_KEYPAIR` variable is not needed when `AURA_KEYPAIR_B64` is set.

Also set `AURA_BACKEND_HOST=0.0.0.0` so Railway's proxy can reach the service.

## Generated Vendor Files

The backend keeps only the thin local adapter wrappers in git:

- `src/vendor/encrypt/grpc.ts`
- `src/vendor/ika/grpc.ts`

The generated gRPC TypeScript artifacts are synced from installed dependencies via:

```bash
bun run vendor:sync
```

That script restores:

- `src/vendor/encrypt/generated/grpc/encrypt_service.ts`
- `src/vendor/ika/generated/grpc/ika_dwallet.ts`
- `src/vendor/ika/bcs-types.ts`

## Core Endpoints

- `GET /health`
- `GET /v1/service/info`
- `POST /v1/confidential/encrypt-scalar`
- `POST /v1/confidential/deposit/ensure`
- `POST /v1/confidential/propose`
- `POST /v1/confidential/request-decryption`
- `POST /v1/confidential/confirm-decryption`
- `POST /v1/execution/execute`
- `POST /v1/execution/finalize`
- `POST /v1/agent/start`
- `POST /v1/agent/run-once`
- `POST /v1/agent/stop`
- `GET /v1/agent/status`

All success responses:

```json
{
  "ok": true,
  "data": {},
  "meta": { "requestId": "uuid", "timestamp": "2026-04-29T00:00:00.000Z" }
}
```

All error responses:

```json
{
  "ok": false,
  "error": { "code": "UNAUTHORIZED", "message": "Missing or invalid bearer token." },
  "meta": { "requestId": "uuid", "timestamp": "2026-04-29T00:00:00.000Z" }
}
```

Operational behavior:

- Request/response logs are emitted as structured JSON.
- Rate limits are applied per client IP and route.
- `POST` bodies must be JSON and are size-limited by `AURA_BODY_LIMIT_BYTES`.
- `Retry-After` and `x-request-id` headers are set on relevant responses.

## Frontend Integration

Set the web app backend URL to:

```
http://127.0.0.1:8787
```
