/**
 * Live scenario 14: budget envelopes and exposure groups in funded context.
 *
 * These checks use the funded treasury/dWallet setup but do not sign or
 * broadcast token transfers. They prove budget and exposure sidecars hard-block
 * proposals before landing, then allow the same proposal after caps are raised.
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import {
  deriveBudgetEnvelopeAddress,
  deriveExposureGroupAddress,
} from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import { readTokenBalance } from "../support/live/assets.js";
import {
  baseTransferProposalArgs,
  CHAIN_SOLANA,
  PROPOSE_ACCOUNTS,
  prepareLiveAuraScenario,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

const SCOPE_CHAIN = 0;
const BUDGET_LIMIT_ERROR =
  /BudgetEnvelopeLimitExceeded|budget envelope limit exceeded|0x1798|simulation failed/i;
const BUDGET_IN_USE_ERROR =
  /BudgetEnvelopeInUse|budget envelope is referenced|0x17a6|simulation failed/i;
const EXPOSURE_UNAUTHORIZED_ERROR =
  /ExposureGroupUnauthorized|not a member of the exposure group|0x17a4|simulation failed/i;
const EXPOSURE_LIMIT_ERROR =
  /ExposureGroupLimitExceeded|cross-treasury exposure group limit exceeded|0x17a3|simulation failed/i;

test("budget and exposure sidecars gate funded-context proposals", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-budget",
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
    scenario.amountUsd.gt(new BN(1)),
    "live transfer amount must exceed one USD cent for cap-negative probes",
  );

  const baseArgs = baseTransferProposalArgs(scenario);
  const tooSmallLimit = scenario.amountUsd.sub(new BN(1));
  const generousLimit = scenario.amountUsd.mul(new BN(10));
  const envelopeBase = Date.now() + Math.floor(Math.random() * 10_000);

  const [lowBudgetEnvelope] = deriveBudgetEnvelopeAddress(
    scenario.treasury,
    envelopeBase,
    scenario.program.programId,
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .configureBudgetEnvelope({
          envelopeId: new BN(envelopeBase),
          scopeKind: SCOPE_CHAIN,
          chain: CHAIN_SOLANA,
          txType: null,
          protocolId: null,
          dailyLimitUsd: tooSmallLimit,
          weeklyLimitUsd: new BN(0),
          now: nowBN(),
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          budgetEnvelope: lowBudgetEnvelope,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "configureBudgetEnvelope(low live)",
  );

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .proposeTransaction(baseArgs)
          .accountsPartial({
            aiAuthority: payer.publicKey,
            treasury: scenario.treasury,
            dwalletState: null,
            ...PROPOSE_ACCOUNTS,
            budgetEnvelope: lowBudgetEnvelope,
          })
          .instruction(),
      ],
      "proposeTransaction(budget low live)",
    );
  }, BUDGET_LIMIT_ERROR);

  let treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  assert.equal(
    treasury.pendingQueue.length,
    0,
    "rejected budget probe must not leave a proposal",
  );

  await sendLiveIxs(
    [
      await scenario.program.methods
        .removeBudgetEnvelope(new BN(envelopeBase), nowBN())
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          budgetEnvelope: lowBudgetEnvelope,
        })
        .instruction(),
    ],
    "removeBudgetEnvelope(low live)",
  );

  const highEnvelopeId = envelopeBase + 1;
  const [highBudgetEnvelope] = deriveBudgetEnvelopeAddress(
    scenario.treasury,
    highEnvelopeId,
    scenario.program.programId,
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .configureBudgetEnvelope({
          envelopeId: new BN(highEnvelopeId),
          scopeKind: SCOPE_CHAIN,
          chain: CHAIN_SOLANA,
          txType: null,
          protocolId: null,
          dailyLimitUsd: generousLimit,
          weeklyLimitUsd: generousLimit,
          now: nowBN(),
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          budgetEnvelope: highBudgetEnvelope,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "configureBudgetEnvelope(high live)",
  );
  const envelope =
    await scenario.program.account.budgetEnvelopeAccount.fetch(
      highBudgetEnvelope,
    );
  assert.equal(envelope.dailyLimitUsd.toString(), generousLimit.toString());
  assert.equal(envelope.chain, CHAIN_SOLANA);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeTransaction(baseArgs)
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          dwalletState: null,
          ...PROPOSE_ACCOUNTS,
          budgetEnvelope: highBudgetEnvelope,
        })
        .instruction(),
    ],
    "proposeTransaction(budget high live)",
  );
  treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  assert.equal(treasury.pendingQueue[0]?.decision.approved, true);

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .removeBudgetEnvelope(new BN(highEnvelopeId), nowBN())
          .accountsPartial({
            owner: payer.publicKey,
            treasury: scenario.treasury,
            budgetEnvelope: highBudgetEnvelope,
          })
          .instruction(),
      ],
      "removeBudgetEnvelope(in-use live)",
    );
  }, BUDGET_IN_USE_ERROR);

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
    "cancelPending(budget live)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .removeBudgetEnvelope(new BN(highEnvelopeId), nowBN())
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          budgetEnvelope: highBudgetEnvelope,
        })
        .instruction(),
    ],
    "removeBudgetEnvelope(high live)",
  );

  const groupId = new Uint8Array(randomBytes(16));
  const [exposureGroup] = deriveExposureGroupAddress(
    payer.publicKey,
    groupId,
    scenario.program.programId,
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .initExposureGroup({
          groupId: Array.from(groupId),
          dailyLimitUsd: tooSmallLimit,
          nowDay: nowBN(),
        })
        .accountsPartial({
          authority: payer.publicKey,
          exposureGroup,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "initExposureGroup(low live)",
  );

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .proposeTransaction(baseArgs)
          .accountsPartial({
            aiAuthority: payer.publicKey,
            treasury: scenario.treasury,
            dwalletState: null,
            ...PROPOSE_ACCOUNTS,
            exposureGroup,
          })
          .instruction(),
      ],
      "proposeTransaction(exposure unauthorized live)",
    );
  }, EXPOSURE_UNAUTHORIZED_ERROR);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .joinExposureGroup()
        .accountsPartial({
          authority: payer.publicKey,
          exposureGroup,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "joinExposureGroup(live)",
  );
  let group =
    await scenario.program.account.exposureGroupAccount.fetch(exposureGroup);
  assert.equal(group.memberCount, 1);

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .proposeTransaction(baseArgs)
          .accountsPartial({
            aiAuthority: payer.publicKey,
            treasury: scenario.treasury,
            dwalletState: null,
            ...PROPOSE_ACCOUNTS,
            exposureGroup,
          })
          .instruction(),
      ],
      "proposeTransaction(exposure low live)",
    );
  }, EXPOSURE_LIMIT_ERROR);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .updateExposureGroup(generousLimit)
        .accountsPartial({
          authority: payer.publicKey,
          exposureGroup,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "updateExposureGroup(high live)",
  );
  group =
    await scenario.program.account.exposureGroupAccount.fetch(exposureGroup);
  assert.equal(group.dailyLimitUsd.toString(), generousLimit.toString());

  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeTransaction(baseArgs)
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          dwalletState: null,
          ...PROPOSE_ACCOUNTS,
          exposureGroup,
        })
        .instruction(),
    ],
    "proposeTransaction(exposure high live)",
  );
  treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  assert.equal(treasury.pendingQueue[0]?.decision.approved, true);

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
    "cancelPending(exposure live)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .leaveExposureGroup()
        .accountsPartial({
          authority: payer.publicKey,
          exposureGroup,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "leaveExposureGroup(live)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .closeExposureGroup()
        .accountsPartial({
          authority: payer.publicKey,
          exposureGroup,
        })
        .instruction(),
    ],
    "closeExposureGroup(live)",
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
