import assert from "node:assert/strict";
import {
  AURA_IDL,
  type AuraCore,
  type AuraCoreProgram,
  DWALLET_DEVNET_PROGRAM_ID,
  nativeSigningMessageDigest,
  type PendingProposalRecord,
  type PendingTransferRecord,
  type ProposeTransactionArgs,
  pda,
  runAuraApproval,
  sendSolanaTransfer,
  solanaCompiledMessageDigest,
} from "@aura-protocol/sdk-ts";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import { connection, getPayer, nowBN } from "../devnet.js";
import { buildCreateTreasuryArgs } from "../fixtures.js";
import { createIkaClient } from "../ika/client.js";
import { getOrCreateDwallet } from "../ika/dwallet.js";
import {
  discoverLiveTokenAsset,
  type LiveTokenAsset,
  pickTransferAmountRaw,
  rawAmountToUi,
  rawTokenAmountToUsdCents,
  readTokenBalance,
  type TokenBalanceSnapshot,
  tokenAta,
} from "./assets.js";
import {
  DEFAULT_RECIPIENT_OWNER,
  DEFAULT_TRANSFER_UI,
  MAX_TRANSFER_UI,
} from "./config.js";
import {
  assertSimulationPasses,
  bootstrapDwalletSourceIfNeeded,
  createLiveTransferInstruction,
  ensureDwalletFeePayerLamports,
  ensureTokenAccount,
  sendLiveIxs,
} from "./transfers.js";

export const CHAIN_SOLANA = 2;
export const TX_TYPE_TRANSFER = 0;
export const TX_TYPE_DEFI_SWAP = 1;

export const VIOLATION_PER_TRANSACTION_LIMIT = 1;
export const VIOLATION_DAILY_LIMIT = 2;
export const VIOLATION_VELOCITY_LIMIT = 5;
export const VIOLATION_PROTOCOL_NOT_ALLOWED = 6;
export const VIOLATION_SLIPPAGE_EXCEEDED = 7;
export const VIOLATION_QUOTE_STALE = 8;
export const VIOLATION_COUNTERPARTY_RISK = 9;
export const VIOLATION_RECIPIENT_DAILY_LIMIT = 13;
export const VIOLATION_RECIPIENT_PER_TX_LIMIT = 14;
export const VIOLATION_EXECUTION_SCOPE_PAUSED = 20;

const CURVE_ED25519 = 2;
const SCHEME_EDDSA_SHA512 = 5;
const STATUS_SIGNED = 9;

export const PROPOSE_ACCOUNTS = {
  sessionKeyAccount: null,
  swarmPool: null,
  addressList: null,
  complianceOracle: null,
  parentTreasury: null,
  budgetEnvelope: null,
  exposureGroup: null,
  chainProfile: null,
  trustIdentity: null,
  policyCanary: null,
} as const;

