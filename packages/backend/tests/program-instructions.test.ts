import assert from "node:assert/strict";
import test from "node:test";

import {
  AURA_PROGRAM_ID,
  AuraClient,
} from "@aura-protocol/sdk-ts";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import {
  buildProgramInstruction,
  getProgramInstructionCatalog,
  getProgramInstructionSchema,
  type ProgramInstructionSchema,
} from "../src/services/program-instructions.js";
import { parseProgramInstructionRequest } from "../src/middleware/validation.js";

const DUMMY_CONNECTION = new Connection("http://127.0.0.1:8899", "confirmed");

function sampleAccounts(
  schema: ProgramInstructionSchema,
  wallet: PublicKey,
  programId: PublicKey,
) {
  return Object.fromEntries(
    schema.accounts.map((account) => {
      if (account.address) {
        return [account.name, account.address];
      }
      if (account.name === "system_program") {
        return [account.name, "11111111111111111111111111111111"];
      }
      if (account.name === "caller_program") {
        return [account.name, programId.toBase58()];
      }
      if (account.signer) {
        return [account.name, wallet.toBase58()];
      }
      return [account.name, Keypair.generate().publicKey.toBase58()];
    }),
  );
}

function sampleArgs(schema: ProgramInstructionSchema) {
  if (schema.args.length === 0) {
    return {};
  }
  if (
    schema.args.length === 1 &&
    schema.args[0]?.name === "args" &&
    schema.args[0].sample &&
    typeof schema.args[0].sample === "object" &&
    !Array.isArray(schema.args[0].sample)
  ) {
    return schema.args[0].sample as Record<string, unknown>;
  }
  return Object.fromEntries(schema.args.map((arg) => [arg.name, arg.sample]));
}

test("backend instruction catalog maps every SDK feature to an IDL schema", () => {
  const catalog = getProgramInstructionCatalog();
  const featureCount = catalog.domains.reduce(
    (total, domain) => total + domain.instructions.length,
    0,
  );

  assert.equal(catalog.totals.instructions, 67);
  assert.equal(featureCount, catalog.totals.instructions);
  assert.equal(
    catalog.domains.flatMap((domain) =>
      domain.instructions.filter((instruction) => !instruction.schema),
    ).length,
    0,
  );
});

test("backend builder can serialize every current IDL instruction", async () => {
  const client = new AuraClient({
    connection: DUMMY_CONNECTION,
    programId: AURA_PROGRAM_ID,
  });
  const wallet = Keypair.generate();
  const catalog = getProgramInstructionCatalog();
  const failures: string[] = [];

  for (const instruction of catalog.domains.flatMap(
    (domain) => domain.instructions,
  )) {
    const schema = getProgramInstructionSchema(instruction.name);
    try {
      const build = await buildProgramInstruction(
        client,
        {
          instruction: schema.name,
          accounts: sampleAccounts(schema, wallet.publicKey, AURA_PROGRAM_ID),
          args: sampleArgs(schema),
        },
        { programId: AURA_PROGRAM_ID, defaultSigner: wallet.publicKey },
      );
      assert.equal(
        build.instruction.programId,
        AURA_PROGRAM_ID.toBase58(),
      );
      assert.ok(
        build.instruction.dataBase64.length > 0,
        `${schema.name} should have serialized instruction data`,
      );
    } catch (error) {
      failures.push(
        `${schema.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  assert.deepEqual(failures, []);
});

test("schema lookup supports canonical and camelCase instruction names", () => {
  const canonical = getProgramInstructionSchema("attest_policy");
  const camel = getProgramInstructionSchema("attestPolicy");

  assert.equal(canonical.name, "attest_policy");
  assert.deepEqual(camel, canonical);
  assert.ok(canonical.accounts.some((account) => account.name === "treasury"));
  assert.ok(canonical.args.some((arg) => arg.name === "args"));
});

test("request validation accepts object and array argument payloads", () => {
  const objectPayload = parseProgramInstructionRequest({
    instruction: "configure_budget_envelope",
    accounts: { treasury: "$backend" },
    args: { args: { envelopeId: "ops" } },
    computeUnitLimit: 700000,
  });
  const arrayPayload = parseProgramInstructionRequest({
    instruction: "configure_budget_envelope",
    accounts: { treasury: "$backend" },
    args: [{ envelopeId: "ops" }],
  });

  assert.equal(objectPayload.instruction, "configure_budget_envelope");
  assert.equal(objectPayload.computeUnitLimit, 700000);
  assert.deepEqual(arrayPayload.args, [{ envelopeId: "ops" }]);
});
