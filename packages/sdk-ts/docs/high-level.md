# `Aura` — High-Level API

The `Aura` class is the recommended entry point for most developers. It wraps
`AuraClient` with sensible defaults, automatic timestamp injection, and
plain-number inputs so you never need to construct a `BN` manually.

---

## Setup

```typescript
import { Aura } from "@aura-protocol/sdk-ts";
import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";

// Load your keypair (standard Solana CLI format)
const secret = JSON.parse(readFileSync("~/.config/solana/id.json", "utf8"));
const keypair = Keypair.fromSecretKey(new Uint8Array(secret));

const aura = new Aura({
  rpcUrl: "https://api.devnet.solana.com",
  keypair,
});
```

Use a custom RPC to avoid rate limits:

```typescript
const aura = new Aura({
  rpcUrl: process.env.AURA_RPC_URL ?? "https://api.devnet.solana.com",
  keypair,
});
```

---

## `aura.treasury`

### `treasury.create(options)`

Creates a new agent treasury on-chain. All policy fields have sensible defaults
— you only need to provide `agentId`, `dailyLimitUsd`, and `perTxLimitUsd`.

```typescript
const { treasury, signature } = await aura.treasury.create({
  agentId: "my-trading-agent",
  dailyLimitUsd: 10_000,   // $10,000/day
  perTxLimitUsd: 1_000,    // $1,000/tx
});

console.log("treasury:", treasury.toBase58());
console.log("tx:", signature);
```

**All options:**

```typescript
const { treasury } = await aura.treasury.create({
  agentId: "my-agent",

  // Required
  dailyLimitUsd: 10_000,
  perTxLimitUsd: 1_000,

  // Optional — all have defaults
  aiAuthority: aiKeypair.publicKey,       // defaults to your keypair
  daytimeHourlyLimitUsd: 1_000,          // defaults to dailyLimitUsd / 10
  nighttimeHourlyLimitUsd: 500,          // defaults to dailyLimitUsd / 20
  velocityLimitUsd: 5_000,               // defaults to dailyLimitUsd / 2
  allowedProtocolBitmap: 31,             // defaults to 31 (all protocols)
  maxSlippageBps: 100,                   // defaults to 100 (1%)
  maxQuoteAgeSecs: 300,                  // defaults to 300 (5 min)
  maxCounterpartyRiskScore: 70,          // defaults to 70
  bitcoinManualReviewThresholdUsd: 5_000,// defaults to 5000
  pendingTransactionTtlSecs: 900,        // defaults to 900 (15 min)
});
```

---

### `treasury.get(treasury)`

Fetches and deserializes a treasury account. Throws if it doesn't exist.

```typescript
const account = await aura.treasury.get(treasury);

console.log("agent:", account.agentId);
console.log("paused:", account.executionPaused);
console.log("pending:", account.pending);
console.log("dwallets:", account.dwallets.length);
```

---

### `treasury.getOrNull(treasury)`

Same as `get` but returns `null` instead of throwing if the account doesn't exist.

```typescript
const account = await aura.treasury.getOrNull(treasury);
if (account === null) {
  console.log("treasury not yet created");
}
```

---

### `treasury.getForOwner(owner, agentId)`

Derives the treasury PDA and fetches the account in one call.

```typescript
const { treasury, account } = await aura.treasury.getForOwner(
  keypair.publicKey,
  "my-agent",
);

if (account === null) {
  console.log("treasury not yet created at", treasury.toBase58());
} else {
  console.log("found treasury:", account.agentId);
}
```

---

### `treasury.propose(options)`

Proposes a transaction on the treasury. The policy engine evaluates all rules
synchronously on-chain. Timestamps are injected automatically.

```typescript
const signature = await aura.treasury.propose({
  treasury,
  amountUsd: 500,          // $500
  chain: 2,                // Ethereum (0=Solana 1=Bitcoin 2=Ethereum 3=Polygon 4=Arbitrum 5=Optimism)
  recipient: "0xdeadbeef...",
});
```

**With optional fields:**

```typescript
const signature = await aura.treasury.propose({
  treasury,
  amountUsd: 500,
  chain: 2,
  recipient: "0xdeadbeef...",
  txType: 1,               // 0=Transfer 1=Swap 2=Lending etc.
  protocolId: 0,           // 0=Uniswap, 1=Aave, etc.
  expectedOutputUsd: 490,  // for slippage checks
  actualOutputUsd: 488,
  quoteAgeSecs: 30,
  counterpartyRiskScore: 20,
});
```

