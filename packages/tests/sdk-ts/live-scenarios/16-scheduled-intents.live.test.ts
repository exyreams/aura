/**
 * Live scenario 16: scheduled-intent automation with funded context.
 *
 * A due scheduled transfer is promoted into the normal pending queue against a
 * real funded treasury/dWallet context. The promoted proposal is cancelled and
 * the in-flight slot is cleared, so no token transfer is signed or broadcast.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveScheduledIntentAddress } from "@aura-protocol/sdk-ts";
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

test("scheduled intent promotes a due funded-context transfer then clears it", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-schedule",
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
  const intentId = Date.now() + Math.floor(Math.random() * 10_000);
  const [scheduledIntent] = deriveScheduledIntentAddress(
    scenario.treasury,
    intentId,
    scenario.program.programId,
  );
  const startAt = nowBN().sub(new BN(120));
  const intervalSecs = new BN(3_600);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .createScheduledIntent(new BN(intentId), {
          kind: 0,
          chain: CHAIN_SOLANA,
          txType: TX_TYPE_TRANSFER,
          intervalSecs,
          startAt,
          endAt: null,
          maxRuns: null,
          perRunLimitUsd: scenario.allowedPerTxUsd,
          totalBudgetUsd: scenario.allowedPerTxUsd.mul(new BN(3)),
          recipients: [
            {
              address: scenario.destinationOwner.toBase58(),
              amountUsd: new BN(0),
            },
          ],
          amountUsd: scenario.amountUsd,
          skipOnDeny: false,
          catchUp: false,
          keeper: null,
          conditions: [],
          combinator: 0,
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          scheduledIntent,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "createScheduledIntent(live due)",
  );

  let intent =
    await scenario.program.account.scheduledIntent.fetch(scheduledIntent);
  assert.equal(intent.enabled, true);
  assert.equal(intent.nextRunAt.toString(), startAt.toString());
  assert.equal(intent.amountUsd.toString(), scenario.amountUsd.toString());
  assert.equal(intent.inFlightProposalId, null);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .executeScheduledIntent()
        .accountsPartial({
          caller: payer.publicKey,
          treasury: scenario.treasury,
          scheduledIntent,
          conditionFeed: null,
        })
        .instruction(),
    ],
    "executeScheduledIntent(live due)",
  );

  intent =
    await scenario.program.account.scheduledIntent.fetch(scheduledIntent);
  assert.ok(
    intent.inFlightProposalId !== null,
    "due run should be marked in-flight",
  );
  assert.equal(intent.inFlightUsd.toString(), scenario.amountUsd.toString());
  assert.equal(
    intent.runsCompleted,
    0,
    "runs only complete after normal settlement",
  );

  let treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  const pending = treasury.pendingQueue[0];
  assert.ok(pending, "scheduled run should promote a pending proposal");
  assert.equal(
    pending.proposalId.toString(),
    intent.inFlightProposalId?.toString(),
  );
  assert.equal(pending.decision.approved, true);
  assert.equal(pending.targetChain, CHAIN_SOLANA);
  assert.equal(pending.txType, TX_TYPE_TRANSFER);
  assert.equal(
    pending.recipientOrContract,
    scenario.destinationOwner.toBase58(),
  );
  assert.equal(pending.amountUsd.toString(), scenario.amountUsd.toString());

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
    "cancelPending(scheduled live)",
  );
  treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  assert.equal(treasury.pendingQueue.length, 0);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .clearScheduledIntentInFlight(pending.proposalId, nowBN())
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          scheduledIntent,
        })
        .instruction(),
    ],
    "clearScheduledIntentInFlight(live)",
  );
  intent =
    await scenario.program.account.scheduledIntent.fetch(scheduledIntent);
  assert.equal(intent.inFlightProposalId, null);
  assert.equal(intent.inFlightUsd.toString(), "0");

  await sendLiveIxs(
    [
      await scenario.program.methods
        .closeScheduledIntent()
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          scheduledIntent,
        })
        .instruction(),
    ],
    "closeScheduledIntent(live)",
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
