![AURA banner](packages/web/public/banner.png)

# AURA — Autonomous Universal Resource Agent

**Encrypted guardrails for autonomous AI agent treasuries on Solana.**

**Dashboard:** https://auraa-protocol.vercel.app  
**Docs:** https://docs-auraprotocol.vercel.app  
**Program (devnet):** `auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce`

> [!WARNING]
> AURA is under active development. Program instructions, account layouts, policy semantics, SDK APIs, and deployment behavior may still change. Do not use this code to secure production funds until a stable release and audit are published.

---

## What it does

AURA lets AI agents manage real crypto treasuries without exposing spending strategy on-chain and without trusting a centralized approval server.

- **Confidential guardrails** — daily limits, per-transaction limits, and running spend counters are stored as FHE ciphertexts. Policy evaluation runs directly over the encrypted values via the Ika Encrypt network, producing only an encrypted violation code that is then decrypted.
- **dWallet-backed execution** — approved proposals are co-signed through Ika dWallet records, enabling multi-chain execution (Ethereum, Bitcoin, Solana, Polygon, Arbitrum, Optimism) without handing the agent a raw private key.
- **Policy engine** — `aura-policy` evaluates public rules locally (time windows, velocity, slippage, allowlists, exposure groups, approval ladders, scoped pauses, reputation scaling, swarm shared pools) and defers encrypted spend checks to Encrypt for confidential proposals.
- **Governance and safety** — emergency multisig, guardian overrides, AI authority rotation, session keys, dangerous-config timelocks, scoped pauses, invariant reports, and audit/activity logs.
- **Operational surface** — health scoring, snapshots, external liveness records, policy receipts/history/attestations, and agent swarms with shared spending pools.

---

## Why FHE?

Fully Homomorphic Encryption lets you compute over data without decrypting it. AURA uses this to evaluate questions like _"is this $400 transfer within the agent's daily limit?"_ without ever revealing what the daily limit is.

The Ika Encrypt network maintains the FHE keys. When the agent proposes a transaction, a compiled FHE circuit runs on-chain over ciphertexts — the daily limit, the per-transaction limit, and the running spent-today counter — and outputs an encrypted violation code. The network decrypts only that result (0 = approved, 1 = per-tx limit hit, 2 = daily limit hit). The actual limit values are never exposed.

This means a competing agent scanning the chain learns nothing useful, a compromised validator cannot extract your strategy, and the agent itself cannot circumvent the limits because the evaluation is cryptographically enforced.

---

## The Problem

AI agents can already reason about trades, treasury movement, and operational tasks — but most wallet systems still treat them like ordinary hot-wallet users. That creates a set of hard problems that get worse as agents become more capable:

| Problem                             | Why it matters                                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direct key access**               | A prompt injection, model bug, or compromised runtime can drain the treasury in a single transaction. The agent and the attacker are indistinguishable once the key is exposed.                                                                      |
| **Public spending policy**          | On-chain limits are readable by anyone. Competitors, MEV searchers, and attackers can inspect your caps, infer strategy, time their moves around known thresholds, and route around controls entirely.                                               |
| **Centralized approval middleware** | Routing every agent action through an off-chain approval server reintroduces a single point of failure, kills true autonomy, and shifts trust to whoever operates the server.                                                                        |
| **No programmable policy**          | Most treasury setups offer binary access — the agent can either sign or it can't. There is no native way to express per-chain limits, time windows, velocity caps, counterparty risk, or escalation ladders without building custom off-chain logic. |
| **Multi-chain key sprawl**          | Supporting Ethereum, Bitcoin, Solana, and other chains typically means managing separate keys per chain, multiplying the attack surface and operational complexity.                                                                                  |
| **No audit trail**                  | When an autonomous agent acts, there is often no cryptographically verifiable record of what policy was active, what was checked, and why a transaction was approved or denied.                                                                      |
| **Guardrail reconfiguration risk**  | Changing spending limits or policy parameters on a live treasury is a high-risk operation with no native timelock or guardian review — a single compromised admin can silently raise limits.                                                         |

---

## Architecture

```
programs/
  ├─ aura-core/      # Anchor program — treasury state machine, CPIs, instruction handlers
  └─ aura-policy/    # Pure Rust policy engine — rules, FHE graphs, types (no Anchor dep)
packages/
  ├─ backend/        # Node HTTP service — confidential bridge, agent runtime, SIWS auth  →  [README](packages/backend/README.md)
  ├─ sdk-rs/         # Rust SDK — account decoding, PDAs, instruction builders, sync RPC client  →  [README](packages/sdk-rs/README.md)
  ├─ sdk-ts/         # TypeScript SDK — @aura-protocol/sdk-ts  →  [README](packages/sdk-ts/README.md)
  ├─ cli/            # Terminal CLI — @aura-protocol/cli  →  [README](packages/cli/README.md)
  ├─ web/            # Next.js dashboard — App Router, Tailwind v4, wallet adapters
  └─ docs/           # Next.js + Fumadocs documentation site
smoke/               # Live devnet smoke binaries (dwallet, confidential, policy)
```

