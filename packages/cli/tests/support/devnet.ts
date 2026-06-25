/**
 * Devnet integration harness for the CLI.
 *
 * These helpers spawn the built `bin/aura.js` against Solana devnet and parse
 * its `--json` output. They are guarded by {@link DEVNET_AVAILABLE}: when no
 * funded payer keypair is present, the devnet suites skip instead of failing,
 * so the offline unit suite always runs.
 *
 * Prerequisites:
 *   1. A funded devnet keypair at ~/.config/solana/id.json
 *      (or set PAYER_KEYPAIR / AURA_WALLET_PATH).
 *   2. Optionally set AURA_DEVNET_RPC_URL or SOLANA_RPC_URL.
 *   3. Build first: `npm run build` (the test:devnet script does this).
 *
 * Run: `npm run test:devnet`
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

const here = dirname(fileURLToPath(import.meta.url));
/** Repo path: tests/support -> package root. */
export const packageRoot = resolve(here, "..", "..");
const cliBin = join(packageRoot, "bin", "aura.js");

export const RPC_URL =
  process.env.AURA_DEVNET_RPC_URL ??
  process.env.AURA_RPC_URL ??
  process.env.SOLANA_RPC_URL ??
  "https://api.devnet.solana.com";

export const WALLET_PATH =
  process.env.AURA_WALLET_PATH ??
  process.env.PAYER_KEYPAIR ??
  join(homedir(), ".config", "solana", "id.json");

function tryLoadPayer(): Keypair | null {
  try {
    const secret = new Uint8Array(
      JSON.parse(readFileSync(WALLET_PATH, "utf8")) as number[],
    );
    return Keypair.fromSecretKey(secret);
  } catch {
    return null;
  }
}

const maybePayer = tryLoadPayer();

/** Whether a devnet payer keypair is available; gates the devnet suites. */
export const DEVNET_AVAILABLE = maybePayer !== null;

export function getPayer(): Keypair {
  if (!maybePayer) {
    throw new Error(`No devnet payer keypair found at ${WALLET_PATH}`);
  }
  return maybePayer;
}

/** A per-process-unique agent id so re-runs never collide on-chain. */
export function uniqueAgentId(prefix = "cli-test"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Current unix time as a string (CLI `now` arguments are passed as strings). */
export function nowSeconds(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/** Asserts the payer has enough SOL to run the suite; returns its balance in SOL. */
export async function assertFunded(minSol = 0.2): Promise<number> {
  const balance = await new Connection(RPC_URL, "confirmed").getBalance(
    getPayer().publicKey,
  );
  const sol = balance / LAMPORTS_PER_SOL;
  if (sol < minSol) {
    throw new Error(
      `Payer ${getPayer().publicKey.toBase58()} has ${sol.toFixed(4)} SOL; needs >= ${minSol}. Run: solana airdrop 2 --url devnet`,
    );
  }
  return sol;
}

export interface JsonResult<T> {
  stdout: string;
  stderr: string;
  status: number | null;
  json: T;
}

/**
 * Spawns the built CLI with `--json --yes --no-simulate` plus the devnet
 * wallet/RPC, and parses its JSON output. `--no-simulate` keeps sequential,
 * dependent transactions deterministic (the on-chain confirmation is the
 * assertion); `--yes` skips the risk confirmations.
 */
export function runJson<T>(args: string[]): JsonResult<T> {
  const result = spawnSync(
    process.execPath,
    [
      cliBin,
      "--json",
      "--yes",
      "--no-simulate",
      "--rpc-url",
      RPC_URL,
      "--wallet",
      WALLET_PATH,
      "--cluster",
      "devnet",
      ...args,
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        AURA_RPC_URL: RPC_URL,
        AURA_WALLET_PATH: WALLET_PATH,
        NODE_NO_WARNINGS: "1",
      },
    },
  );

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: aura ${args.join(" ")}`,
        result.stdout,
        result.stderr,
      ].join("\n"),
    );
  }
  const stdout = (result.stdout ?? "").trim();
  if (!stdout) {
    throw new Error(
      `Command produced no JSON: aura ${args.join(" ")}\n${result.stderr}`,
    );
  }
  return {
    stdout,
    stderr: result.stderr ?? "",
    status: result.status,
    json: JSON.parse(stdout) as T,
  };
}
