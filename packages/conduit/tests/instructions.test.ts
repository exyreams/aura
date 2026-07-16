import { strict as assert } from "node:assert";
import { test } from "node:test";

import { AURA_PROGRAM_ID } from "@aura-protocol/sdk-ts";
import { PublicKey } from "@solana/web3.js";

import {
  buildProgramInstruction,
  getProgramInstructionCatalog,
  getProgramInstructionSchema,
} from "../src/core/instructions.js";
import { createSolanaContext } from "../src/core/solana.js";

const VALID_PUBKEY = "11111111111111111111111111111111";

test("instruction catalog exposes every current IDL method", () => {
  const catalog = getProgramInstructionCatalog();
  assert.equal(catalog.totals.instructions > 0, true);
  assert.equal(catalog.totals.domains > 0, true);
  assert.equal(
    catalog.domains.some((domain) =>
      domain.instructions.some((entry) => entry.name === "pause_execution"),
    ),
    true,
  );
});

test("instruction schema reports signer accounts and owner-required actions", () => {
  const schema = getProgramInstructionSchema("pauseExecution");
  assert.equal(schema.name, "pause_execution");
  assert.deepEqual(schema.signerAccounts, ["owner"]);
  assert.equal(schema.ownerSignatureRequired, true);
  assert.equal(
    schema.accounts.some((account) => account.name === "treasury"),
    true,
  );
});

test("generic builder normalizes accounts and serializes instruction bytes", async () => {
  const solana = createSolanaContext({
    rpcUrl: "http://127.0.0.1:8899",
    programId: AURA_PROGRAM_ID,
  });
  const owner = new PublicKey(VALID_PUBKEY);
  const build = await buildProgramInstruction(
    solana.client,
    {
      instruction: "pause_execution",
      accounts: {
        treasury: VALID_PUBKEY,
      },
      args: {
        paused: true,
        now: "1",
      },
    },
    { programId: solana.programId, defaultSigner: owner },
  );

  assert.equal(build.schema.name, "pause_execution");
  assert.equal(build.normalizedAccounts.owner, VALID_PUBKEY);
  assert.equal(
    build.serializedInstruction.programId,
    AURA_PROGRAM_ID.toBase58(),
  );
  assert.equal(build.requiredSigners.includes(VALID_PUBKEY), true);
  assert.equal(build.serializedInstruction.dataBase64.length > 0, true);
});
