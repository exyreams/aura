![AURA banner](packages/web/public/banner.png)

# AURA — Autonomous Universal Resource Agent

**Encrypted guardrails for autonomous AI agent treasuries on Solana.**

- **Dashboard:** https://auraa-protocol.vercel.app
- **Docs:** https://docs-auraprotocol.vercel.app
- **Backend API:** https://aura-backend-production-eb86.up.railway.app

AURA lets AI agents manage real crypto treasuries without exposing your strategy on-chain and without trusting a centralized approval server. Spending limits are stored as FHE ciphertexts — unreadable to anyone — and policy evaluation happens directly over those encrypted values via Ika's Encrypt network. When a transaction is approved, it is co-signed by an Ika dWallet, giving you native multi-chain execution on Ethereum, Bitcoin, Solana, Polygon, Arbitrum, and Optimism.

> [!WARNING]
> AURA is under active development. Program instructions, account layouts, policy semantics, SDK APIs, and deployment behavior may still change quickly. Do not use this code to secure production funds or serious treasury operations until a stable release and audit are published.

## Advanced Feature Surface

AURA combines confidential treasury policy, dWallet execution, and operational safety controls so autonomous agents can act without receiving unrestricted key custody.

- **Confidential spend guardrails:** daily limits, per-transaction limits, and running spend counters can be stored as scalar or vector FHE ciphertexts. The program can evaluate encrypted spend limits without exposing the limit values on-chain.
- **dWallet-backed execution:** approved proposals move through message approval, signature verification, and finalization against Ika dWallet records, enabling multi-chain execution without handing the agent a raw private key.
- **Policy receipts and history:** decisions can be recorded as explainable receipts, policy history snapshots, activity entries, and attestations so operators can audit what was checked, why it passed or failed, and which policy version was active.
- **Governance and emergency controls:** treasury owners can configure emergency multisig, guardian overrides, scoped pauses, AI authority rotation, dangerous-config timelocks, session keys, and emergency shutdown recovery paths.
- **Budget and risk segmentation:** budget envelopes, exposure groups, swarm shared pools, child spend budgets, protocol allowlists, address lists, slippage caps, quote freshness, counterparty risk, velocity limits, and time-window limits let teams scope agent behavior by use case.
- **Operational health and liveness:** health scoring, external liveness records, invariant reports, snapshots, policy service metadata, deployment metadata, and migration hooks provide the operational layer needed to monitor and upgrade a live treasury system.
- **Heap-aware live execution:** confidential proposal, decryption, dWallet execution, and finalization paths persist only the necessary state around external CPIs, reducing SBF heap pressure for large treasury accounts.

---

## The Problem

AI agents can already reason about trades, treasury movement, and operational tasks, but most wallet systems still treat them like ordinary hot-wallet users. That creates three hard problems:

| Problem                         | Why it matters                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Direct key access               | A prompt injection, model bug, or compromised runtime can drain the treasury.                                  |
| Public spending policy          | Competitors, MEV searchers, and attackers can inspect limits, infer strategy, and route around known controls. |
| Centralized approval middleware | The agent is no longer autonomous, and the middleware becomes a single point of failure.                       |

AURA's core idea is to let the agent submit useful actions while the treasury enforces cryptographic and policy boundaries around those actions. Limits can stay encrypted, policy decisions can be audited, and execution can be co-signed by dWallet infrastructure instead of exposing raw treasury keys to the agent.

---

## Why FHE?

Fully Homomorphic Encryption (FHE) lets you compute over data without decrypting it. AURA uses this to evaluate questions like _"is this $400 transfer within the agent's daily limit?"_ without ever revealing what the daily limit is.

The Ika Encrypt network maintains the FHE keys. When the AI proposes a transaction, a compiled FHE circuit (a "policy graph") runs on-chain over ciphertexts — the daily limit, the per-transaction limit, and the running spent-today counter — and outputs an encrypted violation code. The network then decrypts only that result (0 = approved, 1 = per-tx limit hit, 2 = daily limit hit). Your actual limit values are never exposed.

