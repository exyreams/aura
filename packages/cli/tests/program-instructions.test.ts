import assert from "node:assert/strict";
import test from "node:test";

import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import { AURA_PROGRAM_ID, AuraClient } from "../src/sdk.js";
import { createProgram } from "../src/index.js";
import {
  buildProgramInstruction,
  getProgramInstructionCatalog,
  getProgramInstructionSchema,
  mergeJsonInput,
  parseKeyValuePairs,
  type ProgramInstructionSchema,
} from "../src/program-instructions.js";

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

test("instruction catalog exposes every current IDL instruction", () => {
  const catalog = getProgramInstructionCatalog();
  const featureCount = catalog.domains.reduce(
    (total, domain) => total + domain.instructions.length,
    0,
  );

  assert.equal(catalog.totals.instructions, 69);
  assert.equal(featureCount, catalog.totals.instructions);
  assert.equal(
    catalog.domains.flatMap((domain) =>
      domain.instructions.filter((instruction) => !instruction.schema),
    ).length,
    0,
  );
});

test("every current IDL instruction can be build-serialized with generated inputs", async () => {
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
      assert.equal(build.instruction.programId.toBase58(), AURA_PROGRAM_ID.toBase58());
      assert.ok(
        build.instruction.data.length >= 8,
        `${schema.name} should include an Anchor discriminator`,
      );
    } catch (error) {
      failures.push(
        `${schema.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  assert.deepEqual(failures, []);
});

test("schema lookup accepts canonical and camelCase instruction names", () => {
  const snake = getProgramInstructionSchema("configure_budget_envelope");
  const camel = getProgramInstructionSchema("configureBudgetEnvelope");

  assert.equal(snake.name, "configure_budget_envelope");
  assert.deepEqual(camel, snake);
  assert.ok(snake.accounts.some((account) => account.name === "treasury"));
  assert.ok(snake.args.some((arg) => arg.name === "args"));
});

test("key-value overrides merge into JSON objects", () => {
  const overrides = parseKeyValuePairs([
    "treasury=11111111111111111111111111111111",
    "enabled=true",
    "amountUsd=2500",
  ]);
  const merged = mergeJsonInput({ owner: "$wallet" }, overrides);

  assert.deepEqual(merged, {
    owner: "$wallet",
    treasury: "11111111111111111111111111111111",
    enabled: true,
    amountUsd: 2500,
  });
});

test("instruction schema command runs without wallet configuration", async () => {
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
        "instruction",
        "schema",
        "configure_budget_envelope",
      ]);
  } finally {
    console.log = originalLog;
  }

  const parsed = JSON.parse(output) as { name: string; accounts: unknown[] };

  assert.equal(parsed.name, "configure_budget_envelope");
  assert.ok(parsed.accounts.length > 0);
});
