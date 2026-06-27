/**
 * Devnet integration test harness.
 *
 * These helpers submit real transactions to Solana devnet through the
 * *published* `@aura-protocol/sdk-ts` surface (not its internal source), so the
 * suite doubles as a dogfooding check of the package's exports. They are
 * guarded by {@link DEVNET_AVAILABLE}: when no funded payer keypair is found
 * the suites skip instead of failing.
 *
 * Prerequisites:
 *   1. A funded devnet keypair at ~/.config/solana/id.json
 *      (or set PAYER_KEYPAIR / AURA_WALLET_PATH).
 *   2. Optionally set AURA_DEVNET_RPC_URL or SOLANA_RPC_URL (a full RPC URL),
 *      or HELIUS_API_KEY to use Helius. Falls back to the public devnet RPC.
 *
 * Run: `npm run test:devnet`
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  AuraClient,
  accounts,
  type ConfigureMultisigArgs,
  type ConfigureSwarmArgs,
  type CreateTreasuryArgs,
  DEVNET_RPC_URL,
  instructions,
  type ProposeTransactionArgs,
  type RegisterDwalletArgs,
} from "@aura-protocol/sdk-ts";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  type PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { buildCreateTreasuryArgs, sampleDefined } from "./fixtures.js";

/**
 * Resolves the devnet RPC endpoint without baking any secret into source.
 * Priority:
 *   1. AURA_DEVNET_RPC_URL / SOLANA_RPC_URL — a full RPC URL (any provider).
 *   2. HELIUS_API_KEY — builds the Helius devnet URL from the key in the env.
 *   3. the SDK's public devnet default (rate-limited, fine for light runs).
 */
function resolveRpcUrl(): string {
  const explicit =
    process.env.AURA_DEVNET_RPC_URL ?? process.env.SOLANA_RPC_URL;
  if (explicit) return explicit;

  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) {
    return `https://devnet.helius-rpc.com/?api-key=${heliusKey}`;
  }

  return DEVNET_RPC_URL;
}

export const RPC_URL = resolveRpcUrl();

function payerPath(): string {
  return (
    process.env.PAYER_KEYPAIR ??
    process.env.AURA_WALLET_PATH ??
    join(homedir(), ".config", "solana", "id.json")
  );
}

function tryLoadPayer(): Keypair | null {
  try {
    const raw = new Uint8Array(
      JSON.parse(readFileSync(payerPath(), "utf8")) as number[],
    );
    return Keypair.fromSecretKey(raw);
  } catch {
    return null;
  }
}

const maybePayer = tryLoadPayer();

/** Whether a devnet payer keypair is available; gates the devnet suites. */
export const DEVNET_AVAILABLE = maybePayer !== null;

/** Returns the loaded payer or throws (only call inside non-skipped tests). */
export function getPayer(): Keypair {
  if (!maybePayer) {
    throw new Error(`No devnet payer keypair found at ${payerPath()}`);
  }
  return maybePayer;
}

let cachedConnection: Connection | null = null;
let cachedClient: AuraClient | null = null;

const ANSI_DIM = "\x1b[2m";
const ANSI_RESET = "\x1b[0m";

/**
 * Prints a confirmed transaction as an indented tree nested under the running
 * test: the step name, then its details (full signature, full explorer link,
 * and any extra key/value pairs) on connected child lines. TTY output is dimmed;
 * CI output is plain. A trailing blank line keeps successive transactions
 * readable.
 *
 * Transactions emitted from a suite's `before()` setup (createTreasury,
 * transitionAgentState, ...) print above the first test's result line — that is
 * expected: node:test runs hooks before any test and interleaves their stdout.
 */
export function logTransaction(
  label: string,
  signature: string,
  extra?: Record<string, string>,
): void {
  const url = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  const entries: [string, string][] = [
    ["sig:", signature],
    ["url:", url],
    ...Object.entries(extra ?? {}),
  ];
  // `branchIndent` controls the left padding of every branch line; bump it to
  // shift the whole tree right. `connector` is just the glyph.
  const branchIndent = "      ";
  const lines = [`  ↳ ${label}`];
  entries.forEach(([key, value], index) => {
    const connector = index === entries.length - 1 ? "└─" : "├─";
    lines.push(`${branchIndent}${connector} ${key.padEnd(3)} ${value}`);
  });
  const body = `${lines.join("\n")}\n`;
  console.log(process.stdout.isTTY ? `${ANSI_DIM}${body}${ANSI_RESET}` : body);
}