This means:

- A competing agent scanning the chain learns nothing useful.
- A compromised validator cannot extract your strategy.
- The AI agent itself cannot circumvent the limits, because the evaluation is cryptographically enforced.

---

## Architecture

```
programs/
  ├─ aura-core/      # Deployed Anchor program — treasury state machine
  └─ aura-policy/    # Pure Rust policy engine — rules, FHE graphs, types
packages/
  ├─ backend/        # HTTP service for confidential execution, Encrypt/dWallet ops, and agent runtime
  ├─ docs/           # Next.js documentation site for the full AURA stack
  ├─ sdk-rs/         # Rust SDK for account decoding, PDAs, instructions, and RPC flows
  ├─ sdk-ts/         # TypeScript SDK with typed client helpers and published ESM artifacts
  ├─ cli/            # Terminal CLI for treasury operations, governance, and config management
  └─ web/            # Next.js dashboard for treasury operations, settings, and agent control
```

`aura-policy` has no Anchor dependency. It is used both by `aura-core` instruction handlers on-chain and by off-chain tooling for simulation and previewing. The SDKs wrap the deployed program surface without redefining it by hand, so client integrations stay aligned with the on-chain source of truth.

For the server-side flows that should not live in the browser, AURA now also
ships `packages/backend`, a standalone service used by the web app for the
confidential Encrypt bridge, decryption/execution lifecycle, and autonomous
agent runtime.

## Quick Start

### Programs

```bash
cargo test --workspace
```

### Backend

```bash
cd packages/backend
npm install
npm run dev
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

Default backend URL for the web app:

```bash
# Local development
http://127.0.0.1:8787

# Production
https://aura-backend-production-eb86.up.railway.app
```

## Validation Matrix

Backend:

```bash
cd packages/backend
npm run typecheck
npm run build
```

Web:

```bash
cd packages/web
npm run build
```

Docs:

```bash
cd packages/docs
npm run build
```

---

## SDKs

### `sdk-rs` (Rust)

Located at [`packages/sdk-rs/`](packages/sdk-rs/), this crate reuses the real `aura-core` Anchor-generated accounts and instruction args, then adds:

- treasury account decoding into both raw and rich domain forms
- PDA derivation helpers for treasury and CPI authorities
- domain-organized instruction builders for all 69 program instructions across 14 modules (treasury, confidential, execution, governance, dwallet, policy, budget, operational, lifecycle, batch, swarm, fees, address lists)
- a synchronous RPC client with early signer/account validation
- input validation utilities (`validate_agent_id`, `validate_amount_usd`, etc.)

Verified with `cargo test -p aura-sdk` — 32 unit tests + 1 doc test passing.

### `sdk-ts` (TypeScript)

Located at [`packages/sdk-ts/`](packages/sdk-ts/), this package ships compiled ESM JavaScript in `dist/` plus `.d.ts` declarations for consumers. That is the standard production layout for a TypeScript SDK: Node and bundlers execute the emitted `.js`, while TypeScript users still get a fully typed experience.

The package includes:

- `Aura` — high-level facade with plain-number inputs, automatic timestamps, and chainable namespaces (`aura.treasury.*`, `aura.dwallet.*`, `aura.governance.*`)
- `AuraClient` — low-level client wrapping the core treasury, confidential execution, dWallet, and governance flows with full parameter control
- strict Anchor account resolution via the generated IDL
- PDA helpers, error codes, event types, and validation helpers
- the raw IDL exported at `@aura/sdk-ts/idl`
- 120 unit tests (no network) and 14 devnet integration tests
- `npm run generate-idl` / `generate-idl:win` to sync the IDL from `anchor build` output
- `docs/` — API reference and runnable examples for both API levels

### `cli` (Terminal Interface)

Located at [`packages/cli/`](packages/cli/), this package provides:

- config-driven wallet / RPC resolution via `~/.aura/config.json`
- human-readable treasury, dWallet, and governance commands
- **auto-encryption** of guardrail and transaction amounts via `@encrypt.xyz/pre-alpha-solana-client`
- **automatic dWallet presign + sign** via `@ika.xyz/pre-alpha-solana-client`
- confidential guardrail, decryption, and execution lifecycle commands
- a full-screen `ink` dashboard and watch-oriented execution views
- interactive prompts when required flags are omitted
- `--json` and `--dry-run` modes for scripting and review

Example commands:

```bash
aura config init
aura treasury create --agent-id my-agent --daily-limit 10000 --per-tx-limit 1000
aura treasury show --agent-id my-agent

