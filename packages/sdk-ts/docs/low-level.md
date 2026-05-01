# `AuraClient` — Low-Level API

`AuraClient` is the direct wrapper over the core `aura-core` treasury,
confidential execution, dWallet, and governance flows. It gives you full control
over every parameter, account, and timestamp. Use it when you need to compose
instructions into custom transactions, integrate with existing Anchor workflows,
or access instructions not covered by the `Aura` facade.

---

## Setup

```typescript
import { AuraClient } from "@aura-protocol/sdk-ts";
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const client = new AuraClient({ connection });
```

With a custom program ID (for local testing):

```typescript
import { Keypair } from "@solana/web3.js";

const client = new AuraClient({
  connection,
  programId: new PublicKey("YourLocalProgramId..."),
});
```

---

## PDA Derivation

```typescript
// Treasury PDA
const [treasury, bump] = client.deriveTreasuryAddress(owner, "my-agent");

// CPI authority PDAs
const [dwalletCpiAuthority] = client.deriveDwalletCpiAuthority();
const [encryptCpiAuthority] = client.deriveEncryptCpiAuthority();
const [eventAuthority] = client.deriveEncryptEventAuthority(encryptProgramId);
```

Standalone helpers from `pda.ts` cover the policy-control accounts added to the
program surface: policy simulation results, policy receipts, budget envelopes,
exposure groups, operator roles, external liveness, policy attestations, batch
proposals, and invariant reports.

---

## Account Fetching

```typescript
// Throws if not found
const account = await client.getTreasuryAccount(treasury);

// Returns null if not found
const account = await client.getTreasuryAccountNullable(treasury);

// Derive + fetch in one call
const { treasury, account } = await client.getTreasuryForOwner(owner, "my-agent");
```

---

## Sending Transactions

Every instruction has two forms:

- `*Instruction(...)` — returns a `TransactionInstruction` for composing
- the method without the suffix — builds, signs, and sends in one call

```typescript
// Build only (no RPC)
const { treasury, instruction } = await client.createTreasuryInstruction({
  owner: payer.publicKey,
  args,
});

// Build + send
const { treasury, signature } = await client.createTreasury(payer, args);

// Compose multiple instructions into one transaction
const ix1 = await client.createTreasuryInstruction({ owner, args });
const ix2 = await client.registerDwalletInstruction({ owner, treasury }, dwalletArgs);
const sig = await client.sendInstructions(payer, [ix1.instruction, ix2]);
```

---

## Instruction Surface

### `create_treasury`

```typescript
import BN from "bn.js";

const { treasury, signature } = await client.createTreasury(payer, {
  agentId: "my-agent",
  aiAuthority: payer.publicKey,
  createdAt: new BN(Math.floor(Date.now() / 1000)),
  pendingTransactionTtlSecs: new BN(900),
  policyConfig: {
    dailyLimitUsd: new BN(10_000),
    perTxLimitUsd: new BN(1_000),
    daytimeHourlyLimitUsd: new BN(2_500),
    nighttimeHourlyLimitUsd: new BN(500),
    velocityLimitUsd: new BN(5_000),
    allowedProtocolBitmap: new BN(31),
    maxSlippageBps: new BN(100),
    maxQuoteAgeSecs: new BN(300),
    maxCounterpartyRiskScore: 70,
    bitcoinManualReviewThresholdUsd: new BN(5_000),
    sharedPoolLimitUsd: null,
    reputationPolicy: {
      highScoreThreshold: new BN(80),
      mediumScoreThreshold: new BN(50),
      highMultiplierBps: new BN(15_000),
      lowMultiplierBps: new BN(7_000),
    },
  },
  protocolFees: {
    treasuryCreationFeeUsd: new BN(100),
    transactionFeeBps: new BN(10),
    fheSubsidyBps: new BN(5_000),
  },
});
```

---

### `register_dwallet`

```typescript
await client.registerDwallet(
  owner,
  { owner: owner.publicKey, treasury },
  {
    chain: 2,                    // Ethereum
    dwalletId: "dwallet-abc",
    address: "0xdeadbeef...",
    balanceUsd: new BN(5_000),
    dwalletAccount: null,        // set for live Ika signing
    authorizedUserPubkey: null,
    messageMetadataDigest: null,
    publicKeyHex: null,
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  },
);
```

