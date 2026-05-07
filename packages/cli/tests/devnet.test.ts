import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const cliBin = join(packageRoot, "bin", "aura.js");
const rpcUrl =
  process.env["AURA_DEVNET_RPC_URL"] ??
  process.env["AURA_RPC_URL"] ??
  process.env["SOLANA_RPC_URL"] ??
  "https://api.devnet.solana.com";
const walletPath =
  process.env["AURA_WALLET_PATH"] ??
  process.env["PAYER_KEYPAIR"] ??
  join(homedir(), ".config", "solana", "id.json");

interface JsonCommandResult<T> {
  stdout: string;
  stderr: string;
  json: T;
}

function loadPayer() {
  const secret = new Uint8Array(
    JSON.parse(readFileSync(walletPath, "utf8")) as number[],
  );
  return Keypair.fromSecretKey(secret);
}

function runJson<T>(args: string[]): JsonCommandResult<T> {
  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "--json",
      "--rpc-url",
      rpcUrl,
      "--wallet",
      walletPath,
      "--cluster",
      "devnet",
      ...args,
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        AURA_RPC_URL: rpcUrl,
        AURA_WALLET_PATH: walletPath,
        NODE_NO_WARNINGS: "1",
      },
    },
  );

  assert.equal(
    result.status,
    0,
    [
      `Command failed: aura ${args.join(" ")}`,
      result.stdout,
      result.stderr,
    ].join("\n"),
  );

  const stdout = result.stdout.trim();
  assert.ok(stdout.length > 0, `Command produced no JSON: aura ${args.join(" ")}`);
  return {
    stdout,
    stderr: result.stderr,
    json: JSON.parse(stdout) as T,
  };
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

test("devnet CLI release flow covers catalog, treasury, policy, governance, and dWallet commands", async () => {
  const payer = loadPayer();
  const balance = await new Connection(rpcUrl, "confirmed").getBalance(
    payer.publicKey,
  );
  assert.ok(
    balance > 0.5 * LAMPORTS_PER_SOL,
    `Payer ${payer.publicKey.toBase58()} needs devnet SOL for CLI integration tests.`,
  );
  console.log(
    `  payer: ${payer.publicKey.toBase58()} balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
  );

  const suffix = Date.now().toString(36);
  const agentId = `cli-rc-${suffix}`;

  const config = runJson<{
    values: { walletPath: string; rpcUrl: string };
  }>(["config", "show"]).json;
  assert.equal(config.values.walletPath, walletPath);

  const features = runJson<{
    totals: { domains: number; instructions: number; allInstructions: number };
  }>(["features"]).json;
  assert.equal(features.totals.allInstructions, 70);
  assert.equal(features.totals.instructions, 70);

  const instructionCatalog = runJson<{
    totals: { domains: number; instructions: number };
  }>(["instruction", "list"]).json;
  assert.equal(instructionCatalog.totals.instructions, 70);

  const schema = runJson<{ name: string; args: unknown[] }>([
    "instruction",
    "schema",
    "transition_agent_state",
  ]).json;
  assert.equal(schema.name, "transition_agent_state");
  assert.equal(schema.args.length, 2);

  const created = runJson<{ treasury: string; signature: string }>([
    "treasury",
    "create",
    "--agent-id",
    agentId,
    "--daily-limit",
    "12000",
    "--per-tx-limit",
    "1200",
    "--daytime-hourly-limit",
    "3000",
    "--nighttime-hourly-limit",
    "700",
    "--velocity-limit",
    "6000",
  ]).json;
  assert.ok(created.signature);
  assert.ok(created.treasury);
  console.log(`  treasury.create tx: ${created.signature}`);
  console.log(`  treasury PDA:       ${created.treasury}`);

  const activated = runJson<{ signature: string }>([
    "instruction",
    "send",
    "transition_agent_state",
    "--account",
    "owner=$wallet",
    "--account",
    `treasury=${created.treasury}`,
    "--args",
    JSON.stringify({ target_state: 1, now: now() }),
  ]).json;
  assert.ok(activated.signature);
  console.log(`  instruction.transition_agent_state tx: ${activated.signature}`);

  const shown = runJson<{ account: { agentId: string; agentState: number } }>([
    "treasury",
    "show",
    "--agent-id",
    agentId,
  ]).json;
  assert.equal(shown.account.agentId, agentId);
  assert.equal(shown.account.agentState, 1);

  const proposed = runJson<{ signature: string }>([
    "treasury",
    "propose",
    "--agent-id",
    agentId,
    "--amount",
    "75",
    "--chain",
    "solana",
    "--tx-type",
    "transfer",
    "--recipient",
    payer.publicKey.toBase58(),
  ]).json;
  assert.ok(proposed.signature);
  console.log(`  treasury.propose tx: ${proposed.signature}`);

  const cancelled = runJson<{ signature: string }>([
    "treasury",
    "cancel",
    "--agent-id",
    agentId,
    "--yes",
  ]).json;
  assert.ok(cancelled.signature);
  console.log(`  treasury.cancel tx: ${cancelled.signature}`);

  const paused = runJson<{ signature: string; paused: boolean }>([
    "treasury",
    "pause",
    "--agent-id",
    agentId,
    "--yes",
  ]).json;
  assert.equal(paused.paused, true);
  console.log(`  treasury.pause tx: ${paused.signature}`);

  const unpaused = runJson<{ signature: string; paused: boolean }>([
    "treasury",
    "pause",
    "--agent-id",
    agentId,
    "--unpause",
    "--yes",
  ]).json;
  assert.equal(unpaused.paused, false);
  console.log(`  treasury.unpause tx: ${unpaused.signature}`);

  const guardian = Keypair.generate().publicKey.toBase58();
  const multisig = runJson<{ signature: string }>([
    "governance",
    "multisig",
    "--agent-id",
    agentId,
    "--required",
    "1",
    "--guardians",
    `${payer.publicKey.toBase58()},${guardian}`,
  ]).json;
  assert.ok(multisig.signature);
  console.log(`  governance.multisig tx: ${multisig.signature}`);

  const swarm = runJson<{ signature: string }>([
    "governance",
    "swarm",
    "--agent-id",
    agentId,
    "--swarm-id",
    `swarm-${suffix}`,
    "--members",
    `${agentId},peer-${suffix}`,
    "--pool-limit",
    "50000",
  ]).json;
  assert.ok(swarm.signature);
  console.log(`  governance.swarm tx: ${swarm.signature}`);

  const dwallet = runJson<{ signature: string }>([
    "dwallet",
    "register",
    "--agent-id",
    agentId,
    "--chain",
    "solana",
    "--dwallet-id",
    `dwallet-${suffix}`,
    "--address",
    payer.publicKey.toBase58(),
    "--balance",
    "2500",
  ]).json;
  assert.ok(dwallet.signature);
  console.log(`  dwallet.register tx: ${dwallet.signature}`);

  const dwallets = runJson<{ dwallets: unknown[] }>([
    "dwallet",
    "list",
    "--agent-id",
    agentId,
  ]).json;
  assert.equal(dwallets.dwallets.length, 1);

  const pda = runJson<{ address: string }>([
    "pda",
    "treasury",
    "--owner",
    payer.publicKey.toBase58(),
    "--agent-id",
    agentId,
  ]).json;
  assert.equal(pda.address, created.treasury);
});
