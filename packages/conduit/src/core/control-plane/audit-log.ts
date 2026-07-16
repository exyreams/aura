/**
 * Append-only, hash-chained audit log. Each row references the previous
 * row's hash; tampering is detectable by recomputing the chain. On-chain
 * Merkle anchoring is published separately via `conduit audit anchor`.
 */

import { createHash } from "node:crypto";

import type { ConduitDb } from "./db.js";

export interface AppendEntry {
  readonly recordedAt: number;
  readonly sessionId: string | null;
  readonly tool: string;
  readonly argsHash: string;
  readonly outcome: string;
  readonly errorCode?: string | null;
  readonly signature?: string | null;
  readonly slot?: number | null;
  readonly extra?: Record<string, unknown>;
}

export interface ChainedEntry extends AppendEntry {
  readonly seq: number;
  readonly prevHash: string;
  readonly hash: string;
}

export class HashChainedAuditLog {
  constructor(private readonly db: ConduitDb) {}

  append(entry: AppendEntry): ChainedEntry {
    const last = this.db
      .prepare(`SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1`)
      .get() as { seq: number; hash: string } | undefined;
    const prevHash = last?.hash ?? GENESIS_HASH;
    const fullEntry = { ...entry };
    const entryJson = canonicalize(fullEntry);
    const hash = chainHash(prevHash, entryJson);

    const info = this.db
      .prepare(
        `INSERT INTO audit_log (
           prev_hash, hash, recorded_at, session_id, tool, args_hash,
           outcome, error_code, signature, slot, entry_json
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        prevHash,
        hash,
        entry.recordedAt,
        entry.sessionId,
        entry.tool,
        entry.argsHash,
        entry.outcome,
        entry.errorCode ?? null,
        entry.signature ?? null,
        entry.slot ?? null,
        entryJson,
      );

    return {
      ...entry,
      seq: Number(info.lastInsertRowid),
      prevHash,
      hash,
    };
  }

  /** Walks the chain. Returns `{ ok: true }` if intact, else where it broke. */
  verify():
    | { ok: true }
    | { ok: false; brokenAt: number; expected: string; actual: string } {
    const rows = this.db
      .prepare(
        `SELECT seq, prev_hash, hash, entry_json FROM audit_log ORDER BY seq ASC`,
      )
      .all() as ReadonlyArray<{
      seq: number;
      prev_hash: string;
      hash: string;
      entry_json: string;
    }>;
    let prev = GENESIS_HASH;
    for (const row of rows) {
      if (row.prev_hash !== prev) {
        return {
          ok: false,
          brokenAt: row.seq,
          expected: prev,
          actual: row.prev_hash,
        };
      }
      const expected = chainHash(prev, row.entry_json);
      if (expected !== row.hash) {
        return { ok: false, brokenAt: row.seq, expected, actual: row.hash };
      }
      prev = row.hash;
    }
    return { ok: true };
  }

  /** Latest N entries, newest first. */
  tail(limit: number): ReadonlyArray<ChainedEntry> {
    const rows = this.db
      .prepare(
        `SELECT seq, prev_hash, hash, recorded_at, session_id, tool, args_hash,
                outcome, error_code, signature, slot, entry_json
         FROM audit_log ORDER BY seq DESC LIMIT ?`,
      )
      .all(limit) as ReadonlyArray<{
      seq: number;
      prev_hash: string;
      hash: string;
      recorded_at: number;
      session_id: string | null;
      tool: string;
      args_hash: string;
      outcome: string;
      error_code: string | null;
      signature: string | null;
      slot: number | null;
      entry_json: string;
    }>;
    return rows.map((row) => ({
      seq: row.seq,
      prevHash: row.prev_hash,
      hash: row.hash,
      recordedAt: row.recorded_at,
      sessionId: row.session_id,
      tool: row.tool,
      argsHash: row.args_hash,
      outcome: row.outcome,
      errorCode: row.error_code,
      signature: row.signature,
      slot: row.slot,
    }));
  }

  /** Root hash of the entire log so far. Used by the on-chain anchor. */
  rootHash(): string {
    const last = this.db
      .prepare(`SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1`)
      .get() as { hash: string } | undefined;
    return last?.hash ?? GENESIS_HASH;
  }
}

const GENESIS_HASH = "0".repeat(64);

function chainHash(prevHash: string, entryJson: string): string {
  return createHash("sha256")
    .update(prevHash)
    .update(" ")
    .update(entryJson)
    .digest("hex");
}

function canonicalize(value: unknown): string {
  return JSON.stringify(
    value,
    Object.keys(value as Record<string, unknown>).sort(),
  );
}