const MAX_ATTEMPTS = 4;

/** Transient network/RPC failures worth retrying (vs. real program errors). */
const TRANSIENT_PATTERN =
  /fetch failed|ETIMEDOUT|ENETUNREACH|ECONNRESET|ECONNREFUSED|EAI_AGAIN|Connect Timeout|UND_ERR_CONNECT_TIMEOUT|socket hang up|node is behind|429|Too Many Requests|Service Unavailable|Gateway/i;

function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PATTERN.test(message);
}

/**
 * Retries an async RPC call on transient network/RPC failures with exponential
 * backoff. Resubmitting an identical signed transaction is safe: it carries the
 * same signature, so the cluster de-duplicates it.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS && isTransient(error)) {
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

export function connection(): Connection {
  cachedConnection ??= new Connection(RPC_URL, "confirmed");
  return cachedConnection;
}

export function devnetClient(): AuraClient {
  cachedClient ??= new AuraClient({ connection: connection() });
  return cachedClient;
}

/** Current unix time as a BN (the program's `now`/timestamp arguments). */
export function nowBN(): BN {
  return new BN(Math.floor(Date.now() / 1000));
}

/** A per-process-unique agent id so re-runs never collide on-chain. */
export function uniqueAgentId(prefix = "sdk-test"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Builds a structurally-complete, sensible {@link CreateTreasuryArgs} for a
 * fresh treasury (see {@link buildCreateTreasuryArgs}).
 */
export function createTreasuryArgs(
  owner: PublicKey,
  agentId: string,
  now: BN = nowBN(),
): CreateTreasuryArgs {
  return buildCreateTreasuryArgs(owner, agentId, now);
}

/**
 * Confirms a signature by polling `getSignatureStatuses` over HTTP until it
 * reaches the `confirmed` commitment or its blockhash expires.
 *
 * This deliberately avoids web3.js's WebSocket-based `confirmTransaction`: the
 * subscription leaves background activity (its unsubscribe round-trip) that can
 * reject *after* a test ends and surface as an unhandled rejection on a flaky
 * RPC. Polling keeps the harness fully WebSocket-free and awaited.
 */
async function pollConfirmation(
  conn: Connection,
  signature: string,
  lastValidBlockHeight: number,
): Promise<void> {
  for (;;) {
    const { value } = await withRetry(() =>
      conn.getSignatureStatuses([signature]),
    );
    const status = value[0];
    if (status?.err) {
      throw new Error(
        `transaction ${signature} failed: ${JSON.stringify(status.err)}`,
      );
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    const blockHeight = await withRetry(() => conn.getBlockHeight("confirmed"));
    if (blockHeight > lastValidBlockHeight) {
      throw new Error(
        `transaction ${signature} expired (block height ${blockHeight} > ${lastValidBlockHeight})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/**
 * Builds, signs, sends, and confirms a transaction against the configured
 * blockhash so callers can assert on-chain state immediately afterwards.
 */
export async function sendAndConfirm(
  ixs: TransactionInstruction[],
  extraSigners: Keypair[] = [],
  label = "transaction",
): Promise<string> {
  const payer = getPayer();
  const conn = connection();
  const { blockhash, lastValidBlockHeight } = await withRetry(() =>
    conn.getLatestBlockhash("confirmed"),
  );

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), ...ixs);
  tx.sign(payer, ...extraSigners);

  const signature = await withRetry(() =>
    conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    }),
  );
  await pollConfirmation(conn, signature, lastValidBlockHeight);
  logTransaction(label, signature);
  return signature;
}

const EVM_DEAD = "0x000000000000000000000000000000000000dead";

/** A public, low-value transaction proposal for the given chain. */
export function proposeTransactionArgs(
  now: BN = nowBN(),
): ProposeTransactionArgs {
  const args = sampleDefined(
    "ProposeTransactionArgs",
  ) as ProposeTransactionArgs;
  args.amountUsd = new BN(100);
  args.targetChain = 2; // Ethereum
  args.txType = 0;
  args.currentTimestamp = now;
  args.recipientOrContract = EVM_DEAD;
  return args;
}

/** A dWallet reference (no live Ika signing). */
export function registerDwalletArgs(
  dwalletId: string,
  now: BN = nowBN(),
): RegisterDwalletArgs {
  const args = sampleDefined("RegisterDwalletArgs") as RegisterDwalletArgs;
  args.chain = 2; // Ethereum
  args.dwalletId = dwalletId;
  args.address = EVM_DEAD;
  args.balanceUsd = new BN(5_000);
  args.timestamp = now;
  return args;
}

/** A 1-of-N guardian multisig configuration. */
export function configureMultisigArgs(
  guardians: PublicKey[],
  now: BN = nowBN(),
): ConfigureMultisigArgs {
  return {
    requiredSignatures: 1,
    guardians,
    guardianWeights: guardians.map(() => 1),
    requiredApprovalWeight: 1,
    timestamp: now,
  };
}

/** A swarm configuration with the given member agent ids. */
export function configureSwarmArgs(
  swarmId: string,
  memberAgents: string[],
  now: BN = nowBN(),
): ConfigureSwarmArgs {
  return {
    swarmId,
    memberAgents,
    sharedPoolLimitUsd: new BN(50_000),
    timestamp: now,
  };
}

/** A provisioned treasury and the identifiers needed to drive it. */
export interface ProvisionedTreasury {
  owner: PublicKey;
  treasury: PublicKey;
  agentId: string;
}

/**
 * Creates a fresh treasury on devnet (owner = payer, aiAuthority = payer), and
 * optionally transitions it to the Active state so it can accept proposals.
 * Each call uses a unique agent id, so suites never collide on re-runs.
 *
 * `mutateArgs` lets a caller tweak the policy config (e.g. tighten a limit)
 * before creation, which is what the policy-enforcement suites use.
 */
export async function provisionTreasury(options?: {
  activate?: boolean;
  prefix?: string;
  mutateArgs?: (args: CreateTreasuryArgs) => void;
}): Promise<ProvisionedTreasury> {
  const client = devnetClient();
  const owner = getPayer().publicKey;
  const agentId = uniqueAgentId(options?.prefix ?? "prov");
  const args = createTreasuryArgs(owner, agentId);
  options?.mutateArgs?.(args);

  const { treasury, input } = accounts.createTreasuryInput({ owner, args });
  await sendAndConfirm(
    [await instructions.treasury.createTreasury(client, input)],
    [],
    "createTreasury",
  );

  if (options?.activate) {
    await sendAndConfirm(
      [
        await instructions.lifecycle.transitionAgentState(client, {
          accounts: { owner, treasury },
          args: { targetState: 1, now: nowBN() },
        }),
      ],
      [],
      "transitionAgentState",
    );
  }

  return { owner, treasury, agentId };
}

/**
 * Asserts that sending `ixs` fails on-chain (preflight or execution). Returns
 * the thrown error so callers can inspect the program error code.
 */
export async function expectSendToFail(
  ixs: TransactionInstruction[],
  label?: string,
): Promise<unknown> {
  try {
    await sendAndConfirm(ixs, [], label ?? "expected-failure");
  } catch (error) {
    return error;
  }
  throw new Error(
    `expected the transaction${label ? ` (${label})` : ""} to fail, but it succeeded`,
  );
}

/**
 * The full account set `propose_transaction` consults. All optional sidecars
 * default to `null`; pass `overrides` to wire a specific one (e.g. an
 * `addressList` PDA when testing allow/deny enforcement).
 */
type ProposeAccountsInput =
  instructions.execution.ProposeTransactionInput["accounts"];

export function proposeAccounts(
  treasury: PublicKey,
  overrides: Partial<ProposeAccountsInput> = {},
): ProposeAccountsInput {
  return {
    aiAuthority: getPayer().publicKey,
    treasury,
    sessionKeyAccount: null,
    swarmPool: null,
    addressList: null,
    complianceOracle: null,
    parentTreasury: null,
    budgetEnvelope: null,
    exposureGroup: null,
    dwalletState: null,
    chainProfile: null,
    trustIdentity: null,
    policyCanary: null,
    ...overrides,
  };
}
