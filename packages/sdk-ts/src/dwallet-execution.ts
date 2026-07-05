/**
 * High-level dWallet execution helpers for AURA.
 *
 * Covers the dWallet signing lifecycle:
 *
 * Approval/signature:
 *   propose_transaction -> execute_pending -> requestPresign -> requestSign(messageBytes)
 *   -> wait MessageApproval Signed -> finalize_execution
 *
 * For chain-bound proposals, `messageBytes` must be the exact native payload
 * bytes that Ika signs and the proposal must include the matching
 * `native_message_hash` binding. Solana proposals also bind the recent
 * blockhash so the SDK can validate the transaction before broadcast.
 *
 * Supported helpers:
 *   Solana  - bound transaction submit (sendSolanaTransfer)
 *   EVM     - low-level exact signing payload helper (signEvmPayload)
 *   Bitcoin - low-level exact signing payload helper (signBitcoinPayload)
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  ComputeBudgetProgram,
  type Connection,
  type Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import {
  DWALLET_CPI_AUTHORITY_SEED,
  DWALLET_DEVNET_PROGRAM_ID,
  DWALLET_SEED,
  MESSAGE_APPROVAL_SEED,
  TREASURY_SEED,
} from "./constants.js";

/** Minimal interface for the Ika dWallet gRPC client used by this module. */
export interface IkaDWalletClientLike {
  requestPresign(
    senderPubkey: Uint8Array,
    sessionIdentifier: Uint8Array,
  ): Promise<Uint8Array>;
  requestSign(
    senderPubkey: Uint8Array,
    sessionIdentifier: Uint8Array,
    message: Uint8Array,
    presignId: Uint8Array,
    txSignature: Uint8Array,
    dkgAttestation: DKGAttestationLike,
  ): Promise<Uint8Array>;
}

/** Minimal DKG attestation shape (matches IkaDWalletClient.DKGAttestation). */
export interface DKGAttestationLike {
  attestationData: Uint8Array;
  networkSignature: Uint8Array;
  networkPubkey: Uint8Array;
  epoch: bigint;
}

/**
 * The dWallet registration record as stored on the treasury.
 * Matches the fields returned by `program.account.treasuryAccount.fetch`.
 */
export interface DWalletRecord {
  /** bs58 address — the dWallet's Ed25519 public key as a Solana pubkey. */
  address: string;
  /** hex-encoded raw 32-byte Ed25519 public key. */
  publicKeyHex: string;
  /** On-chain dWallet PDA address (bs58). */
  dwalletId: string;
  /** Solana pubkey of the `authorized_user` registered on the dWallet. */
  authorizedUserPubkey: PublicKey | null;
  /** Optional hex message metadata digest (32 bytes). null or all-zeros means omit. */
  messageMetadataDigest: string | null;
  /** Curve code: 2 = Ed25519 (DWalletCurve::Ed25519). */
  curve: number;
  /** Signature scheme code: 5 = EdDSA SHA-512. */
  signatureScheme: number;
}

/** A pending proposal record as returned from fetching the treasury. */
export interface PendingProposalRecord {
  proposalId: { toString(): string };
  proposalDigest: string;
  policyOutputDigest: string;
  targetChain: number;
  txType: number;
  amountUsd: { toString(): string };
  transfer?: PendingTransferRecord | null;
  recipientOrContract: string;
  decision: { approved: boolean; violation: number };
  status?: number;
}

export interface PendingTransferRecord {
  assetId?: string | null;
  nativeAmount?: IntegerLike | null;
  decimals?: number | null;
  gasNativeAmount?: IntegerLike | null;
  gasAssetId?: string | null;
  executionBinding?: PendingExecutionBindingRecord | null;
}

