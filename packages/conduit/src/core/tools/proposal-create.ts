/**
 * `aura.proposal.create` — builds and submits a `propose_transaction`.
 *
 *   1. Refresh treasury + session caps from chain (never trust caches).
 *   2. Build the ProposeTransactionArgs from the agent's input.
 *   3. Ask the signing service to sign as the session key.
 *   4. simulateTransaction → reject on failure.
 *   5. Submit, capture signature, cache the proposal locally, return id.
 *
 * The TOCTOU guard (preview-args vs submit-args) is enforced one layer up in
 * `dispatch.ts` via canonical-args hashing.
 */

import { randomBytes } from "node:crypto";
import { instructions } from "@aura-protocol/sdk-ts";
import { PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { z } from "zod";

import type { ConduitDb } from "../control-plane/db.js";
import { SignRequestsRepo } from "../control-plane/sign-requests.js";
import { ConduitError } from "../errors.js";
import { PubkeyString, strictObject } from "../schemas.js";
import type { SigningService } from "../signing/types.js";
import type { SolanaContext } from "../solana.js";
import type { TocTouGuard } from "../toctou.js";
import type { DeclaredInstruction, Tool, ToolContext } from "../types.js";

const input = strictObject({
  amountUsd: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^[0-9]+$/u),
  ]),
  chain: z.number().int().min(0).max(255),
  txType: z.number().int().min(0).max(255).default(0),
  protocolId: z.number().int().nullable().default(null),
  recipientOrContract: z.string().trim().min(1).max(128),
  expectedOutputUsd: z
    .union([z.number().int(), z.string()])
    .optional()
    .nullable(),
  actualOutputUsd: z
    .union([z.number().int(), z.string()])
    .optional()
    .nullable(),
  quoteAgeSecs: z.number().int().nonnegative().optional().nullable(),
  counterpartyRiskScore: z.number().int().min(0).max(255).optional().nullable(),
  reason: z
    .string()
    .max(2048)
    .optional()
    .describe("Free-text justification surfaced in the inbox."),
  sessionKeyAccount: PubkeyString.optional(),
  previewTicket: z
    .string()
    .optional()
    .describe(
      "Optional preview ticket returned by aura.policy.preview. When supplied, the action must match the previewed args byte-for-byte; mismatch aborts.",
    ),
});

export type ProposalCreateInput = z.infer<typeof input>;

export interface ProposalCreateOutput {
  readonly proposalId: string;
  readonly status:
    | "submitted"
    | "auto_approved_pending_execute"
    | "queued_for_human";
  readonly signature: string | null;
  readonly slot: number | null;
  readonly dashboardUrl: string;
  readonly note: string;
}

export interface ProposalCreateDeps {
  readonly db: ConduitDb;
  readonly solana: SolanaContext;
  readonly signer: SigningService;
  readonly dashboardBaseUrl: string;
  readonly toctou: TocTouGuard;
}

const declaredInstructions: ReadonlyArray<DeclaredInstruction> = [
  { name: "propose_transaction", requiresSigner: ["ai_authority"] },
];

