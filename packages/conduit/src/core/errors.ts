/**
 * Typed errors surfaced by Conduit tools.
 *
 * Every public failure path returns one of these. The MCP and HTTP transports
 * translate them into protocol-appropriate envelopes; the codes themselves are
 * stable and safe to surface to agents.
 */

export type ConduitErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "rate_limited"
  | "policy_denied"
  | "needs_human"
  | "upstream_unavailable"
  | "internal";

export class ConduitError extends Error {
  readonly code: ConduitErrorCode;
  readonly detail: Record<string, unknown> | undefined;

  constructor(
    code: ConduitErrorCode,
    message: string,
    detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ConduitError";
    this.code = code;
    this.detail = detail;
  }

  toJSON(): {
    code: ConduitErrorCode;
    message: string;
    detail?: Record<string, unknown>;
  } {
    return this.detail === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, detail: this.detail };
  }
}

export function isConduitError(value: unknown): value is ConduitError {
  return value instanceof ConduitError;
}
