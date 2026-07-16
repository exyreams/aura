/**
 * Single dispatch path used by every transport.
 *
 * Each transport translates its incoming envelope into a `DispatchRequest`
 * and calls `dispatchTool`, so schema parsing, scope checks, rate limiting,
 * circuit-breaker, idempotency, anomaly flagging, audit logging, and heartbeat
 * recording behave identically across MCP and HTTP.
 */

import { randomUUID } from "node:crypto";
import type { AuditLogger } from "./audit.js";
import { buildEntry } from "./audit.js";
import { ConduitError, isConduitError } from "./errors.js";
import type { IdempotencyStore } from "./idempotency.js";
import { canonicalizeArgs } from "./idempotency.js";
import type { ToolRegistry } from "./registry.js";
import { assertScopeAllowed } from "./scopes.js";
import type { Session, Tool } from "./types.js";

/** Optional safety hooks; when omitted, dispatch behaves as before. */
export interface SafetyHooks {
  /** Charge the per-session bucket; throws `rate_limited` when busted. */
  readonly consumeRateLimit?: (
    sessionId: string,
    kind: "read" | "write",
  ) => void;
  /** Throws `forbidden` if the treasury's circuit breaker has tripped. */
  readonly assertNotPaused?: (treasuryPubkey: string) => void;
  /** Increments the rejection counter for a treasury. */
  readonly recordRejection?: (treasuryPubkey: string, reason: string) => void;
  /** Liveness signal: marks the session as active. */
  readonly recordSessionUse?: (sessionId: string) => void;
  /** Records anomaly observations for write tools. */
  readonly observeWrite?: (treasuryPubkey: string, args: unknown) => void;
}

export interface DispatchRequest {
  readonly toolName: string;
  readonly rawInput: unknown;
  readonly session: Session;
  readonly callerIdempotencyKey?: string;
  readonly signal?: AbortSignal;
  readonly requestId?: string;
}

export interface DispatchSuccess {
  readonly ok: true;
  readonly tool: string;
  readonly requestId: string;
  readonly idempotent: boolean;
  readonly value: unknown;
}

export interface DispatchFailure {
  readonly ok: false;
  readonly tool: string;
  readonly requestId: string;
  readonly error: {
    code: string;
    message: string;
    detail?: Record<string, unknown>;
  };
}

export type DispatchResult = DispatchSuccess | DispatchFailure;

export interface DispatchDeps {
  readonly registry: ToolRegistry;
  readonly audit: AuditLogger;
  readonly idempotency: IdempotencyStore;
  readonly safety?: SafetyHooks;
}

export async function dispatchTool(
  deps: DispatchDeps,
  request: DispatchRequest,
): Promise<DispatchResult> {
  const requestId = request.requestId ?? randomUUID();
  const startedAt = Date.now();
  const tool = deps.registry.get(request.toolName);

  if (tool === undefined) {
    return failure(
      deps,
      request,
      tool,
      requestId,
      startedAt,
      "",
      new ConduitError("not_found", `Unknown tool: ${request.toolName}`),
    );
  }

  // Liveness signal first — even rejected calls indicate the agent is alive.
  deps.safety?.recordSessionUse?.(request.session.id);

  try {
    assertScopeAllowed(request.session, tool);
  } catch (error) {
    return failure(
      deps,
      request,
      tool,
      requestId,
      startedAt,
      "",
      asError(error),
    );
  }

  // Circuit breaker before doing any actual work.
  const treasuryPubkey = request.session.treasuryPubkey.toBase58();
  try {
    deps.safety?.assertNotPaused?.(treasuryPubkey);
  } catch (error) {
    return failure(
      deps,
      request,
      tool,
      requestId,
      startedAt,
      "",
      asError(error),
    );
  }

  // Rate limit by tool kind. Write tools also count against read budget so a
  // proposal storm doesn't quietly succeed via a read-only token.
  try {
    deps.safety?.consumeRateLimit?.(
      request.session.id,
      tool.isWrite ? "write" : "read",
    );
  } catch (error) {
    return failure(
      deps,
      request,
      tool,
      requestId,
      startedAt,
      "",
      asError(error),
    );
  }

  let parsed: unknown;
  try {
    parsed = tool.input.parse(request.rawInput);
  } catch (error) {
    const conduitError = new ConduitError(
      "invalid_input",
      "Input does not match the tool's schema.",
      { issues: serializeZodError(error) },
    );
    return failure(deps, request, tool, requestId, startedAt, "", conduitError);
  }

  const canonicalArgs = canonicalizeArgs(parsed);
  const idempotencyKey = deps.idempotency.computeKey({
    sessionId: request.session.id,
    tool: tool.name,
    canonicalArgs,
    callerKey: request.callerIdempotencyKey,
  });

  const prior = deps.idempotency.get(idempotencyKey);
  if (prior !== undefined) {
    deps.audit.record(
      buildEntry({
        requestId,
        session: request.session,
        tool: tool.name,
        canonicalArgs,
        outcome: "ok",
        startedAt,
      }),
    );
    return {
      ok: true,
      tool: tool.name,
      requestId,
      idempotent: true,
      value: prior.value,
    };
  }

  try {
    const ctx = {
      session: request.session,
      audit: deps.audit,
      idempotency: deps.idempotency,
      signal: request.signal ?? new AbortController().signal,
      requestId,
    };
    const value = await tool.handler(parsed, ctx);
    deps.idempotency.put(idempotencyKey, value);
    if (tool.isWrite) deps.safety?.observeWrite?.(treasuryPubkey, parsed);
    deps.audit.record(
      buildEntry({
        requestId,
        session: request.session,
        tool: tool.name,
        canonicalArgs,
        outcome: "ok",
        startedAt,
      }),
    );
    return { ok: true, tool: tool.name, requestId, idempotent: false, value };
  } catch (error) {
    return failure(
      deps,
      request,
      tool,
      requestId,
      startedAt,
      canonicalArgs,
      asError(error),
    );
  }
}

function failure(
  deps: DispatchDeps,
  request: DispatchRequest,
  tool: Tool | undefined,
  requestId: string,
  startedAt: number,
  canonicalArgs: string,
  error: ConduitError,
): DispatchFailure {
  if (tool !== undefined) {
    if (REJECTION_CODES.has(error.code)) {
      deps.safety?.recordRejection?.(
        request.session.treasuryPubkey.toBase58(),
        `${tool.name}:${error.code}`,
      );
    }
    deps.audit.record(
      buildEntry({
        requestId,
        session: request.session,
        tool: tool.name,
        canonicalArgs,
        outcome: error.code === "policy_denied" ? "policy_denied" : "error",
        errorCode: error.code,
        startedAt,
      }),
    );
  }
  return {
    ok: false,
    tool: tool?.name ?? request.toolName,
    requestId,
    error: error.toJSON(),
  };
}

const REJECTION_CODES = new Set<string>([
  "policy_denied",
  "rate_limited",
  "forbidden",
  "invalid_input",
]);

function asError(error: unknown): ConduitError {
  if (isConduitError(error)) return error;
  if (error instanceof Error) {
    return new ConduitError("internal", error.message);
  }
  return new ConduitError("internal", "Unknown internal error");
}

function serializeZodError(error: unknown): unknown {
  if (
    error !== null &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown }).issues)
  ) {
    return (error as { issues: unknown }).issues;
  }
  return error instanceof Error ? error.message : String(error);
}