**With a different AI authority:**

```typescript
const signature = await aura.treasury.propose({
  treasury,
  amountUsd: 500,
  chain: 2,
  recipient: "0xdeadbeef...",
  aiAuthority: aiKeypair,  // override the default keypair
});
```

---

### `treasury.pause(options)`

Pauses or unpauses execution on the treasury. When paused, new proposals and
executions are blocked.

```typescript
// Pause
await aura.treasury.pause({ treasury, paused: true });

// Unpause
await aura.treasury.pause({ treasury, paused: false });
```

---

### `treasury.cancel(options)`

Cancels the current pending transaction.

```typescript
await aura.treasury.cancel({ treasury });
```

---

## `aura.dwallet`

### `dwallet.register(options)`

Registers a dWallet reference on the treasury for a specific chain. This links
an Ika dWallet to the treasury so it can be used for cross-chain execution.

```typescript
await aura.dwallet.register({
  treasury,
  chain: 2,                          // Ethereum
  dwalletId: "dwallet-abc123",       // from Ika network
  address: "0xdeadbeef...",          // native chain address
  balanceUsd: 5_000,                 // current balance in USD cents
});
```

**Supported chains:**

| Value | Chain |
|---|---|
| `0` | Solana |
| `1` | Bitcoin |
| `2` | Ethereum |
| `3` | Polygon |
| `4` | Arbitrum |
| `5` | Optimism |

---

## `aura.governance`

### `governance.configureMultisig(options)`

Attaches an emergency guardian multisig to the treasury. Guardians can propose
and co-sign daily limit increases via `proposeOverride` / `collectOverrideSignature`
on the low-level client.

```typescript
import { PublicKey } from "@solana/web3.js";

await aura.governance.configureMultisig({
  treasury,
  requiredSignatures: 2,
  guardians: [
    new PublicKey("Guardian1..."),
    new PublicKey("Guardian2..."),
    new PublicKey("Guardian3..."),
  ],
});
```

---

### `governance.configureSwarm(options)`

Attaches a shared spending pool to the treasury. All member agents share a
collective `sharedPoolLimitUsd` enforced by the `shared_pool_limit` policy rule.

```typescript
await aura.governance.configureSwarm({
  treasury,
  swarmId: "trading-swarm-alpha",
  memberAgents: ["agent-1", "agent-2", "agent-3"],
  sharedPoolLimitUsd: 50_000,  // $50,000 shared across all members
});
```

---

## Accessing the Low-Level Client

For operations not covered by the facade (confidential FHE proposals, execution
lifecycle, override signatures), access the underlying `AuraClient` directly:

```typescript
const client = aura.lowLevel;

// Use any AuraClient method
await client.proposeConfidentialTransaction(aiAuthority, accounts, args);
await client.executePending(operator, accounts, now);
await client.finalizeExecution(operator, accounts, now);
await client.proposeOverride(guardian, accounts, newDailyLimitUsd, now);
await client.collectOverrideSignature(guardian, accounts, now);
```

---

## Error Handling

```typescript
import { AuraErrorCode, isAuraError } from "@aura-protocol/sdk-ts";

try {
  await aura.treasury.propose({ treasury, amountUsd: 5_000, chain: 2, recipient: "0x..." });
} catch (error) {
  if (isAuraError(error, AuraErrorCode.ExecutionPaused)) {
    console.error("treasury is paused — unpause it first");
  } else if (isAuraError(error, AuraErrorCode.PendingTransactionExists)) {
    console.error("cancel the existing pending transaction first");
  } else if (isAuraError(error, AuraErrorCode.DWalletNotConfigured)) {
    console.error("register a dWallet for this chain first");
  } else {
    throw error;
  }
}
```

---

## Validation

Use the built-in validation helpers before submitting transactions:

```typescript
import { validateAgentId, validateAmountUsd, validateGuardians } from "@aura-protocol/sdk-ts";

validateAgentId("my-agent");           // throws if empty or > 64 bytes
validateAmountUsd(500);                // throws if zero or negative
validateGuardians(guardians);          // throws if empty or > 10
```
