/**
 * Live scenario 03: policy-gated token transfer through the cached Ika dWallet.
 *
 * This suite intentionally lives outside `devnet/`. It moves real devnet test
 * tokens, so it requires:
 *
 *   AURA_LIVE_SCENARIOS_TEST=1 bun run live-scenarios:policy-transfer
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import { rawAmountToUi } from "../support/live/assets.js";
import {
  assertDeniedProposal,
  baseTransferProposalArgs,
  cloneProposalArgs,
  executeApprovedLiveDwalletTransfer,
  prepareLiveAuraScenario,
  VIOLATION_COUNTERPARTY_RISK,
  VIOLATION_PER_TRANSACTION_LIMIT,
  VIOLATION_QUOTE_STALE,
  VIOLATION_RECIPIENT_PER_TX_LIMIT,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

test("moves discovered test token through Aura policy and dWallet signing", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-policy-transfer",
  });
  const baseArgs = baseTransferProposalArgs(scenario);

  const overPerTxUsd = scenario.allowedPerTxUsd.add(new BN(1));
  const overPerTx = cloneProposalArgs(baseArgs);
  overPerTx.amountUsd = overPerTxUsd;
  overPerTx.expectedOutputUsd = overPerTxUsd;
  overPerTx.actualOutputUsd = overPerTxUsd;
  await assertDeniedProposal({
    scenario,
    label: "per-tx-limit",
    args: overPerTx,
    expectedViolation: VIOLATION_PER_TRANSACTION_LIMIT,
  });

  await assertDeniedProposal({
    scenario,
    label: "recipient-per-tx-limit",
    args: cloneProposalArgs(baseArgs),
    expectedViolation: VIOLATION_RECIPIENT_PER_TX_LIMIT,
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
    "setRecipientLimit(allow live transfer)",
  );

  const staleQuote = cloneProposalArgs(baseArgs);
  staleQuote.quoteAgeSecs = new BN(301);
  await assertDeniedProposal({
    scenario,
    label: "stale-quote",
    args: staleQuote,
    expectedViolation: VIOLATION_QUOTE_STALE,
  });

  const riskyCounterparty = cloneProposalArgs(baseArgs);
  riskyCounterparty.counterpartyRiskScore = 100;
  await assertDeniedProposal({
    scenario,
    label: "counterparty-risk",
    args: riskyCounterparty,
    expectedViolation: VIOLATION_COUNTERPARTY_RISK,
  });

  const result = await executeApprovedLiveDwalletTransfer(
    scenario,
    "policy-approved live transfer",
  );
  assert.equal(result.amountRaw, scenario.amountRaw);

  console.log("\n=== live scenario result ===");
  console.log(`transfer sig      : ${result.signature}`);
  console.log(
    `transfer amount   : ${rawAmountToUi(result.amountRaw, scenario.asset.decimals)}`,
  );
  console.log(`source after      : ${result.afterSource.uiAmountString}`);
  console.log(`recipient after   : ${result.afterDestination.uiAmountString}`);
});
