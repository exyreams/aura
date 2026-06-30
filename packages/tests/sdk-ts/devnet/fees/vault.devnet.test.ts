/**
 * Devnet: protocol fee vault lifecycle and guards.
 *
 *   - init_fee_vault → deposit_fees → withdraw_unused_fees → close_fee_vault
 *   - set_fee_splits (happy + invalid sum / too many / bad low-balance mode)
 *   - update_fee_recipient
 *   - collect_fees NoPendingTransaction reject (nothing accrued)
 *   - deposit zero / over-withdraw rejects
 *
 * deposit_fees is a real System-program lamport transfer from the payer into
 * the vault PDA; withdraw/close reclaim it. Skips when no funded payer.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveFeeVaultAddress,
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
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

let t: ProvisionedTreasury;
let feeVault: ReturnType<typeof deriveFeeVaultAddress>[0];

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "fee-vault" });
  [feeVault] = deriveFeeVaultAddress(t.treasury);
});

test("init_fee_vault creates the vault with the payer as recipient", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.fees.initFeeVault(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          feeVault,
          systemProgram: SystemProgram.programId,
        },
        args: { protocolFeeRecipient: t.owner, now: nowBN() },
      }),
    ],
    [],
    "initFeeVault",
  );
  const vault = await accounts.fetchFeeVaultAccount(client, feeVault);
  assert.equal(vault.protocolFeeRecipient.toBase58(), t.owner.toBase58());
  assert.equal(vault.feeBalance.toString(), "0");
  assert.equal(vault.splits.length, 0);
});

test("deposit_fees tops up the prepaid balance and rejects zero", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.fees.depositFees(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          feeVault,
          systemProgram: SystemProgram.programId,
        },
        args: { amount: new BN(2_000_000) },
      }),
    ],
    [],
    "depositFees",
  );
  let vault = await accounts.fetchFeeVaultAccount(client, feeVault);
  assert.equal(vault.feeBalance.toString(), "2000000");

  const zeroIx = await instructions.fees.depositFees(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      feeVault,
      systemProgram: SystemProgram.programId,
    },
    args: { amount: new BN(0) },
  });
  await expectSendToFail([zeroIx], "deposit zero");
  vault = await accounts.fetchFeeVaultAccount(client, feeVault);
  assert.equal(vault.feeBalance.toString(), "2000000", "balance unchanged");
});

test("withdraw_unused_fees returns prepaid balance and rejects over-withdraw", {
  skip,
}, async () => {
  const overIx = await instructions.fees.withdrawUnusedFees(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      feeVault,
      systemProgram: SystemProgram.programId,
    },
    args: { amount: new BN(9_000_000) }, // > feeBalance
  });
  await expectSendToFail([overIx], "withdraw over balance");

  await sendAndConfirm(
    [
      await instructions.fees.withdrawUnusedFees(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          feeVault,
          systemProgram: SystemProgram.programId,
        },
        args: { amount: new BN(1_000_000) },
      }),
    ],
    [],
    "withdrawUnusedFees",
  );
  const vault = await accounts.fetchFeeVaultAccount(client, feeVault);
  assert.equal(vault.feeBalance.toString(), "1000000");
});

test("set_fee_splits validates shares, count, and mode", { skip }, async () => {
  const a = Keypair.generate().publicKey;
  const b = Keypair.generate().publicKey;

  // happy: two splits summing to 10000 bps, WARN mode (2)
  await sendAndConfirm(
    [
      await instructions.fees.setFeeSplits(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          feeVault,
          systemProgram: SystemProgram.programId,
        },
        args: {
          splits: [
            { recipient: a, shareBps: 7_000, role: 0 },
            { recipient: b, shareBps: 3_000, role: 1 },
          ],
          lowBalanceMode: 2,
        },
      }),
    ],
    [],
    "setFeeSplits",
  );
  let vault = await accounts.fetchFeeVaultAccount(client, feeVault);
  assert.equal(vault.splits.length, 2);
  assert.equal(vault.lowBalanceMode, 2);

  // reject: shares don't sum to 10000
  const badSum = await instructions.fees.setFeeSplits(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      feeVault,
      systemProgram: SystemProgram.programId,
    },
    args: {
      splits: [{ recipient: a, shareBps: 5_000, role: 0 }],
      lowBalanceMode: 0,
    },
  });
  await expectSendToFail([badSum], "splits sum != 10000");

  // reject: more than MAX_FEE_SPLITS (4)
  const tooMany = await instructions.fees.setFeeSplits(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      feeVault,
      systemProgram: SystemProgram.programId,
    },
    args: {
      splits: [
        { recipient: a, shareBps: 2_000, role: 0 },
        { recipient: b, shareBps: 2_000, role: 0 },
        { recipient: a, shareBps: 2_000, role: 0 },
        { recipient: b, shareBps: 2_000, role: 0 },
        { recipient: a, shareBps: 2_000, role: 0 },
      ],
      lowBalanceMode: 0,
    },
  });
  await expectSendToFail([tooMany], "too many splits");

  // reject: invalid low-balance mode (>2)
  const badMode = await instructions.fees.setFeeSplits(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      feeVault,
      systemProgram: SystemProgram.programId,
    },
    args: { splits: [], lowBalanceMode: 9 },
  });
  await expectSendToFail([badMode], "bad low-balance mode");

  vault = await accounts.fetchFeeVaultAccount(client, feeVault);
  assert.equal(vault.splits.length, 2, "splits unchanged by rejects");
});

test("collect_fees reverts when nothing has accrued", { skip }, async () => {
  // accumulated_fees_lamports == 0 -> NoPendingTransaction. The signer must
  // equal the vault recipient (the payer), which holds from init.
  const ix = await instructions.fees.collectFees(client, {
    accounts: {
      protocolAuthority: t.owner,
      feeVault,
      recipient: t.owner,
    },
    args: { now: nowBN() },
  });
  await expectSendToFail([ix], "collect with nothing accrued");
});

test("update_fee_recipient rewrites the recipient", { skip }, async () => {
  const next = Keypair.generate().publicKey;
  await sendAndConfirm(
    [
      await instructions.fees.updateFeeRecipient(client, {
        accounts: { owner: t.owner, treasury: t.treasury, feeVault },
        args: { newRecipient: next },
      }),
    ],
    [],
    "updateFeeRecipient",
  );
  const vault = await accounts.fetchFeeVaultAccount(client, feeVault);
  assert.equal(vault.protocolFeeRecipient.toBase58(), next.toBase58());
});

test("close_fee_vault closes the vault and reclaims rent", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.fees.closeFeeVault(client, {
        accounts: { owner: t.owner, treasury: t.treasury, feeVault },
      }),
    ],
    [],
    "closeFeeVault",
  );
  assert.equal(
    await accounts.fetchFeeVaultAccountNullable(client, feeVault),
    null,
    "closed vault account should be gone",
  );
});
