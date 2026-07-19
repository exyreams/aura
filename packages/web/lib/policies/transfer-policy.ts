import {
  AuraClient,
  accounts,
  type PolicyConfigRecord,
} from "@aura-protocol/sdk-ts";
import { Connection, PublicKey } from "@solana/web3.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadTreasuryPolicySnapshot,
  type PolicyCluster,
} from "@/lib/policies/policy-snapshot-cache";
import { policyConfigRecordToJson } from "@/lib/policies/policy-template-config";
import type {
  AgentSessionRow,
  Database,
  Json,
  WalletRegistryRow,
} from "@/lib/supabase/types";

export const TRANSFER_POLICY_EVALUATION_VERSION =
  "aura.transfer_policy.onchain_enforcement.v1";

export type TransferPolicyDecision = "allow" | "review" | "block";
export type TransferPolicyStatus =
  | "passed"
  | "blocked"
  | "onchain_review"
  | "treasury_missing"
  | "amount_usd_unavailable"
  | "policy_unavailable";
export type TransferPolicyAmountUsdSource =
  | "request"
  | "dwallet_asset"
  | "unavailable";

export interface TransferPolicyReason {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  policyId?: string;
  policyName?: string;
  rule?: string;
  expected?: string;
  actual?: string;
}

export interface TransferPolicyRecord {
  id: string;
  name: string;
  bindingId: string;
  enforcementMode: "onchain";
  treasuryPda: string | null;
  policyVersion: number | null;
}

export interface TransferPolicyTransferInput {
  assetKind: "native" | "token";
  assetSymbol: string;
  rawAmount: string;
  amountUi: string;
  decimals: number;
  recipientAddress: string;
  tokenMint: string | null;
  expiresInMinutes: number;
  amountUsd?: string | null;
  chainCode?: number | null;
  txType?: number | null;
  protocolId?: number | null;
  expectedOutputUsd?: string | null;
  actualOutputUsd?: string | null;
  quoteAgeSecs?: number | null;
  counterpartyRiskScore?: number | null;
}

export interface TransferPolicyEvaluationInput {
  ownerId: string;
  wallet: WalletRegistryRow;
  agent: AgentSessionRow;
  transfer: TransferPolicyTransferInput;
  admin?: SupabaseClient<Database>;
  cluster?: PolicyCluster;
  connection?: Connection;
  programId?: PublicKey;
}

export interface TransferPolicyEvaluation {
  version: typeof TRANSFER_POLICY_EVALUATION_VERSION;
  decision: TransferPolicyDecision;
  status: TransferPolicyStatus;
  matchedPolicyCount: number;
  enforcedPolicyCount: number;
  reviewPolicyCount: number;
  effectiveExpiryMinutes: number;
  amountUsd: string | null;
  amountUsdSource: TransferPolicyAmountUsdSource;
  amountUsdAssetId: string | null;
  reasons: TransferPolicyReason[];
  matchedPolicies: Array<{
    id: string;
    name: string;
    enforcementMode: TransferPolicyRecord["enforcementMode"];
    bindingId: string;
  }>;
  source: {
    kind: "aura_program";
    owner_id: string;
    treasury_pda: string | null;
    program_id: string;
    policy_version: number | null;
    policy_config: Json | null;
    cache?: {
      kind: "supabase_treasury_policy_snapshot";
      status: "active" | "stale";
      last_synced_at: string;
      last_tx_signature: string | null;
      last_tx_slot: number | null;
      template_pda: string | null;
      template_id: string | null;
      template_name: string | null;
    };
  };
}

type TreasuryAccount = NonNullable<
  Awaited<ReturnType<typeof accounts.fetchTreasuryAccountNullable>>
>;
type DWalletAccount = NonNullable<
  Awaited<ReturnType<typeof accounts.fetchDWalletAccountNullable>>
>;

interface DerivedAmountUsd {
  value: bigint | null;
  source: TransferPolicyAmountUsdSource;
  assetId: string | null;
  reasons: TransferPolicyReason[];
}

interface NormalizedPolicyState {
  spentTodayUsd: bigint;
  hourlySpentUsd: bigint;
  recentAmounts: bigint[];
  dailyBuckets: bigint[];
  thirtyDaySpentUsd: bigint;
  recipientSpend: Array<{
    chainCode: number;
    addressHash: number[];
    spentTodayUsd: bigint;
  }>;
}

const DEFAULT_AURA_PROGRAM_ID = "auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce";
const SOLANA_CHAIN_CODE = 2;
const TRANSFER_TX_TYPE_CODE = 0;
const DAY_SECS = 86_400;
const HOUR_SECS = 3_600;
const THIRTY_DAYS_SECS = 30 * DAY_SECS;
const MAX_RECENT_AMOUNTS = 10;
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const BIGINT_TWO = BigInt(2);
const BIGINT_BYTE_MASK = BigInt(255);
const BPS_SCALE = BigInt(10_000);
const FNV_64_OFFSET_BASIS = BigInt("14695981039346656037");
const FNV_64_PRIME = BigInt("1099511628211");

function resolveProgramId(programId?: PublicKey) {
  if (programId) {
    return programId;
  }

  const configured = process.env.NEXT_PUBLIC_AURA_PROGRAM_ID?.trim();
  if (configured) {
    return new PublicKey(configured);
  }

  return new PublicKey(DEFAULT_AURA_PROGRAM_ID);
}

function resolveRpcUrl() {
  const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
  if (configured) {
    return configured;
  }

  return "https://api.devnet.solana.com";
}

function resolveCluster(cluster?: PolicyCluster): PolicyCluster {
  if (cluster) {
    return cluster;
  }

  return process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() === "mainnet-beta"
    ? "mainnet-beta"
    : "devnet";
}

function reason(
  code: string,
  message: string,
  severity: TransferPolicyReason["severity"] = "info",
  details: Omit<TransferPolicyReason, "code" | "message" | "severity"> = {},
): TransferPolicyReason {
  return {
    code,
    severity,
    message,
    ...details,
  };
}

