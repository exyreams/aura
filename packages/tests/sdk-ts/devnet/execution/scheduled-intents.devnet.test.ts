/**
 * Devnet: scheduled intents and conditional proposals.
 *
 * Covers the recurring-payment and parked-proposal surfaces that the basic
 * proposal suite doesn't touch, none of which require live Ika signing:
 *   - create_scheduled_intent / update_scheduled_intent
 *   - pause_scheduled_intent / resume_scheduled_intent
 *   - close_scheduled_intent
 *   - propose_conditional_transaction (empty conditions promote immediately
 *     into the normal pending queue) / close_conditional_proposal
 *   - abandon_proposal / resubmit_proposal guard paths
 *
 * Scheduled-intent *execution* uses the on-chain clock and is left to a keeper
 * path; here we drive the owner-gated configuration surface and assert state.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveConditionalProposalAddress,
  deriveScheduledIntentAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
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
// ConditionalProposal status storage codes.
const STATUS_TRIGGERED = 8;

let t: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "exec-sched", activate: true });
});

/** A valid, far-future recurring-transfer intent (not yet due). */
function intentArgs(overrides: Record<string, unknown> = {}) {
  return {
    kind: 0,
    chain: CHAIN_ETHEREUM,
    txType: TX_TYPE_TRANSFER,
    intervalSecs: new BN(3_600),
    startAt: nowBN().add(new BN(86_400)), // tomorrow: never due during the test
    endAt: null,
    maxRuns: null,
    perRunLimitUsd: new BN(1_000),
    totalBudgetUsd: null,
    recipients: [],
    amountUsd: new BN(500),
    skipOnDeny: false,
    catchUp: false,
    keeper: null,
    conditions: [],
    combinator: 0,
    ...overrides,
  };
}

test("scheduled intent lifecycle: create, update, pause, resume, close", {
  skip,
}, async () => {
  const intentId = Date.now();
  const [scheduledIntent] = deriveScheduledIntentAddress(t.treasury, intentId);

  // create
  await sendAndConfirm(
    [
      await instructions.execution.createScheduledIntent(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          scheduledIntent,
          systemProgram: SystemProgram.programId,
        },
        args: { intentId: new BN(intentId), args: intentArgs() },
      }),
    ],
    [],
    "createScheduledIntent",
  );
  let state = await accounts.fetchScheduledIntent(client, scheduledIntent);
  assert.equal(state.intentId.toString(), intentId.toString());
  assert.equal(state.enabled, true);
  assert.equal(state.perRunLimitUsd.toString(), "1000");
  assert.equal(state.runsCompleted, 0);

  // update: raise the per-run cap and the run amount
  await sendAndConfirm(
    [
      await instructions.execution.updateScheduledIntent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, scheduledIntent },
        args: intentArgs({
          perRunLimitUsd: new BN(2_000),
          amountUsd: new BN(1_500),
        }),
      }),
    ],
    [],
    "updateScheduledIntent",
  );
  state = await accounts.fetchScheduledIntent(client, scheduledIntent);
  assert.equal(state.perRunLimitUsd.toString(), "2000");
  assert.equal(state.amountUsd.toString(), "1500");

  // pause
  await sendAndConfirm(
    [
      await instructions.execution.pauseScheduledIntent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, scheduledIntent },
      }),
    ],
    [],
    "pauseScheduledIntent",
  );
  state = await accounts.fetchScheduledIntent(client, scheduledIntent);
  assert.equal(state.enabled, false);

  // resume
  await sendAndConfirm(
    [
      await instructions.execution.resumeScheduledIntent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, scheduledIntent },
      }),
    ],
    [],
    "resumeScheduledIntent",
  );
  state = await accounts.fetchScheduledIntent(client, scheduledIntent);
  assert.equal(state.enabled, true);

  // close
  await sendAndConfirm(
    [
      await instructions.execution.closeScheduledIntent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, scheduledIntent },
      }),
    ],
    [],
    "closeScheduledIntent",
  );
  assert.equal(
    await accounts.fetchScheduledIntentNullable(client, scheduledIntent),
    null,
    "closed scheduled intent account should be gone",
  );
});

test("create_scheduled_intent rejects a sub-minimum interval", {
  skip,
}, async () => {
  const intentId = Date.now() + 1;
  const [scheduledIntent] = deriveScheduledIntentAddress(t.treasury, intentId);
  const ix = await instructions.execution.createScheduledIntent(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      scheduledIntent,
      systemProgram: SystemProgram.programId,
    },
    // interval below MIN_INTENT_INTERVAL_SECS (60) -> InvalidIntentConfig
    args: {
      intentId: new BN(intentId),
      args: intentArgs({ intervalSecs: new BN(5) }),
    },
  });
  await expectSendToFail([ix], "interval < 60s");
});

