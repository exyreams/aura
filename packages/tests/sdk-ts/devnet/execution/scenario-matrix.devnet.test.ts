/**
 * Devnet: execution scenario matrix.
 *
 * This suite focuses on proposal state-machine edges that are not covered by
 * simple builder coverage: signer authorization, session-key counters, denied
 * proposal cleanup, TTL boundaries, empty-queue idempotency, and queue depth.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AURA_PROGRAM_ID,
  accounts,
  deriveSessionKeyAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  nowBN,
  proposeAccounts,
  proposeTransactionArgs,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

function targetTxHash(seed = 1) {
  return Array.from({ length: 32 }, (_value, index) => seed + index);
}

test("proposeTransaction rejects a signer that is not the AI authority", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "exec-auth", activate: true });
  const stranger = Keypair.generate();
  const ix = await instructions.execution.proposeTransaction(client, {
    accounts: {
      ...proposeAccounts(t.treasury),
      aiAuthority: stranger.publicKey,
    },
    args: proposeTransactionArgs(),
  });
  await expectSendToFail([ix], "proposeTransaction unauthorized", [stranger]);
});

test("session-key proposals consume scope counters and reject after quota", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "exec-session", activate: true });
  const sessionSigner = Keypair.generate();
  const [sessionKeyAccount] = deriveSessionKeyAddress(
    t.treasury,
    sessionSigner.publicKey,
  );
  const issuedAt = nowBN();

  await sendAndConfirm(
    [
      SystemProgram.transfer({
        fromPubkey: t.owner,
        toPubkey: sessionSigner.publicKey,
        lamports: 20_000_000,
      }),
    ],
    [],
    "fund session signer",
  );

  await sendAndConfirm(
    [
      await instructions.lifecycle.issueSessionKey(client, {
        accounts: {
          authority: t.owner,
          treasury: t.treasury,
          sessionKeyAccount,
          systemProgram: SystemProgram.programId,
        },
        args: {
          sessionKey: sessionSigner.publicKey,
          durationSecs: new BN(3_600),
          maxAmountUsdPerTx: new BN(150),
          maxDailySpendUsd: new BN(250),
          allowedChains: Buffer.from([1]),
          allowedTxTypes: Buffer.from([0]),
          maxProposalCount: 1,
          now: issuedAt,
        },
      }),
    ],
    [],
    "issueSessionKey",
  );

  await sendAndConfirm(
    [
      await instructions.execution.proposeTransaction(client, {
        accounts: {
          ...proposeAccounts(t.treasury),
          aiAuthority: sessionSigner.publicKey,
          sessionKeyAccount,
        },
        args: proposeTransactionArgs(issuedAt.add(new BN(1))),
      }),
    ],
    [sessionSigner],
    "proposeTransaction(session)",
  );
  let session = await accounts.fetchSessionKeyAccount(
    client,
    sessionKeyAccount,
  );
  assert.equal(session.proposalsSubmitted, 1);
  assert.equal(session.sessionSpentTodayUsd.toString(), "100");

  const overQuota = await instructions.execution.proposeTransaction(client, {
    accounts: {
      ...proposeAccounts(t.treasury),
      aiAuthority: sessionSigner.publicKey,
      sessionKeyAccount,
    },
    args: proposeTransactionArgs(issuedAt.add(new BN(2))),
  });
  await expectSendToFail([overQuota], "proposeTransaction session quota", [
    sessionSigner,
  ]);
  session = await accounts.fetchSessionKeyAccount(client, sessionKeyAccount);
  assert.equal(
    session.proposalsSubmitted,
    1,
    "failed proposal must not consume quota",
  );
  assert.equal(session.sessionSpentTodayUsd.toString(), "100");
});

test("cancelPending is an idempotent no-op on an empty queue", {
  skip,
}, async () => {
  const t = await provisionTreasury({
    prefix: "exec-cancel-empty",
    activate: true,
  });

  await sendAndConfirm(
    [
      await instructions.execution.cancelPending(client, {
        accounts: { owner: t.owner, treasury: t.treasury, dwalletState: null },
        args: { now: nowBN() },
      }),
    ],
    [],
    "cancelPending(empty)",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingQueue.length, 0);
});

test("executePending removes a policy-denied proposal without dWallet CPI", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "exec-denied", activate: true });
  const args = proposeTransactionArgs();
  args.amountUsd = new BN(5_000);

  await sendAndConfirm(
    [
      await instructions.execution.proposeTransaction(client, {
        accounts: proposeAccounts(t.treasury),
        args,
      }),
    ],
    [],
    "proposeTransaction(denied)",
  );
  let account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingQueue.length, 1);
  assert.equal(account.pendingQueue[0]?.decision.approved, false);

  await sendAndConfirm(
    [
      await instructions.execution.executePending(client, {
        accounts: {
          operator: t.owner,
          treasury: t.treasury,
          messageApproval: null,
          dwallet: null,
          callerProgram: AURA_PROGRAM_ID,
          cpiAuthority: null,
          dwalletProgram: null,
          dwalletCoordinator: null,
          externalLiveness: null,
          dwalletState: null,
          systemProgram: SystemProgram.programId,
        },
        args: { now: nowBN() },
      }),
    ],
    [],
    "executePending(denied)",
  );
  account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingQueue.length, 0);
});

test("executePending exact TTL boundary is live, after TTL expires and clears", {
  skip,
}, async () => {
  const boundary = await provisionTreasury({
    prefix: "exec-ttl-boundary",
    activate: true,
    mutateArgs: (args) => {
      args.pendingTransactionTtlSecs = new BN(60);
    },
  });
  const submittedAt = nowBN();
  await sendAndConfirm(
    [
      await instructions.execution.proposeTransaction(client, {
        accounts: proposeAccounts(boundary.treasury),
        args: proposeTransactionArgs(submittedAt),
      }),
    ],
    [],
    "proposeTransaction(ttl-boundary)",
  );
  const boundaryAccount = await accounts.fetchTreasuryAccount(
    client,
    boundary.treasury,
  );
  const expiresAt = new BN(
    boundaryAccount.pendingQueue[0]?.expiresAt.toString() ?? "0",
  );
  assert.equal(expiresAt.toString(), submittedAt.add(new BN(60)).toString());

  const exactBoundary = await instructions.execution.executePending(client, {
    accounts: {
      operator: boundary.owner,
      treasury: boundary.treasury,
      messageApproval: null,
      dwallet: null,
      callerProgram: AURA_PROGRAM_ID,
      cpiAuthority: null,
      dwalletProgram: null,
      dwalletCoordinator: null,
      externalLiveness: null,
      dwalletState: null,
      systemProgram: SystemProgram.programId,
    },
    args: { now: expiresAt },
  });
  await expectSendToFail(
    [exactBoundary],
    "executePending exact TTL reaches live-CPI validation",
  );
  let account = await accounts.fetchTreasuryAccount(client, boundary.treasury);
  assert.equal(account.pendingQueue.length, 1, "exact boundary stays pending");

  const expired = await provisionTreasury({
    prefix: "exec-ttl-expired",
    activate: true,
    mutateArgs: (args) => {
      args.pendingTransactionTtlSecs = new BN(60);
    },
  });
  await sendAndConfirm(
    [
      await instructions.execution.proposeTransaction(client, {
        accounts: proposeAccounts(expired.treasury),
        args: proposeTransactionArgs(submittedAt),
      }),
    ],
    [],
    "proposeTransaction(ttl-expired)",
  );
  const expiredAccount = await accounts.fetchTreasuryAccount(
    client,
    expired.treasury,
  );
  const expiredAt = new BN(
    expiredAccount.pendingQueue[0]?.expiresAt.toString() ?? "0",
  );
  await sendAndConfirm(
    [
      await instructions.execution.executePending(client, {
        accounts: {
          operator: expired.owner,
          treasury: expired.treasury,
          messageApproval: null,
          dwallet: null,
          callerProgram: AURA_PROGRAM_ID,
          cpiAuthority: null,
          dwalletProgram: null,
          dwalletCoordinator: null,
          externalLiveness: null,
          dwalletState: null,
          systemProgram: SystemProgram.programId,
        },
        args: { now: expiredAt.add(new BN(1)) },
      }),
    ],
    [],
    "executePending(expired)",
  );
  account = await accounts.fetchTreasuryAccount(client, expired.treasury);
  assert.equal(account.pendingQueue.length, 0, "expired proposal is cleared");
});

test("second live pending proposal is rejected before queue growth", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "exec-depth", activate: true });
  await sendAndConfirm(
    [
      await instructions.execution.proposeTransaction(client, {
        accounts: proposeAccounts(t.treasury),
        args: proposeTransactionArgs(),
      }),
    ],
    [],
    "proposeTransaction(depth 1)",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingQueue.length, 1);

  const secondPending = await instructions.execution.proposeTransaction(
    client,
    {
      accounts: proposeAccounts(t.treasury),
      args: proposeTransactionArgs(nowBN().add(new BN(1))),
    },
  );
  await expectSendToFail([secondPending], "proposeTransaction second pending");
  const after = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(after.pendingQueue.length, 1);
});

test("settlement builders reject unauthorized operators before queue checks", {
  skip,
}, async () => {
  const t = await provisionTreasury({
    prefix: "exec-settle-auth",
    activate: true,
  });
  const stranger = Keypair.generate();
  const now = nowBN();

  const executeIx = await instructions.execution.executePending(client, {
    accounts: {
      operator: stranger.publicKey,
      treasury: t.treasury,
      messageApproval: null,
      dwallet: null,
      callerProgram: AURA_PROGRAM_ID,
      cpiAuthority: null,
      dwalletProgram: null,
      dwalletCoordinator: null,
      externalLiveness: null,
      dwalletState: null,
      systemProgram: SystemProgram.programId,
    },
    args: { now },
  });
  await expectSendToFail([executeIx], "executePending unauthorized", [
    stranger,
  ]);

  const markIx = await instructions.execution.markSettlementBroadcast(client, {
    accounts: { operator: stranger.publicKey, treasury: t.treasury },
    args: { proposalId: new BN(0), targetTxHash: targetTxHash(7), now },
  });
  await expectSendToFail([markIx], "markSettlementBroadcast unauthorized", [
    stranger,
  ]);

  const confirmIx = await instructions.execution.confirmSettlement(client, {
    accounts: {
      operator: stranger.publicKey,
      treasury: t.treasury,
      swarmPool: null,
      budgetEnvelope: null,
      exposureGroup: null,
      dwalletState: null,
      scheduledIntent: null,
    },
    args: {
      proposalId: new BN(0),
      targetTxHash: targetTxHash(9),
      confirmationsObserved: 1,
      reorged: false,
      now,
    },
  });
  await expectSendToFail([confirmIx], "confirmSettlement unauthorized", [
    stranger,
  ]);
});
