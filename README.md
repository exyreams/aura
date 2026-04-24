# AURA — Autonomous Universal Resource Agent

**Encrypted guardrails for autonomous AI agent treasuries on Solana.**

AURA lets AI agents manage real crypto treasuries without exposing your strategy on-chain and without trusting a centralized approval server. Spending limits are stored as FHE ciphertexts — unreadable to anyone — and policy evaluation happens directly over those encrypted values via Ika's Encrypt network. When a transaction is approved, it is co-signed by an Ika dWallet, giving you native multi-chain execution on Ethereum, Bitcoin, Solana, Polygon, Arbitrum, and Optimism.

**Status:** Core program and policy engine deployed on Solana devnet. Live smoke tests passing. TypeScript and Rust SDKs plus the operator CLI with confidential/execution flows and a live dashboard all live under `packages/`.

---

## The Problem

Every AI agent wallet in existence today forces a tradeoff:

| Approach | What breaks |
|---|---|
| Give the AI direct key access | One bug or compromise = total loss, no guardrails |
| Public on-chain spending limits | MEV bots read your limits and front-run every trade |
| Centralized approval server | Single point of failure, not truly autonomous |

AURA eliminates all three. Spending limits live as FHE ciphertexts that nobody can read — not you, not the validator, not a competing agent. Policy evaluation runs over encrypted data. The result is a system where the AI agent genuinely cannot exceed its limits, and nobody can infer what those limits are from the chain.

---

## Why FHE?

Fully Homomorphic Encryption (FHE) lets you compute over data without decrypting it. AURA uses this to evaluate questions like *"is this $400 transfer within the agent's daily limit?"* without ever revealing what the daily limit is.

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
bun run vendor:sync
bun run dev
```

### Web

```bash
cd packages/web
bun run dev
```

Default backend URL for the web app:

```bash
http://127.0.0.1:8787
```

## Validation Matrix

Backend:

```bash
cd packages/backend
bun run vendor:sync
bun run typecheck
bun run build
```

Web:

```bash
cd packages/web
bun run lint
bunx next typegen
bunx tsc --noEmit
bunx next build --webpack
```

---

## SDKs

### `sdk-rs` (Rust)

Located at [`packages/sdk-rs/`](packages/sdk-rs/), this crate reuses the real `aura-core` Anchor-generated accounts and instruction args, then adds:

- treasury account decoding into both raw and rich domain forms
- PDA derivation helpers for treasury and CPI authorities
- typed builders for the full instruction surface
- a synchronous RPC client with early signer/account validation
- input validation utilities (`validate_agent_id`, `validate_amount_usd`, etc.)

Verified with `cargo test -p aura-sdk` — 14 unit tests + 1 doc test passing.

### `sdk-ts` (TypeScript)

Located at [`packages/sdk-ts/`](packages/sdk-ts/), this package ships compiled ESM JavaScript in `dist/` plus `.d.ts` declarations for consumers. That is the standard production layout for a TypeScript SDK: Node and bundlers execute the emitted `.js`, while TypeScript users still get a fully typed experience.

The package includes:

- `Aura` — high-level facade with plain-number inputs, automatic timestamps, and chainable namespaces (`aura.treasury.*`, `aura.dwallet.*`, `aura.governance.*`)
- `AuraClient` — low-level client wrapping all 18 program instructions with full parameter control
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

## What Is Implemented

### `aura-core` (Anchor Program)

The on-chain coordinator. Owns the `TreasuryAccount` PDA and exposes the full instruction set.

**Instructions:**

| Instruction | Description |
|---|---|
| `create_treasury` | Initialize a new agent treasury PDA |
| `register_dwallet` | Register a dWallet for a specific chain |
| `configure_confidential_guardrails` | Set scalar FHE ciphertexts (daily, per-tx, spent-today) |
| `configure_confidential_vector_guardrails` | Set a single vector FHE ciphertext encoding all three |
| `propose_transaction` | Submit a public (non-encrypted) proposal |
| `propose_confidential_transaction` | Submit a scalar FHE proposal |
| `propose_confidential_vector_transaction` | Submit a vector FHE proposal |
| `request_policy_decryption` | Request Encrypt network to decrypt the policy output |
| `confirm_policy_decryption` | Verify the decrypted result and apply the decision |
| `execute_pending` | Submit `approve_message` CPI to dWallet once approved |
| `finalize_execution` | Verify the dWallet signature and close the proposal |
| `cancel_pending` | Owner cancels a pending proposal |
| `pause_execution` | Owner pauses or resumes the treasury |
| `configure_multisig` | Attach an emergency guardian override set |
| `propose_override` | Guardian proposes a daily limit increase |
| `collect_override_signature` | Guardian co-signs the override proposal |
| `configure_swarm` | Attach a shared pool limit for a group of agents |

Verified with `cargo test -p aura-core`.

---

### `aura-policy` (Library Crate)

The policy engine. Evaluates transactions against 11 configurable spending rules.

**Rules evaluated in order:**

1. `per_tx_limit` — amount ≤ per-transaction limit
2. `daily_limit` — projected daily spend ≤ effective daily limit (reputation-adjusted)
3. `bitcoin_manual_review` — Bitcoin amounts below the manual review threshold
4. `time_window_limit` — projected hourly spend ≤ daytime or nighttime hourly limit
5. `protocol_whitelist` — DeFi protocol ID present in encrypted bitmap
6. `slippage_limit` — computed slippage ≤ max basis points
7. `quote_freshness` — price quote age ≤ max allowed age
8. `counterparty_risk` — risk score ≤ configured maximum
9. `shared_pool_limit` — projected swarm spend ≤ collective pool limit
10. `velocity_limit` — rolling 10-transaction window sum ≤ velocity cap

**Evaluation modes:**

- `evaluate_transaction` — full public evaluation, all 10 rules
- `evaluate_public_precheck` — public rules only; defers per-tx and daily limits to Encrypt for confidential proposals
- `evaluate_batch` — sequential evaluation threading state forward, used for off-chain simulation

**FHE Graphs:**

- **Scalar graph** (`confidential_spend_guardrails_scalar_v1`) — takes 4 separate `EUint64` ciphertexts, outputs `(violation_code, next_spent_today)`
- **Vector graph** (`confidential_spend_guardrails_vector_v3`) — takes a single `EUint64Vector` encoding `[daily_limit, per_tx_limit, spent_today]`, outputs an updated vector with `lane[3] = violation_code`

Verified with `cargo test -p aura-policy`.

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

| Score | Multiplier |
|---|---|
| 80–100 | 150% of base |
| 50–79 | 100% (no adjustment) |
| < 50 | 70% of base |

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
  Program ID:    G4XjdmHtwwuTdw7VxWqTuTaL8WkZTKnCEnyaV5V6zgVW
  IDL Metadata:  Gf7k5TBLSE2LXhwMLtWB1Xe4hvLAtTExvQLUPKazSyQM

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

The `smoke/aura-devnet/` directory contains three integration tests that run against live devnet services.

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
# Tests: All 11 policy rules in isolation and batch evaluation
# Verifies: Public policy evaluation, reputation scaling, time windows, velocity limits
cargo run --bin policy
```

