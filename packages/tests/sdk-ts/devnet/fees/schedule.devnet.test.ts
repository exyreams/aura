/**
 * Devnet: treasury fee-schedule sidecar.
 *
 *   - init_fee_schedule (happy) + close_fee_schedule
 *   - update_fee_schedule (happy) + invalid-schedule reject (rate > 100%)
 *     + integrator-bps-without-protocol-config reject
 *
 * `protocolConfig` is an optional account; with it omitted (null) the program
 * requires integratorBps == 0. Skips when no funded payer.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveFeeScheduleAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  nowBN,
  type ProvisionedTreasury,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

/** A coherent, protocol-config-free fee schedule (integratorBps must be 0). */
export function feeSchedule(
  baseBps = 50,
  overrides: Record<string, unknown> = {},
) {
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
    ...overrides,
  };
}

let t: ProvisionedTreasury;
let feeScheduleAddr: ReturnType<typeof deriveFeeScheduleAddress>[0];

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "fee-sched" });
  [feeScheduleAddr] = deriveFeeScheduleAddress(t.treasury);
});

test("init_fee_schedule stores the initial schedule", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.fees.initFeeSchedule(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          feeSchedule: feeScheduleAddr,
          protocolConfig: null,
          systemProgram: SystemProgram.programId,
        },
        args: { schedule: feeSchedule(50), now: nowBN() },
      }),
    ],
    [],
    "initFeeSchedule",
  );
  const account = await accounts.fetchFeeScheduleAccount(
    client,
    feeScheduleAddr,
  );
  assert.equal(account.schedule.baseBps.toString(), "50");
});

test("update_fee_schedule replaces the stored schedule", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.fees.updateFeeSchedule(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          feeSchedule: feeScheduleAddr,
          protocolConfig: null,
        },
        args: { schedule: feeSchedule(125), now: nowBN() },
      }),
    ],
    [],
    "updateFeeSchedule",
  );
  const account = await accounts.fetchFeeScheduleAccount(
    client,
    feeScheduleAddr,
  );
  assert.equal(account.schedule.baseBps.toString(), "125");
});

test("update_fee_schedule rejects a rate over 100%", { skip }, async () => {
  const ix = await instructions.fees.updateFeeSchedule(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      feeSchedule: feeScheduleAddr,
      protocolConfig: null,
    },
    // baseBps 20000 (>10000) -> RateOutOfRange -> InvalidFeeSchedule
    args: { schedule: feeSchedule(20_000), now: nowBN() },
  });
  await expectSendToFail([ix], "rate > 100%");
});

test("update_fee_schedule rejects integrator bps without protocol config", {
  skip,
}, async () => {
  const ix = await instructions.fees.updateFeeSchedule(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      feeSchedule: feeScheduleAddr,
      protocolConfig: null,
    },
    // integratorBps != 0 with no protocolConfig -> IntegratorFeeOutOfBounds
    args: {
      schedule: feeSchedule(50, { integratorBps: new BN(10) }),
      now: nowBN(),
    },
  });
  await expectSendToFail([ix], "integrator bps without protocol config");
});

test("close_fee_schedule closes the sidecar", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.fees.closeFeeSchedule(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          feeSchedule: feeScheduleAddr,
        },
      }),
    ],
    [],
    "closeFeeSchedule",
  );
  assert.equal(
    await accounts.fetchFeeScheduleAccountNullable(client, feeScheduleAddr),
    null,
    "closed fee schedule should be gone",
  );
});
