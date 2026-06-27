/**
 * Devnet: dWallet runtime lifecycle and owner controls.
 *
 * Exercises the per-dWallet `DWalletAccount` PDA created by `init_dwallet_state`
 * and the owner-gated controls that mutate it: status transitions, spend
 * limits, labels, authority rotation, the treasury default chain, and removal.
 * Each test uses its own chain code so they never collide on one treasury.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveDwalletStateAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
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
  registerDwalletArgs,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

// DWalletStatus storage codes.
const STATUS_ACTIVE = 1;
const STATUS_FROZEN = 3;
const STATUS_RETIRED = 5;

let t: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "dw-life" });
});

test("init_dwallet_state creates an Active runtime account", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 6 });
  const state = await accounts.fetchDWalletAccount(client, dwalletState);
  assert.equal(state.chain, chain);
  assert.equal(state.status, STATUS_ACTIVE);
  assert.equal(state.reservedUsd.toString(), "0");
  assert.equal(state.epoch.toString(), "0");
  assert.equal(state.dailyLimitUsd, null);
  assert.equal(state.perTxLimitUsd, null);
});

test("init_dwallet_state requires a registered dWallet", { skip }, async () => {
  // Chain 7 is never registered on this treasury, so init must revert with
  // DWalletNotConfigured rather than creating a runtime account.
  const chain = 7;
  const [dwalletState] = deriveDwalletStateAddress(t.treasury, chain);
  const ix = await instructions.dwallet.initDwalletState(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      dwalletState,
      systemProgram: SystemProgram.programId,
    },
    args: { chain, now: nowBN() },
  });
  await expectSendToFail([ix], "init unregistered dwallet");
});

test("set_dwallet_status freezes and reactivates", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 8 });

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
  let state = await accounts.fetchDWalletAccount(client, dwalletState);
  assert.equal(state.status, STATUS_FROZEN);

  await sendAndConfirm(
    [
      await instructions.dwallet.setDwalletStatus(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: { chain, statusCode: STATUS_ACTIVE, now: nowBN() },
      }),
    ],
    [],
    "setDwalletStatus(reactivate)",
  );
  state = await accounts.fetchDWalletAccount(client, dwalletState);
  assert.equal(state.status, STATUS_ACTIVE);
});

test("set_dwallet_status rejects an illegal transition", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 9 });
  // Active -> Retired is not a permitted transition (only Retiring -> Retired).
  const ix = await instructions.dwallet.setDwalletStatus(client, {
    accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
    args: { chain, statusCode: STATUS_RETIRED, now: nowBN() },
  });
  await expectSendToFail([ix], "status Active->Retired");
});

test("set_dwallet_status rejects an unknown status code", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 10 });
  const ix = await instructions.dwallet.setDwalletStatus(client, {
    accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
    args: { chain, statusCode: 9, now: nowBN() },
  });
  await expectSendToFail([ix], "status code 9");
});

test("set_dwallet_limits sets and clears caps", { skip }, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 11 });

  await sendAndConfirm(
    [
      await instructions.dwallet.setDwalletLimits(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: {
          chain,
          dailyLimitUsd: new BN(10_000),
          perTxLimitUsd: new BN(2_500),
          now: nowBN(),
        },
      }),
    ],
    [],
    "setDwalletLimits(set)",
  );
  let state = await accounts.fetchDWalletAccount(client, dwalletState);
  assert.equal(state.dailyLimitUsd?.toString(), "10000");
  assert.equal(state.perTxLimitUsd?.toString(), "2500");

  await sendAndConfirm(
    [
      await instructions.dwallet.setDwalletLimits(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: { chain, dailyLimitUsd: null, perTxLimitUsd: null, now: nowBN() },
      }),
    ],
    [],
    "setDwalletLimits(clear)",
  );
  state = await accounts.fetchDWalletAccount(client, dwalletState);
  assert.equal(state.dailyLimitUsd, null);
  assert.equal(state.perTxLimitUsd, null);
});

test("set_dwallet_label sets a label and rejects >32 bytes", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 12 });

  await sendAndConfirm(
    [
      await instructions.dwallet.setDwalletLabel(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: { chain, label: "treasury-hot-wallet", now: nowBN() },
      }),
    ],
    [],
    "setDwalletLabel",
  );
  const state = await accounts.fetchDWalletAccount(client, dwalletState);
  assert.equal(state.label, "treasury-hot-wallet");

  const tooLong = "x".repeat(33);
  const ix = await instructions.dwallet.setDwalletLabel(client, {
    accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
    args: { chain, label: tooLong, now: nowBN() },
  });
  await expectSendToFail([ix], "label > 32 bytes");
});

test("rotate_dwallet_authority bumps the epoch and rejects a long seed", {
  skip,
}, async () => {
  const { chain, dwalletState } = await provisionDwallet(t, { chain: 13 });
  const newAuthority = Keypair.generate().publicKey;

  await sendAndConfirm(
    [
      await instructions.dwallet.rotateDwalletAuthority(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
        args: {
          chain,
          newAuthority,
          newCpiAuthoritySeed: "rotated-authority-seed",
          now: nowBN(),
        },
      }),
    ],
    [],
    "rotateDwalletAuthority",
  );
  const state = await accounts.fetchDWalletAccount(client, dwalletState);
  assert.equal(state.epoch.toString(), "1");
  assert.equal(state.authority.toBase58(), newAuthority.toBase58());

  const ix = await instructions.dwallet.rotateDwalletAuthority(client, {
    accounts: { owner: t.owner, treasury: t.treasury, dwalletState },
    args: {
      chain,
      newAuthority,
      newCpiAuthoritySeed: "y".repeat(49),
      now: nowBN(),
    },
  });
  await expectSendToFail([ix], "cpi seed > 48 bytes");
});

test("set_default_chain sets and clears the primary chain", {
  skip,
}, async () => {
  const { chain } = await provisionDwallet(t, { chain: 14 });

  await sendAndConfirm(
    [
      await instructions.dwallet.setDefaultChain(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { chain, now: nowBN() },
      }),
    ],
    [],
    "setDefaultChain(set)",
  );
  let account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.defaultChain, chain);

  await sendAndConfirm(
    [
      await instructions.dwallet.setDefaultChain(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { chain: null, now: nowBN() },
      }),
    ],
    [],
    "setDefaultChain(clear)",
  );
  account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.defaultChain, null);
});

test("remove_dwallet closes an empty dWallet but rejects a funded one", {
  skip,
}, async () => {
  // Funded dWallet (chain 15): removal must revert with DWalletNotEmpty.
  const funded = await provisionDwallet(t, {
    chain: 15,
    deposit: {
      assetId: "usdc",
      symbol: "USDC",
      decimals: 6,
      nativeAmount: 1_000_000n,
      usdValue: 1_000,
    },
  });
  const fundedRemoval = await instructions.dwallet.removeDwallet(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      dwalletState: funded.dwalletState,
    },
    args: { chain: funded.chain, now: nowBN() },
  });
  await expectSendToFail([fundedRemoval], "remove funded dwallet");

  // Empty dWallet (chain 16): removal succeeds and closes the runtime account.
  const empty = await provisionDwallet(t, { chain: 16 });
  await sendAndConfirm(
    [
      await instructions.dwallet.removeDwallet(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          dwalletState: empty.dwalletState,
        },
        args: { chain: empty.chain, now: nowBN() },
      }),
    ],
    [],
    "removeDwallet(empty)",
  );
  assert.equal(
    await accounts.fetchDWalletAccountNullable(client, empty.dwalletState),
    null,
    "removed dWallet runtime account should be closed",
  );
});

test("a duplicate dWallet registration is rejected", { skip }, async () => {
  const chain = 17;
  await provisionDwallet(t, { chain });
  // Registering the same chain again must revert (DWalletAlreadyRegistered).
  const ix = await instructions.dwallet.registerDwallet(client, {
    accounts: { owner: t.owner, treasury: t.treasury },
    args: registerDwalletArgs(`${t.agentId}-dup`, chain),
  });
  await expectSendToFail([ix], "duplicate registerDwallet");
});
