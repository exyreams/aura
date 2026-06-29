/**
 * Live devnet: send test-USDC-like SPL tokens out of the cached Ika dWallet.
 *
 * Defaults target the shared devnet test mint and recipient used in the live
 * transfer run. Override with AURA_TEST_USDC_MINT,
 * AURA_TEST_USDC_DESTINATION, and AURA_TEST_USDC_AMOUNT.
 * The dWallet cache comes from `support/ika/dwallet.ts`, which defaults to
 * `support/ika/.dwallet.json` unless AURA_IKA_DWALLET_FILE overrides it.
 *
 * Run:
 *   node_modules/.bin/tsx --test devnet/dwallet/usdc-transfer.devnet.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
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
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  type ParsedAccountData,
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
import { createIkaClient } from "../../support/ika/client.js";
import { getOrCreateDwallet } from "../../support/ika/dwallet.js";
import { IKA_TEST_USDC } from "../../support/ika/test-assets.js";

const CURVE_ED25519 = 2;
const SCHEME_EDDSA_SHA512 = 5;
const CHAIN_SOLANA = 2;
const TX_TYPE_TRANSFER = 0;
const STATUS_SIGNED = 9;
const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";

function toU16LE(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function deriveDwalletPda(publicKey: Uint8Array): PublicKey {
  const payload = Buffer.concat([
    toU16LE(CURVE_ED25519),
    Buffer.from(publicKey),
  ]);
  const chunks: Buffer[] = [];
  for (let i = 0; i < payload.length; i += 32) {
    chunks.push(payload.subarray(i, Math.min(i + 32, payload.length)));
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dwallet"), ...chunks],
    DWALLET_DEVNET_PROGRAM_ID,
  )[0];
}

async function pollConfirmed(
  signature: string,
  lastValidBlockHeight: number,
): Promise<void> {
  const conn = connection();
  for (;;) {
    const { value } = await conn.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) {
      throw new Error(`tx ${signature} failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    if ((await conn.getBlockHeight("confirmed")) > lastValidBlockHeight) {
      throw new Error(`tx ${signature} expired`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function sendIxs(
  ixs: TransactionInstruction[],
  label: string,
): Promise<string> {
  const payer = getPayer();
  const conn = connection();
  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...ixs,
  );
  tx.sign(payer);
  const signature = await conn.sendRawTransaction(tx.serialize(), {
    preflightCommitment: "confirmed",
  });
  await pollConfirmed(signature, lastValidBlockHeight);
  logTransaction(label, signature);
  return signature;
}

async function tryTransferOwnership(
  dwalletPda: PublicKey,
  auraProgramId: PublicKey,
): Promise<void> {
  const payer = getPayer();
  const [cpiAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("__ika_cpi_authority")],
    auraProgramId,
  );
  const data = Buffer.alloc(1 + 32);
  data[0] = 24;
  cpiAuthority.toBuffer().copy(data, 1);

  try {
    await sendIxs(
      [
        new TransactionInstruction({
          programId: DWALLET_DEVNET_PROGRAM_ID,
          keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: false },
            { pubkey: dwalletPda, isSigner: false, isWritable: true },
          ],
          data,
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

function uiAmountToRaw(ui: string, decimals: number): bigint {
  const [whole, fraction = ""] = ui.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

function asBytes32(bytes: Uint8Array, label: string): number[] {
  assert.equal(bytes.length, 32, `${label} must be 32 bytes`);
  return Array.from(bytes);
}

async function readTokenBalance(
  owner: PublicKey,
  tokenAccount: PublicKey,
  amountUi: string,
): Promise<{ amount: bigint; uiAmountString: string }> {
  const info = await connection().getParsedAccountInfo(
    tokenAccount,
    "confirmed",
  );
  if (!info.value) {
    throw new Error(
      [
        `source token account not found: ${tokenAccount.toBase58()}`,
        `fund ${amountUi} tokens to the dWallet owner ${owner.toBase58()} and re-run`,
      ].join("\n"),
    );
  }
  if (typeof info.value.data === "string") {
    throw new Error(
      `source token account is not parsed by RPC: ${tokenAccount.toBase58()}`,
    );
  }
  const data = info.value.data as ParsedAccountData;
  const tokenAmount = data.parsed?.info?.tokenAmount;
  if (!tokenAmount?.amount || tokenAmount.uiAmountString == null) {
    throw new Error(
      `source token account has no parsed tokenAmount: ${tokenAccount.toBase58()}`,
    );
  }
  return {
    amount: BigInt(tokenAmount.amount),
    uiAmountString: tokenAmount.uiAmountString,
  };
}

function settlementHashFromSignature(signature: string): number[] {
  return asBytes32(
    nativeSigningMessageDigest(bs58.decode(signature)),
    "settlement hash",
  );
}

async function main(): Promise<void> {
  const payer = getPayer();
  const conn = connection();
  const mint = new PublicKey(
    process.env.AURA_TEST_USDC_MINT ?? IKA_TEST_USDC.mint,
  );
  const destinationOwner = new PublicKey(
    process.env.AURA_TEST_USDC_DESTINATION ?? IKA_TEST_USDC.defaultDestination,
  );
  const amountUi =
    process.env.AURA_TEST_USDC_AMOUNT ?? IKA_TEST_USDC.defaultAmountUi;

  const dwallet = await getOrCreateDwallet(payer);
  const dwalletPda = deriveDwalletPda(dwallet.publicKey);
  const dwalletSolanaKey = dwallet.address;
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
    ReturnType<
      Program<AuraCore>["methods"]["executePending"]
    >["accountsPartial"]
  >[0];

  type FinalizeExecutionAccounts = Parameters<
    ReturnType<
      Program<AuraCore>["methods"]["finalizeExecution"]
    >["accountsPartial"]
  >[0];

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

  const prog = new Program<AuraCore>(
    AURA_IDL,
    new AnchorProvider(conn, new Wallet(payer), { commitment: "confirmed" }),
  );

  const mintInfo = await conn.getParsedAccountInfo(mint, "confirmed");
  if (!mintInfo.value) throw new Error(`mint not found: ${mint.toBase58()}`);
  const mintData = mintInfo.value.data;
  if (typeof mintData === "string" || !("parsed" in mintData)) {
    throw new Error(`mint ${mint.toBase58()} is not parsed by RPC`);
  }
  const decimals = Number(mintData.parsed.info.decimals);
  const amountRaw = uiAmountToRaw(amountUi, decimals);

  const sourceAta = getAssociatedTokenAddressSync(
    mint,
    dwalletSolanaKey,
    false,
    TOKEN_PROGRAM_ID,
  );
  const destinationAta = getAssociatedTokenAddressSync(
    mint,
    destinationOwner,
    false,
    TOKEN_PROGRAM_ID,
  );

  const beforeSource = await readTokenBalance(
    dwalletSolanaKey,
    sourceAta,
    amountUi,
  );
  if (beforeSource.amount < amountRaw) {
    throw new Error(
      `source has ${beforeSource.uiAmountString}, need ${amountUi}`,
    );
  }

  console.log("\n=== dWallet USDC transfer ===");
  console.log(`payer          : ${payer.publicKey.toBase58()}`);
  console.log(`dWallet address: ${dwalletSolanaKey.toBase58()}`);
  console.log(`dWallet PDA    : ${dwalletPda.toBase58()}`);
  console.log(`mint           : ${mint.toBase58()}`);
  console.log(`source ATA     : ${sourceAta.toBase58()}`);
  console.log(`destination    : ${destinationOwner.toBase58()}`);
  console.log(`destination ATA: ${destinationAta.toBase58()}`);
  console.log(`amount         : ${amountUi} (${amountRaw} raw)`);
  console.log(`source before  : ${beforeSource.uiAmountString}`);

  await tryTransferOwnership(dwalletPda, prog.programId);

  if (!(await conn.getAccountInfo(destinationAta, "confirmed"))) {
    await sendIxs(
      [
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          destinationAta,
          destinationOwner,
          mint,
          TOKEN_PROGRAM_ID,
        ),
      ],
      "create destination ATA",
    );
  }

  const agentId = `usdc-transfer-${Date.now().toString(36)}`;
  const [treasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), payer.publicKey.toBytes(), Buffer.from(agentId)],
    prog.programId,
  );
  const [dwalletState] = pda.deriveDwalletStateAddress(
    treasury,
    CHAIN_SOLANA,
    prog.programId,
  );

  await sendIxs(
    [
      await prog.methods
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
      await prog.methods
        .transitionAgentState(1, nowBN())
        .accountsPartial({ owner: payer.publicKey, treasury })
        .instruction(),
    ],
    "transitionAgentState(Active)",
  );
  await sendIxs(
    [
      await prog.methods
        .registerDwallet({
          chain: CHAIN_SOLANA,
          dwalletId: dwalletPda.toBase58(),
          address: dwalletSolanaKey.toBase58(),
          balanceUsd: new BN(0),
          dwalletAccount: dwalletPda,
          authorizedUserPubkey: payer.publicKey,
          messageMetadataDigest: null,
          publicKeyHex: Buffer.from(dwallet.publicKey).toString("hex"),
          timestamp: nowBN(),
        })
        .accountsPartial({ owner: payer.publicKey, treasury })
        .instruction(),
    ],
    "registerDwallet",
  );
  await sendIxs(
    [
      await prog.methods
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

  const amountUsd = new BN(100);
  await sendIxs(
    [
      await prog.methods
        .recordDeposit(
          CHAIN_SOLANA,
          IKA_TEST_USDC.assetId,
          IKA_TEST_USDC.symbol,
          decimals,
          new BN(amountRaw.toString()),
          amountUsd,
          nowBN(),
        )
        .accountsPartial({ owner: payer.publicKey, treasury, dwalletState })
        .instruction(),
    ],
    "recordDeposit(usdc)",
  );

  const latest = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = dwalletSolanaKey;
  tx.add(
    createTransferCheckedInstruction(
      sourceAta,
      mint,
      destinationAta,
      dwalletSolanaKey,
      amountRaw,
      decimals,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  const compiledMessage = tx.compileMessage().serialize();
  const solanaMessageHash = solanaCompiledMessageDigest(compiledMessage);
  const solanaRecentBlockhash = new Uint8Array(bs58.decode(latest.blockhash));

  await sendIxs(
    [
      await prog.methods
        .proposeTransaction({
          amountUsd,
          targetChain: CHAIN_SOLANA,
          txType: TX_TYPE_TRANSFER,
          protocolId: null,
          currentTimestamp: nowBN(),
          expectedOutputUsd: amountUsd,
          actualOutputUsd: amountUsd,
          quoteAgeSecs: new BN(30),
          counterpartyRiskScore: 10,
          recipientOrContract: destinationOwner.toBase58(),
          sanctionsProof: [],
          assetId: IKA_TEST_USDC.assetId,
          nativeAmount: new BN(amountRaw.toString()),
          decimals,
          gasNativeAmount: null,
          gasAssetId: null,
          evmChainId: null,
          replayNonce: null,
          gasLimit: null,
          maxFeeNative: null,
          nativeMessageHash: asBytes32(solanaMessageHash, "nativeMessageHash"),
          calldataHash: null,
          utxoSetHash: null,
          sighashType: null,
          solanaRecentBlockhash: asBytes32(
            solanaRecentBlockhash,
            "solanaRecentBlockhash",
          ),
          solanaMessageHash: asBytes32(solanaMessageHash, "solanaMessageHash"),
          confirmationsRequired: 1,
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
          dwalletState,
          chainProfile: null,
          trustIdentity: null,
          policyCanary: null,
        })
        .instruction(),
    ],
    "proposeTransaction(usdc)",
  );

  const treasuryData = await prog.account.treasuryAccount.fetch(treasury);
  const pending = treasuryData.pendingQueue[0];
  if (!pending) throw new Error("pending proposal missing after proposal");
  if (!pending.decision.approved) {
    throw new Error(`proposal denied: violation=${pending.decision.violation}`);
  }

  const ika = createIkaClient(undefined, payer.secretKey);
  try {
    const phase1 = await runAuraApproval({
      connection: conn,
      program: approvalProgram(prog),
      ika,
      dkgAttestation: dwallet.dkgAttestation,
      sessionIdentifier: dwallet.sessionIdentifier,
      operator: payer,
      treasuryOwner: payer.publicKey,
      agentId,
      dwalletRecord: {
        address: dwalletSolanaKey.toBase58(),
        publicKeyHex: Buffer.from(dwallet.publicKey).toString("hex"),
        dwalletId: dwalletPda.toBase58(),
        authorizedUserPubkey: payer.publicKey,
        messageMetadataDigest: null,
        curve: CURVE_ED25519,
        signatureScheme: SCHEME_EDDSA_SHA512,
      },
      pending: pendingForApproval(pending),
      signingMessage: compiledMessage,
      dwalletState,
    });

    const transferSig = await sendSolanaTransfer({
      connection: conn,
      dwalletSolanaKey,
      transaction: tx,
      signature: phase1.signature,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      expectedSolanaRecentBlockhash: solanaRecentBlockhash,
      expectedSolanaMessageHash: solanaMessageHash,
    });
    logTransaction("send dWallet USDC transfer", transferSig);

    const afterFinalize = await prog.account.treasuryAccount.fetch(treasury);
    const signedPending = afterFinalize.pendingQueue[0];
    assert.ok(signedPending, "signed proposal should remain until settlement");
    assert.equal(
      signedPending.status,
      STATUS_SIGNED,
      "proposal should be Signed",
    );

    const targetTxHash = settlementHashFromSignature(transferSig);
    await sendIxs(
      [
        await prog.methods
          .markSettlementBroadcast({
            proposalId: pending.proposalId,
            targetTxHash,
            now: nowBN(),
          })
          .accountsPartial({ operator: payer.publicKey, treasury })
          .instruction(),
      ],
      "markSettlementBroadcast",
    );
    await sendIxs(
      [
        await prog.methods
          .confirmSettlement({
            proposalId: pending.proposalId,
            targetTxHash,
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

    const afterSource = await conn.getTokenAccountBalance(
      sourceAta,
      "confirmed",
    );
    const afterDest = await conn.getTokenAccountBalance(
      destinationAta,
      "confirmed",
    );
    console.log("\n=== result ===");
    console.log(`transfer sig   : ${transferSig}`);
    console.log(`source after   : ${afterSource.value.uiAmountString}`);
    console.log(`dest after     : ${afterDest.value.uiAmountString}`);
  } finally {
    ika.close();
  }
}

test("sends test USDC out of the cached dWallet", { skip }, async () => {
  await main();
});
