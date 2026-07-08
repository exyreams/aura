![AURA banner](https://raw.githubusercontent.com/exyreams/aura/refs/heads/main/packages/web/public/banner.png)

# @aura-protocol/sdk-ts

TypeScript SDK for AURA, the Solana-native execution-control layer for
agentic finance.

The SDK is generated from the current Anchor IDL and organized as a production-shaped protocol SDK:

- small `AuraClient` for RPC, Anchor program access, decoding, and transaction sending
- domain instruction modules under `instructions.<domain>`
- typed account fetchers under the flat `accounts.fetch*` namespace
- PDA derivation helpers
- generated error and event utilities
- runtime instruction metadata for required/optional accounts

> Program status: AURA currently targets devnet/pre-audit deployments. The SDK
> is typed and complete for the current IDL, but do not use devnet examples to
> custody production funds before a stable audited release.

## Install

```bash
npm install @aura-protocol/sdk-ts @solana/web3.js bn.js
```

## Create A Treasury

```ts
import BN from "bn.js";
import { Connection, Keypair } from "@solana/web3.js";
import {
  AuraClient,
  accounts,
  instructions,
  type CreateTreasuryArgs,
} from "@aura-protocol/sdk-ts";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const client = new AuraClient({ connection });
const owner = Keypair.generate();

const args: CreateTreasuryArgs = {
  agentId: "agent-1",
  aiAuthority: owner.publicKey,
  createdAt: new BN(Math.floor(Date.now() / 1000)),
  pendingTransactionTtlSecs: new BN(900),
  policyConfig,
  protocolFees,
};

const { treasury, input } = accounts.createTreasuryInput({
  owner: owner.publicKey,
  args,
});

const instruction = await instructions.treasury.createTreasury(client, input);
const signature = await client.sendInstructions(owner, [instruction]);
```

## Instruction Pattern

Every instruction builder accepts one named input object:

```ts
const ix = await instructions.execution.abandonProposal(client, {
  accounts: {
    operator,
    treasury,
    dwalletState: null,
  },
  args: {
    proposalId,
    now,
  },
});
```

Single args-struct instructions expose the product args directly:

```ts
await instructions.treasury.createTreasury(client, {
  accounts: { owner, treasury, systemProgram },
  args: createTreasuryArgs,
});
```

Send helpers are available for every builder:

```ts
await instructions.treasury.sendCreateTreasury(client, ownerSigner, input);
```

## Discover Required Accounts

```ts
import { instructions } from "@aura-protocol/sdk-ts";

const required = instructions.listRequiredInstructionAccounts("createTreasury");
const optional = instructions.listOptionalInstructionAccounts("abandonProposal");
const definition = instructions.requireInstructionDefinition("proposeTransaction");
```

Each account definition includes `propertyName`, `signer`, `writable`, and `optional`.

## Imports

```ts
import { AuraClient, accounts, instructions, deriveTreasuryAddress } from "@aura-protocol/sdk-ts";
import { treasury, execution } from "@aura-protocol/sdk-ts/instructions";
import { parseAuraError, AuraErrorCode } from "@aura-protocol/sdk-ts/errors";
import { EventDiscriminator, parseAuraEvents } from "@aura-protocol/sdk-ts/events";
```

## Coverage

Current generated surface:

- 161 instructions
- 32 accounts
- 140 program errors
- 4 events

The SDK test workspace verifies that every IDL instruction has a reachable
domain builder and devnet reference.

## Build & Test

```bash
npm run build      # tsc -> dist/
npm run typecheck  # type-check src + generated surfaces without emitting
npm run lint       # biome check (lint + format + import order)
npm run format     # biome format --write
```

The SDK package is kept focused on generated source, type-checking, and
publishing. Tests live in `packages/tests/sdk-ts`:

- `unit/` — offline, deterministic. Builds and verifies every IDL
  instruction through its generated builder, plus PDAs, account fetchers,
  errors, events, validation, constants, and the program-surface catalog.
- `devnet/` — real devnet integration per domain. Skips automatically unless a
  funded payer keypair is found.
- `live-scenarios/` — opt-in, token-moving devnet scenarios that exercise real
  wallet, policy, and dWallet flows.
- `support/` — shared helpers for offline clients, IDL-driven fixtures, devnet
  harnesses, Ika clients, and live-token discovery.

From `packages/tests/sdk-ts`:

```bash
bun run test
bun run typecheck -- --pretty false
bun run test:devnet:coverage
```

## IDL & Codegen

The generated IDL files live under `src/generated`. Regenerate after an Anchor
build, then rebuild the domain modules and program-surface catalog:

```bash
npm run generate-idl     # copy aura_core.{json,ts} from the Anchor build
# or on Windows
npm run generate-idl:win

npm run generate-sdk     # regenerate instruction/account/error/event modules,
                         # program-surface.ts, then format with Biome
```

`generate-sdk` maps every IDL instruction to a domain via a complete, explicit
table and fails loudly if the program adds an instruction that is not yet
mapped, so the generated surface can never silently misfile a new instruction.
