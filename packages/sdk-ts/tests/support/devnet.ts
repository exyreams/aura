/**
 * Devnet integration test harness.
 *
 * These helpers submit real transactions to Solana devnet. They are guarded by
 * {@link DEVNET_AVAILABLE}: when no funded payer keypair is found, the devnet
 * suites skip instead of failing so the offline unit suite stays runnable.
 *
 * Prerequisites:
 *   1. A funded devnet keypair at ~/.config/solana/id.json
 *      (or set PAYER_KEYPAIR / AURA_WALLET_PATH).
 *   2. Optionally set AURA_DEVNET_RPC_URL or SOLANA_RPC_URL.
 *
 * Run: `npm run test:devnet`
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  type PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  AuraClient,
  type ConfigureMultisigArgs,
  type ConfigureSwarmArgs,
  type CreateTreasuryArgs,
  DEVNET_RPC_URL,
  type ProposeTransactionArgs,
  type RegisterDwalletArgs,
} from "../../src/index.js";
import { buildCreateTreasuryArgs, sampleDefined } from "./sample.js";

export const RPC_URL =
  process.env.AURA_DEVNET_RPC_URL ??
  process.env.SOLANA_RPC_URL ??
  DEVNET_RPC_URL;

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
 * Builds, signs, sends, and confirms a transaction against the configured
 * blockhash so callers can assert on-chain state immediately afterwards.
 */
export async function sendAndConfirm(
  instructions: TransactionInstruction[],
  extraSigners: Keypair[] = [],
): Promise<string> {
  const payer = getPayer();
  const conn = connection();
  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash("confirmed");

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
    ...instructions,
  );
  tx.sign(payer, ...extraSigners);

  const signature = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await conn.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
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