`aura-policy` has no Anchor dependency — it is consumed both by `aura-core` on-chain and by off-chain tooling for simulation and preview. SDKs wrap the deployed program IDL rather than redefining instructions by hand.

---

## Documentation

Full reference documentation lives at **https://docs-auraprotocol.vercel.app** and covers:

- [Overview & Architecture](https://docs-auraprotocol.vercel.app/docs/overview/architecture)
- [Confidential Guardrails](https://docs-auraprotocol.vercel.app/docs/overview/confidential-guardrails)
- [dWallet Execution](https://docs-auraprotocol.vercel.app/docs/overview/dwallet-execution)
- [Policy Engine](https://docs-auraprotocol.vercel.app/docs/overview/policy-engine)
- [TypeScript SDK](https://docs-auraprotocol.vercel.app/docs/sdk-ts)
- [Rust SDK](https://docs-auraprotocol.vercel.app/docs/sdk-rs)
- [CLI Reference](https://docs-auraprotocol.vercel.app/docs/cli)

---

## Quick Start

### Prerequisites

- Rust + Cargo (`rustup`)
- Anchor CLI `1.0.0` and Solana CLI `3.1.13`
- Node `>=20` (backend, SDK) / `>=22` (CLI)
- A funded devnet wallet at `~/.config/solana/id.json`

### Programs

```bash
# Build and test the on-chain programs
anchor build
cargo test --workspace
```

### Backend

```bash
cd packages/backend
npm install
npm run dev          # tsx watch — auto-syncs gRPC vendor on start
```

### TypeScript SDK

```bash
cd packages/sdk-ts
npm install
npm run build
npm test             # 120 unit tests, no network required
```

### CLI

```bash
cd packages/cli
npm install
npm run build
npm link             # makes `aura` available globally

aura config init
aura treasury create --agent-id my-agent --daily-limit 10000 --per-tx-limit 1000
aura dashboard --agent-id my-agent
```

### Web

```bash
cd packages/web
npm install
npm run dev          # http://localhost:3000
```

### Docs

```bash
cd packages/docs
npm install
npm run dev          # http://localhost:3001
```

---

## Proposal Lifecycle

### Public mode

```
propose_transaction
  → policy engine runs synchronously
  → decision recorded on-chain
  → execute_pending  (approve_message CPI → dWallet)
  → finalize_execution  (verify signature → advance state)
```

### Confidential scalar mode

```
propose_confidential_transaction
  → public pre-check (time window, slippage, velocity, …)
  → FHE graph submitted to Encrypt via CPI
  → request_policy_decryption  (Encrypt network decrypts violation code)
  → confirm_policy_decryption  (verify result, apply decision)
  → execute_pending → finalize_execution
```

### Confidential vector mode

Same as scalar, but the guardrail ciphertext is a single `EUint64Vector`. After each approved transaction the output ciphertext is promoted to become the new guardrail vector, rotating the encrypted state forward automatically.

---

## Smoke Tests (Live Devnet)

The `smoke/aura-devnet/` directory contains three live devnet binaries. They require a funded devnet wallet and network access to the Ika gRPC endpoints.

```bash
# Optional: set a custom RPC to avoid rate limits
export AURA_DEVNET_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"

cd smoke/aura-devnet

# dWallet integration — create_treasury → register_dwallet → propose → execute → finalize
cargo run --bin dwallet

# Confidential FHE flow — configure_guardrails → propose → request_decryption → confirm
cargo run --bin confidential

# Policy matrix — 12 live scenarios across limits, lifecycle, governance, swarms, and reputation
cargo run --bin policy
```

---

## Deployed Programs

```
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

| Tool                 | Version              |
| -------------------- | -------------------- |
| Anchor               | `1.0.0`              |
| Solana CLI           | `3.1.13`             |
| Rust edition         | `2021`, resolver `2` |
| TypeScript           | `6.0.3`              |
| Node (backend / SDK) | `>=20`               |
| Node (CLI)           | `>=22`               |

All Rust crates enforce `#![forbid(unsafe_code)]`. Release builds use `overflow-checks = true`.

---

## License

MIT
