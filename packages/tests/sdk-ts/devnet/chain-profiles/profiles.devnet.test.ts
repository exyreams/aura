/**
 * Devnet: global chain profiles.
 *
 *   - register_chain_profile (idempotent across runs: the PDA is GLOBAL per
 *     chainCode and has no close instruction, so we register on first run and
 *     update on later runs)
 *   - update_chain_profile (happy + chainCode-mismatch reject)
 *   - register validation reject (confirmationsRequired == 0)
 *
 * Uses a dedicated chainCode (222) to avoid clobbering standard codes. Skips
 * when no funded payer.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveChainProfileAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
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

const CHAIN_CODE = 222;

// Solana-shaped profile (replayScheme 2 => evmChainId not required).
function profileArgs(
  chainCode: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    chainCode,
    enabled: true,
    addressFormat: 2, // Solana
    replayScheme: 2, // Solana
    finalityModel: 1, // Instant
    curve: 2, // ed25519
    signatureScheme: 5, // EddsaSha512
    nativeGasAsset: "SOL",
    evmChainId: null,
    confirmationsRequired: 1,
    now: nowBN(),
    ...overrides,
  };
}

let authority: ReturnType<typeof getPayer>["publicKey"];
let chainProfile: ReturnType<typeof deriveChainProfileAddress>[0];

before(() => {
  if (!DEVNET_AVAILABLE) return;
  authority = getPayer().publicKey;
  [chainProfile] = deriveChainProfileAddress(CHAIN_CODE);
});

test("register_chain_profile (first run) or confirm it exists", {
  skip,
}, async () => {
  const existing = await accounts.fetchChainProfileAccountNullable(
    client,
    chainProfile,
  );
  if (!existing) {
    await sendAndConfirm(
      [
        await instructions.lifecycle.registerChainProfile(client, {
          accounts: {
            authority,
            chainProfile,
            systemProgram: SystemProgram.programId,
          },
          args: profileArgs(CHAIN_CODE),
        }),
      ],
      [],
      "registerChainProfile",
    );
  }
  const profile = await accounts.fetchChainProfileAccount(client, chainProfile);
  assert.equal(profile.chainCode, CHAIN_CODE);
  assert.equal(profile.confirmationsRequired, 1);
});

test("update_chain_profile toggles fields", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.lifecycle.updateChainProfile(client, {
        accounts: { authority, chainProfile },
        args: profileArgs(CHAIN_CODE, {
          enabled: false,
          confirmationsRequired: 3,
        }),
      }),
    ],
    [],
    "updateChainProfile",
  );
  const profile = await accounts.fetchChainProfileAccount(client, chainProfile);
  assert.equal(profile.enabled, false);
  assert.equal(profile.confirmationsRequired, 3);
});

test("update_chain_profile rejects a chainCode mismatch", {
  skip,
}, async () => {
  // args.chainCode must match the stored profile's chain_code -> InvalidChain.
  const ix = await instructions.lifecycle.updateChainProfile(client, {
    accounts: { authority, chainProfile },
    args: profileArgs(223),
  });
  await expectSendToFail([ix], "chain code mismatch");
});

test("register_chain_profile rejects zero confirmations", {
  skip,
}, async () => {
  // A distinct code that fails validation before init -> no account leaked.
  const [other] = deriveChainProfileAddress(221);
  const ix = await instructions.lifecycle.registerChainProfile(client, {
    accounts: {
      authority,
      chainProfile: other,
      systemProgram: SystemProgram.programId,
    },
    args: profileArgs(221, { confirmationsRequired: 0 }),
  });
  await expectSendToFail([ix], "zero confirmations");
});
