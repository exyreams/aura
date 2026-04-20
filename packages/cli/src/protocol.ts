import { createHash } from "node:crypto";

import BN from "bn.js";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type AccountInfo,
  type Commitment,
  type Connection,
  type SendOptions,
  type Signer,
} from "@solana/web3.js";

import {
  AURA_PROGRAM_ID,
  deriveDwalletCpiAuthorityAddress,
  deriveEncryptCpiAuthorityAddress,
  deriveEncryptEventAuthorityAddress,
  DWALLET_DEVNET_PROGRAM_ID,
  ENCRYPT_DEVNET_PROGRAM_ID,
  type TreasuryAccountRecord,
} from "./sdk.js";
import { chainNameForDigest, transactionTypeNameForDigest } from "./domain.js";
import sha3 from "js-sha3";

const { keccak_256 } = sha3;
const ENCRYPT_CONFIG_SEED = Buffer.from("encrypt_config");
const ENCRYPT_DEPOSIT_SEED = Buffer.from("encrypt_deposit");
const NETWORK_ENCRYPTION_KEY_SEED = Buffer.from("network_encryption_key");
const ENCRYPT_EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");
const DWALLET_COORDINATOR_SEED = Buffer.from("dwallet_coordinator");
const DWALLET_SEED = Buffer.from("dwallet");
const MESSAGE_APPROVAL_SEED = Buffer.from("message_approval");
const ZERO_DIGEST = Buffer.alloc(32);
const ZERO_PUBKEY = new PublicKey(new Uint8Array(32));

const ENCRYPT_DEPOSIT_DISC = 14;
const MESSAGE_APPROVAL_DISC = 14;
const MESSAGE_APPROVAL_ACCOUNT_LEN_V2 = 304;
const MESSAGE_APPROVAL_STATUS_OFFSET_V2 = 172;
const MESSAGE_APPROVAL_STATUS_OFFSET_V1 = 139;

const DEFAULT_COMPUTE_UNIT_LIMIT = 1_400_000;
const DEFAULT_HEAP_FRAME_BYTES = 256 * 1024;

export const ENCRYPT_NETWORK_KEY = Uint8Array.from({ length: 32 }, () => 0x55);

type PendingProposal = NonNullable<TreasuryAccountRecord["pending"]>;
type DwalletRecord = TreasuryAccountRecord["dwallets"][number];
type BufferAccountInfo = AccountInfo<Buffer<ArrayBufferLike>>;

export interface EncryptAccountsBundle {
  config: PublicKey;
  deposit: PublicKey;
  depositBump: number;
  networkEncryptionKey: PublicKey;
  eventAuthority: PublicKey;
  cpiAuthority: PublicKey;
  encryptProgram: PublicKey;
}

export interface EnsureEncryptDepositResult {
  accounts: EncryptAccountsBundle;
  created: boolean;
  signature?: string;
}

export interface ApprovedExecutionAccounts {
  pending: PendingProposal;
  dwallet: DwalletRecord;
  messageApproval: PublicKey;
  dwalletAccount: PublicKey;
  dwalletCoordinator: PublicKey;
  cpiAuthority: PublicKey;
  dwalletProgram: PublicKey;
}

export type MessageApprovalState = "missing" | "pending" | "signed";

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    return BigInt(value);
  }
  if (BN.isBN(value)) {
    return BigInt(value.toString());
  }
  throw new Error(`Unsupported integer value: ${String(value)}`);
}

function fixedU16LE(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value, 0);
  return out;
}

