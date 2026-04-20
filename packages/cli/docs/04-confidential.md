# Confidential Commands

The confidential flow uses the Ika Encrypt gRPC network to create and evaluate FHE
ciphertexts. The CLI handles all encryption automatically — you provide plain USD
values and the CLI encrypts them, waits for on-chain verification, and submits the
proposal.

> **Pre-alpha note:** In the current pre-alpha, data is stored as plaintext on-chain.
> No real FHE encryption is active yet. The interface is final; the cryptography is not.

---

## `aura confidential deposit ensure`

Creates the Encrypt deposit account required for all confidential operations.
Run this once per wallet before any other confidential command.

```bash
aura confidential deposit ensure
```

```
  ⠸ Ensuring Encrypt deposit account...
  ✓ Encrypt deposit created: 7QQ8jr6v...
```

If the deposit already exists:

```
  ✓ Encrypt deposit ready: 7QQ8jr6v...
```

---

## `aura confidential guardrails scalar`

Configures the three scalar FHE guardrail ciphertexts on the treasury:
daily limit, per-transaction limit, and the running spent-today counter.

### Auto-encrypt (recommended)

Provide plain USD values — the CLI encrypts them via the Ika Encrypt gRPC:

```bash
aura confidential guardrails scalar \
  --agent-id my-agent \
  --daily-limit 10000 \
  --per-tx-limit 1000 \
  --spent-today 0
```

```
  ⠸ Encrypting guardrail values via Ika Encrypt...
  ⠸ Waiting for ciphertexts to be verified on-chain...
  ⠸ Configuring scalar guardrails...
  ✓ Scalar guardrails configured: 3v75Ee1k...

  ┌──────────────────────────┬──────────────────────────────────────────────┐
  │  Daily limit ciphertext  │  Stake11111...                               │
  │  Per-tx limit ciphertext │  Config111...                                │
  │  Spent-today ciphertext  │  AddressLo...                                │
  └──────────────────────────┴──────────────────────────────────────────────┘
```

### Pre-created ciphertexts

If you already have verified ciphertext accounts (e.g. from the Rust smoke tests):

```bash
aura confidential guardrails scalar \
  --agent-id my-agent \
  --daily-limit-ciphertext <pk> \
  --per-tx-ciphertext <pk> \
  --spent-today-ciphertext <pk>
```

### All Flags

```
--agent-id <id>                    Treasury agent ID
--daily-limit <usd>                Daily limit in USD (auto-encrypted)
--per-tx-limit <usd>               Per-tx limit in USD (auto-encrypted)
--spent-today <usd>                Current spent-today counter (default: 0, auto-encrypted)
--daily-limit-ciphertext <pubkey>  Use a pre-created ciphertext instead
--per-tx-ciphertext <pubkey>       Use a pre-created ciphertext instead
--spent-today-ciphertext <pubkey>  Use a pre-created ciphertext instead
```

---

## `aura confidential guardrails vector`

Configures a single `EUint64Vector` ciphertext encoding all three guardrail values.
After each approved transaction the output vector is promoted to become the new
guardrail, rotating the encrypted state forward automatically.

```bash
aura confidential guardrails vector \
  --agent-id my-agent \
  --guardrail-ciphertext <pk>
```

---

## `aura confidential status`

Shows the current confidential guardrails and pending proposal state.

```bash
aura confidential status --agent-id my-agent
```

```
  ╔══════════════════════════════════════════════════════════════════╗
  ║  Confidential: my-agent                                          ║
  ╚══════════════════════════════════════════════════════════════════╝

  Guardrails (scalar)
  ─────────────────────────────────────────────────────────────────
  Daily limit     Stake11111...
  Per-tx limit    Config111...
  Spent today     AddressLo...

  Pending Proposal
  ─────────────────────────────────────────────────────────────────
  Proposal ID     42
  Amount          $250.00
  Chain           Ethereum
  Status          ◌ Awaiting decryption
  Policy output   SysvarC1...
```

---

## `aura confidential propose`

Proposes a confidential scalar transaction. The amount is auto-encrypted via the
Ika Encrypt gRPC network before the proposal is submitted.

### Auto-encrypt amount (recommended)

```bash
aura confidential propose \
  --agent-id my-agent \
  --amount 250 \
  --chain ethereum \
  --recipient 0xdeadbeef... \
  --wait
```

```
  ⠸ Ensuring Encrypt deposit account...
  ⠸ Encrypting amount (250 USD) via Ika Encrypt...
  ⠸ Waiting for amount ciphertext to be verified on-chain...
  ⠸ Submitting confidential proposal...
  ⠸ Waiting for output ciphertext verification...
  ✓ Confidential proposal submitted: 2rZ13uye...
    amount ciphertext: 9xQe1111...
    output ciphertext: SysvarC1...
```

### Pre-created amount ciphertext

```bash
aura confidential propose \
  --agent-id my-agent \
  --amount 250 \
  --chain ethereum \
  --recipient 0xdeadbeef... \
  --amount-ciphertext <pk>
```

### All Flags

```
--agent-id <id>              Treasury agent ID
--amount <usd>               Amount in USD — auto-encrypted (required)
--chain <name|number>        Target chain (required)
--recipient <address>        Recipient address or contract (required)
--tx-type <type>             Transaction type (default: transfer)
--protocol-id <id>           Protocol ID for DeFi whitelisting
--expected-output <usd>      Expected output for slippage check
--actual-output <usd>        Actual output for slippage check
--quote-age <secs>           Quote age in seconds
--counterparty-risk <score>  Counterparty risk score 0-100
--amount-ciphertext <pubkey> Use a pre-created verified ciphertext instead
--policy-output-keypair <p>  Keypair file for the output ciphertext account
--wait                       Wait until the output ciphertext is verified on-chain
```

---

## `aura confidential request-decryption`

Submits a decryption request to the Ika Encrypt network for the policy output
ciphertext produced during the confidential proposal.

```bash
aura confidential request-decryption --agent-id my-agent --wait
```

```
  ⠸ Ensuring Encrypt deposit account...
  ⠸ Submitting decryption request...
  ⠸ Waiting for decrypted plaintext...
  ✓ Policy decryption requested: 5sZ9KVz2...
    request account: 7QQ8jr6v...
```

`--wait` polls until the Encrypt network writes the plaintext to the request account.

---

## `aura confidential confirm-decryption`

Reads the decrypted result from the request account, applies the policy decision
on-chain, and displays the outcome.

```bash
aura confidential confirm-decryption --agent-id my-agent
```

**Approved:**

```
  ⠸ Confirming policy decryption...
  ⠸ Reading decrypted policy result from Encrypt network...
  ✓ Policy decryption confirmed: 4eWEcqjN...
    result: approved ✓
```

**Denied:**

```
  ✓ Policy decryption confirmed: 4eWEcqjN...
    result: denied — violation code 1 (per_tx_limit)
```

**Violation codes:**

| Code | Meaning |
|---|---|
| 0 | Approved |
| 1 | Per-transaction limit exceeded |
| 2 | Daily limit exceeded |
| 3 | Bitcoin manual review threshold |
| 4 | Time window (hourly) limit exceeded |
| 5 | Protocol not whitelisted |
| 6 | Slippage too high |
| 7 | Quote too old |
| 8 | Counterparty risk too high |
| 9 | Shared pool limit exceeded |
| 10 | Velocity limit exceeded |
