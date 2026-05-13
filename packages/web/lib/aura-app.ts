"use client";

import {
  AuraClient,
  type ConfigureMultisigArgs,
  type ConfigureSwarmArgs,
  type CreateTreasuryArgs,
  type ProposeTransactionArgs,
  type RegisterDwalletArgs,
  type TreasuryAccountRecord,
  validateAddress,
  validateAgentId,
  validateAmountUsd,
  validateDwalletId,
  validateGuardians,
  validateMultisigThreshold,
  validateSwarmMembers,
} from "@aura-protocol/sdk-ts";
import { BorshCoder, EventParser, type Idl } from "@coral-xyz/anchor";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  type Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
// biome-ignore lint/style/useNodejsImportProtocol: this is the browser Buffer polyfill package used by Solana transaction data.
import { Buffer } from "buffer";

// Anchor discriminator (8) + schema_version u8 (1) + bump u8 (1) = 10
export const TREASURY_OWNER_OFFSET = 10;

export const CHAINS = [
  { code: 0, label: "Bitcoin" },
  { code: 1, label: "Ethereum" },
  { code: 2, label: "Solana" },
  { code: 3, label: "Polygon" },
  { code: 4, label: "Arbitrum" },
  { code: 5, label: "Optimism" },
] as const;

export const TX_TYPES = [
  { code: 0, label: "Transfer" },
  { code: 1, label: "DeFi Swap" },
  { code: 2, label: "Lending Deposit" },
  { code: 3, label: "NFT Purchase" },
  { code: 4, label: "Contract Interaction" },
] as const;

export const PROPOSAL_STATUSES = [
  "Proposed",
  "Decryption Requested",
  "Awaiting Signature",
  "Executed",
  "Denied",
  "Cancelled",
  "Expired",
  "Policy Computed",
] as const;

export const VIOLATIONS = [
  "none",
  "per_transaction_limit",
  "daily_limit",
  "bitcoin_manual_review",
  "time_window_limit",
  "velocity_limit",
  "protocol_not_allowed",
  "slippage_exceeded",
  "quote_stale",
  "counterparty_risk",
  "shared_pool_limit",
  "weekly_limit",
  "monthly_limit",
  "recipient_daily_limit",
  "recipient_per_transaction_limit",
  "anomaly_detected",
  "cooldown_not_elapsed",
  "budget_envelope_daily_limit",
  "budget_envelope_weekly_limit",
  "approval_ladder_denied",
  "execution_scope_paused",
  "external_dependency_stale",
  "policy_attestation_missing",
  "empty_batch",
  "batch_too_large",
  "exposure_group_limit_exceeded",
  "pending_execution_timelock_active",
] as const;

// Human-readable descriptions for each violation code (matches ViolationCode enum order)
export const VIOLATION_DESCRIPTIONS: Record<string, string> = {
  none: "Transaction was approved — no rule failed",
  per_transaction_limit: "Amount exceeded the per-transaction USD cap",
  daily_limit: "Projected daily spend would exceed the effective daily limit",
  bitcoin_manual_review:
    "Bitcoin transaction exceeded the manual review threshold",
  time_window_limit:
    "Projected hourly spend would exceed the active daytime/nighttime limit",
  velocity_limit:
    "Recent-amounts velocity window sum would exceed the velocity cap",
  protocol_not_allowed: "Protocol ID is not set in the allowed_protocol_bitmap",
  slippage_exceeded: "Computed slippage exceeded max_slippage_bps",
  quote_stale: "Quote age exceeded max_quote_age_secs — price data is too old",
  counterparty_risk: "Counterparty risk score exceeded the configured maximum",
  shared_pool_limit:
    "Projected swarm pool spend would exceed the shared pool cap",
  weekly_limit: "Projected 7-day spend would exceed the weekly limit",
  monthly_limit: "Projected 30-day spend would exceed the monthly limit",
  recipient_daily_limit: "Recipient-specific daily exposure would be exceeded",
  recipient_per_transaction_limit:
    "Recipient-specific per-transaction exposure would be exceeded",
  anomaly_detected:
    "Statistical anomaly detection flagged the amount as an outlier",
  cooldown_not_elapsed:
    "Minimum delay between large transactions has not elapsed",
  budget_envelope_daily_limit:
    "A scoped budget envelope daily cap would be exceeded",
  budget_envelope_weekly_limit:
    "A scoped budget envelope weekly cap would be exceeded",
  approval_ladder_denied:
    "Approval ladder denied the transaction based on amount or risk score",
  execution_scope_paused:
    "A scoped pause is active for this chain or transaction type",
  external_dependency_stale:
    "Required external dependency liveness signal is stale",
  policy_attestation_missing: "Policy attestation is missing or has expired",
  empty_batch: "Batch proposal contained no items",
  batch_too_large: "Batch proposal exceeded the maximum item count",
  exposure_group_limit_exceeded:
    "Cross-treasury exposure group cap would be exceeded",
  pending_execution_timelock_active:
    "Pending execution timelock is still active",
};