function decodeOptionalDigest(value: string | null | undefined, label: string): Buffer {
  if (!value) {
    return Buffer.from(ZERO_DIGEST);
  }

  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte hex digest`);
  }

  return Buffer.from(value, "hex");
}

function decodePublicKeyHex(value: string | null | undefined): Buffer {
  if (!value) {
    throw new Error(
      "dWallet publicKeyHex is required for metadata-v2 message approval derivation",
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) {
    throw new Error("dWallet publicKeyHex must contain valid hex bytes");
  }
  return Buffer.from(value, "hex");
}

function getDwalletRuntimePubkey(
  value: PublicKey | null | undefined,
  label: string,
): PublicKey {
  if (!value) {
    throw new Error(`${label} is not configured on this dWallet registration`);
  }
  return value;
}

function findDwalletForPending(
  account: TreasuryAccountRecord,
  pending: PendingProposal,
): DwalletRecord {
  const dwallet = account.dwallets.find((entry) => entry.chain === pending.targetChain);
  if (!dwallet) {
    throw new Error(
      `No dWallet is registered for pending chain ${chainNameForDigest(pending.targetChain)}`,
    );
  }
  return dwallet;
}

function buildPendingMessage(pending: PendingProposal, dwallet: DwalletRecord): string {
  return [
    asBigInt(pending.proposalId).toString(),
    pending.proposalDigest,
    chainNameForDigest(pending.targetChain),
    transactionTypeNameForDigest(pending.txType),
    dwallet.address,
    pending.recipientOrContract,
    asBigInt(pending.amountUsd).toString(),
    pending.policyOutputDigest,
  ].join(":");
}

function keccakDigest(message: string): Buffer {
  return Buffer.from(keccak_256.arrayBuffer(Buffer.from(message, "utf8")));
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function deriveEncryptAccounts(
  payer: PublicKey,
  options: {
    auraProgramId?: PublicKey;
    encryptProgramId?: PublicKey;
  } = {},
): EncryptAccountsBundle {
  const auraProgramId = options.auraProgramId ?? AURA_PROGRAM_ID;
  const encryptProgramId = options.encryptProgramId ?? ENCRYPT_DEVNET_PROGRAM_ID;

  const [config] = PublicKey.findProgramAddressSync([ENCRYPT_CONFIG_SEED], encryptProgramId);
  const [deposit, depositBump] = PublicKey.findProgramAddressSync(
    [ENCRYPT_DEPOSIT_SEED, payer.toBuffer()],
    encryptProgramId,
  );
  const [networkEncryptionKey] = PublicKey.findProgramAddressSync(
    [NETWORK_ENCRYPTION_KEY_SEED, Buffer.from(ENCRYPT_NETWORK_KEY)],
    encryptProgramId,
  );
  const [eventAuthority] = deriveEncryptEventAuthorityAddress(encryptProgramId);
  const [cpiAuthority] = deriveEncryptCpiAuthorityAddress(auraProgramId);

  return {
    config,
    deposit,
    depositBump,
    networkEncryptionKey,
    eventAuthority,
    cpiAuthority,
    encryptProgram: encryptProgramId,
  };
}

export function deriveDwalletCoordinatorAddress(
  dwalletProgramId: PublicKey = DWALLET_DEVNET_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([DWALLET_COORDINATOR_SEED], dwalletProgramId);
}

export function resolveScalarGuardrails(account: TreasuryAccountRecord): {
  dailyLimitCiphertext: PublicKey;
  perTxLimitCiphertext: PublicKey;
  spentTodayCiphertext: PublicKey;
} {
  const guardrails = account.confidentialGuardrails;
  if (
    !guardrails?.dailyLimitCiphertext ||
    !guardrails.perTxLimitCiphertext ||
    !guardrails.spentTodayCiphertext
  ) {
    throw new Error("Scalar confidential guardrails are not configured on this treasury.");
  }
  return {
    dailyLimitCiphertext: guardrails.dailyLimitCiphertext,
    perTxLimitCiphertext: guardrails.perTxLimitCiphertext,
    spentTodayCiphertext: guardrails.spentTodayCiphertext,
  };
}

export function resolveVectorGuardrail(account: TreasuryAccountRecord): PublicKey {
  const ciphertext = account.confidentialGuardrails?.guardrailVectorCiphertext;
  if (!ciphertext) {
    throw new Error("Vector confidential guardrails are not configured on this treasury.");
  }
  return ciphertext;
}

export function resolvePendingProposal(account: TreasuryAccountRecord): PendingProposal {
  if (!account.pending) {
    throw new Error("This treasury has no pending proposal.");
  }
  return account.pending;
}

export function resolvePendingPolicyOutput(account: TreasuryAccountRecord): PublicKey {
  const pending = resolvePendingProposal(account);
  if (!pending.policyOutputCiphertextAccount) {
    throw new Error("The pending proposal does not have a confidential policy output ciphertext.");
  }
  return new PublicKey(pending.policyOutputCiphertextAccount);
}

export function resolvePendingRequestAccount(account: TreasuryAccountRecord): PublicKey {
  const pending = resolvePendingProposal(account);
  const requestAccount = pending.decryptionRequest?.requestAccount;
  if (!requestAccount) {
    throw new Error("The pending proposal does not have an active decryption request.");
  }
  return new PublicKey(requestAccount);
}

export function deriveApprovedExecutionAccounts(
  account: TreasuryAccountRecord,
  options: {
    auraProgramId?: PublicKey;
    dwalletProgramId?: PublicKey;
  } = {},
): ApprovedExecutionAccounts {
  const pending = resolvePendingProposal(account);
  if (!pending.decision.approved) {
    throw new Error("The current pending proposal is denied and does not require dWallet signing.");
  }

  const dwalletProgramId = options.dwalletProgramId ?? DWALLET_DEVNET_PROGRAM_ID;
  const auraProgramId = options.auraProgramId ?? AURA_PROGRAM_ID;
  const dwallet = findDwalletForPending(account, pending);
  const dwalletAccount = getDwalletRuntimePubkey(dwallet.dwalletAccount, "dWallet runtime account");
  const messageApproval =
    pending.signatureRequest?.messageApprovalAccount
      ? new PublicKey(pending.signatureRequest.messageApprovalAccount)
      : deriveMetadataV2MessageApprovalAddress(pending, dwallet, dwalletProgramId)[0];
  const [dwalletCoordinator] = deriveDwalletCoordinatorAddress(dwalletProgramId);
  const [cpiAuthority] = deriveDwalletCpiAuthorityAddress(auraProgramId);

  return {
    pending,
    dwallet,
    messageApproval,
    dwalletAccount,
    dwalletCoordinator,
    cpiAuthority,
    dwalletProgram: dwalletProgramId,
  };
}

export function deriveMetadataV2MessageApprovalAddress(
  pending: PendingProposal,
  dwallet: DwalletRecord,
  dwalletProgramId: PublicKey = DWALLET_DEVNET_PROGRAM_ID,
): [PublicKey, number] {
  const publicKey = decodePublicKeyHex(dwallet.publicKeyHex);
  const payload = Buffer.concat([fixedU16LE(dwallet.curve), publicKey]);
  const schemeSeed = fixedU16LE(dwallet.signatureScheme);
  const messageDigest = keccakDigest(buildPendingMessage(pending, dwallet));
  const metadataDigest = decodeOptionalDigest(
    dwallet.messageMetadataDigest,
    "dWallet messageMetadataDigest",
  );

  const seeds: Uint8Array[] = [DWALLET_SEED];
  for (let offset = 0; offset < payload.length; offset += 32) {
    seeds.push(payload.subarray(offset, offset + 32));
  }
  seeds.push(MESSAGE_APPROVAL_SEED, schemeSeed, messageDigest);
  if (!metadataDigest.equals(ZERO_DIGEST)) {
    seeds.push(metadataDigest);
  }

  return PublicKey.findProgramAddressSync(seeds, dwalletProgramId);
}

export function buildMessageDigestHex(
  pending: PendingProposal,
  dwallet: DwalletRecord,
): string {
  return Buffer.from(keccakDigest(buildPendingMessage(pending, dwallet))).toString("hex");
}

export function buildPolicyPlaintextDigestHex(plaintextBytes: Buffer): string {
  return sha256Hex(plaintextBytes);
}

export function createEphemeralKeypair(): Keypair {
  return Keypair.generate();
}

export function markInstructionSigner(
  instruction: TransactionInstruction,
  pubkey: PublicKey,
): void {
  const entry = instruction.keys.find((key) => key.pubkey.equals(pubkey));
  if (!entry) {
    throw new Error(`Instruction is missing account meta for signer ${pubkey.toBase58()}`);
  }
  entry.isSigner = true;
}

export async function sendInstructionsWithBudget(options: {
  connection: Connection;
  payer: Signer;
  instructions: TransactionInstruction[];
  extraSigners?: Signer[];
  sendOptions?: SendOptions;
  computeUnitLimit?: number;
  heapFrameBytes?: number;
}): Promise<string> {
  const {
    connection,
    payer,
    instructions,
    extraSigners = [],
    sendOptions,
    computeUnitLimit = DEFAULT_COMPUTE_UNIT_LIMIT,
    heapFrameBytes = DEFAULT_HEAP_FRAME_BYTES,
  } = options;

  const commitment = sendOptions?.preflightCommitment ?? ("confirmed" as Commitment);
  const latest = await connection.getLatestBlockhash(commitment);
  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: heapFrameBytes }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
    ...instructions,
  );
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(payer, ...extraSigners);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    preflightCommitment: commitment,
    ...sendOptions,
  });
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    commitment,
  );
  if (confirmation.value.err) {
    throw new Error(`Transaction ${signature} failed confirmation`);
  }
  return signature;
}

export async function ensureEncryptDeposit(options: {
  connection: Connection;
  payer: Signer;
  auraProgramId?: PublicKey;
  encryptProgramId?: PublicKey;
}): Promise<EnsureEncryptDepositResult> {
  const accounts = deriveEncryptAccounts(options.payer.publicKey, {
    auraProgramId: options.auraProgramId,
    encryptProgramId: options.encryptProgramId,
  });
  const existing = await options.connection.getAccountInfo(accounts.deposit, "confirmed");
  if (existing) {
    return { accounts, created: false };
  }

  const configInfo = await options.connection.getAccountInfo(accounts.config, "confirmed");
  if (!configInfo || configInfo.data.length < 132) {
    throw new Error("Encrypt config account not found or too small for fee-vault lookup.");
  }

  const feeVault = new PublicKey(configInfo.data.subarray(100, 132));
  const vaultIsPayer = feeVault.equals(ZERO_PUBKEY);
  const vaultAccount = vaultIsPayer ? options.payer.publicKey : feeVault;
  const data = Buffer.alloc(18);
  data[0] = ENCRYPT_DEPOSIT_DISC;
  data[1] = accounts.depositBump;

  const instruction = new TransactionInstruction({
    programId: accounts.encryptProgram,
    data,
    keys: [
      { pubkey: accounts.deposit, isSigner: false, isWritable: true },
      { pubkey: accounts.config, isSigner: false, isWritable: false },
      { pubkey: options.payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: options.payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: options.payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: vaultAccount, isSigner: vaultIsPayer, isWritable: true },
      { pubkey: ZERO_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: ZERO_PUBKEY, isSigner: false, isWritable: false },
    ],
  });

  const signature = await sendInstructionsWithBudget({
    connection: options.connection,
    payer: options.payer,
    instructions: [instruction],
  });

  return { accounts, created: true, signature };
}

export async function waitForAccountState(
  connection: Connection,
  pubkey: PublicKey,
  predicate: (account: BufferAccountInfo) => boolean,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    commitment?: Commitment;
  } = {},
): Promise<BufferAccountInfo> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const commitment = options.commitment ?? "confirmed";
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const account = await connection.getAccountInfo(pubkey, commitment);
    if (account && predicate(account)) {
      return account;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${pubkey.toBase58()}`);
}