# Register dWallet with live signing metadata
aura dwallet register --agent-id my-agent --chain ethereum \
  --dwallet-id <id> --address <addr> --balance 5000 \
  --dwallet-account <pda> --authorized-user <pubkey> \
  --message-metadata-digest <hex> --public-key-hex <hex>

# Confidential flow — amounts auto-encrypted via Ika Encrypt gRPC
aura confidential deposit ensure
aura confidential guardrails scalar --agent-id my-agent --daily-limit 10000 --per-tx-limit 1000
aura confidential propose --agent-id my-agent --amount 250 --chain ethereum --recipient 0x... --wait
aura confidential request-decryption --agent-id my-agent --wait
aura confidential confirm-decryption --agent-id my-agent

# Execution — dWallet presign + sign driven automatically via Ika dWallet gRPC
aura execution execute --agent-id my-agent --wait-signed
aura execution finalize --agent-id my-agent

aura governance multisig --agent-id my-agent --required 2 --guardians pk1,pk2,pk3
aura dashboard --agent-id my-agent
```

---

## Available Feature Set

### `aura-core` (Anchor Program)

The on-chain coordinator owns treasury PDAs, policy-control records, dWallet metadata, pending execution state, and audit/event surfaces. The current IDL exposes the live program interface used by the SDKs, CLI, smoke tests, and dashboard integrations.

Available program capabilities:

- **Treasury lifecycle:** create treasury, register dWallets, pause/resume execution, cancel pending proposals, treasury admin changes, migrations, fee vault setup, and protocol-fee accounting.
- **Confidential execution:** configure scalar/vector FHE guardrails, propose scalar/vector confidential transactions, request/confirm Encrypt decryption, execute approved pending transactions, and finalize signed dWallet approvals.
- **Governance and safety controls:** configure emergency multisig, propose/collect guardian overrides, emergency shutdown, AI authority rotation, dangerous-config timelocks, session keys, and scoped operator roles.
- **Policy-control accounts:** policy receipts, policy history, policy attestations, budget envelopes, exposure groups, external liveness records, role records, batch records, and invariant reports.
- **Operational observability:** activity log, snapshots, health score, address lists, hashed recipients, Merkle inclusion verification, swarm pool records, and policy service metadata.

---

### `aura-policy` (Library Crate)

The pure Rust policy engine is used by the program, SDKs, smoke harness, and off-chain previews. It evaluates public policy rules locally and defers encrypted spend checks to Encrypt for confidential proposals.

Policy controls now cover:

1. Per-transaction limits.
2. Daily limits with reputation-adjusted effective caps.
3. Bitcoin/manual-review thresholds.
4. Time-window and hourly limits.
5. Protocol allowlists.
6. Slippage limits.
7. Quote freshness.
8. Counterparty risk.
9. Shared swarm pool limits.
10. Velocity limits.
11. Budget envelopes with daily and weekly scopes.
12. Approval ladders for escalation, timelock, guardian, and multisig levels.
13. Scoped pause for execution modes, chains, categories, recipients, and protocols.
14. External liveness checks for dependency freshness.
15. Exposure-group accounting and limits.

Policy tooling includes reusable presets, deterministic policy hashes, diff classification, explainable receipts, batch simulation, batch evaluation, and expanded violation codes for the new controls.

Evaluation modes:

- `evaluate_transaction` — full public evaluation with all policy rules.
- `evaluate_public_precheck` — public-only checks for confidential proposals before Encrypt handles encrypted spend limits.
- `evaluate_batch` — sequential evaluation that threads mutable state forward.
- `simulate_batch` / preview helpers — off-chain review of proposed batches before execution.

FHE graphs:

- **Scalar graph** (`confidential_spend_guardrails_scalar`) — takes separate encrypted daily limit, per-tx limit, spent-today, and amount inputs, then outputs a violation code plus next spent-today value.
- **Vector graph** (`confidential_spend_guardrails_vector`) — takes a single encrypted vector encoding `[daily_limit, per-tx limit, spent_today]`, then returns an updated vector with the violation code embedded.
- **Advanced/batch graph specs** — describe multi-rule confidential evaluation surfaces for future graph upgrades while keeping public policy simulation aligned with the on-chain model.

---

## Proposal Lifecycle

### Public Mode (non-confidential)

```
propose_transaction
  → policy engine runs synchronously
  → decision recorded on-chain
  → execute_pending (approve_message CPI → dWallet)
  → finalize_execution (verify signature → advance state)
