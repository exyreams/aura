/**
 * Live scenario 04: policy denials with funded dWallet context.
 *
 * This file does not perform a signed token transfer. It creates a real Aura
 * treasury around the funded cached dWallet, submits denial probes, and asserts
 * every denied path leaves token balances unchanged.
 */

import { test } from "node:test";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import {
  assertDeniedProposal,
  baseTransferProposalArgs,
  cloneProposalArgs,
  prepareLiveAuraScenario,
  VIOLATION_COUNTERPARTY_RISK,
  VIOLATION_DAILY_LIMIT,
  VIOLATION_PER_TRANSACTION_LIMIT,
  VIOLATION_QUOTE_STALE,
  VIOLATION_RECIPIENT_DAILY_LIMIT,
  VIOLATION_RECIPIENT_PER_TX_LIMIT,
  VIOLATION_SLIPPAGE_EXCEEDED,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

test("records policy denials without moving funded dWallet tokens", {
  skip: liveScenarioSkip,
}, async () => {
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-violations",
  });
  const baseArgs = baseTransferProposalArgs(scenario);
  const payer = getPayer();

  const overPerTx = cloneProposalArgs(baseArgs);
  const overPerTxUsd = scenario.allowedPerTxUsd.add(new BN(1));
  overPerTx.amountUsd = overPerTxUsd;
  overPerTx.expectedOutputUsd = overPerTxUsd;
  overPerTx.actualOutputUsd = overPerTxUsd;
  await assertDeniedProposal({
    scenario,
    label: "per-tx-limit",
    args: overPerTx,
    expectedViolation: VIOLATION_PER_TRANSACTION_LIMIT,
    clearMode: "cancel",
  });

  await assertDeniedProposal({
    scenario,
    label: "recipient-per-tx-limit",
    args: cloneProposalArgs(baseArgs),
    expectedViolation: VIOLATION_RECIPIENT_PER_TX_LIMIT,
    clearMode: "cancel",
  });

  await sendLiveIxs(
    [
      await scenario.program.methods
        .setRecipientLimit({
          chain: 2,
          address: scenario.destinationOwner.toBase58(),
          dailyLimitUsd: scenario.amountUsd.sub(new BN(1)),
          perTxLimitUsd: scenario.allowedPerTxUsd,
          now: nowBN(),
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "setRecipientLimit(recipient daily deny)",
  );

  await assertDeniedProposal({
    scenario,
    label: "recipient-daily-limit",
    args: cloneProposalArgs(baseArgs),
    expectedViolation: VIOLATION_RECIPIENT_DAILY_LIMIT,
    clearMode: "cancel",
  });

  await sendLiveIxs(
    [
      await scenario.program.methods
        .setRecipientLimit({
          chain: 2,
          address: scenario.destinationOwner.toBase58(),
          dailyLimitUsd: scenario.amountUsd.mul(new BN(100)),
          perTxLimitUsd: scenario.allowedPerTxUsd,
          now: nowBN(),
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "setRecipientLimit(reset recipient limits)",
  );

  const staleQuote = cloneProposalArgs(baseArgs);
  staleQuote.quoteAgeSecs = new BN(301);
  await assertDeniedProposal({
    scenario,
    label: "stale-quote",
    args: staleQuote,
    expectedViolation: VIOLATION_QUOTE_STALE,
    clearMode: "cancel",
  });

  const riskyCounterparty = cloneProposalArgs(baseArgs);
  riskyCounterparty.counterpartyRiskScore = 100;
  await assertDeniedProposal({
    scenario,
    label: "counterparty-risk",
    args: riskyCounterparty,
    expectedViolation: VIOLATION_COUNTERPARTY_RISK,
    clearMode: "cancel",
  });

  const slippage = cloneProposalArgs(baseArgs);
  slippage.actualOutputUsd = scenario.amountUsd.sub(new BN(50));
  await assertDeniedProposal({
    scenario,
    label: "slippage",
    args: slippage,
    expectedViolation: VIOLATION_SLIPPAGE_EXCEEDED,
    clearMode: "cancel",
  });

  const dailyScenario = await prepareLiveAuraScenario({
    prefix: "live-daily-limit",
    policyOverrides: ({ amountUsd, defaultLargeLimitUsd }) => ({
      perTxLimitUsd: amountUsd,
      dailyLimitUsd: amountUsd,
      daytimeHourlyLimitUsd: defaultLargeLimitUsd,
      nighttimeHourlyLimitUsd: defaultLargeLimitUsd,
      velocityLimitUsd: defaultLargeLimitUsd,
      recipientDailyLimitUsd: defaultLargeLimitUsd,
      recipientPerTxLimitUsd: amountUsd,
    }),
  });
  const dailyBaseArgs = baseTransferProposalArgs(dailyScenario);
  const reputationPrimer = cloneProposalArgs(dailyBaseArgs);
  const overDailyScenarioPerTx = dailyScenario.amountUsd.add(new BN(1));
  reputationPrimer.amountUsd = overDailyScenarioPerTx;
  reputationPrimer.expectedOutputUsd = overDailyScenarioPerTx;
  reputationPrimer.actualOutputUsd = overDailyScenarioPerTx;
  await assertDeniedProposal({
    scenario: dailyScenario,
    label: "daily-limit-reputation-primer",
    args: reputationPrimer,
    expectedViolation: VIOLATION_PER_TRANSACTION_LIMIT,
    clearMode: "execute",
  });

  await assertDeniedProposal({
    scenario: dailyScenario,
    label: "daily-limit",
    args: dailyBaseArgs,
    expectedViolation: VIOLATION_DAILY_LIMIT,
    clearMode: "cancel",
  });
});