export interface PendingExecutionBindingRecord {
  evmChainId?: IntegerLike | null;
  replayNonce?: IntegerLike | null;
  gasLimit?: IntegerLike | null;
  maxFeeNative?: IntegerLike | null;
  nativeMessageHash?: BytesLike | null;
  calldataHash?: BytesLike | null;
  utxoSetHash?: BytesLike | null;
  sighashType?: number | null;
  solanaRecentBlockhash?: BytesLike | null;
  solanaMessageHash?: BytesLike | null;
  confirmationsRequired?: number | null;
}

type IntegerLike = bigint | number | string | { toString(): string };
type BytesLike = Uint8Array | number[];

/** Result of runAuraApproval (phase 1). */
export interface AuraApprovalResult {
  /** The execute_pending tx signature, used as approval_proof in phase 2. */
  approvalProof: Uint8Array;
  /** The MessageApproval PDA that recorded the dWallet signature. */
  messageApprovalPda: PublicKey;
  /** The canonical AURA chain/audit message string. */
  chainMessage: string;
  /** Raw dWallet signature over the approved bytes. */
  signature: Uint8Array;
}

// Chain / tx-type label tables must match Display impls in aura-policy/src/types.rs.
const CHAIN_LABELS: Record<number, string> = {
  0: "bitcoin",
  1: "ethereum",
  2: "solana",
  3: "polygon",
  4: "arbitrum",
  5: "optimism",
};

const TX_TYPE_LABELS: Record<number, string> = {
  0: "transfer",
  1: "defi_swap",
  2: "lending_deposit",
  3: "nft_purchase",
  4: "contract_interaction",
};

// Internal helpers

