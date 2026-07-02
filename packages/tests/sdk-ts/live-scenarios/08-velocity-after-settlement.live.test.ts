/**
 * Live scenario 08: velocity limit after a committed transfer.
 *
 * Velocity checks need prior committed policy state. This scenario performs one
 * real dWallet-signed transfer, then proposes a second same-sized transfer that
 * must be denied by the velocity window without moving additional tokens.
 */

import { test } from "node:test";
import {
  assertDeniedProposal,
  baseTransferProposalArgs,
  executeApprovedLiveDwalletTransfer,
  prepareLiveAuraScenario,
  VIOLATION_VELOCITY_LIMIT,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";

test("denies a second transfer after committed velocity spend", {
  skip: liveScenarioSkip,
}, async () => {
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-velocity",
    policyOverrides: ({
      amountUsd,
      allowedPerTxUsd,
      defaultLargeLimitUsd,
    }) => ({
      perTxLimitUsd: allowedPerTxUsd,
      dailyLimitUsd: defaultLargeLimitUsd,
      daytimeHourlyLimitUsd: defaultLargeLimitUsd,
      nighttimeHourlyLimitUsd: defaultLargeLimitUsd,
      velocityLimitUsd: amountUsd,
      recipientDailyLimitUsd: defaultLargeLimitUsd,
      recipientPerTxLimitUsd: allowedPerTxUsd,
    }),
  });

  const first = await executeApprovedLiveDwalletTransfer(
    scenario,
    "velocity-primer-transfer",
  );
  scenario.beforeSource = first.afterSource;
  scenario.beforeDestination = first.afterDestination;

  await assertDeniedProposal({
    scenario,
    label: "velocity-second-transfer",
    args: baseTransferProposalArgs(scenario),
    expectedViolation: VIOLATION_VELOCITY_LIMIT,
    clearMode: "cancel",
  });
});
