![AURA banner](packages/web/public/banner.png)

# AURA — Autonomous Universal Resource Agent

**Execution-control layer for agentic finance.**

AURA is a Solana-native treasury control plane for autonomous agents. It lets an
AI agent propose actions, checks those actions against programmable policy,
escalates or blocks risky behavior, and executes approved actions through
dWallets without giving the agent raw private-key control.

In simpler terms: **AURA turns an AI agent from a bot with a wallet key into an
operator inside a governed treasury system.**

**Dashboard:** https://auraa-protocol.vercel.app  
**Docs:** https://docs-auraprotocol.vercel.app  
**Program (devnet):** `auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce`

> [!WARNING]
> AURA is under active development. Program instructions, account layouts,
> policy semantics, SDK APIs, and deployment behavior may still change. Do not
> use it to custody production funds until a stable release and audit are
> published.

---

## What AURA Is

AURA is not a standalone policy contract or a wallet wrapper. It is an
operating layer around autonomous capital movement:

```text
agent intent
  -> policy decision
  -> optional approval / guardian escalation
  -> dWallet approval
  -> signed execution
  -> settlement / accounting / audit trail
```

The core object is an **agent treasury**: a Solana account system that stores
policy, dWallet registrations, AI/operator permissions, pending proposals,
governance controls, recovery paths, receipts, logs, and risk state.

Agents can propose actions, but AURA decides whether those actions are allowed
before a signature is produced.

---

## Why It Exists

Autonomous agents can already reason about trading, payments, payroll, treasury
management, and operations. The weak point is execution.

Most systems still force a bad tradeoff: give the agent direct key access, or
put a centralized approval server in the middle. AURA is designed for the space
between those extremes.

| Problem | What breaks without AURA |
| --- | --- |
| **Direct key access** | A prompt injection, model bug, or compromised runtime can drain funds because the agent and attacker are indistinguishable once the key is exposed. |
| **Public spending policy** | On-chain caps reveal strategy. Competitors, searchers, and attackers can inspect limits, infer behavior, and route around known thresholds. |
| **Centralized approval middleware** | Autonomy depends on trusted off-chain services, creating a single point of failure and an opaque enforcement layer. |
| **No programmable policy** | Most wallets offer binary access. They cannot natively express per-chain limits, time windows, velocity caps, counterparty risk, or escalation ladders. |
| **No approval escalation path** | Risky actions either pass or fail. There is no built-in path for guardian review, multisig override, timelock, or policy receipt capture. |
| **Operator and session sprawl** | Short-lived operators, service keys, and agent roles become hard to scope, revoke, or audit across a live treasury. |
| **Multi-chain key sprawl** | Supporting Ethereum, Bitcoin, Solana, and other chains usually means managing separate hot keys and operational policies per chain. |
| **Settlement ambiguity** | After a cross-chain or chain-bound signature is produced, most systems lose track of broadcast, resubmission, confirmation, and accounting state. |
| **No audit trail** | There is often no cryptographically verifiable record of what policy was active, what was checked, and why an action was approved or denied. |
| **Weak recovery controls** | If an AI authority, operator, or owner path is compromised, recovery is usually ad hoc instead of encoded as emergency revoke, handover, or break-glass flow. |
| **Policy reconfiguration risk** | A compromised admin can silently raise limits or loosen policy unless sensitive changes are timelocked, staged, or guardian-vetoed. |
| **Multi-agent coordination risk** | Agent swarms and shared budgets can overspend or duplicate exposure unless shared pools, budget envelopes, and exposure groups are tracked together. |

AURA takes a different path: keep the signing authority behind dWallets, keep
the treasury policy on-chain, and make every agent action pass through an
auditable policy state machine before execution.

---

## Core Capabilities

### Agent Treasury Control

AURA treasuries track the authority model for an autonomous operation:

- owner and AI authority
- dWallet registrations per chain
- pending proposal queue
- session keys and operator roles
- guardians and multisig overrides
- paused, decommissioning, recovery, and migration states

The treasury is a controlled execution environment, not a bare wallet.

