/**
 * Devnet: end-to-end dWallet outbound transfer via runAuraApproval + sendSolanaTransfer.
 *
 * What this covers:
 *   propose_transaction with exact Solana message binding
 *   -> execute_pending -> Ika presign/sign over those exact message bytes
 *   -> finalize_execution (pending remains Signed)
 *   -> broadcast signed Solana transaction
 *   -> mark_settlement_broadcast -> confirm_settlement
 *
 * Persistence: dWallet DKG result is cached by
 *   packages/tests/sdk-ts/support/ika/dwallet.ts
 * to `packages/tests/sdk-ts/support/ika/.dwallet.json` (gitignored) unless
 * AURA_IKA_DWALLET_FILE overrides it. That keeps the transfer flow pinned to a
 * known-good session instead of the old zero-session cache. Each transfer run
 * creates a fresh treasury because failed live transfers intentionally leave
 * signed, unsettled proposals behind.
 *
 * Prerequisites: funded devnet payer at ~/.config/solana/id.json (or PAYER_KEYPAIR).
 * Run: node_modules/.bin/tsx --test "devnet/dwallet/transfer.devnet.test.ts"
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  AURA_IDL,
  type AuraCore,
  type AuraCoreProgram,
  DWALLET_DEVNET_PROGRAM_ID,
  nativeSigningMessageDigest,
  type PendingProposalRecord,
  type PendingTransferRecord,
  pda,
  runAuraApproval,
  sendSolanaTransfer,
  solanaCompiledMessageDigest,
} from "@aura-protocol/sdk-ts";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  type Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import {
  connection,
  DEVNET_AVAILABLE,
  getPayer,
  logTransaction,
  nowBN,
} from "../../support/devnet.js";
import { buildCreateTreasuryArgs } from "../../support/fixtures.js";
import {
  createIkaClient,
  type DKGAttestation,
} from "../../support/ika/client.js";
import { getOrCreateDwallet } from "../../support/ika/dwallet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";

const CURVE_ED25519 = 2;
const SCHEME_EDDSA_SHA512 = 5;
const CHAIN_SOLANA = 2;
const TX_TYPE_TRANSFER = 0;
const SOL_ASSET_ID = "sol";
const SOL_DECIMALS = 9;
const STATUS_SIGNED = 9;

// Shared state populated in before()
let payer: Keypair;
let program: Program<AuraCore>;
let agentId: string;
let treasury: PublicKey;
let dwalletPda: PublicKey;
let dwalletPublicKey: Uint8Array;
let sessionIdentifier: Uint8Array;
let dkgAttestation: DKGAttestation;
let dwalletSolanaKey: PublicKey;
let dwalletState: PublicKey;

interface PendingRecord {
  proposalId: { toString(): string };
  proposalDigest: string;
  policyOutputDigest: string;
  targetChain: number;
  txType: number;
  amountUsd: { toString(): string };
  transfer: PendingTransferRecord | null;
  recipientOrContract: string;
  decision: { approved: boolean; violation: number };
  status: number;
}

type ExecutePendingAccounts = Parameters<
  ReturnType<Program<AuraCore>["methods"]["executePending"]>["accountsPartial"]
>[0];

type FinalizeExecutionAccounts = Parameters<
  ReturnType<
    Program<AuraCore>["methods"]["finalizeExecution"]
  >["accountsPartial"]
>[0];

// Helpers

function toU16LE(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function deriveDwalletPda(
  publicKey: Uint8Array,
  programId: PublicKey,
): PublicKey {
  const payload = Buffer.concat([
    toU16LE(CURVE_ED25519),
    Buffer.from(publicKey),
  ]);
  const chunks: Buffer[] = [];
  for (let i = 0; i < payload.length; i += 32)
    chunks.push(payload.subarray(i, Math.min(i + 32, payload.length)));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dwallet"), ...chunks],
    programId,
  )[0];
}

async function pollConfirmed(
  sig: string,
  lastValidBlockHeight: number,
): Promise<void> {
  const conn = connection();
  for (;;) {
    const { value } = await conn.getSignatureStatuses([sig]);
    const s = value[0];
    if (s?.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(s.err)}`);
    if (
      s?.confirmationStatus === "confirmed" ||
      s?.confirmationStatus === "finalized"
    )
      return;
    if ((await conn.getBlockHeight("confirmed")) > lastValidBlockHeight)
      throw new Error(`tx ${sig} expired`);
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

async function sendIxs(
  ixs: TransactionInstruction[],
  label: string,
): Promise<string> {
  const conn = connection();
  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  // All AURA instructions need extra heap: the treasury account is large and
  // the default 32KB heap causes OOM on propose_transaction + execute_pending.
  tx.add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...ixs,
  );
  tx.sign(payer);
  const sig = await conn.sendRawTransaction(tx.serialize(), {
    preflightCommitment: "confirmed",
  });
  await pollConfirmed(sig, lastValidBlockHeight);
  logTransaction(label, sig);
  return sig;
}

function asBytes32(bytes: Uint8Array, label: string): number[] {
  assert.equal(bytes.length, 32, `${label} must be 32 bytes`);
  return Array.from(bytes);
}

function settlementHashFromSignature(signature: string): number[] {
  const raw = bs58.decode(signature);
  return asBytes32(nativeSigningMessageDigest(raw), "settlement hash");
}

async function accountExists(address: PublicKey): Promise<boolean> {
  return (await connection().getAccountInfo(address, "confirmed")) !== null;
}

async function waitForDwalletPda(): Promise<void> {
  const conn = connection();
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const info = await conn.getAccountInfo(dwalletPda, "confirmed");
    if (info && info.data.length > 2 && info.data[0] === 2) return;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error(`timeout waiting for dWallet PDA ${dwalletPda.toBase58()}`);
}

async function tryTransferDwalletOwnership(): Promise<void> {
  const [cpiAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("__ika_cpi_authority")],
    program.programId,
  );
  const transferData = Buffer.alloc(1 + 32);
  transferData[0] = 24;
  cpiAuthority.toBuffer().copy(transferData, 1);

  try {
    await sendIxs(
      [
        new TransactionInstruction({
          programId: DWALLET_DEVNET_PROGRAM_ID,
          keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: false },
            { pubkey: dwalletPda, isSigner: false, isWritable: true },
          ],
          data: transferData,
        }),
      ],
      "transfer_ownership",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("missing required signature")) {
      console.log(
        "    transfer_ownership skipped; payer is not current dWallet authority",
      );
    } else {
      console.log(
        "    transfer_ownership failed; continuing with current dWallet authority",
      );
      console.log(`    ${message.split("\n")[0]}`);
    }
  }
}

async function ensureDwalletState(): Promise<void> {
  const [state] = pda.deriveDwalletStateAddress(
    treasury,
    CHAIN_SOLANA,
    program.programId,
  );
  dwalletState = state;
  if (!(await accountExists(dwalletState))) {
    await sendIxs(
      [
        await program.methods
          .initDwalletState(CHAIN_SOLANA, nowBN())
          .accountsPartial({
            owner: payer.publicKey,
            treasury,
            dwalletState,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      ],
      "initDwalletState",
    );
  }
}

async function createTransferTreasury(): Promise<void> {
  agentId = `transfer-test-${Date.now().toString(36)}`;
  const [tPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), payer.publicKey.toBytes(), Buffer.from(agentId)],
    program.programId,
  );
  treasury = tPda;

  await sendIxs(
    [
      await program.methods
        .createTreasury(
          buildCreateTreasuryArgs(payer.publicKey, agentId, nowBN()),
        )
        .accountsPartial({
          owner: payer.publicKey,
          treasury,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "createTreasury",
  );

  await sendIxs(
    [
      await program.methods
        .transitionAgentState(1, nowBN())
        .accountsPartial({ owner: payer.publicKey, treasury })
        .instruction(),
    ],
    "transitionAgentState(Active)",
  );

  const dwalletAddress = bs58.encode(dwalletPublicKey);
  const publicKeyHex = Buffer.from(dwalletPublicKey).toString("hex");
  await sendIxs(
    [
      await program.methods
        .registerDwallet({
          chain: CHAIN_SOLANA,
          dwalletId: dwalletPda.toBase58(),
          address: dwalletAddress,
          balanceUsd: new BN(0),
          dwalletAccount: dwalletPda,
          authorizedUserPubkey: payer.publicKey,
          messageMetadataDigest: null,
          publicKeyHex,
          timestamp: nowBN(),
        })
        .accountsPartial({ owner: payer.publicKey, treasury })
        .instruction(),
    ],
    "registerDwallet",
  );

  console.log(`    treasury created: ${treasury.toBase58()}`);
}

async function recordSolDeposit(
  nativeAmount: number,
  usdValue: number,
): Promise<void> {
  await sendIxs(
    [
      await program.methods
        .recordDeposit(
          CHAIN_SOLANA,
          SOL_ASSET_ID,
          "SOL",
          SOL_DECIMALS,
          new BN(nativeAmount),
          new BN(usdValue),
          nowBN(),
        )
        .accountsPartial({ owner: payer.publicKey, treasury, dwalletState })
        .instruction(),
    ],
    "recordDeposit(sol)",
  );
}

async function solLedgerNativeAmount(): Promise<bigint> {
  const state = await program.account.dWalletAccount.fetch(dwalletState);
  const sol = state.assets.find((asset) => asset.assetId === SOL_ASSET_ID);
  return sol ? BigInt(sol.nativeAmount.toString()) : 0n;
}

before(async () => {
  if (!DEVNET_AVAILABLE) return;

  payer = getPayer();
  const conn = connection();

  program = new Program<AuraCore>(
    AURA_IDL,
    new AnchorProvider(conn, new Wallet(payer), { commitment: "confirmed" }),
  );

  const dwallet = await getOrCreateDwallet(payer);
  dwalletPublicKey = dwallet.publicKey;
  sessionIdentifier = dwallet.sessionIdentifier;
  dkgAttestation = dwallet.dkgAttestation;
  dwalletSolanaKey = dwallet.address;
  dwalletPda = deriveDwalletPda(dwalletPublicKey, DWALLET_DEVNET_PROGRAM_ID);

  await waitForDwalletPda();
  await tryTransferDwalletOwnership();

  console.log(`    dWallet PDA    : ${dwalletPda.toBase58()}`);
  console.log(`    Solana address : ${dwalletSolanaKey.toBase58()}`);

  // --- Treasury: create fresh for every live transfer attempt ---
  await createTransferTreasury();

  await ensureDwalletState();
  console.log(`    agent id       : ${agentId}\n`);
});

function dwalletRecord() {
  return {
    address: bs58.encode(dwalletPublicKey),
    publicKeyHex: Buffer.from(dwalletPublicKey).toString("hex"),
    dwalletId: dwalletPda.toBase58(),
    authorizedUserPubkey: payer.publicKey,
    messageMetadataDigest: null,
    curve: CURVE_ED25519,
    signatureScheme: SCHEME_EDDSA_SHA512,
  };
}

function pendingForApproval(pending: PendingRecord): PendingProposalRecord {
  return {
    proposalId: pending.proposalId,
    proposalDigest: pending.proposalDigest,
    policyOutputDigest: pending.policyOutputDigest,
    targetChain: pending.targetChain,
    txType: pending.txType,
    amountUsd: pending.amountUsd,
    transfer: pending.transfer,
    recipientOrContract: pending.recipientOrContract,
    decision: pending.decision,
    status: pending.status,
  };
}

function approvalProgram(program: Program<AuraCore>): AuraCoreProgram {
  return {
    programId: program.programId,
    methods: {
      executePending: (...args: unknown[]) => ({
        accounts: (accounts: Record<string, unknown>) =>
          program.methods
            .executePending(...(args as [BN]))
            .accountsPartial(accounts as ExecutePendingAccounts),
      }),
      finalizeExecution: (...args: unknown[]) => ({
        accounts: (accounts: Record<string, unknown>) =>
          program.methods
            .finalizeExecution(...(args as [BN]))
            .accountsPartial(accounts as FinalizeExecutionAccounts),
      }),
    },
  };
}

type ProposalBinding = {
  nativeAmount?: number;
  gasNativeAmount?: number;
  nativeMessageHash?: number[];
  solanaRecentBlockhash?: number[];
  solanaMessageHash?: number[];
  confirmationsRequired?: number;
};

async function proposeAndGetPending(
  amountUsd: number,
  binding?: ProposalBinding,
) {
  await sendIxs(
    [
      await program.methods
        .proposeTransaction({
          amountUsd: new BN(amountUsd),
          targetChain: CHAIN_SOLANA,
          txType: TX_TYPE_TRANSFER,
          protocolId: null,
          currentTimestamp: nowBN(),
          expectedOutputUsd: new BN(amountUsd),
          actualOutputUsd: new BN(amountUsd),
          quoteAgeSecs: new BN(30),
          counterpartyRiskScore: 10,
          recipientOrContract: payer.publicKey.toBase58(),
          sanctionsProof: [],
          assetId: binding ? SOL_ASSET_ID : null,
          nativeAmount:
            binding?.nativeAmount != null ? new BN(binding.nativeAmount) : null,
          decimals: binding ? SOL_DECIMALS : null,
          gasNativeAmount:
            binding?.gasNativeAmount != null
              ? new BN(binding.gasNativeAmount)
              : null,
          gasAssetId: binding?.gasNativeAmount != null ? SOL_ASSET_ID : null,
          evmChainId: null,
          replayNonce: null,
          gasLimit: null,
          maxFeeNative: null,
          nativeMessageHash: binding?.nativeMessageHash ?? null,
          calldataHash: null,
          utxoSetHash: null,
          sighashType: null,
          solanaRecentBlockhash: binding?.solanaRecentBlockhash ?? null,
          solanaMessageHash: binding?.solanaMessageHash ?? null,
          confirmationsRequired: binding?.confirmationsRequired ?? null,
        })
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury,
          sessionKeyAccount: null,
          swarmPool: null,
          addressList: null,
          complianceOracle: null,
          parentTreasury: null,
          budgetEnvelope: null,
          exposureGroup: null,
          dwalletState: binding ? dwalletState : null,
          chainProfile: null,
          trustIdentity: null,
          policyCanary: null,
        })
        .instruction(),
    ],
    `proposeTransaction($${amountUsd})`,
  );

  const td = await program.account.treasuryAccount.fetch(treasury);
  const pending = td.pendingQueue[0];
  assert.ok(pending, "pending proposal should exist");
  assert.ok(
    pending.decision.approved,
    `proposal denied: violation=${pending.decision.violation}`,
  );
  return pending;
}

test("full flow: sign, send, and settle real SOL transfer from dWallet", {
  skip,
}, async () => {
  const conn = connection();

  const balance = await conn.getBalance(dwalletSolanaKey, "confirmed");
  console.log(`\n    dWallet address : ${dwalletSolanaKey.toBase58()}`);
  console.log(`    dWallet balance : ${balance} lamports`);

  if (balance < 10_000) {
    console.log("\n    Not enough SOL: fund the address above and re-run.\n");
    // Still pass the test; the setup info is printed so you know where to send
    return;
  }

  const transferLamports = Math.min(5_000, balance - 5_000);
  console.log(`    transferring    : ${transferLamports} lamports -> payer\n`);

  const latest = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = dwalletSolanaKey;
  tx.add(
    SystemProgram.transfer({
      fromPubkey: dwalletSolanaKey,
      toPubkey: payer.publicKey,
      lamports: transferLamports,
    }),
  );
  const compiledMessage = tx.compileMessage().serialize();
  const solanaMessageHash = solanaCompiledMessageDigest(compiledMessage);
  const solanaRecentBlockhash = new Uint8Array(bs58.decode(latest.blockhash));
  const gasLamports = 5_000;

  await recordSolDeposit(transferLamports + gasLamports, 1);
  const ledgerBefore = await solLedgerNativeAmount();
  const pending = await proposeAndGetPending(1, {
    nativeAmount: transferLamports,
    gasNativeAmount: gasLamports,
    nativeMessageHash: asBytes32(solanaMessageHash, "nativeMessageHash"),
    solanaRecentBlockhash: asBytes32(
      solanaRecentBlockhash,
      "solanaRecentBlockhash",
    ),
    solanaMessageHash: asBytes32(solanaMessageHash, "solanaMessageHash"),
    confirmationsRequired: 1,
  });

  const ika = createIkaClient(undefined, payer.secretKey);
  try {
    const phase1 = await runAuraApproval({
      connection: conn,
      program: approvalProgram(program),
      ika,
      dkgAttestation,
      sessionIdentifier,
      operator: payer,
      treasuryOwner: payer.publicKey,
      agentId,
      dwalletRecord: dwalletRecord(),
      pending: pendingForApproval(pending),
      signingMessage: compiledMessage,
      dwalletState,
    });

    const payerBeforeBroadcast = await conn.getBalance(
      payer.publicKey,
      "confirmed",
    );
    const transferSig = await sendSolanaTransfer({
      connection: conn,
      dwalletSolanaKey,
      transaction: tx,
      signature: phase1.signature,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      expectedSolanaRecentBlockhash: solanaRecentBlockhash,
      expectedSolanaMessageHash: solanaMessageHash,
    });

    logTransaction("sendSolanaTransfer (phase 2)", transferSig);
    const payerAfterBroadcast = await conn.getBalance(
      payer.publicKey,
      "confirmed",
    );
    assert.equal(
      payerAfterBroadcast - payerBeforeBroadcast,
      transferLamports,
      "payer should receive exactly the dWallet transfer amount during phase 2",
    );

    const afterFinalize = await program.account.treasuryAccount.fetch(treasury);
    const signedPending = afterFinalize.pendingQueue[0];
    assert.ok(
      signedPending,
      "signed proposal should remain pending until settlement",
    );
    assert.equal(
      signedPending.status,
      STATUS_SIGNED,
      "proposal should be Signed",
    );

    await sendIxs(
      [
        await program.methods
          .markSettlementBroadcast({
            proposalId: pending.proposalId,
            targetTxHash: settlementHashFromSignature(transferSig),
            now: nowBN(),
          })
          .accountsPartial({ operator: payer.publicKey, treasury })
          .instruction(),
      ],
      "markSettlementBroadcast",
    );

    await sendIxs(
      [
        await program.methods
          .confirmSettlement({
            proposalId: pending.proposalId,
            targetTxHash: settlementHashFromSignature(transferSig),
            confirmationsObserved: 1,
            reorged: false,
            now: nowBN(),
          })
          .accountsPartial({
            operator: payer.publicKey,
            treasury,
            swarmPool: null,
            budgetEnvelope: null,
            exposureGroup: null,
            dwalletState,
            scheduledIntent: null,
          })
          .instruction(),
      ],
      "confirmSettlement",
    );

    const finalTreasury = await program.account.treasuryAccount.fetch(treasury);
    assert.equal(
      finalTreasury.pendingQueue.length,
      0,
      "pending queue should be empty",
    );
    const state = await program.account.dWalletAccount.fetch(dwalletState);
    assert.equal(
      state.reservedUsd.toString(),
      "0",
      "reservation should be cleared",
    );
    assert.equal(
      state.spentTodayUsd.toString(),
      "1",
      "spend counter should be bumped",
    );
    const sol = state.assets.find((asset) => asset.assetId === SOL_ASSET_ID);
    assert.ok(sol, "SOL ledger row should exist");
    const ledgerAfter = BigInt(sol.nativeAmount.toString());
    assert.equal(
      ledgerBefore - ledgerAfter,
      BigInt(transferLamports + gasLamports),
      "SOL ledger should debit transfer plus gas reservation",
    );
    assert.ok(
      Number(finalTreasury.totalTransactions) >= 1,
      "total_transactions should increment",
    );
    console.log(
      `\n    full flow done: payer received ${transferLamports} lamports in phase 2\n`,
    );
  } finally {
    ika.close();
  }
});
