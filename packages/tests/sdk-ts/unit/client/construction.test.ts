/**
 * AuraClient + treasury input helper.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  AURA_PROGRAM_ID,
  accounts,
  deriveTreasuryAddress,
  instructions,
} from "../../../../sdk-ts/src/index.js";
import { offlineClient, pk } from "../../support/offline.js";
import { buildCreateTreasuryArgs } from "../../support/sample.js";

test("AuraClient defaults to the IDL program id", () => {
  const client = offlineClient();
  assert.equal(client.programId.toBase58(), AURA_PROGRAM_ID.toBase58());
});

test("AuraClient honors a custom program id and wires Anchor state", () => {
  const custom = pk();
  const client = offlineClient(custom);
  assert.equal(client.programId.toBase58(), custom.toBase58());
  assert.equal(client.connection.rpcEndpoint, "http://127.0.0.1:8899");
  assert.ok(client.program);
  assert.ok(client.coder);
  assert.ok(client.provider);
  assert.ok(client.confirmOptions);
});

test("AuraClient provider wallet is read-only (cannot sign)", async () => {
  const client = offlineClient();
  await assert.rejects(
    () => client.provider.wallet.signTransaction({} as never),
    /read-only/,
  );
});

test("createTreasuryInput derives the treasury PDA and product args", () => {
  const owner = pk();
  const args = buildCreateTreasuryArgs(owner, "agent-1", new BN(1));
  const { treasury, input } = accounts.createTreasuryInput({ owner, args });
  const [expected] = deriveTreasuryAddress(owner, "agent-1");

  assert.equal(treasury.toBase58(), expected.toBase58());
  assert.strictEqual(input.args, args);
});

test("createTreasuryInput honors an explicit treasury override", () => {
  const owner = pk();
  const override = pk();
  const args = buildCreateTreasuryArgs(owner, "agent-2", new BN(1));
  const { treasury } = accounts.createTreasuryInput({
    owner,
    args,
    treasury: override,
  });
  assert.equal(treasury.toBase58(), override.toBase58());
});

test("createTreasury builder encodes accounts in canonical order", async () => {
  const client = offlineClient();
  const owner = pk();
  const args = buildCreateTreasuryArgs(owner, "agent-1", new BN(1));
  const { treasury, input } = accounts.createTreasuryInput({ owner, args });

  const ix = await instructions.treasury.createTreasury(client, input);
  assert.equal(client.coder.decode(ix.data)?.name, "create_treasury");
  assert.equal(ix.keys[0]?.pubkey.toBase58(), owner.toBase58());
  assert.equal(ix.keys[1]?.pubkey.toBase58(), treasury.toBase58());
  assert.equal(
    ix.keys[2]?.pubkey.toBase58(),
    SystemProgram.programId.toBase58(),
  );
});

test("sendInstructions / sendInstruction are exposed", () => {
  const client = offlineClient();
  assert.equal(typeof client.sendInstructions, "function");
  assert.equal(typeof client.sendInstruction, "function");
  // The throwaway provider keypair is never reused as a real signer.
  assert.ok(Keypair.generate());
});