export async function waitForCiphertextVerified(
  connection: Connection,
  ciphertext: PublicKey,
  options?: { timeoutMs?: number; intervalMs?: number; commitment?: Commitment },
): Promise<BufferAccountInfo> {
  return await waitForAccountState(
    connection,
    ciphertext,
    (account) => account.data.length >= 100 && account.data[99] === 1,
    options,
  );
}

export async function waitForDecryptionReady(
  connection: Connection,
  requestAccount: PublicKey,
  options?: { timeoutMs?: number; intervalMs?: number; commitment?: Commitment },
): Promise<BufferAccountInfo> {
  return await waitForAccountState(
    connection,
    requestAccount,
    (account) => {
      if (account.data.length < 107) {
        return false;
      }
      const total = account.data.readUInt32LE(99);
      const written = account.data.readUInt32LE(103);
      return total > 0 && written === total;
    },
    options,
  );
}

export async function waitForMessageApproval(
  connection: Connection,
  messageApproval: PublicKey,
  targetState: Exclude<MessageApprovalState, "missing"> = "signed",
  options?: { timeoutMs?: number; intervalMs?: number; commitment?: Commitment },
): Promise<BufferAccountInfo> {
  return await waitForAccountState(
    connection,
    messageApproval,
    (account) => {
      const state = parseMessageApprovalState(account.data);
      return state === targetState || (targetState === "pending" && state === "signed");
    },
    options,
  );
}