### Programmable Policy Before Signature

Agent actions are proposals. Policy can approve, deny, queue, require approval,
or route to sidecar controls before a dWallet signature is requested.

Current policy surface includes:

- per-transaction, daily, hourly, velocity, and recipient limits
- time windows and active schedule constraints
- recipient, asset, protocol, and instruction allowlists
- budget envelopes and exposure groups
- approval ladders and policy receipts
- scoped pauses and circuit breakers
- scheduled intents and conditional triggers
- external liveness checks
- swarm shared-pool limits
- canary policy versions and policy history

### Confidential Guardrails

AURA can evaluate sensitive limits through Ika Encrypt/FHE flows so the treasury
does not need to publish every risk parameter on-chain.

Public rules handle visible constraints. Confidential rules can keep spend caps
and counters encrypted while revealing only the decision result needed to move
the proposal forward.

### dWallet-Backed Execution

Approved proposals execute through Ika dWallets. The agent does not hold the raw
signing key.

This gives AURA a path to multi-chain execution while keeping the policy and
governance layer anchored on Solana.

### Governance, Recovery, and Operations

AURA includes the controls needed to run agent treasuries over time:

- emergency revoke and guardian paths
- ownership handover and break-glass recovery
- sensitive-configuration timelocks
- activity logs, health scores, analytics, and snapshots
- policy attestations, receipts, simulations, and invariant reports
- protocol fees, fee schedules, and fee vault accounting

---

## How The Pieces Fit

```text
programs/
  aura-core/       Anchor program: treasury state machine, policy gates, CPIs
  aura-policy/     Pure Rust policy engine shared by on-chain and off-chain code

packages/
  sdk-ts/          TypeScript SDK and dWallet execution helpers
  sdk-rs/          Rust SDK for account decoding, PDAs, and RPC clients
  cli/             Terminal interface for treasury operations
  backend/         HTTP service for agent/runtime integration
  web/             Next.js dashboard
  docs/            Documentation site

packages/tests/
  sdk-ts/          SDK unit, devnet, and opt-in live-scenario tests

smoke/
  aura-devnet/     Rust live-devnet smoke binaries for Ika/dWallet/program flows
```

`aura-policy` has no Anchor dependency. It is designed to be reused by the
program, SDKs, simulations, and off-chain previews without duplicating policy
logic.

---

## Proposal Lifecycle

### Public Policy Flow

```text
propose_transaction
  -> policy engine evaluates public rules
  -> decision is recorded on the treasury
  -> execute_pending requests dWallet approval
  -> finalize_execution verifies the signature and advances state
```

### Confidential Policy Flow

```text
propose_confidential_transaction
  -> public pre-checks run first
  -> encrypted guardrail graph is submitted through Encrypt CPI
  -> policy result is decrypted
  -> decision is confirmed on-chain
  -> approved proposals continue into dWallet execution
```

### Chain-Bound Settlement Flow

Some proposals produce a dWallet signature for another execution domain. AURA can
hold those proposals in a signed state, then mark broadcast, resubmit, or confirm
settlement once the target-chain lifecycle is known.

---

## Repository Status

This repo is currently a devnet-oriented protocol workspace:

- Anchor program deployed on Solana devnet
- TypeScript SDK with generated instruction/account helpers
- Rust SDK and Rust smoke clients
- Ika Encrypt and Ika dWallet integrations
- opt-in live scenarios that can move devnet test tokens

The codebase is intentionally broad because AURA is an operating surface for
autonomous treasuries, not a single policy primitive.

---

## Quick Start

### Prerequisites

- Rust + Cargo
- Anchor CLI `1.0.0`
- Solana CLI `3.1.13`
- Node `>=20` for SDK/backend/docs/web
- Node `>=22` for the CLI package
- Bun for the SDK test workspace
- A funded devnet wallet at `~/.config/solana/id.json`

### Programs

```bash
anchor build
cargo test --workspace
```

### TypeScript SDK

```bash
cd packages/sdk-ts
npm install
npm run build
```

### SDK Test Workspace

