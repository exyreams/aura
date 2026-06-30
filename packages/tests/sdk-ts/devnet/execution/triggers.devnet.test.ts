/**
 * Devnet: execution-time trigger behavior (the on-chain clock paths).
 *
 * Unlike the owner-gated configuration surface in scheduled-intents.devnet,
 * these instructions evaluate the *real* on-chain clock and promote work into
 * the pending queue:
 *   - execute_scheduled_intent: permissionless run when due -> promotes a
 *     pending proposal and marks the intent in-flight; reverts when not due,
 *     disabled, or called by a non-keeper.
 *   - clear_scheduled_intent_in_flight: releases an abandoned in-flight run
 *     once its promoted proposal has left the queue.
 *   - try_trigger: promotes a parked conditional proposal once its conditions
 *     hold; reverts (ConditionUnmet) while they don't.
 *
 * To make "due now" deterministic we set `startAt` in the past; to keep a
 * condition unmet we use a TimeWindow that opens in the future.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  AURA_PROGRAM_ID,
  accounts,
  deriveConditionalProposalAddress,
  deriveScheduledIntentAddress,
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

const CHAIN_ETHEREUM = 1;
const TX_TYPE_TRANSFER = 0;
const EVM_DEAD = "0x000000000000000000000000000000000000dead";
const CONDITION_TIME_WINDOW = 2;
const STATUS_AWAITING_CONDITION = 7;

// Shared treasury for the revert paths (they never enqueue anything).
let shared: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  shared = await provisionTreasury({ prefix: "trig", activate: true });
});

/** A recurring transfer intent. `dueOffset` shifts `startAt` relative to now. */
function intentArgs(
  dueOffsetSecs: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    kind: 0,
    chain: CHAIN_ETHEREUM,
    txType: TX_TYPE_TRANSFER,
    intervalSecs: new BN(3_600),
    startAt: nowBN().add(new BN(dueOffsetSecs)),
    endAt: null,
    maxRuns: null,
    perRunLimitUsd: new BN(1_000),
    totalBudgetUsd: null,
    recipients: [{ address: EVM_DEAD, amountUsd: new BN(0) }],
    amountUsd: new BN(100),
    skipOnDeny: false,
    catchUp: false,
    keeper: null,
    conditions: [],
    combinator: 0,
    ...overrides,
  };
}

/** A single TimeWindow condition record opening `opensInSecs` from now. */
function futureTimeWindow(opensInSecs: number) {
  const start = nowBN().add(new BN(opensInSecs));
  return {
    kind: CONDITION_TIME_WINDOW,
    feed: null,
    oracleProvider: 255,
    oracleProgramId: null,
    oracleMaxStalenessSecs: new BN(0),
    oracleMaxConfidenceBps: 0,
    oracleExpoExpected: null,
    threshold: new BN(0),
    windowStart: start,
    windowEnd: start.add(new BN(86_400)),
    negate: false,
  };
}

test("execute_scheduled_intent promotes a due run, then cancel + clear release it", {
  skip,
}, async () => {
  // Isolated treasury: this flow leaves (then clears) pending + in-flight state.
  const t = await provisionTreasury({ prefix: "trig-run", activate: true });
  const intentId = Date.now();
  const [scheduledIntent] = deriveScheduledIntentAddress(t.treasury, intentId);

  await sendAndConfirm(
    [
      await instructions.execution.createScheduledIntent(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          scheduledIntent,
          systemProgram: SystemProgram.programId,
        },
        // startAt 2 minutes ago => already due.
        args: { intentId: new BN(intentId), args: intentArgs(-120) },
      }),
    ],
    [],
    "createScheduledIntent(due)",
  );

  await sendAndConfirm(
    [
      await instructions.execution.executeScheduledIntent(client, {
        accounts: {
          caller: t.owner,
          treasury: t.treasury,
          scheduledIntent,
          conditionFeed: null,
        },
      }),
    ],
    [],
    "executeScheduledIntent",
  );

  let intent = await accounts.fetchScheduledIntent(client, scheduledIntent);
  assert.ok(
    intent.inFlightProposalId !== null,
    "intent should hold an in-flight proposal id",
  );
  const proposalId = new BN(intent.inFlightProposalId?.toString() ?? "0");
  let treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.ok(
    treasury.pendingQueue.length > 0,
    "run should be promoted into the pending queue",
  );

  // Remove the promoted proposal from the queue...
  await sendAndConfirm(
    [
      await instructions.execution.cancelPending(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState: null },
        args: { now: nowBN() },
      }),
    ],
    [],
    "cancelPending",
  );
  treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(treasury.pendingQueue.length, 0, "queue cleared");

  // ...then release the intent's abandoned in-flight slot.
  await sendAndConfirm(
    [
      await instructions.execution.clearScheduledIntentInFlight(client, {
        accounts: { owner: t.owner, treasury: t.treasury, scheduledIntent },
        args: { proposalId, now: nowBN() },
      }),
    ],
    [],
    "clearScheduledIntentInFlight",
  );
  intent = await accounts.fetchScheduledIntent(client, scheduledIntent);
  assert.equal(
    intent.inFlightProposalId,
    null,
    "in-flight slot should be released",
  );
});

