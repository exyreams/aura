/**
 * `aura.session.status` — read the agent's own on-chain `SessionKeyAccount`.
 * Returns caps, spent-today, expiry, revoked. Re-read from chain on every
 * call; cached values are never trusted for trust decisions.
 */

import type { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";
import type { z } from "zod";

import { ConduitError } from "../errors.js";
import { strictObject } from "../schemas.js";
import type { SolanaContext } from "../solana.js";
import type { Tool, ToolContext } from "../types.js";

const input = strictObject({});

export type SessionStatusInput = z.infer<typeof input>;

export interface SessionStatusOutput {
  readonly registered: boolean;
  readonly sessionPubkey: string | null;
  readonly issuedBy: string | null;
  readonly issuedAtUnix: string | null;
  readonly expiresAtUnix: string | null;
  readonly revoked: boolean;
  readonly maxAmountUsdPerTx: string | null;
  readonly maxDailySpendUsd: string | null;
  readonly sessionSpentTodayUsd: string;
  readonly sessionLastResetUnix: string;
  readonly allowedChains: ReadonlyArray<number>;
  readonly allowedTxTypes: ReadonlyArray<number>;
  readonly maxProposalCount: number | null;
  readonly proposalsSubmitted: number;
}

export function createSessionStatusTool(
  solana: SolanaContext,
): Tool<typeof input, SessionStatusOutput> {
  return {
    name: "aura.session.status",
    description:
      "Reads the agent's own on-chain SessionKeyAccount: caps, spent-today, expiry, revoked flag. Fetched fresh each call — caches are never trusted.",
    input,
    requiredScopes: ["read"],
    isWrite: false,
    triggersInbox: false,
    declaredInstructions: [],
    async handler(
      _parsed: SessionStatusInput,
      ctx: ToolContext,
    ): Promise<SessionStatusOutput> {
      if (ctx.session.sessionPubkey === null) {
        return {
          registered: false,
          sessionPubkey: null,
          issuedBy: null,
          issuedAtUnix: null,
          expiresAtUnix: null,
          revoked: false,
          maxAmountUsdPerTx: null,
          maxDailySpendUsd: null,
          sessionSpentTodayUsd: "0",
          sessionLastResetUnix: "0",
          allowedChains: [],
          allowedTxTypes: [],
          maxProposalCount: null,
          proposalsSubmitted: 0,
        };
      }
      const sessionPubkey = ctx.session.sessionPubkey;
      const programAccount = (
        solana.client as unknown as {
          program: {
            account: {
              sessionKeyAccount: {
                fetchNullable: (
                  key: PublicKey,
                ) => Promise<SessionKeyOnChain | null>;
              };
            };
          };
        }
      ).program.account.sessionKeyAccount;
      const record = await programAccount.fetchNullable(sessionPubkey);
      if (record === null) {
        throw new ConduitError(
          "not_found",
          "SessionKeyAccount not found on-chain",
          {
            sessionPubkey: sessionPubkey.toBase58(),
          },
        );
      }
      return {
        registered: true,
        sessionPubkey: sessionPubkey.toBase58(),
        issuedBy: record.issuedBy.toBase58(),
        issuedAtUnix: bnString(record.issuedAt),
        expiresAtUnix: bnString(record.expiresAt),
        revoked: record.revoked,
        maxAmountUsdPerTx: optionalBn(record.maxAmountUsdPerTx),
        maxDailySpendUsd: optionalBn(record.maxDailySpendUsd),
        sessionSpentTodayUsd: bnString(record.sessionSpentTodayUsd),
        sessionLastResetUnix: bnString(record.sessionLastReset),
        allowedChains: [...record.allowedChains],
        allowedTxTypes: [...record.allowedTxTypes],
        maxProposalCount: record.maxProposalCount ?? null,
        proposalsSubmitted: record.proposalsSubmitted,
      };
    },
  };
}

interface SessionKeyOnChain {
  bump: number;
  treasury: PublicKey;
  sessionKey: PublicKey;
  issuedBy: PublicKey;
  issuedAt: BN;
  expiresAt: BN;
  revoked: boolean;
  maxAmountUsdPerTx: BN | null;
  maxDailySpendUsd: BN | null;
  sessionSpentTodayUsd: BN;
  sessionLastReset: BN;
  allowedChains: number[];
  allowedTxTypes: number[];
  maxProposalCount: number | null;
  proposalsSubmitted: number;
}

function bnString(value: BN | number | bigint | null | undefined): string {
  if (value === null || value === undefined) return "0";
  if (typeof value === "number" || typeof value === "bigint")
    return value.toString();
  return value.toString(10);
}

function optionalBn(
  value: BN | number | bigint | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  return bnString(value);
}
