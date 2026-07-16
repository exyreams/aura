# AURA Conduit

Use this skill when an AI agent needs to operate AURA through Conduit.

## Transports

Offline/local mode:

- Use the MCP stdio server.
- Start with `conduit mcp --account <keychain-account>` or pass `AURA_CONDUIT_TOKEN`.
- Prefer this mode for desktop agent clients and local development.

Online/remote mode:

- Use the HTTP/OpenAPI gateway.
- Send `Authorization: Bearer <aurak token>` on every `/v1/*` request.
- Send an `Idempotency-Key` header for write or queueing calls.

## Tool Policy

Read-only tools:

- `aura.whoami`
- `aura.instructions.list`
- `aura.instruction.describe`
- `aura.instruction.prepare`
- `aura.treasury.get`
- `aura.policy.preview`
- `aura.session.status`
- `aura.activity.tail`
- `aura.proposal.list`
- `aura.proposal.get`

Human-review queueing tools:

- `aura.instruction.request_signature`
- `aura.execution.pause.request`
- `aura.recipient_limit.set.request`
- `aura.recipient_limit.remove.request`
- `aura.proposal.cancel`

Session-scoped write tools:

- `aura.proposal.create`
- `aura.spend.request`
- `aura.execute.pending`

## Rules

- Never ask for or handle an owner private key.
- Use `aura.instruction.prepare` before requesting a signature for unfamiliar instructions.
- Use `aura.policy.preview` before `aura.proposal.create` or `aura.spend.request` when a policy decision matters.
- Treat `aura.instruction.request_signature` as a queueing action, not as execution.
- Report the returned sign request id or proposal id to the human.
- Do not retry writes without the same idempotency key.
- If a tool returns `needs_human`, stop and surface the review URL or sign request id.
