/**
 * `aura.treasury.get` — projects a safe summary of the on-chain `TreasuryAccount`.
 *
 * Returns identity, lifecycle, queue depth, public policy summary, and
 * presence indicators for confidential / dWallet / multisig / swarm features.
 * Confidential limit *values* are never returned — only "configured: yes/no".
 * Heavy raw fields (full ladder, recipient limits, scoped-pause lists, etc.)
 * are summarised to counts so the response stays predictable for the LLM.
 */

import { accounts } from "@aura-protocol/sdk-ts";
import { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";
import type { z } from "zod";

import { ConduitError } from "../errors.js";
import { PubkeyString, strictObject } from "../schemas.js";
import type { SolanaContext } from "../solana.js";
import type { Tool, ToolContext } from "../types.js";

const input = strictObject({
  treasury: PubkeyString.optional().describe(
    "Treasury PDA to read. Defaults to the session's treasury when omitted.",
  ),
});

export type TreasuryGetInput = z.infer<typeof input>;

export interface PublicPolicySummary {
  readonly dailyLimitUsd: string;
  readonly perTxLimitUsd: string;
  readonly daytimeHourlyLimitUsd: string;
  readonly nighttimeHourlyLimitUsd: string;
  readonly velocityLimitUsd: string;
  readonly maxSlippageBps: string;
  readonly maxQuoteAgeSecs: string | null;
  readonly weeklyLimitUsd: string | null;
  readonly monthlyLimitUsd: string | null;
  readonly sharedPoolLimitUsd: string | null;
  readonly allowedProtocolBitmap: string;
  readonly recipientLimitCount: number;
  readonly cooldownConfigured: boolean;
  readonly anomalyConfigured: boolean;
  readonly approvalLadderConfigured: boolean;
  readonly scopedPauseEntries: number;
  readonly budgetEnvelopeCount: number;
}

export interface TreasuryGetOutput {
  readonly cluster: string;
  readonly programId: string;
  readonly treasury: string;
  readonly owner: string;
  readonly aiAuthority: string;
  readonly agentId: string;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly nextProposalId: string;
  readonly totalTransactions: string;
  readonly executionPaused: boolean;
  readonly agentStateCode: number;
  readonly pendingTransactionTtlSecs: string;
  readonly currentPolicyVersion: number;
  readonly publicPolicy: PublicPolicySummary;
  readonly confidentialGuardrailsConfigured: boolean;
  readonly pendingQueueDepth: number;
  readonly dwalletCount: number;
  readonly multisigConfigured: boolean;
  readonly swarmConfigured: boolean;
  readonly highRiskThreshold: number;
  readonly highRiskRequireGuardian: boolean;
  readonly lastLargeTxAtUnix: string | null;
  readonly lastLargeTxAmountUsd: string;
  readonly lastSnapshotAtUnix: string | null;
}

export function createTreasuryGetTool(
  solana: SolanaContext,
): Tool<typeof input, TreasuryGetOutput> {
  return {
    name: "aura.treasury.get",
    description:
      "Reads the on-chain TreasuryAccount and returns a safe summary: identity, lifecycle, pending-queue depth, public policy limits, and presence indicators for confidential/dWallet/multisig/swarm. Confidential limit values are never returned.",
    input,
    requiredScopes: ["read"],
    isWrite: false,
    triggersInbox: false,
    declaredInstructions: [],
    async handler(
      parsed: TreasuryGetInput,
      ctx: ToolContext,
    ): Promise<TreasuryGetOutput> {
      const treasuryPubkey =
        parsed.treasury !== undefined
          ? new PublicKey(parsed.treasury)
          : ctx.session.treasuryPubkey;

      if (!treasuryPubkey.equals(ctx.session.treasuryPubkey)) {
        throw new ConduitError(
          "forbidden",
          "This session is scoped to a single treasury; the requested treasury is different.",
          {
            sessionTreasury: ctx.session.treasuryPubkey.toBase58(),
            requestedTreasury: treasuryPubkey.toBase58(),
          },
        );
      }

      const record = await accounts.fetchTreasuryAccountNullable(
        solana.client,
        treasuryPubkey,
      );
      if (record === null) {
        throw new ConduitError(
          "not_found",
          "Treasury account not found at the given PDA.",
          {
            treasury: treasuryPubkey.toBase58(),
          },
        );
      }

      const policy = record.policyConfig;

      return {
        cluster: solana.cluster,
        programId: solana.programId.toBase58(),
        treasury: treasuryPubkey.toBase58(),
        owner: record.owner.toBase58(),
        aiAuthority: record.aiAuthority.toBase58(),
        agentId: record.agentId,
        schemaVersion: record.schemaVersion,
        createdAt: bnString(record.createdAt),
        updatedAt: bnString(record.updatedAt),
        nextProposalId: bnString(record.nextProposalId),
        totalTransactions: bnString(record.totalTransactions),
        executionPaused: record.executionPaused,
        agentStateCode: record.agentState,
        pendingTransactionTtlSecs: bnString(record.pendingTransactionTtlSecs),
        currentPolicyVersion: record.currentPolicyVersion,
        publicPolicy: {
          dailyLimitUsd: bnString(policy.dailyLimitUsd),
          perTxLimitUsd: bnString(policy.perTxLimitUsd),
          daytimeHourlyLimitUsd: bnString(policy.daytimeHourlyLimitUsd),
          nighttimeHourlyLimitUsd: bnString(policy.nighttimeHourlyLimitUsd),
          velocityLimitUsd: bnString(policy.velocityLimitUsd),
          maxSlippageBps: bnString(policy.maxSlippageBps),
          maxQuoteAgeSecs: optionalBn(policy.maxQuoteAgeSecs),
          weeklyLimitUsd: optionalBn(policy.weeklyLimitUsd),
          monthlyLimitUsd: optionalBn(policy.monthlyLimitUsd),
          sharedPoolLimitUsd: optionalBn(policy.sharedPoolLimitUsd),
          allowedProtocolBitmap: bnString(policy.allowedProtocolBitmap),
          recipientLimitCount: policy.recipientLimits?.length ?? 0,
          cooldownConfigured:
            policy.cooldownConfig !== null &&
            policy.cooldownConfig !== undefined,
          anomalyConfigured:
            policy.anomalyConfig !== null && policy.anomalyConfig !== undefined,
          approvalLadderConfigured:
            policy.approvalLadder !== null &&
            policy.approvalLadder !== undefined,
          scopedPauseEntries: policy.scopedPauseEntries?.length ?? 0,
          budgetEnvelopeCount: policy.budgetEnvelopes?.length ?? 0,
        },
        confidentialGuardrailsConfigured:
          record.confidentialGuardrails !== null &&
          record.confidentialGuardrails !== undefined,
        pendingQueueDepth: record.pendingQueue?.length ?? 0,
        dwalletCount: record.dwallets?.length ?? 0,
        multisigConfigured:
          record.multisig !== null && record.multisig !== undefined,
        swarmConfigured: record.swarm !== null && record.swarm !== undefined,
        highRiskThreshold: record.highRiskThreshold,
        highRiskRequireGuardian: record.highRiskRequireGuardian,
        lastLargeTxAtUnix: optionalBn(record.lastLargeTxAt),
        lastLargeTxAmountUsd: bnString(record.lastLargeTxAmountUsd),
        lastSnapshotAtUnix: optionalBn(record.lastSnapshotAt),
      };
    },
  };
}

function bnString(value: BN | number | bigint | undefined | null): string {
  if (value === undefined || value === null) return "0";
  if (typeof value === "number" || typeof value === "bigint")
    return value.toString();
  return value.toString(10);
}

function optionalBn(
  value: BN | number | bigint | undefined | null,
): string | null {
  if (value === undefined || value === null) return null;
  return bnString(value);
}
