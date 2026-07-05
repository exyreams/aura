/**
 * Live scenario 15: approval ladder metadata and policy receipts.
 *
 * This uses a funded treasury/dWallet context but does not sign or broadcast a
 * token transfer. It proves approval requirements are attached to live
 * proposals, receipts snapshot those requirements, and timelock proposals are
 * blocked before the configured unlock time.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { derivePolicyReceiptAddress } from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import { readTokenBalance } from "../support/live/assets.js";
import {
  baseTransferProposalArgs,
  PROPOSE_ACCOUNTS,
  prepareLiveAuraScenario,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

const APPROVAL_NONE = 0;
const APPROVAL_MULTISIG = 2;
const APPROVAL_TIMELOCK = 3;
const APPROVAL_LEVEL_ERROR =
  /ApprovalLevelNotSatisfied|approval ladder level has not been satisfied|0x1799|simulation failed/i;
const TIMELOCK_ERROR =
  /PendingExecutionTimelockActive|pending execution timelock is still active|0x179a|simulation failed/i;

function executePendingAccounts(
  scenario: Awaited<ReturnType<typeof prepareLiveAuraScenario>>,
) {
  const payer = getPayer();
  return {
    operator: payer.publicKey,
    treasury: scenario.treasury,
    messageApproval: null,
    dwallet: null,
    callerProgram: scenario.program.programId,
    cpiAuthority: null,
    dwalletProgram: null,
    dwalletCoordinator: null,
    externalLiveness: null,
    dwalletState: null,
    systemProgram: SystemProgram.programId,
  };
}

test("approval ladder and receipts annotate funded-context proposals", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-approvals",
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
    scenario.amountUsd.gt(new BN(2)),
    "live transfer amount must exceed two USD cents for dynamic thresholds",
  );

  const multisigSubmittedAt = nowBN();
  await sendLiveIxs(
    [
      await scenario.program.methods
        .configureApprovalLadder({
          guardianAboveUsd: new BN(1),
          multisigAboveUsd: scenario.amountUsd,
          timelockAboveUsd: scenario.amountUsd.add(new BN(1_000)),
          denyAboveUsd: scenario.amountUsd.add(new BN(2_000)),
          riskGuardianBps: 8_000,
          riskMultisigBps: 9_000,
          riskTimelockBps: 9_500,
          timelockSecs: new BN(60),
          now: multisigSubmittedAt,
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "configureApprovalLadder(multisig live)",
  );

  const multisigArgs = baseTransferProposalArgs(scenario);
  multisigArgs.currentTimestamp = multisigSubmittedAt.add(new BN(1));
  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeTransaction(multisigArgs)
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          dwalletState: null,
          ...PROPOSE_ACCOUNTS,
        })
        .instruction(),
    ],
    "proposeTransaction(multisig approval live)",
  );

  let treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  let pending = treasury.pendingQueue[0];
  assert.ok(pending, "multisig proposal should be pending");
  assert.equal(pending.decision.approved, true);
  assert.equal(pending.requiredApprovalLevel, APPROVAL_MULTISIG);
  assert.equal(pending.satisfiedApprovalLevel, APPROVAL_NONE);

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .executePending(multisigSubmittedAt.add(new BN(2)))
          .accountsPartial(executePendingAccounts(scenario))
          .instruction(),
      ],
      "executePending(approval missing live)",
    );
  }, APPROVAL_LEVEL_ERROR);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .approvePendingExecution({
          proposalId: pending.proposalId,
          approvalLevel: APPROVAL_MULTISIG,
          now: multisigSubmittedAt.add(new BN(3)),
        })
        .accountsPartial({
          approver: payer.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "approvePendingExecution(multisig live)",
  );

  treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  pending = treasury.pendingQueue[0];
  assert.ok(pending, "approved proposal should remain pending");
  assert.ok(
    pending.satisfiedApprovalLevel >= pending.requiredApprovalLevel,
    "owner approval should satisfy multisig level without configured guardians",
  );
  assert.equal(pending.approvals.length, 1);

  const [receipt] = derivePolicyReceiptAddress(
    scenario.treasury,
    pending.proposalId.toString(),
    scenario.program.programId,
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .writePolicyReceipt({
          proposalId: pending.proposalId,
          now: multisigSubmittedAt.add(new BN(4)),
        })
        .accountsPartial({
          payer: payer.publicKey,
          treasury: scenario.treasury,
          receipt,
          attestation: null,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "writePolicyReceipt(multisig live)",
  );

  const policyReceipt =
    await scenario.program.account.policyReceiptAccount.fetch(receipt);
  assert.equal(
    policyReceipt.proposalId.toString(),
    pending.proposalId.toString(),
  );
  assert.equal(policyReceipt.requiredApprovalLevel, APPROVAL_MULTISIG);
  assert.equal(policyReceipt.satisfiedApprovalLevel, APPROVAL_MULTISIG);
  assert.equal(
    policyReceipt.evaluatedAmountUsd.toString(),
    scenario.amountUsd.toString(),
  );
  assert.equal(policyReceipt.policyAttested, false);

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
    "cancelPending(multisig approval live)",
  );

  const timelockSecs = new BN(90);
  const timelockSubmittedAt = multisigSubmittedAt.add(new BN(10));
  await sendLiveIxs(
    [
      await scenario.program.methods
        .configureApprovalLadder({
          guardianAboveUsd: new BN(1),
          multisigAboveUsd: new BN(2),
          timelockAboveUsd: scenario.amountUsd,
          denyAboveUsd: scenario.amountUsd.add(new BN(2_000)),
          riskGuardianBps: 8_000,
          riskMultisigBps: 9_000,
          riskTimelockBps: 9_500,
          timelockSecs,
          now: timelockSubmittedAt,
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "configureApprovalLadder(timelock live)",
  );

  const timelockArgs = baseTransferProposalArgs(scenario);
  timelockArgs.currentTimestamp = timelockSubmittedAt.add(new BN(1));
  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeTransaction(timelockArgs)
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          dwalletState: null,
          ...PROPOSE_ACCOUNTS,
        })
        .instruction(),
    ],
    "proposeTransaction(timelock live)",
  );

  treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  pending = treasury.pendingQueue[0];
  assert.ok(pending, "timelock proposal should be pending");
  assert.equal(pending.requiredApprovalLevel, APPROVAL_TIMELOCK);
  assert.equal(pending.satisfiedApprovalLevel, APPROVAL_TIMELOCK);
  assert.equal(
    pending.earliestExecutionAt.toString(),
    timelockArgs.currentTimestamp.add(timelockSecs).toString(),
  );

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .executePending(pending.earliestExecutionAt.sub(new BN(1)))
          .accountsPartial(executePendingAccounts(scenario))
          .instruction(),
      ],
      "executePending(timelock early live)",
    );
  }, TIMELOCK_ERROR);

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
    "cancelPending(timelock live)",
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
