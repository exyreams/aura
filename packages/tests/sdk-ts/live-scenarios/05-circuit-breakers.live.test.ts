/**
 * Live scenario 05: funded-context circuit breakers and hard pauses.
 *
 * These checks use the real funded dWallet context but do not perform a signed
 * token transfer. They assert that hard blocks prevent proposal landing, scoped
 * pauses record a denied proposal, and repeated executed denials trip the
 * treasury circuit breaker without moving tokens.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import {
  assertDeniedProposal,
  assertProposalSendFails,
  baseTransferProposalArgs,
  cloneProposalArgs,
  prepareLiveAuraScenario,
  VIOLATION_EXECUTION_SCOPE_PAUSED,
  VIOLATION_PER_TRANSACTION_LIMIT,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

test("hard pauses and circuit breaker block funded-context proposals", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();

  const globalPause = await prepareLiveAuraScenario({
    prefix: "live-global-pause",
    policyOverrides: ({ defaultLargeLimitUsd }) => ({
      recipientDailyLimitUsd: defaultLargeLimitUsd,
      recipientPerTxLimitUsd: null,
    }),
  });
  await sendLiveIxs(
    [
      await globalPause.program.methods
        .pauseExecution(true, nowBN())
        .accountsPartial({
          owner: payer.publicKey,
          treasury: globalPause.treasury,
        })
        .instruction(),
    ],
    "pauseExecution(global live block)",
  );
  await assertProposalSendFails({
    scenario: globalPause,
    label: "global-pause",
    args: baseTransferProposalArgs(globalPause),
    expectedMessage: /ExecutionPaused|execution is paused|0x1782/i,
  });

  const scopedPause = await prepareLiveAuraScenario({
    prefix: "live-scoped-pause",
    policyOverrides: ({ defaultLargeLimitUsd }) => ({
      recipientDailyLimitUsd: defaultLargeLimitUsd,
      recipientPerTxLimitUsd: null,
    }),
  });
  await sendLiveIxs(
    [
      await scopedPause.program.methods
        .setScopedPause({
          scopeKind: 1,
          chain: 2,
          txType: null,
          recipient: null,
          protocolId: null,
          paused: true,
          expiresAt: null,
          now: nowBN(),
        })
        .accountsPartial({
          operator: payer.publicKey,
          treasury: scopedPause.treasury,
          operatorRole: null,
        })
        .instruction(),
    ],
    "setScopedPause(solana live block)",
  );
  await assertDeniedProposal({
    scenario: scopedPause,
    label: "scoped-pause-chain",
    args: baseTransferProposalArgs(scopedPause),
    expectedViolation: VIOLATION_EXECUTION_SCOPE_PAUSED,
    clearMode: "cancel",
  });

  const breaker = await prepareLiveAuraScenario({
    prefix: "live-circuit-breaker",
    policyOverrides: ({ defaultLargeLimitUsd }) => ({
      recipientDailyLimitUsd: defaultLargeLimitUsd,
      recipientPerTxLimitUsd: null,
    }),
  });
  const baseArgs = baseTransferProposalArgs(breaker);
  const overPerTxUsd = breaker.allowedPerTxUsd.add(new BN(1));
  for (let i = 1; i <= 5; i += 1) {
    const denied = cloneProposalArgs(baseArgs);
    denied.currentTimestamp = nowBN().add(new BN(i));
    denied.amountUsd = overPerTxUsd;
    denied.expectedOutputUsd = overPerTxUsd;
    denied.actualOutputUsd = overPerTxUsd;
    await assertDeniedProposal({
      scenario: breaker,
      label: `circuit-breaker-denial-${i}`,
      args: denied,
      expectedViolation: VIOLATION_PER_TRANSACTION_LIMIT,
      clearMode: "execute",
    });
  }

  const tripped = await breaker.program.account.treasuryAccount.fetch(
    breaker.treasury,
  );
  assert.equal(tripped.executionPaused, true, "circuit breaker should pause");
  assert.equal(tripped.circuitBreaker.totalTrips, 1, "one breaker trip");
  assert.equal(tripped.pendingQueue.length, 0, "breaker queue should be clear");

  await assertProposalSendFails({
    scenario: breaker,
    label: "circuit-breaker-paused",
    args: baseTransferProposalArgs(breaker),
    expectedMessage: /ExecutionPaused|execution is paused|0x1782/i,
  });
});
