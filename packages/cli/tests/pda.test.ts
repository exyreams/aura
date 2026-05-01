import assert from "node:assert/strict";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import { createProgram } from "../src/index.js";
import { derivePolicyReceiptAddress } from "../src/sdk.js";

test("pda command derives policy-control addresses without loading a wallet", async () => {
  const programId = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const treasury = new PublicKey("SysvarRent111111111111111111111111111111111");
  const [expected, bump] = derivePolicyReceiptAddress(treasury, "42", programId);
  let output = "";
  const originalLog = console.log;

  console.log = (value?: unknown) => {
    output += `${String(value)}\n`;
  };

  try {
    await createProgram()
      .exitOverride()
      .parseAsync([
        "node",
        "aura",
        "--json",
        "--program-id",
        programId.toBase58(),
        "pda",
        "policy-receipt",
        "--treasury",
        treasury.toBase58(),
        "--proposal-id",
        "42",
      ]);
  } finally {
    console.log = originalLog;
  }

  const parsed = JSON.parse(output) as {
    kind: string;
    address: string;
    bump: number;
    programId: string;
    seeds: { proposalId: string; treasury: string };
  };

  assert.equal(parsed.kind, "policy-receipt");
  assert.equal(parsed.address, expected.toBase58());
  assert.equal(parsed.bump, bump);
  assert.equal(parsed.programId, programId.toBase58());
  assert.equal(parsed.seeds.treasury, treasury.toBase58());
  assert.equal(parsed.seeds.proposalId, "42");
});
