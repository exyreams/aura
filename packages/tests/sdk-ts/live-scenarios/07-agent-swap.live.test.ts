/**
 * Live scenario 07: swap-intent policy checks.
 *
 * This is funded-context policy coverage for an agent swap workflow. It does
 * not execute a real swap yet; real swap execution should be added only after a
 * stable devnet venue and account model are encoded in support helpers.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import {
  assertDeniedProposal,
  baseTransferProposalArgs,
  cloneProposalArgs,
  prepareLiveAuraScenario,
  TX_TYPE_DEFI_SWAP,
  VIOLATION_COUNTERPARTY_RISK,
  VIOLATION_PROTOCOL_NOT_ALLOWED,
  VIOLATION_QUOTE_STALE,
  VIOLATION_SLIPPAGE_EXCEEDED,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

const PROTOCOL_AURA_TEST_SWAP = 1;
const PROTOCOL_BLOCKED = 5;

function swapIntentArgs(
  scenario: Awaited<ReturnType<typeof prepareLiveAuraScenario>>,
) {
  const args = baseTransferProposalArgs(scenario);
  args.txType = TX_TYPE_DEFI_SWAP;
  args.protocolId = PROTOCOL_AURA_TEST_SWAP;
  args.expectedOutputUsd = scenario.amountUsd.mul(new BN(2));
  args.actualOutputUsd = args.expectedOutputUsd;
  args.quoteAgeSecs = new BN(20);
  args.counterpartyRiskScore = 15;
  args.recipientOrContract = "aura-test-swap-venue";
  return args;
}

test("scores swap intents and rejects unsafe swap metadata", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-agent-swap",
    policyOverrides: ({ defaultLargeLimitUsd, allowedPerTxUsd }) => ({
      perTxLimitUsd: allowedPerTxUsd,
      dailyLimitUsd: defaultLargeLimitUsd,
      daytimeHourlyLimitUsd: defaultLargeLimitUsd,
      nighttimeHourlyLimitUsd: defaultLargeLimitUsd,
      velocityLimitUsd: defaultLargeLimitUsd,
      recipientDailyLimitUsd: defaultLargeLimitUsd,
      recipientPerTxLimitUsd: null,
    }),
  });

  const approved = swapIntentArgs(scenario);
  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeTransaction(approved)
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          sessionKeyAccount: null,
          swarmPool: null,
          addressList: null,
          complianceOracle: null,
          parentTreasury: null,
          budgetEnvelope: null,
          exposureGroup: null,
          dwalletState: null,
          chainProfile: null,
          trustIdentity: null,
          policyCanary: null,
        })
        .instruction(),
    ],
    "proposeTransaction(swap-intent-approved)",
  );
  const account = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  const pending = account.pendingQueue[0];
  assert.ok(pending, "approved swap intent should be pending");
  assert.equal(pending.decision.approved, true);
  assert.equal(pending.txType, TX_TYPE_DEFI_SWAP);
  assert.equal(pending.recipientOrContract, "aura-test-swap-venue");
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
    "cancelPending(swap-intent-approved)",
  );

  const slippage = cloneProposalArgs(approved);
  slippage.actualOutputUsd = scenario.amountUsd;
  await assertDeniedProposal({
    scenario,
    label: "swap-slippage",
    args: slippage,
    expectedViolation: VIOLATION_SLIPPAGE_EXCEEDED,
    clearMode: "cancel",
  });

  const staleQuote = cloneProposalArgs(approved);
  staleQuote.quoteAgeSecs = new BN(301);
  await assertDeniedProposal({
    scenario,
    label: "swap-stale-quote",
    args: staleQuote,
    expectedViolation: VIOLATION_QUOTE_STALE,
    clearMode: "cancel",
  });

  const riskyCounterparty = cloneProposalArgs(approved);
  riskyCounterparty.counterpartyRiskScore = 100;
  await assertDeniedProposal({
    scenario,
    label: "swap-counterparty-risk",
    args: riskyCounterparty,
    expectedViolation: VIOLATION_COUNTERPARTY_RISK,
    clearMode: "cancel",
  });

  const blockedProtocol = cloneProposalArgs(approved);
  blockedProtocol.protocolId = PROTOCOL_BLOCKED;
  await assertDeniedProposal({
    scenario,
    label: "swap-protocol-not-allowed",
    args: blockedProtocol,
    expectedViolation: VIOLATION_PROTOCOL_NOT_ALLOWED,
    clearMode: "cancel",
  });
});
