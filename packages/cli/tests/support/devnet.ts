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
  const connection = new Connection(RPC_URL, "confirmed");
  const balance = await withRetry(() =>
    connection.getBalance(getPayer().publicKey),
  );
  const sol = balance / LAMPORTS_PER_SOL;
  if (sol < minSol) {
    throw new Error(
      `Payer ${getPayer().publicKey.toBase58()} has ${sol.toFixed(4)} SOL; needs >= ${minSol}. Run: solana airdrop 2 --url devnet`,
    );
  }
  return sol;
}

/** Retries an async RPC call on transient network/RPC failures with backoff. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_ATTEMPTS && isTransient(message)) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1_000 * 2 ** (attempt - 1)),
        );
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export interface JsonResult<T> {
  stdout: string;
  stderr: string;
  status: number | null;
  json: T;
}

const ANSI_DIM = "\x1b[2m";
const ANSI_RESET = "\x1b[0m";

/** The leading non-flag command tokens, e.g. `["treasury","create","--x"] -> "treasury create"`. */
function commandLabel(args: string[]): string {
  const tokens: string[] = [];
  for (const arg of args) {
    if (arg.startsWith("-")) break;
    tokens.push(arg);
  }
  return tokens.join(" ");
}

/**
 * Pretty-prints a confirmed transaction as a labeled, dimmed block — matching
 * the sdk-ts devnet harness output: the full signature plus a clickable devnet
 * explorer link, followed by a blank line. TTY-aware (no ANSI when piped).
 */
function logTransaction(signature: string, label?: string): void {
  const url = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  const heading = label ? `tx signature (${label}): ` : "tx signature: ";
  const body = `    ↳ ${heading}${signature}\n      explorer:     ${url}\n`;
  console.log(process.stdout.isTTY ? `${ANSI_DIM}${body}${ANSI_RESET}` : body);
}

/** Transient network/RPC failures worth retrying (vs. real program errors). */
const TRANSIENT_PATTERN =
  /fetch failed|ETIMEDOUT|ENETUNREACH|ECONNRESET|ECONNREFUSED|EAI_AGAIN|Connect Timeout|UND_ERR_CONNECT_TIMEOUT|socket hang up|recent blockhash|Blockhash not found|node is behind|was not confirmed|429|Too Many Requests|Service Unavailable|Gateway/i;

function isTransient(text: string): boolean {
  return TRANSIENT_PATTERN.test(text);
}

/** Synchronous sleep (runJson is sync via spawnSync). */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const MAX_ATTEMPTS = 4;

/**
 * Spawns the built CLI with `--json --yes --no-simulate` plus the devnet
 * wallet/RPC, and parses its JSON output. Retries on transient network/RPC
 * failures (timeouts, dropped connections, rate limits, stale blockhash) with
 * exponential backoff; the observed transient failures occur before the
 * transaction is submitted, so retrying is safe. Real program errors are
 * surfaced immediately.
 *
 * `--no-simulate` keeps sequential, dependent transactions deterministic (the
 * on-chain confirmation is the assertion); `--yes` skips the risk confirmations.
 */
export function runJson<T>(args: string[]): JsonResult<T> {
  let lastReport = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
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

    const stdout = (result.stdout ?? "").trim();
    const stderr = result.stderr ?? "";

    if (result.status === 0 && stdout) {
      const json = JSON.parse(stdout) as T;
      const signature = (json as { signature?: unknown })?.signature;
      if (typeof signature === "string" && signature.length > 0) {
        logTransaction(signature, commandLabel(args));
      }
      return { stdout, stderr, status: result.status, json };
    }

    lastReport = [stdout, stderr].filter(Boolean).join("\n");
    if (attempt < MAX_ATTEMPTS && isTransient(lastReport)) {
      sleepSync(1_000 * 2 ** (attempt - 1));
      continue;
    }
    break;
  }

  throw new Error(`Command failed: aura ${args.join(" ")}\n${lastReport}`);
}
