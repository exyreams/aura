/**
 * Devnet: governance control surface beyond plain multisig setup.
 *
 * Drives the owner/guardian-gated lifecycle instructions, none of which need
 * live Ika signing:
 *   - AI authority rotation: propose -> execute (timelock) / cancel / reject
 *     before the timelock elapses.
 *   - Config change: propose -> execute (timelock) / reject before timelock /
 *     guardian veto then blocked execute.
 *   - Guardian rotation: propose add -> execute (1-of-N).
 *   - emergency override: propose -> collect second guardian signature.
 *   - emergency_shutdown, register_recovery_destination, and break_glass_recover.
 *
 * The program takes `now` as an instruction argument for these governance
 * flows (they are owner/guardian-authenticated, so the timestamp is trusted),
 * which lets a single test satisfy the 24h/48h timelocks by reading the stored
 * `executableAfter` and passing a `now` just past it. Tests that drive a
 * treasury into a terminal state (rotated authority, shutdown) provision their
 * own treasury so they never bleed into one another.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { accounts, instructions } from "@aura-protocol/sdk-ts";
import { Keypair } from "@solana/web3.js";
import BN from "bn.js";
import {
  configureMultisigArgs,
  createTreasuryArgs,
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  nowBN,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

const CHAIN_ETHEREUM = 1;
const EVM_DEAD = "0x000000000000000000000000000000000000dead";
const GUARDIAN_ADD = 0;

test("ai rotation: propose then execute after the timelock", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-airot" });
  const newAi = Keypair.generate().publicKey;
  const proposedAt = nowBN();

  await sendAndConfirm(
    [
      await instructions.governance.proposeAiRotation(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { newAiAuthority: newAi, now: proposedAt },
      }),
    ],
    [],
    "proposeAiRotation",
  );
  let account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.ok(account.pendingAiRotation, "pending rotation should be recorded");
  assert.equal(
    account.pendingAiRotation?.newAiAuthority.toBase58(),
    newAi.toBase58(),
  );

  // Execute just past the stored timelock.
  const executableAfter = new BN(
    account.pendingAiRotation?.executableAfter.toString() ?? "0",
  );
  await sendAndConfirm(
    [
      await instructions.governance.executeAiRotation(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { now: executableAfter.add(new BN(10)) },
      }),
    ],
    [],
    "executeAiRotation",
  );
  account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingAiRotation, null, "rotation should be cleared");
  assert.equal(
    account.aiAuthority.toBase58(),
    newAi.toBase58(),
    "ai authority should be rotated",
  );
});

test("ai rotation: execute before the timelock is rejected", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-airot-early" });
  const now = nowBN();
  await sendAndConfirm(
    [
      await instructions.governance.proposeAiRotation(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { newAiAuthority: Keypair.generate().publicKey, now },
      }),
    ],
    [],
    "proposeAiRotation",
  );
  // Execute immediately (well before executableAfter) -> TimelockNotElapsed.
  const ix = await instructions.governance.executeAiRotation(client, {
    accounts: { owner: t.owner, treasury: t.treasury },
    args: { now: now.add(new BN(60)) },
  });
  await expectSendToFail([ix], "execute rotation before timelock");
});

test("ai rotation: propose then cancel clears the pending rotation", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-airot-cancel" });
  const now = nowBN();
  await sendAndConfirm(
    [
      await instructions.governance.proposeAiRotation(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { newAiAuthority: Keypair.generate().publicKey, now },
      }),
    ],
    [],
    "proposeAiRotation",
  );
  await sendAndConfirm(
    [
      await instructions.governance.cancelAiRotation(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { now: now.add(new BN(5)) },
      }),
    ],
    [],
    "cancelAiRotation",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingAiRotation, null, "rotation should be cleared");
});

test("config change: propose then execute after the timelock bumps the policy version", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-cfg" });
  const before = await accounts.fetchTreasuryAccount(client, t.treasury);
  const versionBefore = before.currentPolicyVersion;

  const changeId = new BN(Date.now());
  const newPolicy = createTreasuryArgs(t.owner, t.agentId).policyConfig;
  newPolicy.dailyLimitUsd = new BN(25_000); // tweak a limit

  await sendAndConfirm(
    [
      await instructions.governance.proposeConfigChange(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { changeId, newPolicyConfig: newPolicy, now: nowBN() },
      }),
    ],
    [],
    "proposeConfigChange",
  );
  let account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.ok(account.pendingConfigChange, "config change should be recorded");
  assert.equal(
    account.pendingConfigChange?.changeId.toString(),
    changeId.toString(),
  );

  const executableAfter = new BN(
    account.pendingConfigChange?.executableAfter.toString() ?? "0",
  );
  await sendAndConfirm(
    [
      await instructions.governance.executeConfigChange(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { changeId, now: executableAfter.add(new BN(10)) },
      }),
    ],
    [],
    "executeConfigChange",
  );
  account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingConfigChange, null, "change should be cleared");
  assert.equal(
    account.currentPolicyVersion,
    versionBefore + 1,
    "policy version should increment",
  );
});

test("config change: execute before the timelock is rejected", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-cfg-early" });
  const changeId = new BN(Date.now() + 1);
  const newPolicy = createTreasuryArgs(t.owner, t.agentId).policyConfig;
  const now = nowBN();
  await sendAndConfirm(
    [
      await instructions.governance.proposeConfigChange(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { changeId, newPolicyConfig: newPolicy, now },
      }),
    ],
    [],
    "proposeConfigChange",
  );
  const ix = await instructions.governance.executeConfigChange(client, {
    accounts: { owner: t.owner, treasury: t.treasury },
    args: { changeId, now: now.add(new BN(60)) },
  });
  await expectSendToFail([ix], "execute config change before timelock");
});

test("config change: a guardian veto blocks execution", { skip }, async () => {
  const t = await provisionTreasury({ prefix: "gov-cfg-veto" });
  // Register the payer as the sole guardian so it can sign the veto.
  await sendAndConfirm(
    [
      await instructions.governance.configureMultisig(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: configureMultisigArgs([t.owner]),
      }),
    ],
    [],
    "configureMultisig",
  );

  const changeId = new BN(Date.now() + 2);
  const newPolicy = createTreasuryArgs(t.owner, t.agentId).policyConfig;
  const now = nowBN();
  await sendAndConfirm(
    [
      await instructions.governance.proposeConfigChange(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { changeId, newPolicyConfig: newPolicy, now },
      }),
    ],
    [],
    "proposeConfigChange",
  );

  await sendAndConfirm(
    [
      await instructions.governance.vetoConfigChange(client, {
        accounts: { guardian: t.owner, treasury: t.treasury },
        args: { changeId, now: now.add(new BN(30)) },
      }),
    ],
    [],
    "vetoConfigChange",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingConfigChange?.vetoed, true, "change is vetoed");

  // Even past the timelock, a vetoed change cannot execute.
  const executableAfter = new BN(
    account.pendingConfigChange?.executableAfter.toString() ?? "0",
  );
  const ix = await instructions.governance.executeConfigChange(client, {
    accounts: { owner: t.owner, treasury: t.treasury },
    args: { changeId, now: executableAfter.add(new BN(10)) },
  });
  await expectSendToFail([ix], "execute vetoed config change");
});

test("guardian rotation: propose add then execute (1-of-N)", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-grot" });
  await sendAndConfirm(
    [
      await instructions.governance.configureMultisig(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: configureMultisigArgs([t.owner]),
      }),
    ],
    [],
    "configureMultisig",
  );

  const newGuardian = Keypair.generate().publicKey;
  const now = nowBN();
  await sendAndConfirm(
    [
      await instructions.governance.proposeGuardianRotation(client, {
        accounts: { guardian: t.owner, treasury: t.treasury },
        args: { action: GUARDIAN_ADD, targetGuardian: newGuardian, now },
      }),
    ],
    [],
    "proposeGuardianRotation",
  );
  await sendAndConfirm(
    [
      await instructions.governance.executeGuardianRotation(client, {
        accounts: { guardian: t.owner, treasury: t.treasury },
        args: { now: now.add(new BN(5)) },
      }),
    ],
    [],
    "executeGuardianRotation",
  );

  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  const guardianKeys = new Set(
    account.multisig?.guardians.map((g) => g.key.toBase58()) ?? [],
  );
  assert.ok(
    guardianKeys.has(newGuardian.toBase58()),
    "new guardian should be registered",
  );
});

test("override proposal: second guardian signature reaches quorum", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-override" });
  const guardianA = Keypair.generate();
  const guardianB = Keypair.generate();
  const newDailyLimitUsd = 77_000;
  await sendAndConfirm(
    [
      await instructions.governance.configureMultisig(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: {
          requiredSignatures: 2,
          guardians: [guardianA.publicKey, guardianB.publicKey],
          guardianWeights: [1, 1],
          requiredApprovalWeight: 2,
          timestamp: nowBN(),
        },
      }),
    ],
    [],
    "configureMultisig",
  );

  const proposedAt = nowBN();
  await sendAndConfirm(
    [
      await instructions.governance.proposeOverride(client, {
        accounts: { guardian: guardianA.publicKey, treasury: t.treasury },
        args: { newDailyLimitUsd: new BN(newDailyLimitUsd), now: proposedAt },
      }),
    ],
    [guardianA],
    "proposeOverride",
  );
  let account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.ok(account.multisig?.pendingOverride, "override should be pending");
  assert.equal(
    account.multisig?.pendingOverride?.signaturesCollected.length,
    1,
  );

  await sendAndConfirm(
    [
      await instructions.governance.collectOverrideSignature(client, {
        accounts: { guardian: guardianB.publicKey, treasury: t.treasury },
        args: { now: proposedAt.add(new BN(30)) },
      }),
    ],
    [guardianB],
    "collectOverrideSignature",
  );
  account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(
    account.policyConfig.dailyLimitUsd.toString(),
    String(newDailyLimitUsd),
    "override should update the daily limit",
  );
  assert.equal(
    account.multisig?.pendingOverride,
    null,
    "pending override should be consumed at quorum",
  );
});

test("emergency_shutdown pauses execution and records recovery state", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-shutdown" });
  const recovery = Keypair.generate().publicKey;
  await sendAndConfirm(
    [
      await instructions.governance.emergencyShutdown(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { recoveryPubkey: recovery, now: nowBN() },
      }),
    ],
    [],
    "emergencyShutdown",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.executionPaused, true, "execution should be paused");
  assert.ok(account.shutdownInitiatedAt, "shutdown timestamp should be set");
  assert.equal(
    account.shutdownRecoveryPubkey?.toBase58(),
    recovery.toBase58(),
    "recovery pubkey should be recorded",
  );
});

test("register_recovery_destination stores a per-chain cold wallet", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-recovery" });
  await sendAndConfirm(
    [
      await instructions.governance.registerRecoveryDestination(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { chain: CHAIN_ETHEREUM, address: EVM_DEAD, now: nowBN() },
      }),
    ],
    [],
    "registerRecoveryDestination",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  const dest = account.recoveryDestinations.find(
    (d) => d.chain === CHAIN_ETHEREUM,
  );
  assert.ok(dest, "recovery destination should be registered");
  assert.equal(dest.address, EVM_DEAD);
});

test("break_glass_recover opens a recovery proposal after shutdown delay", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-breakglass" });
  await sendAndConfirm(
    [
      await instructions.governance.registerRecoveryDestination(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { chain: CHAIN_ETHEREUM, address: EVM_DEAD, now: nowBN() },
      }),
    ],
    [],
    "registerRecoveryDestination",
  );
  const shutdownAt = nowBN();
  await sendAndConfirm(
    [
      await instructions.governance.emergencyShutdown(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: {
          recoveryPubkey: Keypair.generate().publicKey,
          now: shutdownAt,
        },
      }),
    ],
    [],
    "emergencyShutdown",
  );

  await sendAndConfirm(
    [
      await instructions.governance.breakGlassRecover(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: {
          chain: CHAIN_ETHEREUM,
          amountUsd: new BN(123),
          now: shutdownAt.add(new BN(3_601)),
        },
      }),
    ],
    [],
    "breakGlassRecover",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  const pending = account.pendingQueue.at(-1);
  assert.ok(pending, "break-glass proposal should be queued");
  assert.equal(pending.amountUsd.toString(), "123");
  assert.equal(pending.recipientOrContract, EVM_DEAD);
});
