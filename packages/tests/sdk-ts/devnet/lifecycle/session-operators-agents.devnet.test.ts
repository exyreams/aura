/**
 * Devnet: session keys, operator roles, agent registry, capabilities,
 * tripwires, migration, and the dead-man's-switch reject path.
 *
 * Agent/capability/tripwire/ownership instructions bind the trust-identity PDA,
 * so it is initialized in `before`. executeOwnershipHandover is omitted (it
 * needs a live dWallet CPI). Skips when no funded payer.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveOperatorRoleAddress,
  deriveSessionKeyAddress,
  deriveTrustIdentityAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  nowBN,
  type ProvisionedTreasury,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

let t: ProvisionedTreasury;
let trustIdentity: ReturnType<typeof deriveTrustIdentityAddress>[0];

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "lifecycle" });
  [trustIdentity] = deriveTrustIdentityAddress(t.treasury);
  await sendAndConfirm(
    [
      await instructions.policy.initTrustIdentity(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          trustIdentity,
          systemProgram: SystemProgram.programId,
        },
        args: { now: nowBN() },
      }),
    ],
    [],
    "initTrustIdentity",
  );
});

test("session key: issue, update, revoke (+ update-after-revoke reject), close", {
  skip,
}, async () => {
  const sessionKey = Keypair.generate().publicKey;
  const [sessionKeyAccount] = deriveSessionKeyAddress(t.treasury, sessionKey);

  await sendAndConfirm(
    [
      await instructions.lifecycle.issueSessionKey(client, {
        accounts: {
          authority: t.owner,
          treasury: t.treasury,
          sessionKeyAccount,
          systemProgram: SystemProgram.programId,
        },
        args: {
          sessionKey,
          durationSecs: new BN(86_400),
          maxAmountUsdPerTx: null,
          maxDailySpendUsd: null,
          allowedChains: Buffer.from([1, 2]),
          allowedTxTypes: Buffer.from([0]),
          maxProposalCount: null,
          now: nowBN(),
        },
      }),
    ],
    [],
    "issueSessionKey",
  );
  let session = await accounts.fetchSessionKeyAccount(client, sessionKeyAccount);
  assert.equal(session.revoked, false);
  assert.equal(session.issuedBy.toBase58(), t.owner.toBase58());
  assert.equal(session.sessionSpentTodayUsd.toString(), "0");
  assert.equal(session.proposalsSubmitted, 0);
  const expiryBefore = session.expiresAt.toString();

  await sendAndConfirm(
    [
      await instructions.lifecycle.updateSessionKey(client, {
        accounts: {
          authority: t.owner,
          treasury: t.treasury,
          sessionKeyAccount,
        },
        args: {
          extendDurationSecs: new BN(3_600),
          maxAmountUsdPerTx: new BN(250),
          maxDailySpendUsd: new BN(1_000),
          allowedChains: Buffer.from([2]),
          allowedTxTypes: Buffer.from([1]),
          maxProposalCount: 3,
          now: nowBN(),
        },
      }),
    ],
    [],
    "updateSessionKey",
  );
  session = await accounts.fetchSessionKeyAccount(client, sessionKeyAccount);
  assert.notEqual(session.expiresAt.toString(), expiryBefore, "expiry extended");
  assert.equal(session.maxAmountUsdPerTx?.toString(), "250");
  assert.equal(session.maxDailySpendUsd?.toString(), "1000");
  assert.deepEqual([...session.allowedChains], [2]);
  assert.deepEqual([...session.allowedTxTypes], [1]);
  assert.equal(session.maxProposalCount, 3);

  await sendAndConfirm(
    [
      await instructions.lifecycle.updateSessionKey(client, {
        accounts: {
          authority: t.owner,
          treasury: t.treasury,
          sessionKeyAccount,
        },
        args: {
          extendDurationSecs: null,
          maxAmountUsdPerTx: null,
          maxDailySpendUsd: null,
          allowedChains: null,
          allowedTxTypes: null,
          maxProposalCount: null,
          now: nowBN(),
        },
      }),
    ],
    [],
    "updateSessionKey(unchanged)",
  );
  session = await accounts.fetchSessionKeyAccount(client, sessionKeyAccount);
  assert.equal(session.maxAmountUsdPerTx?.toString(), "250");
  assert.equal(session.maxDailySpendUsd?.toString(), "1000");
  assert.deepEqual([...session.allowedChains], [2]);
  assert.deepEqual([...session.allowedTxTypes], [1]);
  assert.equal(session.maxProposalCount, 3);

  await sendAndConfirm(
    [
      await instructions.lifecycle.revokeSessionKey(client, {
        accounts: {
          authority: t.owner,
          treasury: t.treasury,
          sessionKeyAccount,
        },
        args: { now: nowBN() },
      }),
    ],
    [],
    "revokeSessionKey",
  );
  session = await accounts.fetchSessionKeyAccount(client, sessionKeyAccount);
  assert.equal(session.revoked, true);

  // updating a revoked key reverts
  const badUpdate = await instructions.lifecycle.updateSessionKey(client, {
    accounts: { authority: t.owner, treasury: t.treasury, sessionKeyAccount },
    args: {
      extendDurationSecs: new BN(10),
      maxAmountUsdPerTx: null,
      maxDailySpendUsd: null,
      allowedChains: null,
      allowedTxTypes: null,
      maxProposalCount: null,
      now: nowBN(),
    },
  });
  await expectSendToFail([badUpdate], "update revoked session key");

  await sendAndConfirm(
    [
      await instructions.lifecycle.closeSessionKey(client, {
        accounts: {
          authority: t.owner,
          treasury: t.treasury,
          sessionKeyAccount,
        },
      }),
    ],
    [],
    "closeSessionKey",
  );
  assert.equal(
    await accounts.fetchSessionKeyAccountNullable(client, sessionKeyAccount),
    null,
    "closed session key should be gone",
  );
});

test("operator role: grant (+ past-expiry reject), update, revoke", {
  skip,
}, async () => {
  const operator = Keypair.generate().publicKey;
  const [operatorRole] = deriveOperatorRoleAddress(t.treasury, operator);
  const now = nowBN();

  // grant with a past expiry reverts
  const pastExpiry = await instructions.lifecycle.grantOperatorRole(client, {
    accounts: {
      owner: t.owner,
      operator,
      treasury: t.treasury,
      operatorRole,
      systemProgram: SystemProgram.programId,
    },
    args: {
      permissionMask: new BN(0b110),
      expiresAt: now.sub(new BN(10)),
      now,
    },
  });
  await expectSendToFail([pastExpiry], "grant with past expiry");

  await sendAndConfirm(
    [
      await instructions.lifecycle.grantOperatorRole(client, {
        accounts: {
          owner: t.owner,
          operator,
          treasury: t.treasury,
          operatorRole,
          systemProgram: SystemProgram.programId,
        },
        args: {
          permissionMask: new BN(0b110),
          expiresAt: now.add(new BN(86_400)),
          now,
        },
      }),
    ],
    [],
    "grantOperatorRole",
  );
  let role = await accounts.fetchOperatorRoleAccount(client, operatorRole);
  assert.equal(role.permissionMask.toString(), "6");
  assert.equal(role.revoked, false);

  await sendAndConfirm(
    [
      await instructions.lifecycle.updateOperatorRole(client, {
        accounts: { owner: t.owner, treasury: t.treasury, operatorRole },
        args: {
          permissionMask: new BN(0b1110),
          expiresAt: now.add(new BN(172_800)),
          now,
        },
      }),
    ],
    [],
    "updateOperatorRole",
  );
  role = await accounts.fetchOperatorRoleAccount(client, operatorRole);
  assert.equal(role.permissionMask.toString(), "14");

  await sendAndConfirm(
    [
      await instructions.lifecycle.revokeOperatorRole(client, {
        accounts: { owner: t.owner, treasury: t.treasury, operatorRole },
        args: { now },
      }),
    ],
    [],
    "revokeOperatorRole",
  );
  role = await accounts.fetchOperatorRoleAccount(client, operatorRole);
  assert.equal(role.revoked, true);

  const updateRevoked = await instructions.lifecycle.updateOperatorRole(client, {
    accounts: { owner: t.owner, treasury: t.treasury, operatorRole },
    args: {
      permissionMask: new BN(0b1),
      expiresAt: now.add(new BN(259_200)),
      now,
    },
  });
  await expectSendToFail([updateRevoked], "update revoked operator role");
});

test("agent registry: register, capability, arm-loosen, revoke (+ reject paths)", {
  skip,
}, async () => {
  const agentKey = Keypair.generate().publicKey;
  const now = nowBN();

  await sendAndConfirm(
    [
      await instructions.lifecycle.registerAgent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          key: agentKey,
          label: "worker-agent",
          allowedChains: Buffer.from([1, 2]),
          allowedTxTypes: Buffer.from([0, 1]),
          dailyLimitUsd: new BN(5_000),
          now,
        },
      }),
    ],
    [],
    "registerAgent",
  );
  let ti = await accounts.fetchTrustIdentityAccount(client, trustIdentity);
  assert.ok(
    ti.agents.some((a) => a.key.toBase58() === agentKey.toBase58()),
    "agent registered",
  );

  // duplicate registration reverts
  const dup = await instructions.lifecycle.registerAgent(client, {
    accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
    args: {
      key: agentKey,
      label: "dup",
      allowedChains: Buffer.from([1]),
      allowedTxTypes: Buffer.from([0]),
      dailyLimitUsd: null,
      now,
    },
  });
  await expectSendToFail([dup], "duplicate agent");

  // tighten capability (immediate)
  await sendAndConfirm(
    [
      await instructions.lifecycle.setAgentCapability(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          key: agentKey,
          allowedChains: Buffer.from([1]),
          allowedTxTypes: Buffer.from([0]),
          dailyLimitUsd: new BN(1_000),
          allowedProtocols: new BN(0),
          allowedInstructions: 0,
          perTxLimitUsd: null,
          recipientList: null,
          allowedAssets: null,
          activeWindowStart: null,
          activeWindowEnd: null,
          now,
        },
      }),
    ],
    [],
    "setAgentCapability(tighten)",
  );

  // arm the loosen timelock
  await sendAndConfirm(
    [
      await instructions.lifecycle.armCapabilityLoosen(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: { key: agentKey, now },
      }),
    ],
    [],
    "armCapabilityLoosen",
  );
  ti = await accounts.fetchTrustIdentityAccount(client, trustIdentity);
  let agent = ti.agents.find((a) => a.key.toBase58() === agentKey.toBase58());
  assert.equal(
    agent?.loosenUnlockAt.toString(),
    now.add(new BN(172_800)).toString(),
  );

  const loosenEarly = await instructions.lifecycle.setAgentCapability(client, {
    accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
    args: {
      key: agentKey,
      allowedChains: Buffer.from([1, 2]),
      allowedTxTypes: Buffer.from([0, 1]),
      dailyLimitUsd: new BN(2_000),
      allowedProtocols: new BN(1),
      allowedInstructions: 1,
      perTxLimitUsd: new BN(500),
      recipientList: null,
      allowedAssets: null,
      activeWindowStart: null,
      activeWindowEnd: null,
      now,
    },
  });
  await expectSendToFail([loosenEarly], "loosen before capability timelock");

  await sendAndConfirm(
    [
      await instructions.lifecycle.setAgentCapability(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          key: agentKey,
          allowedChains: Buffer.from([1, 2]),
          allowedTxTypes: Buffer.from([0, 1]),
          dailyLimitUsd: new BN(2_000),
          allowedProtocols: new BN(1),
          allowedInstructions: 1,
          perTxLimitUsd: new BN(500),
          recipientList: null,
          allowedAssets: null,
          activeWindowStart: null,
          activeWindowEnd: null,
          now: now.add(new BN(172_800)),
        },
      }),
    ],
    [],
    "setAgentCapability(loosen)",
  );
  ti = await accounts.fetchTrustIdentityAccount(client, trustIdentity);
  agent = ti.agents.find((a) => a.key.toBase58() === agentKey.toBase58());
  assert.equal(agent?.scope.dailyLimitUsd?.toString(), "2000");
  assert.equal(agent?.scope.allowedProtocols.toString(), "1");
  assert.equal(agent?.scope.allowedInstructions, 1);
  assert.equal(agent?.scope.perTxLimitUsd?.toString(), "500");
  assert.equal(agent?.loosenUnlockAt.toString(), "0");

  // capability on an unknown agent reverts
  const unknown = await instructions.lifecycle.setAgentCapability(client, {
    accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
    args: {
      key: Keypair.generate().publicKey,
      allowedChains: Buffer.from([1]),
      allowedTxTypes: Buffer.from([0]),
      dailyLimitUsd: null,
      allowedProtocols: new BN(0),
      allowedInstructions: 0,
      perTxLimitUsd: null,
      recipientList: null,
      allowedAssets: null,
      activeWindowStart: null,
      activeWindowEnd: null,
      now,
    },
  });
  await expectSendToFail([unknown], "capability on unknown agent");

  // emergency revoke works in a single-signer run through the owner path
  await sendAndConfirm(
    [
      await instructions.lifecycle.emergencyRevokeAgent(client, {
        accounts: { caller: t.owner, treasury: t.treasury, trustIdentity },
        args: { key: agentKey, now },
      }),
    ],
    [],
    "emergencyRevokeAgent(owner)",
  );
  ti = await accounts.fetchTrustIdentityAccount(client, trustIdentity);
  agent = ti.agents.find((a) => a.key.toBase58() === agentKey.toBase58());
  assert.equal(agent?.enabled, false, "agent disabled");

  const ownerRevokedKey = Keypair.generate().publicKey;
  await sendAndConfirm(
    [
      await instructions.lifecycle.registerAgent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          key: ownerRevokedKey,
          label: "owner-revoke",
          allowedChains: Buffer.from([1]),
          allowedTxTypes: Buffer.from([0]),
          dailyLimitUsd: null,
          now,
        },
      }),
    ],
    [],
    "registerAgent(owner-revoke)",
  );
  await sendAndConfirm(
    [
      await instructions.lifecycle.revokeAgent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: { key: ownerRevokedKey, now },
      }),
    ],
    [],
    "revokeAgent",
  );
  ti = await accounts.fetchTrustIdentityAccount(client, trustIdentity);
  const ownerRevokedAgent = ti.agents.find(
    (a) => a.key.toBase58() === ownerRevokedKey.toBase58(),
  );
  assert.equal(ownerRevokedAgent?.enabled, false, "owner revoke disables agent");

  // revoking an unknown key reverts
  const revokeUnknown = await instructions.lifecycle.revokeAgent(client, {
    accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
    args: { key: Keypair.generate().publicKey, now },
  });
  await expectSendToFail([revokeUnknown], "revoke unknown agent");
});

test("set_agent_tripwires validates weights", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.lifecycle.setAgentTripwires(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          policyDenialWeight: 100,
          anomalyWeight: 80,
          failOpenAbuseWeight: 120,
          approvalMissWeight: 60,
          now: nowBN(),
        },
      }),
    ],
    [],
    "setAgentTripwires",
  );

  // a zero weight is invalid (all weights must be non-zero)
  const bad = await instructions.lifecycle.setAgentTripwires(client, {
    accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
    args: {
      policyDenialWeight: 0,
      anomalyWeight: 80,
      failOpenAbuseWeight: 120,
      approvalMissWeight: 60,
      now: nowBN(),
    },
  });
  await expectSendToFail([bad], "zero tripwire weight");
});

test("nominate_successor_owner records a pending handover", { skip }, async () => {
  const successor = Keypair.generate().publicKey;
  await sendAndConfirm(
    [
      await instructions.lifecycle.nominateSuccessorOwner(client, {
        accounts: { caller: t.owner, treasury: t.treasury, trustIdentity },
        args: { newOwner: successor, now: nowBN() },
      }),
    ],
    [],
    "nominateSuccessorOwner",
  );
  const ti = await accounts.fetchTrustIdentityAccount(client, trustIdentity);
  assert.equal(
    ti.pendingOwnershipHandover?.successorOwner.toBase58(),
    successor.toBase58(),
  );
  assert.ok(
    ti.pendingOwnershipHandover !== null,
    "pending handover recorded",
  );
});

test("migrate_treasury keeps the schema at the current version", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.lifecycle.migrateTreasury(client, {
        accounts: {
          treasury: t.treasury,
          payer: t.owner,
          systemProgram: SystemProgram.programId,
        },
      }),
    ],
    [],
    "migrateTreasury",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.schemaVersion, 5);
});

test("trigger_dead_mans_switch reverts when unconfigured", { skip }, async () => {
  // No instruction configures the dead-man's switch, so the domain call always
  // returns NoPendingTransaction.
  const ix = await instructions.lifecycle.triggerDeadMansSwitch(client, {
    accounts: { treasury: t.treasury },
    args: { now: nowBN() },
  });
  await expectSendToFail([ix], "trigger unconfigured dead-mans switch");
});