export interface TreasuryEntry {
  publicKey: PublicKey;
  account: TreasuryAccountRecord;
}

export type PendingProposalRecord =
  TreasuryAccountRecord["pendingQueue"][number];

export interface ParsedActivity {
  /** Raw Solana transaction signature (base58). For events within a tx, appended with `:index`. */
  signature: string;
  /** The raw tx signature without the event index suffix — used for Explorer links. */
  txSignature: string;
  treasury: string;
  proposalId?: string;
  proposalDigest?: string;
  kind: "proposal" | "audit" | "execution";
  status?: number;
  approved?: boolean;
  violation?: number;
  detail?: string;
  timestamp?: number;
  // Execution-specific fields (from ExecutionLifecycleEvent)
  messageApprovalAccount?: string;
  decryptionRequestAccount?: string;
}

export function createAuraClient(
  connection: Connection,
  programId?: PublicKey,
) {
  return new AuraClient({ connection, programId });
}

export async function fetchOwnedTreasuries(
  connection: Connection,
  owner: PublicKey,
  programId?: PublicKey,
) {
  const client = createAuraClient(connection, programId);

  try {
    const accounts = await client.program.account.treasuryAccount.all([
      {
        memcmp: {
          offset: TREASURY_OWNER_OFFSET,
          bytes: owner.toBase58(),
        },
      },
    ]);

    // Map to TreasuryEntry format explicitly
    return accounts.map((entry) => ({
      publicKey: entry.publicKey,
      account: entry.account as TreasuryAccountRecord,
    })) as TreasuryEntry[];
  } catch (_error) {
    // If deserialization fails (e.g., old account format), try fetching accounts
    // individually and filter out ones that can't be deserialized

    // Get all program accounts for this owner
    const accountInfos = await connection.getProgramAccounts(client.programId, {
      filters: [
        {
          memcmp: {
            offset: TREASURY_OWNER_OFFSET,
            bytes: owner.toBase58(),
          },
        },
      ],
    });

    // Try to deserialize each account individually
    const validAccounts: TreasuryEntry[] = [];
    for (const { pubkey, account } of accountInfos) {
      try {
        const decoded = client.program.coder.accounts.decode(
          "treasuryAccount",
          account.data,
        ) as TreasuryAccountRecord;
        validAccounts.push({ publicKey: pubkey, account: decoded });
      } catch (_decodeError) {
        // Silently skip accounts with incompatible format
      }
    }

    return validAccounts;
  }
}

export async function fetchTreasury(
  connection: Connection,
  treasury: PublicKey,
  programId?: PublicKey,
) {
  const client = createAuraClient(connection, programId);
  const account = await client.getTreasuryAccount(treasury);
  return { publicKey: treasury, account } satisfies TreasuryEntry;
}

