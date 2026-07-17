# @aura-protocol/conduit

Conduit is the agent-facing access layer for AURA. It provides a local MCP stdio server, an HTTP/OpenAPI gateway, and a small operator CLI over the same audited tool registry.

The owner key is not part of the agent runtime. Read-only and session-scoped agent actions go through `dispatchTool`; owner-grade actions are queued as sign requests for human review.

## Modes

### Offline

Use this when an AI client runs on the same machine as the operator.

- Transport: MCP stdio.
- Auth: local `aurak_` token from `AURA_CONDUIT_TOKEN` or the OS keychain.
- State: SQLite control plane at `~/.aura-conduit/conduit.db` by default.
- Best for: Claude Code, Codex, Cursor, Zed, Cline, Continue, and other local MCP clients.

```bash
cd packages/conduit
npm install
npm run build
node bin/conduit.js mcp --account claude-code-laptop
```

### Online

Use this when a remote tool caller needs HTTP access.

- Transport: Fastify HTTP with bearer auth.
- Auth: `Authorization: Bearer aurak_live_...`.
- State: the same SQLite control plane.
- Best for: hosted agents, LangChain/OpenAI tool calling, scripts, and internal services.

```bash
node bin/conduit.js http \
  --host 127.0.0.1 \
  --port 8788 \
  --public-base-url http://127.0.0.1:8788
```

```bash
curl -X POST http://127.0.0.1:8788/v1/whoami \
  -H "Authorization: Bearer aurak_live_..." \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{}'
```

The OpenAPI spec is served at `/openapi.json`.

## Tool Surface

Conduit currently exposes 18 tools:

- `aura.whoami`
- `aura.instructions.list`
- `aura.instruction.describe`
- `aura.instruction.prepare`
- `aura.instruction.request_signature`
- `aura.treasury.get`
- `aura.policy.preview`
- `aura.spend.request`
- `aura.execution.pause.request`
- `aura.recipient_limit.set.request`
- `aura.recipient_limit.remove.request`
- `aura.session.status`
- `aura.activity.tail`
- `aura.proposal.list`
- `aura.proposal.get`
- `aura.proposal.create`
- `aura.proposal.cancel`
- `aura.execute.pending`

The instruction tools are IDL-driven. They cover the current AURA program instruction set without requiring one hand-written tool per method:

- `aura.instructions.list` returns every instruction grouped by feature domain.
- `aura.instruction.describe` returns accounts, args, signer accounts, and sample input.
- `aura.instruction.prepare` validates accounts/args and returns serialized instruction bytes without signing.
- `aura.instruction.request_signature` builds an unsigned transaction and queues it for human review. It never signs or submits directly.
- `aura.spend.request` is the friendly proposal path for common treasury spends.
- `aura.execution.pause.request`, `aura.recipient_limit.set.request`, and `aura.recipient_limit.remove.request` are friendly owner-review queueing paths for common treasury controls.

## CLI

```text
conduit mcp                 start the local MCP stdio server
conduit http                start the HTTP/OpenAPI gateway
conduit agent login         device-flow login and keychain storage
conduit agent status        list local keychain accounts
conduit agent logout        remove a keychain entry
conduit agent refresh       replace a stored token through device flow
conduit agent token         print a stored token only with --allow-unsafe
conduit agent list          list sessions for an owner
conduit kill                revoke sessions for an owner
conduit doctor              check RPC, keychain, and control-plane health
conduit audit verify        verify the local hash-chained audit log
conduit audit anchor        queue an audit-root anchor sign request
conduit audit tail          print recent audit entries
```

Common environment variables:

```text
CONDUIT_RPC_URL
CONDUIT_CLUSTER
CONDUIT_PROGRAM_ID
CONDUIT_DB_PATH
CONDUIT_HTTP_HOST
CONDUIT_HTTP_PORT
CONDUIT_PUBLIC_BASE_URL
CONDUIT_CONTROL_PLANE_URL
CONDUIT_DEVICE_FLOW_PATH
CONDUIT_CORS_ORIGIN
CONDUIT_DASHBOARD_BASE_URL
AURA_CONDUIT_TOKEN
```

### Test login against web

When `packages/web` is running on `http://localhost:3000`, the CLI can
drive the Supabase-backed device login UI directly:

```bash
CONDUIT_CONTROL_PLANE_URL=http://localhost:3000/api/conduit \
CONDUIT_DEVICE_FLOW_PATH=/device \
CONDUIT_DASHBOARD_BASE_URL=http://localhost:3000 \
node packages/conduit/bin/conduit.js agent login \
  --account claude-code-local \
  --agent-id claude-code-local
```

Open the printed `/dashboard/conduit/device?code=...` URL, approve the session,
then the CLI stores the returned `aurak_...` token in the OS keychain.

## Architecture

```text
consumers
  human operator
  local AI MCP client
  remote MCP/HTTP client

adapters
  conduit CLI
  MCP stdio server
  HTTP/OpenAPI gateway
  packaged agent skill

core
  tool registry
  dispatch path
  strict schemas
  scope checks
  idempotency
  rate limits
  circuit breaker
  anomaly observation
  audit log
  sign-request queue
  session resolver

backends
  Solana RPC
  AURA SDK
  SQLite control plane
```

Transport code lives under `mcp/`, `http/`, and `cli/`. Business logic stays under `core/` and is transport-agnostic.

## Safety Rules

- Tokens are stored as SHA-256 hashes in the control plane.
- Owner-signed instructions go through sign requests, not direct agent execution.
- Every tool input uses strict Zod schemas.
- Every tool call passes through one dispatch path for scopes, idempotency, safety hooks, and audit logging.
- The registry refuses unsafe tool declarations at startup.
- HTTP logs redact authorization headers, cookies, set-cookie, and token fields.
- HTTP responses include request-id/security headers, control-plane and tool routes are `no-store`, and request bodies are capped by `--max-body-bytes`.
- The OpenAPI surface is generated from each tool's Zod input schema so hosted agents see the same strict input contract used at runtime.
- `aura.policy.preview` issues TOCTOU tickets; proposal creation rejects mismatched args.
- The generic instruction tools expose full IDL coverage while keeping signing separate from preparation.

## Development

```bash
cd packages/conduit
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Current unit coverage is local-only and does not require a running validator.

## Package Skill

The agent-facing skill lives at `skills/aura-conduit/SKILL.md`. Use it when configuring local or remote AI clients so they know which tools are read-only, which queue human signatures, and which scopes are required.

## License

MIT
