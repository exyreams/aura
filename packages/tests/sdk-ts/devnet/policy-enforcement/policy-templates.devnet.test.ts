/**
 * Devnet: reusable policy templates, history ring, trust envelope, and canary.
 *
 *   - policy template lifecycle: create (forking a preset) -> update -> apply
 *     to a treasury -> parameterized apply -> close.
 *   - policy history: init -> record snapshot -> rollback -> close.
 *   - trust identity: init -> configure -> restore (no-op while Trusted).
 *   - canary: start a candidate -> discard it (the promote path needs live
 *     shadow-sample traffic, so it's out of scope for a single run).
 *
 * Policy templates are OWNER-scoped (PDA = [b"policy_template", owner, id]),
 * so we use time-based template ids to avoid collisions across runs.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  derivePolicyCanaryAddress,
  derivePolicyHistoryAddress,
  derivePolicyTemplateAddress,
  deriveTrustIdentityAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  createTreasuryArgs,
  DEVNET_AVAILABLE,
  devnetClient,
  nowBN,
  type ProvisionedTreasury,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

const PRESET_AI_AGENT_OPS = 2;
const TRUST_TIER_TRUSTED = 0;

let t: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "pol-tmpl", activate: true });
});

test("policy template: create, update, apply, close", { skip }, async () => {
  const templateId = Date.now();
  const [policyTemplate] = derivePolicyTemplateAddress(t.owner, templateId);

  // create by forking a built-in preset
  await sendAndConfirm(
    [
      await instructions.policy.createPolicyTemplate(client, {
        accounts: {
          owner: t.owner,
          policyTemplate,
          systemProgram: SystemProgram.programId,
        },
        args: {
          templateId: new BN(templateId),
          name: "ops-template",
          description: "forked from AiAgentOps",
          shared: false,
          sourcePreset: PRESET_AI_AGENT_OPS,
          config: null,
          now: nowBN(),
        },
      }),
    ],
    [],
    "createPolicyTemplate",
  );
  let template = await accounts.fetchPolicyTemplate(client, policyTemplate);
  assert.equal(template.version, 1);
  assert.equal(template.appliedCount.toString(), "0");

  // update bumps the version
  await sendAndConfirm(
    [
      await instructions.policy.updatePolicyTemplate(client, {
        accounts: { owner: t.owner, policyTemplate },
        args: {
          name: "ops-template-v2",
          description: "tweaked",
          shared: true,
          config: createTreasuryArgs(t.owner, t.agentId).policyConfig,
          now: nowBN(),
        },
      }),
    ],
    [],
    "updatePolicyTemplate",
  );
  template = await accounts.fetchPolicyTemplate(client, policyTemplate);
  assert.equal(template.version, 2);
  assert.equal(template.shared, true);

  // apply to the treasury
  const before = await accounts.fetchTreasuryAccount(client, t.treasury);
  await sendAndConfirm(
    [
      await instructions.policy.applyPolicyTemplate(client, {
        accounts: { owner: t.owner, treasury: t.treasury, policyTemplate },
        args: { now: nowBN() },
      }),
    ],
    [],
    "applyPolicyTemplate",
  );
  const after = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(
    after.currentPolicyVersion,
    before.currentPolicyVersion + 1,
    "applying a template bumps the policy version",
  );
  template = await accounts.fetchPolicyTemplate(client, policyTemplate);
  assert.equal(
    template.appliedCount.toString(),
    "1",
    "applied counter increments",
  );

  // apply again with parameterized overrides
  const beforeParameterized = await accounts.fetchTreasuryAccount(
    client,
    t.treasury,
  );
  await sendAndConfirm(
    [
      await instructions.policy.applyPolicyTemplateParameterized(client, {
        accounts: { owner: t.owner, treasury: t.treasury, policyTemplate },
        args: {
          overrides: {
            scaleBps: new BN(10_000),
            dailyLimitUsd: new BN(42_000),
            perTxLimitUsd: new BN(4_200),
          },
          now: nowBN(),
        },
      }),
    ],
    [],
    "applyPolicyTemplateParameterized",
  );
  const afterParameterized = await accounts.fetchTreasuryAccount(
    client,
    t.treasury,
  );
  assert.equal(
    afterParameterized.currentPolicyVersion,
    beforeParameterized.currentPolicyVersion + 1,
    "parameterized apply bumps the policy version",
  );
  assert.equal(
    afterParameterized.policyConfig.dailyLimitUsd.toString(),
    "42000",
  );
  assert.equal(
    afterParameterized.policyConfig.perTxLimitUsd.toString(),
    "4200",
  );
  template = await accounts.fetchPolicyTemplate(client, policyTemplate);
  assert.equal(
    template.appliedCount.toString(),
    "2",
    "parameterized apply increments the template counter",
  );

  // close
  await sendAndConfirm(
    [
      await instructions.policy.closePolicyTemplate(client, {
        accounts: { owner: t.owner, policyTemplate },
      }),
    ],
    [],
    "closePolicyTemplate",
  );
  assert.equal(
    await accounts.fetchPolicyTemplateNullable(client, policyTemplate),
    null,
    "closed template account should be gone",
  );
});

test("policy history: init, record a snapshot, close", { skip }, async () => {
  const [policyHistory] = derivePolicyHistoryAddress(t.treasury);
  await sendAndConfirm(
    [
      await instructions.policy.initPolicyHistory(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          policyHistory,
          systemProgram: SystemProgram.programId,
        },
      }),
    ],
    [],
    "initPolicyHistory",
  );
  await sendAndConfirm(
    [
      await instructions.policy.recordPolicySnapshot(client, {
        accounts: { owner: t.owner, treasury: t.treasury, policyHistory },
        args: { now: nowBN() },
      }),
    ],
    [],
    "recordPolicySnapshot",
  );
  const history = await accounts.fetchPolicyHistoryAccount(
    client,
    policyHistory,
  );
  assert.ok(history.versionCount >= 1, "snapshot should be recorded");
  const snapshot = history.snapshots.at(-1);
  assert.ok(snapshot, "snapshot entry should be available");

  const beforeRollback = await accounts.fetchTreasuryAccount(
    client,
    t.treasury,
  );
  await sendAndConfirm(
    [
      await instructions.policy.rollbackPolicy(client, {
        accounts: { owner: t.owner, treasury: t.treasury, policyHistory },
        args: {
          targetVersion: snapshot.version,
          candidate: beforeRollback.policyConfig,
          now: nowBN(),
        },
      }),
    ],
    [],
    "rollbackPolicy",
  );
  const afterRollback = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(
    afterRollback.currentPolicyVersion,
    beforeRollback.currentPolicyVersion + 1,
    "rollback records a forward policy version",
  );

  await sendAndConfirm(
    [
      await instructions.policy.closePolicyHistory(client, {
        accounts: { owner: t.owner, treasury: t.treasury, policyHistory },
      }),
    ],
    [],
    "closePolicyHistory",
  );
  assert.equal(
    await accounts.fetchPolicyHistoryAccountNullable(client, policyHistory),
    null,
    "closed history account should be gone",
  );
});

test("trust identity: init, configure, restore", { skip }, async () => {
  const [trustIdentity] = deriveTrustIdentityAddress(t.treasury);
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
  let identity = await accounts.fetchTrustIdentityAccount(
    client,
    trustIdentity,
  );
  assert.equal(identity.trustTier, TRUST_TIER_TRUSTED);
  assert.equal(identity.threatScore, 0);

  // Valid ascending thresholds (matches the program's defaults).
  await sendAndConfirm(
    [
      await instructions.policy.configureTrustPolicy(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          watchThreshold: 50,
          restrictedThreshold: 150,
          lockdownThreshold: 300,
          watchMultiplierBps: new BN(5_000),
          restrictedMultiplierBps: new BN(1_000),
          decayPointsPerPeriod: 10,
          decayPeriodSecs: new BN(3_600),
          now: nowBN(),
        },
      }),
    ],
    [],
    "configureTrustPolicy",
  );

  // restore_trust is a no-op while already Trusted, but must succeed.
  await sendAndConfirm(
    [
      await instructions.policy.restoreTrust(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: { now: nowBN() },
      }),
    ],
    [],
    "restoreTrust",
  );
  identity = await accounts.fetchTrustIdentityAccount(client, trustIdentity);
  assert.equal(identity.trustTier, TRUST_TIER_TRUSTED);
});

test("canary: start a candidate then discard it", { skip }, async () => {
  const [policyCanary] = derivePolicyCanaryAddress(t.treasury);
  await sendAndConfirm(
    [
      await instructions.policy.startCanary(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          policyCanary,
          systemProgram: SystemProgram.programId,
        },
        args: {
          candidate: createTreasuryArgs(t.owner, t.agentId).policyConfig,
          sampleCap: 100,
          now: nowBN(),
        },
      }),
    ],
    [],
    "startCanary",
  );
  const canary = await accounts.fetchPolicyCanaryAccount(client, policyCanary);
  assert.equal(canary.enabled, true, "canary should be armed");

  await sendAndConfirm(
    [
      await instructions.policy.discardCanary(client, {
        accounts: { owner: t.owner, treasury: t.treasury, policyCanary },
      }),
    ],
    [],
    "discardCanary",
  );
  assert.equal(
    await accounts.fetchPolicyCanaryAccountNullable(client, policyCanary),
    null,
    "discarded canary account should be gone",
  );
});