```bash
cd packages/tests/sdk-ts
bun install
bun run test
bun run test:devnet:coverage
```

Devnet and live-scenario tests are intentionally focused per file/script to
avoid public RPC rate limits. Live scenarios are opt-in and should be run only
when you intend to spend devnet test funds:

```bash
export AURA_LIVE_SCENARIOS_TEST=1
bun run live-scenarios:discover
bun run live-scenarios:policy-transfer
```

### Backend

```bash
cd packages/backend
npm install
npm run dev
```

### CLI

```bash
cd packages/cli
npm install
npm run build
npm link

aura config init
```

### Web

```bash
cd packages/web
npm install
npm run dev
```

### Docs

```bash
cd packages/docs
npm install
npm run dev
```

---

## Live Devnet Smoke Tests

The Rust smoke workspace drives real devnet transactions against the deployed
AURA program and the Ika devnet services.

Use a private RPC endpoint when possible:

```bash
export AURA_DEVNET_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
cd smoke/aura-devnet
```

Focused binaries are grouped by what they exercise:

```bash
# Self-contained devnet/RPC checks
cargo run --bin admin
cargo run --bin wallet
cargo run --bin hardening
cargo run --bin oracle_multichain_core
cargo run --bin recovery_core
cargo run --bin trust_identity_core
cargo run --bin monetization_core
cargo run --bin address_list_enforcement
cargo run --bin session_key_quota
cargo run --bin operator_role_scoped_pause
cargo run --bin approval_ladder_receipts
cargo run --bin budget_exposure_enforcement
cargo run --bin health_snapshot_liveness
cargo run --bin governance_timelocks
cargo run --bin chain_profile_negative
cargo run --bin dwallet_negative_controls
cargo run --bin policy_templates_lifecycle
cargo run --bin public_batch
cargo run --bin protocol_config_commit

# Live Ika dWallet / Encrypt flows
cargo run --bin dwallet
cargo run --bin confidential
cargo run --bin confidential_lifecycle
cargo run --bin confidential_batch
cargo run --bin policy
cargo run --bin oracle_multichain
cargo run --bin recovery
cargo run --bin trust_identity
cargo run --bin versioning_monetization
cargo run --bin monetization
cargo run --bin settlement_lifecycle
cargo run --bin recovery_breakglass_authority
cargo run --bin ownership_handover_live
cargo run --bin fee_accrual_live
```

Live-token smokes are opt-in; transfer/funding/payroll variants use existing
funded devnet token balances:

```bash
export AURA_LIVE_TOKEN_SMOKE=1
cargo run --bin live_wallet_discovery
cargo run --bin live_direct_transfer
cargo run --bin live_dwallet_funding
cargo run --bin live_policy_transfer
cargo run --bin live_payroll
cargo run --bin live_agent_swap
cargo run --bin live_velocity_after_settlement
cargo run --bin live_scheduled_transfer
cargo run --bin live_conditional_transfer
```

For a compile-only gate:

```bash
cargo check --bins
```

---

## Deployed Programs

```text
aura-core (devnet)
  Program ID:  auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce
  IDL:         Eior2CvitsWmDH9vJ6VPCxTW169UaM2sw9dupCLNdoQT

Ika Encrypt (pre-alpha devnet)
  Program ID:  4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8
  gRPC:        pre-alpha-dev-1.encrypt.ika-network.net:443

Ika dWallet (pre-alpha devnet)
  Program ID:  87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY
  gRPC:        pre-alpha-dev-1.ika.ika-network.net:443
```

---

## Toolchain

| Tool         | Version                                         |
| ------------ | ----------------------------------------------- |
| Anchor       | `1.0.0`                                         |
| Solana CLI   | `3.1.13`                                        |
| Rust edition | `2021`, resolver `2`                            |
| TypeScript   | `6.0.3`                                         |
| Node         | `>=20` for SDK/backend/docs/web, `>=22` for CLI |

All Rust crates enforce `#![forbid(unsafe_code)]`. Release builds use
`overflow-checks = true`.

---

## License

MIT
