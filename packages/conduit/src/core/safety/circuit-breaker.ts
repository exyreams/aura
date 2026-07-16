/**
 * Per-treasury circuit breaker. Counts rejection-class outcomes
 * (policy_denied, rate_limited, invalid_input on writes) within a rolling
 * window. When the count exceeds the threshold, the treasury auto-pauses —
 * subsequent calls fail with `forbidden` until the pause elapses or an owner
 * resets it.
 */

import type { ConduitDb } from "../control-plane/db.js";
import { ConduitError } from "../errors.js";

export interface CircuitBreakerOptions {
  db: ConduitDb;
  /** N rejections within M seconds → pause. */
  thresholdN?: number;
  thresholdWindowSecs?: number;
  pauseDurationSecs?: number;
  now?: () => number;
}

export class CircuitBreaker {
  private readonly db: ConduitDb;
  private readonly thresholdN: number;
  private readonly thresholdWindowMs: number;
  private readonly pauseDurationMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions) {
    this.db = options.db;
    this.thresholdN = options.thresholdN ?? 5;
    this.thresholdWindowMs = (options.thresholdWindowSecs ?? 60) * 1000;
    this.pauseDurationMs = (options.pauseDurationSecs ?? 600) * 1000;
    this.now = options.now ?? (() => Date.now());
  }

  assertNotPaused(treasuryPubkey: string): void {
    const row = this.db
      .prepare(
        `SELECT paused_until, paused_reason FROM circuit_breaker WHERE treasury_pubkey=?`,
      )
      .get(treasuryPubkey) as
      | { paused_until: number | null; paused_reason: string | null }
      | undefined;
    if (row?.paused_until && row.paused_until > this.now()) {
      throw new ConduitError(
        "forbidden",
        `treasury circuit breaker tripped: ${row.paused_reason ?? "too many rejections"}`,
        { pausedUntil: row.paused_until },
      );
    }
  }

  recordRejection(treasuryPubkey: string, reason: string): void {
    const now = this.now();
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare(
          `SELECT rejection_count, window_start FROM circuit_breaker WHERE treasury_pubkey=?`,
        )
        .get(treasuryPubkey) as
        | { rejection_count: number; window_start: number }
        | undefined;

      if (
        row === undefined ||
        now - row.window_start > this.thresholdWindowMs
      ) {
        this.db
          .prepare(
            `INSERT INTO circuit_breaker (treasury_pubkey, rejection_count, window_start)
             VALUES (?,1,?)
             ON CONFLICT(treasury_pubkey) DO UPDATE SET rejection_count=1, window_start=excluded.window_start, paused_until=NULL, paused_reason=NULL`,
          )
          .run(treasuryPubkey, now);
        return;
      }
      const next = row.rejection_count + 1;
      if (next >= this.thresholdN) {
        this.db
          .prepare(
            `UPDATE circuit_breaker
             SET rejection_count=?, paused_until=?, paused_reason=?
             WHERE treasury_pubkey=?`,
          )
          .run(next, now + this.pauseDurationMs, reason, treasuryPubkey);
      } else {
        this.db
          .prepare(
            `UPDATE circuit_breaker SET rejection_count=? WHERE treasury_pubkey=?`,
          )
          .run(next, treasuryPubkey);
      }
    });
    tx();
  }

  reset(treasuryPubkey: string): void {
    this.db
      .prepare(
        `UPDATE circuit_breaker SET rejection_count=0, paused_until=NULL, paused_reason=NULL WHERE treasury_pubkey=?`,
      )
      .run(treasuryPubkey);
  }
}
