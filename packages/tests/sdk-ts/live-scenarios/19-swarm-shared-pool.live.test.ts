/**
 * Live scenario 19: swarm shared-pool policy on funded proposals.
 *
 * The treasury joins a real swarm pool sidecar. A funded-context proposal is
 * denied while the shared pool cap is below the transfer amount, then approved
 * after the cap is raised. The proposal is cancelled before dWallet signing, so
 * no token transfer is broadcast.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSwarmPoolAddress } from "@aura-protocol/sdk-ts";
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

const VIOLATION_SHARED_POOL_LIMIT = 10;

test("swarm shared pool denies then allows funded-context proposals", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-swarm",
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
    "live transfer amount must exceed one USD cent for shared-pool denial",
  );

  const swarmId = `${scenario.agentId}-pool`;
  const [swarmPool] = deriveSwarmPoolAddress(
    swarmId,
    scenario.program.programId,
  );
  const lowLimit = scenario.amountUsd.sub(new BN(1));
  const highLimit = scenario.amountUsd.mul(new BN(10));
  const configuredAt = nowBN();

  await sendLiveIxs(
    [
      await scenario.program.methods
        .configureSwarm({
          swarmId,
          memberAgents: [scenario.agentId],
          sharedPoolLimitUsd: lowLimit,
          timestamp: configuredAt,
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "configureSwarm(low live)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .initSwarmPool({
          swarmId,
          sharedPoolLimitUsd: lowLimit,
          timestamp: configuredAt.add(new BN(1)),
        })
        .accountsPartial({
          creator: payer.publicKey,
          swarmPool,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "initSwarmPool(low live)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .joinSwarm(configuredAt.add(new BN(2)))
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          swarmPool,
        })
        .instruction(),
    ],
    "joinSwarm(live)",
  );

  let pool = await scenario.program.account.swarmPoolAccount.fetch(swarmPool);
  assert.equal(pool.memberCount, 1);
  assert.equal(pool.sharedPoolLimitUsd.toString(), lowLimit.toString());

  const deniedArgs = baseTransferProposalArgs(scenario);
  deniedArgs.currentTimestamp = configuredAt.add(new BN(3));
  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeTransaction(deniedArgs)
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          dwalletState: null,
          ...PROPOSE_ACCOUNTS,
          swarmPool,
        })
        .instruction(),
    ],
    "proposeTransaction(swarm low live)",
  );

  let treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  let pending = treasury.pendingQueue[0];
  assert.ok(pending, "shared-pool denial should be recorded");
  assert.equal(pending.decision.approved, false);
  assert.equal(pending.decision.violation, VIOLATION_SHARED_POOL_LIMIT);
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
    "cancelPending(swarm deny live)",
  );

  await sendLiveIxs(
    [
      await scenario.program.methods
        .updateSwarm(highLimit, configuredAt.add(new BN(4)))
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          swarmPool,
        })
        .instruction(),
    ],
    "updateSwarm(high live)",
  );
  pool = await scenario.program.account.swarmPoolAccount.fetch(swarmPool);
  assert.equal(pool.sharedPoolLimitUsd.toString(), highLimit.toString());

  const approvedArgs = baseTransferProposalArgs(scenario);
  approvedArgs.currentTimestamp = configuredAt.add(new BN(5));
  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeTransaction(approvedArgs)
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          dwalletState: null,
          ...PROPOSE_ACCOUNTS,
          swarmPool,
        })
        .instruction(),
    ],
    "proposeTransaction(swarm high live)",
  );
  treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  pending = treasury.pendingQueue[0];
  assert.ok(pending, "shared-pool approval should be recorded");
  assert.equal(pending.decision.approved, true);
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
    "cancelPending(swarm approve live)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .leaveSwarm(nowBN())
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          swarmPool,
        })
        .instruction(),
    ],
    "leaveSwarm(live)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .closeSwarmPool()
        .accountsPartial({
          creator: payer.publicKey,
          swarmPool,
        })
        .instruction(),
    ],
    "closeSwarmPool(live)",
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
