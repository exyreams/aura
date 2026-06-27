/**
 * Devnet: dWallet asset ledger and balance reconciliation.
 *
 * `record_deposit` credits the per-asset ledger on the runtime account
 * (accumulating onto an existing row), `set_asset_feed` attaches a price feed to
 * a tracked asset, and `reconcile_dwallet_balance` recomputes the aggregate USD
 * balance cached on the treasury's dWallet reference from that ledger.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { accounts, instructions } from "@aura-protocol/sdk-ts";
import { Keypair } from "@solana/web3.js";
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

let t: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "dw-bal" });
});

function depositArgs(
  chain: number,
  assetId: string,
  symbol: string,
  nativeAmount: bigint,
  usdValue: number,
) {
  return {
    chain,
    assetId,
    symbol,
    decimals: 6,
    nativeAmount: new BN(nativeAmount.toString()),
    usdValue: new BN(usdValue),
    now: nowBN(),
  };
}

test("record_deposit accumulates onto an existing asset row", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 30 });

  for (const usd of [1_000, 500]) {
    await sendAndConfirm(
      [
        await instructions.dwallet.recordDeposit(client, {
          accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
          args: depositArgs(
            chain,
            "usdc",
            "USDC",
            BigInt(usd) * 1_000_000n,
            usd,
          ),
        }),
      ],
      [],
      `recordDeposit($${usd})`,
    );
  }

  const state = await accounts.fetchDWalletAccount(client, dwalletState);
  const usdc = state.assets.find((a) => a.assetId === "usdc");
  assert.ok(usdc, "usdc row present");
  assert.equal(usdc.usdValue.toString(), "1500", "deposits accumulate");
  assert.equal(usdc.nativeAmount.toString(), "1500000000");
});

test("record_deposit tracks multiple distinct assets", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 31 });

  await sendAndConfirm(
    [
      await instructions.dwallet.recordDeposit(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: depositArgs(chain, "usdc", "USDC", 1_000_000n, 1_000),
      }),
    ],
    [],
    "recordDeposit(usdc)",
  );
  await sendAndConfirm(
    [
      await instructions.dwallet.recordDeposit(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: depositArgs(chain, "weth", "WETH", 2_000_000n, 6_000),
      }),
    ],
    [],
    "recordDeposit(weth)",
  );

  const state = await accounts.fetchDWalletAccount(client, dwalletState);
  const ids = state.assets.map((a) => a.assetId).sort();
  assert.deepEqual(ids, ["usdc", "weth"]);
});

test("set_asset_feed attaches a feed and rejects an untracked asset", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 32 });
  await sendAndConfirm(
    [
      await instructions.dwallet.recordDeposit(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: depositArgs(chain, "usdc", "USDC", 1_000_000n, 1_000),
      }),
    ],
    [],
    "recordDeposit(usdc)",
  );

  const feed = Keypair.generate().publicKey;
  await sendAndConfirm(
    [
      await instructions.dwallet.setAssetFeed(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: { chain, assetId: "usdc", feed, now: nowBN() },
      }),
    ],
    [],
    "setAssetFeed(usdc)",
  );

  // Setting a feed on an asset that was never deposited must revert.
  const ix = await instructions.dwallet.setAssetFeed(client, {
    accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
    args: { chain, assetId: "never-seen", feed, now: nowBN() },
  });
  await expectSendToFail([ix], "setAssetFeed untracked");
});

test("reconcile_dwallet_balance refreshes the treasury aggregate", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 33,
    deposit: {
      assetId: "usdc",
      symbol: "USDC",
      decimals: 6,
      nativeAmount: 1_000_000n,
      usdValue: 1_000,
    },
  });

  await sendAndConfirm(
    [
      await instructions.dwallet.reconcileDwalletBalance(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: { chain, now: nowBN() },
      }),
    ],
    [],
    "reconcileDwalletBalance",
  );

  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  const ref = account.dwallets.find((d) => d.chain === chain);
  assert.ok(ref, "treasury dWallet reference present");
  assert.equal(
    ref.balanceUsd.toString(),
    "1000",
    "aggregate reconciled to the per-asset ledger total",
  );
});
