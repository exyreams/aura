# Treasury Commands

## `aura treasury create`

Creates a new agent treasury on-chain with a policy configuration.

### Interactive

```bash
aura treasury create
```

```
  ? Agent ID  my-trading-agent
  ? Daily limit (USD)  10000
  ? Per-transaction limit (USD)  1000

  ⠸ Creating treasury on devnet...

  ✓ Treasury created

  ┌──────────────────┬──────────────────────────────────────────────────┐
  │  PDA             │  5kwYXCMMo8M37ZVNcPo8nsMXo8bQLeufSNwKaztxCuc8    │
  │  Agent ID        │  my-trading-agent                                │
  │  Daily limit     │  $10,000.00                                      │
  │  Per-tx limit    │  $1,000.00                                       │
  │  Status          │  ● Active                                        │
  │  Transaction     │  3DSHz5cB...                                     │
  └──────────────────┴──────────────────────────────────────────────────┘
```

### Non-Interactive

```bash
aura treasury create \
  --agent-id my-trading-agent \
  --daily-limit 10000 \
  --per-tx-limit 1000
```

### All Flags

```
--agent-id <id>                    Agent identifier (required)
--daily-limit <usd>                Daily spending limit in USD (required)
--per-tx-limit <usd>               Per-transaction limit in USD (required)
--daytime-hourly-limit <usd>       Daytime hourly limit (default: daily/10)
--nighttime-hourly-limit <usd>     Nighttime hourly limit (default: daily/20)
--velocity-limit <usd>             Velocity limit (default: daily/2)
--max-slippage-bps <bps>           Max slippage in basis points (default: 100 = 1%)
--max-quote-age <secs>             Max quote age in seconds (default: 300)
--ttl <secs>                       Pending transaction TTL (default: 900 = 15 min)
--ai-authority <pubkey>            AI authority pubkey (default: wallet pubkey)
```

---

## `aura treasury show`

Displays the full state of a treasury.

```bash
aura treasury show --agent-id my-trading-agent
```

```
  ╔══════════════════════════════════════════════════════════════════╗
  ║  Treasury: my-trading-agent                                      ║
  ╚══════════════════════════════════════════════════════════════════╝

  Overview
  ─────────────────────────────────────────────────────────────────
  PDA             5kwYXCMMo8M37ZVNcPo8nsMXo8bQLeufSNwKaztxCuc8
  Owner           6rqcaPUEdcyAp8u3bw8xeMKtSRYB7jxXt1xb51YWbYmP
  AI Authority    6rqcaPUEdcyAp8u3bw8xeMKtSRYB7jxXt1xb51YWbYmP
  Status          ● Active
  Total txs       42

  Policy
  ─────────────────────────────────────────────────────────────────
  Daily limit     $10,000.00
  Per-tx limit    $1,000.00
  Max slippage    1.00%
  Max quote age   5 min

  dWallets
  ─────────────────────────────────────────────────────────────────
  ● Ethereum    0xdeadbeef...    $5,000.00

  Pending Transaction
  ─────────────────────────────────────────────────────────────────
  None
```

Live-refresh every 5 seconds:

```bash
aura treasury show --agent-id my-trading-agent --watch
```

---

## `aura treasury list`

Lists all treasuries owned by the current wallet.

```bash
aura treasury list
```

```
  Treasuries (2)
  ┌──────────────────────┬──────────────────────────────┬──────────┬──────────┐
  │ Agent ID             │ PDA                          │ Status   │ Total Tx │
  ├──────────────────────┼──────────────────────────────┼──────────┼──────────┤
  │ trading-agent-1      │ 5kwYXC...uc8                 │ ● Active │ 42       │
  │ yield-optimizer      │ 3mH1bA...xE                  │ ⏸ Paused │ 7        │
  └──────────────────────┴──────────────────────────────┴──────────┴──────────┘
```

---

## `aura treasury propose`

Proposes a public (non-encrypted) transaction. The policy engine evaluates all rules synchronously on-chain.

```bash
aura treasury propose \
  --agent-id my-trading-agent \
  --amount 500 \
  --chain ethereum \
  --recipient 0xdeadbeef...
```

```
  ✓ Proposal submitted

  ┌──────────────────┬──────────────────────────────────────────────┐
  │  Amount          │  $500.00                                     │
  │  Chain           │  Ethereum                                    │
  │  Recipient       │  0xdeadbeef...                               │
  │  Status          │  ◌ Awaiting execution                        │
  │  Transaction     │  4P7ijm5y...                                 │
  └──────────────────┴──────────────────────────────────────────────┘
```

**Chain values:** `solana` (0), `bitcoin` (1), `ethereum` (2), `polygon` (3), `arbitrum` (4), `optimism` (5)

**If the proposal is rejected** (e.g. amount exceeds per-tx limit):

```
  ✗ Proposal rejected by policy engine
    violation: per_tx_limit (code 1)
    Suggestion: reduce the amount below your per-transaction limit ($1,000.00)
```

### All Flags

```
--agent-id <id>              Treasury agent ID
--treasury <pda>             Treasury PDA (alternative to --agent-id)
--amount <usd>               Amount in USD (required)
--chain <name|number>        Target chain (required)
--recipient <address>        Recipient address or contract (required)
--tx-type <type>             transfer | swap | lending | nft | contract (default: transfer)
--protocol-id <id>           Protocol ID for DeFi whitelisting
--expected-output <usd>      Expected output for slippage check
--actual-output <usd>        Actual output for slippage check
--quote-age <secs>           Quote age in seconds
--counterparty-risk <score>  Counterparty risk score 0-100
```

---

## `aura treasury pause`

Pauses or unpauses execution on the treasury.

```bash
# Pause
aura treasury pause --agent-id my-trading-agent

# Unpause
aura treasury pause --agent-id my-trading-agent --unpause
```

```
  ✓ Treasury paused — new proposals and executions are blocked
```

---

## `aura treasury cancel`

Cancels the current pending transaction.

```bash
aura treasury cancel --agent-id my-trading-agent
```

```
  Current pending transaction:
  ┌──────────────────┬──────────────────────────────────────────────┐
  │  Amount          │  $500.00                                     │
  │  Chain           │  Ethereum                                    │
  │  Recipient       │  0xdeadbeef...                               │
  └──────────────────┴──────────────────────────────────────────────┘

  ? Cancel this transaction? › Yes

  ✓ Pending transaction cancelled
```

Use `--yes` to skip the confirmation prompt:

```bash
aura treasury cancel --agent-id my-trading-agent --yes
```
