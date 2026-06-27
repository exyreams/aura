/**
 * Devnet: dWallet outbound-spend reservation lifecycle.
 *
 * `reserve_dwallet_spend` locks available balance ahead of an outbound
 * proposal; `settle_dwallet_spend` consumes it (debiting the asset and bumping
 * the daily counter) and `release_dwallet_spend` returns it untouched. Covers
 * the happy paths plus every guard: insufficient balance, per-tx limit, frozen
 * status, and reservation underflow.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { accounts, instructions } from "@aura-protocol/sdk-ts";
import BN from "bn.js";
import {
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  nowBN,
  type ProvisionedTreasury,
  provisionDwallet,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

const STATUS_FROZEN = 3;

/** A funded-dWallet deposit: 1 USDC-equivalent unit per USD, $1000 total. */
function deposit(usdValue = 1_000) {
  return {
    assetId: "usdc",
    symbol: "USDC",
    decimals: 6,
    nativeAmount: BigInt(usdValue) * 1_000_000n,
    usdValue,
  };
}

let t: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "dw-spend" });
});

test("reserve then release round-trips a reservation", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 20,
    deposit: deposit(),
  });

  await sendAndConfirm(
    [
      await instructions.dwallet.reserveDwalletSpend(client, {
        accounts: { authority: t.owner, treasury: t.treasury, dwalletState },
        args: { chain, amountUsd: new BN(400), now: nowBN() },
      }),
    ],
    [],
    "reserveDwalletSpend",
  );
  let state = await accounts.fetchDWalletAccount(client, dwalletState);
  assert.equal(state.reservedUsd.toString(), "400");

  await sendAndConfirm(
    [
      await instructions.dwallet.releaseDwalletSpend(client, {
        accounts: { authority: t.owner, treasury: t.treasury, dwalletState },
        args: { chain, amountUsd: new BN(400), now: nowBN() },
      }),
    ],
    [],
    "releaseDwalletSpend",
  );
  state = await accounts.fetchDWalletAccount(client, dwalletState);
  assert.equal(state.reservedUsd.toString(), "0");
});

test("reserve then settle consumes the reservation and debits the asset", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 21,
    deposit: deposit(),
  });

  await sendAndConfirm(
    [
      await instructions.dwallet.reserveDwalletSpend(client, {
        accounts: { authority: t.owner, treasury: t.treasury, dwalletState },
        args: { chain, amountUsd: new BN(300), now: nowBN() },
      }),
    ],
    [],
    "reserveDwalletSpend",
  );

  await sendAndConfirm(
    [
      await instructions.dwallet.settleDwalletSpend(client, {
        accounts: { authority: t.owner, treasury: t.treasury, dwalletState },
        args: {
          chain,
          amountUsd: new BN(300),
          assetId: "usdc",
          nativeAmount: new BN(300_000_000),
          now: nowBN(),
        },
      }),
    ],
    [],
    "settleDwalletSpend",
  );

  const state = await accounts.fetchDWalletAccount(client, dwalletState);
  assert.equal(state.reservedUsd.toString(), "0", "reservation consumed");
  assert.equal(state.spentTodayUsd.toString(), "300", "daily counter bumped");
  const usdc = state.assets.find((a) => a.assetId === "usdc");
  assert.ok(usdc, "usdc asset row present");
  assert.equal(usdc.usdValue.toString(), "700", "asset usd debited");
});

test("reserve beyond available balance is rejected", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 22,
    deposit: deposit(1_000),
  });
  const ix = await instructions.dwallet.reserveDwalletSpend(client, {
    accounts: { authority: t.owner, treasury: t.treasury, dwalletState },
    args: { chain, amountUsd: new BN(2_000), now: nowBN() },
  });
  await expectSendToFail([ix], "reserve over balance");
});

test("reserve beyond the per-tx limit is rejected", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 23,
    deposit: deposit(1_000),
  });
  await sendAndConfirm(
    [
      await instructions.dwallet.setDwalletLimits(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: {
          chain,
          dailyLimitUsd: null,
          perTxLimitUsd: new BN(500),
          now: nowBN(),
        },
      }),
    ],
    [],
    "setDwalletLimits(perTx=500)",
  );
  // 600 is within balance but over the 500 per-tx cap -> DWalletLimitExceeded.
  const ix = await instructions.dwallet.reserveDwalletSpend(client, {
    accounts: { authority: t.owner, treasury: t.treasury, dwalletState },
    args: { chain, amountUsd: new BN(600), now: nowBN() },
  });
  await expectSendToFail([ix], "reserve over per-tx limit");
});

test("reserve on a frozen dWallet is rejected", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 24,
    deposit: deposit(1_000),
  });
  await sendAndConfirm(
    [
      await instructions.dwallet.setDwalletStatus(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: { chain, statusCode: STATUS_FROZEN, now: nowBN() },
      }),
    ],
    [],
    "setDwalletStatus(freeze)",
  );
  const ix = await instructions.dwallet.reserveDwalletSpend(client, {
    accounts: { authority: t.owner, treasury: t.treasury, dwalletState },
    args: { chain, amountUsd: new BN(100), now: nowBN() },
  });
  await expectSendToFail([ix], "reserve while frozen");
});

test("settling more than reserved underflows", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 25,
    deposit: deposit(1_000),
  });
  await sendAndConfirm(
    [
      await instructions.dwallet.reserveDwalletSpend(client, {
        accounts: { authority: t.owner, treasury: t.treasury, dwalletState },
        args: { chain, amountUsd: new BN(100), now: nowBN() },
      }),
    ],
    [],
    "reserveDwalletSpend",
  );
  const ix = await instructions.dwallet.settleDwalletSpend(client, {
    accounts: { authority: t.owner, treasury: t.treasury, dwalletState },
    args: {
      chain,
      amountUsd: new BN(200),
      assetId: "usdc",
      nativeAmount: new BN(200_000_000),
      now: nowBN(),
    },
  });
  await expectSendToFail([ix], "settle over reserved");
});

test("releasing more than reserved underflows", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 26,
    deposit: deposit(1_000),
  });
  // Nothing reserved yet; releasing must revert with ReservationUnderflow.
  const ix = await instructions.dwallet.releaseDwalletSpend(client, {
    accounts: { authority: t.owner, treasury: t.treasury, dwalletState },
    args: { chain, amountUsd: new BN(100), now: nowBN() },
  });
  await expectSendToFail([ix], "release over reserved");
});
