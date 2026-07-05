/**
 * Live scenario 17: conditional proposal triggers with funded context.
 *
 * Conditional proposals are workflow gates around the same pending queue used by
 * live dWallet transfers. This file promotes one proposal immediately, parks
 * another behind a future time window, and verifies no token balances move.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveConditionalProposalAddress } from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import { readTokenBalance } from "../support/live/assets.js";
import {
  CHAIN_SOLANA,
  prepareLiveAuraScenario,
  TX_TYPE_TRANSFER,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

const CONDITION_TIME_WINDOW = 2;
const STATUS_AWAITING_CONDITION = 7;
const STATUS_TRIGGERED = 8;
const CONDITION_UNMET_ERROR =
  /ConditionUnmet|condition was not satisfied|0x17c3|simulation failed/i;

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

test("conditional proposals promote or park funded-context transfers", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-conditional",
    policyOverrides: ({ allowedPerTxUsd, defaultLargeLimitUsd }) => ({
      perTxLimitUsd: allowedPerTxUsd,
      dailyLimitUsd: defaultLargeLimitUsd,
      daytimeHourlyLimitUsd: defaultLargeLimitUsd,
      nighttimeHourlyLimitUsd: defaultLargeLimitUsd,
      velocityLimitUsd: defaultLargeLimitUsd,
      recipientDailyLimitUsd: defaultLargeLimitUsd,
      recipientPerTxLimitUsd: allowedPerTxUsd,
    }),
  });
  const recipient = scenario.destinationOwner.toBase58();

  const immediateProposalId = Date.now() + Math.floor(Math.random() * 10_000);
  const [immediateConditional] = deriveConditionalProposalAddress(
    scenario.treasury,
    immediateProposalId,
    scenario.program.programId,
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeConditionalTransaction(new BN(immediateProposalId), {
          amountUsd: scenario.amountUsd,
          targetChain: CHAIN_SOLANA,
          txType: TX_TYPE_TRANSFER,
          protocolId: null,
          recipientOrContract: recipient,
          ttlSecs: new BN(3_600),
          conditions: [],
          combinator: 0,
          now: nowBN(),
        })
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          conditionalProposal: immediateConditional,
          conditionFeed: null,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "proposeConditionalTransaction(immediate live)",
  );

  let conditional =
    await scenario.program.account.conditionalProposal.fetch(
      immediateConditional,
    );
  assert.equal(conditional.status, STATUS_TRIGGERED);
  assert.ok(conditional.promotedProposalId !== null);

  let treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  const promoted = treasury.pendingQueue[0];
  assert.ok(promoted, "immediate condition should promote a pending proposal");
  assert.equal(
    promoted.proposalId.toString(),
    conditional.promotedProposalId?.toString(),
  );
  assert.equal(promoted.decision.approved, true);
  assert.equal(promoted.recipientOrContract, recipient);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .closeConditionalProposal()
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          conditionalProposal: immediateConditional,
        })
        .instruction(),
    ],
    "closeConditionalProposal(immediate live)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .cancelPending(nowBN())
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          dwalletState: null,
        })
        .instruction(),
    ],
    "cancelPending(conditional immediate live)",
  );

  const parkedProposalId = immediateProposalId + 1;
  const [parkedConditional] = deriveConditionalProposalAddress(
    scenario.treasury,
    parkedProposalId,
    scenario.program.programId,
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeConditionalTransaction(new BN(parkedProposalId), {
          amountUsd: scenario.amountUsd,
          targetChain: CHAIN_SOLANA,
          txType: TX_TYPE_TRANSFER,
          protocolId: null,
          recipientOrContract: recipient,
          ttlSecs: new BN(3 * 86_400),
          conditions: [futureTimeWindow(86_400)],
          combinator: 0,
          now: nowBN(),
        })
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          conditionalProposal: parkedConditional,
          conditionFeed: null,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "proposeConditionalTransaction(parked live)",
  );

  conditional =
    await scenario.program.account.conditionalProposal.fetch(parkedConditional);
  assert.equal(conditional.status, STATUS_AWAITING_CONDITION);
  assert.equal(conditional.promotedProposalId, null);
  treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  assert.equal(treasury.pendingQueue.length, 0);

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .tryTrigger()
          .accountsPartial({
            caller: payer.publicKey,
            treasury: scenario.treasury,
            conditionalProposal: parkedConditional,
            conditionFeed: null,
          })
          .instruction(),
      ],
      "tryTrigger(parked live)",
    );
  }, CONDITION_UNMET_ERROR);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .closeConditionalProposal()
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          conditionalProposal: parkedConditional,
        })
        .instruction(),
    ],
    "closeConditionalProposal(parked live)",
  );

  assert.equal(
    (await readTokenBalance(scenario.sourceAta, scenario.asset.tokenProgramId))
      .amount,
    scenario.beforeSource.amount,
  );
  assert.equal(
    (
      await readTokenBalance(
        scenario.destinationAta,
        scenario.asset.tokenProgramId,
      )
    ).amount,
    scenario.beforeDestination.amount,
  );
});
