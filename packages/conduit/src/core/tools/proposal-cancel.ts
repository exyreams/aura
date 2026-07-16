/**
 * `aura.proposal.cancel` — cancels a pending proposal the same session
 * created. `cancel_pending` is owner-signed, so this routes through the
 * owner-signing proxy rather than signing directly.
 */

import { z } from "zod";

import type { ConduitDb } from "../control-plane/db.js";
import { SignRequestsRepo } from "../control-plane/sign-requests.js";
import { ConduitError } from "../errors.js";
import { strictObject } from "../schemas.js";
import type { DeclaredInstruction, Tool, ToolContext } from "../types.js";

const input = strictObject({
  proposalId: z.string().min(1).max(128),
});

export type ProposalCancelInput = z.infer<typeof input>;

export interface ProposalCancelOutput {
  readonly signRequestId: string;
  readonly dashboardUrl: string;
  readonly note: string;
}

export interface ProposalCancelDeps {
  readonly db: ConduitDb;
  readonly dashboardBaseUrl: string;
}

// cancel_pending requires the owner — we surface it as a sign-request, not a
// direct instruction the agent builds.
const declaredInstructions: ReadonlyArray<DeclaredInstruction> = [];

export function createProposalCancelTool(
  deps: ProposalCancelDeps,
): Tool<typeof input, ProposalCancelOutput> {
  const signRequests = new SignRequestsRepo(deps.db);
  return {
    name: "aura.proposal.cancel",
    description:
      "Requests cancellation of a pending proposal. Cancel requires owner consent, so this posts a sign-request to the dashboard rather than signing directly.",
    input,
    requiredScopes: ["propose"],
    isWrite: true,
    triggersInbox: true,
    declaredInstructions,
    proxiesOwnerSignature: true,
    async handler(
      parsed: ProposalCancelInput,
      ctx: ToolContext,
    ): Promise<ProposalCancelOutput> {
      const cacheRow = deps.db
        .prepare(
          `SELECT proposal_id, treasury_pubkey, session_id FROM proposals_cache WHERE proposal_id=?`,
        )
        .get(parsed.proposalId) as
        | {
            proposal_id: string;
            treasury_pubkey: string;
            session_id: string | null;
          }
        | undefined;
      if (cacheRow === undefined) {
        throw new ConduitError(
          "not_found",
          `proposal ${parsed.proposalId} unknown`,
        );
      }
      if (cacheRow.treasury_pubkey !== ctx.session.treasuryPubkey.toBase58()) {
        throw new ConduitError(
          "forbidden",
          "proposal belongs to a different treasury",
        );
      }
      if (cacheRow.session_id !== ctx.session.id) {
        throw new ConduitError(
          "forbidden",
          "cancel may only be requested by the session that created the proposal",
        );
      }
      const sr = signRequests.create({
        ownerPubkey: ctx.session.ownerPubkey.toBase58(),
        instructionName: "cancel_pending",
        unsignedTxB64: "", // built by the dashboard from the proposalId
        decodedSummary: {
          action: "cancel_pending",
          treasury: ctx.session.treasuryPubkey.toBase58(),
          proposalId: parsed.proposalId,
        },
        callerId: "agent",
        callerSessionId: ctx.session.id,
      });
      return {
        signRequestId: sr.id,
        dashboardUrl: `${deps.dashboardBaseUrl.replace(/\/$/, "")}/sign-requests/${sr.id}`,
        note: "owner must approve the cancellation in the dashboard.",
      };
    },
  };
}
