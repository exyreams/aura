/**
 * Live scenario 20: fee vault accrual and collection on a real dWallet approval.
 *
 * A policy-only proposal is approved through the live Ika dWallet path with a
 * fee schedule and prepaid fee vault attached to finalize_execution. No token
 * transfer is broadcast; the scenario proves the fee bucket accrues, blocks
 * premature vault closure, collects to the configured recipient, and cleans up.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveFeeScheduleAddress,
  deriveFeeVaultAddress,
} from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import { readTokenBalance } from "../support/live/assets.js";
import {
  baseTransferProposalArgs,
  executeApprovedLivePolicyProposal,
  prepareLiveAuraScenario,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

const CLOSE_WITH_ACCRUED_FEES_ERROR =
  /NoPendingTransaction|no pending transaction|0x1775|simulation failed/i;

function feeSchedule(baseBps: number) {
  return {
    baseBps: new BN(baseBps),
    perTypeBps: [],
    tiers: [],
    minFeeUsd: new BN(0),
    maxFeeUsd: null,
    creationFeeUsd: new BN(0),
    subscriptionUsdPerPeriod: new BN(0),
    subscriptionPeriodSecs: new BN(0),
    aumBpsPerPeriod: new BN(0),
    fheSubsidyBps: new BN(0),
    reputationDiscountBps: new BN(0),
    referralDiscountBps: new BN(0),
    discountCapBps: new BN(0),
    integratorBps: new BN(0),
    ownerSurchargeBps: new BN(0),
  };
}

test("fee vault accrues and collects after live dWallet finalization", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-fees",
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
  assert.ok(
    scenario.amountUsd.gt(new BN(0)),
    "live amount must be nonzero for fee accrual",
  );

  const [feeVault] = deriveFeeVaultAddress(
    scenario.treasury,
    scenario.program.programId,
  );
  const [feeScheduleAddr] = deriveFeeScheduleAddress(
    scenario.treasury,
    scenario.program.programId,
  );
  const expectedFee = scenario.amountUsd;
  const prepaidFeeBalance = expectedFee.mul(new BN(2)).add(new BN(10_000));

  await sendLiveIxs(
    [
      await scenario.program.methods
        .initFeeVault(payer.publicKey, nowBN())
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          feeVault,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "initFeeVault(live accrual)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .initFeeSchedule(feeSchedule(10_000), nowBN())
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          feeSchedule: feeScheduleAddr,
          protocolConfig: null,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "initFeeSchedule(live accrual)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .depositFees(prepaidFeeBalance)
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          feeVault,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "depositFees(live accrual)",
  );

  let vault = await scenario.program.account.feeVaultAccount.fetch(feeVault);
  assert.equal(vault.feeBalance.toString(), prepaidFeeBalance.toString());
  assert.equal(vault.accumulatedFeesLamports.toString(), "0");

  await executeApprovedLivePolicyProposal({
    scenario,
    args: baseTransferProposalArgs(scenario),
    label: "fee accrual live",
    finalizeAccounts: {
      feeVault,
      feeSchedule: feeScheduleAddr,
      protocolConfig: null,
    },
  });

  vault = await scenario.program.account.feeVaultAccount.fetch(feeVault);
  assert.equal(
    vault.accumulatedFeesLamports.toString(),
    expectedFee.toString(),
    "finalize_execution should accrue the scheduled fee",
  );
  assert.equal(
    vault.feeBalance.toString(),
    prepaidFeeBalance.sub(expectedFee).toString(),
    "accrual debits prepaid fee balance",
  );

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .closeFeeVault()
          .accountsPartial({
            owner: payer.publicKey,
            treasury: scenario.treasury,
            feeVault,
          })
          .instruction(),
      ],
      "closeFeeVault(accrued live)",
    );
  }, CLOSE_WITH_ACCRUED_FEES_ERROR);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .collectFees(nowBN())
        .accountsPartial({
          protocolAuthority: payer.publicKey,
          feeVault,
          recipient: payer.publicKey,
        })
        .instruction(),
    ],
    "collectFees(live accrual)",
  );
  vault = await scenario.program.account.feeVaultAccount.fetch(feeVault);
  assert.equal(vault.accumulatedFeesLamports.toString(), "0");
  assert.equal(vault.feeCount.toString(), "1");

  await sendLiveIxs(
    [
      await scenario.program.methods
        .closeFeeSchedule()
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          feeSchedule: feeScheduleAddr,
        })
        .instruction(),
    ],
    "closeFeeSchedule(live accrual)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .closeFeeVault()
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          feeVault,
        })
        .instruction(),
    ],
    "closeFeeVault(live accrual)",
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