---

## Toolchain

| Tool | Version |
|---|---|
| Anchor | `1.0.0` |
| Solana CLI | `3.1.13` |
| Rust workspace resolver | `2` |

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
  │   │   ├─ instructions/   # One file per Anchor instruction handler
  │   │   ├─ program_accounts/ # On-chain account serialization layer
  │   │   ├─ program_events/ # On-chain event emission
  │   │   ├─ state/          # Domain model (AgentTreasury, PendingTransaction, etc.)
  │   │   └─ tests/          # Integration tests (proposal, confidential, governance, advanced)
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
      │   └─ tests/          # Unit tests (engine rules, time/velocity, advanced, confidential)
      └─ Cargo.toml
packages/
  ├─ sdk-rs/
  │   ├─ src/
  │   │   ├─ accounts.rs     # Treasury account decoding helpers
  │   │   ├─ client.rs       # High-level synchronous Rust client
  │   │   ├─ constants.rs    # Seeds, limits, and RPC defaults
  │   │   ├─ errors.rs       # SdkError enum
  │   │   ├─ instructions.rs # Typed builders for every aura-core instruction
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
      ├─ src/
      │   ├─ commands/      # Config, treasury, dWallet, confidential, execution, and dashboard commands
      │   ├─ config.ts      # ~/.aura/config.json resolution and IO
      │   ├─ context.ts     # Wallet, RPC, and SDK client setup
      │   ├─ dashboard.tsx  # Full-screen ink dashboard runtime
      │   ├─ domain.ts      # Chain / transaction type parsing and labels
      │   ├─ ika.ts         # Ika Encrypt + dWallet gRPC client wrappers
      │   ├─ output.ts      # Tables, banners, spinners, and JSON serialization
      │   ├─ protocol.ts    # Encrypt/dWallet helpers, deposit setup, and live polling
      │   └─ treasury-view.ts # Shared treasury and proposal panel rendering
      ├─ tests/             # CLI runtime and parsing tests
      ├─ bin/               # `aura` entrypoint wrapper
      └─ dist/              # Compiled ESM runtime

Anchor.toml    # anchor 1.0.0, solana 3.1.13
Cargo.toml     # Rust workspace root
```

---

## License

MIT