```

### Confidential Scalar Mode

```
propose_confidential_transaction
  → public pre-check runs (time window, slippage, velocity, etc.)
  → FHE graph submitted to Encrypt via CPI
  → request_policy_decryption (Encrypt network decrypts violation code)
  → confirm_policy_decryption (verify result, apply decision)
  → execute_pending → finalize_execution
```

### Confidential Vector Mode

Same as scalar, but the guardrail ciphertext is a single `EUint64Vector`. After each approved transaction the output ciphertext is promoted to become the new guardrail vector, rotating the encrypted state forward automatically.

---

## Reputation Scaling

Each agent accrues a reputation score (0–100) based on transaction history. The policy engine applies a multiplier to the daily limit:

| Score  | Multiplier           |
| ------ | -------------------- |
| 80–100 | 150% of base         |
| 50–79  | 100% (no adjustment) |
| < 50   | 70% of base          |

Thresholds and multipliers are configurable per treasury via `PolicyConfig::reputation_policy`.

---

## Emergency Override

Treasuries can attach an `EmergencyMultisig` with a quorum of guardians. Any guardian can propose a daily limit increase; once enough guardians co-sign (within a 1-hour expiry window), the new limit is applied immediately on-chain. This is the break-glass path for adjusting encrypted guardrails without waiting for a new FHE ciphertext to be provisioned.

---

## Agent Swarms

Multiple agents can share a collective spending pool. Attach a `configure_swarm` with a `shared_pool_limit_usd` and member agent IDs. Each member's `finalize_execution` increments the shared counter. The `shared_pool_limit` policy rule blocks any member whose transaction would push the collective total over the cap.

---

## Deployed Programs

```
aura-core (devnet)
  Program ID:    EaRoLVwL8EErDUeEMPHJ5QJeLVQZWJMtZcgmFzT9bhHs
  IDL Metadata:  FEwkjMC7J1t55i9ASU37jSeD7midnMpkNCQSxPQKNnXb

Ika Encrypt (pre-alpha devnet)
  Program ID:    4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8
  gRPC:          pre-alpha-dev-1.encrypt.ika-network.net:443

Ika dWallet (pre-alpha devnet)
  Program ID:    87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY
  gRPC:          pre-alpha-dev-1.ika.ika-network.net:443
```

---

## Quick Start

### Running Tests

```bash
# Run all Rust workspace tests (programs + Rust SDK)
cargo test --workspace

# Run tests for specific crate
cargo test -p aura-core
cargo test -p aura-policy
cargo test -p aura-sdk

# TypeScript SDK — unit tests (no network required)
cd packages/sdk-ts
npm test

# TypeScript SDK — devnet integration tests (requires funded wallet)
npm run test:devnet

# CLI package
cd ../cli
npm run build
npm test
```

### Building and Deploying

```bash
# Build the program
anchor build

