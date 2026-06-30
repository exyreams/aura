/**
 * Devnet: dWallet oracle feeds and off-chain balance refresh paths.
 *
 * Covers the four owner/authority-gated instructions the other dWallet suites
 * don't touch:
 *   - refresh_asset_balance          — push a full asset row (native + USD +
 *                                      feed), replacing any existing row in
 *                                      place (it does not accumulate).
 *   - set_asset_oracle_feed          — attach or clear a verified price-feed
 *                                      descriptor, with provider validation.
 *   - refresh_verified_asset_balance — recompute USD from a stored verified
 *                                      feed (failure path only; the success
 *                                      path needs a live Pyth/Switchboard feed
 *                                      account, which devnet doesn't provide
 *                                      deterministically).
 *   - refresh_dwallet_balance        — pull the aggregate USD from an authorized
 *                                      balance-oracle account (failure paths
 *                                      only; there is no instruction to
 *                                      authorize an oracle on the reference, so
 *                                      the success path is unreachable today).
 *
 * Each test uses its own chain code so they never collide on one treasury.
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { accounts, instructions } from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
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

// OracleProvider storage codes.
const PROVIDER_PYTH = 0; // trusted
const PROVIDER_RAW_LEGACY = 255; // untrusted

/** A funded-dWallet USDC deposit row. */
function usdcDeposit(usdValue = 1_000) {
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
  t = await provisionTreasury({ prefix: "dw-oracle" });
});

test("refresh_asset_balance upserts a full asset row in place", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 40 });
  const feed1 = Keypair.generate().publicKey;
  const feed2 = Keypair.generate().publicKey;

  await sendAndConfirm(
    [
      await instructions.dwallet.refreshAssetBalance(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: {
          chain,
          assetId: "usdc",
          symbol: "USDC",
          decimals: 6,
          nativeAmount: new BN(1_000_000),
          usdValue: new BN(1_000),
          feed: feed1,
          now: nowBN(),
        },
      }),
    ],
    [],
    "refreshAssetBalance(insert)",
  );
  let state = await accounts.fetchDWalletAccount(client, dwalletState);
  let usdc = state.assets.find((a) => a.assetId === "usdc");
  assert.ok(usdc, "usdc row present");
  assert.equal(usdc.nativeAmount.toString(), "1000000");
  assert.equal(usdc.usdValue.toString(), "1000");
  assert.equal(usdc.feed?.toBase58(), feed1.toBase58());

  // A second refresh replaces the row in place (contrast with record_deposit,
  // which accumulates onto the existing row).
  await sendAndConfirm(
    [
      await instructions.dwallet.refreshAssetBalance(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: {
          chain,
          assetId: "usdc",
          symbol: "USDC",
          decimals: 6,
          nativeAmount: new BN(2_000_000),
          usdValue: new BN(2_000),
          feed: feed2,
          now: nowBN(),
        },
      }),
    ],
    [],
    "refreshAssetBalance(overwrite)",
  );
  state = await accounts.fetchDWalletAccount(client, dwalletState);
  usdc = state.assets.find((a) => a.assetId === "usdc");
  assert.ok(usdc, "usdc row still present");
  assert.equal(
    usdc.nativeAmount.toString(),
    "2000000",
    "row replaced, not accumulated",
  );
  assert.equal(usdc.usdValue.toString(), "2000");
  assert.equal(usdc.feed?.toBase58(), feed2.toBase58());
  assert.equal(
    state.assets.filter((a) => a.assetId === "usdc").length,
    1,
    "still a single usdc row",
  );
});

test("refresh_asset_balance rejects an over-long asset id", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 41 });
  const ix = await instructions.dwallet.refreshAssetBalance(client, {
    accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
    args: {
      chain,
      assetId: "a".repeat(65), // > 64 bytes -> InvalidExternalAccountData
      symbol: "X",
      decimals: 6,
      nativeAmount: new BN(1),
      usdValue: new BN(1),
      feed: null,
      now: nowBN(),
    },
  });
  await expectSendToFail([ix], "assetId > 64 bytes");
});

test("set_asset_oracle_feed attaches a trusted feed to a tracked asset", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 42,
    deposit: usdcDeposit(),
  });
  const feed = Keypair.generate().publicKey;
  const programId = Keypair.generate().publicKey;

  await sendAndConfirm(
    [
      await instructions.dwallet.setAssetOracleFeed(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: {
          chain,
          args: {
            assetId: "usdc",
            provider: PROVIDER_PYTH,
            feed,
            programId,
            maxStalenessSecs: new BN(60),
            maxConfidenceBps: 100,
            expoExpected: null,
            now: nowBN(),
          },
        },
      }),
    ],
    [],
    "setAssetOracleFeed(pyth)",
  );

  const state = await accounts.fetchDWalletAccount(client, dwalletState);
  const usdc = state.assets.find((a) => a.assetId === "usdc");
  assert.ok(usdc, "usdc row present");
  assert.equal(
    usdc.feed?.toBase58(),
    feed.toBase58(),
    "verified feed attached",
  );
});

test("set_asset_oracle_feed rejects a trusted provider without a feed", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 43,
    deposit: usdcDeposit(),
  });
  // Pyth is trusted, so a feed account (and program id, staleness, confidence)
  // is mandatory -> OracleAccountInvalid.
  const ix = await instructions.dwallet.setAssetOracleFeed(client, {
    accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
    args: {
      chain,
      args: {
        assetId: "usdc",
        provider: PROVIDER_PYTH,
        feed: null,
        programId: null,
        maxStalenessSecs: new BN(60),
        maxConfidenceBps: 100,
        expoExpected: null,
        now: nowBN(),
      },
    },
  });
  await expectSendToFail([ix], "trusted provider without feed");
});