---

### `configure_confidential_guardrails`

Attaches three scalar `EUint64` ciphertext accounts (daily limit, per-tx limit,
spent-today counter) to the treasury for FHE policy evaluation.

```typescript
await client.configureConfidentialGuardrails(
  owner,
  {
    owner: owner.publicKey,
    treasury,
    dailyLimitCiphertext: dailyLimitCiphertextPDA,
    perTxLimitCiphertext: perTxLimitCiphertextPDA,
    spentTodayCiphertext: spentTodayCiphertextPDA,
  },
  Math.floor(Date.now() / 1000),
);
```

---

### `configure_confidential_vector_guardrails`

Attaches a single `EUint64Vector` ciphertext encoding all three guardrail values.

```typescript
await client.configureConfidentialVectorGuardrails(
  owner,
  {
    owner: owner.publicKey,
    treasury,
    guardrailVectorCiphertext: guardrailVectorPDA,
  },
  Math.floor(Date.now() / 1000),
);
```

---

### `propose_transaction`

```typescript
await client.proposeTransaction(
  aiAuthority,
  { aiAuthority: aiAuthority.publicKey, treasury },
  {
    amountUsd: new BN(500),
    targetChain: 2,
    txType: 0,
    protocolId: null,
    currentTimestamp: new BN(Math.floor(Date.now() / 1000)),
    expectedOutputUsd: null,
    actualOutputUsd: null,
    quoteAgeSecs: null,
    counterpartyRiskScore: null,
    recipientOrContract: "0xdeadbeef...",
  },
);
```

---

### `propose_confidential_transaction`

Submits a scalar FHE proposal. Requires Ika Encrypt network.

```typescript
await client.proposeConfidentialTransaction(
  aiAuthority,
  {
    aiAuthority: aiAuthority.publicKey,
    treasury,
    dailyLimitCiphertext,
    perTxLimitCiphertext,
    spentTodayCiphertext,
    amountCiphertext,
    policyOutputCiphertext,
    encryptProgram: ENCRYPT_DEVNET_PROGRAM_ID,
    config: encryptConfigPDA,
    deposit: encryptDepositPDA,
    callerProgram: AURA_PROGRAM_ID,
    cpiAuthority: encryptCpiAuthority,
    networkEncryptionKey: networkEncryptionKeyPDA,
    eventAuthority: encryptEventAuthority,
    systemProgram: SystemProgram.programId,
  },
  {
    amountUsd: new BN(500),
    targetChain: 2,
    txType: 0,
    protocolId: null,
    currentTimestamp: new BN(Math.floor(Date.now() / 1000)),
    expectedOutputUsd: null,
    actualOutputUsd: null,
    quoteAgeSecs: null,
    counterpartyRiskScore: null,
    recipientOrContract: "0xdeadbeef...",
  },
  [amountCiphertextKeypair], // extra signers for freshly created ciphertext accounts
);
```

---

### `propose_confidential_vector_transaction`

Same as scalar but uses a single `EUint64Vector` guardrail ciphertext.

```typescript
await client.proposeConfidentialVectorTransaction(
  aiAuthority,
  {
    aiAuthority: aiAuthority.publicKey,
    treasury,
    guardrailVectorCiphertext,
    amountVectorCiphertext,
    policyResultVectorCiphertext,
    encryptProgram: ENCRYPT_DEVNET_PROGRAM_ID,
    config: encryptConfigPDA,
    deposit: encryptDepositPDA,
    callerProgram: AURA_PROGRAM_ID,
    cpiAuthority: encryptCpiAuthority,
    networkEncryptionKey: networkEncryptionKeyPDA,
    eventAuthority: encryptEventAuthority,
    systemProgram: SystemProgram.programId,
  },
  args,
  [amountVectorKeypair],
);
```

---

### `request_policy_decryption`

Submits a decryption request to the Ika Encrypt network for the policy output
ciphertext produced during a confidential proposal.