export async function fetchRecentActivity(
  connection: Connection,
  treasuries: PublicKey[],
  programId?: PublicKey,
  limit = 10,
) {
  if (treasuries.length === 0) {
    return [] as ParsedActivity[];
  }

  const client = createAuraClient(connection, programId);
  // BorshCoder (full coder) is required by EventParser — client.program.coder
  // is only a BorshInstructionCoder and cannot decode events.
  const coder = new BorshCoder(client.program.idl as Idl);
  const parser = new EventParser(client.programId, coder);

  // Collect signatures per treasury. Keep the limit small — each
  // getSignaturesForAddress call is cheap (one RPC call), but we want to
  // avoid fetching more transactions than we need.
  const sigsPerTreasury = Math.max(2, Math.ceil(limit / treasuries.length));
  const signatureSet = new Set<string>();

  // Sequential by design — rate-limit RPC calls
  for (const treasury of treasuries) {
    try {
      const sigs = await connection.getSignaturesForAddress(treasury, {
        limit: sigsPerTreasury,
      });
      for (const item of sigs) {
        signatureSet.add(item.signature);
      }
    } catch {
      // Skip this treasury if the RPC call fails (e.g. 429 on one address)
    }
  }

  const signatures = Array.from(signatureSet).slice(0, limit);
  if (signatures.length === 0) {
    return [] as ParsedActivity[];
  }

  // Fetch transactions one at a time with a small delay between each call.
  // getTransactions() batches all sigs into a single JSON-RPC request which
  // reliably triggers 429 on the public devnet endpoint. Sequential fetches
  // with a short pause stay well within the rate limit.
  const events: ParsedActivity[] = [];
  // Sequential by design — rate-limit RPC calls
  for (const sig of signatures) {
    let tx: Awaited<ReturnType<typeof connection.getTransaction>> = null;
    try {
      tx = await connection.getTransaction(sig, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
    } catch {
      continue;
    }

    const logs = tx?.meta?.logMessages;
    if (!logs) continue;

    const parsed = Array.from(parser.parseLogs(logs));
    for (const [eventIdx, event] of parsed.entries()) {
      if (event.name === "proposalLifecycleEvent") {
        const data = event.data as {
          treasury: PublicKey;
          proposalId: BN;
          proposalDigest: string;
          status: number;
          approved: boolean;
          violation: number;
        };
        events.push({
          signature: `${sig}:${eventIdx}`,
          txSignature: sig,
          treasury: data.treasury.toBase58(),
          proposalId: data.proposalId.toString(),
          proposalDigest: data.proposalDigest,
          kind: "proposal",
          status: data.status,
          approved: data.approved,
          violation: data.violation,
          timestamp: tx?.blockTime ?? undefined,
        });
      }
      if (event.name === "executionLifecycleEvent") {
        const data = event.data as {
          treasury: PublicKey;
          proposalId: BN;
          proposalDigest: string;
          finalStatus: number;
          approved: boolean;
          violation: number;
          messageApprovalId: string | null;
          messageApprovalAccount: string | null;
          decryptionRequestId: string | null;
          decryptionRequestAccount: string | null;
        };
        events.push({
          signature: `${sig}:${eventIdx}`,
          txSignature: sig,
          treasury: data.treasury.toBase58(),
          proposalId: data.proposalId.toString(),
          proposalDigest: data.proposalDigest,
          kind: "execution",
          status: data.finalStatus,
          approved: data.approved,
          violation: data.violation,
          messageApprovalAccount: data.messageApprovalAccount ?? undefined,
          decryptionRequestAccount: data.decryptionRequestAccount ?? undefined,
          timestamp: tx?.blockTime ?? undefined,
        });
      }
      if (event.name === "treasuryAuditEvent") {
        const data = event.data as {
          treasury: PublicKey;
          kind: string;
          detail: string;
          timestamp: BN;
        };
        events.push({
          signature: `${sig}:${eventIdx}`,
          txSignature: sig,
          treasury: data.treasury.toBase58(),
          kind: "audit",
          detail: `${data.kind}: ${data.detail}`,
          timestamp: Number(data.timestamp.toString()),
        });
      }
    }

    // Small pause between fetches to stay within public RPC rate limits.
    // This is a no-op when a custom RPC URL is configured (Helius etc.)
    // but prevents 429s on api.devnet.solana.com.
    await new Promise((r) => setTimeout(r, 150));
  }

  return events
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, limit);
}

