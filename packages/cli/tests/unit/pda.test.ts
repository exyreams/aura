/** The `pda` command derives addresses offline (no wallet, no network). */

import assert from "node:assert/strict";
import test from "node:test";
import { derivePolicyReceiptAddress } from "@aura-protocol/sdk-ts";
import { PublicKey } from "@solana/web3.js";

import { runCliJson } from "../support/offline.js";

interface DeriveResult {
  kind: string;
  address: string;
  bump: number;
  programId: string;
  seeds: { proposalId: string; treasury: string };
}

test("pda policy-receipt matches the SDK derivation", async () => {
  const programId = new PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111",
  );
  const treasury = new PublicKey("SysvarRent111111111111111111111111111111111");
  const [expected, bump] = derivePolicyReceiptAddress(
    treasury,
    "42",
    programId,
  );

  const parsed = await runCliJson<DeriveResult>([
    "--program-id",
    programId.toBase58(),
    "pda",
    "policy-receipt",
    "--treasury",
    treasury.toBase58(),
    "--proposal-id",
    "42",
  ]);

  assert.equal(parsed.kind, "policy-receipt");
  assert.equal(parsed.address, expected.toBase58());
  assert.equal(parsed.bump, bump);
  assert.equal(parsed.programId, programId.toBase58());
  assert.equal(parsed.seeds.treasury, treasury.toBase58());
  assert.equal(parsed.seeds.proposalId, "42");
});

test("pda treasury matches the SDK derivation", async () => {
  const owner = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const parsed = await runCliJson<DeriveResult>([
    "pda",
    "treasury",
    "--owner",
    owner.toBase58(),
    "--agent-id",
    "agent-1",
  ]);
  assert.equal(parsed.kind, "treasury");
  assert.ok(parsed.address.length > 0);
});