function toU16LE(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

export function deriveDwalletPda(publicKey: Uint8Array): PublicKey {
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

function asBytes32(bytes: Uint8Array, label: string): number[] {
  assert.equal(bytes.length, 32, `${label} must be 32 bytes`);
  return Array.from(bytes);
}

function settlementHashFromSignature(signature: string): number[] {
  return asBytes32(
    nativeSigningMessageDigest(bs58.decode(signature)),
    "settlement hash",
  );
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

export async function tryTransferDwalletOwnership(
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
    await sendLiveIxs(
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
    console.log("    transfer_ownership skipped or failed; continuing");
    console.log(`    ${message.split("\n")[0]}`);
  }
}

export interface LiveAuraScenario {
  program: Program<AuraCore>;
  asset: LiveTokenAsset;
  agentId: string;
  treasury: PublicKey;
  dwalletState: PublicKey;
  dwalletPda: PublicKey;
  dwalletSolanaKey: PublicKey;
  sourceAta: PublicKey;
  destinationOwner: PublicKey;
  destinationAta: PublicKey;
  beforeSource: TokenBalanceSnapshot;
  beforeDestination: TokenBalanceSnapshot;
  amountRaw: bigint;
  amountUsd: BN;
  allowedPerTxUsd: BN;
}

export interface LivePolicyOverrides {
  perTxLimitUsd?: BN;
  dailyLimitUsd?: BN;
  daytimeHourlyLimitUsd?: BN;
  nighttimeHourlyLimitUsd?: BN;
  velocityLimitUsd?: BN;
  recipientDailyLimitUsd?: BN;
  recipientPerTxLimitUsd?: BN | null;
}

export interface LivePolicyBasis {
  amountUsd: BN;
  allowedPerTxUsd: BN;
  defaultLargeLimitUsd: BN;
}

export type LivePolicyOverridesInput =
  | LivePolicyOverrides
  | ((basis: LivePolicyBasis) => LivePolicyOverrides);

export interface LiveDwalletTransferResult {
  signature: string;
  beforeSource: TokenBalanceSnapshot;
  afterSource: TokenBalanceSnapshot;
  beforeDestination: TokenBalanceSnapshot;
  afterDestination: TokenBalanceSnapshot;
  amountRaw: bigint;
  amountUsd: BN;
}

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

export function cloneProposalArgs(
  args: ProposeTransactionArgs,
): ProposeTransactionArgs {
  return {
    ...args,
    amountUsd: args.amountUsd.clone(),
    currentTimestamp: args.currentTimestamp.clone(),
    expectedOutputUsd: args.expectedOutputUsd?.clone() ?? null,
    actualOutputUsd: args.actualOutputUsd?.clone() ?? null,
    quoteAgeSecs: args.quoteAgeSecs?.clone() ?? null,
    nativeAmount: args.nativeAmount?.clone() ?? null,
    gasNativeAmount: args.gasNativeAmount?.clone() ?? null,
    evmChainId: args.evmChainId?.clone() ?? null,
    replayNonce: args.replayNonce?.clone() ?? null,
    gasLimit: args.gasLimit?.clone() ?? null,
    maxFeeNative: args.maxFeeNative?.clone() ?? null,
  };
}

export function baseTransferProposalArgs(
  scenario: LiveAuraScenario,
): ProposeTransactionArgs {
  return {
    amountUsd: scenario.amountUsd,
    targetChain: CHAIN_SOLANA,
    txType: TX_TYPE_TRANSFER,
    protocolId: null,
    currentTimestamp: nowBN(),
    expectedOutputUsd: scenario.amountUsd,
    actualOutputUsd: scenario.amountUsd,
    quoteAgeSecs: new BN(30),
    counterpartyRiskScore: 10,
    recipientOrContract: scenario.destinationOwner.toBase58(),
    sanctionsProof: [],
    assetId: null,
    nativeAmount: null,
    decimals: null,
    gasNativeAmount: null,
    gasAssetId: null,
    evmChainId: null,
    replayNonce: null,
    gasLimit: null,
    maxFeeNative: null,
    nativeMessageHash: null,
    calldataHash: null,
    utxoSetHash: null,
    sighashType: null,
    solanaRecentBlockhash: null,
    solanaMessageHash: null,
    confirmationsRequired: null,
  };
}

export async function prepareLiveAuraScenario(params?: {
  prefix?: string;
  destinationOwner?: PublicKey;
  policyOverrides?: LivePolicyOverridesInput;
  recipientPerTxUsd?: BN;
}): Promise<LiveAuraScenario> {
  const payer = getPayer();
  const program = new Program<AuraCore>(
    AURA_IDL,
    new AnchorProvider(connection(), new Wallet(payer), {
      commitment: "confirmed",
    }),
  );
  const asset = await discoverLiveTokenAsset(payer.publicKey);
  const dwallet = await getOrCreateDwallet(payer);
  const dwalletPda = deriveDwalletPda(dwallet.publicKey);
  const dwalletSolanaKey = dwallet.address;
  const destinationOwner = params?.destinationOwner ?? DEFAULT_RECIPIENT_OWNER;
  const sourceAta = tokenAta(
    asset.mint,
    dwalletSolanaKey,
    asset.tokenProgramId,
  );
  const destinationAta = tokenAta(
    asset.mint,
    destinationOwner,
    asset.tokenProgramId,
  );

  await ensureTokenAccount({
    owner: dwalletSolanaKey,
    ata: sourceAta,
    mint: asset.mint,
    tokenProgramId: asset.tokenProgramId,
    label: "dWallet source",
  });
  await ensureTokenAccount({
    owner: destinationOwner,
    ata: destinationAta,
    mint: asset.mint,
    tokenProgramId: asset.tokenProgramId,
    label: "recipient",
  });
  await ensureDwalletFeePayerLamports(dwalletSolanaKey);

  const { source: beforeSource } = await bootstrapDwalletSourceIfNeeded({
    asset,
    sourceAta,
    sourceOwner: dwalletSolanaKey,
  });
  const beforeDestination = await readTokenBalance(
    destinationAta,
    asset.tokenProgramId,
  );
  const amountRaw = pickTransferAmountRaw(
    beforeSource.amount,
    asset.decimals,
    DEFAULT_TRANSFER_UI,
    MAX_TRANSFER_UI,
  );
  const amountUsd = rawTokenAmountToUsdCents(amountRaw, asset.decimals);
  const sourceBalanceUsd = rawTokenAmountToUsdCents(
    beforeSource.amount,
    asset.decimals,
  );
  const allowedPerTxUsd = amountUsd.add(new BN(100));
  const defaultLargeLimitUsd = amountUsd.mul(new BN(100));
  const policyOverrides =
    typeof params?.policyOverrides === "function"
      ? params.policyOverrides({
          amountUsd,
          allowedPerTxUsd,
          defaultLargeLimitUsd,
        })
      : params?.policyOverrides;
  const recipientPerTxLimitUsd =
    policyOverrides?.recipientPerTxLimitUsd !== undefined
      ? policyOverrides.recipientPerTxLimitUsd
      : (params?.recipientPerTxUsd ?? amountUsd.sub(new BN(1)));

  const agentId = `${params?.prefix ?? "live-scenario"}-${Date.now().toString(36)}`;
  const [treasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), payer.publicKey.toBytes(), Buffer.from(agentId)],
    program.programId,
  );
  const [dwalletState] = pda.deriveDwalletStateAddress(
    treasury,
    CHAIN_SOLANA,
    program.programId,
  );

  const createArgs = buildCreateTreasuryArgs(payer.publicKey, agentId, nowBN());
  createArgs.policyConfig.perTxLimitUsd =
    policyOverrides?.perTxLimitUsd ?? allowedPerTxUsd;
  createArgs.policyConfig.dailyLimitUsd =
    policyOverrides?.dailyLimitUsd ?? defaultLargeLimitUsd;
  createArgs.policyConfig.daytimeHourlyLimitUsd =
    policyOverrides?.daytimeHourlyLimitUsd ?? defaultLargeLimitUsd;
  createArgs.policyConfig.nighttimeHourlyLimitUsd =
    policyOverrides?.nighttimeHourlyLimitUsd ?? defaultLargeLimitUsd;
  createArgs.policyConfig.velocityLimitUsd =
    policyOverrides?.velocityLimitUsd ?? defaultLargeLimitUsd;
  createArgs.policyConfig.maxQuoteAgeSecs = new BN(300);
  createArgs.policyConfig.maxCounterpartyRiskScore = 70;
  createArgs.policyConfig.recipientLimits = [
    {
      chain: CHAIN_SOLANA,
      address: destinationOwner.toBase58(),
      dailyLimitUsd:
        policyOverrides?.recipientDailyLimitUsd ?? defaultLargeLimitUsd,
      perTxLimitUsd: recipientPerTxLimitUsd,
    },
  ];

  console.log("\n=== live Aura scenario setup ===");
  console.log(`payer           : ${payer.publicKey.toBase58()}`);
  console.log(`dWallet owner   : ${dwalletSolanaKey.toBase58()}`);
  console.log(`dWallet PDA     : ${dwalletPda.toBase58()}`);
  console.log(`mint            : ${asset.mint.toBase58()}`);
  console.log(`token program   : ${asset.tokenProgramId.toBase58()}`);
  console.log(`source ATA      : ${sourceAta.toBase58()}`);
  console.log(`recipient owner : ${destinationOwner.toBase58()}`);
  console.log(`recipient ATA   : ${destinationAta.toBase58()}`);
  console.log(`source before   : ${beforeSource.uiAmountString}`);
  console.log(`recipient before: ${beforeDestination.uiAmountString}`);
  console.log(
    `transfer amount : ${rawAmountToUi(amountRaw, asset.decimals)} (${amountRaw} raw)`,
  );
  console.log(`policy amount   : ${amountUsd.toString()} USD cents`);

  await sendLiveIxs(
    [
      await program.methods
        .createTreasury(createArgs)
        .accountsPartial({
          owner: payer.publicKey,
          treasury,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "createTreasury",
  );
  await sendLiveIxs(
    [
      await program.methods
        .transitionAgentState(1, nowBN())
        .accountsPartial({ owner: payer.publicKey, treasury })
        .instruction(),
    ],
    "transitionAgentState(Active)",
  );
  await sendLiveIxs(
    [
      await program.methods
        .registerDwallet({
          chain: CHAIN_SOLANA,
          dwalletId: dwalletPda.toBase58(),
          address: dwalletSolanaKey.toBase58(),
          balanceUsd: sourceBalanceUsd,
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
  await sendLiveIxs(
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
  await sendLiveIxs(
    [
      await program.methods
        .recordDeposit(
          CHAIN_SOLANA,
          asset.assetId,
          asset.symbol,
          asset.decimals,
          new BN(beforeSource.amount.toString()),
          sourceBalanceUsd,
          nowBN(),
        )
        .accountsPartial({ owner: payer.publicKey, treasury, dwalletState })
        .instruction(),
    ],
    "recordDeposit(live-token)",
  );

  return {
    program,
    asset,
    agentId,
    treasury,
    dwalletState,
    dwalletPda,
    dwalletSolanaKey,
    sourceAta,
    destinationOwner,
    destinationAta,
    beforeSource,
    beforeDestination,
    amountRaw,
    amountUsd,
    allowedPerTxUsd,
  };
}

export async function assertDeniedProposal(params: {
  scenario: LiveAuraScenario;
  label: string;
  args: ProposeTransactionArgs;
  expectedViolation: number;
  clearMode?: "cancel" | "execute";
}): Promise<void> {
  const { scenario, label, args, expectedViolation } = params;
  const payer = getPayer();
  const { program, treasury, asset } = scenario;

  await sendLiveIxs(
    [
      await program.methods
        .proposeTransaction(args)
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury,
          dwalletState: null,
          ...PROPOSE_ACCOUNTS,
        })
        .instruction(),
    ],
    `proposeTransaction(${label})`,
  );

  const account = await program.account.treasuryAccount.fetch(treasury);
  const denied = account.pendingQueue[0];
  assert.ok(denied, `${label} proposal should be recorded`);
  assert.equal(denied.decision.approved, false, `${label} must be denied`);
  assert.equal(
    denied.decision.violation,
    expectedViolation,
    `${label} violation code`,
  );

  const sourceAfterDeny = await readTokenBalance(
    scenario.sourceAta,
    asset.tokenProgramId,
  );
  const destinationAfterDeny = await readTokenBalance(
    scenario.destinationAta,
    asset.tokenProgramId,
  );
  assert.equal(
    sourceAfterDeny.amount,
    scenario.beforeSource.amount,
    `${label} must not move source funds`,
  );
  assert.equal(
    destinationAfterDeny.amount,
    scenario.beforeDestination.amount,
    `${label} must not move recipient funds`,
  );

  if ((params.clearMode ?? "execute") === "cancel") {
    await sendLiveIxs(
      [
        await program.methods
          .cancelPending(nowBN())
          .accountsPartial({
            owner: payer.publicKey,
            treasury,
            dwalletState: null,
          })
          .instruction(),
      ],
      `cancelPending(${label} denial)`,
    );
  } else {
    await sendLiveIxs(
      [
        await program.methods
          .executePending(nowBN())
          .accountsPartial({
            operator: payer.publicKey,
            treasury,
            messageApproval: null,
            dwallet: null,
            callerProgram: program.programId,
            cpiAuthority: null,
            dwalletProgram: null,
            dwalletCoordinator: null,
            externalLiveness: null,
            dwalletState: null,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      ],
      `executePending(${label} denial)`,
    );
  }

  const sourceAfterClear = await readTokenBalance(
    scenario.sourceAta,
    asset.tokenProgramId,
  );
  const destinationAfterClear = await readTokenBalance(
    scenario.destinationAta,
    asset.tokenProgramId,
  );
  assert.equal(
    sourceAfterClear.amount,
    scenario.beforeSource.amount,
    `${label} cleanup must not move source funds`,
  );
  assert.equal(
    destinationAfterClear.amount,
    scenario.beforeDestination.amount,
    `${label} cleanup must not move recipient funds`,
  );
}

export async function assertProposalSendFails(params: {
  scenario: LiveAuraScenario;
  label: string;
  args: ProposeTransactionArgs;
  expectedMessage?: string | RegExp;
}): Promise<void> {
  const { scenario, label, args, expectedMessage } = params;
  const payer = getPayer();
  const { program, treasury, asset } = scenario;

  await assert.rejects(
    async () => {
      await sendLiveIxs(
        [
          await program.methods
            .proposeTransaction(args)
            .accountsPartial({
              aiAuthority: payer.publicKey,
              treasury,
              dwalletState: null,
              ...PROPOSE_ACCOUNTS,
            })
            .instruction(),
        ],
        `proposeTransaction(${label})`,
      );
    },
    (error) => {
      if (!expectedMessage) return true;
      const message = error instanceof Error ? error.message : String(error);
      if (typeof expectedMessage === "string") {
        assert.match(message, new RegExp(expectedMessage));
      } else {
        assert.match(message, expectedMessage);
      }
      return true;
    },
    `${label} proposal should fail before landing`,
  );

  const account = await program.account.treasuryAccount.fetch(treasury);
  assert.equal(
    account.pendingQueue.length,
    0,
    `${label} must not leave a pending proposal`,
  );

  const sourceAfterReject = await readTokenBalance(
    scenario.sourceAta,
    asset.tokenProgramId,
  );
  const destinationAfterReject = await readTokenBalance(
    scenario.destinationAta,
    asset.tokenProgramId,
  );
  assert.equal(
    sourceAfterReject.amount,
    scenario.beforeSource.amount,
    `${label} must not move source funds`,
  );
  assert.equal(
    destinationAfterReject.amount,
    scenario.beforeDestination.amount,
    `${label} must not move recipient funds`,
  );
}

export async function executeApprovedLiveDwalletTransfer(
  scenario: LiveAuraScenario,
  label = "live scenario dWallet transfer",
): Promise<LiveDwalletTransferResult> {
  const payer = getPayer();
  const conn = connection();
  const {
    program,
    asset,
    agentId,
    treasury,
    dwalletState,
    dwalletPda,
    dwalletSolanaKey,
    sourceAta,
    destinationAta,
    destinationOwner,
    amountRaw,
    amountUsd,
  } = scenario;

  await tryTransferDwalletOwnership(dwalletPda, program.programId);

  const beforeSource = await readTokenBalance(sourceAta, asset.tokenProgramId);
  const beforeDestination = await readTokenBalance(
    destinationAta,
    asset.tokenProgramId,
  );

  const latest = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = dwalletSolanaKey;
  tx.add(
    await createLiveTransferInstruction({
      asset,
      source: sourceAta,
      destination: destinationAta,
      owner: dwalletSolanaKey,
      amountRaw,
    }),
  );

  const compiledMessage = tx.compileMessage().serialize();
  const solanaMessageHash = solanaCompiledMessageDigest(compiledMessage);
  const solanaRecentBlockhash = new Uint8Array(bs58.decode(latest.blockhash));

  await sendLiveIxs(
    [
      await program.methods
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
          assetId: asset.assetId,
          nativeAmount: new BN(amountRaw.toString()),
          decimals: asset.decimals,
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
          dwalletState,
          ...PROPOSE_ACCOUNTS,
        })
        .instruction(),
    ],
    `proposeTransaction(${label})`,
  );

  const treasuryData = await program.account.treasuryAccount.fetch(treasury);
  const pending = treasuryData.pendingQueue[0];
  assert.ok(pending, `${label} pending proposal should exist`);
  assert.equal(pending.decision.approved, true, `${label} must be approved`);

  const dwallet = await getOrCreateDwallet(payer);
  const ika = createIkaClient(undefined, payer.secretKey);
  try {
    const phase1 = await runAuraApproval({
      connection: conn,
      program: approvalProgram(program),
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

    const simulationTx = Transaction.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    );
    simulationTx.addSignature(dwalletSolanaKey, Buffer.from(phase1.signature));
    await assertSimulationPasses(simulationTx, `send ${label}`);

    const signature = await sendSolanaTransfer({
      connection: conn,
      dwalletSolanaKey,
      transaction: tx,
      signature: phase1.signature,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      expectedSolanaRecentBlockhash: solanaRecentBlockhash,
      expectedSolanaMessageHash: solanaMessageHash,
    });
    console.log(
      `  ↳ send ${label}\n      ├─ sig: ${signature}\n      └─ url: https://explorer.solana.com/tx/${signature}?cluster=devnet\n`,
    );

    const afterFinalize = await program.account.treasuryAccount.fetch(treasury);
    const signedPending = afterFinalize.pendingQueue[0];
    assert.ok(signedPending, `${label} signed proposal should remain`);
    assert.equal(signedPending.status, STATUS_SIGNED, `${label} signed status`);

    const targetTxHash = settlementHashFromSignature(signature);
    await sendLiveIxs(
      [
        await program.methods
          .markSettlementBroadcast({
            proposalId: pending.proposalId,
            targetTxHash,
            now: nowBN(),
          })
          .accountsPartial({ operator: payer.publicKey, treasury })
          .instruction(),
      ],
      `markSettlementBroadcast(${label})`,
    );
    await sendLiveIxs(
      [
        await program.methods
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
      `confirmSettlement(${label})`,
    );

    const afterSource = await readTokenBalance(sourceAta, asset.tokenProgramId);
    const afterDestination = await readTokenBalance(
      destinationAta,
      asset.tokenProgramId,
    );
    assert.equal(
      beforeSource.amount - afterSource.amount,
      amountRaw,
      `${label} source must decrease by exact transfer amount`,
    );
    assert.equal(
      afterDestination.amount - beforeDestination.amount,
      amountRaw,
      `${label} destination must increase by exact transfer amount`,
    );

    return {
      signature,
      beforeSource,
      afterSource,
      beforeDestination,
      afterDestination,
      amountRaw,
      amountUsd,
    };
  } finally {
    ika.close();
  }
}