export async function sendWalletInstructions(
  connection: Connection,
  wallet: WalletContextState,
  instructions: TransactionInstruction[],
  options: { computeUnitLimit?: number } = {},
) {
  if (!wallet.publicKey) {
    throw new Error("Connect a wallet first.");
  }
  const tx = new Transaction().add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
    ComputeBudgetProgram.setComputeUnitLimit({
      units: options.computeUnitLimit ?? 600_000,
    }),
    ...instructions,
  );
  tx.feePayer = wallet.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  try {
    const signature = await wallet.sendTransaction(tx, connection, {
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    return signature;
  } catch (err: unknown) {
    // Try to extract simulation logs from SendTransactionError
    if (err && typeof err === "object" && "getLogs" in err) {
      try {
        const logs: string[] = await (
          err as { getLogs: () => Promise<string[]> }
        ).getLogs();
        const message =
          err instanceof Error ? err.message : "Transaction failed";
        const enriched = new Error(message) as Error & { logs: string[] };
        enriched.logs = logs;
        throw enriched;
      } catch (logErr) {
        // If getLogs itself fails, just rethrow the original
        if ((logErr as Error & { logs?: string[] }).logs) throw logErr;
      }
    }
    throw err;
  }
}

export function deserializeInstruction(input: {
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  dataBase64: string;
}) {
  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: input.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: Buffer.from(input.dataBase64, "base64"),
  });
}

export function formatChain(code: number) {
  return (
    CHAINS.find((item) => item.code === code)?.label ?? `Unknown (${code})`
  );
}

export function formatTxType(code: number) {
  return (
    TX_TYPES.find((item) => item.code === code)?.label ?? `Unknown (${code})`
  );
}

export function formatProposalStatus(code: number) {
  return PROPOSAL_STATUSES[code] ?? `Unknown (${code})`;
}

export function formatViolation(code: number) {
  return VIOLATIONS[code] ?? `Unknown (${code})`;
}

export function getActivePendingProposal(
  account: TreasuryAccountRecord | undefined,
): PendingProposalRecord | null {
  return account?.pendingQueue[0] ?? null;
}

export function buildCreateTreasuryArgs(input: {
  agentId: string;
  aiAuthority: PublicKey;
  dailyLimitUsd: number;
  perTxLimitUsd: number;
  daytimeHourlyLimitUsd?: number;
  nighttimeHourlyLimitUsd?: number;
  velocityLimitUsd?: number;
  maxSlippageBps?: number;
  maxQuoteAgeSecs?: number;
  maxCounterpartyRiskScore?: number;
  bitcoinManualReviewThresholdUsd?: number;
  pendingTransactionTtlSecs?: number;
}): CreateTreasuryArgs {
  validateAgentId(input.agentId);
  validateAmountUsd(input.dailyLimitUsd);
  validateAmountUsd(input.perTxLimitUsd);

  return {
    agentId: input.agentId,
    aiAuthority: input.aiAuthority,
    createdAt: new BN(Math.floor(Date.now() / 1000)),
    pendingTransactionTtlSecs: new BN(input.pendingTransactionTtlSecs ?? 900),
    policyConfig: {
      dailyLimitUsd: new BN(input.dailyLimitUsd),
      perTxLimitUsd: new BN(input.perTxLimitUsd),
      daytimeHourlyLimitUsd: new BN(
        input.daytimeHourlyLimitUsd ?? Math.floor(input.dailyLimitUsd / 10),
      ),
      nighttimeHourlyLimitUsd: new BN(
        input.nighttimeHourlyLimitUsd ?? Math.floor(input.dailyLimitUsd / 20),
      ),
      velocityLimitUsd: new BN(
        input.velocityLimitUsd ?? Math.floor(input.dailyLimitUsd / 2),
      ),
      allowedProtocolBitmap: new BN(31),
      maxSlippageBps: new BN(input.maxSlippageBps ?? 100),
      maxQuoteAgeSecs: new BN(input.maxQuoteAgeSecs ?? 300),
      maxCounterpartyRiskScore: input.maxCounterpartyRiskScore ?? 70,
      bitcoinManualReviewThresholdUsd: new BN(
        input.bitcoinManualReviewThresholdUsd ?? 5_000,
      ),
      sharedPoolLimitUsd: null,
      weeklyLimitUsd: null,
      monthlyLimitUsd: null,
      recipientLimits: [],
      cooldownConfig: null,
      anomalyConfig: null,
      reputationPolicy: {
        highScoreThreshold: new BN(80),
        mediumScoreThreshold: new BN(50),
        highMultiplierBps: new BN(15_000),
        lowMultiplierBps: new BN(7_000),
      },
      budgetEnvelopes: [],
      approvalLadder: null,
      scopedPauseEntries: [],
      livenessConfig: {
        requireEncryptFreshness: false,
        requireDwalletFreshness: false,
        requireBalanceOracleFreshness: false,
        requireComplianceOracleFreshness: false,
        maxStalenessSecs: new BN(300),
      },
    },
    protocolFees: {
      treasuryCreationFeeUsd: new BN(100),
      transactionFeeBps: new BN(10),
      fheSubsidyBps: new BN(5_000),
    },
  };
}

