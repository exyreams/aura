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
bun run test:devnet  # builds the SDK (pretest) then runs the suite
```

This package uses **bun** as its package manager (`bun.lock`). Lint/format are
via **biome** (`bun run lint`, `bun run format`).

## Testing guide

Run these from `packages/tests/sdk-ts`.

```bash
bunx biome check --write
bun run typecheck -- --pretty false
bun run test:devnet
```

For the dWallet live flows, run the focused suites directly:

```bash
bun run devnet:wallet-control
bun run devnet:transfer
bun run devnet:usdc-transfer
bun run devnet:dwallet
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