export async function getMessageApprovalState(
  connection: Connection,
  messageApproval: PublicKey,
  commitment: Commitment = "confirmed",
): Promise<MessageApprovalState> {
  const account = await connection.getAccountInfo(messageApproval, commitment);
  if (!account) {
    return "missing";
  }
  return parseMessageApprovalState(account.data);
}

export function parseMessageApprovalState(data: Buffer): MessageApprovalState {
  if (data.length < 2 || data[0] !== MESSAGE_APPROVAL_DISC) {
    return "missing";
  }

  if (data.length >= MESSAGE_APPROVAL_ACCOUNT_LEN_V2) {
    const v2Status = data[MESSAGE_APPROVAL_STATUS_OFFSET_V2];
    return v2Status === 1 ? "signed" : "pending";
  }

  const v1Status =
    data.length > MESSAGE_APPROVAL_STATUS_OFFSET_V1
      ? data[MESSAGE_APPROVAL_STATUS_OFFSET_V1]
      : undefined;
  if (v1Status !== undefined) {
    return v1Status === 1 ? "signed" : "pending";
  }

  return "pending";
}

export function parseDecryptionReady(account: BufferAccountInfo | null): boolean {
  if (!account || account.data.length < 107) {
    return false;
  }
  const total = account.data.readUInt32LE(99);
  const written = account.data.readUInt32LE(103);
  return total > 0 && written === total;
}

export function parseCiphertextVerified(account: BufferAccountInfo | null): boolean {
  return !!account && account.data.length >= 100 && account.data[99] === 1;
}

export function buildDryRunKeypair(path: string | undefined, load: (path: string) => Keypair): Keypair {
  return path ? load(path) : createEphemeralKeypair();
}

export function buildConfirmPolicySummary(account: TreasuryAccountRecord): {
  approved: boolean;
  violation: number;
  status: number;
} {
  const pending = resolvePendingProposal(account);
  return {
    approved: pending.decision.approved,
    violation: pending.decision.violation,
    status: pending.status,
  };
}
