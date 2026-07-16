/**
 * Audit logger interface plus a no-op and a JSON-lines stream impl.
 * Production storage adds hash-chaining and on-chain anchoring on top.
 */

import { createHash } from "node:crypto";

import type { Session } from "./types.js";

export type AuditOutcome = "ok" | "error" | "rate_limited" | "policy_denied";

export interface AuditEntry {
  readonly timestamp: string;
  readonly requestId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly ownerPubkey: string;
  readonly treasuryPubkey: string;
  readonly sessionPubkey: string | null;
  readonly tool: string;
  readonly argsHash: string;
  readonly outcome: AuditOutcome;
  readonly errorCode?: string;
  readonly latencyMs: number;
}

export interface AuditLogger {
  record(entry: AuditEntry): void;
}

export const noopAuditLogger: AuditLogger = {
  record() {},
};

/** Emits one JSON object per line to a writable stream (e.g. `process.stderr`). */
export function createJsonLinesAuditLogger(
  stream: NodeJS.WritableStream,
): AuditLogger {
  return {
    record(entry) {
      try {
        stream.write(`${JSON.stringify(entry)}\n`);
      } catch {
        // Audit logging must never throw into the caller. Failures here are
        // dropped on the floor by design — a richer impl forwards to telemetry.
      }
    },
  };
}

export function hashArgs(canonicalArgs: string): string {
  return createHash("sha256").update(canonicalArgs).digest("hex");
}

export function buildEntry(params: {
  requestId: string;
  session: Session;
  tool: string;
  canonicalArgs: string;
  outcome: AuditOutcome;
  errorCode?: string;
  startedAt: number;
}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    requestId: params.requestId,
    sessionId: params.session.id,
    agentId: params.session.agentId,
    ownerPubkey: params.session.ownerPubkey.toBase58(),
    treasuryPubkey: params.session.treasuryPubkey.toBase58(),
    sessionPubkey: params.session.sessionPubkey?.toBase58() ?? null,
    tool: params.tool,
    argsHash: hashArgs(params.canonicalArgs),
    outcome: params.outcome,
    ...(params.errorCode !== undefined ? { errorCode: params.errorCode } : {}),
    latencyMs: Math.max(0, Date.now() - params.startedAt),
  };
}
