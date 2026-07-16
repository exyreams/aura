/**
 * `aura.policy.preview` — read-only structural assessment of a hypothetical action.
 *
 * Why not call `simulate_policy` on-chain? Because the read-only slice has no
 * signer. Once the signing service lands, this tool grows a second mode that
 * actually submits the simulation. For now it returns what is *knowable* from
 * the public policy config alone:
 *
 *   - Whether the action would clear each *public* limit (per-tx, daily,
 *     weekly, monthly, velocity).
 *   - Whether the destination is in any configured allowlist / recipient
 *     limit row.
 *   - Whether the protocol bitmap allows the chain.
 *   - The presence of a confidential guardrail, in which case the encrypted
 *     check cannot run from here and we say so explicitly.
 *
 * The returned `decision` is conservative: any failing public check yields
 * `needs_human`. Pure confidential-only treasuries return `confidential_only`,
 * which the caller should treat as "no preview available — submit and see."
 */

import { accounts } from "@aura-protocol/sdk-ts";
import { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";
import { z } from "zod";

import { ConduitError } from "../errors.js";
import { PubkeyString, strictObject } from "../schemas.js";
import type { SolanaContext } from "../solana.js";
import type { TocTouGuard } from "../toctou.js";
import type { Tool, ToolContext } from "../types.js";

const input = strictObject({
  treasury: PubkeyString.optional(),
  destination: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .describe(
      "Counterparty address for the hypothetical transfer. Chain-native format — base58 for Solana, hex for Ethereum, etc.",
    ),
  amountUsd: z
    .union([z.number().int().nonnegative(), z.string().regex(/^[0-9]+$/u)])
    .describe("Hypothetical USD amount (integer USD, not cents)."),
  chainCode: z
    .number()
    .int()
    .min(0)
    .max(255)
    .describe("AURA chain code (0=Solana, others per aura-policy chain enum)."),
});

export type PolicyPreviewInput = z.infer<typeof input>;

export type PolicyPreviewDecision =
  | "approve"
  | "needs_human"
  | "confidential_only";

export interface PolicyCheck {
  readonly rule: string;
  readonly passed: boolean;
  readonly detail?: string;
}

export interface PolicyPreviewOutput {
  readonly decision: PolicyPreviewDecision;
  readonly note: string;
  readonly checks: ReadonlyArray<PolicyCheck>;
  readonly previewMode: "public_only" | "confidential";
  readonly treasury: string;
  readonly amountUsd: string;
  readonly destination: string;
  readonly chainCode: number;
  readonly previewTicket: string;
  readonly previewTicketExpiresAt: number;
}

export function createPolicyPreviewTool(
  solana: SolanaContext,
  toctou: TocTouGuard,
): Tool<typeof input, PolicyPreviewOutput> {
  return {
    name: "aura.policy.preview",
    description:
      "Returns a structural assessment of a hypothetical transfer against the treasury's public policy config. Does not sign or submit anything. Confidential limits cannot be previewed without submission.",
    input,
    requiredScopes: ["read"],
    isWrite: false,
    triggersInbox: false,
    declaredInstructions: [],
    async handler(
      parsed: PolicyPreviewInput,
      ctx: ToolContext,
    ): Promise<PolicyPreviewOutput> {
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

      const amountUsd =
        typeof parsed.amountUsd === "number"
          ? BigInt(parsed.amountUsd)
          : BigInt(parsed.amountUsd);

      const policy = record.policyConfig;
      const isConfidential =
        record.confidentialGuardrails !== null &&
        record.confidentialGuardrails !== undefined;
      const checks: PolicyCheck[] = [];

      checks.push(
        compareBn(
          "per_tx_limit_usd",
          amountUsd,
          policy.perTxLimitUsd,
          "amount > per-tx limit",
        ),
        compareBn(
          "daily_limit_usd",
          amountUsd,
          policy.dailyLimitUsd,
          "amount > daily limit",
        ),
        compareBn(
          "velocity_limit_usd",
          amountUsd,
          policy.velocityLimitUsd,
          "amount > velocity limit",
        ),
      );

      if (
        policy.weeklyLimitUsd !== null &&
        policy.weeklyLimitUsd !== undefined
      ) {
        checks.push(
          compareBn(
            "weekly_limit_usd",
            amountUsd,
            policy.weeklyLimitUsd,
            "amount > weekly limit",
          ),
        );
      }
      if (
        policy.monthlyLimitUsd !== null &&
        policy.monthlyLimitUsd !== undefined
      ) {
        checks.push(
          compareBn(
            "monthly_limit_usd",
            amountUsd,
            policy.monthlyLimitUsd,
            "amount > monthly limit",
          ),
        );
      }

      // Chain allowlist via protocol bitmap. Bit position == chain code.
      const protocolBitmap = bnToBigInt(policy.allowedProtocolBitmap);
      const chainBit = 1n << BigInt(parsed.chainCode);
      checks.push({
        rule: "allowed_protocol_bitmap",
        passed: protocolBitmap === 0n || (protocolBitmap & chainBit) !== 0n,
        detail: `chain_code=${parsed.chainCode}, bitmap=0x${protocolBitmap.toString(16)}`,
      });

      // Recipient-limit allowlist (when populated). The on-chain row carries
      // `{ chain, address, dailyLimitUsd, perTxLimitUsd }` — chain-agnostic by
      // address string. Empty list means no allowlist gate; otherwise the
      // destination must appear and match the chain code.
      if (policy.recipientLimits && policy.recipientLimits.length > 0) {
        const match = policy.recipientLimits.find(
          (row: (typeof policy.recipientLimits)[number]) =>
            row.chain === parsed.chainCode &&
            row.address === parsed.destination,
        );
        if (match !== undefined) {
          checks.push({
            rule: "recipient_limit_allowlist",
            passed: true,
            detail: `destination matches recipient-limit row for chain=${match.chain}`,
          });
          // Per-row tighter cap, when present.
          if (
            match.perTxLimitUsd !== null &&
            match.perTxLimitUsd !== undefined
          ) {
            checks.push(
              compareBn(
                "recipient_per_tx_limit_usd",
                amountUsd,
                match.perTxLimitUsd,
                "amount > recipient-specific per-tx limit",
              ),
            );
          }
          checks.push(
            compareBn(
              "recipient_daily_limit_usd",
              amountUsd,
              match.dailyLimitUsd,
              "amount > recipient-specific daily limit (today's running spend not deducted in preview)",
            ),
          );
        } else {
          checks.push({
            rule: "recipient_limit_allowlist",
            passed: false,
            detail:
              "destination is not in the configured recipient-limit allowlist",
          });
        }
      }

      const publicAllPass = checks.every((c) => c.passed);
      let decision: PolicyPreviewDecision;
      let note: string;
      if (isConfidential) {
        decision = "confidential_only";
        note =
          "Treasury has confidential guardrails configured. The public checks above pass/fail as shown, but the encrypted per-tx/daily/velocity limits cannot be evaluated without submitting the proposal.";
      } else if (publicAllPass) {
        decision = "approve";
        note =
          "All public checks pass against the current policy config. This is a structural preview only — the actual on-chain policy engine may still reject (e.g. running spend counters, time windows, ladders).";
      } else {
        decision = "needs_human";
        note =
          "At least one public check failed; this proposal would not auto-approve.";
      }

      const ticket = toctou.issue({
        sessionId: ctx.session.id,
        subjectArgs: {
          treasury: treasuryPubkey.toBase58(),
          destination: parsed.destination,
          chain: parsed.chainCode,
          amountUsd: amountUsd.toString(),
        },
      });

      return {
        decision,
        note,
        checks,
        previewMode: isConfidential ? "confidential" : "public_only",
        treasury: treasuryPubkey.toBase58(),
        amountUsd: amountUsd.toString(),
        destination: parsed.destination,
        chainCode: parsed.chainCode,
        previewTicket: ticket.ticket,
        previewTicketExpiresAt: ticket.expiresAt,
      };
    },
  };
}

function compareBn(
  rule: string,
  amount: bigint,
  limit: BN | number | bigint,
  failDetail: string,
): PolicyCheck {
  const limitBig = bnToBigInt(limit);
  const passed = limitBig === 0n || amount <= limitBig;
  return {
    rule,
    passed,
    detail: passed
      ? `amount=${amount} <= limit=${limitBig}`
      : `${failDetail}: amount=${amount} > limit=${limitBig}`,
  };
}

function bnToBigInt(value: BN | number | bigint | undefined | null): bigint {
  if (value === undefined || value === null) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  // BN instance
  return BigInt(value.toString(10));
}
