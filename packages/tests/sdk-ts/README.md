# @aura-protocol/sdk-ts-tests

Live **devnet** integration tests for `@aura-protocol/sdk-ts`. This package is
private (never published) and depends on the SDK as a local `file:` dependency,
so the suite exercises the **published package surface** (its `exports` map and
built `dist/`) rather than internal source — catching packaging and export
regressions the in-package unit suite can't see.

The fast, offline unit suite (1400+ tests) stays in `packages/sdk-ts/tests/unit`
and imports local source for instant iteration. This package is the slow,
network-bound counterpart.

## Running

```bash
bun install          # first time, from this directory
bun run test:devnet:coverage
bun run devnet:treasury-admin
```

This package uses **bun** as its package manager (`bun.lock`). Lint/format are
via **biome** (`bun run lint`, `bun run format`).

## Testing guide

Run these from `packages/tests/sdk-ts`.

```bash
bunx biome check --write
bun run typecheck -- --pretty false
bun run test:devnet:coverage
```

`bun run test:devnet:coverage` is a no-RPC coverage map. It fails if any
generated SDK instruction method is not referenced by `devnet/**/*.ts`.

Run focused live-devnet files one at a time to avoid public RPC rate limits.
`bun run test:devnet` still exists for rare exhaustive sweeps, but it runs every
devnet file serially and is not the recommended day-to-day command.

Live scenario suites are separate from `devnet/` and must be explicitly opted
in. They move real devnet test tokens through wallet, policy, and dWallet flows:

```bash
bun run live-scenarios:discover
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:direct-transfer
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:fund-dwallet
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:policy-transfer
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:policy-violations
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:circuit-breakers
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:payroll
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:agent-swap
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:velocity
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:session-keys
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:operator-roles
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:agent-capability
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:address-lists
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:guardian-governance
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:budget-exposure
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:approval-receipts
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:scheduled-intents
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:conditional-triggers
AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:guardian-quorum
```

Focused live-devnet commands:

```bash
bun run devnet:budget-envelopes-and-groups
bun run devnet:chain-profiles
bun run devnet:confidential-external-cpi-boundaries
bun run devnet:dwallet-balances
bun run devnet:dwallet-lifecycle
bun run devnet:dwallet-oracle-feeds
bun run devnet:dwallet-registration
bun run devnet:dwallet-spend
bun run devnet:wallet-control
bun run devnet:transfer
bun run devnet:usdc-transfer
bun run devnet:execution-proposals
bun run devnet:execution-scenario-matrix
bun run devnet:execution-scheduled-intents
bun run devnet:execution-triggers
bun run devnet:fees-billing
bun run devnet:fees-schedule
bun run devnet:fees-vault
bun run devnet:governance-controls
bun run devnet:governance-multisig
bun run devnet:governance-timelock-boundaries
bun run devnet:lifecycle-protocol-config
bun run devnet:lifecycle-scenario-matrix
bun run devnet:lifecycle-session-operators-agents
bun run devnet:operational-sidecars-and-policy
bun run devnet:policy-address-lists
bun run devnet:policy-limits
bun run devnet:policy-management
bun run devnet:policy-templates
bun run devnet:swarm-pool-lifecycle
bun run devnet:swarm-pools
bun run devnet:treasury-admin
bun run devnet:treasury-scenario-matrix
bun run devnet:treasury-lifecycle
```

Useful env overrides:
- `PAYER_KEYPAIR` or `AURA_WALLET_PATH` for the devnet payer.
- `AURA_DEVNET_RPC_URL` or `SOLANA_RPC_URL` for the cluster RPC.
- `AURA_IKA_DWALLET_FILE` to point at a fresh cached dWallet session.
- `AURA_TEST_USDC_MINT`, `AURA_TEST_USDC_DESTINATION`, and
  `AURA_TEST_USDC_AMOUNT` for the live USDC transfer test.

Requirements:
- A funded devnet keypair at `~/.config/solana/id.json` (override with
  `PAYER_KEYPAIR` / `AURA_WALLET_PATH`). When absent, every suite **skips**.
- RPC defaults to the public devnet endpoint. Override with
  `AURA_DEVNET_RPC_URL` / `SOLANA_RPC_URL` (any provider) or set `HELIUS_API_KEY`
  to use Helius. No keys are committed to source.

`pretest:devnet` rebuilds the SDK so the `file:` dependency resolves fresh
`dist/`. The runner is serial (`--test-concurrency=1`) so transactions against a
single payer don't race on blockhash/nonce.

## Layout

One directory per on-chain instruction domain (matching the SDK's
`instructions.*` namespaces). File names describe the behavior slice under test.

```
support/
  fixtures.ts          IDL-driven argument builders (self-contained)
  devnet.ts            harness: RPC, signing, polling confirmation, provisioning
  ika/                 Encrypt + dWallet gRPC wrappers + flow (Ika-gated suites)

live-scenarios/        opt-in token-moving scenario tests; never run by test:devnet
treasury/              create, config-update, metadata, analytics, close
lifecycle/             agent-state, roles, sessions, chain-profile, ownership
execution/             propose, cancel/abandon/resubmit, approve, execute-pending,
                       scheduled-intents, conditional, try-trigger
policy/                presets-templates, simulation, receipts-history, attestations,
                       canary, trust-identity
policy-enforcement/    limits, pause-scope, address-lists, approval-ladder
governance/            multisig, guardian-override, ai-rotation, config-timelock
budget/                envelopes-crud, exposure-groups, liveness
dwallet/               registration + balances (on-chain), settlement/sign (Ika)
fees/                  vault, schedules, billing
operational/           pause-liveness, health, snapshots, external-liveness
swarm/                 pools, shared-spend
address-lists/         crud, clear/close
batch/                 batch-propose, batch-eval
confidential/          scalar + vector guardrails, propose-confidential, decrypt (Ika)
```

## Notes

- **Enforcement is not always a revert.** Limit/velocity/slippage violations do
  not revert — `propose_transaction` records a denied decision on the pending
  proposal (`pending.decision.approved === false` plus a `violation` code), so
  assert on recorded state. Account-gated checks (deny/allow list, sanctions,
  paused, cooldown, budget, exposure, parent, session, trust) hard-revert, so
  assert with `expectSendToFail`.
- **Ika-gated suites** (confidential proposals, the execute → sign → finalize
  settlement path) need the Encrypt gRPC (FHE ciphertexts) and dWallet gRPC (MPC
  co-sign). Add `@ika.xyz/pre-alpha-solana-client` and
  `@encrypt.xyz/pre-alpha-solana-client` as devDependencies and port the flow
  from `packages/cli/src/lib/{ika,protocol}.ts` into `support/ika/`.
- **Instruction coverage is SDK-surface coverage.** The coverage script checks
  that all generated SDK instruction builders are exercised from devnet tests.
  Some dWallet/Encrypt-bound instructions are covered through real devnet
  expected-failure paths at the external-account/CPI boundary; full happy paths
  still require live dWallet and Encrypt fixtures.
