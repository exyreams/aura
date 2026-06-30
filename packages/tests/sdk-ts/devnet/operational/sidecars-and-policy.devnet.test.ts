/**
 * Devnet: operational sidecars and policy adjunct instructions.
 *
 * Covers real on-chain paths not reached by the narrower lifecycle/policy
 * suites:
 *   - activity log init/close
 *   - health score init/refresh/snapshot/close
 *   - external liveness configure/init/refresh/close
 *   - scoped pause add/remove
 *   - approval ladder configure + approve_pending_execution
 *   - check_policy_cpi result account
 *   - write_policy_receipt over a live pending proposal
 *   - propose_batch account creation
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveActivityLogAddress,
  deriveBatchProposalAddress,
  deriveExternalLivenessAddress,
  deriveHealthScoreAddress,
  derivePolicyCheckAddress,
  derivePolicyReceiptAddress,
  deriveSnapshotAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_AVAILABLE,
  devnetClient,
  nowBN,
  proposeAccounts,
  proposeTransactionArgs,
  type ProvisionedTreasury,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

const CHAIN_ETHEREUM = 1;
const TX_TYPE_TRANSFER = 0;
const EVM_DEAD = "0x000000000000000000000000000000000000dead";

let t: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "ops-pol", activate: true });
});

test("activity log: init then close", { skip }, async () => {
  const [activityLog] = deriveActivityLogAddress(t.treasury);

  await sendAndConfirm(
    [
      await instructions.operational.initActivityLog(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          activityLog,
          systemProgram: SystemProgram.programId,
        },
      }),
    ],
    [],
    "initActivityLog",
  );
  const log = await accounts.fetchActivityLogAccount(client, activityLog);
  assert.equal(log.treasury.toBase58(), t.treasury.toBase58());
  assert.equal(log.totalEvents.toString(), "0");

  await sendAndConfirm(
    [
      await instructions.operational.closeActivityLog(client, {
        accounts: { owner: t.owner, treasury: t.treasury, activityLog },
      }),
    ],
    [],
    "closeActivityLog",
  );
  assert.equal(
    await accounts.fetchActivityLogAccountNullable(client, activityLog),
    null,
  );
});

test("health score: init, refresh, snapshot, close snapshot, close health score", {
  skip,
}, async () => {
  const [healthScore] = deriveHealthScoreAddress(t.treasury);
  const snapshotIndex = Math.floor(Date.now() % 1_000_000);
  const [snapshot] = deriveSnapshotAddress(t.treasury, snapshotIndex);

  await sendAndConfirm(
    [
      await instructions.operational.initHealthScore(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          healthScore,
          systemProgram: SystemProgram.programId,
        },
        args: { now: nowBN() },
      }),
    ],
    [],
    "initHealthScore",
  );
  let score = await accounts.fetchHealthScoreAccount(client, healthScore);
  assert.equal(score.treasury.toBase58(), t.treasury.toBase58());

  await sendAndConfirm(
    [
      await instructions.operational.refreshHealthScore(client, {
        accounts: {
          operator: t.owner,
          treasury: t.treasury,
          operatorRole: null,
          healthScore,
        },
        args: { now: nowBN() },
      }),
    ],
    [],
    "refreshHealthScore",
  );
  score = await accounts.fetchHealthScoreAccount(client, healthScore);
  assert.equal(score.treasury.toBase58(), t.treasury.toBase58());

  await sendAndConfirm(
    [
      await instructions.operational.takeSnapshot(client, {
        accounts: {
          payer: t.owner,
          treasury: t.treasury,
          operatorRole: null,
          healthScore,
          snapshot,
          systemProgram: SystemProgram.programId,
        },
        args: { snapshotIndex, now: nowBN() },
      }),
    ],
    [],
    "takeSnapshot",
  );
  const snap = await accounts.fetchSnapshotAccount(client, snapshot);
  assert.equal(snap.snapshotIndex, snapshotIndex);
  assert.equal(snap.treasury.toBase58(), t.treasury.toBase58());

  await sendAndConfirm(
    [
      await instructions.operational.closeSnapshot(client, {
        accounts: { owner: t.owner, treasury: t.treasury, snapshot },
      }),
    ],
    [],
    "closeSnapshot",
  );
  assert.equal(
    await accounts.fetchSnapshotAccountNullable(client, snapshot),
    null,
  );

  await sendAndConfirm(
    [
      await instructions.operational.closeHealthScore(client, {
        accounts: { owner: t.owner, treasury: t.treasury, healthScore },
      }),
    ],
    [],
    "closeHealthScore",
  );
  assert.equal(
    await accounts.fetchHealthScoreAccountNullable(client, healthScore),
    null,
  );
});

test("external liveness: configure, init, refresh, disable gates, close", {
  skip,
}, async () => {
  const [liveness] = deriveExternalLivenessAddress(t.treasury);
  const firstNow = nowBN();
  const refreshedAt = firstNow.add(new BN(60));

  await sendAndConfirm(
    [
      await instructions.budget.configureLivenessGuardrails(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: {
          requireEncryptFreshness: true,
          requireDwalletFreshness: false,
          requireBalanceOracleFreshness: false,
          requireComplianceOracleFreshness: false,
          maxStalenessSecs: new BN(600),
          now: firstNow,
        },
      }),
    ],
    [],
    "configureLivenessGuardrails(enable)",
  );
  let treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(treasury.policyConfig.livenessConfig.requireEncryptFreshness, true);

  await sendAndConfirm(
    [
      await instructions.operational.initExternalLiveness(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          liveness,
          systemProgram: SystemProgram.programId,
        },
        args: { maxStalenessSecs: new BN(600), now: firstNow },
      }),
    ],
    [],
    "initExternalLiveness",
  );

  await sendAndConfirm(
    [
      await instructions.operational.refreshExternalLiveness(client, {
        accounts: {
          operator: t.owner,
          treasury: t.treasury,
          operatorRole: null,
          liveness,
        },
        args: { dependency: 1, now: refreshedAt },
      }),
    ],
    [],
    "refreshExternalLiveness",
  );
  let live = await accounts.fetchExternalLivenessAccount(client, liveness);
  assert.equal(live.encryptLastVerifiedAt.toString(), refreshedAt.toString());
  assert.equal(live.updatedBy.toBase58(), t.owner.toBase58());

  await sendAndConfirm(
    [
      await instructions.budget.configureLivenessGuardrails(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: {
          requireEncryptFreshness: false,
          requireDwalletFreshness: false,
          requireBalanceOracleFreshness: false,
          requireComplianceOracleFreshness: false,
          maxStalenessSecs: new BN(600),
          now: refreshedAt.add(new BN(1)),
        },
      }),
    ],
    [],
    "configureLivenessGuardrails(disable)",
  );
  treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(
    treasury.policyConfig.livenessConfig.requireEncryptFreshness,
    false,
  );

  await sendAndConfirm(
    [
      await instructions.operational.closeExternalLiveness(client, {
        accounts: { owner: t.owner, treasury: t.treasury, liveness },
      }),
    ],
    [],
    "closeExternalLiveness",
  );
  assert.equal(
    await accounts.fetchExternalLivenessAccountNullable(client, liveness),
    null,
  );
});

test("scoped pause: add and remove a chain pause", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.operational.setScopedPause(client, {
        accounts: { operator: t.owner, treasury: t.treasury, operatorRole: null },
        args: {
          scopeKind: 1,
          chain: CHAIN_ETHEREUM,
          txType: null,
          recipient: null,
          protocolId: null,
          paused: true,
          expiresAt: null,
          now: nowBN(),
        },
      }),
    ],
    [],
    "setScopedPause(add)",
  );
  let treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(treasury.policyConfig.scopedPauseEntries.length, 1);

  await sendAndConfirm(
    [
      await instructions.operational.setScopedPause(client, {
        accounts: { operator: t.owner, treasury: t.treasury, operatorRole: null },
        args: {
          scopeKind: 1,
          chain: CHAIN_ETHEREUM,
          txType: null,
          recipient: null,
          protocolId: null,
          paused: false,
          expiresAt: null,
          now: nowBN(),
        },
      }),
    ],
    [],
    "setScopedPause(remove)",
  );
  treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(treasury.policyConfig.scopedPauseEntries.length, 0);
});

test("approval ladder gates a pending proposal and owner approval satisfies it", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.budget.configureApprovalLadder(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: {
          guardianAboveUsd: new BN(50),
          multisigAboveUsd: new BN(500),
          timelockAboveUsd: new BN(1_000),
          denyAboveUsd: new BN(10_000),
          riskGuardianBps: 5_000,
          riskMultisigBps: 7_500,
          riskTimelockBps: 9_000,
          timelockSecs: new BN(60),
          now: nowBN(),
        },
      }),
    ],
    [],
    "configureApprovalLadder",
  );

  const proposalArgs = proposeTransactionArgs(nowBN());
  proposalArgs.amountUsd = new BN(100);
  await sendAndConfirm(
    [
      await instructions.execution.proposeTransaction(client, {
        accounts: proposeAccounts(t.treasury),
        args: proposalArgs,
      }),
    ],
    [],
    "proposeTransaction(ladder)",
  );
  let treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  const proposalId = treasury.pendingQueue.at(-1)?.proposalId;
  assert.ok(proposalId, "pending proposal should be present");
  assert.equal(treasury.pendingQueue.at(-1)?.requiredApprovalLevel, 1);

  await sendAndConfirm(
    [
      await instructions.execution.approvePendingExecution(client, {
        accounts: { approver: t.owner, treasury: t.treasury },
        args: { proposalId, approvalLevel: 1, now: nowBN() },
      }),
    ],
    [],
    "approvePendingExecution",
  );
  treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  const approved = treasury.pendingQueue.at(-1);
  assert.ok(approved, "pending proposal should still be present");
  assert.ok(
    approved.satisfiedApprovalLevel >= approved.requiredApprovalLevel,
    "approval should satisfy or exceed the required level",
  );
});

test("policy cpi check writes a result account", { skip }, async () => {
  const caller = Keypair.generate().publicKey;
  const [result] = derivePolicyCheckAddress(t.treasury, caller);

  await sendAndConfirm(
    [
      await instructions.policy.checkPolicyCpi(client, {
        accounts: {
          caller,
          treasury: t.treasury,
          feePayer: t.owner,
          result,
          systemProgram: SystemProgram.programId,
        },
        args: {
          amountUsd: new BN(100),
          targetChain: CHAIN_ETHEREUM,
          txType: TX_TYPE_TRANSFER,
          protocolId: null,
          currentTimestamp: nowBN(),
          recipientOrContract: EVM_DEAD,
        },
      }),
    ],
    [],
    "checkPolicyCpi",
  );
  const check = await accounts.fetchPolicyCheckResult(client, result);
  assert.equal(check.caller.toBase58(), caller.toBase58());
  assert.equal(check.approved, true);
});

test("write_policy_receipt snapshots the live pending proposal", { skip }, async () => {
  let treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  const proposalId = treasury.pendingQueue.at(-1)?.proposalId;
  assert.ok(proposalId, "approval-ladder test leaves a pending proposal");
  const [receipt] = derivePolicyReceiptAddress(t.treasury, proposalId.toString());

  await sendAndConfirm(
    [
      await instructions.policy.writePolicyReceipt(client, {
        accounts: {
          payer: t.owner,
          treasury: t.treasury,
          receipt,
          attestation: null,
          systemProgram: SystemProgram.programId,
        },
        args: { proposalId, now: nowBN() },
      }),
    ],
    [],
    "writePolicyReceipt",
  );
  const policyReceipt = await accounts.fetchPolicyReceiptAccount(client, receipt);
  assert.equal(policyReceipt.proposalId.toString(), proposalId.toString());
  assert.equal(policyReceipt.policyAttested, false);
});

test("propose_batch writes evaluated batch state", { skip }, async () => {
  const batchId = Date.now();
  const [batch] = deriveBatchProposalAddress(t.treasury, batchId);

  await sendAndConfirm(
    [
      await instructions.batch.proposeBatch(client, {
        accounts: {
          payer: t.owner,
          treasury: t.treasury,
          batch,
          systemProgram: SystemProgram.programId,
        },
        args: {
          batchId: new BN(batchId),
          now: nowBN(),
          items: [
            {
              amountUsd: new BN(100),
              chain: CHAIN_ETHEREUM,
              txType: TX_TYPE_TRANSFER,
              recipientOrContract: EVM_DEAD,
              protocolId: null,
            },
          ],
        },
      }),
    ],
    [],
    "proposeBatch",
  );
  const account = await accounts.fetchBatchProposalAccount(client, batch);
  assert.equal(account.batchId.toString(), String(batchId));
  assert.equal(account.itemCount, 1);
  assert.equal(account.confidential, false);
});
