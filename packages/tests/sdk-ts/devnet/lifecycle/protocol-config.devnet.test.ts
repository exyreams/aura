/**
 * Devnet: global protocol config singleton.
 *
 * The protocol config PDA is global, not per test treasury. If it is absent,
 * the loaded devnet payer initializes it and then exercises update/commit. If
 * it already exists under a different authority, the suite still submits real
 * expected-failure transactions for init/update/commit without mutating shared
 * devnet state.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accounts,
  deriveProtocolConfigAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  getPayer,
  nowBN,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

function protocolConfigArgs(authority = getPayer().publicKey) {
  return {
    protocolAuthority: authority,
    protocolRecipient: getPayer().publicKey,
    protocolFeeBps: new BN(25),
    creationFeeUsd: new BN(0),
    minIntegratorBps: 0,
    maxIntegratorBps: 250,
    settlementAsset: 0,
    enabled: true,
  };
}

test("protocol config singleton: init when free, otherwise reject duplicate init", {
  skip,
}, async () => {
  const [protocolConfig] = deriveProtocolConfigAddress();
  const existing = await accounts.fetchProtocolConfigAccountNullable(
    client,
    protocolConfig,
  );

  const initIx = await instructions.lifecycle.initProtocolConfig(client, {
    accounts: {
      payer: getPayer().publicKey,
      protocolConfig,
      systemProgram: SystemProgram.programId,
    },
    args: { args: protocolConfigArgs(), now: nowBN() },
  });

  if (!existing) {
    await sendAndConfirm([initIx], [], "initProtocolConfig");
    const account = await accounts.fetchProtocolConfigAccount(
      client,
      protocolConfig,
    );
    assert.equal(
      account.protocolAuthority.toBase58(),
      getPayer().publicKey.toBase58(),
    );
    return;
  }

  await expectSendToFail([initIx], "initProtocolConfig duplicate");
});

test("protocol config update/commit when payer controls it, otherwise auth rejects", {
  skip,
}, async () => {
  const [protocolConfig] = deriveProtocolConfigAddress();
  const account = await accounts.fetchProtocolConfigAccountNullable(
    client,
    protocolConfig,
  );
  assert.ok(account, "protocol config should exist after init/duplicate check");

  const payer = getPayer().publicKey;
  if (!account.protocolAuthority.equals(payer)) {
    const unauthorizedArgs = protocolConfigArgs(Keypair.generate().publicKey);
    const updateIx = await instructions.lifecycle.updateProtocolConfig(client, {
      accounts: { authority: payer, protocolConfig },
      args: { args: unauthorizedArgs, now: nowBN() },
    });
    await expectSendToFail([updateIx], "updateProtocolConfig unauthorized");

    const commitIx = await instructions.lifecycle.commitProtocolConfig(client, {
      accounts: { authority: payer, protocolConfig },
      args: { now: nowBN().add(new BN(172_801)) },
    });
    await expectSendToFail([commitIx], "commitProtocolConfig unauthorized");
    return;
  }

  const now = nowBN();
  const updatedArgs = {
    ...protocolConfigArgs(payer),
    protocolFeeBps: new BN(account.protocolFeeBps.toNumber() === 25 ? 26 : 25),
  };
  await sendAndConfirm(
    [
      await instructions.lifecycle.updateProtocolConfig(client, {
        accounts: { authority: payer, protocolConfig },
        args: { args: updatedArgs, now },
      }),
    ],
    [],
    "updateProtocolConfig",
  );
  let updated = await accounts.fetchProtocolConfigAccount(
    client,
    protocolConfig,
  );
  assert.ok(updated.pending, "protocol config update should be staged");

  await sendAndConfirm(
    [
      await instructions.lifecycle.commitProtocolConfig(client, {
        accounts: { authority: payer, protocolConfig },
        args: {
          now: new BN(updated.pending?.executableAfter.toString() ?? "0").add(
            new BN(1),
          ),
        },
      }),
    ],
    [],
    "commitProtocolConfig",
  );
  updated = await accounts.fetchProtocolConfigAccount(client, protocolConfig);
  assert.equal(updated.pending, null, "pending protocol update should clear");
  assert.equal(
    updated.protocolFeeBps.toString(),
    updatedArgs.protocolFeeBps.toString(),
  );
});