test("settlement/execution SDK builders reject without a pending proposal", {
  skip,
}, async () => {
  const t = await provisionTreasury({
    prefix: "exec-empty",
    activate: true,
  });
  const targetTxHash = Array.from({ length: 32 }, (_, index) => index + 1);
  const now = nowBN();

  const executeIx = await instructions.execution.executePending(client, {
    accounts: {
      operator: t.owner,
      treasury: t.treasury,
      messageApproval: null,
      dwallet: null,
      callerProgram: AURA_PROGRAM_ID,
      cpiAuthority: null,
      dwalletProgram: null,
      dwalletCoordinator: null,
      externalLiveness: null,
      dwalletState: null,
      systemProgram: SystemProgram.programId,
    },
    args: { now },
  });
  await expectSendToFail([executeIx], "executePending no pending proposal");

  const finalizeIx = await instructions.execution.finalizeExecution(client, {
    accounts: {
      operator: t.owner,
      treasury: t.treasury,
      messageApproval: Keypair.generate().publicKey,
      swarmPool: null,
      budgetEnvelope: null,
      exposureGroup: null,
      externalLiveness: null,
      dwalletState: null,
      scheduledIntent: null,
      feeVault: null,
      feeSchedule: null,
      protocolConfig: null,
    },
    args: { now },
  });
  await expectSendToFail([finalizeIx], "finalizeExecution no pending proposal");

  const markIx = await instructions.execution.markSettlementBroadcast(client, {
    accounts: { operator: t.owner, treasury: t.treasury },
    args: {
      proposalId: new BN(0),
      targetTxHash,
      now,
    },
  });
  await expectSendToFail([markIx], "markSettlementBroadcast no pending proposal");

  const confirmIx = await instructions.execution.confirmSettlement(client, {
    accounts: {
      operator: t.owner,
      treasury: t.treasury,
      swarmPool: null,
      budgetEnvelope: null,
      exposureGroup: null,
      dwalletState: null,
      scheduledIntent: null,
    },
    args: {
      proposalId: new BN(0),
      targetTxHash,
      confirmationsObserved: 1,
      reorged: false,
      now,
    },
  });
  await expectSendToFail([confirmIx], "confirmSettlement no pending proposal");
});

test("execute_scheduled_intent reverts before the intent is due", {
  skip,
}, async () => {
  const intentId = Date.now() + 1;
  const [scheduledIntent] = deriveScheduledIntentAddress(
    shared.treasury,
    intentId,
  );
  await sendAndConfirm(
    [
      await instructions.execution.createScheduledIntent(client, {
        accounts: {
          owner: shared.owner,
          treasury: shared.treasury,
          scheduledIntent,
          systemProgram: SystemProgram.programId,
        },
        // startAt one day out => not due yet.
        args: { intentId: new BN(intentId), args: intentArgs(86_400) },
      }),
    ],
    [],
    "createScheduledIntent(future)",
  );
  const ix = await instructions.execution.executeScheduledIntent(client, {
    accounts: {
      caller: shared.owner,
      treasury: shared.treasury,
      scheduledIntent,
      conditionFeed: null,
    },
  });
  await expectSendToFail([ix], "execute before due");
});