export function buildProposeTransactionArgs(input: {
  amountUsd: number;
  chain: number;
  txType: number;
  recipient: string;
  protocolId?: number;
  expectedOutputUsd?: number;
  actualOutputUsd?: number;
  quoteAgeSecs?: number;
  counterpartyRiskScore?: number;
}): ProposeTransactionArgs {
  validateAmountUsd(input.amountUsd);
  validateAddress(input.recipient);

  return {
    amountUsd: new BN(input.amountUsd),
    targetChain: input.chain,
    txType: input.txType,
    protocolId: input.protocolId ?? null,
    currentTimestamp: new BN(Math.floor(Date.now() / 1000)),
    expectedOutputUsd:
      input.expectedOutputUsd !== undefined
        ? new BN(input.expectedOutputUsd)
        : null,
    actualOutputUsd:
      input.actualOutputUsd !== undefined
        ? new BN(input.actualOutputUsd)
        : null,
    quoteAgeSecs:
      input.quoteAgeSecs !== undefined ? new BN(input.quoteAgeSecs) : null,
    counterpartyRiskScore: input.counterpartyRiskScore ?? null,
    recipientOrContract: input.recipient,
    sanctionsProof: [],
  };
}

export function buildRegisterDwalletArgs(input: {
  chain: number;
  dwalletId: string;
  address: string;
  balanceUsd: number;
  dwalletAccount?: PublicKey | null;
  authorizedUserPubkey?: PublicKey | null;
  messageMetadataDigest?: string | null;
  publicKeyHex?: string | null;
}): RegisterDwalletArgs {
  validateDwalletId(input.dwalletId);
  validateAddress(input.address);
  validateAmountUsd(input.balanceUsd);

  return {
    chain: input.chain,
    dwalletId: input.dwalletId,
    address: input.address,
    balanceUsd: new BN(input.balanceUsd),
    dwalletAccount: input.dwalletAccount ?? null,
    authorizedUserPubkey: input.authorizedUserPubkey ?? null,
    messageMetadataDigest: input.messageMetadataDigest ?? null,
    publicKeyHex: input.publicKeyHex ?? null,
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  };
}

export function buildConfigureMultisigArgs(input: {
  requiredSignatures: number;
  guardians: PublicKey[];
}): ConfigureMultisigArgs {
  validateGuardians(input.guardians);
  validateMultisigThreshold(input.requiredSignatures, input.guardians.length);
  return {
    requiredSignatures: input.requiredSignatures,
    guardians: input.guardians,
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  };
}

export function buildConfigureSwarmArgs(input: {
  swarmId: string;
  memberAgents: string[];
  sharedPoolLimitUsd: number;
}): ConfigureSwarmArgs {
  validateAgentId(input.swarmId);
  validateSwarmMembers(input.memberAgents);
  validateAmountUsd(input.sharedPoolLimitUsd);
  return {
    swarmId: input.swarmId,
    memberAgents: input.memberAgents,
    sharedPoolLimitUsd: new BN(input.sharedPoolLimitUsd),
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  };
}

export function parsePublicKey(input: string) {
  return new PublicKey(input.trim());
}

export function bigNumberToNumber(
  value: BN | bigint | number | null | undefined,
) {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return Number(value.toString());
}

// ── Backend activity event → ParsedActivity mapping ──────────────────────────

