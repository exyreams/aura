/**
 * Devnet: policy enforcement on public proposals.
 *
 * This is the layer the unit suite cannot reach. It proves two distinct program
 * behaviors:
 *   - Limit violations (per-tx, daily, velocity, ...) do NOT revert.
 *     `propose_transaction` runs the policy engine and *records* a denied
 *     decision on the pending proposal (approved=false + a violation code).
 *   - Account-gated checks (paused execution, deny/allow lists, sanctions,
 *     cooldown, budget, exposure, ...) hard-revert the transaction.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveAddressListAddress,
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
  proposeAccounts,
  proposeTransactionArgs,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

const EVM_DEAD = "0x000000000000000000000000000000000000dead";

/** ViolationCode::PerTransactionLimit, serialized as a u8 on the decision. */
const PER_TRANSACTION_LIMIT = 1;

let t: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  // Default policy: perTxLimitUsd = 1000, dailyLimitUsd = 10000.
  t = await provisionTreasury({ activate: true, prefix: "policy" });
});

test("a within-limit proposal is accepted and recorded", { skip }, async () => {
  const args = proposeTransactionArgs();
  args.amountUsd = new BN(100); // well under the 1000 per-tx limit
  const ix = await instructions.execution.proposeTransaction(client, {
    accounts: proposeAccounts(t.treasury),
    args,
  });
  await sendAndConfirm([ix], [], "propose within limit");

  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  const pending = account.pendingQueue.at(-1);
  assert.ok(pending, "expected a pending proposal");
  assert.equal(
    pending.decision.approved,
    true,
    "within-limit must be approved",
  );

  // Clear it so later tests start clean.
  await sendAndConfirm(
    [
      await instructions.execution.cancelPending(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState: null },
        args: { now: nowBN() },
      }),
    ],
    [],
    "cancelPending",
  );
});

test("a proposal over the per-tx limit is recorded as a policy denial", {
  skip,
}, async () => {
  // The program does not revert on limit violations: `propose_transaction`
  // runs the policy engine synchronously and *records* the decision on the
  // pending proposal. An over-limit proposal therefore lands on-chain with a
  // denied decision (approved=false) carrying the PerTransactionLimit code (1),
  // which is what `execute_pending` later refuses to act on.
  const args = proposeTransactionArgs();
  args.amountUsd = new BN(5000); // exceeds the 1000 per-tx limit
  const ix = await instructions.execution.proposeTransaction(client, {
    accounts: proposeAccounts(t.treasury),
    args,
  });
  await sendAndConfirm([ix], [], "propose over per-tx limit");

  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  const pending = account.pendingQueue.at(-1);
  assert.ok(pending, "expected the over-limit proposal to be recorded");
  assert.equal(
    pending.decision.approved,
    false,
    "over-limit proposal must be recorded as denied",
  );
  assert.equal(
    pending.decision.violation,
    PER_TRANSACTION_LIMIT,
    "violation code must be PerTransactionLimit",
  );

  // Clear it so later tests start from a clean queue.
  await sendAndConfirm(
    [
      await instructions.execution.cancelPending(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState: null },
        args: { now: nowBN() },
      }),
    ],
    [],
    "cancelPending",
  );
});

test("proposals are rejected while execution is paused", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.execution.pauseExecution(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { paused: true, now: nowBN() },
      }),
    ],
    [],
    "pauseExecution(pause)",
  );

  const args = proposeTransactionArgs();
  args.amountUsd = new BN(100);
  const ix = await instructions.execution.proposeTransaction(client, {
    accounts: proposeAccounts(t.treasury),
    args,
  });
  await expectSendToFail([ix], "propose while paused");

  // Resume so the treasury is left usable.
  await sendAndConfirm(
    [
      await instructions.execution.pauseExecution(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { paused: false, now: nowBN() },
      }),
    ],
    [],
    "pauseExecution(unpause)",
  );
});

test("a deny-listed recipient is rejected", { skip }, async () => {
  const [addressList] = deriveAddressListAddress(t.treasury);

  // Mode 0 is a deny list (blacklist): the program reverts with
  // RecipientBlacklisted when the recipient is present. (Mode 1 is an allow
  // list, which reverts with RecipientNotWhitelisted when absent.)
  await sendAndConfirm(
    [
      await instructions.addressLists.initAddressList(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          addressList,
          systemProgram: SystemProgram.programId,
        },
        args: { mode: 0, chain: 2, now: nowBN() },
      }),
    ],
    [],
    "initAddressList(deny)",
  );
  await sendAndConfirm(
    [
      await instructions.addressLists.manageAddressList(client, {
        accounts: {
          operator: t.owner,
          treasury: t.treasury,
          operatorRole: null,
          addressList,
        },
        args: { mode: 0, chain: 2, addresses: [EVM_DEAD], now: nowBN() },
      }),
    ],
    [],
    "manageAddressList(add EVM_DEAD)",
  );

  // Proposing to the deny-listed recipient with the list wired in must fail.
  const args = proposeTransactionArgs();
  args.amountUsd = new BN(100);
  args.recipientOrContract = EVM_DEAD;
  const ix = await instructions.execution.proposeTransaction(client, {
    accounts: proposeAccounts(t.treasury, { addressList }),
    args,
  });
  await expectSendToFail([ix], "propose to deny-listed recipient");
});
