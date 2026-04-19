# AURA — Autonomous Universal Resource Agent

**Encrypted guardrails for autonomous AI agent treasuries on Solana.**

AURA lets AI agents manage real crypto treasuries without exposing your strategy on-chain and without trusting a centralized approval server. Spending limits are stored as FHE ciphertexts — unreadable to anyone — and policy evaluation happens directly over those encrypted values via Ika's Encrypt network. When a transaction is approved, it is co-signed by an Ika dWallet, giving you native multi-chain execution on Ethereum, Bitcoin, Solana, Polygon, Arbitrum, and Optimism.

**Status:** Program layer complete and tested (75 tests passing). Deployed on Solana devnet.

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
```

`aura-policy` has no Anchor dependency. It is used both by `aura-core` instruction handlers on-chain and by off-chain tooling for simulation and previewing.

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

**46 tests passing.**

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

**29 tests passing.**

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

```bash
# Run all tests
cargo test --workspace

# Build the program
anchor build

# Deploy to devnet (pass your own RPC to avoid rate limits)
anchor program deploy --provider.cluster "https://devnet.helius-rpc.com/?api-key=<YOUR_KEY>"

# Run dWallet smoke test against live devnet
cargo run -p aura-core --example devnet_dwallet_smoke

# Run Encrypt confidential smoke test (blocked upstream — no code changes needed on our side)
cargo run -p aura-core --example devnet_confidential_smoke
```

---

## Toolchain

| Tool | Version |
|---|---|
| Anchor | `1.0.0` |
| Solana CLI | `3.1.13` |
| Rust workspace resolver | `2` |

Both crates enforce `#![forbid(unsafe_code)]`.

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

Anchor.toml    # anchor 1.0.0, solana 3.1.13
Cargo.toml     # Rust workspace root
```

---

## License

MIT