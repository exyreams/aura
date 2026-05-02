![AURA banner](https://raw.githubusercontent.com/exyreams/aura/refs/heads/main/packages/web/public/banner.png)

# @aura-protocol/sdk-ts

TypeScript SDK for the AURA autonomous treasury program on Solana.

> **AURA is under active development. Program instructions, account layouts, policy semantics, SDK APIs, and deployment behavior may still change quickly. Do not use this code to secure production funds or serious treasury operations until a stable release and audit are published.**

Wraps the core `aura-core` treasury, confidential execution, dWallet, and
governance flows with a typed client, automatic PDA derivation, and account
deserialization — built directly from the Anchor IDL so it stays aligned with
the deployed program.

---

## Installation

```bash
npm install @aura-protocol/sdk-ts
```

**Peer dependencies** (install alongside):

```bash
npm install @solana/web3.js bn.js
```

---

## Quick Start

```ts
import BN from "bn.js";
import { Connection, Keypair } from "@solana/web3.js";
import { AuraClient } from "@aura-protocol/sdk-ts";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const client = new AuraClient({ connection });
const owner = Keypair.generate(); // use your real keypair

// 1. Build the create_treasury instruction
const { treasury, instruction } = await client.createTreasuryInstruction({
  owner: owner.publicKey,
  args: {
    agentId: "my-agent",
    aiAuthority: owner.publicKey,
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
  },
});

console.log("treasury PDA:", treasury.toBase58());

// 2. Send it
const sig = await client.sendInstructions(owner, [instruction]);
console.log("tx:", sig);

// 3. Fetch the account back
const account = await client.getTreasuryAccount(treasury);
console.log("agentId:", account.agentId);
```

---

## AuraClient

```ts
import { AuraClient } from "@aura-protocol/sdk-ts";

const client = new AuraClient({
  connection,               // Connection — required
  programId,                // PublicKey — optional, defaults to devnet program ID
  confirmOptions,           // ConfirmOptions — optional
});
```

### Account fetching

```ts
// Fetch a treasury by its PDA — throws if not found
const account = await client.getTreasuryAccount(treasuryPDA);

// Returns null if the account does not exist
const account = await client.getTreasuryAccountNullable(treasuryPDA);

// Derive the PDA and fetch in one call
const { treasury, account } = await client.getTreasuryForOwner(owner, "my-agent");
```

### PDA derivation

```ts
const [treasuryPDA, bump] = client.deriveTreasuryAddress(owner, "my-agent");
const [dwalletCpiAuthority] = client.deriveDwalletCpiAuthority();
const [encryptCpiAuthority] = client.deriveEncryptCpiAuthority();
const [encryptEventAuthority] = client.deriveEncryptEventAuthority(encryptProgramId);
```

### Sending transactions

```ts
// Build an instruction, then send it with a signer
const { instruction } = await client.createTreasuryInstruction({ owner, args });
const sig = await client.sendInstructions(payer, [instruction]);

// Or use the convenience method that builds + sends in one call
const { treasury, signature } = await client.createTreasury(payer, args);
```

---

## Instructions

Every instruction has two forms:
- `*Instruction(...)` — returns a `TransactionInstruction` for composing into your own transaction
- the method without the suffix — builds, signs, and sends in one call

For larger applications, the same instruction builders are also available as
domain namespaces:

```ts
import { AuraClient, instructionBuilders } from "@aura-protocol/sdk-ts";

const client = new AuraClient({ connection });

const ix = await instructionBuilders.governance.proposeAiRotationInstruction(
  client,
  { owner, treasury },
  newAiAuthority,
  now,
);

const check = await instructionBuilders.policy.checkPolicyCpiInstruction(
  client,
  { caller, treasury, feePayer, result, systemProgram },
  checkArgs,
);
```

The package also exposes `@aura-protocol/sdk-ts/instructions` as a subpath for
domain-only imports. The client and domain builders cover the full current
`aura-core` surface: treasury lifecycle, confidential execution, dWallet
execution, policy controls, budget controls, governance timelocks, AI and
guardian rotation, session keys, migration, health scores, snapshots, activity
logs, swarm pools, fee vaults, address lists, policy history, policy CPI checks,
and dWallet balance refreshes.

### Treasury lifecycle

```ts
// Create a new treasury PDA
const { treasury, instruction } = await client.createTreasuryInstruction({ owner, args });
const { treasury, signature }   = await client.createTreasury(payer, args);

// Pause or unpause execution
await client.pauseExecution(owner, treasury, true,  now);  // pause
await client.pauseExecution(owner, treasury, false, now);  // unpause

// Cancel the current pending transaction
await client.cancelPending(owner, treasury, now);
```

### dWallet registration

```ts
await client.registerDwallet(owner, treasury, {
  chain: 2,                    // 0=Solana 1=Bitcoin 2=Ethereum 3=Polygon 4=Arbitrum 5=Optimism
  dwalletId: "dwallet-abc",
  address: "0xdeadbeef...",
  balanceUsd: new BN(5_000),
  dwalletAccount: null,        // set for live Ika signing
  authorizedUserPubkey: null,
  messageMetadataDigest: null,
  publicKeyHex: null,
  timestamp: now,
});
```

### Proposing transactions

```ts
// Public (non-encrypted) proposal
await client.proposeTransaction(aiAuthority, treasury, {
  amountUsd: new BN(250),
  targetChain: 2,
  txType: 0,
  protocolId: null,
  currentTimestamp: now,
  expectedOutputUsd: null,
  actualOutputUsd: null,
  quoteAgeSecs: null,
  counterpartyRiskScore: null,
  recipientOrContract: "0xdeadbeef...",
});

// Confidential scalar proposal (FHE — requires Ika Encrypt network)
await client.proposeConfidentialTransaction(aiAuthority, accounts, args);

// Confidential vector proposal (FHE — requires Ika Encrypt network)
await client.proposeConfidentialVectorTransaction(aiAuthority, accounts, args);
```

### Confidential guardrails (FHE)

```ts
// Scalar ciphertexts — daily limit, per-tx limit, spent-today as separate accounts
await client.configureConfidentialGuardrails(owner, accounts, now);

// Vector ciphertext — all three encoded in a single EUint64Vector account
await client.configureConfidentialVectorGuardrails(owner, accounts, now);
```

### Execution lifecycle (operator)

```ts
// Request the Encrypt network to decrypt the policy output
await client.requestPolicyDecryption(operator, accounts, now);

// Confirm the decrypted result and apply the decision
await client.confirmPolicyDecryption(operator, accounts, now);

// Submit approve_message CPI to dWallet once approved
await client.executePending(operator, accounts, now);

// Verify the dWallet signature and close the proposal
await client.finalizeExecution(operator, accounts, now);
```

### Governance

```ts
// Attach an emergency guardian multisig
await client.configureMultisig(owner, treasury, {
  requiredSignatures: 2,
  guardians: [guardian1, guardian2, guardian3],
  timestamp: now,
});

// Guardian proposes a daily limit increase
await client.proposeOverride(guardian, treasury, newDailyLimitUsd, now);

// Guardian co-signs the override proposal
await client.collectOverrideSignature(guardian, treasury, now);
```

### Agent swarms

```ts
// Attach a shared spending pool across multiple agents
await client.configureSwarm(owner, treasury, {
  swarmId: "swarm-alpha",
  memberAgents: ["agent-1", "agent-2"],
  sharedPoolLimitUsd: new BN(50_000),
  timestamp: now,
});
```

### Policy controls

The low-level client exposes the latest policy-control program surface directly.
Each method has an `*Instruction` builder and a send helper with signer checks.

```ts
await client.applyPolicyPreset(owner, { owner: owner.publicKey, treasury }, {
  presetKind: 1,
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

await client.setScopedPause(operator, {
  operator: operator.publicKey,
  treasury,
  operatorRole: null,
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
```

Covered policy-control methods:

- `simulatePolicy`, `writePolicyReceipt`, `applyPolicyPreset`
- `configureBudgetEnvelope`, `initExposureGroup`, `joinExposureGroup`
- `configureApprovalLadder`, `approvePendingExecution`, `setScopedPause`
- `grantOperatorRole`, `revokeOperatorRole`
- `initExternalLiveness`, `configureLivenessGuardrails`, `refreshExternalLiveness`
- `attestPolicy`, `proposeBatch`, `checkInvariants`

### Advanced controls

```ts
await client.proposeAiRotation(owner, { owner: owner.publicKey, treasury }, newAiAuthority, now);
await client.executeAiRotation(owner, { owner: owner.publicKey, treasury }, now);

await client.proposeGuardianRotation(
  guardian,
  { guardian: guardian.publicKey, treasury },
  0,
  newGuardian,
  now,
);

await client.issueSessionKey(authority, {
  authority: authority.publicKey,
  treasury,
  sessionKeyAccount,
  systemProgram: SystemProgram.programId,
}, issueArgs);

await client.manageAddressList(operator, {
  operator: operator.publicKey,
  treasury,
  operatorRole: null,
  addressList,
}, 1, 2, ["0xabc..."], now);
```

Newer operational and admin methods include AI rotation, guardian rotation,
config changes and vetoes, emergency shutdown, agent-state transitions,
migration, session keys, dead-man switch evaluation, policy CPI checks, health
scores, snapshots, policy history, activity logs, swarm pools, fee vaults,
address lists, and dWallet balance refreshes.

---

## PDA Helpers (standalone)

These are also exported as standalone functions if you don't need a full client:

```ts
import {
  deriveTreasuryAddress,
  deriveDwalletCpiAuthorityAddress,
  deriveEncryptCpiAuthorityAddress,
  deriveEncryptEventAuthorityAddress,
  deriveMessageApprovalAddress,
  derivePolicyReceiptAddress,
  deriveBudgetEnvelopeAddress,
  deriveOperatorRoleAddress,
  AURA_PROGRAM_ID,
} from "@aura-protocol/sdk-ts";

const [treasury, bump] = deriveTreasuryAddress(owner, "my-agent", AURA_PROGRAM_ID);

// Current dWallet MessageApproval PDA.
const digest = new Uint8Array(32); // Keccak-256 message digest
const [approval] = deriveMessageApprovalAddress(
  dwalletProgramId,
  0,                  // curve code
  publicKeyBytes,
  5,                  // signature scheme code
  digest,
  metadataDigest,     // optional 32-byte digest
);

// Policy-control PDAs.
const [receipt] = derivePolicyReceiptAddress(treasury, 42, AURA_PROGRAM_ID);
const [envelope] = deriveBudgetEnvelopeAddress(treasury, 7, AURA_PROGRAM_ID);
const [role] = deriveOperatorRoleAddress(treasury, operator, AURA_PROGRAM_ID);
```

The standalone PDA helpers also include policy simulation, exposure group,
external liveness, policy attestation, batch proposal, and invariant report
derivations.

---

## Constants and Types

```ts
import {
  AURA_PROGRAM_ID,           // PublicKey — deployed devnet program
  DWALLET_DEVNET_PROGRAM_ID, // PublicKey — Ika dWallet program
  ENCRYPT_DEVNET_PROGRAM_ID, // PublicKey — Ika Encrypt program
  DEVNET_RPC_URL,            // string — https://api.devnet.solana.com
  AURA_IDL,                  // the raw Anchor IDL object
} from "@aura-protocol/sdk-ts";

// Type aliases derived from the IDL
import type {
  TreasuryAccountRecord,
  CreateTreasuryArgs,
  RegisterDwalletArgs,
  ProposeTransactionArgs,
  ProposeConfidentialTransactionArgs,
  ConfigureMultisigArgs,
  ConfigureSwarmArgs,
  SimulatePolicyArgs,
  WritePolicyReceiptArgs,
  ConfigureBudgetEnvelopeArgs,
  ConfigureApprovalLadderArgs,
  GrantOperatorRoleArgs,
  ProposeBatchArgs,
  CheckInvariantsArgs,
} from "@aura-protocol/sdk-ts";
```

The raw IDL is also available at the `@aura-protocol/sdk-ts/idl` export path:

```ts
import idl from "@aura-protocol/sdk-ts/idl";
```

---

## BNish

All timestamp and amount parameters accept `BN | bigint | number | string` via
the `BNish` type. The `toBN` helper is also exported if you need it directly:

```ts
import { toBN } from "@aura-protocol/sdk-ts";

toBN(1000)           // number
toBN(1000n)          // bigint
toBN("1000")         // decimal string
toBN(new BN(1000))   // passthrough
```

---

## Account Shapes

Typed account structs for each instruction group are exported from `accounts.ts`:

```ts
import type {
  OwnerTreasuryAccounts,
  AiAuthorityTreasuryAccounts,
  GuardianTreasuryAccounts,
  OperatorTreasuryAccounts,
  ExecutePendingAccounts,
  FinalizeExecutionAccounts,
  RequestPolicyDecryptionAccounts,
  ConfirmPolicyDecryptionAccounts,
  ConfigureConfidentialGuardrailsAccounts,
  ConfigureConfidentialVectorGuardrailsAccounts,
  ProposeConfidentialTransactionAccounts,
  ProposeConfidentialVectorTransactionAccounts,
  SimulatePolicyAccounts,
  WritePolicyReceiptAccounts,
  ConfigureBudgetEnvelopeAccounts,
  SetScopedPauseAccounts,
  GrantOperatorRoleAccounts,
  ProposeBatchAccounts,
  CheckInvariantsAccounts,
} from "@aura-protocol/sdk-ts";
```

---

## Error Handling

All on-chain errors are accessible via `AuraErrorCode`:

```ts
import { AuraErrorCode, isAuraError, getAuraErrorCode } from "@aura-protocol/sdk-ts";

try {
  await client.proposeTransaction(aiAuthority, accounts, args);
} catch (error) {
  if (isAuraError(error, AuraErrorCode.ExecutionPaused)) {
    console.log("treasury is paused — call pauseExecution(false) first");
  } else if (isAuraError(error, AuraErrorCode.PendingTransactionExists)) {
    console.log("cancel the existing pending transaction first");
  } else {
    const code = getAuraErrorCode(error);
    console.log(`program error code: ${code}`);
  }
}
```

All 27 error codes are available on `AuraErrorCode`. See `src/errors.ts` for the full list.

---

## Events

Three event types are emitted by the program:

```ts
import {
  type TreasuryAuditEvent,
  type ProposalLifecycleEvent,
  type ExecutionLifecycleEvent,
} from "@aura-protocol/sdk-ts";
import { EventParser } from "@coral-xyz/anchor";

// Parse events from a confirmed transaction
const parser = new EventParser(AURA_PROGRAM_ID, client.coder);
const events = parser.parseLogs(transactionLogs);
for (const event of events) {
  if (event.name === "proposalLifecycleEvent") {
    const e = event.data as ProposalLifecycleEvent;
    console.log(`proposal ${e.proposalId} status: ${e.status}`);
  }
}
```

| Event | When emitted |
|---|---|
| `treasuryAuditEvent` | After every state-mutating instruction |
| `proposalLifecycleEvent` | After every proposal state change |
| `executionLifecycleEvent` | After `finalize_execution` completes |

---

## Validation

Client-side validation helpers catch invalid inputs before submitting transactions:

```ts
import {
  validateAgentId,
  validateDwalletId,
  validateAddress,
  validateAmountUsd,
  validateMultisigThreshold,
  validateGuardians,
  validateSwarmMembers,
} from "@aura-protocol/sdk-ts";

validateAgentId("my-agent");                    // throws if empty or > 64 bytes
validateAmountUsd(100);                         // throws if zero
validateMultisigThreshold(2, guardians.length); // throws if threshold > count
```

---

```bash
# Build ESM output to dist/
npm run build

# Unit tests — no network required (129 tests)
npm test

# Devnet integration tests — requires a funded wallet at ~/.config/solana/id.json
npm run test:devnet

# Sync IDL from anchor build output (Linux/macOS)
npm run generate-idl

# Sync IDL from anchor build output (Windows PowerShell)
npm run generate-idl:win
```

### Devnet test prerequisites

```bash
# Ensure your wallet is funded
solana airdrop 2 --url devnet

# Optional: use a custom RPC to avoid rate limits
export AURA_DEVNET_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"

# Optional: use a different keypair
export PAYER_KEYPAIR="/path/to/keypair.json"
```

### Regenerating the IDL

Run `anchor build` from the workspace root first, then:

```bash
# From packages/sdk-ts/
npm run generate-idl
```

This copies `target/idl/aura_core.json` and `target/types/aura_core.ts` into
`src/generated/`. The generated files are gitignored — always regenerate from
the source program, never edit them by hand.

> **Fresh clone?** If you see a "cannot find module `./generated/aura_core.js`"
> error, it means the generated files are missing. Run `anchor build` from the
> workspace root, then `npm run generate-idl` to populate `src/generated/`.

---

## Package Format

This package ships compiled ESM JavaScript in `dist/` plus `.d.ts` type
declarations. Node and bundlers execute the emitted `.js`; TypeScript consumers
get a fully typed experience via the `.d.ts` files.

```
packages/sdk-ts/
├─ src/
│   ├─ client.ts       # AuraClient — core instruction flows + account fetching
│   ├─ instructions/   # Domain-organized instruction-builder namespaces
│   ├─ accounts.ts     # Typed account structs for each instruction group
│   ├─ constants.ts    # Program IDs, seeds, IDL, and type aliases
│   ├─ pda.ts          # PDA derivation helpers
│   ├─ bn.ts           # BNish type and toBN helper
│   └─ generated/      # Auto-generated from anchor build (gitignored)
│       ├─ aura_core.json
│       └─ aura_core.ts
├─ tests/
│   ├─ bn.test.ts      # toBN unit tests
│   ├─ pda.test.ts     # PDA derivation unit tests
│   ├─ client.test.ts  # Instruction building and signer guard unit tests
│   ├─ instructions.test.ts # Domain builder coverage for advanced controls
│   └─ devnet.test.ts  # Live devnet integration tests
├─ scripts/
│   ├─ generate-idl.sh   # IDL sync script (bash)
│   └─ generate-idl.ps1  # IDL sync script (PowerShell)
└─ dist/               # Published ESM runtime + type declarations
```

---

## Build from Source

```bash
git clone https://github.com/exyreams/aura.git
cd aura/packages/sdk-ts
npm install
npm run build
```

Run tests:

```bash
# Unit tests — no network required
npm test

# Devnet integration tests — requires funded wallet at ~/.config/solana/id.json
npm run test:devnet
```

---

## Deployed Program

```
aura-core (devnet)
  Program ID:   2fHkM5fb8iLt5ojkubAcLpAjgkF1QL1iEXivKZmPw3ya
  IDL Metadata: 5VNrRefsMBWZdqyqLRcKcrNG2EMnaYwBbQjhJRM59Bji

Ika Encrypt (pre-alpha devnet)
  Program ID:   4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8
  gRPC:         pre-alpha-dev-1.encrypt.ika-network.net:443

Ika dWallet (pre-alpha devnet)
  Program ID:   87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY
  gRPC:         pre-alpha-dev-1.ika.ika-network.net:443
```