test("execute_scheduled_intent reverts when the intent is disabled", {
  skip,
}, async () => {
  const intentId = Date.now() + 2;
  const [scheduledIntent] = deriveScheduledIntentAddress(
    shared.treasury,
    intentId,
  );
  await sendAndConfirm(
    [
      await instructions.execution.createScheduledIntent(client, {
        accounts: {
          owner: shared.owner,
          treasury: shared.treasury,
          scheduledIntent,
          systemProgram: SystemProgram.programId,
        },
        args: { intentId: new BN(intentId), args: intentArgs(-120) },
      }),
    ],
    [],
    "createScheduledIntent(due)",
  );
  await sendAndConfirm(
    [
      await instructions.execution.pauseScheduledIntent(client, {
        accounts: {
          owner: shared.owner,
          treasury: shared.treasury,
          scheduledIntent,
        },
      }),
    ],
    [],
    "pauseScheduledIntent",
  );
  const ix = await instructions.execution.executeScheduledIntent(client, {
    accounts: {
      caller: shared.owner,
      treasury: shared.treasury,
      scheduledIntent,
      conditionFeed: null,
    },
  });
  await expectSendToFail([ix], "execute disabled intent");
});

test("execute_scheduled_intent reverts for a non-keeper caller", {
  skip,
}, async () => {
  const intentId = Date.now() + 3;
  const [scheduledIntent] = deriveScheduledIntentAddress(
    shared.treasury,
    intentId,
  );
  await sendAndConfirm(
    [
      await instructions.execution.createScheduledIntent(client, {
        accounts: {
          owner: shared.owner,
          treasury: shared.treasury,
          scheduledIntent,
          systemProgram: SystemProgram.programId,
        },
        // Bind the intent to a keeper the payer cannot impersonate.
        args: {
          intentId: new BN(intentId),
          args: intentArgs(-120, { keeper: Keypair.generate().publicKey }),
        },
      }),
    ],
    [],
    "createScheduledIntent(keeper)",
  );
  const ix = await instructions.execution.executeScheduledIntent(client, {
    accounts: {
      caller: shared.owner,
      treasury: shared.treasury,
      scheduledIntent,
      conditionFeed: null,
    },
  });
  await expectSendToFail([ix], "execute by non-keeper");
});

test("propose_conditional_transaction parks when its condition is unmet", {
  skip,
}, async () => {
  const proposalId = Date.now() + 200;
  const [conditionalProposal] = deriveConditionalProposalAddress(
    shared.treasury,
    proposalId,
  );
  await sendAndConfirm(
    [
      await instructions.execution.proposeConditionalTransaction(client, {
        accounts: {
          aiAuthority: shared.owner,
          treasury: shared.treasury,
          conditionalProposal,
          conditionFeed: null,
          systemProgram: SystemProgram.programId,
        },
        args: {
          proposalId: new BN(proposalId),
          args: {
            amountUsd: new BN(100),
            targetChain: CHAIN_ETHEREUM,
            txType: TX_TYPE_TRANSFER,
            protocolId: null,
            recipientOrContract: EVM_DEAD,
            ttlSecs: new BN(3 * 86_400),
            conditions: [futureTimeWindow(86_400)],
            combinator: 0,
            now: nowBN(),
          },
        },
      }),
    ],
    [],
    "proposeConditionalTransaction(parked)",
  );

  const proposal = await accounts.fetchConditionalProposal(
    client,
    conditionalProposal,
  );
  assert.equal(
    proposal.status,
    STATUS_AWAITING_CONDITION,
    "status should be AwaitingCondition",
  );
  assert.equal(
    proposal.promotedProposalId,
    null,
    "nothing should be promoted yet",
  );

  // try_trigger while the window is still in the future -> ConditionUnmet.
  const triggerIx = await instructions.execution.tryTrigger(client, {
    accounts: {
      caller: shared.owner,
      treasury: shared.treasury,
      conditionalProposal,
      conditionFeed: null,
    },
  });
  await expectSendToFail([triggerIx], "try_trigger with unmet condition");

  // Cleanup the parked PDA.
  await sendAndConfirm(
    [
      await instructions.execution.closeConditionalProposal(client, {
        accounts: {
          owner: shared.owner,
          treasury: shared.treasury,
          conditionalProposal,
        },
      }),
    ],
    [],
    "closeConditionalProposal",
  );
});