export interface ActivityEvent {
  id: number;
  treasuryAddress: string;
  agentKeypairId: number | null;
  walletAddress: string | null;
  kind: string;
  txSignature: string;
  proposalId: string | null;
  status: number | null;
  approved: boolean | null;
  violation: number | null;
  meta: Record<string, unknown> | null;
  timestamp: number;
}

/**
 * Maps raw backend ActivityEvent[] to ParsedActivity[] — the canonical shape
 * used by ActivityFeed, AuditTrail, and the activity page.
 */
export function mapBackendEvents(events: ActivityEvent[]): ParsedActivity[] {
  return events.map((ev) => {
    const meta = ev.meta ?? {};

    let detail: string | undefined;
    switch (ev.kind) {
      case "treasury_created":
        detail = `treasury_created:agentId=${meta.agentId ?? ""},publicKey=${meta.agentPublicKey ?? ""}`;
        break;
      case "guardrails_configured":
        detail = `confidential_guardrails_configured:FHE guardrails configured — daily, per-tx, and spent-today ciphertexts set,daily=${meta.dailyLimitCiphertext ?? ""},perTx=${meta.perTxLimitCiphertext ?? ""},spent=${meta.spentTodayCiphertext ?? ""}`;
        break;
      case "dwallet_registered": {
        const chainCode =
          meta.chain !== undefined ? Number(meta.chain) : undefined;
        const chainName =
          chainCode !== undefined
            ? (CHAINS.find((c) => c.code === chainCode)?.label ??
              `Chain ${chainCode}`)
            : "Unknown";
        detail = `dwallet_registered:${chainName} dWallet registered — address: ${meta.address ?? "unknown"},chain=${meta.chain ?? ""},address=${meta.address ?? ""},account=${meta.dwalletAccount ?? ""}`;
        break;
      }
      case "execution_paused":
        detail = "execution_paused:Execution paused by treasury owner";
        break;
      case "execution_resumed":
        detail = "execution_resumed:Execution resumed by treasury owner";
        break;
      case "proposal_cancelled":
        detail = "proposal_cancelled:Proposal cancelled by treasury owner";
        break;
      case "proposal_submitted": {
        const chainCode =
          meta.chain !== undefined ? Number(meta.chain) : undefined;
        const chainName =
          chainCode !== undefined
            ? (CHAINS.find((c) => c.code === chainCode)?.label ??
              `Chain ${chainCode}`)
            : "Unknown";
        detail = `proposal_submitted:${chainName} transfer of $${(((meta.amountUsd as number) ?? 0) / 100).toFixed(2)} to ${String(meta.recipient ?? "").slice(0, 8)}...`;
        break;
      }
      case "confidential_proposal_submitted": {
        const chainCode =
          meta.chain !== undefined ? Number(meta.chain) : undefined;
        const chainName =
          chainCode !== undefined
            ? (CHAINS.find((c) => c.code === chainCode)?.label ??
              `Chain ${chainCode}`)
            : "Unknown";
        detail = `proposal_submitted:${chainName} confidential transfer of $${(((meta.amountUsd as number) ?? 0) / 100).toFixed(2)} to ${String(meta.recipient ?? "").slice(0, 8)}...`;
        break;
      }
      case "execution_submitted":
        detail =
          "execution_submitted:Execution submitted — awaiting Ika dWallet signature";
        break;
      case "execution_finalized":
        detail =
          "execution_finalized:Execution finalized — proposal completed on-chain";
        break;
      case "decryption_requested":
        detail = `decryption_requested:Policy output ciphertext submitted for decryption via Ika Encrypt|ciphertext=${meta.ciphertext ?? ""},requestAccount=${meta.requestAccount ?? ""},txSignature=${ev.txSignature}`;
        break;
      case "decryption_confirmed":
        detail = `decryption_verified:Policy decryption confirmed — violation code resolved on-chain|requestAccount=${meta.requestAccount ?? ""},violationCode=${meta.violationCode ?? ""},txSignature=${ev.txSignature}`;
        break;
      default:
        detail =
          ev.kind !== "proposal_submitted" &&
          ev.kind !== "confidential_proposal_submitted"
            ? `${ev.kind}: ${JSON.stringify(meta)}`
            : undefined;
    }

    return {
      signature: `${ev.txSignature}:${ev.id}`,
      txSignature: ev.txSignature,
      treasury: ev.treasuryAddress,
      proposalId: ev.proposalId ?? undefined,
      proposalDigest: (meta.proposalDigest as string) ?? undefined,
      kind:
        (ev.kind === "proposal_submitted" ||
          ev.kind === "confidential_proposal_submitted" ||
          ev.kind === "decryption_requested" ||
          ev.kind === "decryption_confirmed") &&
        ev.proposalId
          ? "proposal"
          : (ev.kind === "execution_submitted" ||
                ev.kind === "execution_finalized") &&
              ev.proposalId
            ? "execution"
            : "audit",
      status: ev.status ?? undefined,
      approved: ev.approved ?? undefined,
      violation: ev.violation ?? undefined,
      detail,
      timestamp: ev.timestamp,
      messageApprovalAccount: (meta.messageApproval as string) ?? undefined,
      decryptionRequestAccount: (meta.requestAccount as string) ?? undefined,
    };
  });
}

