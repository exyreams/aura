/**
 * Live scenario 06: payroll-style funded payouts.
 *
 * This suite creates fresh recipient owners, sends real dWallet-signed payouts
 * to two of them, and verifies a capped payroll policy denies an over-limit
 * payment without moving tokens.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import BN from "bn.js";
import {
  assertDeniedProposal,
  baseTransferProposalArgs,
  cloneProposalArgs,
  executeApprovedLiveDwalletTransfer,
  prepareLiveAuraScenario,
  VIOLATION_RECIPIENT_PER_TX_LIMIT,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";

test("runs a two-recipient payroll and rejects an over-cap payout", {
  skip: liveScenarioSkip,
}, async () => {
  const employees = [
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
  ];
  const results = [];

  for (const [index, employee] of employees.entries()) {
    const payroll = await prepareLiveAuraScenario({
      prefix: `live-payroll-${index + 1}`,
      destinationOwner: employee,
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
    const result = await executeApprovedLiveDwalletTransfer(
      payroll,
      `payroll-recipient-${index + 1}`,
    );
    assert.equal(result.amountRaw, payroll.amountRaw);
    results.push(result);
  }

  assert.equal(results.length, 2);
  assert.ok(
    results.every((result) => result.signature.length > 0),
    "each payroll transfer should produce a signature",
  );

  const cappedEmployee = Keypair.generate().publicKey;
  const cappedPayroll = await prepareLiveAuraScenario({
    prefix: "live-payroll-cap",
    destinationOwner: cappedEmployee,
    policyOverrides: ({ defaultLargeLimitUsd, amountUsd }) => ({
      recipientDailyLimitUsd: defaultLargeLimitUsd,
      recipientPerTxLimitUsd: amountUsd.sub(new BN(1)),
    }),
  });
  await assertDeniedProposal({
    scenario: cappedPayroll,
    label: "payroll-recipient-cap",
    args: cloneProposalArgs(baseTransferProposalArgs(cappedPayroll)),
    expectedViolation: VIOLATION_RECIPIENT_PER_TX_LIMIT,
    clearMode: "cancel",
  });
});
