import { createHash } from "node:crypto";
import BN from "bn.js";
import {
  AURA_PROGRAM_ID,
  deriveDwalletCpiAuthorityAddress,
  deriveEncryptCpiAuthorityAddress,
  deriveEncryptEventAuthorityAddress,
  DWALLET_DEVNET_PROGRAM_ID,
  ENCRYPT_DEVNET_PROGRAM_ID,
  type TreasuryAccountRecord,
} from "@aura-protocol/sdk-ts";
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
import sha3 from "js-sha3";

const { keccak_256 } = sha3;
const ENCRYPT_CONFIG_SEED = Buffer.from("encrypt_config");
const ENCRYPT_DEPOSIT_SEED = Buffer.from("encrypt_deposit");
const NETWORK_ENCRYPTION_KEY_SEED = Buffer.from("network_encryption_key");
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

// Curve25519 = discriminant 2 in the DWalletCurve enum (Secp256k1=0, Secp256r1=1, Curve25519=2)
const CURVE25519_CODE = 2;
// transfer_ownership instruction discriminator on the dWallet program
const DWALLET_TRANSFER_OWNERSHIP_DISC = 24;

type PendingProposal = TreasuryAccountRecord["pendingQueue"][number];
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

export interface ApprovedExecutionAccounts {
  pending: PendingProposal;
  dwallet: DwalletRecord;
  messageApproval: PublicKey;
  dwalletAccount: PublicKey;
  dwalletCoordinator: PublicKey;
  cpiAuthority: PublicKey;
  dwalletProgram: PublicKey;
}

function chainNameForDigest(code: number) {
  return (
    {
      0: "bitcoin",
      1: "ethereum",
      2: "solana",
      3: "polygon",
      4: "arbitrum",
      5: "optimism",
    }[code] ?? `unknown_${code}`
  );
}

function transactionTypeNameForDigest(code: number) {
  return (
    {
      0: "transfer",
      1: "defi_swap",
      2: "lending_deposit",
      3: "nft_purchase",
      4: "contract_interaction",
    }[code] ?? `unknown_${code}`
  );
}

function fixedU16LE(value: number) {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value, 0);
  return out;
}

