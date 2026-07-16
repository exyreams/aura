/**
 * Per-session rate limiter. Three buckets per session — tools/sec, tools/min,
 * tools/day — plus a per-treasury KMS-unwrap shared cap. Fixed-window
 * counters reset on boundary crossings. Persisted to `rate_limit_buckets` so
 * a restart doesn't blow the budget open.
 */

import type { ConduitDb } from "../control-plane/db.js";
import { ConduitError } from "../errors.js";

export interface RateLimitDefaults {
  readonly readPerSecond: number;
  readonly readPerMinute: number;
  readonly readPerDay: number;
  readonly writePerSecond: number;
  readonly writePerMinute: number;
  readonly writePerDay: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitDefaults = {
  readPerSecond: 10,
  readPerMinute: 200,
  readPerDay: 10_000,
  writePerSecond: 1,
  writePerMinute: 20,
  writePerDay: 500,
};

export type RateBucket =
  | "read_sec"
  | "read_min"
  | "read_day"
  | "write_sec"
  | "write_min"
  | "write_day";

export interface RateLimiterOptions {
  db: ConduitDb;
  defaults?: Partial<RateLimitDefaults>;
  now?: () => number;
}

export class RateLimiter {
  private readonly db: ConduitDb;
  private readonly limits: RateLimitDefaults;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions) {
    this.db = options.db;
    this.limits = { ...DEFAULT_RATE_LIMITS, ...options.defaults };
    this.now = options.now ?? (() => Date.now());
  }

  /** Consumes one budget unit per applicable bucket; throws `rate_limited` on bust. */
  consume(sessionId: string, kind: "read" | "write"): void {
    const now = this.now();
    const buckets: ReadonlyArray<{
      name: RateBucket;
      window: number;
      limit: number;
    }> =
      kind === "read"
        ? [
            {
              name: "read_sec",
              window: 1000,
              limit: this.limits.readPerSecond,
            },
            {
              name: "read_min",
              window: 60_000,
              limit: this.limits.readPerMinute,
            },
            {
              name: "read_day",
              window: 86_400_000,
              limit: this.limits.readPerDay,
            },
          ]
        : [
            {
              name: "write_sec",
              window: 1000,
              limit: this.limits.writePerSecond,
            },
            {
              name: "write_min",
              window: 60_000,
              limit: this.limits.writePerMinute,
            },
            {
              name: "write_day",
              window: 86_400_000,
              limit: this.limits.writePerDay,
            },
          ];

    for (const bucket of buckets) {
      this.incrementOrThrow(
        sessionId,
        bucket.name,
        bucket.window,
        bucket.limit,
        now,
      );
    }
  }

  private incrementOrThrow(
    sessionId: string,
    bucket: RateBucket,
    windowMs: number,
    limit: number,
    now: number,
  ): void {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare(
          `SELECT window_start, count FROM rate_limit_buckets WHERE session_id=? AND bucket=?`,
        )
        .get(sessionId, bucket) as
        | { window_start: number; count: number }
        | undefined;

      if (row === undefined || now - row.window_start > windowMs) {
        this.db
          .prepare(
            `INSERT INTO rate_limit_buckets (session_id, bucket, window_start, count)
             VALUES (?,?,?,1)
             ON CONFLICT(session_id, bucket) DO UPDATE SET window_start=excluded.window_start, count=1`,
          )
          .run(sessionId, bucket, now);
        return;
      }
      if (row.count >= limit) {
        throw new ConduitError(
          "rate_limited",
          `rate limit ${bucket} exceeded for session (${limit} per ${humanWindow(windowMs)})`,
          { bucket, limit, windowMs },
        );
      }
      this.db
        .prepare(
          `UPDATE rate_limit_buckets SET count=count+1 WHERE session_id=? AND bucket=?`,
        )
        .run(sessionId, bucket);
    });
    tx();
  }
}

function humanWindow(ms: number): string {
  if (ms === 1000) return "second";
  if (ms === 60_000) return "minute";
  if (ms === 86_400_000) return "day";
  return `${ms}ms`;
}