test("set_asset_oracle_feed rejects an unknown provider code", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 44,
    deposit: usdcDeposit(),
  });
  const ix = await instructions.dwallet.setAssetOracleFeed(client, {
    accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
    args: {
      chain,
      args: {
        assetId: "usdc",
        provider: 7, // not a known OracleProvider code
        feed: null,
        programId: null,
        maxStalenessSecs: new BN(60),
        maxConfidenceBps: 100,
        expoExpected: null,
        now: nowBN(),
      },
    },
  });
  await expectSendToFail([ix], "unknown provider code");
});

test("set_asset_oracle_feed rejects a negative staleness window", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 45,
    deposit: usdcDeposit(),
  });
  const feed = Keypair.generate().publicKey;
  const programId = Keypair.generate().publicKey;
  const ix = await instructions.dwallet.setAssetOracleFeed(client, {
    accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
    args: {
      chain,
      args: {
        assetId: "usdc",
        provider: PROVIDER_PYTH,
        feed,
        programId,
        maxStalenessSecs: new BN(-1), // must be >= 0
        maxConfidenceBps: 100,
        expoExpected: null,
        now: nowBN(),
      },
    },
  });
  await expectSendToFail([ix], "negative staleness window");
});

test("set_asset_oracle_feed clears a feed via the untrusted RawLegacy provider", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 46,
    deposit: usdcDeposit(),
  });
  // Attach a feed first so there is something to clear.
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

  // RawLegacy is untrusted, so the feed/program/staleness/confidence guards are
  // skipped and a null feed simply clears the descriptor.
  await sendAndConfirm(
    [
      await instructions.dwallet.setAssetOracleFeed(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: {
          chain,
          args: {
            assetId: "usdc",
            provider: PROVIDER_RAW_LEGACY,
            feed: null,
            programId: null,
            maxStalenessSecs: new BN(0),
            maxConfidenceBps: 0,
            expoExpected: null,
            now: nowBN(),
          },
        },
      }),
    ],
    [],
    "setAssetOracleFeed(raw-legacy clear)",
  );

  const state = await accounts.fetchDWalletAccount(client, dwalletState);
  const usdc = state.assets.find((a) => a.assetId === "usdc");
  assert.ok(usdc, "usdc row present");
  assert.equal(usdc.feed, null, "feed cleared");
});

test("set_asset_oracle_feed rejects an untracked asset", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 47 });
  const feed = Keypair.generate().publicKey;
  const programId = Keypair.generate().publicKey;
  // No asset was ever deposited, so set_asset_feed has nothing to attach to.
  const ix = await instructions.dwallet.setAssetOracleFeed(client, {
    accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
    args: {
      chain,
      args: {
        assetId: "never-seen",
        provider: PROVIDER_PYTH,
        feed,
        programId,
        maxStalenessSecs: new BN(60),
        maxConfidenceBps: 100,
        expoExpected: null,
        now: nowBN(),
      },
    },
  });
  await expectSendToFail([ix], "oracle feed on untracked asset");
});

test("refresh_verified_asset_balance fails when the asset has no stored feed", {
  skip,
}, async () => {
  // record_deposit credits the asset with feed = None, so the verified refresh
  // has no stored feed to read -> OracleAccountInvalid.
  const { chain, dwalletState } = await provisionDwallet(t, {
    chain: 48,
    deposit: usdcDeposit(),
  });
  const ix = await instructions.dwallet.refreshVerifiedAssetBalance(client, {
    accounts: {
      authority: t.owner,
      treasury: t.treasury,
      dwalletState,
      priceFeed: SystemProgram.programId,
    },
    args: {
      chain,
      assetId: "usdc",
      symbol: "USDC",
      decimals: 6,
      nativeAmount: new BN(1_000_000),
      provider: PROVIDER_PYTH,
      programId: Keypair.generate().publicKey,
      maxStalenessSecs: new BN(60),
      maxConfidenceBps: 100,
      expoExpected: null,
      now: nowBN(),
    },
  });
  await expectSendToFail([ix], "verified refresh without stored feed");
});

test("refresh_dwallet_balance rejects an unregistered chain", {
  skip,
}, async () => {
  // Chain 50 is a valid Custom chain code but was never registered on this
  // treasury -> DWalletNotConfigured.
  const ix = await instructions.dwallet.refreshDwalletBalance(client, {
    accounts: { treasury: t.treasury, balanceOracle: SystemProgram.programId },
    args: { chainCode: 50, now: nowBN() },
  });
  await expectSendToFail([ix], "refresh unregistered chain");
});

test("refresh_dwallet_balance rejects when no balance oracle is authorized", {
  skip,
}, async () => {
  // The dWallet reference is created with balance_oracle = None, so no account
  // is authorized to refresh it -> InvalidExternalAccountData.
  const { chain } = await provisionDwallet(t, { chain: 49 });
  const ix = await instructions.dwallet.refreshDwalletBalance(client, {
    accounts: { treasury: t.treasury, balanceOracle: SystemProgram.programId },
    args: { chainCode: chain, now: nowBN() },
  });
  await expectSendToFail([ix], "no authorized balance oracle");
});
