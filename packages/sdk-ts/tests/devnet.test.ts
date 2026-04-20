/**
 * Devnet integration tests for the AURA TypeScript SDK.
 *
 * These tests submit real transactions to Solana devnet and verify on-chain
 * state via account fetches.  They are intentionally separate from the unit
 * tests in client.test.ts so the CI fast-path can skip them.
 *
 * Prerequisites
 * ─────────────
 * 1. A funded devnet keypair at ~/.config/solana/id.json
 *    (or set PAYER_KEYPAIR=/path/to/keypair.json)
 * 2. Optionally set AURA_DEVNET_RPC_URL or SOLANA_RPC_URL to a custom RPC
 *    endpoint to avoid public rate limits.
 *
 * Run
 * ───
 *   npm run test:devnet
 *
 * Instructions that require the Ika dWallet / Encrypt gRPC network
 * (execute_pending, propose_confidential_transaction, etc.) are not covered
 * here — use the Rust smoke tests in smoke/aura-devnet/ for those flows.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import BN from "bn.js";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

import {
  AURA_PROGRAM_ID,
  AuraClient,
  DEVNET_RPC_URL,
  type ConfigureMultisigArgs,
  type ConfigureSwarmArgs,
  type CreateTreasuryArgs,
  type ProposeTransactionArgs,
  type RegisterDwalletArgs,
  type TreasuryAccountRecord,
} from "../src/index.js";

// environment

const RPC_URL =
  process.env["AURA_DEVNET_RPC_URL"] ??
  process.env["SOLANA_RPC_URL"] ??
  DEVNET_RPC_URL;

function loadPayer(): Keypair {
  const path =
    process.env["PAYER_KEYPAIR"] ?? join(homedir(), ".config", "solana", "id.json");
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(JSON.parse(readFileSync(path, "utf8")) as number[]);
  } catch {
    throw new Error(
      `Could not load payer keypair from ${path}.\n` +
      `Set PAYER_KEYPAIR=/path/to/keypair.json or ensure ~/.config/solana/id.json exists.\n` +
      `Fund it with: solana airdrop 1 --url devnet`,
    );
  }
  return Keypair.fromSecretKey(raw);
}

// shared fixtures (created once, reused across tests)

const connection = new Connection(RPC_URL, "confirmed");
const client = new AuraClient({ connection });
const payer = loadPayer();

// Each test run uses a unique agentId so re-runs don't collide with existing
// on-chain state.
const RUN_ID = Date.now().toString(36);
const AGENT_ID = `sdk-test-${RUN_ID}`;

let treasuryPDA: PublicKey;

// helpers

function nowBN(): BN {
  return new BN(Math.floor(Date.now() / 1000));
}

function createTreasuryArgs(): CreateTreasuryArgs {
  return {
    agentId: AGENT_ID,
    aiAuthority: payer.publicKey,
    createdAt: nowBN(),
    pendingTransactionTtlSecs: new BN(900),
    policyConfig: {
      dailyLimitUsd: new BN(10_000),
      perTxLimitUsd: new BN(1_000),
      daytimeHourlyLimitUsd: new BN(2_500),
      nighttimeHourlyLimitUsd: new BN(500),
      velocityLimitUsd: new BN(5_000),
      allowedProtocolBitmap: new BN(31),
      maxSlippageBps: new BN(100),
      maxQuoteAgeSecs: new BN(300),
      maxCounterpartyRiskScore: 70,
      bitcoinManualReviewThresholdUsd: new BN(5_000),
      sharedPoolLimitUsd: null,
      reputationPolicy: {
        highScoreThreshold: new BN(80),
        mediumScoreThreshold: new BN(50),
        highMultiplierBps: new BN(15_000),
        lowMultiplierBps: new BN(7_000),
      },
    },
    protocolFees: {
      treasuryCreationFeeUsd: new BN(100),
      transactionFeeBps: new BN(10),
      fheSubsidyBps: new BN(5_000),
    },
  };
}

async function sendAndConfirm(
  instructions: TransactionInstruction[],
  extraSigners: Keypair[] = [],
): Promise<string> {
  // Fetch a fresh blockhash, build and sign the transaction, send it, then
  // explicitly wait for confirmation against that blockhash before returning.
  // This prevents the "account does not exist" race that occurs when we assert
  // immediately after sendTransaction (which returns before the validator
  // processes the tx).
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.add(...instructions);
  tx.sign(payer, ...extraSigners);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  return sig;
}

// balance check

test("devnet: payer has enough SOL to run tests", async () => {
  const balance = await connection.getBalance(payer.publicKey);
  const minLamports = 0.05 * LAMPORTS_PER_SOL;
  assert.ok(
    balance >= minLamports,
    `Payer ${payer.publicKey.toBase58()} has only ${balance / LAMPORTS_PER_SOL} SOL. ` +
    `Run: solana airdrop 1 --url devnet`,
  );
  console.log(
    `  payer: ${payer.publicKey.toBase58()}  balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
  );
});

// create treasury

test("devnet: createTreasury submits and lands on-chain", async () => {
  const args = createTreasuryArgs();
  const { treasury, instruction } = await client.createTreasuryInstruction({
    owner: payer.publicKey,
    args,
  });
  treasuryPDA = treasury;

  const sig = await sendAndConfirm([instruction]);
  console.log(`  createTreasury tx: ${sig}`);
  console.log(`  treasury PDA:      ${treasury.toBase58()}`);

  // Verify the account now exists on-chain
  const info = await connection.getAccountInfo(treasury);
  assert.ok(info !== null, "treasury account should exist after creation");
  assert.ok(info.data.length > 0, "treasury account should have data");
  assert.equal(
    info.owner.toBase58(),
    AURA_PROGRAM_ID.toBase58(),
    "treasury account should be owned by the AURA program",
  );
});

// fetch treasury account

test("devnet: getTreasuryAccount deserializes on-chain state", async () => {
  const account: TreasuryAccountRecord = await client.getTreasuryAccount(treasuryPDA);

  assert.equal(
    account.owner.toBase58(),
    payer.publicKey.toBase58(),
    "owner should match payer",
  );
  assert.equal(account.agentId, AGENT_ID, "agentId should round-trip");
  assert.equal(
    account.aiAuthority.toBase58(),
    payer.publicKey.toBase58(),
    "aiAuthority should match",
  );
  assert.ok(!account.executionPaused, "treasury should not be paused after creation");
  console.log(`  agentId: ${account.agentId}  paused: ${String(account.executionPaused)}`);
});

// getTreasuryForOwner

test("devnet: getTreasuryForOwner resolves PDA and fetches account", async () => {
  const { treasury, account } = await client.getTreasuryForOwner(
    payer.publicKey,
    AGENT_ID,
  );
  assert.equal(treasury.toBase58(), treasuryPDA.toBase58());
  assert.ok(account !== null, "account should be non-null");
  assert.equal(account!.agentId, AGENT_ID);
});

// getTreasuryAccountNullable

test("devnet: getTreasuryAccountNullable returns null for non-existent PDA", async () => {
  const ghost = Keypair.generate().publicKey;
  const result = await client.getTreasuryAccountNullable(ghost);
  assert.equal(result, null, "should return null for an account that does not exist");
});

// propose transaction

test("devnet: proposeTransaction submits and lands on-chain", async () => {
  const args: ProposeTransactionArgs = {
    amountUsd: new BN(100),
    targetChain: 2, // Ethereum
    txType: 0,
    protocolId: null,
    currentTimestamp: nowBN(),
    expectedOutputUsd: null,
    actualOutputUsd: null,
    quoteAgeSecs: null,
    counterpartyRiskScore: null,
    recipientOrContract: "0x000000000000000000000000000000000000dead",
  };

  const instruction = await client.proposeTransactionInstruction(
    { aiAuthority: payer.publicKey, treasury: treasuryPDA },
    args,
  );
  const sig = await sendAndConfirm([instruction]);
  console.log(`  proposeTransaction tx: ${sig}`);

  // After a proposal the treasury should have a pending transaction
  const account = await client.getTreasuryAccount(treasuryPDA);
  assert.ok(
    account.pending !== null,
    "treasury should have a pending transaction after proposal",
  );
});

// cancel pending

test("devnet: cancelPending clears the pending transaction", async () => {
  const instruction = await client.cancelPendingInstruction(
    { owner: payer.publicKey, treasury: treasuryPDA },
    nowBN(),
  );
  const sig = await sendAndConfirm([instruction]);
  console.log(`  cancelPending tx: ${sig}`);

  const account = await client.getTreasuryAccount(treasuryPDA);
  assert.equal(
    account.pending,
    null,
    "pending transaction should be cleared after cancel",
  );
});

// pause / unpause

test("devnet: pauseExecution pauses the treasury", async () => {
  const instruction = await client.pauseExecutionInstruction(
    { owner: payer.publicKey, treasury: treasuryPDA },
    true,
    nowBN(),
  );
  const sig = await sendAndConfirm([instruction]);
  console.log(`  pauseExecution(true) tx: ${sig}`);

  const account = await client.getTreasuryAccount(treasuryPDA);
  assert.ok(account.executionPaused, "treasury should be paused");
});

test("devnet: pauseExecution unpauses the treasury", async () => {
  const instruction = await client.pauseExecutionInstruction(
    { owner: payer.publicKey, treasury: treasuryPDA },
    false,
    nowBN(),
  );
  const sig = await sendAndConfirm([instruction]);
  console.log(`  pauseExecution(false) tx: ${sig}`);

  const account = await client.getTreasuryAccount(treasuryPDA);
  assert.ok(!account.executionPaused, "treasury should be unpaused");
});

// configure multisig

test("devnet: configureMultisig sets guardians on-chain", async () => {
  const guardian1 = Keypair.generate().publicKey;
  const guardian2 = Keypair.generate().publicKey;

  const args: ConfigureMultisigArgs = {
    requiredSignatures: 1,
    guardians: [guardian1, guardian2],
    timestamp: nowBN(),
  };

  const instruction = await client.configureMultisigInstruction(
    { owner: payer.publicKey, treasury: treasuryPDA },
    args,
  );
  const sig = await sendAndConfirm([instruction]);
  console.log(`  configureMultisig tx: ${sig}`);

  const account = await client.getTreasuryAccount(treasuryPDA);
  const multisig = account.multisig;
  assert.ok(multisig !== null, "multisig should be set");
  assert.equal(
    multisig!.guardians.length,
    2,
    "should have 2 guardians",
  );
  assert.ok(
    multisig!.guardians.some((g: PublicKey) => g.toBase58() === guardian1.toBase58()),
    "guardian1 should be registered",
  );
  assert.ok(
    multisig!.guardians.some((g: PublicKey) => g.toBase58() === guardian2.toBase58()),
    "guardian2 should be registered",
  );
});

// configure swarm

test("devnet: configureSwarm sets swarm config on-chain", async () => {
  const args: ConfigureSwarmArgs = {
    swarmId: `swarm-${RUN_ID}`,
    memberAgents: [AGENT_ID, `peer-agent-${RUN_ID}`],
    sharedPoolLimitUsd: new BN(50_000),
    timestamp: nowBN(),
  };

  const instruction = await client.configureSwarmInstruction(
    { owner: payer.publicKey, treasury: treasuryPDA },
    args,
  );
  const sig = await sendAndConfirm([instruction]);
  console.log(`  configureSwarm tx: ${sig}`);

  const account = await client.getTreasuryAccount(treasuryPDA);
  assert.ok(account.swarm !== null, "swarm should be set");
  assert.equal(
    account.swarm!.swarmId,
    args.swarmId,
    "swarmId should round-trip",
  );
});

// register dWallet (no live Ika signing)

test("devnet: registerDwallet registers a dWallet reference on-chain", async () => {
  const args: RegisterDwalletArgs = {
    chain: 2, // Ethereum
    dwalletId: `dwallet-${RUN_ID}`,
    address: "0x000000000000000000000000000000000000dead",
    balanceUsd: new BN(5_000),
    dwalletAccount: null,
    authorizedUserPubkey: null,
    messageMetadataDigest: null,
    publicKeyHex: null,
    timestamp: nowBN(),
  };

  const instruction = await client.registerDwalletInstruction(
    { owner: payer.publicKey, treasury: treasuryPDA },
    args,
  );
  const sig = await sendAndConfirm([instruction]);
  console.log(`  registerDwallet tx: ${sig}`);

  const account = await client.getTreasuryAccount(treasuryPDA);
  assert.ok(
    account.dwallets !== null && account.dwallets.length > 0,
    "dwallets list should be non-empty after registration",
  );
  const registered = account.dwallets.find(
    (d: { dwalletId: string }) => d.dwalletId === args.dwalletId,
  );
  assert.ok(registered !== undefined, "registered dWallet should appear in account state");
  assert.equal(registered!.address, args.address, "address should round-trip");

});

// propose transaction after dWallet registration

test("devnet: proposeTransaction succeeds after dWallet is registered", async () => {
  const args: ProposeTransactionArgs = {
    amountUsd: new BN(50),
    targetChain: 2,
    txType: 0,
    protocolId: null,
    currentTimestamp: nowBN(),
    expectedOutputUsd: null,
    actualOutputUsd: null,
    quoteAgeSecs: null,
    counterpartyRiskScore: null,
    recipientOrContract: "0x000000000000000000000000000000000000dead",
  };

  const instruction = await client.proposeTransactionInstruction(
    { aiAuthority: payer.publicKey, treasury: treasuryPDA },
    args,
  );
  const sig = await sendAndConfirm([instruction]);
  console.log(`  proposeTransaction (post-dWallet) tx: ${sig}`);

  const account = await client.getTreasuryAccount(treasuryPDA);
  assert.ok(account.pending !== null, "should have a pending transaction");
  assert.equal(
    account.pending!.amountUsd.toString(),
    args.amountUsd.toString(),
    "amountUsd should match",
  );
});

// PDA derivation matches on-chain account

test("devnet: derived treasury PDA matches the account that was created", async () => {
  const [derived] = client.deriveTreasuryAddress(payer.publicKey, AGENT_ID);
  assert.equal(
    derived.toBase58(),
    treasuryPDA.toBase58(),
    "client.deriveTreasuryAddress should produce the same PDA as createTreasuryInstruction",
  );

  const info = await connection.getAccountInfo(derived);
  assert.ok(info !== null, "derived PDA should resolve to the on-chain account");
});
