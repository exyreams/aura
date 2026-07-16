import { randomBytes } from "node:crypto";
import { Transaction } from "@solana/web3.js";

import type { ConduitDb } from "../control-plane/db.js";
import { SignRequestsRepo } from "../control-plane/sign-requests.js";
import { ConduitError } from "../errors.js";
import { buildProgramInstruction } from "../instructions.js";
import type { SolanaContext } from "../solana.js";
import type { ToolContext } from "../types.js";

type JsonRecord = Record<string, unknown>;

export interface QueueOwnerInstructionParams {
  readonly instruction: string;
  readonly accounts: JsonRecord;
  readonly args: JsonRecord | unknown[];
  readonly reason?: string | null;
  readonly ttlSecs: number;
  readonly action?: string;
  readonly summary?: JsonRecord;
}

export interface QueuedOwnerInstructionOutput {
  readonly signRequestId: string;
  readonly instruction: string;
  readonly status: "queued_for_human";
  readonly expiresAt: number;
  readonly requiredSigners: readonly string[];
  readonly signerAccounts: readonly string[];
  readonly ownerSignatureRequired: boolean;
  readonly safety: Awaited<
    ReturnType<typeof buildProgramInstruction>
  >["schema"]["safety"];
  readonly normalizedAccounts: Record<string, unknown>;
  readonly normalizedArgs: unknown[];
  readonly note: string;
}

export interface QueueOwnerInstructionDeps {
  readonly db: ConduitDb;
  readonly solana: SolanaContext;
}

export async function queueOwnerInstructionSignRequest(
  deps: QueueOwnerInstructionDeps,
  ctx: ToolContext,
  params: QueueOwnerInstructionParams,
): Promise<QueuedOwnerInstructionOutput> {
  try {
    const build = await buildProgramInstruction(
      deps.solana.client,
      {
        instruction: params.instruction,
        accounts: params.accounts,
        args: params.args,
      },
      {
        programId: deps.solana.programId,
        defaultSigner: ctx.session.ownerPubkey,
      },
    );
    const { blockhash, lastValidBlockHeight } =
      await deps.solana.connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({
      feePayer: ctx.session.ownerPubkey,
      blockhash,
      lastValidBlockHeight,
    }).add(build.instruction);
    const unsignedTxB64 = tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64");

    const row = new SignRequestsRepo(deps.db).create({
      ownerPubkey: ctx.session.ownerPubkey.toBase58(),
      instructionName: build.schema.name,
      unsignedTxB64,
      decodedSummary: {
        action: params.action ?? "instruction_request_signature",
        instruction: build.schema.name,
        signerAccounts: build.signerAccounts,
        requiredSigners: build.requiredSigners,
        ownerSignatureRequired: build.ownerSignatureRequired,
        safety: build.schema.safety,
        reason: params.reason ?? null,
        normalizedAccounts: build.normalizedAccounts,
        normalizedArgs: build.normalizedArgs,
        blockhash,
        lastValidBlockHeight,
        nonce: randomBytes(12).toString("hex"),
        ...(params.summary ?? {}),
      },
      callerId: ctx.session.id,
      callerSessionId: ctx.session.id,
      ttlSecs: params.ttlSecs,
    });

    return {
      signRequestId: row.id,
      instruction: build.schema.name,
      status: "queued_for_human",
      expiresAt: row.expiresAt,
      requiredSigners: build.requiredSigners,
      signerAccounts: build.signerAccounts,
      ownerSignatureRequired: build.ownerSignatureRequired,
      safety: build.schema.safety,
      normalizedAccounts: build.normalizedAccounts,
      normalizedArgs: build.normalizedArgs,
      note: "Queued for human review. Conduit did not sign or submit this owner-grade transaction.",
    };
  } catch (error) {
    if (error instanceof ConduitError) {
      throw error;
    }
    throw new ConduitError(
      "invalid_input",
      error instanceof Error ? error.message : String(error),
    );
  }
}
