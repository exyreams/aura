/**
 * SQLite-backed idempotency store. Used in production so a Conduit restart
 * doesn't reset the 24h dedup window. Drop-in for the in-memory dev store.
 */

import type {
  IdempotencyKeyParts,
  IdempotencyStore,
  RecordedResult,
} from "../idempotency.js";
import { computeIdempotencyKey } from "../idempotency.js";
import type { ConduitDb } from "./db.js";

export interface SqliteIdempotencyOptions {
  db: ConduitDb;
  ttlMs?: number;
  now?: () => number;
}

export function createSqliteIdempotencyStore(
  options: SqliteIdempotencyOptions,
): IdempotencyStore {
  const ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
  const now = options.now ?? (() => Date.now());
  const db = options.db;
  return {
    computeKey(parts: IdempotencyKeyParts): string {
      return computeIdempotencyKey(parts);
    },
    get(key: string): RecordedResult | undefined {
      const cutoff = now() - ttlMs;
      const row = db
        .prepare(
          `SELECT key, value_json, created_at FROM idempotency WHERE key=? AND created_at>=?`,
        )
        .get(key, cutoff) as
        | { key: string; value_json: string; created_at: number }
        | undefined;
      if (row === undefined) return undefined;
      return {
        key: row.key,
        storedAt: row.created_at,
        value: JSON.parse(row.value_json),
      };
    },
    put(key: string, value: unknown): void {
      const t = now();
      db.prepare(
        `INSERT INTO idempotency (key, session_id, tool, value_json, created_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, created_at=excluded.created_at`,
      ).run(key, "", "", JSON.stringify(value), t);
    },
    size(): number {
      const cutoff = now() - ttlMs;
      const row = db
        .prepare(`SELECT COUNT(*) AS n FROM idempotency WHERE created_at>=?`)
        .get(cutoff) as { n: number };
      return row.n;
    },
  };
}