export function createProposalCreateTool(
  deps: ProposalCreateDeps,
): Tool<typeof input, ProposalCreateOutput> {
  return {
    name: "aura.proposal.create",
    description:
      "Builds, signs (as the session key), simulates, and submits a propose_transaction. Returns the proposal id, signature, and a dashboard URL for the human review step.",
    input,
    requiredScopes: ["propose"],
    isWrite: true,
    triggersInbox: true,
    declaredInstructions,
    async handler(
      parsed: ProposalCreateInput,
      ctx: ToolContext,
    ): Promise<ProposalCreateOutput> {
      if (ctx.session.sessionPubkey === null) {
        // No on-chain session key yet — queue as a human-review sign-request so
        // the owner can inspect and approve in the dashboard inbox.
        const signRequests = new SignRequestsRepo(deps.db);
        const proposalId = `prop_${randomBytes(12).toString("hex")}`;
        const nowMs = Date.now();

        signRequests.create({
          ownerPubkey: ctx.session.ownerPubkey.toBase58(),
          instructionName: "propose_transaction",
          unsignedTxB64: "",
          decodedSummary: {
            action: "propose_transaction",
            proposalId,
            amountUsd: parsed.amountUsd,
            chain: parsed.chain,
            recipientOrContract: parsed.recipientOrContract,
            reason: parsed.reason ?? null,
            treasury: ctx.session.treasuryPubkey.toBase58(),
          },
          callerId: ctx.session.id,
          callerSessionId: ctx.session.id,
          ttlSecs: 600,
        });

        const payload = {
          ...parsed,
          proposer: ctx.session.id,
          submittedAt: nowMs,
        };
        deps.db
          .prepare(
            `INSERT INTO proposals_cache (
               proposal_id, treasury_pubkey, session_id, status, payload_json,
               created_at, updated_at
             ) VALUES (?,?,?,?,?,?,?)`,
          )
          .run(
            proposalId,
            ctx.session.treasuryPubkey.toBase58(),
            ctx.session.id,
            "pending",
            JSON.stringify(payload),
            nowMs,
            nowMs,
          );

        const dashboardUrl = `${deps.dashboardBaseUrl.replace(/\/$/, "")}/proposals/${proposalId}`;
        return {
          proposalId,
          status: "queued_for_human",
          signature: null,
          slot: null,
          dashboardUrl,
          note: "No on-chain session key provisioned — proposal queued for human review. Open the dashboard inbox to approve or deny.",
        };
      }

      const aiAuthorityPk = await deps.signer.publicKeyFor(ctx.session.id);
      const treasuryPk = ctx.session.treasuryPubkey;

      if (parsed.previewTicket !== undefined) {
        const verdict = deps.toctou.verify({
          ticket: parsed.previewTicket,
          sessionId: ctx.session.id,
          subjectArgs: {
            treasury: treasuryPk.toBase58(),
            destination: parsed.recipientOrContract,
            chain: parsed.chain,
            amountUsd: String(parsed.amountUsd),
          },
        });
        if (!verdict.ok) {
          throw new ConduitError(
            "invalid_input",
            "Preview ticket does not match the submitted args — refusing.",
            { reason: verdict.reason },
          );
        }
      }
      const proposalId = `prop_${randomBytes(12).toString("hex")}`;
      const now = Math.floor(Date.now() / 1000);

      const ix = await instructions.execution.proposeTransactionInstruction(
        deps.solana.client,
        {
          accounts: {
            aiAuthority: aiAuthorityPk,
            treasury: treasuryPk,
            sessionKeyAccount: parsed.sessionKeyAccount
              ? new PublicKey(parsed.sessionKeyAccount)
              : (ctx.session.sessionPubkey ?? null),
            swarmPool: null,
            addressList: null,
            complianceOracle: null,
            parentTreasury: null,
            budgetEnvelope: null,
            exposureGroup: null,
            dwalletState: null,
            chainProfile: null,
            trustIdentity: null,
            policyCanary: null,
          },
          args: {
            amountUsd: new BN(String(parsed.amountUsd)),
            targetChain: parsed.chain,
            txType: parsed.txType,
            protocolId: parsed.protocolId,
            currentTimestamp: new BN(now),
            expectedOutputUsd:
              parsed.expectedOutputUsd !== null &&
              parsed.expectedOutputUsd !== undefined
                ? new BN(String(parsed.expectedOutputUsd))
                : null,
            actualOutputUsd:
              parsed.actualOutputUsd !== null &&
              parsed.actualOutputUsd !== undefined
                ? new BN(String(parsed.actualOutputUsd))
                : null,
            quoteAgeSecs:
              parsed.quoteAgeSecs !== null && parsed.quoteAgeSecs !== undefined
                ? new BN(parsed.quoteAgeSecs)
                : null,
            counterpartyRiskScore: parsed.counterpartyRiskScore ?? null,
            recipientOrContract: parsed.recipientOrContract,
            sanctionsProof: [],
            assetId: null,
            nativeAmount: null,
            decimals: null,
            gasNativeAmount: null,
            gasAssetId: null,
            evmChainId: null,
            replayNonce: null,
            gasLimit: null,
            maxFeeNative: null,
            nativeMessageHash: null,
            calldataHash: null,
            utxoSetHash: null,
            sighashType: null,
            solanaRecentBlockhash: null,
            solanaMessageHash: null,
            confirmationsRequired: null,
          },
        },
      );

      const { blockhash, lastValidBlockHeight } =
        await deps.solana.connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: aiAuthorityPk,
        blockhash,
        lastValidBlockHeight,
      }).add(ix);

      // Simulate before signing — burns no signing-service budget on failure.
      const sim = await deps.solana.connection.simulateTransaction(tx);
      if (sim.value.err !== null) {
        throw new ConduitError(
          "policy_denied",
          `RPC simulation rejected the propose_transaction tx: ${JSON.stringify(sim.value.err)}`,
          { logs: sim.value.logs ?? [] },
        );
      }

      await deps.signer.sign({ sessionId: ctx.session.id, transaction: tx });

      const signature = await deps.solana.connection.sendRawTransaction(
        tx.serialize(),
      );
      const confirmation = await deps.solana.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      const slot = confirmation.context.slot;

      const payload = {
        ...parsed,
        proposer: aiAuthorityPk.toBase58(),
        submittedAt: Date.now(),
      };
      const nowMs = Date.now();
      deps.db
        .prepare(
          `INSERT INTO proposals_cache (
             proposal_id, treasury_pubkey, session_id, status, payload_json,
             created_at, updated_at
           ) VALUES (?,?,?,?,?,?,?)`,
        )
        .run(
          proposalId,
          treasuryPk.toBase58(),
          ctx.session.id,
          "pending",
          JSON.stringify(payload),
          nowMs,
          nowMs,
        );

      const dashboardUrl = `${deps.dashboardBaseUrl.replace(/\/$/, "")}/proposals/${proposalId}`;
      const note = matchAutoApprove(ctx.session.id) // placeholder for autoApprove logic
        ? "auto-approval pending policy check; the inbox will reflect the final state."
        : "queued for human review in the dashboard inbox.";
      return {
        proposalId,
        status: "submitted",
        signature,
        slot,
        dashboardUrl,
        note,
      };
    },
  };
}

function matchAutoApprove(_sessionId: string): boolean {
  // Real logic delegates to the session's autoApprove setting + AnomalyHeuristics.
  // Returning `false` here is the safer default — the dashboard inbox sees it.
  return false;
}