function transferPolicyName(wallet: WalletRegistryRow, version: number | null) {
  const label = wallet.label?.trim() || wallet.chain_name;
  return `${label} policy${version ? ` v${version}` : ""}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toBigIntValue(value: unknown): bigint | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? BigInt(value) : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^-?\d+$/u.test(trimmed) ? BigInt(trimmed) : null;
  }

  if (typeof value === "object") {
    const stringifyValue = (value as { toString?: unknown }).toString;
    if (typeof stringifyValue === "function") {
      const text = stringifyValue.call(value, 10);
      if (typeof text === "string" && /^-?\d+$/u.test(text)) {
        return BigInt(text);
      }
    }
  }

  return null;
}

function toNonnegativeBigInt(value: unknown): bigint | null {
  const parsed = toBigIntValue(value);
  return parsed !== null && parsed >= BIGINT_ZERO ? parsed : null;
}

function toPositiveBigInt(value: unknown): bigint | null {
  const parsed = toNonnegativeBigInt(value);
  return parsed !== null && parsed > BIGINT_ZERO ? parsed : null;
}

function toIntegerNumber(value: unknown): number | null {
  const parsed = toBigIntValue(value);
  if (
    parsed === null ||
    parsed < BigInt(Number.MIN_SAFE_INTEGER) ||
    parsed > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return null;
  }

  return Number(parsed);
}

function toOptionalU8(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = toIntegerNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 255 ? parsed : null;
}

function ceilDiv(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - BIGINT_ONE) / denominator;
}

function describeUsd(value: bigint) {
  return `$${value.toLocaleString("en-US")}`;
}

function addStringCandidate(
  candidates: Set<string>,
  value: string | null | undefined,
) {
  const trimmed = value?.trim();
  if (trimmed) {
    candidates.add(trimmed.toLowerCase());
  }
}

function findDWalletAsset(
  dwallet: DWalletAccount,
  transfer: TransferPolicyTransferInput,
) {
  const walletRecord = asRecord(dwallet);
  const assets = walletRecord?.assets;
  if (!Array.isArray(assets)) {
    return null;
  }

  const exactCandidates = new Set<string>();
  if (transfer.tokenMint?.trim()) {
    exactCandidates.add(transfer.tokenMint.trim());
  }

  const normalizedCandidates = new Set<string>();
  addStringCandidate(normalizedCandidates, transfer.assetSymbol);
  if (transfer.assetKind === "native") {
    normalizedCandidates.add("sol");
  }

  return (
    assets.find((asset) => {
      const record = asRecord(asset);
      const assetId = typeof record?.assetId === "string" ? record.assetId : "";
      const symbol = typeof record?.symbol === "string" ? record.symbol : "";
      return (
        exactCandidates.has(assetId) ||
        normalizedCandidates.has(assetId.trim().toLowerCase()) ||
        normalizedCandidates.has(symbol.trim().toLowerCase())
      );
    }) ?? null
  );
}

function deriveAmountUsd(input: {
  transfer: TransferPolicyTransferInput;
  dwallet: DWalletAccount | null;
}): DerivedAmountUsd {
  const requestAmountUsd = toPositiveBigInt(input.transfer.amountUsd);
  if (requestAmountUsd !== null) {
    return {
      value: requestAmountUsd,
      source: "request",
      assetId: null,
      reasons: [
        reason(
          "amount_usd_provided",
          `The request supplied a trusted USD policy amount of ${describeUsd(requestAmountUsd)}.`,
          "info",
          {
            rule: "transaction.amount_usd",
            actual: requestAmountUsd.toString(),
          },
        ),
      ],
    };
  }

  if (!input.dwallet) {
    return {
      value: null,
      source: "unavailable",
      assetId: null,
      reasons: [
        reason(
          "dwallet_asset_state_missing",
          "The dWallet state account was unavailable, so the transfer amount could not be converted to USD.",
          "warning",
          { rule: "dwallet.assets" },
        ),
      ],
    };
  }

  const rawAmount = toPositiveBigInt(input.transfer.rawAmount);
  const asset = findDWalletAsset(input.dwallet, input.transfer);
  const assetRecord = asRecord(asset);
  const nativeAmount = toPositiveBigInt(assetRecord?.nativeAmount);
  const usdValue = toPositiveBigInt(assetRecord?.usdValue);

  if (!rawAmount || !assetRecord || !nativeAmount || !usdValue) {
    return {
      value: null,
      source: "unavailable",
      assetId:
        typeof assetRecord?.assetId === "string" ? assetRecord.assetId : null,
      reasons: [
        reason(
          "asset_valuation_unavailable",
          "No matching dWallet asset valuation was found for this transfer.",
          "warning",
          {
            rule: "dwallet.assets.native_amount.usd_value",
            expected: input.transfer.tokenMint ?? input.transfer.assetSymbol,
            actual: assetRecord
              ? `${String(assetRecord.nativeAmount)} native / ${String(assetRecord.usdValue)} USD`
              : "missing asset row",
          },
        ),
      ],
    };
  }

  const amountUsd = ceilDiv(rawAmount * usdValue, nativeAmount);
  const assetId =
    typeof assetRecord.assetId === "string" ? assetRecord.assetId : null;

  return {
    value: amountUsd,
    source: "dwallet_asset",
    assetId,
    reasons: [
      reason(
        "amount_usd_derived_from_dwallet_asset",
        `The transfer was valued at ${describeUsd(amountUsd)} from the dWallet asset ledger.`,
        "info",
        {
          rule: "dwallet.assets.native_amount.usd_value",
          expected: `${rawAmount.toString()} raw units`,
          actual: `${usdValue.toString()} USD / ${nativeAmount.toString()} raw units`,
        },
      ),
    ],
  };
}

function currentHourUtc(nowSeconds: number) {
  const normalized = ((nowSeconds % DAY_SECS) + DAY_SECS) % DAY_SECS;
  return Math.floor(normalized / HOUR_SECS);
}

function activeHourlyLimitUsd(config: PolicyConfigRecord, nowSeconds: number) {
  const hour = currentHourUtc(nowSeconds);
  return hour >= 22 || hour <= 6
    ? toNonnegativeBigInt(config.nighttimeHourlyLimitUsd)
    : toNonnegativeBigInt(config.daytimeHourlyLimitUsd);
}

function normalizePolicyState(
  policyState: unknown,
  nowSeconds: number,
): NormalizedPolicyState {
  const record = asRecord(policyState) ?? {};
  let spentTodayUsd = toNonnegativeBigInt(record.spentTodayUsd) ?? BIGINT_ZERO;
  let hourlySpentUsd =
    toNonnegativeBigInt(record.hourlySpentUsd) ?? BIGINT_ZERO;
  let thirtyDaySpentUsd =
    toNonnegativeBigInt(record.thirtyDaySpentUsd) ?? BIGINT_ZERO;
  let lastResetTimestamp =
    toIntegerNumber(record.lastResetTimestamp) ?? nowSeconds;
  let hourlyBucketStartedAt =
    toIntegerNumber(record.hourlyBucketStartedAt) ?? nowSeconds;
  let sevenDayWindowStartedAt =
    toIntegerNumber(record.sevenDayWindowStartedAt) ?? lastResetTimestamp;
  let thirtyDayWindowStartedAt =
    toIntegerNumber(record.thirtyDayWindowStartedAt) ?? nowSeconds;
  let dailyBucketHead = toIntegerNumber(record.dailyBucketHead) ?? 0;

  const dailyBucketsSource = Array.isArray(record.dailyBuckets)
    ? record.dailyBuckets
    : [];
  const dailyBuckets = Array.from({ length: 7 }, (_, index) => {
    return toNonnegativeBigInt(dailyBucketsSource[index]) ?? BIGINT_ZERO;
  });
  dailyBucketHead = Math.max(0, Math.min(6, dailyBucketHead));

  if (lastResetTimestamp === 0) {
    lastResetTimestamp = nowSeconds;
  }
  if (sevenDayWindowStartedAt === 0) {
    sevenDayWindowStartedAt = lastResetTimestamp;
  }
  if (thirtyDayWindowStartedAt === 0) {
    thirtyDayWindowStartedAt = nowSeconds;
  }
  if (hourlyBucketStartedAt === 0) {
    hourlyBucketStartedAt = nowSeconds;
  }

  const elapsedDays = Math.floor(
    Math.max(0, nowSeconds - lastResetTimestamp) / DAY_SECS,
  );
  if (elapsedDays > 0) {
    spentTodayUsd = BIGINT_ZERO;
    lastResetTimestamp = nowSeconds;
    for (let index = 0; index < Math.min(elapsedDays, 7); index += 1) {
      dailyBucketHead = (dailyBucketHead + 1) % 7;
      dailyBuckets[dailyBucketHead] = BIGINT_ZERO;
      sevenDayWindowStartedAt = nowSeconds;
    }
  }

  if (nowSeconds - thirtyDayWindowStartedAt >= THIRTY_DAYS_SECS) {
    thirtyDaySpentUsd = BIGINT_ZERO;
    thirtyDayWindowStartedAt = nowSeconds;
  }

  if (nowSeconds - hourlyBucketStartedAt >= HOUR_SECS) {
    hourlySpentUsd = BIGINT_ZERO;
    hourlyBucketStartedAt = nowSeconds;
  }

  const recentAmounts = Array.isArray(record.recentAmounts)
    ? record.recentAmounts
        .map((value) => toNonnegativeBigInt(value))
        .filter((value): value is bigint => value !== null)
        .slice(-MAX_RECENT_AMOUNTS)
    : [];

  const recipientSpend = Array.isArray(record.recipientSpend)
    ? record.recipientSpend
        .map((entry) => {
          const entryRecord = asRecord(entry);
          if (!entryRecord) {
            return null;
          }
          const lastResetAt = toIntegerNumber(entryRecord.lastResetAt) ?? 0;
          const spent =
            lastResetAt > 0 && nowSeconds - lastResetAt >= DAY_SECS
              ? BIGINT_ZERO
              : (toNonnegativeBigInt(entryRecord.spentTodayUsd) ?? BIGINT_ZERO);
          const hash = Array.isArray(entryRecord.addressHash)
            ? entryRecord.addressHash
                .map((value) => toIntegerNumber(value))
                .filter((value): value is number => value !== null)
            : [];
          const chainCode = toIntegerNumber(entryRecord.chainCode);
          if (chainCode === null || hash.length !== 8) {
            return null;
          }
          return {
            chainCode,
            addressHash: hash,
            spentTodayUsd: spent,
          };
        })
        .filter(
          (entry): entry is NormalizedPolicyState["recipientSpend"][number] => {
            return entry !== null;
          },
        )
    : [];

  return {
    spentTodayUsd,
    hourlySpentUsd,
    recentAmounts,
    dailyBuckets,
    thirtyDaySpentUsd,
    recipientSpend,
  };
}

function addressHash(address: string) {
  let hash = FNV_64_OFFSET_BASIS;
  const bytes = new TextEncoder().encode(address);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * FNV_64_PRIME);
  }

  return Array.from({ length: 8 }, (_, index) =>
    Number((hash >> BigInt(index * 8)) & BIGINT_BYTE_MASK),
  );
}

function hashEquals(left: number[], right: number[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function policyVersionFromTreasury(treasury: TreasuryAccount) {
  const parsed = toNonnegativeBigInt(
    (treasury as Record<string, unknown>).currentPolicyVersion,
  );
  return parsed === null ? null : Number(parsed);
}

function effectiveExpiryMinutes(
  transfer: TransferPolicyTransferInput,
  treasury: TreasuryAccount,
) {
  const ttlSecs = toNonnegativeBigInt(
    (treasury as Record<string, unknown>).pendingTransactionTtlSecs,
  );
  if (ttlSecs === null || ttlSecs === BIGINT_ZERO) {
    return transfer.expiresInMinutes;
  }

  const ttlMinutes = Math.max(1, Math.ceil(Number(ttlSecs) / 60));
  return Math.min(transfer.expiresInMinutes, ttlMinutes);
}

function resolveTransferChainCode(
  wallet: WalletRegistryRow,
  transfer: TransferPolicyTransferInput,
) {
  return (
    toOptionalU8(transfer.chainCode) ??
    toOptionalU8(wallet.chain_id) ??
    SOLANA_CHAIN_CODE
  );
}

function resolveTransferTxType(transfer: TransferPolicyTransferInput) {
  return toOptionalU8(transfer.txType) ?? TRANSFER_TX_TYPE_CODE;
}

function resolveTransferProtocolId(transfer: TransferPolicyTransferInput) {
  return toOptionalU8(transfer.protocolId);
}

function protocolAllowed(bitmap: bigint, protocolId: number) {
  if (protocolId < 0 || protocolId >= 64) {
    return false;
  }

  return (bitmap & (BIGINT_ONE << BigInt(protocolId))) !== BIGINT_ZERO;
}

function budgetEnvelopeMatches(input: {
  envelope: unknown;
  chainCode: number;
  txType: number;
  protocolId: number | null;
}) {
  const envelope = asRecord(input.envelope);
  if (!envelope) {
    return null;
  }

  const scopeKind = toOptionalU8(envelope.scopeKind);
  if (scopeKind === 0 && toOptionalU8(envelope.chain) === input.chainCode) {
    return "chain";
  }

  if (scopeKind === 1 && toOptionalU8(envelope.txType) === input.txType) {
    return "category";
  }

  if (
    scopeKind === 2 &&
    input.protocolId !== null &&
    toOptionalU8(envelope.protocolId) === input.protocolId
  ) {
    return "protocol";
  }

  return null;
}

function envelopeSpentToday(
  envelope: Record<string, unknown>,
  nowSeconds: number,
) {
  const currentDay = Math.floor(nowSeconds / DAY_SECS);
  const lastResetDay = toIntegerNumber(envelope.lastResetDay) ?? currentDay;
  return lastResetDay < currentDay
    ? BIGINT_ZERO
    : (toNonnegativeBigInt(envelope.spentTodayUsd) ?? BIGINT_ZERO);
}

function envelopeSpentWeek(
  envelope: Record<string, unknown>,
  nowSeconds: number,
) {
  const currentDay = Math.floor(nowSeconds / DAY_SECS);
  const lastResetDay = toIntegerNumber(envelope.lastResetDay) ?? currentDay;
  return currentDay - lastResetDay >= 7
    ? BIGINT_ZERO
    : (toNonnegativeBigInt(envelope.spentWeekUsd) ?? BIGINT_ZERO);
}

function absDiff(left: bigint, right: bigint) {
  return left >= right ? left - right : right - left;
}

function integerSqrt(value: bigint) {
  if (value === BIGINT_ZERO) {
    return BIGINT_ZERO;
  }

  let x = value;
  let y = (x + BIGINT_ONE) / BIGINT_TWO;
  while (y < x) {
    x = y;
    y = (x + value / x) / BIGINT_TWO;
  }
  return x;
}

function computeStatsInteger(amounts: bigint[]) {
  if (amounts.length === 0) {
    return { mean: BIGINT_ZERO, stdDev: BIGINT_ZERO };
  }

  const count = BigInt(amounts.length);
  const mean =
    amounts.reduce((total, value) => total + value, BIGINT_ZERO) / count;
  const variance = amounts
    .map((value) => {
      const diff = absDiff(value, mean);
      return (diff * diff) / count;
    })
    .reduce((total, value) => total + value, BIGINT_ZERO);

  return { mean, stdDev: integerSqrt(variance) };
}

function zScoreBps(value: bigint, mean: bigint, stdDev: bigint) {
  if (stdDev === BIGINT_ZERO) {
    return BIGINT_ZERO;
  }

  return (absDiff(value, mean) * BPS_SCALE) / stdDev;
}

function scopedPauseMatches(input: {
  entry: unknown;
  nowSeconds: number;
  chainCode: number;
  txType: number;
  protocolId: number | null;
  recipientAddress: string;
}) {
  const entry = asRecord(input.entry);
  if (!entry) {
    return null;
  }

  const expiresAt = toIntegerNumber(entry.expiresAt);
  if (expiresAt !== null && input.nowSeconds >= expiresAt) {
    return null;
  }

  const scopeKind = toIntegerNumber(entry.scopeKind);
  if (scopeKind === null) {
    return null;
  }

  if (scopeKind === 0) {
    return "all transactions";
  }

  if (scopeKind === 1 && toOptionalU8(entry.chain) === input.chainCode) {
    return `chain ${input.chainCode}`;
  }

  if (scopeKind === 2 && toOptionalU8(entry.txType) === input.txType) {
    return `transaction type ${input.txType}`;
  }

  if (
    scopeKind === 3 &&
    typeof entry.recipient === "string" &&
    entry.recipient === input.recipientAddress
  ) {
    return `recipient ${input.recipientAddress}`;
  }

  if (
    scopeKind === 4 &&
    input.protocolId !== null &&
    toOptionalU8(entry.protocolId) === input.protocolId
  ) {
    return `protocol ${input.protocolId}`;
  }

  return null;
}

function addBlock(
  reasons: TransferPolicyReason[],
  code: string,
  message: string,
  details: Omit<TransferPolicyReason, "code" | "message" | "severity">,
) {
  reasons.push(reason(code, message, "error", details));
}

function buildMatchedPolicy(
  wallet: WalletRegistryRow,
  treasuryPda: string,
  policyVersion: number | null,
) {
  return {
    id: treasuryPda,
    name: transferPolicyName(wallet, policyVersion),
    enforcementMode: "onchain" as const,
    bindingId: treasuryPda,
  };
}

function buildSource(input: {
  ownerId: string;
  treasuryPda: string | null;
  programId: string;
  policyVersion: number | null;
  policyConfig: Json | null;
}): TransferPolicyEvaluation["source"] {
  return {
    kind: "aura_program",
    owner_id: input.ownerId,
    treasury_pda: input.treasuryPda,
    program_id: input.programId,
    policy_version: input.policyVersion,
    policy_config: input.policyConfig,
  };
}

function evaluateLiveTreasuryPolicy(input: {
  ownerId: string;
  wallet: WalletRegistryRow;
  transfer: TransferPolicyTransferInput;
  treasuryPda: string;
  programId: string;
  treasury: TreasuryAccount;
  dwallet: DWalletAccount | null;
  dwalletLoadReasons: TransferPolicyReason[];
}): TransferPolicyEvaluation {
  const policyVersion = policyVersionFromTreasury(input.treasury);
  const policyConfig = input.treasury.policyConfig as PolicyConfigRecord;
  const policyConfigJson = policyConfigRecordToJson(policyConfig);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const chainCode = resolveTransferChainCode(input.wallet, input.transfer);
  const txType = resolveTransferTxType(input.transfer);
  const protocolId = resolveTransferProtocolId(input.transfer);
  const effectiveExpiry = effectiveExpiryMinutes(
    input.transfer,
    input.treasury,
  );
  const matchedPolicy = buildMatchedPolicy(
    input.wallet,
    input.treasuryPda,
    policyVersion,
  );
  const amountUsd = deriveAmountUsd({
    transfer: input.transfer,
    dwallet: input.dwallet,
  });
  const state = normalizePolicyState(input.treasury.policyState, nowSeconds);
  const reasons: TransferPolicyReason[] = [
    reason(
      "policy_treasury_loaded",
      "The transfer request was evaluated against the live on-chain treasury policy.",
      "info",
      {
        rule: "treasury.policy_config",
        expected: policyVersion ? `policy v${policyVersion}` : "policy",
        actual: input.treasuryPda,
      },
    ),
    ...input.dwalletLoadReasons,
    ...amountUsd.reasons,
  ];
  const blockReasons: TransferPolicyReason[] = [];

  if ((input.treasury as Record<string, unknown>).executionPaused === true) {
    addBlock(
      blockReasons,
      "execution_paused",
      "The treasury has paused execution.",
      {
        rule: "treasury.execution_paused",
        expected: "false",
        actual: "true",
      },
    );
  }

  const scopedPauseEntries = Array.isArray(policyConfig.scopedPauseEntries)
    ? policyConfig.scopedPauseEntries
    : [];
  for (const entry of scopedPauseEntries) {
    const match = scopedPauseMatches({
      entry,
      nowSeconds,
      chainCode,
      txType,
      protocolId,
      recipientAddress: input.transfer.recipientAddress,
    });
    if (match) {
      addBlock(
        blockReasons,
        "execution_scope_paused",
        "A scoped policy pause matches this transfer.",
        {
          rule: "policy.scoped_pause",
          expected: "no active matching pause",
          actual: match,
        },
      );
    }
  }

  if (blockReasons.length > 0) {
    return {
      version: TRANSFER_POLICY_EVALUATION_VERSION,
      decision: "block",
      status: "blocked",
      matchedPolicyCount: 1,
      enforcedPolicyCount: 1,
      reviewPolicyCount: 0,
      effectiveExpiryMinutes: effectiveExpiry,
      amountUsd: amountUsd.value?.toString() ?? null,
      amountUsdSource: amountUsd.source,
      amountUsdAssetId: amountUsd.assetId,
      reasons: [...reasons, ...blockReasons],
      matchedPolicies: [matchedPolicy],
      source: buildSource({
        ownerId: input.ownerId,
        treasuryPda: input.treasuryPda,
        programId: input.programId,
        policyVersion,
        policyConfig: policyConfigJson,
      }),
    };
  }

  if (amountUsd.value === null) {
    return {
      version: TRANSFER_POLICY_EVALUATION_VERSION,
      decision: "review",
      status: "amount_usd_unavailable",
      matchedPolicyCount: 1,
      enforcedPolicyCount: 1,
      reviewPolicyCount: 1,
      effectiveExpiryMinutes: effectiveExpiry,
      amountUsd: null,
      amountUsdSource: amountUsd.source,
      amountUsdAssetId: amountUsd.assetId,
      reasons: [
        ...reasons,
        reason(
          "amount_usd_required_for_enforcement",
          "Amount-based policy checks require a trusted USD value, so this request must stay in owner review.",
          "warning",
          { rule: "transaction.amount_usd" },
        ),
      ],
      matchedPolicies: [matchedPolicy],
      source: buildSource({
        ownerId: input.ownerId,
        treasuryPda: input.treasuryPda,
        programId: input.programId,
        policyVersion,
        policyConfig: policyConfigJson,
      }),
    };
  }

  const amount = amountUsd.value;
  const dailyLimitUsd = toNonnegativeBigInt(policyConfig.dailyLimitUsd);
  const perTxLimitUsd = toNonnegativeBigInt(policyConfig.perTxLimitUsd);
  const activeHourlyLimit = activeHourlyLimitUsd(policyConfig, nowSeconds);
  const velocityLimitUsd = toNonnegativeBigInt(policyConfig.velocityLimitUsd);
  const allowedProtocolBitmap = toNonnegativeBigInt(
    policyConfig.allowedProtocolBitmap,
  );

  if (
    dailyLimitUsd === null ||
    perTxLimitUsd === null ||
    activeHourlyLimit === null ||
    velocityLimitUsd === null ||
    allowedProtocolBitmap === null
  ) {
    return {
      version: TRANSFER_POLICY_EVALUATION_VERSION,
      decision: "review",
      status: "policy_unavailable",
      matchedPolicyCount: 1,
      enforcedPolicyCount: 1,
      reviewPolicyCount: 1,
      effectiveExpiryMinutes: effectiveExpiry,
      amountUsd: amount.toString(),
      amountUsdSource: amountUsd.source,
      amountUsdAssetId: amountUsd.assetId,
      reasons: [
        ...reasons,
        reason(
          "policy_config_unreadable",
          "The on-chain policy config could not be decoded into numeric limits.",
          "warning",
          { rule: "treasury.policy_config" },
        ),
      ],
      matchedPolicies: [matchedPolicy],
      source: buildSource({
        ownerId: input.ownerId,
        treasuryPda: input.treasuryPda,
        programId: input.programId,
        policyVersion,
        policyConfig: policyConfigJson,
      }),
    };
  }

  const budgetEnvelopes: unknown[] = Array.isArray(policyConfig.budgetEnvelopes)
    ? policyConfig.budgetEnvelopes
    : [];
  for (const envelope of budgetEnvelopes) {
    const matchKind = budgetEnvelopeMatches({
      envelope,
      chainCode,
      txType,
      protocolId,
    });
    const envelopeRecord = asRecord(envelope);
    if (!matchKind || !envelopeRecord) {
      continue;
    }

    const envelopeDailyLimit = toNonnegativeBigInt(
      envelopeRecord.dailyLimitUsd,
    );
    if (envelopeDailyLimit === null) {
      reasons.push(
        reason(
          "budget_envelope_unreadable",
          "A matching budget envelope could not be decoded into numeric limits.",
          "warning",
          { rule: "policy.budget_envelopes" },
        ),
      );
      continue;
    }

    const projectedEnvelopeDaily =
      envelopeSpentToday(envelopeRecord, nowSeconds) + amount;
    if (projectedEnvelopeDaily > envelopeDailyLimit) {
      addBlock(
        blockReasons,
        "budget_envelope_daily_limit",
        "Transfer amount exceeds a matching budget envelope daily limit.",
        {
          rule: `policy.budget_envelopes.${matchKind}.daily_limit_usd`,
          expected: `<= ${describeUsd(envelopeDailyLimit)}`,
          actual: describeUsd(projectedEnvelopeDaily),
        },
      );
    }

    const envelopeWeeklyLimit =
      toNonnegativeBigInt(envelopeRecord.weeklyLimitUsd) ?? BIGINT_ZERO;
    if (envelopeWeeklyLimit > BIGINT_ZERO) {
      const projectedEnvelopeWeekly =
        envelopeSpentWeek(envelopeRecord, nowSeconds) + amount;
      if (projectedEnvelopeWeekly > envelopeWeeklyLimit) {
        addBlock(
          blockReasons,
          "budget_envelope_weekly_limit",
          "Transfer amount exceeds a matching budget envelope weekly limit.",
          {
            rule: `policy.budget_envelopes.${matchKind}.weekly_limit_usd`,
            expected: `<= ${describeUsd(envelopeWeeklyLimit)}`,
            actual: describeUsd(projectedEnvelopeWeekly),
          },
        );
      }
    }
  }

  if (amount > perTxLimitUsd) {
    addBlock(
      blockReasons,
      "per_transaction_limit",
      "Transfer amount exceeds the policy per-transaction limit.",
      {
        rule: "policy.per_tx_limit_usd",
        expected: `<= ${describeUsd(perTxLimitUsd)}`,
        actual: describeUsd(amount),
      },
    );
  }

  const projectedDailySpend = state.spentTodayUsd + amount;
  if (projectedDailySpend > dailyLimitUsd) {
    addBlock(
      blockReasons,
      "daily_limit",
      "Transfer amount exceeds the remaining daily policy budget.",
      {
        rule: "policy.daily_limit_usd",
        expected: `<= ${describeUsd(dailyLimitUsd)}`,
        actual: describeUsd(projectedDailySpend),
      },
    );
  }

  const weeklyLimitUsd = toNonnegativeBigInt(policyConfig.weeklyLimitUsd);
  if (weeklyLimitUsd !== null) {
    const sevenDayTotal = state.dailyBuckets.reduce(
      (total, value) => total + value,
      BIGINT_ZERO,
    );
    const projectedWeeklySpend = sevenDayTotal + amount;
    if (projectedWeeklySpend > weeklyLimitUsd) {
      addBlock(
        blockReasons,
        "weekly_limit",
        "Transfer amount exceeds the rolling seven-day policy budget.",
        {
          rule: "policy.weekly_limit_usd",
          expected: `<= ${describeUsd(weeklyLimitUsd)}`,
          actual: describeUsd(projectedWeeklySpend),
        },
      );
    }
  }

  const monthlyLimitUsd = toNonnegativeBigInt(policyConfig.monthlyLimitUsd);
  if (monthlyLimitUsd !== null) {
    const projectedMonthlySpend = state.thirtyDaySpentUsd + amount;
    if (projectedMonthlySpend > monthlyLimitUsd) {
      addBlock(
        blockReasons,
        "monthly_limit",
        "Transfer amount exceeds the rolling thirty-day policy budget.",
        {
          rule: "policy.monthly_limit_usd",
          expected: `<= ${describeUsd(monthlyLimitUsd)}`,
          actual: describeUsd(projectedMonthlySpend),
        },
      );
    }
  }

  const bitcoinManualReviewThresholdUsd = toNonnegativeBigInt(
    policyConfig.bitcoinManualReviewThresholdUsd,
  );
  if (
    chainCode === 0 &&
    bitcoinManualReviewThresholdUsd !== null &&
    amount > bitcoinManualReviewThresholdUsd
  ) {
    addBlock(
      blockReasons,
      "bitcoin_manual_review",
      "Bitcoin transfer amount exceeds the policy manual-review threshold.",
      {
        rule: "policy.bitcoin_manual_review_threshold_usd",
        expected: `<= ${describeUsd(bitcoinManualReviewThresholdUsd)}`,
        actual: describeUsd(amount),
      },
    );
  }

  const projectedHourlySpend = state.hourlySpentUsd + amount;
  if (projectedHourlySpend > activeHourlyLimit) {
    addBlock(
      blockReasons,
      "time_window_limit",
      "Transfer amount exceeds the active hourly policy budget.",
      {
        rule: "policy.active_hourly_limit_usd",
        expected: `<= ${describeUsd(activeHourlyLimit)}`,
        actual: describeUsd(projectedHourlySpend),
      },
    );
  }

  if (
    protocolId !== null &&
    !protocolAllowed(allowedProtocolBitmap, protocolId)
  ) {
    addBlock(
      blockReasons,
      "protocol_not_allowed",
      "Transfer protocol is not present in the policy protocol bitmap.",
      {
        rule: "policy.allowed_protocol_bitmap",
        expected: `bit ${protocolId} set`,
        actual: allowedProtocolBitmap.toString(),
      },
    );
  }

  const sharedPoolLimitUsd = toNonnegativeBigInt(
    policyConfig.sharedPoolLimitUsd,
  );
  const swarm = asRecord((input.treasury as Record<string, unknown>).swarm);
  const sharedSpentUsd = toNonnegativeBigInt(swarm?.totalSwarmSpentUsd);
  if (sharedPoolLimitUsd !== null && sharedSpentUsd !== null) {
    const projectedSharedSpend = sharedSpentUsd + amount;
    if (projectedSharedSpend > sharedPoolLimitUsd) {
      addBlock(
        blockReasons,
        "shared_pool_limit",
        "Transfer amount exceeds the shared swarm pool budget.",
        {
          rule: "policy.shared_pool_limit_usd",
          expected: `<= ${describeUsd(sharedPoolLimitUsd)}`,
          actual: describeUsd(projectedSharedSpend),
        },
      );
    }
  } else if (sharedPoolLimitUsd !== null) {
    reasons.push(
      reason(
        "shared_pool_state_unavailable",
        "Shared pool policy is configured, but live swarm spend state was unavailable.",
        "warning",
        { rule: "treasury.swarm.total_swarm_spent_usd" },
      ),
    );
  }

  const recipientLimits: unknown[] = Array.isArray(policyConfig.recipientLimits)
    ? policyConfig.recipientLimits
    : [];
  const recipientLimit = recipientLimits.find((entry) => {
    const limit = asRecord(entry);
    return (
      toOptionalU8(limit?.chain) === chainCode &&
      typeof limit?.address === "string" &&
      limit.address === input.transfer.recipientAddress
    );
  });
  const recipientLimitRecord = asRecord(recipientLimit);
  if (recipientLimitRecord) {
    const recipientPerTxLimit = toNonnegativeBigInt(
      recipientLimitRecord.perTxLimitUsd,
    );
    if (recipientPerTxLimit !== null && amount > recipientPerTxLimit) {
      addBlock(
        blockReasons,
        "recipient_per_transaction_limit",
        "Transfer amount exceeds the recipient-specific per-transaction limit.",
        {
          rule: "policy.recipient_limits.per_tx_limit_usd",
          expected: `<= ${describeUsd(recipientPerTxLimit)}`,
          actual: describeUsd(amount),
        },
      );
    }

    const recipientDailyLimit = toNonnegativeBigInt(
      recipientLimitRecord.dailyLimitUsd,
    );
    if (recipientDailyLimit !== null) {
      const recipientHash = addressHash(input.transfer.recipientAddress);
      const spentForRecipient =
        state.recipientSpend.find(
          (entry) =>
            entry.chainCode === chainCode &&
            hashEquals(entry.addressHash, recipientHash),
        )?.spentTodayUsd ?? BIGINT_ZERO;
      const projectedRecipientSpend = spentForRecipient + amount;
      if (projectedRecipientSpend > recipientDailyLimit) {
        addBlock(
          blockReasons,
          "recipient_daily_limit",
          "Transfer amount exceeds the recipient-specific daily limit.",
          {
            rule: "policy.recipient_limits.daily_limit_usd",
            expected: `<= ${describeUsd(recipientDailyLimit)}`,
            actual: describeUsd(projectedRecipientSpend),
          },
        );
      }
    }
  }

  const recentTotal = state.recentAmounts.reduce(
    (total, value) => total + value,
    BIGINT_ZERO,
  );
  const projectedVelocitySpend = recentTotal + amount;
  if (projectedVelocitySpend > velocityLimitUsd) {
    addBlock(
      blockReasons,
      "velocity_limit",
      "Transfer amount exceeds the policy velocity window limit.",
      {
        rule: "policy.velocity_limit_usd",
        expected: `<= ${describeUsd(velocityLimitUsd)}`,
        actual: describeUsd(projectedVelocitySpend),
      },
    );
  }

  const anomalyConfig = asRecord(policyConfig.anomalyConfig);
  if (anomalyConfig?.enabled === true) {
    const anomalyThresholdBps = toNonnegativeBigInt(
      anomalyConfig.zScoreThresholdBps,
    );
    const anomalyMinSampleSize = toIntegerNumber(anomalyConfig.minSampleSize);
    const anomalyAction = toIntegerNumber(anomalyConfig.action);
    if (
      anomalyThresholdBps !== null &&
      anomalyMinSampleSize !== null &&
      state.recentAmounts.length >= anomalyMinSampleSize
    ) {
      const stats = computeStatsInteger(state.recentAmounts);
      const scoreBps = zScoreBps(amount, stats.mean, stats.stdDev);
      if (scoreBps > anomalyThresholdBps && anomalyAction === 0) {
        addBlock(
          blockReasons,
          "anomaly_detected",
          "Transfer amount is an anomalous outlier and the policy anomaly action is deny.",
          {
            rule: "policy.anomaly_config.z_score_threshold_bps",
            expected: `<= ${anomalyThresholdBps.toString()} bps`,
            actual: `${scoreBps.toString()} bps`,
          },
        );
      } else if (scoreBps > anomalyThresholdBps) {
        reasons.push(
          reason(
            "anomaly_flagged",
            "Transfer amount is an anomalous outlier and should remain visible for owner review.",
            "warning",
            {
              rule: "policy.anomaly_config.z_score_threshold_bps",
              expected: `<= ${anomalyThresholdBps.toString()} bps`,
              actual: `${scoreBps.toString()} bps`,
            },
          ),
        );
      }
    }
  }

  const approvalLadder = asRecord(policyConfig.approvalLadder);
  const denyAboveUsd = toNonnegativeBigInt(approvalLadder?.denyAboveUsd);
  if (denyAboveUsd !== null && amount >= denyAboveUsd) {
    addBlock(
      blockReasons,
      "approval_ladder_denied",
      "Transfer amount is at or above the policy approval ladder deny threshold.",
      {
        rule: "policy.approval_ladder.deny_above_usd",
        expected: `< ${describeUsd(denyAboveUsd)}`,
        actual: describeUsd(amount),
      },
    );
  }

  if (blockReasons.length > 0) {
    return {
      version: TRANSFER_POLICY_EVALUATION_VERSION,
      decision: "block",
      status: "blocked",
      matchedPolicyCount: 1,
      enforcedPolicyCount: 1,
      reviewPolicyCount: 0,
      effectiveExpiryMinutes: effectiveExpiry,
      amountUsd: amount.toString(),
      amountUsdSource: amountUsd.source,
      amountUsdAssetId: amountUsd.assetId,
      reasons: [...reasons, ...blockReasons],
      matchedPolicies: [matchedPolicy],
      source: buildSource({
        ownerId: input.ownerId,
        treasuryPda: input.treasuryPda,
        programId: input.programId,
        policyVersion,
        policyConfig: policyConfigJson,
      }),
    };
  }

  return {
    version: TRANSFER_POLICY_EVALUATION_VERSION,
    decision: "allow",
    status: "passed",
    matchedPolicyCount: 1,
    enforcedPolicyCount: 1,
    reviewPolicyCount: 0,
    effectiveExpiryMinutes: effectiveExpiry,
    amountUsd: amount.toString(),
    amountUsdSource: amountUsd.source,
    amountUsdAssetId: amountUsd.assetId,
    reasons: [
      ...reasons,
      reason(
        "policy_transfer_allowed",
        "No enforceable policy rule blocked this transfer request.",
        "info",
        {
          rule: "aura_policy.evaluate_transaction",
          expected: "approved",
          actual: "approved",
        },
      ),
    ],
    matchedPolicies: [matchedPolicy],
    source: buildSource({
      ownerId: input.ownerId,
      treasuryPda: input.treasuryPda,
      programId: input.programId,
      policyVersion,
      policyConfig: policyConfigJson,
    }),
  };
}

function cachedPolicyEvaluation(input: {
  ownerId: string;
  wallet: WalletRegistryRow;
  treasuryPda: string;
  programId: string;
  transfer: TransferPolicyTransferInput;
  snapshot: Awaited<ReturnType<typeof loadTreasuryPolicySnapshot>>;
}): TransferPolicyEvaluation | null {
  if (!input.snapshot) {
    return null;
  }

  const policyVersion = input.snapshot.policy_version ?? null;
  const policyName =
    input.snapshot.template_name ??
    transferPolicyName(input.wallet, policyVersion);

  return {
    version: TRANSFER_POLICY_EVALUATION_VERSION,
    decision: "review",
    status: "onchain_review",
    matchedPolicyCount: 1,
    enforcedPolicyCount: 1,
    reviewPolicyCount: 1,
    effectiveExpiryMinutes: input.transfer.expiresInMinutes,
    amountUsd: null,
    amountUsdSource: "unavailable",
    amountUsdAssetId: null,
    reasons: [
      {
        code: "policy_snapshot_loaded",
        severity: "warning",
        message:
          "The live treasury policy could not be loaded, so this request is only annotated with the cached policy snapshot for owner review.",
        rule: "treasury.policy_config",
        expected: policyVersion ? `policy v${policyVersion}` : "policy",
        actual: input.treasuryPda,
      },
    ],
    matchedPolicies: [
      {
        id: input.treasuryPda,
        name: policyName,
        enforcementMode: "onchain",
        bindingId: input.treasuryPda,
      },
    ],
    source: {
      kind: "aura_program",
      owner_id: input.ownerId,
      treasury_pda: input.treasuryPda,
      program_id: input.programId,
      policy_version: policyVersion,
      policy_config: input.snapshot.policy_config,
      cache: {
        kind: "supabase_treasury_policy_snapshot",
        status: input.snapshot.status,
        last_synced_at: input.snapshot.last_synced_at,
        last_tx_signature: input.snapshot.last_tx_signature,
        last_tx_slot: input.snapshot.last_tx_slot,
        template_pda: input.snapshot.template_pda,
        template_id: input.snapshot.template_id,
        template_name: input.snapshot.template_name,
      },
    },
  };
}

async function loadCachedPolicyFallback(input: {
  ownerId: string;
  wallet: WalletRegistryRow;
  transfer: TransferPolicyTransferInput;
  treasuryPda: string;
  programId: string;
  cluster: PolicyCluster;
  admin?: SupabaseClient<Database>;
}) {
  if (!input.admin) {
    return null;
  }

  try {
    const snapshot = await loadTreasuryPolicySnapshot({
      admin: input.admin,
      ownerId: input.ownerId,
      cluster: input.cluster,
      programId: input.programId,
      treasuryPda: input.treasuryPda,
    });
    return cachedPolicyEvaluation({
      ownerId: input.ownerId,
      wallet: input.wallet,
      treasuryPda: input.treasuryPda,
      programId: input.programId,
      transfer: input.transfer,
      snapshot,
    });
  } catch {
    return null;
  }
}

export async function evaluateTransferPolicies({
  ownerId,
  wallet,
  agent,
  transfer,
  admin,
  cluster,
  connection,
  programId,
}: TransferPolicyEvaluationInput): Promise<TransferPolicyEvaluation> {
  const treasuryPda = wallet.treasury_pda ?? agent.treasury_pda ?? null;
  const resolvedProgramId = resolveProgramId(programId);
  const resolvedProgramIdText = resolvedProgramId.toBase58();
  const resolvedCluster = resolveCluster(cluster);

  if (!treasuryPda) {
    return {
      version: TRANSFER_POLICY_EVALUATION_VERSION,
      decision: "review",
      status: "treasury_missing",
      matchedPolicyCount: 0,
      enforcedPolicyCount: 0,
      reviewPolicyCount: 0,
      effectiveExpiryMinutes: transfer.expiresInMinutes,
      amountUsd: null,
      amountUsdSource: "unavailable",
      amountUsdAssetId: null,
      reasons: [
        reason(
          "policy_treasury_missing",
          "This wallet does not have an on-chain treasury policy linked yet.",
          "warning",
        ),
      ],
      matchedPolicies: [],
      source: buildSource({
        ownerId,
        treasuryPda: null,
        programId: resolvedProgramIdText,
        policyVersion: null,
        policyConfig: null,
      }),
    };
  }

  const resolvedConnection =
    connection ?? new Connection(resolveRpcUrl(), "confirmed");
  const client = new AuraClient({
    connection: resolvedConnection,
    programId: resolvedProgramId,
  });

  try {
    const treasury = await accounts.fetchTreasuryAccountNullable(
      client,
      new PublicKey(treasuryPda),
    );

    if (!treasury) {
      const cached = await loadCachedPolicyFallback({
        ownerId,
        wallet,
        transfer,
        treasuryPda,
        programId: resolvedProgramIdText,
        cluster: resolvedCluster,
        admin,
      });
      if (cached) {
        return cached;
      }

      return {
        version: TRANSFER_POLICY_EVALUATION_VERSION,
        decision: "review",
        status: "policy_unavailable",
        matchedPolicyCount: 0,
        enforcedPolicyCount: 0,
        reviewPolicyCount: 0,
        effectiveExpiryMinutes: transfer.expiresInMinutes,
        amountUsd: null,
        amountUsdSource: "unavailable",
        amountUsdAssetId: null,
        reasons: [
          reason(
            "policy_treasury_unavailable",
            "The linked treasury account could not be loaded from the chain.",
            "warning",
          ),
        ],
        matchedPolicies: [],
        source: buildSource({
          ownerId,
          treasuryPda,
          programId: resolvedProgramIdText,
          policyVersion: null,
          policyConfig: null,
        }),
      };
    }

    let dwallet: DWalletAccount | null = null;
    const dwalletLoadReasons: TransferPolicyReason[] = [];
    if (wallet.dwallet_state_pda) {
      try {
        dwallet = await accounts.fetchDWalletAccountNullable(
          client,
          new PublicKey(wallet.dwallet_state_pda),
        );
        if (!dwallet) {
          dwalletLoadReasons.push(
            reason(
              "dwallet_state_unavailable",
              "The linked dWallet state account could not be loaded from the chain.",
              "warning",
              {
                rule: "wallet.dwallet_state_pda",
                actual: wallet.dwallet_state_pda,
              },
            ),
          );
        }
      } catch (cause) {
        dwalletLoadReasons.push(
          reason(
            "dwallet_state_load_failed",
            cause instanceof Error
              ? cause.message
              : "The dWallet state account could not be loaded.",
            "warning",
            {
              rule: "wallet.dwallet_state_pda",
              actual: wallet.dwallet_state_pda,
            },
          ),
        );
      }
    }

    return evaluateLiveTreasuryPolicy({
      ownerId,
      wallet,
      transfer,
      treasuryPda,
      programId: resolvedProgramIdText,
      treasury,
      dwallet,
      dwalletLoadReasons,
    });
  } catch (cause) {
    const cached = await loadCachedPolicyFallback({
      ownerId,
      wallet,
      transfer,
      treasuryPda,
      programId: resolvedProgramIdText,
      cluster: resolvedCluster,
      admin,
    });
    if (cached) {
      return cached;
    }

    const message =
      cause instanceof Error
        ? cause.message
        : "The on-chain treasury policy could not be loaded.";

    return {
      version: TRANSFER_POLICY_EVALUATION_VERSION,
      decision: "review",
      status: "policy_unavailable",
      matchedPolicyCount: 0,
      enforcedPolicyCount: 0,
      reviewPolicyCount: 0,
      effectiveExpiryMinutes: transfer.expiresInMinutes,
      amountUsd: null,
      amountUsdSource: "unavailable",
      amountUsdAssetId: null,
      reasons: [reason("policy_load_failed", message, "warning")],
      matchedPolicies: [],
      source: buildSource({
        ownerId,
        treasuryPda,
        programId: resolvedProgramIdText,
        policyVersion: null,
        policyConfig: null,
      }),
    };
  }
}

export function transferPolicyDenialMessage(
  evaluation: TransferPolicyEvaluation,
) {
  return (
    evaluation.reasons.find((entry) => entry.severity === "error")?.message ??
    "Transfer request is blocked by policy."
  );
}

export function transferPolicyEvaluationToJson(
  evaluation: TransferPolicyEvaluation,
): Json {
  return {
    version: evaluation.version,
    decision: evaluation.decision,
    status: evaluation.status,
    matched_policy_count: evaluation.matchedPolicyCount,
    enforced_policy_count: evaluation.enforcedPolicyCount,
    review_policy_count: evaluation.reviewPolicyCount,
    effective_expiry_minutes: evaluation.effectiveExpiryMinutes,
    amount_usd: evaluation.amountUsd,
    amount_usd_source: evaluation.amountUsdSource,
    amount_usd_asset_id: evaluation.amountUsdAssetId,
    reasons: evaluation.reasons.map((entry) => ({
      code: entry.code,
      severity: entry.severity,
      message: entry.message,
      policy_id: entry.policyId,
      policy_name: entry.policyName,
      rule: entry.rule,
      expected: entry.expected,
      actual: entry.actual,
    })),
    matched_policies: evaluation.matchedPolicies.map((policy) => ({
      id: policy.id,
      name: policy.name,
      enforcement_mode: policy.enforcementMode,
      binding_id: policy.bindingId,
    })),
    source: evaluation.source,
  };
}
