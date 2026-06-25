/** Top-level CLI behavior (in-process, no network). */

import assert from "node:assert/strict";
import test from "node:test";

import { AURA_IDL } from "@aura-protocol/sdk-ts";

import { runCli, runCliJson, tempWallet } from "../support/offline.js";

test("ix list reports the full instruction surface", async () => {
  const json = await runCliJson<{
    totals: { domains: number; instructions: number };
  }>(["ix", "list"]);
  assert.equal(json.totals.instructions, AURA_IDL.instructions.length);
  assert.equal(json.totals.domains, 13);
});

test("features reports a non-empty surface", async () => {
  const json = await runCliJson<{ totals: { instructions: number } }>([
    "features",
  ]);
  assert.ok(json.totals.instructions > 0);
});

test("--help lists ergonomic and generated command groups", async () => {
  const { stdout } = await runCli(["--help"]);
  for (const group of [
    "treasury",
    "dwallet",
    "confidential",
    "execution",
    "governance",
    "policy",
    "budget",
    "instruction",
    "pda",
  ]) {
    assert.match(
      stdout,
      new RegExp(`\\b${group}\\b`),
      `help should mention ${group}`,
    );
  }
});

test("unknown commands raise an error (exitOverride)", async () => {
  const { error } = await runCli(["definitely-not-a-command"]);
  assert.ok(error, "an unknown command should throw under exitOverride");
});

test("ix schema works without a wallet", async () => {
  const json = await runCliJson<{ name: string; accounts: unknown[] }>([
    "ix",
    "schema",
    "create_treasury",
  ]);
  assert.equal(json.name, "create_treasury");
  assert.ok(json.accounts.length > 0);
});

test("treasury create --dry-run builds the instruction without sending", async () => {
  const wallet = tempWallet();
  try {
    const json = await runCliJson<{
      dryRun: boolean;
      instructions: unknown[];
      treasury: string;
    }>([
      "--wallet",
      wallet.path,
      "--dry-run",
      "treasury",
      "create",
      "--agent-id",
      "unit-dry",
      "--daily-limit",
      "1000",
      "--per-tx-limit",
      "100",
    ]);
    assert.equal(json.dryRun, true);
    assert.equal(json.instructions.length, 1);
    assert.ok(json.treasury);
  } finally {
    wallet.cleanup();
  }
});
