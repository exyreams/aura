/**
 * Live scenario 18: guardian quorum approval on a funded proposal.
 *
 * The owner configures two generated guardians with a 2-of-2 spend quorum. A
 * live funded-context proposal requires multisig approval; one guardian is not
 * enough, the second satisfies the proposal, and the pending item is cancelled
 * without signing or broadcasting a token transfer.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, SystemProgram } from "@solana/web3.js";
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

const APPROVAL_GUARDIAN = 1;
const APPROVAL_MULTISIG = 2;
const APPROVAL_LEVEL_ERROR =
  /ApprovalLevelNotSatisfied|approval ladder level has not been satisfied|0x1799|simulation failed/i;

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

test("two guardians satisfy multisig approval for a funded-context proposal", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const guardianA = Keypair.generate();
  const guardianB = Keypair.generate();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-quorum",
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

  const configuredAt = nowBN();
  await sendLiveIxs(
    [
      await scenario.program.methods
        .configureMultisig({
          requiredSignatures: 2,
          guardians: [guardianA.publicKey, guardianB.publicKey],
          guardianWeights: [1, 1],
          requiredApprovalWeight: 2,
          timestamp: configuredAt,
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "configureMultisig(quorum live)",
  );
  let treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  assert.equal(treasury.multisig?.requiredSignatures, 2);
  assert.equal(treasury.multisig?.requiredApprovalWeight, 2);

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
          now: configuredAt.add(new BN(1)),
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "configureApprovalLadder(quorum live)",
  );

  const proposalArgs = baseTransferProposalArgs(scenario);
  proposalArgs.currentTimestamp = configuredAt.add(new BN(2));
  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeTransaction(proposalArgs)
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          dwalletState: null,
          ...PROPOSE_ACCOUNTS,
        })
        .instruction(),
    ],
    "proposeTransaction(quorum live)",
  );
  treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  let pending = treasury.pendingQueue[0];
  assert.ok(pending, "quorum proposal should be pending");
  assert.equal(pending.decision.approved, true);
  assert.equal(pending.requiredApprovalLevel, APPROVAL_MULTISIG);
  assert.equal(pending.satisfiedApprovalLevel, 0);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .approvePendingExecution({
          proposalId: pending.proposalId,
          approvalLevel: APPROVAL_MULTISIG,
          now: configuredAt.add(new BN(3)),
        })
        .accountsPartial({
          approver: guardianA.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "approvePendingExecution(guardian A live)",
    [guardianA],
  );
  treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  pending = treasury.pendingQueue[0];
  assert.ok(pending, "proposal should remain after first guardian");
  assert.equal(pending.approvals.length, 1);
  assert.equal(pending.satisfiedApprovalLevel, APPROVAL_GUARDIAN);

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .executePending(configuredAt.add(new BN(4)))
          .accountsPartial(executePendingAccounts(scenario))
          .instruction(),
      ],
      "executePending(one guardian live)",
    );
  }, APPROVAL_LEVEL_ERROR);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .approvePendingExecution({
          proposalId: pending.proposalId,
          approvalLevel: APPROVAL_MULTISIG,
          now: configuredAt.add(new BN(5)),
        })
        .accountsPartial({
          approver: guardianB.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "approvePendingExecution(guardian B live)",
    [guardianB],
  );
  treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  pending = treasury.pendingQueue[0];
  assert.ok(pending, "proposal should remain after quorum");
  assert.equal(pending.approvals.length, 2);
  assert.equal(pending.satisfiedApprovalLevel, APPROVAL_MULTISIG);

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
    "cancelPending(quorum live)",
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
