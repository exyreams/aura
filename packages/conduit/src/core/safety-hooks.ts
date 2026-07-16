/**
 * Factory for the production `SafetyHooks` wired against the control-plane
 * DB. Transports use this so they all enforce the same caps and breakers.
 */

import type { ConduitDb } from "./control-plane/db.js";
import { SessionsRepo } from "./control-plane/sessions.js";
import type { SafetyHooks } from "./dispatch.js";
import { canonicalizeArgs } from "./idempotency.js";
import { AnomalyHeuristics } from "./safety/anomaly.js";
import { CircuitBreaker } from "./safety/circuit-breaker.js";
import { RateLimiter } from "./safety/rate-limit.js";

export interface ProductionSafetyOptions {
  readonly db: ConduitDb;
  readonly rateLimiter?: RateLimiter;
  readonly circuitBreaker?: CircuitBreaker;
  readonly anomaly?: AnomalyHeuristics;
}

export function buildSafetyHooks(
  options: ProductionSafetyOptions,
): SafetyHooks {
  const sessions = new SessionsRepo(options.db);
  const rateLimiter =
    options.rateLimiter ?? new RateLimiter({ db: options.db });
  const breaker =
    options.circuitBreaker ?? new CircuitBreaker({ db: options.db });
  const anomaly = options.anomaly ?? new AnomalyHeuristics({ db: options.db });

  return {
    consumeRateLimit(sessionId, kind) {
      rateLimiter.consume(sessionId, kind);
    },
    assertNotPaused(treasuryPubkey) {
      breaker.assertNotPaused(treasuryPubkey);
    },
    recordRejection(treasuryPubkey, reason) {
      breaker.recordRejection(treasuryPubkey, reason);
    },
    recordSessionUse(sessionId) {
      sessions.recordHeartbeat(sessionId);
    },
    observeWrite(treasuryPubkey, args) {
      // Walk the canonicalised args for a `destination` / `recipientOrContract`
      // field; if found, record it for novelty tracking.
      const destination = findDestination(args);
      if (destination !== undefined) {
        anomaly.observeDestination(treasuryPubkey, destination);
      }
      // Reduce noise: serialise and discard if needed.
      void canonicalizeArgs;
    },
  };
}

function findDestination(args: unknown): string | undefined {
  if (args === null || typeof args !== "object") return undefined;
  const record = args as Record<string, unknown>;
  for (const key of ["destination", "recipientOrContract", "recipient", "to"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}