function decodeOptionalDigest(value: string | null | undefined, label: string) {
  if (!value) {
    return Buffer.from(ZERO_DIGEST);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte hex digest`);
  }
  return Buffer.from(value, "hex");
}

function decodePublicKeyHex(value: string | null | undefined) {
  if (!value) {
    throw new Error("dWallet publicKeyHex is required for message approval derivation");
  }
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) {
    throw new Error("dWallet publicKeyHex must contain valid hex bytes");
  }
  return Buffer.from(value, "hex");
}

function findDwalletForPending(account: TreasuryAccountRecord, pending: PendingProposal) {
  const dwallet = account.dwallets.find((entry) => entry.chain === pending.targetChain);
  if (!dwallet) {
    throw new Error(
      `No dWallet is registered for pending chain ${chainNameForDigest(pending.targetChain)}`,
    );
  }
  return dwallet;
}

export function buildPendingMessage(pending: PendingProposal, dwallet: DwalletRecord) {
  return [
    pending.proposalId.toString(),
    pending.proposalDigest,
    chainNameForDigest(pending.targetChain),
    transactionTypeNameForDigest(pending.txType),
    dwallet.address,
    pending.recipientOrContract,
    pending.amountUsd.toString(),
    pending.policyOutputDigest,
  ].join(":");
}

function keccakDigest(message: string) {
  return Buffer.from(keccak_256.arrayBuffer(Buffer.from(message, "utf8")));
}

export function buildMessageDigestHex(
  pending: PendingProposal,
  dwallet: DwalletRecord,
) {
  return Buffer.from(keccakDigest(buildPendingMessage(pending, dwallet))).toString("hex");
}

export function deriveEncryptAccounts(
  payer: PublicKey,
  options: { auraProgramId?: PublicKey; encryptProgramId?: PublicKey } = {},
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

export function resolveScalarGuardrails(account: TreasuryAccountRecord) {
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

export function resolvePendingProposal(account: TreasuryAccountRecord) {
  const pending = getActivePendingProposal(account);
  if (!pending) {
    throw new Error("This treasury has no pending proposal.");
  }
  return pending;
}

export function getActivePendingProposal(account: TreasuryAccountRecord): PendingProposal | null {
  return account.pendingQueue[0] ?? null;
}

export function resolvePendingPolicyOutput(account: TreasuryAccountRecord) {
  const pending = resolvePendingProposal(account);
  if (!pending.policyOutputCiphertextAccount) {
    throw new Error("The pending proposal does not have a confidential policy output ciphertext.");
  }
  return new PublicKey(pending.policyOutputCiphertextAccount);
}

export function resolvePendingRequestAccount(account: TreasuryAccountRecord) {
  const pending = resolvePendingProposal(account);
  const requestAccount = pending.decryptionRequest?.requestAccount;
  if (!requestAccount) {
    throw new Error("The pending proposal does not have an active decryption request.");
  }
  return new PublicKey(requestAccount);
}

export function deriveDwalletCoordinatorAddress(
  dwalletProgramId: PublicKey = DWALLET_DEVNET_PROGRAM_ID,
) {
  return PublicKey.findProgramAddressSync([DWALLET_COORDINATOR_SEED], dwalletProgramId);
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

export function deriveApprovedExecutionAccounts(
  account: TreasuryAccountRecord,
  options: { auraProgramId?: PublicKey; dwalletProgramId?: PublicKey } = {},
): ApprovedExecutionAccounts {
  const pending = resolvePendingProposal(account);
  if (!pending.decision.approved) {
    throw new Error("The current pending proposal is denied.");
  }
  const dwalletProgramId = options.dwalletProgramId ?? DWALLET_DEVNET_PROGRAM_ID;
  const auraProgramId = options.auraProgramId ?? AURA_PROGRAM_ID;
  const dwallet = findDwalletForPending(account, pending);
  if (!dwallet.dwalletAccount) {
    throw new Error("dWallet runtime account is not configured on this dWallet");
  }
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
    dwalletAccount: dwallet.dwalletAccount,
    dwalletCoordinator,
    cpiAuthority,
    dwalletProgram: dwalletProgramId,
  };
}

export function createEphemeralKeypair() {
  return Keypair.generate();
}

export function markInstructionSigner(
  instruction: TransactionInstruction,
  pubkey: PublicKey,
) {
  const entry = instruction.keys.find((key) => key.pubkey.equals(pubkey));
  if (!entry) {
    throw new Error(`Instruction missing signer ${pubkey.toBase58()}`);
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
}) {
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
}) {
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
  options: { timeoutMs?: number; intervalMs?: number; commitment?: Commitment } = {},
) {
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
) {
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
) {
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

export function parseMessageApprovalState(data: Buffer) {
  if (data.length < 2 || data[0] !== MESSAGE_APPROVAL_DISC) {
    return "missing" as const;
  }
  if (data.length >= MESSAGE_APPROVAL_ACCOUNT_LEN_V2) {
    return data[MESSAGE_APPROVAL_STATUS_OFFSET_V2] === 1 ? "signed" : "pending";
  }
  const v1Status =
    data.length > MESSAGE_APPROVAL_STATUS_OFFSET_V1
      ? data[MESSAGE_APPROVAL_STATUS_OFFSET_V1]
      : undefined;
  if (v1Status !== undefined) {
    return v1Status === 1 ? "signed" : "pending";
  }
  return "pending" as const;
}

export async function waitForMessageApproval(
  connection: Connection,
  messageApproval: PublicKey,
  targetState: "pending" | "signed" = "signed",
  options?: { timeoutMs?: number; intervalMs?: number; commitment?: Commitment },
) {
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

export function buildExecutePendingInstruction(options: {
  clientProgramId: PublicKey;
  coder: { encode(ixName: string, args: { now: BN }): Buffer };
  operator: PublicKey;
  treasury: PublicKey;
  now: number;
  approvedAccounts?: ApprovedExecutionAccounts;
}) {
  const keys = [
    { pubkey: options.operator, isSigner: true, isWritable: false },
    { pubkey: options.treasury, isSigner: false, isWritable: true },
  ];
  if (options.approvedAccounts) {
    keys.push(
      { pubkey: options.approvedAccounts.messageApproval, isSigner: false, isWritable: true },
      { pubkey: options.approvedAccounts.dwalletAccount, isSigner: false, isWritable: false },
      { pubkey: options.clientProgramId, isSigner: false, isWritable: false },
      { pubkey: options.approvedAccounts.cpiAuthority, isSigner: false, isWritable: false },
      { pubkey: options.approvedAccounts.dwalletProgram, isSigner: false, isWritable: false },
      { pubkey: options.approvedAccounts.dwalletCoordinator, isSigner: false, isWritable: false },
    );
  } else {
    keys.push({ pubkey: options.clientProgramId, isSigner: false, isWritable: false });
  }
  keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });
  return new TransactionInstruction({
    programId: options.clientProgramId,
    keys,
    data: options.coder.encode("execute_pending", { now: new BN(options.now) }),
  });
}

export function buildPolicyPlaintextDigestHex(plaintextBytes: Buffer) {
  return createHash("sha256").update(plaintextBytes).digest("hex");
}

// dWallet creation helpers

/**
 * Derives the on-chain dWallet PDA from a curve code and raw public key bytes.
 *
 * Mirrors the Rust smoke test `derive_dwallet_pda()`:
 *   seeds = ["dwallet", ...32-byte chunks of (u16LE(curve) ++ publicKey)]
 *
 * For Curve25519 (code=2) with a 32-byte Ed25519 public key the payload is
 * 34 bytes, split into [2-byte prefix chunk, 32-byte key chunk].
 */
export function deriveDwalletPda(
  curveCode: number,
  publicKey: Uint8Array,
  dwalletProgramId: PublicKey = DWALLET_DEVNET_PROGRAM_ID,
): PublicKey {
  const curveBytes = Buffer.alloc(2);
  curveBytes.writeUInt16LE(curveCode, 0);
  const payload = Buffer.concat([curveBytes, Buffer.from(publicKey)]);

  const seeds: Buffer[] = [DWALLET_SEED];
  for (let offset = 0; offset < payload.length; offset += 32) {
    seeds.push(payload.subarray(offset, offset + 32));
  }

  return PublicKey.findProgramAddressSync(seeds, dwalletProgramId)[0];
}

/**
 * Builds the `transfer_ownership` instruction for the dWallet program.
 *
 * Transfers the dWallet's authority to `newOwner` (typically AURA's
 * `__ika_cpi_authority` PDA) so that `aura-core` can CPI `approve_message`
 * on its behalf.
 *
 * Discriminator 24 matches the Rust smoke test `transfer_dwallet_authority()`.
 */
export function buildTransferDwalletOwnershipInstruction(
  currentOwner: PublicKey,
  dwalletAccount: PublicKey,
  newOwner: PublicKey,
  dwalletProgramId: PublicKey = DWALLET_DEVNET_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.alloc(1 + 32);
  data.writeUInt8(DWALLET_TRANSFER_OWNERSHIP_DISC, 0);
  newOwner.toBuffer().copy(data, 1);

  return new TransactionInstruction({
    programId: dwalletProgramId,
    data,
    keys: [
      { pubkey: currentOwner, isSigner: true, isWritable: false },
      { pubkey: dwalletAccount, isSigner: false, isWritable: true },
    ],
  });
}

export interface ProvisionedDWallet {
  /** On-chain Solana PDA of the dWallet account (use as dwalletAccount). */
  dwalletAccount: PublicKey;
  /** Authorized user pubkey — the backend keypair that owns this dWallet. */
  authorizedUserPubkey: PublicKey;
  /** Hex-encoded raw public key bytes (use as publicKeyHex). */
  publicKeyHex: string;
  /** Base58 address of the dWallet on the target chain (use as address). */
  address: string;
  /** The dWallet ID string to store on the treasury (= dwalletAccount base58). */
  dwalletId: string;
  /** Tx signature of the transfer_ownership instruction. */
  transferSignature: string;
  /** 32-byte session identifier from the DKG attestation V1 payload.
   *  Must be passed as `sessionIdentifier` to requestDwalletSign(). */
  sessionIdentifier: Uint8Array;
  /** Full DKG attestation — must be passed as `dkgAttestation` to requestDwalletSign(). */
  dkgAttestation: import("../ika/grpc.js").DKGAttestation;
}

/**
 * Provisions a new Ed25519 dWallet via the Ika DKG gRPC service, waits for
 * the PDA to appear on-chain, then transfers ownership to AURA's CPI
 * authority PDA so `execute_pending` can CPI `approve_message`.
 *
 * This is the TypeScript port of `provision_dwallet()` +
 * `transfer_dwallet_authority()` from the Rust smoke test.
 */
export async function provisionDwallet(options: {
  connection: Connection;
  payer: Signer;
  auraProgramId?: PublicKey;
  dwalletProgramId?: PublicKey;
  ikaGrpcUrl?: string;
}): Promise<ProvisionedDWallet> {
  const { createIkaClient } = await import("../ika/grpc.js");

  const dwalletProgramId = options.dwalletProgramId ?? DWALLET_DEVNET_PROGRAM_ID;
  const auraProgramId = options.auraProgramId ?? AURA_PROGRAM_ID;
  const grpcUrl = options.ikaGrpcUrl ?? "pre-alpha-dev-1.ika.ika-network.net:443";

  // 1. Run DKG via Ika gRPC — pass the payer's secret key so requests are
  //    signed with the real Ed25519 key (not zero bytes).
  const secretKey = (options.payer as { secretKey?: Uint8Array }).secretKey;
  const ikaClient = createIkaClient(grpcUrl, secretKey);
  let dkgResult: Awaited<ReturnType<typeof ikaClient.requestDKG>>;
  try {
    dkgResult = await ikaClient.requestDKG(options.payer.publicKey.toBytes());
  } finally {
    ikaClient.close();
  }

  // 2. Derive the on-chain dWallet PDA from (Curve25519=2, publicKey)
  const dwalletAccount = deriveDwalletPda(CURVE25519_CODE, dkgResult.publicKey, dwalletProgramId);

  // 3. Wait for the PDA to appear on-chain (Ika network writes it after DKG)
  await waitForAccountState(
    options.connection,
    dwalletAccount,
    (account) => account.data.length > 2 && account.data[0] === 2,
    { timeoutMs: 120_000, intervalMs: 1_500 },
  );

  // 4. Transfer ownership to AURA's __ika_cpi_authority PDA
  const [auraCpiAuthority] = deriveDwalletCpiAuthorityAddress(auraProgramId);
  const transferIx = buildTransferDwalletOwnershipInstruction(
    options.payer.publicKey,
    dwalletAccount,
    auraCpiAuthority,
    dwalletProgramId,
  );
  const transferSignature = await sendInstructionsWithBudget({
    connection: options.connection,
    payer: options.payer,
    instructions: [transferIx],
  });

  const publicKeyHex = Buffer.from(dkgResult.publicKey).toString("hex");

  // For Solana the "address" is the base58-encoded public key —
  // this is the actual Solana address you send tokens to.
  const address = new PublicKey(dkgResult.publicKey).toBase58();

  return {
    dwalletAccount,
    authorizedUserPubkey: options.payer.publicKey,
    publicKeyHex,
    address,
    dwalletId: dwalletAccount.toBase58(),
    transferSignature,
    sessionIdentifier: dkgResult.sessionIdentifier,
    dkgAttestation: dkgResult.dkgAttestation,
  };
}
