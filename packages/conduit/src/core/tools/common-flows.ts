import { z } from "zod";

import { strictObject } from "../schemas.js";
import type { Tool } from "../types.js";
import {
  type QueuedOwnerInstructionOutput,
  type QueueOwnerInstructionDeps,
  queueOwnerInstructionSignRequest,
} from "./owner-sign-request.js";
import {
  createProposalCreateTool,
  type ProposalCreateDeps,
  type ProposalCreateOutput,
} from "./proposal-create.js";

const usdAmount = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^[0-9]+$/u),
]);

const ttlSecs = z.number().int().min(30).max(3600).default(600);

const spendRequestInput = strictObject({
  amountUsd: usdAmount,
  chain: z.number().int().min(0).max(255),
  recipient: z.string().trim().min(1).max(128),
  reason: z.string().trim().max(2048).optional(),
  txType: z.number().int().min(0).max(255).default(0),
  protocolId: z.number().int().nullable().default(null),
  expectedOutputUsd: usdAmount.optional().nullable(),
  quoteAgeSecs: z.number().int().nonnegative().optional().nullable(),
  counterpartyRiskScore: z.number().int().min(0).max(255).optional().nullable(),
  previewTicket: z.string().optional(),
});

export type SpendRequestInput = z.infer<typeof spendRequestInput>;

const pauseRequestInput = strictObject({
  paused: z.boolean().default(true),
  reason: z.string().trim().max(2048).optional(),
  ttlSecs,
});

export type ExecutionPauseRequestInput = z.infer<typeof pauseRequestInput>;

const recipientLimitSetInput = strictObject({
  chain: z.number().int().min(0).max(255),
  address: z.string().trim().min(1).max(128),
  dailyLimitUsd: usdAmount,
  perTxLimitUsd: usdAmount.optional().nullable(),
  reason: z.string().trim().max(2048).optional(),
  ttlSecs,
});

export type RecipientLimitSetInput = z.infer<typeof recipientLimitSetInput>;

const recipientLimitRemoveInput = strictObject({
  chain: z.number().int().min(0).max(255),
  address: z.string().trim().min(1).max(128),
  reason: z.string().trim().max(2048).optional(),
  ttlSecs,
});

export type RecipientLimitRemoveInput = z.infer<
  typeof recipientLimitRemoveInput
>;

export function createSpendRequestTool(
  deps: ProposalCreateDeps,
): Tool<typeof spendRequestInput, ProposalCreateOutput> {
  const proposalCreate = createProposalCreateTool(deps);
  return {
    name: "aura.spend.request",
    description:
      "Friendly spend request flow. Creates a proposal for a treasury spend using simple amount, chain, recipient, and reason fields.",
    input: spendRequestInput,
    requiredScopes: ["propose"],
    isWrite: true,
    triggersInbox: true,
    declaredInstructions: proposalCreate.declaredInstructions,
    async handler(parsed, ctx) {
      return proposalCreate.handler(
        {
          amountUsd: parsed.amountUsd,
          chain: parsed.chain,
          txType: parsed.txType,
          protocolId: parsed.protocolId,
          recipientOrContract: parsed.recipient,
          expectedOutputUsd: parsed.expectedOutputUsd,
          actualOutputUsd: null,
          quoteAgeSecs: parsed.quoteAgeSecs,
          counterpartyRiskScore: parsed.counterpartyRiskScore,
          reason: parsed.reason,
          previewTicket: parsed.previewTicket,
        },
        ctx,
      );
    },
  };
}

export function createExecutionPauseRequestTool(
  deps: QueueOwnerInstructionDeps,
): Tool<typeof pauseRequestInput, QueuedOwnerInstructionOutput> {
  return {
    name: "aura.execution.pause.request",
    description:
      "Queues an owner-reviewed request to pause or resume treasury execution. Conduit never signs this owner-grade action.",
    input: pauseRequestInput,
    requiredScopes: ["propose"],
    isWrite: true,
    triggersInbox: true,
    declaredInstructions: [],
    proxiesOwnerSignature: true,
    async handler(parsed, ctx) {
      const now = Math.floor(Date.now() / 1000).toString();
      return queueOwnerInstructionSignRequest(deps, ctx, {
        instruction: "pause_execution",
        accounts: { treasury: ctx.session.treasuryPubkey.toBase58() },
        args: { paused: parsed.paused, now },
        reason: parsed.reason ?? null,
        ttlSecs: parsed.ttlSecs,
        action: "execution_pause_request",
        summary: {
          paused: parsed.paused,
          treasury: ctx.session.treasuryPubkey.toBase58(),
        },
      });
    },
  };
}

export function createRecipientLimitSetRequestTool(
  deps: QueueOwnerInstructionDeps,
): Tool<typeof recipientLimitSetInput, QueuedOwnerInstructionOutput> {
  return {
    name: "aura.recipient_limit.set.request",
    description:
      "Queues an owner-reviewed request to set a per-recipient spend limit for a chain/address pair.",
    input: recipientLimitSetInput,
    requiredScopes: ["propose"],
    isWrite: true,
    triggersInbox: true,
    declaredInstructions: [],
    proxiesOwnerSignature: true,
    async handler(parsed, ctx) {
      const now = Math.floor(Date.now() / 1000).toString();
      return queueOwnerInstructionSignRequest(deps, ctx, {
        instruction: "set_recipient_limit",
        accounts: { treasury: ctx.session.treasuryPubkey.toBase58() },
        args: {
          args: {
            chain: parsed.chain,
            address: parsed.address,
            dailyLimitUsd: parsed.dailyLimitUsd,
            perTxLimitUsd: parsed.perTxLimitUsd ?? null,
            now,
          },
        },
        reason: parsed.reason ?? null,
        ttlSecs: parsed.ttlSecs,
        action: "recipient_limit_set_request",
        summary: {
          chain: parsed.chain,
          address: parsed.address,
          dailyLimitUsd: parsed.dailyLimitUsd,
          perTxLimitUsd: parsed.perTxLimitUsd ?? null,
          treasury: ctx.session.treasuryPubkey.toBase58(),
        },
      });
    },
  };
}

export function createRecipientLimitRemoveRequestTool(
  deps: QueueOwnerInstructionDeps,
): Tool<typeof recipientLimitRemoveInput, QueuedOwnerInstructionOutput> {
  return {
    name: "aura.recipient_limit.remove.request",
    description:
      "Queues an owner-reviewed request to remove a per-recipient spend limit for a chain/address pair.",
    input: recipientLimitRemoveInput,
    requiredScopes: ["propose"],
    isWrite: true,
    triggersInbox: true,
    declaredInstructions: [],
    proxiesOwnerSignature: true,
    async handler(parsed, ctx) {
      const now = Math.floor(Date.now() / 1000).toString();
      return queueOwnerInstructionSignRequest(deps, ctx, {
        instruction: "remove_recipient_limit",
        accounts: { treasury: ctx.session.treasuryPubkey.toBase58() },
        args: {
          chain: parsed.chain,
          address: parsed.address,
          now,
        },
        reason: parsed.reason ?? null,
        ttlSecs: parsed.ttlSecs,
        action: "recipient_limit_remove_request",
        summary: {
          chain: parsed.chain,
          address: parsed.address,
          treasury: ctx.session.treasuryPubkey.toBase58(),
        },
      });
    },
  };
}
