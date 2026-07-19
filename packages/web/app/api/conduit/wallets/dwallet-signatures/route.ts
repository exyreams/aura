import {
  accounts,
  pda,
  solanaCompiledMessageDigest,
} from "@aura-protocol/sdk-ts";
import { Connection, Message, PublicKey, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import { NextResponse } from "next/server";
import { metadataString } from "@/lib/agents/session-model";
import {
  assertConduitScope,
  authenticateConduitAgent,
} from "@/lib/conduit/agent-token";
import {
  assertDWalletAddressMatchesSession,
  assertNativeSolanaDWallet,
  createAuraClient,
  getAuraRpcUrl,
  loadIkaDWalletExecutionSession,
  SOL_ASSET_ID,
  SOL_DECIMALS,
  SOLANA_CHAIN_CODE,
  TRANSFER_TX_TYPE_CODE,
} from "@/lib/conduit/wallet-transfer-execution";
import type { Json, WalletRegistryRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

interface DWalletSignatureBody {
  walletId?: unknown;
  proposalId?: unknown;
  recipientAddress?: unknown;
  rawAmount?: unknown;
  amountUsd?: unknown;
  messageBytesBase64?: unknown;
  messageHashHex?: unknown;
  solanaRecentBlockhash?: unknown;
  approvalProofSignature?: unknown;
  messageApprovalPda?: unknown;
}

function jsonError(message: string, status: number, details?: Json) {
  return NextResponse.json({ error: message, details }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not sign dWallet message.";
}

function getAuthErrorStatus(error: unknown) {
  const message = getErrorMessage(error);

  if (message.includes("Missing Conduit bearer token")) {
    return 401;
  }

  if (
    message.includes("Unknown or revoked") ||
    message.includes("expired") ||
    message.includes("revoked") ||
    message.includes("missing wallet:transfer")
  ) {
    return 403;
  }

  return 400;
}

function getString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function getUnsignedInteger(value: unknown, label: string) {
  const text =
    typeof value === "number" && Number.isInteger(value)
      ? String(value)
      : getString(value, label);

  if (!/^\d+$/u.test(text)) {
    throw new Error(`${label} must be an unsigned integer.`);
  }

  return text;
}

function getPublicKey(value: unknown, label: string) {
  const text = getString(value, label);

  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address.`);
  }
}

function getHex32(value: unknown, label: string) {
  const text = getString(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(text)) {
    throw new Error(`${label} must be a 32-byte hex string.`);
  }

  return text;
}

function getBase64Bytes(value: unknown, label: string) {
  const text = getString(value, label);
  const bytes = Buffer.from(text, "base64");

  if (bytes.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  return new Uint8Array(bytes);
}

function getSignatureBytes(value: unknown, label: string) {
  const signature = getString(value, label);

  try {
    const bytes = bs58.decode(signature);
    if (bytes.length !== 64) {
      throw new Error("Invalid signature length.");
    }
    return { signature, bytes: new Uint8Array(bytes) };
  } catch {
    throw new Error(`${label} must be a valid Solana transaction signature.`);
  }
}

function getBlockhashBytes(value: unknown) {
  const blockhash = getString(value, "Solana recent blockhash");

  try {
    const bytes = bs58.decode(blockhash);
    if (bytes.length !== 32) {
      throw new Error("Invalid blockhash length.");
    }
    return { blockhash, bytes: new Uint8Array(bytes) };
  } catch {
    throw new Error("Solana recent blockhash must be a valid blockhash.");
  }
}

function bytesToHex(value: Uint8Array) {
  return Buffer.from(value).toString("hex");
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalBytes32(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Uint8Array) {
    return value.length === 32 ? new Uint8Array(value) : null;
  }

  if (Array.isArray(value)) {
    const bytes = value.filter(
      (entry): entry is number =>
        typeof entry === "number" &&
        Number.isInteger(entry) &&
        entry >= 0 &&
        entry <= 255,
    );
    return bytes.length === 32 ? new Uint8Array(bytes) : null;
  }

  return null;
}

function fieldString(value: unknown) {
  return value !== null && value !== undefined ? value.toString() : null;
}

function fieldNumber(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function getSessionAuthorityPubkey(
  auth: Awaited<ReturnType<typeof authenticateConduitAgent>>,
) {
  const value = metadataString(auth.session.metadata, "authority_public_key");
  if (!value) {
    throw new Error(
      "This Conduit session is missing its signer authority public key.",
    );
  }

  try {
    return new PublicKey(value);
  } catch {
    throw new Error("Conduit signer authority public key is invalid.");
  }
}

function readU64LE(bytes: Uint8Array) {
  if (bytes.length !== 8) {
    throw new Error("System transfer amount must be encoded as u64.");
  }

  let value = BigInt(0);
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << BigInt(8)) + BigInt(bytes[index] ?? 0);
  }
  return value;
}

function decodeSystemTransferLamports(data: Uint8Array) {
  if (data.length !== 12) {
    throw new Error("Solana transfer instruction data is invalid.");
  }

  const instruction =
    Number(data[0] ?? 0) |
    (Number(data[1] ?? 0) << 8) |
    (Number(data[2] ?? 0) << 16) |
    (Number(data[3] ?? 0) << 24);
  if (instruction !== 2) {
    throw new Error("Solana message must contain a SystemProgram transfer.");
  }

  return readU64LE(data.subarray(4));
}

function assertExpectedSolanaTransferMessage(input: {
  messageBytes: Uint8Array;
  blockhash: string;
  feePayer: PublicKey;
  source: PublicKey;
  recipient: PublicKey;
  lamports: string;
}) {
  let message: Message;
  try {
    message = Message.from(input.messageBytes);
  } catch {
    throw new Error("Message bytes must be a valid legacy Solana message.");
  }

  if (!equalBytes(new Uint8Array(message.serialize()), input.messageBytes)) {
    throw new Error("Solana message bytes are not canonical.");
  }

  if (message.recentBlockhash !== input.blockhash) {
    throw new Error("Solana message blockhash does not match request.");
  }

  const feePayer = message.accountKeys[0];
  if (
    !feePayer?.equals(input.feePayer) ||
    !message.isAccountSigner(0) ||
    !message.isAccountWritable(0)
  ) {
    throw new Error("Solana message fee payer must be the Conduit signer.");
  }

  if (message.instructions.length !== 1) {
    throw new Error("Solana message must contain exactly one instruction.");
  }

  const instruction = message.instructions[0];
  if (!instruction) {
    throw new Error("Solana message instruction is missing.");
  }

  const programId = message.accountKeys[instruction.programIdIndex];
  if (!programId?.equals(SystemProgram.programId)) {
    throw new Error("Solana message must call SystemProgram only.");
  }

  if (instruction.accounts.length !== 2) {
    throw new Error("Solana transfer instruction must have two accounts.");
  }

  const sourceIndex = instruction.accounts[0];
  const recipientIndex = instruction.accounts[1];
  if (sourceIndex === undefined || recipientIndex === undefined) {
    throw new Error("Solana transfer account indexes are invalid.");
  }

  const source = message.accountKeys[sourceIndex];
  const recipient = message.accountKeys[recipientIndex];
  if (!source?.equals(input.source)) {
    throw new Error("Solana transfer source must be the registered dWallet.");
  }
  if (!recipient?.equals(input.recipient)) {
    throw new Error("Solana transfer recipient does not match request.");
  }
  if (
    !message.isAccountSigner(sourceIndex) ||
    !message.isAccountWritable(sourceIndex)
  ) {
    throw new Error("Solana transfer source must be a writable signer.");
  }
  if (!message.isAccountWritable(recipientIndex)) {
    throw new Error("Solana transfer recipient must be writable.");
  }

  const decodedLamports = decodeSystemTransferLamports(
    bs58.decode(instruction.data),
  );
  if (decodedLamports !== BigInt(input.lamports)) {
    throw new Error("Solana transfer amount does not match request.");
  }
}

function pendingMatches(input: {
  pending: unknown;
  proposalId: string;
  recipientAddress: string;
  rawAmount: string;
  amountUsd: string;
  messageHash: Uint8Array;
  solanaRecentBlockhash: Uint8Array;
}) {
  const pending = asRecord(input.pending);
  const transfer = asRecord(pending.transfer);
  const binding = asRecord(transfer.executionBinding);
  const nativeMessageHash = optionalBytes32(binding.nativeMessageHash);
  const solanaMessageHash = optionalBytes32(binding.solanaMessageHash);
  const pendingBlockhash = optionalBytes32(binding.solanaRecentBlockhash);
  const decision = asRecord(pending.decision);

  return (
    fieldString(pending.proposalId) === input.proposalId &&
    decision.approved === true &&
    fieldNumber(pending.targetChain) === SOLANA_CHAIN_CODE &&
    fieldNumber(pending.txType) === TRANSFER_TX_TYPE_CODE &&
    pending.recipientOrContract === input.recipientAddress &&
    fieldString(pending.amountUsd) === input.amountUsd &&
    transfer.assetId === SOL_ASSET_ID &&
    fieldString(transfer.nativeAmount) === input.rawAmount &&
    fieldNumber(transfer.decimals) === SOL_DECIMALS &&
    nativeMessageHash !== null &&
    solanaMessageHash !== null &&
    pendingBlockhash !== null &&
    equalBytes(nativeMessageHash, input.messageHash) &&
    equalBytes(solanaMessageHash, input.messageHash) &&
    equalBytes(pendingBlockhash, input.solanaRecentBlockhash)
  );
}

async function loadWallet(
  auth: Awaited<ReturnType<typeof authenticateConduitAgent>>,
  walletId: string,
) {
  const { data: wallet, error } = await auth.admin
    .from("wallet_registry")
    .select("*")
    .eq("id", walletId)
    .eq("owner_id", auth.session.owner_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!wallet) {
    throw new Error("Wallet not found for this owner.");
  }

  return wallet;
}

async function assertWalletPermission(
  auth: Awaited<ReturnType<typeof authenticateConduitAgent>>,
  wallet: WalletRegistryRow,
) {
  const { data: permission, error } = await auth.admin
    .from("agent_wallet_permissions")
    .select("id")
    .eq("owner_id", auth.session.owner_id)
    .eq("wallet_id", wallet.id)
    .eq("agent_session_id", auth.session.id)
    .eq("status", "active")
    .contains("scopes", ["wallet:transfer"])
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!permission) {
    throw new Error("Grant wallet transfer access to this signer agent first.");
  }
}

export async function POST(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateConduitAgent>>;
  let body: DWalletSignatureBody;

  try {
    auth = await authenticateConduitAgent(request);
    assertConduitScope(auth.session, "wallet:transfer");
    body = (await request.json()) as DWalletSignatureBody;
  } catch (cause) {
    return jsonError(getErrorMessage(cause), getAuthErrorStatus(cause));
  }

  let walletId: string;
  let proposalId: string;
  let recipientAddress: string;
  let rawAmount: string;
  let amountUsd: string;
  let messageBytes: Uint8Array;
  let messageHashHex: string;
  let solanaRecentBlockhash: { blockhash: string; bytes: Uint8Array };
  let approvalProof: { signature: string; bytes: Uint8Array };
  let suppliedMessageApprovalPda: string;

  try {
    walletId = getString(body.walletId, "Wallet ID");
    proposalId = getUnsignedInteger(body.proposalId, "Proposal ID");
    recipientAddress = getPublicKey(body.recipientAddress, "Recipient");
    rawAmount = getUnsignedInteger(body.rawAmount, "Raw amount");
    amountUsd = getUnsignedInteger(body.amountUsd, "Amount USD");
    messageBytes = getBase64Bytes(body.messageBytesBase64, "Message bytes");
    const messageHash = solanaCompiledMessageDigest(messageBytes);
    messageHashHex = bytesToHex(messageHash);
    if (body.messageHashHex !== undefined) {
      const suppliedHash = getHex32(body.messageHashHex, "Message hash");
      if (suppliedHash !== messageHashHex) {
        throw new Error("Message hash does not match message bytes.");
      }
    }
    solanaRecentBlockhash = getBlockhashBytes(body.solanaRecentBlockhash);
    approvalProof = getSignatureBytes(
      body.approvalProofSignature,
      "Approval proof signature",
    );
    suppliedMessageApprovalPda = getPublicKey(
      body.messageApprovalPda,
      "Message approval PDA",
    );
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  let wallet: WalletRegistryRow;

  try {
    wallet = await loadWallet(auth, walletId);
    assertNativeSolanaDWallet(wallet);
    await assertWalletPermission(auth, wallet);
    assertExpectedSolanaTransferMessage({
      messageBytes,
      blockhash: solanaRecentBlockhash.blockhash,
      feePayer: getSessionAuthorityPubkey(auth),
      source: new PublicKey(wallet.chain_address),
      recipient: new PublicKey(recipientAddress),
      lamports: rawAmount,
    });
  } catch (cause) {
    const message = getErrorMessage(cause);
    return jsonError(message, message.includes("Wallet not found") ? 404 : 409);
  }

  const treasuryPda = wallet.treasury_pda
    ? new PublicKey(wallet.treasury_pda)
    : null;
  if (!treasuryPda) {
    return jsonError("This dWallet is missing an AURA treasury PDA.", 409);
  }

  let ikaSession: Awaited<ReturnType<typeof loadIkaDWalletExecutionSession>>;

  try {
    ikaSession = await loadIkaDWalletExecutionSession(auth.admin, {
      ownerId: auth.session.owner_id,
      walletId: wallet.id,
      agentSessionId: auth.session.id,
    });
    assertDWalletAddressMatchesSession(wallet, ikaSession);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 409);
  }

  const messageHash = solanaCompiledMessageDigest(messageBytes);
  const metadataDigest = ikaSession.messageMetadataDigest
    ? new Uint8Array(Buffer.from(ikaSession.messageMetadataDigest, "hex"))
    : undefined;
  const [derivedMessageApprovalPda] = pda.deriveMessageApprovalAddress(
    new PublicKey(ikaSession.dwalletProgramId),
    ikaSession.curve,
    new Uint8Array(Buffer.from(ikaSession.publicKeyHex, "hex")),
    ikaSession.signatureScheme,
    messageHash,
    metadataDigest,
  );

  if (derivedMessageApprovalPda.toBase58() !== suppliedMessageApprovalPda) {
    return jsonError(
      "Message approval PDA does not match the dWallet message binding.",
      400,
    );
  }

  const connection = new Connection(getAuraRpcUrl(), "confirmed");
  const client = createAuraClient(connection);

  try {
    const treasury = await accounts.fetchTreasuryAccountNullable(
      client,
      treasuryPda,
    );
    const pendingQueue = Array.isArray(
      (treasury as { pendingQueue?: unknown } | null)?.pendingQueue,
    )
      ? (treasury as { pendingQueue: unknown[] }).pendingQueue
      : [];
    const pending = pendingQueue.find((entry) =>
      pendingMatches({
        pending: entry,
        proposalId,
        recipientAddress,
        rawAmount,
        amountUsd,
        messageHash,
        solanaRecentBlockhash: solanaRecentBlockhash.bytes,
      }),
    );

    if (!pending) {
      return jsonError(
        "No approved on-chain pending proposal matches this dWallet signing request.",
        409,
        {
          proposal_id: proposalId,
          message_hash: messageHashHex,
          recent_blockhash: solanaRecentBlockhash.blockhash,
        },
      );
    }

    const messageApprovalInfo = await connection.getAccountInfo(
      derivedMessageApprovalPda,
      "confirmed",
    );
    if (!messageApprovalInfo) {
      return jsonError(
        "The dWallet MessageApproval account has not been created on-chain yet.",
        409,
      );
    }
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 502);
  }

  const ika = ikaSession.createClient();
  try {
    const senderPubkey = ikaSession.authority.publicKey.toBytes();
    const presignId = await ika.requestPresign(
      senderPubkey,
      ikaSession.sessionIdentifier,
    );
    const signature = await ika.requestSign(
      senderPubkey,
      ikaSession.sessionIdentifier,
      messageBytes,
      presignId,
      approvalProof.bytes,
      ikaSession.dkgAttestation,
    );
    const signatureBase64 = Buffer.from(signature).toString("base64");
    const signatureHex = Buffer.from(signature).toString("hex");
    const signedAt = new Date().toISOString();

    await auth.admin
      .from("dwallet_sessions")
      .update({ last_used_at: signedAt })
      .eq("id", ikaSession.id);

    await auth.admin.from("activity_events").insert({
      owner_id: auth.session.owner_id,
      agent_session_id: auth.session.id,
      treasury_pda: wallet.treasury_pda,
      wallet_id: wallet.id,
      event_kind: "wallet.dwallet.message_signed",
      severity: "info",
      title: "dWallet message signed",
      summary: `dWallet signature produced for proposal ${proposalId}.`,
      proposal_id: proposalId,
      metadata: {
        version: "aura.wallet_dwallet_signature.v1",
        wallet_id: wallet.id,
        proposal_id: proposalId,
        message_hash: messageHashHex,
        message_approval_pda: derivedMessageApprovalPda.toBase58(),
        approval_proof_signature: approvalProof.signature,
        signed_at: signedAt,
      },
    });

    return NextResponse.json({
      signatureBase64,
      signatureHex,
      messageHashHex,
      messageApprovalPda: derivedMessageApprovalPda.toBase58(),
      signer: ikaSession.authorizedUserPubkey,
    });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 502);
  } finally {
    ika.close();
  }
}
