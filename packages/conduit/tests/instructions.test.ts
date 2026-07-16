import { strict as assert } from "node:assert";
import { test } from "node:test";

import { AURA_IDL, AURA_PROGRAM_ID } from "@aura-protocol/sdk-ts";
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
  const featureCount = catalog.domains.reduce(
    (total, domain) => total + domain.instructions.length,
    0,
  );
  assert.equal(featureCount, AURA_IDL.instructions.length);
  assert.equal(catalog.totals.instructions, AURA_IDL.instructions.length);
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
  assert.equal(schema.safety.signerClass, "owner");
  assert.equal(schema.safety.riskLevel, "high");
  assert.equal(schema.safety.humanReview, "required");
  assert.equal(schema.safety.agentPolicy, "human_review_required");
  assert.equal(
    schema.accounts.some((account) => account.name === "treasury"),
    true,
  );
});

test("instruction safety profiles cover every current IDL method", () => {
  for (const instruction of AURA_IDL.instructions) {
    const schema = getProgramInstructionSchema(instruction.name);
    assert.ok(schema.safety.signerClass, instruction.name);
    assert.ok(schema.safety.riskLevel, instruction.name);
    assert.ok(schema.safety.humanReview, instruction.name);
    assert.ok(schema.safety.agentPolicy, instruction.name);
    assert.ok(schema.safety.reasons.length > 0, instruction.name);
  }
});

test("instruction safety distinguishes session and owner review paths", () => {
  const proposal = getProgramInstructionSchema("propose_transaction");
  assert.equal(proposal.safety.signerClass, "ai_authority");
  assert.equal(proposal.safety.agentPolicy, "session_allowed");
  assert.equal(proposal.safety.humanReview, "recommended");

  const recovery = getProgramInstructionSchema("break_glass_recover");
  assert.equal(recovery.safety.signerClass, "owner");
  assert.equal(recovery.safety.riskLevel, "critical");
  assert.equal(recovery.safety.humanReview, "required");

  const publicTrigger = getProgramInstructionSchema("trigger_dead_mans_switch");
  assert.equal(publicTrigger.safety.signerClass, "none");
  assert.equal(publicTrigger.safety.riskLevel, "critical");
  assert.equal(publicTrigger.safety.humanReview, "required");
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