test("create_scheduled_intent rejects a run amount over the per-run cap", {
  skip,
}, async () => {
  const intentId = Date.now() + 2;
  const [scheduledIntent] = deriveScheduledIntentAddress(t.treasury, intentId);
  const ix = await instructions.execution.createScheduledIntent(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      scheduledIntent,
      systemProgram: SystemProgram.programId,
    },
    // amount 2000 > per-run cap 1000 -> InvalidIntentConfig
    args: {
      intentId: new BN(intentId),
      args: intentArgs({
        perRunLimitUsd: new BN(1_000),
        amountUsd: new BN(2_000),
      }),
    },
  });
  await expectSendToFail([ix], "amount over per-run cap");
});

test("create_scheduled_intent rejects an unknown intent kind", {
  skip,
}, async () => {
  const intentId = Date.now() + 3;
  const [scheduledIntent] = deriveScheduledIntentAddress(t.treasury, intentId);
  const ix = await instructions.execution.createScheduledIntent(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      scheduledIntent,
      systemProgram: SystemProgram.programId,
    },
    args: { intentId: new BN(intentId), args: intentArgs({ kind: 9 }) }, // kind must be <= 3
  });
  await expectSendToFail([ix], "unknown intent kind");
});

test("propose_conditional_transaction with no conditions promotes to pending", {
  skip,
}, async () => {
  const proposalId = Date.now() + 100;
  const [conditionalProposal] = deriveConditionalProposalAddress(
    t.treasury,
    proposalId,
  );

  await sendAndConfirm(
    [
      await instructions.execution.proposeConditionalTransaction(client, {
        accounts: {
          aiAuthority: t.owner,
          treasury: t.treasury,
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
            ttlSecs: new BN(3_600),
            conditions: [],
            combinator: 0,
            now: nowBN(),
          },
        },
      }),
    ],
    [],
    "proposeConditionalTransaction",
  );

  // Empty conditions are trivially satisfied, so the proposal is Triggered and
  // promoted straight into the treasury's pending queue.
  const proposal = await accounts.fetchConditionalProposal(
    client,
    conditionalProposal,
  );
  assert.equal(proposal.status, STATUS_TRIGGERED, "status should be Triggered");
  assert.ok(
    proposal.promotedProposalId !== null,
    "promoted proposal id should be set",
  );
  const treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.ok(
    treasury.pendingQueue.length > 0,
    "promotion should enqueue a pending proposal",
  );

  // Tidy up: close the conditional PDA (owner-gated) and clear the pending
  // queue so this suite leaves the treasury clean for any later run.
  await sendAndConfirm(
    [
      await instructions.execution.closeConditionalProposal(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          conditionalProposal,
        },
      }),
    ],
    [],
    "closeConditionalProposal",
  );
  assert.equal(
    await accounts.fetchConditionalProposalNullable(
      client,
      conditionalProposal,
    ),
    null,
    "closed conditional proposal account should be gone",
  );

  await sendAndConfirm(
    [
      await instructions.execution.cancelPending(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState: null },
        args: { now: nowBN() },
      }),
    ],
    [],
    "cancelPending(cleanup)",
  );
});

test("propose_conditional_transaction rejects a zero TTL", {
  skip,
}, async () => {
  const proposalId = Date.now() + 101;
  const [conditionalProposal] = deriveConditionalProposalAddress(
    t.treasury,
    proposalId,
  );
  const ix = await instructions.execution.proposeConditionalTransaction(
    client,
    {
      accounts: {
        aiAuthority: t.owner,
        treasury: t.treasury,
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
          ttlSecs: new BN(0), // ttl must be > 0
          conditions: [],
          combinator: 0,
          now: nowBN(),
        },
      },
    },
  );
  await expectSendToFail([ix], "conditional ttl = 0");
});

test("abandon_proposal reverts when the queue is empty", { skip }, async () => {
  const ix = await instructions.execution.abandonProposal(client, {
    accounts: { operator: t.owner, treasury: t.treasury, dwalletState: null },
    args: { proposalId: new BN(1), now: nowBN() },
  });
  await expectSendToFail([ix], "abandon with empty queue");
});

test("resubmit_proposal reverts when the queue is empty", {
  skip,
}, async () => {
  const ix = await instructions.execution.resubmitProposal(client, {
    accounts: { operator: t.owner, treasury: t.treasury, chainProfile: null },
    args: {
      proposalId: new BN(1),
      evmChainId: null,
      replayNonce: null,
      gasLimit: null,
      maxFeeNative: null,
      nativeMessageHash: null,
      calldataHash: null,
      utxoSetHash: null,
      sighashType: null,
      solanaRecentBlockhash: null,
      solanaMessageHash: null,
      confirmationsRequired: null,
      now: nowBN(),
    },
  });
  await expectSendToFail([ix], "resubmit with empty queue");
});