# Deploy to devnet (use your own RPC to avoid rate limits)
anchor deploy --provider.cluster "https://devnet.helius-rpc.com/?api-key=<YOUR_KEY>"
```

### Smoke Tests (Live Devnet Integration)

The `smoke/aura-devnet/` directory contains live devnet smoke binaries for dWallet execution, confidential Encrypt flows, and policy behavior. The policy smoke currently exercises a 12-scenario matrix against the deployed devnet program.

**Prerequisites:**

- Solana CLI configured with a funded devnet wallet (`~/.config/solana/id.json`)
  - Get devnet SOL: `solana airdrop 2 --url devnet`
- Network access to:
  - Solana devnet RPC (default: `https://api.devnet.solana.com`)
  - Ika Encrypt gRPC: `pre-alpha-dev-1.encrypt.ika-network.net:443`
  - Ika dWallet gRPC: `pre-alpha-dev-1.ika.ika-network.net:443`

**Optional: Use a custom RPC endpoint**

To avoid rate limits on the public devnet RPC, set one of these environment variables:

```bash
# Option 1: AURA-specific RPC (takes precedence)
export AURA_DEVNET_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"

# Option 2: General Solana RPC (fallback)
export SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
```

**Updating vendor dependencies:**

The `smoke/vendor/` directory contains local copies of gRPC proto files from upstream Ika repos. To sync with the latest upstream versions:

```bash
# Linux/macOS
cd smoke
./sync-vendor.sh

# Windows (PowerShell)
cd smoke
./sync-vendor.ps1

# Review changes
git diff vendor/

# Rebuild to regenerate Rust code
cd aura-devnet
cargo build
```

**Running the tests:**

```bash
cd smoke/aura-devnet

# 1. dWallet Integration Test
# Tests: create_treasury → register_dwallet → propose_transaction → execute_pending → finalize_execution
# Verifies: dWallet CPI, message approval, signature verification
cargo run --bin dwallet

# 2. Confidential Policy Test (FHE)
# Tests: configure_confidential_guardrails → propose_confidential_transaction → request_policy_decryption → confirm_policy_decryption
# Verifies: Encrypt network CPI, FHE graph execution, decryption flow
cargo run --bin confidential

# 3. Policy Engine Test
# Tests: 12 live policy scenarios across limits, lifecycle, governance, swarms, dWallet registration, and reconfiguration
# Verifies: Public policy evaluation, reputation scaling, time windows, velocity limits, and advanced policy-control account plumbing
cargo run --bin policy
```

The live policy scenario matrix covers per-transaction deny/approve, daily-limit deny/approve, cancel pending, pause/resume, multisig override, swarm shared-pool enforcement, single-guardian override, multi-chain dWallet registration, reputation scaling, and guardrail reconfiguration mid-lifecycle.

---

## Toolchain

| Tool                    | Version  |
| ----------------------- | -------- |
| Anchor                  | `1.0.0`  |
| Solana CLI              | `3.1.13` |
| Rust workspace resolver | `2`      |

All Rust crates enforce `#![forbid(unsafe_code)]`.

---

## Repository Structure

