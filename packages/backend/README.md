# AURA Backend

**Docs:** https://docs-auraprotocol.vercel.app

> [!WARNING]
> AURA is under active development. Program instructions, account layouts, policy semantics, SDK APIs, and deployment behavior may still change. Do not use this code to secure production funds until a stable release and audit are published.

Backend service for the server-side parts of AURA:

- confidential Encrypt bridge
- decryption + dWallet execution lifecycle
- autonomous agent loop
- user-scoped generated agent keypairs
- SQLite persistence for agents, DKG sessions, treasuries, jobs, and auth nonces
- SIWS wallet auth with httpOnly cookie sessions
- structured JSON request logging
- CORS credentials and in-memory rate limiting

## Environment

Required:

```bash
AURA_ENCRYPTION_KEY=<64 hex chars>   # openssl rand -hex 32
AURA_JWT_SECRET=<64 hex chars>       # openssl rand -hex 32
```

Optional:

```bash
AURA_BACKEND_HOST=127.0.0.1
AURA_BACKEND_PORT=8787
AURA_DEFAULT_RPC_URL=https://api.devnet.solana.com
AURA_DEFAULT_PROGRAM_ID=auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce
AURA_DATABASE_PATH=./data/aura.db
AURA_JWT_EXPIRY_SECS=86400
AURA_COOKIE_DOMAIN=
AURA_COOKIE_SECURE=true
AURA_AGENT_INTERVAL_MS=30000
AURA_BODY_LIMIT_BYTES=1000000
AURA_RATE_LIMIT_WINDOW_MS=60000
AURA_RATE_LIMIT_MAX_REQUESTS=120
AURA_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
AURA_LOG_LEVEL=info
```

Notes:

- `AURA_DATABASE_PATH` is created automatically. Keep it on persistent storage in Docker or hosted deployments.
- `AURA_ENCRYPTION_KEY` encrypts generated agent keypairs at rest with AES-256-GCM.
- `AURA_JWT_SECRET` signs SIWS session JWTs stored in the `aura_session` httpOnly cookie.
- `AURA_ALLOWED_ORIGINS` should list the web frontend origins allowed to call the backend.
- Credentialed CORS cannot use `*`, so each frontend origin must be listed explicitly.
- Leave `AURA_COOKIE_SECURE=true` in production. Set it to `false` only for local HTTP testing.
- `AURA_API_TOKEN`, `AURA_BACKEND_KEYPAIR`, and `AURA_KEYPAIR_B64` are no longer used.

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

The image uses a two-stage Node 20 build. The runtime stage reinstalls production dependencies with `npm ci` so `better-sqlite3`'s native addon is compiled against Node's ABI. Mount `/app/data` as persistent storage so the SQLite database survives deploys.

Build and run with Compose:

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
  -v aura-backend-data:/app/data \
  aura-backend
```

## Railway Deployment

**Live service:** `https://aura-backend-production-eb86.up.railway.app`

### Prerequisites

```bash
npm install -g @railway/cli
railway login
```

### First-time setup

```bash
cd packages/backend

# Initialize and link to the existing project
railway init

# Link the service
railway service

# Set all required environment variables in one command
railway variables set \
  AURA_ENCRYPTION_KEY=<64 hex chars> \
  AURA_JWT_SECRET=<64 hex chars> \
  AURA_BACKEND_HOST=0.0.0.0 \
  AURA_COOKIE_SECURE=true \
  AURA_DATABASE_PATH=/app/data/aura.db \
  "AURA_ALLOWED_ORIGINS=https://your-frontend-domain.com"

# Generate secrets with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add a persistent volume for SQLite (run once)
railway volume add --mount-path /app/data

# Deploy
railway up --detach
```

### Redeploying after changes

```bash
cd packages/backend
railway up --detach
```

Watch logs after deploy:

```bash
railway logs          # runtime logs
railway logs --build  # build logs from last deploy
```

### Notes

- The Dockerfile uses a two-stage Node 20 build. `better-sqlite3` is compiled against Node's ABI in the runtime stage so the native addon works correctly.
- `package-lock.json` must not be in `.dockerignore` — it is required by `npm ci` during the build.
- `AURA_BACKEND_HOST` must be `0.0.0.0` so Railway's proxy can reach the service. The default `127.0.0.1` will cause the healthcheck to fail.
- The volume at `/app/data` persists the SQLite database across deploys. Without it, all agent keypairs and sessions are lost on every redeploy.
- `AURA_ALLOWED_ORIGINS` must include your frontend domain. Credentialed CORS cannot use `*`.
- Railway injects a `PORT` env var — the backend falls back to it if `AURA_BACKEND_PORT` is not set.

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
- `GET /v1/auth/nonce`
- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`
- `POST /v1/signers`
- `GET /v1/signers`
- `GET /v1/signers/:id/download`
- `DELETE /v1/signers/:id`
- `GET /v1/features/catalog`
- `GET /v1/instructions/catalog`
- `POST /v1/instructions/build`
- `POST /v1/instructions/send`
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

Protected routes use the `aura_session` httpOnly cookie. Routes that need the backend to sign must include `agentId` in the request body:

```json
{
  "agentId": "ops-agent",
  "treasury": "base58...",
  "rpcUrl": "https://api.devnet.solana.com"
}
```

Create an agent keypair with `POST /v1/signers`. The response includes a public identity JSON object but never returns the secret key. The encrypted secret key stays in SQLite and is decrypted only for the duration of signing.

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
  "error": { "code": "UNAUTHORIZED", "message": "Authentication is required." },
  "meta": { "requestId": "uuid", "timestamp": "2026-04-29T00:00:00.000Z" }
}
```

Operational behavior:

- Request/response logs are emitted as structured JSON.
- Rate limits are applied per client IP and route.
- `POST` bodies must be JSON and are size-limited by `AURA_BODY_LIMIT_BYTES`.
- `Retry-After` and `x-request-id` headers are set on relevant responses.

## Frontend Integration

Local development: `http://127.0.0.1:8787`
