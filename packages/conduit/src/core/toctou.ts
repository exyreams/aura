/**
 * Time-of-check / time-of-use guard.
 *
 * `aura.policy.preview` issues a `PreviewTicket` (signed hash of the args it
 * evaluated). `aura.proposal.create` accepts an optional ticket, verifies the
 * args hash matches what's about to be submitted, and rejects on mismatch.
 * Mismatch means the agent or some middle layer mutated the action between
 * preview and submission.
 */

import { createHmac, randomBytes } from "node:crypto";

import { canonicalizeArgs } from "./idempotency.js";

export interface PreviewTicket {
  readonly ticket: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly argsHash: string;
}

export interface IssueTicketParams {
  readonly sessionId: string;
  readonly subjectArgs: unknown;
  readonly ttlSecs?: number;
}

export interface VerifyTicketParams {
  readonly ticket: string;
  readonly sessionId: string;
  readonly subjectArgs: unknown;
}

export type VerifyResult =
  | { ok: true; argsHash: string }
  | {
      ok: false;
      reason:
        | "malformed"
        | "expired"
        | "session_mismatch"
        | "args_mismatch"
        | "signature_mismatch";
    };

export class TocTouGuard {
  private readonly secret: Buffer;
  private readonly now: () => number;

  constructor(options: { secret?: Buffer; now?: () => number } = {}) {
    this.secret = options.secret ?? randomBytes(32);
    this.now = options.now ?? (() => Date.now());
  }

  issue(params: IssueTicketParams): PreviewTicket {
    const ttlSecs = params.ttlSecs ?? 120;
    const issuedAt = this.now();
    const expiresAt = issuedAt + ttlSecs * 1000;
    const argsHash = this.hashArgs(params.subjectArgs);
    const payload = `${params.sessionId}|${argsHash}|${issuedAt}|${expiresAt}`;
    const sig = this.sign(payload);
    const ticket = Buffer.from(`${payload}|${sig}`, "utf8").toString(
      "base64url",
    );
    return { ticket, issuedAt, expiresAt, argsHash };
  }

  verify(params: VerifyTicketParams): VerifyResult {
    let decoded: string;
    try {
      decoded = Buffer.from(params.ticket, "base64url").toString("utf8");
    } catch {
      return { ok: false, reason: "malformed" };
    }
    const parts = decoded.split("|");
    if (parts.length !== 5) return { ok: false, reason: "malformed" };
    const [sessionId, argsHash, issuedAtStr, expiresAtStr, sig] = parts;
    if (
      sessionId === undefined ||
      argsHash === undefined ||
      issuedAtStr === undefined ||
      expiresAtStr === undefined ||
      sig === undefined
    ) {
      return { ok: false, reason: "malformed" };
    }
    const expectedSig = this.sign(
      `${sessionId}|${argsHash}|${issuedAtStr}|${expiresAtStr}`,
    );
    if (expectedSig !== sig) return { ok: false, reason: "signature_mismatch" };
    const expiresAt = Number.parseInt(expiresAtStr, 10);
    if (Number.isNaN(expiresAt) || expiresAt < this.now()) {
      return { ok: false, reason: "expired" };
    }
    if (sessionId !== params.sessionId)
      return { ok: false, reason: "session_mismatch" };
    if (this.hashArgs(params.subjectArgs) !== argsHash)
      return { ok: false, reason: "args_mismatch" };
    return { ok: true, argsHash };
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  private hashArgs(args: unknown): string {
    return createHmac("sha256", this.secret)
      .update("args:")
      .update(canonicalizeArgs(args))
      .digest("hex");
  }
}
