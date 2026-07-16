/**
 * `aura.proposal.get` — fetch a proposal's current state by id.
 *
 * Reads `proposals_cache`. The on-chain pending queue is canonical for any
 * proposal still in flight; the cache stores the latest observed state plus
 * the historical record for completed proposals.
 */

import { z } from "zod";

import type { ConduitDb } from "../control-plane/db.js";
import { ConduitError } from "../errors.js";
import { strictObject } from "../schemas.js";
import type { Tool, ToolContext } from "../types.js";

const input = strictObject({
  proposalId: z.string().min(1).max(128),
});

export type ProposalGetInput = z.infer<typeof input>;

export interface ProposalGetOutput {
  readonly proposalId: string;
  readonly treasury: string;
  readonly status: string;
  readonly createdAtUnix: number;
  readonly updatedAtUnix: number;
  readonly payload: unknown;
}

export function createProposalGetTool(
  db: ConduitDb,
): Tool<typeof input, ProposalGetOutput> {
  return {
    name: "aura.proposal.get",
    description: "Returns the current state of a proposal by id.",
    input,
    requiredScopes: ["read"],
    isWrite: false,
    triggersInbox: false,
    declaredInstructions: [],
    async handler(
      parsed: ProposalGetInput,
      ctx: ToolContext,
    ): Promise<ProposalGetOutput> {
      const row = db
        .prepare(
          `SELECT proposal_id, treasury_pubkey, status, payload_json, created_at, updated_at
           FROM proposals_cache WHERE proposal_id = ?`,
        )
        .get(parsed.proposalId) as
        | {
            proposal_id: string;
            treasury_pubkey: string;
            status: string;
            payload_json: string;
            created_at: number;
            updated_at: number;
          }
        | undefined;
      if (row === undefined) {
        throw new ConduitError(
          "not_found",
          `proposal ${parsed.proposalId} not in local cache`,
        );
      }
      if (row.treasury_pubkey !== ctx.session.treasuryPubkey.toBase58()) {
        throw new ConduitError(
          "forbidden",
          "proposal belongs to a different treasury",
        );
      }
      return {
        proposalId: row.proposal_id,
        treasury: row.treasury_pubkey,
        status: row.status,
        createdAtUnix: row.created_at,
        updatedAtUnix: row.updated_at,
        payload: JSON.parse(row.payload_json),
      };
    },
  };
}