function toU16LE(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function keccakDigest(message: string): Uint8Array {
  return keccak_256(Buffer.from(message, "utf8"));
}

/** Digest used by Ika MessageApproval PDA derivation for exact signing bytes. */
export function nativeSigningMessageDigest(
  messageBytes: Uint8Array,
): Uint8Array {
  return keccak_256(messageBytes);
}

/** Digest helper for Solana compiled transaction messages. */
export const solanaCompiledMessageDigest = nativeSigningMessageDigest;

/**
 * Derives the canonical MessageApproval PDA.
 * Seeds: [DWALLET_SEED, u16LE(curve)+pubkeyBytes split into 32-byte chunks,
 *         MESSAGE_APPROVAL_SEED, u16LE(scheme), messageDigest, (metadataDigest?)]
 */
function findMessageApprovalPda(
  publicKeyHex: string,
  curveCode: number,
  schemeCode: number,
  messageDigest: Uint8Array,
  messageMetadataDigest: Uint8Array | null,
  dwalletProgramId: PublicKey,
): [PublicKey, number] {
  const pkBytes = Buffer.from(publicKeyHex, "hex");
  const payload = Buffer.concat([toU16LE(curveCode), pkBytes]);
  const chunks: Buffer[] = [];
  for (let i = 0; i < payload.length; i += 32) {
    chunks.push(payload.subarray(i, Math.min(i + 32, payload.length)));
  }
  const includeMetadata = messageMetadataDigest?.some((b) => b !== 0) ?? false;
  const seeds: Buffer[] = [
    DWALLET_SEED,
    ...chunks,
    MESSAGE_APPROVAL_SEED,
    toU16LE(schemeCode),
    Buffer.from(messageDigest),
    ...(includeMetadata && messageMetadataDigest != null
      ? [Buffer.from(messageMetadataDigest)]
      : []),
  ];
  return PublicKey.findProgramAddressSync(seeds, dwalletProgramId);
}

/**
 * Builds the canonical chain message string.
 * Must produce EXACTLY the same output as build_chain_message() in
 * programs/aura-core/src/execution/message.rs.
 *
 * Legacy format (no asset payload):
 *   {id}:{proposalDigest}:{chain}:{txType}:{dwalletAddress}:{recipient}:{amountUsd}:{policyOutputDigest}
 *
 * Asset-aware proposals append transfer fields after the base.
 */
export function buildChainMessage(params: {
  proposalId: bigint;
  proposalDigest: string;
  policyOutputDigest: string;
  chain: string;
  txType: string;
  dwalletAddress: string;
  recipient: string;
  amountUsd: bigint;
  // optional asset payload (only when propose_transaction included these)
  assetId?: string | null;
  nativeAmount?: bigint | null;
  decimals?: number | null;
  gasAssetId?: string | null;
  gasNativeAmount?: bigint | null;
  // optional chain execution binding (EVM / BTC / Solana binding fields)
  evmChainId?: bigint | null;
  replayNonce?: bigint | null;
  gasLimit?: bigint | null;
  maxFeeNative?: bigint | null;
  nativeMessageHash?: string | null;
  calldataHash?: string | null;
  utxoSetHash?: string | null;
  sighashType?: number | null;
  solanaRecentBlockhash?: string | null;
  solanaMessageHash?: string | null;
  confirmationsRequired?: number | null;
}): string {
  const base =
    `${params.proposalId}:${params.proposalDigest}:${params.chain}:${params.txType}` +
    `:${params.dwalletAddress}:${params.recipient}:${params.amountUsd}:${params.policyOutputDigest}`;

  // Matches append_transfer_details / write_transfer_details in message.rs
  const hasAsset = !!params.assetId;
  const hasBinding =
    params.evmChainId != null ||
    params.replayNonce != null ||
    params.gasLimit != null ||
    params.maxFeeNative != null ||
    params.nativeMessageHash != null ||
    params.calldataHash != null ||
    params.utxoSetHash != null ||
    params.sighashType != null ||
    params.solanaRecentBlockhash != null ||
    params.solanaMessageHash != null ||
    params.confirmationsRequired != null;

  if (!hasAsset && !hasBinding) return base;

  let msg = base;
  if (hasAsset) {
    msg += `:asset=${params.assetId ?? ""}`;
    msg += `:native=${hexLeU128(params.nativeAmount ?? 0n)}`;
    msg += `:decimals=${hexLeU8(params.decimals ?? 0)}`;
    msg += `:gas_asset=${params.gasAssetId ?? ""}`;
    msg += `:gas_native=${hexLeU128(params.gasNativeAmount ?? 0n)}`;
  }
  if (hasBinding) {
    msg += `:bind_evm_chain_id=${params.evmChainId != null ? hexLeU64(params.evmChainId) : ""}`;
    msg += `:bind_nonce=${params.replayNonce != null ? hexLeU64(params.replayNonce) : ""}`;
    msg += `:bind_gas_limit=${params.gasLimit != null ? hexLeU64(params.gasLimit) : ""}`;
    msg += `:bind_max_fee=${params.maxFeeNative != null ? hexLeU64(params.maxFeeNative) : ""}`;
    msg += `:bind_native_message=${params.nativeMessageHash ?? ""}`;
    msg += `:bind_calldata=${params.calldataHash ?? ""}`;
    msg += `:bind_utxo=${params.utxoSetHash ?? ""}`;
    msg += `:bind_sighash=${params.sighashType != null ? hexLeU32(params.sighashType) : ""}`;
    msg += `:bind_solana_blockhash=${params.solanaRecentBlockhash ?? ""}`;
    msg += `:bind_solana_message=${params.solanaMessageHash ?? ""}`;
    msg += `:bind_confirmations=${params.confirmationsRequired != null ? hexLeU16(params.confirmationsRequired) : ""}`;
  }
  return msg;
}

function hexLeU8(n: number): string {
  return Buffer.from([n & 0xff]).toString("hex");
}
function hexLeU16(n: number): string {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b.toString("hex");
}
function hexLeU32(n: number): string {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b.toString("hex");
}
function hexLeU64(n: bigint): string {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b.toString("hex");
}
function hexLeU128(n: bigint): string {
  const b = Buffer.alloc(16);
  let v = n;
  for (let i = 0; i < 16; i++) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b.toString("hex");
}

function toBigIntOrNull(value: IntegerLike | null | undefined): bigint | null {
  if (value == null) return null;
  return BigInt(value.toString());
}

function bytesOrNull(value: BytesLike | null | undefined): Uint8Array | null {
  if (value == null) return null;
  return new Uint8Array(value);
}

function bytes32OrNull(
  value: BytesLike | null | undefined,
  label: string,
): Uint8Array | null {
  const bytes = bytesOrNull(value);
  if (bytes === null) return null;
  if (bytes.length !== 32) {
    throw new Error(`${label} must be 32 bytes, got ${bytes.length}`);
  }
  return bytes;
}

function bytesToHexOrNull(
  value: BytesLike | null | undefined,
  label: string,
): string | null {
  const bytes = bytes32OrNull(value, label);
  return bytes ? Buffer.from(bytes).toString("hex") : null;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildPendingTransferMessageParams(
  pending: PendingProposalRecord,
): Pick<
  Parameters<typeof buildChainMessage>[0],
  | "assetId"
  | "nativeAmount"
  | "decimals"
  | "gasAssetId"
  | "gasNativeAmount"
  | "evmChainId"
  | "replayNonce"
  | "gasLimit"
  | "maxFeeNative"
  | "nativeMessageHash"
  | "calldataHash"
  | "utxoSetHash"
  | "sighashType"
  | "solanaRecentBlockhash"
  | "solanaMessageHash"
  | "confirmationsRequired"
> {
  const transfer = pending.transfer;
  const binding = transfer?.executionBinding;
  return {
    assetId: transfer?.assetId ?? null,
    nativeAmount: toBigIntOrNull(transfer?.nativeAmount),
    decimals: transfer?.decimals ?? null,
    gasAssetId: transfer?.gasAssetId ?? null,
    gasNativeAmount: toBigIntOrNull(transfer?.gasNativeAmount),
    evmChainId: toBigIntOrNull(binding?.evmChainId),
    replayNonce: toBigIntOrNull(binding?.replayNonce),
    gasLimit: toBigIntOrNull(binding?.gasLimit),
    maxFeeNative: toBigIntOrNull(binding?.maxFeeNative),
    nativeMessageHash: bytesToHexOrNull(
      binding?.nativeMessageHash,
      "nativeMessageHash",
    ),
    calldataHash: bytesToHexOrNull(binding?.calldataHash, "calldataHash"),
    utxoSetHash: bytesToHexOrNull(binding?.utxoSetHash, "utxoSetHash"),
    sighashType: binding?.sighashType ?? null,
    solanaRecentBlockhash: bytesToHexOrNull(
      binding?.solanaRecentBlockhash,
      "solanaRecentBlockhash",
    ),
    solanaMessageHash: bytesToHexOrNull(
      binding?.solanaMessageHash,
      "solanaMessageHash",
    ),
    confirmationsRequired: binding?.confirmationsRequired ?? null,
  };
}

function pendingNativeMessageHash(
  pending: PendingProposalRecord,
): Uint8Array | null {
  return bytes32OrNull(
    pending.transfer?.executionBinding?.nativeMessageHash,
    "nativeMessageHash",
  );
}

function decodeSolanaBlockhash(blockhash: string): Uint8Array {
  const decoded = new Uint8Array(bs58.decode(blockhash));
  if (decoded.length !== 32) {
    throw new Error(
      `recent blockhash must decode to 32 bytes, got ${decoded.length}`,
    );
  }
  return decoded;
}

// Poll helpers

async function waitForAccount(
  connection: Connection,
  pubkey: PublicKey,
  predicate: (data: Buffer) => boolean,
  timeoutMs = 120_000,
): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await connection.getAccountInfo(pubkey, "confirmed");
    if (info && predicate(info.data as Buffer)) return info.data as Buffer;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error(`Timeout waiting for account ${pubkey.toBase58()}`);
}

/** Polls until MessageApproval byte[0]=14 (PDA exists). */
export async function waitMessageApprovalCreated(
  connection: Connection,
  pda: PublicKey,
  timeoutMs = 120_000,
): Promise<void> {
  await waitForAccount(
    connection,
    pda,
    (d) => d.length >= 2 && d[0] === 14,
    timeoutMs,
  );
}

/** Polls until MessageApproval byte[172]=1 (Signed). */
export async function waitMessageApprovalSigned(
  connection: Connection,
  pda: PublicKey,
  timeoutMs = 180_000,
): Promise<void> {
  await waitForAccount(
    connection,
    pda,
    (d) => d.length >= 173 && d[172] === 1,
    timeoutMs,
  );
}

async function pollTxConfirmed(
  connection: Connection,
  sig: string,
  lastValidBlockHeight: number,
): Promise<void> {
  for (;;) {
    const { value } = await connection.getSignatureStatuses([sig]);
    const s = value[0];
    if (s?.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(s.err)}`);
    if (
      s?.confirmationStatus === "confirmed" ||
      s?.confirmationStatus === "finalized"
    )
      return;
    if ((await connection.getBlockHeight("confirmed")) > lastValidBlockHeight)
      throw new Error(`tx ${sig} expired`);
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

// Phase 1: AURA policy approval

/**
 * Minimal structural interface for the Anchor Program<AuraCore> instance.
 * Typed structurally to avoid a hard dependency on the gitignored generated
 * IDL types while retaining full type safety on the fields this module uses.
 */
export interface AuraCoreProgram {
  programId: PublicKey;
  methods: {
    executePending: (now: BN) => {
      accounts: (accs: Record<string, PublicKey | null>) => {
        instruction: () => Promise<
          import("@solana/web3.js").TransactionInstruction
        >;
      };
    };
    finalizeExecution: (now: BN) => {
      accounts: (accs: Record<string, PublicKey | null>) => {
        instruction: () => Promise<
          import("@solana/web3.js").TransactionInstruction
        >;
      };
    };
  };
}

export interface RunAuraApprovalParams {
  connection: Connection;
  program: AuraCoreProgram;
  ika: IkaDWalletClientLike;
  dkgAttestation: DKGAttestationLike;
  sessionIdentifier: Uint8Array;
  operator: { publicKey: PublicKey; secretKey: Uint8Array };
  treasuryOwner: PublicKey;
  agentId: string;
  dwalletRecord: DWalletRecord;
  pending: PendingProposalRecord;
  /**
   * Exact bytes Ika must sign. Required when the pending proposal includes a
   * chain-native `nativeMessageHash` binding. Defaults to the audit string for
   * legacy proposals only.
   */
  signingMessage?: Uint8Array;
  /** Optional AURA runtime DWalletAccount PDA for reservation/expiry paths. */
  dwalletState?: PublicKey | null;
  /** Optional sidecars passed to finalize_execution. Defaults preserve legacy nulls. */
  finalizeAccounts?: {
    swarmPool?: PublicKey | null;
    budgetEnvelope?: PublicKey | null;
    exposureGroup?: PublicKey | null;
    externalLiveness?: PublicKey | null;
    scheduledIntent?: PublicKey | null;
    feeVault?: PublicKey | null;
    feeSchedule?: PublicKey | null;
    protocolConfig?: PublicKey | null;
  };
  dwalletProgramId?: PublicKey;
}

/**
 * Phase 1: Runs the full AURA approval pipeline for an already-proposed transaction.
 *
 * Expects propose_transaction to have already been called and the proposal to
 * be in an approved state on the treasury. This function:
 *   1. Derives all PDAs
 *   2. Calls execute_pending -> creates MessageApproval PDA
 *   3. requestPresign on Ika
 *   4. requestSign(messageBytes, approvalProof) -> signs the approved bytes
 *   5. Waits for MessageApproval Signed status
 *   6. Calls finalize_execution -> advances AURA policy state
 *
 * For chain-bound proposals, `signingMessage` must be the exact native payload
 * bytes whose Keccak-256 digest was stored in
 * `pending.transfer.executionBinding.nativeMessageHash`.
 */
export async function runAuraApproval(
  params: RunAuraApprovalParams,
): Promise<AuraApprovalResult> {
  const {
    connection,
    program,
    ika,
    dkgAttestation,
    sessionIdentifier,
    operator,
    treasuryOwner,
    agentId,
    dwalletRecord,
    pending,
  } = params;
  const dwalletProgramId = params.dwalletProgramId ?? DWALLET_DEVNET_PROGRAM_ID;

  // Derive PDAs
  const [treasury] = PublicKey.findProgramAddressSync(
    [TREASURY_SEED, treasuryOwner.toBytes(), Buffer.from(agentId)],
    program.programId,
  );
  const [cpiAuthority] = PublicKey.findProgramAddressSync(
    [DWALLET_CPI_AUTHORITY_SEED],
    program.programId,
  );
  const [dwalletCoordinator] = PublicKey.findProgramAddressSync(
    [Buffer.from("dwallet_coordinator")],
    dwalletProgramId,
  );
  const dwalletAccount = new PublicKey(dwalletRecord.dwalletId);
  const metadataBytes = dwalletRecord.messageMetadataDigest
    ? new Uint8Array(Buffer.from(dwalletRecord.messageMetadataDigest, "hex"))
    : null;

  // Build chain message from pending fields (must match build_chain_message() in Rust)
  const chainLabel =
    CHAIN_LABELS[pending.targetChain] ?? `custom_${pending.targetChain}`;
  const txTypeLabel = TX_TYPE_LABELS[pending.txType] ?? String(pending.txType);
  const chainMessage = buildChainMessage({
    proposalId: BigInt(pending.proposalId.toString()),
    proposalDigest: pending.proposalDigest,
    policyOutputDigest: pending.policyOutputDigest,
    chain: chainLabel,
    txType: txTypeLabel,
    dwalletAddress: dwalletRecord.address,
    recipient: pending.recipientOrContract,
    amountUsd: BigInt(pending.amountUsd.toString()),
    ...buildPendingTransferMessageParams(pending),
  });

  const boundNativeDigest = pendingNativeMessageHash(pending);
  const signingMessage = params.signingMessage
    ? new Uint8Array(params.signingMessage)
    : Buffer.from(chainMessage, "utf8");
  if (boundNativeDigest) {
    if (!params.signingMessage) {
      throw new Error(
        "signingMessage is required for chain-bound dWallet approvals",
      );
    }
    const actualDigest = nativeSigningMessageDigest(signingMessage);
    if (!equalBytes(actualDigest, boundNativeDigest)) {
      throw new Error(
        "signingMessage digest does not match pending nativeMessageHash",
      );
    }
  }
  const messageDigest = boundNativeDigest ?? keccakDigest(chainMessage);
  const [messageApprovalPda] = findMessageApprovalPda(
    dwalletRecord.publicKeyHex,
    dwalletRecord.curve,
    dwalletRecord.signatureScheme,
    messageDigest,
    metadataBytes,
    dwalletProgramId,
  );

  const now = Math.floor(Date.now() / 1000);

  // execute_pending writes the MessageApproval PDA on-chain.
  const { blockhash: bh1, lastValidBlockHeight: lvbh1 } =
    await connection.getLatestBlockhash("confirmed");
  const executeTx = new Transaction();
  executeTx.recentBlockhash = bh1;
  executeTx.feePayer = operator.publicKey;
  executeTx.add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    await program.methods
      .executePending(new BN(now))
      .accounts({
        operator: operator.publicKey,
        treasury,
        messageApproval: messageApprovalPda,
        dwallet: dwalletAccount,
        callerProgram: program.programId,
        cpiAuthority,
        dwalletProgram: dwalletProgramId,
        dwalletCoordinator,
        externalLiveness: null,
        dwalletState: params.dwalletState ?? null,
        systemProgram: SystemProgram.programId,
      })
      .instruction(),
  );
  executeTx.sign({
    publicKey: operator.publicKey,
    secretKey: operator.secretKey,
  } as Keypair);
  const executeSig = await connection.sendRawTransaction(
    executeTx.serialize(),
    { preflightCommitment: "confirmed" },
  );
  await pollTxConfirmed(connection, executeSig, lvbh1);
  // Solana tx signatures are base58-encoded 64-byte values
  const approvalProof = Buffer.from(bs58.decode(executeSig));

  // Wait for MessageApproval PDA to appear
  await waitMessageApprovalCreated(connection, messageApprovalPda);

  // requestPresign + requestSign over the exact approved bytes.
  const senderKey = operator.publicKey.toBytes();
  const presignId = await ika.requestPresign(senderKey, sessionIdentifier);
  const signature = await ika.requestSign(
    senderKey,
    sessionIdentifier,
    signingMessage,
    presignId,
    approvalProof,
    dkgAttestation,
  );

  // Wait for Signed status
  await waitMessageApprovalSigned(connection, messageApprovalPda);

  // finalize_execution advances policy state. Chain-bound proposals remain
  // queued as Signed until target-chain settlement is confirmed.
  const { blockhash: bh2, lastValidBlockHeight: lvbh2 } =
    await connection.getLatestBlockhash("confirmed");
  const finalizeAccounts = {
    swarmPool: null,
    budgetEnvelope: null,
    exposureGroup: null,
    externalLiveness: null,
    dwalletState: params.dwalletState ?? null,
    scheduledIntent: null,
    feeVault: null,
    feeSchedule: null,
    protocolConfig: null,
    ...params.finalizeAccounts,
  };
  const finalizeTx = new Transaction();
  finalizeTx.recentBlockhash = bh2;
  finalizeTx.feePayer = operator.publicKey;
  finalizeTx.add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    await program.methods
      .finalizeExecution(new BN(now + 1))
      .accounts({
        operator: operator.publicKey,
        treasury,
        messageApproval: messageApprovalPda,
        ...finalizeAccounts,
      })
      .instruction(),
  );
  finalizeTx.sign({
    publicKey: operator.publicKey,
    secretKey: operator.secretKey,
  } as Keypair);
  const finalizeSig = await connection.sendRawTransaction(
    finalizeTx.serialize(),
    { preflightCommitment: "confirmed" },
  );
  await pollTxConfirmed(connection, finalizeSig, lvbh2);

  return { approvalProof, messageApprovalPda, chainMessage, signature };
}

// Solana: submit a pre-approved transaction

export interface SendSolanaTransferParams {
  connection: Connection;
  /** The dWallet's Ed25519 public key as a Solana PublicKey (fee payer + signer). */
  dwalletSolanaKey: PublicKey;
  /** Prebuilt transaction whose compiled message was bound into the proposal. */
  transaction: Transaction;
  /** Raw dWallet Ed25519 signature returned by runAuraApproval(). */
  signature: Uint8Array;
  /** Last valid block height returned with the transaction blockhash. */
  lastValidBlockHeight: number;
  /** Raw 32-byte recent blockhash stored in the pending proposal binding. */
  expectedSolanaRecentBlockhash: Uint8Array;
  /** Raw 32-byte digest stored in `solanaMessageHash`. */
  expectedSolanaMessageHash: Uint8Array;
}

/**
 * Signs and submits a Solana transaction using the dWallet key.
 *
 * The transaction must already be bound into the AURA proposal via
 * `solanaRecentBlockhash` and `solanaMessageHash`. This function validates
 * that binding before asking Ika to sign and broadcast the transaction.
 */
export async function sendSolanaTransfer(
  params: SendSolanaTransferParams,
): Promise<string> {
  const {
    connection,
    dwalletSolanaKey,
    transaction,
    signature,
    lastValidBlockHeight,
    expectedSolanaRecentBlockhash,
    expectedSolanaMessageHash,
  } = params;

  if (!transaction.feePayer?.equals(dwalletSolanaKey)) {
    throw new Error("transaction fee payer must be the dWallet Solana key");
  }
  if (!transaction.recentBlockhash) {
    throw new Error("transaction must have a recentBlockhash");
  }
  if (
    !equalBytes(
      decodeSolanaBlockhash(transaction.recentBlockhash),
      expectedSolanaRecentBlockhash,
    )
  ) {
    throw new Error(
      "transaction recentBlockhash does not match proposal binding",
    );
  }

  const compiledMessage = transaction.compileMessage().serialize();
  const actualMessageHash = solanaCompiledMessageDigest(compiledMessage);
  if (!equalBytes(actualMessageHash, expectedSolanaMessageHash)) {
    throw new Error(
      "transaction message digest does not match proposal binding",
    );
  }

  if (signature.length !== 64) {
    throw new Error(
      `dWallet returned ${signature.length}-byte signature; expected 64 (ed25519)`,
    );
  }

  transaction.addSignature(dwalletSolanaKey, Buffer.from(signature));
  if (!transaction.verifySignatures()) {
    throw new Error("dWallet signature failed local ed25519 verification");
  }

  const sig = await connection.sendRawTransaction(transaction.serialize(), {
    preflightCommitment: "confirmed",
  });
  await pollTxConfirmed(connection, sig, lastValidBlockHeight);
  return sig;
}

// Phase 2: EVM (Ethereum / Polygon / Arbitrum / Optimism)

export interface SignNativePayloadParams {
  ika: IkaDWalletClientLike;
  dkgAttestation: DKGAttestationLike;
  sessionIdentifier: Uint8Array;
  senderPubkey: Uint8Array;
  approvalProof: Uint8Array;
  /** Exact bytes passed to Ika `requestSign`. */
  signingMessage: Uint8Array;
  /** Proposal-bound `nativeMessageHash` for the same bytes. */
  expectedNativeMessageHash: Uint8Array;
}

export interface SignNativePayloadResult {
  /** Raw dWallet signature bytes for the configured dWallet scheme. */
  signature: Uint8Array;
}

/**
 * Phase 2 (native chains): Gets a dWallet signature over exact native bytes.
 *
 * The proposal must have stored
 * `nativeSigningMessageDigest(signingMessage)` as `nativeMessageHash`.
 * Callers still assemble and broadcast the final target-chain transaction with
 * chain-specific libraries.
 */
export async function signNativePayload(
  params: SignNativePayloadParams,
): Promise<SignNativePayloadResult> {
  const {
    ika,
    dkgAttestation,
    sessionIdentifier,
    senderPubkey,
    approvalProof,
    signingMessage,
    expectedNativeMessageHash,
  } = params;

  if (expectedNativeMessageHash.length !== 32) {
    throw new Error(
      `nativeMessageHash must be 32 bytes, got ${expectedNativeMessageHash.length}`,
    );
  }
  const actualDigest = nativeSigningMessageDigest(signingMessage);
  if (!equalBytes(actualDigest, expectedNativeMessageHash)) {
    throw new Error("signingMessage digest does not match nativeMessageHash");
  }

  const presignId = await ika.requestPresign(senderPubkey, sessionIdentifier);
  const signature = await ika.requestSign(
    senderPubkey,
    sessionIdentifier,
    signingMessage,
    presignId,
    approvalProof,
    dkgAttestation,
  );

  return { signature };
}

export const signEvmPayload = signNativePayload;

// Phase 2: Bitcoin

export const signBitcoinPayload = signNativePayload;