```typescript
await client.requestPolicyDecryption(
  operator,
  {
    operator: operator.publicKey,
    treasury,
    requestAccount: decryptionRequestKeypair.publicKey,
    ciphertext: policyOutputCiphertextPDA,
    encryptProgram: ENCRYPT_DEVNET_PROGRAM_ID,
    config: encryptConfigPDA,
    deposit: encryptDepositPDA,
    callerProgram: AURA_PROGRAM_ID,
    cpiAuthority: encryptCpiAuthority,
    networkEncryptionKey: networkEncryptionKeyPDA,
    eventAuthority: encryptEventAuthority,
    systemProgram: SystemProgram.programId,
  },
  Math.floor(Date.now() / 1000),
  [decryptionRequestKeypair],
);
```

---

### `confirm_policy_decryption`

Reads the decrypted violation code and applies the policy decision.

```typescript
await client.confirmPolicyDecryption(
  operator,
  {
    operator: operator.publicKey,
    treasury,
    requestAccount: decryptionRequestPDA,
  },
  Math.floor(Date.now() / 1000),
);
```

---

### `execute_pending`

Submits an `approve_message` CPI to the Ika dWallet program.

```typescript
await client.executePending(
  operator,
  {
    operator: operator.publicKey,
    treasury,
    messageApproval: messageApprovalPDA,
    dwallet: dwalletPDA,
    callerProgram: AURA_PROGRAM_ID,
    cpiAuthority: dwalletCpiAuthority,
    dwalletProgram: DWALLET_DEVNET_PROGRAM_ID,
    dwalletCoordinator: dwalletCoordinatorPDA,
    systemProgram: SystemProgram.programId,
  },
  Math.floor(Date.now() / 1000),
);
```

---

### `finalize_execution`

Verifies the dWallet co-signature and closes the proposal.

```typescript
await client.finalizeExecution(
  operator,
  {
    operator: operator.publicKey,
    treasury,
    messageApproval: messageApprovalPDA,
  },
  Math.floor(Date.now() / 1000),
);
```

---

### `pause_execution`

```typescript
// Pause
await client.pauseExecution(
  owner,
  { owner: owner.publicKey, treasury },
  true,
  Math.floor(Date.now() / 1000),
);

// Unpause
await client.pauseExecution(
  owner,
  { owner: owner.publicKey, treasury },
  false,
  Math.floor(Date.now() / 1000),
);
```

---

### `cancel_pending`

```typescript
await client.cancelPending(
  owner,
  { owner: owner.publicKey, treasury },
  Math.floor(Date.now() / 1000),
);
```

---

### `configure_multisig`

```typescript
await client.configureMultisig(
  owner,
  { owner: owner.publicKey, treasury },
  {
    requiredSignatures: 2,
    guardians: [guardian1, guardian2, guardian3],
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  },
);
```

---

### `propose_override`

Guardian proposes raising the daily spending limit.

```typescript
await client.proposeOverride(
  guardian,
  { guardian: guardian.publicKey, treasury },
  new BN(20_000),  // new daily limit in USD cents
  Math.floor(Date.now() / 1000),
);
```

---

### `collect_override_signature`

Guardian co-signs an existing override proposal.

```typescript
await client.collectOverrideSignature(
  guardian,
  { guardian: guardian.publicKey, treasury },
  Math.floor(Date.now() / 1000),
);
```

---

### `configure_swarm`

```typescript
await client.configureSwarm(
  owner,
  { owner: owner.publicKey, treasury },
  {
    swarmId: "swarm-alpha",
    memberAgents: ["agent-1", "agent-2"],
    sharedPoolLimitUsd: new BN(50_000),
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  },
);
```

---

## Policy-Control Instructions

These methods expose the latest policy-control surface. They are intentionally
low-level because most callers need to supply derived PDA accounts and choose
whether to compose the instruction with other program calls.

### `simulate_policy`

Evaluates a hypothetical spend without mutating treasury spend counters and
writes the result to a policy simulation PDA.

