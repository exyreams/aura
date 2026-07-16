/**
 * `aura.execute.pending` — triggers execution for an approved proposal.
 *
 * Calls `execute_pending` (operator signer = session key) then awaits
 * confirmation and updates the local cache. Real dWallet wiring happens
 * inside the SDK's execute_pending instruction builder.
 */

import { instructions } from "@aura-protocol/sdk-ts";
import { SystemProgram, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { z } from "zod";

import type { ConduitDb } from "../control-plane/db.js";
import { ConduitError } from "../errors.js";
import { strictObject } from "../schemas.js";
import type { SigningService } from "../signing/types.js";
import type { SolanaContext } from "../solana.js";
import type { DeclaredInstruction, Tool, ToolContext } from "../types.js";

const input = strictObject({
  proposalId: z.string().min(1).max(128),
});

export type ExecutePendingInput = z.infer<typeof input>;

export interface ExecutePendingOutput {
  readonly proposalId: string;
  readonly signature: string;
  readonly slot: number;
}

export interface ExecutePendingDeps {
  readonly db: ConduitDb;
  readonly solana: SolanaContext;
  readonly signer: SigningService;
}

const declaredInstructions: ReadonlyArray<DeclaredInstruction> = [
  { name: "execute_pending", requiresSigner: ["operator"] },
];

export function createExecutePendingTool(
  deps: ExecutePendingDeps,
): Tool<typeof input, ExecutePendingOutput> {
  return {
    name: "aura.execute.pending",
    description:
      "Triggers execution of an approved pending proposal (calls execute_pending signed as the session key acting as operator).",
    input,
    requiredScopes: ["execute"],
    isWrite: true,
    triggersInbox: false,
    declaredInstructions,
    async handler(
      parsed: ExecutePendingInput,
      ctx: ToolContext,
    ): Promise<ExecutePendingOutput> {
      const row = deps.db
        .prepare(
          `SELECT status, treasury_pubkey FROM proposals_cache WHERE proposal_id=?`,
        )
        .get(parsed.proposalId) as
        | { status: string; treasury_pubkey: string }
        | undefined;
      if (row === undefined) {
        throw new ConduitError(
          "not_found",
          `proposal ${parsed.proposalId} unknown`,
        );
      }
      if (row.treasury_pubkey !== ctx.session.treasuryPubkey.toBase58()) {
        throw new ConduitError(
          "forbidden",
          "proposal belongs to a different treasury",
        );
      }
      if (row.status !== "approved" && row.status !== "pending") {
        throw new ConduitError(
          "forbidden",
          `proposal ${parsed.proposalId} is not in an executable state (status=${row.status})`,
        );
      }

      const operatorPk = await deps.signer.publicKeyFor(ctx.session.id);
      const now = Math.floor(Date.now() / 1000);

      const ix = await instructions.execution.executePendingInstruction(
        deps.solana.client,
        {
          accounts: {
            operator: operatorPk,
            treasury: ctx.session.treasuryPubkey,
            messageApproval: null,
            dwallet: null,
            callerProgram: deps.solana.programId,
            cpiAuthority: null,
            dwalletProgram: null,
            dwalletCoordinator: null,
            externalLiveness: null,
            dwalletState: null,
            systemProgram: SystemProgram.programId,
          },
          args: { now: new BN(now) },
        },
      );

      const { blockhash, lastValidBlockHeight } =
        await deps.solana.connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: operatorPk,
        blockhash,
        lastValidBlockHeight,
      }).add(ix);

      const sim = await deps.solana.connection.simulateTransaction(tx);
      if (sim.value.err !== null) {
        throw new ConduitError(
          "policy_denied",
          `simulation rejected execute_pending: ${JSON.stringify(sim.value.err)}`,
          { logs: sim.value.logs ?? [] },
        );
      }

      await deps.signer.sign({ sessionId: ctx.session.id, transaction: tx });
      const signature = await deps.solana.connection.sendRawTransaction(
        tx.serialize(),
      );
      const conf = await deps.solana.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      const nowMs = Date.now();
      deps.db
        .prepare(
          `UPDATE proposals_cache SET status='executed', updated_at=? WHERE proposal_id=?`,
        )
        .run(nowMs, parsed.proposalId);

      return {
        proposalId: parsed.proposalId,
        signature,
        slot: conf.context.slot,
      };
    },
  };
}