// ── Grouped audit-trail view ──────────────────────────────────────────────────

// Proposal lifecycle event kind prefixes that belong inside a proposal group
// and should not appear as standalone audit rows.
const PROPOSAL_LIFECYCLE_KINDS = new Set([
  "execution_submitted",
  "execution_finalized",
  "proposal_submitted",
  "confidential_proposal_submitted",
  "decryption_requested",
  "decryption_verified",
  "proposal_cancelled",
]);

export interface AuditTrailItem {
  signature: string;
  txSignature: string;
  treasury: string;
  timestamp: number;
  kind: "proposal" | "audit";
  // proposal fields
  proposalId?: string;
  outcome?: "approved" | "denied" | "cancelled" | "pending";
  violation?: number;
  isConfidential?: boolean;
  // audit fields
  detail?: string;
}

/**
 * Groups ParsedActivity[] into one item per proposal (merging all lifecycle
 * events for the same proposalId) plus standalone audit rows.
 * Orphaned proposal-lifecycle events without a proposalId are silently dropped
 * because they are already captured by the proposal group's outcome.
 */
export function groupEventsForAuditTrail(events: ParsedActivity[]): AuditTrailItem[] {
  const byProposal = new Map<string, ParsedActivity[]>();
  const auditItems: AuditTrailItem[] = [];

  for (const ev of events) {
    if (ev.proposalId && (ev.kind === "proposal" || ev.kind === "execution")) {
      const key = `${ev.treasury}:${ev.proposalId}`;
      if (!byProposal.has(key)) byProposal.set(key, []);
      byProposal.get(key)?.push(ev);
    } else if (ev.kind === "audit") {
      const rawKind = ev.detail?.split(":")[0]?.trim() ?? "";
      if (PROPOSAL_LIFECYCLE_KINDS.has(rawKind)) continue;
      auditItems.push({
        signature: ev.signature,
        txSignature: ev.txSignature,
        treasury: ev.treasury,
        timestamp: ev.timestamp ?? 0,
        kind: "audit",
        detail: ev.detail,
      });
    }
  }

  const proposalItems: AuditTrailItem[] = [];

  for (const [, group] of byProposal) {
    const sorted = [...group].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const outcome: AuditTrailItem["outcome"] =
      sorted.some((e) => e.approved === true)
        ? "approved"
        : sorted.some((e) => e.status === 5 || e.status === 6)
          ? "cancelled"
          : sorted.some((e) => e.approved === false)
            ? "denied"
            : last.status === 5
              ? "cancelled"
              : "pending";

    const violation =
      sorted.find((e) => e.violation != null && (e.violation as number) > 0)
        ?.violation ?? undefined;

    const isConfidential = sorted.some((e) => e.detail?.includes("confidential"));

    proposalItems.push({
      signature: first.signature,
      txSignature: first.txSignature,
      treasury: first.treasury,
      timestamp: last.timestamp ?? first.timestamp ?? 0,
      kind: "proposal",
      proposalId: first.proposalId,
      outcome,
      violation,
      isConfidential,
    });
  }

  return [...proposalItems, ...auditItems].sort((a, b) => b.timestamp - a.timestamp);
}
