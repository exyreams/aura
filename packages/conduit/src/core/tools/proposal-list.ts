/**
 * `aura.proposal.list` — list recent proposals for this session's treasury.
 *
 * Reads from the local `proposals_cache` table. The on-chain `pending_queue`
 * is canonical for *pending* proposals; the cache holds historical state we've
 * observed for this treasury via Conduit.
 */

import { z } from "zod";

import type { ConduitDb } from "../control-plane/db.js";
import { strictObject } from "../schemas.js";
import type { Tool, ToolContext } from "../types.js";

const input = strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      "any",
      "pending",
      "approved",
      "executed",
      "denied",
      "cancelled",
      "expired",
    ])
    .default("any"),
});

export type ProposalListInput = z.infer<typeof input>;

export interface ProposalListEntry {
  readonly proposalId: string;
  readonly status: string;
  readonly createdAtUnix: number;
  readonly updatedAtUnix: number;
  readonly payload: unknown;
}

export interface ProposalListOutput {
  readonly entries: ReadonlyArray<ProposalListEntry>;
}

export function createProposalListTool(
  db: ConduitDb,
): Tool<typeof input, ProposalListOutput> {
  return {
    name: "aura.proposal.list",
    description:
      "Lists recent proposals for this session's treasury, newest first. Filterable by status.",
    input,
    requiredScopes: ["read"],
    isWrite: false,
    triggersInbox: false,
    declaredInstructions: [],
    async handler(
      parsed: ProposalListInput,
      ctx: ToolContext,
    ): Promise<ProposalListOutput> {
      const treasuryStr = ctx.session.treasuryPubkey.toBase58();
      const rows =
        parsed.status === "any"
          ? (db
              .prepare(
                `SELECT proposal_id, status, payload_json, created_at, updated_at
                 FROM proposals_cache WHERE treasury_pubkey = ?
                 ORDER BY updated_at DESC LIMIT ?`,
              )
              .all(treasuryStr, parsed.limit) as ReadonlyArray<{
              proposal_id: string;
              status: string;
              payload_json: string;
              created_at: number;
              updated_at: number;
            }>)
          : (db
              .prepare(
                `SELECT proposal_id, status, payload_json, created_at, updated_at
                 FROM proposals_cache WHERE treasury_pubkey = ? AND status = ?
                 ORDER BY updated_at DESC LIMIT ?`,
              )
              .all(treasuryStr, parsed.status, parsed.limit) as ReadonlyArray<{
              proposal_id: string;
              status: string;
              payload_json: string;
              created_at: number;
              updated_at: number;
            }>);
      return {
        entries: rows.map((row) => ({
          proposalId: row.proposal_id,
          status: row.status,
          createdAtUnix: row.created_at,
          updatedAtUnix: row.updated_at,
          payload: JSON.parse(row.payload_json),
        })),
      };
    },
  };
}