```typescript
await client.simulatePolicy(
  payer,
  {
    payer: payer.publicKey,
    treasury,
    operatorRole: null,
    simulationResult,
    systemProgram: SystemProgram.programId,
  },
  {
    simulationId: new BN(1),
    amountUsd: new BN(500),
    targetChain: 2,
    txType: 0,
    protocolId: null,
    currentTimestamp: new BN(Math.floor(Date.now() / 1000)),
    expectedOutputUsd: null,
    actualOutputUsd: null,
    quoteAgeSecs: null,
    counterpartyRiskScore: null,
    recipientOrContract: "0xdeadbeef...",
  },
);
```

### `write_policy_receipt`

Persists an explainable receipt for a pending proposal.

```typescript
await client.writePolicyReceipt(
  payer,
  {
    payer: payer.publicKey,
    treasury,
    receipt,
    attestation: null,
    systemProgram: SystemProgram.programId,
  },
  { proposalId: new BN(42), now: new BN(Math.floor(Date.now() / 1000)) },
);
```

### Owner policy configuration

```typescript
await client.applyPolicyPreset(owner, { owner: owner.publicKey, treasury }, {
  presetKind: 1,
  now: new BN(now),
});

await client.configureBudgetEnvelope(owner, {
  owner: owner.publicKey,
  treasury,
  budgetEnvelope,
  systemProgram: SystemProgram.programId,
}, {
  envelopeId: new BN(7),
  scopeKind: 0,
  chain: 2,
  txType: null,
  protocolId: null,
  dailyLimitUsd: new BN(2_500),
  weeklyLimitUsd: new BN(10_000),
  now: new BN(now),
});

await client.configureApprovalLadder(owner, { owner: owner.publicKey, treasury }, {
  guardianAboveUsd: new BN(5_000),
  multisigAboveUsd: new BN(25_000),
  timelockAboveUsd: new BN(50_000),
  denyAboveUsd: new BN(100_000),
  riskGuardianBps: 6_000,
  riskMultisigBps: 8_000,
  riskTimelockBps: 9_000,
  timelockSecs: new BN(3_600),
  now: new BN(now),
});
```

### Operator and liveness controls

```typescript
await client.grantOperatorRole(owner, {
  owner: owner.publicKey,
  operator: operator.publicKey,
  treasury,
  operatorRole,
  systemProgram: SystemProgram.programId,
}, {
  permissionMask: new BN(0xffff),
  expiresAt: new BN(now + 86_400),
  now: new BN(now),
});

await client.setScopedPause(operator, {
  operator: operator.publicKey,
  treasury,
  operatorRole,
}, {
  scopeKind: 5,
  chain: null,
  txType: null,
  recipient: null,
  protocolId: null,
  paused: true,
  expiresAt: null,
  now: new BN(now),
});

await client.initExternalLiveness(owner, {
  owner: owner.publicKey,
  treasury,
  liveness,
  systemProgram: SystemProgram.programId,
}, {
  maxStalenessSecs: new BN(300),
  now: new BN(now),
});

await client.refreshExternalLiveness(operator, {
  operator: operator.publicKey,
  treasury,
  operatorRole,
  liveness,
}, {
  dependency: 1,
  now: new BN(now),
});
```

### Attestations, batches, and invariant reports

```typescript
await client.attestPolicy(payer, attester, {
  payer: payer.publicKey,
  attester: attester.publicKey,
  treasury,
  attestation,
  systemProgram: SystemProgram.programId,
}, {
  attestationKind: 1,
  expectedPolicyHash,
  now: new BN(now),
});

await client.proposeBatch(payer, {
  payer: payer.publicKey,
  treasury,
  batch,
  systemProgram: SystemProgram.programId,
}, {
  batchId: new BN(9),
  now: new BN(now),
  items: [{
    amountUsd: new BN(500),
    chain: 2,
    txType: 0,
    recipientOrContract: "0xdeadbeef...",
    protocolId: null,
  }],
});

await client.checkInvariants(payer, {
  payer: payer.publicKey,
  treasury,
  report,
  systemProgram: SystemProgram.programId,
}, {
  reportId: new BN(10),
  now: new BN(now),
});
```

---

## Instruction Decoding

The `coder` property exposes the Borsh instruction coder for decoding raw
instruction data — useful in tests and transaction inspection tools:

```typescript
const decoded = client.coder.decode(instruction.data);
console.log(decoded?.name);  // e.g. "create_treasury"
```
