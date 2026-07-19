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
  "aura.transfer_policy.onchain_review.v1";

export type TransferPolicyDecision = "review";
export type TransferPolicyStatus =
  | "onchain_review"
  | "treasury_missing"
  | "policy_unavailable";

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

const DEFAULT_AURA_PROGRAM_ID = "auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce";

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

function reason(code: string, message: string): TransferPolicyReason {
  return {
    code,
    severity: "info",
    message,
  };
}

function transferPolicyName(wallet: WalletRegistryRow, version: number | null) {
  const label = wallet.label?.trim() || wallet.chain_name;
  return `${label} policy${version ? ` v${version}` : ""}`;
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
    reasons: [
      {
        code: "policy_snapshot_loaded",
        severity: "info",
        message:
          "This transfer request is reviewed against a cached snapshot of the treasury's on-chain policy config.",
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
      reasons: [
        reason(
          "policy_treasury_missing",
          "This wallet does not have an on-chain treasury policy linked yet.",
        ),
      ],
      matchedPolicies: [],
      source: {
        kind: "aura_program",
        owner_id: ownerId,
        treasury_pda: null,
        program_id: resolvedProgramIdText,
        policy_version: null,
        policy_config: null,
      },
    };
  }

  if (admin) {
    try {
      const snapshot = await loadTreasuryPolicySnapshot({
        admin,
        ownerId,
        cluster: resolvedCluster,
        programId: resolvedProgramIdText,
        treasuryPda,
      });
      const evaluation = cachedPolicyEvaluation({
        ownerId,
        wallet,
        treasuryPda,
        programId: resolvedProgramIdText,
        transfer,
        snapshot,
      });

      if (evaluation) {
        return evaluation;
      }
    } catch {
      // Cache read failures should not block owner review; fall back to RPC.
    }
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
      return {
        version: TRANSFER_POLICY_EVALUATION_VERSION,
        decision: "review",
        status: "policy_unavailable",
        matchedPolicyCount: 0,
        enforcedPolicyCount: 0,
        reviewPolicyCount: 0,
        effectiveExpiryMinutes: transfer.expiresInMinutes,
        reasons: [
          reason(
            "policy_treasury_unavailable",
            "The linked treasury account could not be loaded from the chain.",
          ),
        ],
        matchedPolicies: [],
        source: {
          kind: "aura_program",
          owner_id: ownerId,
          treasury_pda: treasuryPda,
          program_id: resolvedProgramIdText,
          policy_version: null,
          policy_config: null,
        },
      };
    }

    const policyVersion = Number(treasury.currentPolicyVersion ?? 0);
    const policyConfig = policyConfigRecordToJson(
      treasury.policyConfig as PolicyConfigRecord,
    );

    return {
      version: TRANSFER_POLICY_EVALUATION_VERSION,
      decision: "review",
      status: "onchain_review",
      matchedPolicyCount: 1,
      enforcedPolicyCount: 1,
      reviewPolicyCount: 1,
      effectiveExpiryMinutes: transfer.expiresInMinutes,
      reasons: [
        {
          code: "policy_treasury_loaded",
          severity: "info",
          message:
            "This transfer request is reviewed against the treasury's on-chain policy config.",
          rule: "treasury.policy_config",
          expected: `policy v${policyVersion}`,
          actual: treasuryPda,
        },
      ],
      matchedPolicies: [
        {
          id: treasuryPda,
          name: transferPolicyName(wallet, policyVersion),
          enforcementMode: "onchain",
          bindingId: treasuryPda,
        },
      ],
      source: {
        kind: "aura_program",
        owner_id: ownerId,
        treasury_pda: treasuryPda,
        program_id: resolvedProgramIdText,
        policy_version: policyVersion,
        policy_config: policyConfig,
      },
    };
  } catch (cause) {
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
      reasons: [reason("policy_load_failed", message)],
      matchedPolicies: [],
      source: {
        kind: "aura_program",
        owner_id: ownerId,
        treasury_pda: treasuryPda,
        program_id: resolvedProgramIdText,
        policy_version: null,
        policy_config: null,
      },
    };
  }
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