```
programs/
  ├─ aura-core/
  │   ├─ src/
  │   │   ├─ audit/          # Append-only audit trail and event types
  │   │   ├─ constants/      # Field length limits and collection caps
  │   │   ├─ errors/         # TreasuryError and AuraCoreError
  │   │   ├─ execution/      # Proposal lifecycle state machine
  │   │   ├─ ext_cpi/        # dWallet and Encrypt CPI adapters
  │   │   ├─ governance/     # Emergency multisig override
  │   │   ├─ instructions/   # Domain-named Anchor instruction handlers
  │   │   ├─ program_accounts/ # Split on-chain account serialization records
  │   │   ├─ program_events/ # On-chain event emission
  │   │   ├─ state/          # Treasury, pending, receipt, reputation, safety, and swarm domain models
  │   │   └─ tests/          # Proposal, confidential, governance, advanced, and policy-control flows
  │   └─ Cargo.toml
  │
  └─ aura-policy/
      ├─ src/
      │   ├─ config/         # PolicyConfig and ReputationPolicy
      │   ├─ context/        # TransactionContext and PolicyEvaluationContext
      │   ├─ decision/       # PolicyDecision and RuleOutcome
      │   ├─ engine/         # evaluate_transaction, evaluate_public_precheck, evaluate_batch
      │   ├─ graphs/         # FHE graph specs and compiled circuit bytes
      │   ├─ helpers/        # Bitmap, math, state normalization, time window utilities
      │   ├─ state/          # PolicyState (mutable spending counters)
      │   ├─ types/          # Chain and TransactionType enums
      │   ├─ violations/     # ViolationCode enum
      │   └─ tests/          # Engine, time/velocity, confidential, advanced, and policy-control rules
      └─ Cargo.toml
packages/
  ├─ backend/
  │   ├─ src/               # HTTP server, protocol helpers, validation, and agent runtime
  │   ├─ scripts/           # gRPC vendor sync utilities
  │   ├─ Dockerfile         # Container build for the backend service
  │   └─ docker-compose.yml # Local container orchestration for Linux/macOS deployment
  │
  ├─ sdk-rs/
  │   ├─ src/
  │   │   ├─ accounts.rs     # Treasury account decoding helpers
  │   │   ├─ client.rs       # High-level synchronous Rust client
  │   │   ├─ constants.rs    # Seeds, limits, and RPC defaults
  │   │   ├─ errors.rs       # SdkError enum
  │   │   ├─ instructions.rs # Typed builders for aura-core instruction flows
  │   │   ├─ pda.rs          # PDA derivation helpers
  │   │   ├─ types.rs        # Re-exports of on-chain program and policy types
  │   │   └─ utils.rs        # Input validation helpers
  │   └─ Cargo.toml
  │
  ├─ sdk-ts/
  │   ├─ src/
  │   │   ├─ aura.ts        # High-level facade (Aura class — recommended entry point)
  │   │   ├─ client.ts      # Low-level client (AuraClient — full instruction control)
  │   │   ├─ accounts.ts    # Typed account shapes for instruction helpers
  │   │   ├─ constants.ts   # Program IDs, seeds, and generated type aliases
  │   │   ├─ errors.ts      # AuraErrorCode enum and error helpers
  │   │   ├─ events.ts      # On-chain event types and discriminators
  │   │   ├─ validation.ts  # Input validation helpers
  │   │   ├─ pda.ts         # PDA derivation helpers
  │   │   └─ generated/     # Auto-generated from anchor build (gitignored)
  │   ├─ docs/
  │   │   ├─ high-level.md  # Aura facade API reference
  │   │   ├─ low-level.md   # AuraClient API reference
  │   │   └─ examples/      # Runnable examples for every major flow
  │   ├─ tests/             # 120 unit tests + 14 devnet integration tests
  │   └─ dist/              # Published ESM runtime + type declarations
  └─ cli/
  │   ├─ src/
  │   │   ├─ commands/      # Config, treasury, dWallet, confidential, execution, and dashboard commands
  │   │   ├─ config.ts      # ~/.aura/config.json resolution and IO
  │   │   ├─ context.ts     # Wallet, RPC, and SDK client setup
  │   │   ├─ dashboard.tsx  # Full-screen ink dashboard runtime
  │   │   ├─ domain.ts      # Chain / transaction type parsing and labels
  │   │   ├─ ika.ts         # Ika Encrypt + dWallet gRPC client wrappers
  │   │   ├─ output.ts      # Tables, banners, spinners, and JSON serialization
  │   │   ├─ protocol.ts    # Encrypt/dWallet helpers, deposit setup, and live polling
  │   │   └─ treasury-view.ts # Shared treasury and proposal panel rendering
  │   ├─ tests/             # CLI runtime and parsing tests
  │   ├─ bin/               # `aura` entrypoint wrapper
  │   └─ dist/              # Compiled ESM runtime
  ├─ web/
  │   ├─ app/              # Next.js landing page and dashboard routes
  │   ├─ components/       # Shared UI primitives and treasury flows
  │   └─ lib/              # SDK bindings, backend client, and local settings state

Anchor.toml    # anchor 1.0.0, solana 3.1.13
Cargo.toml     # Rust workspace root
```

---

## License

MIT
