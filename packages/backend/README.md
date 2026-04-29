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
AURA_BACKEND_KEYPAIR=../../wallet/wallet.json
AURA_BACKEND_PORT=8787
```

Optional:

```bash
AURA_BACKEND_HOST=127.0.0.1
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

- `AURA_ALLOWED_ORIGINS` should list the web frontend origins allowed to call the backend.
- When `AURA_API_TOKEN` is set, every route except `GET /health` and
  `GET /v1/service/info` requires `Authorization: Bearer <token>`.
- If `AURA_API_TOKEN` is left empty, the server starts in local-dev mode and logs a warning.

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

The repo now includes a local `packages/backend/.env` pointing at the repo-local
wallet file:

```bash
../../wallet/wallet.json
```

Build and typecheck:

```bash
npm run typecheck
npm run build
```

## Generated Vendor Files

The backend keeps only the thin local adapter wrappers in git:

- `src/vendor/encrypt/grpc.ts`
- `src/vendor/ika/grpc.ts`

The generated gRPC TypeScript artifacts are synced from installed dependencies
via:

```bash
npm run vendor:sync
```

That script restores:

- `src/vendor/encrypt/generated/grpc/encrypt_service.ts`
- `src/vendor/ika/generated/grpc/ika_dwallet.ts`
- `src/vendor/ika/bcs-types.ts`

## Core endpoints

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

All success responses use:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-29T00:00:00.000Z"
  }
}
```

All error responses use:

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid bearer token."
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-29T00:00:00.000Z"
  }
}
```

Operational behavior:

- Request/response logs are emitted as structured JSON.
- Rate limits are applied per client IP and route.
- `POST` bodies must be JSON and are size-limited by `AURA_BODY_LIMIT_BYTES`.
- `Retry-After` and `x-request-id` headers are set on relevant responses.

## Docker

This package now includes a production-ready `Dockerfile`, `.dockerignore`, and
`docker-compose.yml`. Docker is not available in this environment, so the files
were prepared but not executed here.

Build the image:

```bash
docker build -t aura-backend .
```

Run it directly:

```bash
docker run --rm \
  -p 8787:8787 \
  --env-file .env \
  -v /absolute/path/to/wallet.json:/run/secrets/aura-backend-keypair.json:ro \
  -e AURA_BACKEND_KEYPAIR=/run/secrets/aura-backend-keypair.json \
  aura-backend
```

Or with Compose:

```bash
docker compose up --build
```

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
