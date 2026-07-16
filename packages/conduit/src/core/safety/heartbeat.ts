/**
 * Push-channel heartbeat. If the owner is silent for K days, every session
 * for that owner auto-downgrades to `auto_approve = never`. Owner-side
 * liveness signals: dashboard login (records on the session row directly),
 * webhook ack (records via `recordOwnerActivity`), or explicit `aura ping`.
 */

import type { ConduitDb } from "../control-plane/db.js";
import { SessionsRepo } from "../control-plane/sessions.js";

export interface HeartbeatOptions {
  db: ConduitDb;
  /** Silence window before auto-downgrade. */
  silenceWindowDays?: number;
  now?: () => number;
}

export class HeartbeatMonitor {
  private readonly db: ConduitDb;
  private readonly sessions: SessionsRepo;
  private readonly silenceWindowMs: number;
  private readonly now: () => number;

  constructor(options: HeartbeatOptions) {
    this.db = options.db;
    this.sessions = new SessionsRepo(this.db);
    this.silenceWindowMs = (options.silenceWindowDays ?? 14) * 86_400_000;
    this.now = options.now ?? (() => Date.now());
  }

  recordOwnerActivity(ownerPubkey: string): void {
    const now = this.now();
    this.db
      .prepare(`UPDATE sessions SET last_seen_at=? WHERE owner_pubkey=?`)
      .run(now, ownerPubkey);
  }

  recordSessionUse(sessionId: string): void {
    this.sessions.recordHeartbeat(sessionId, this.now());
  }

  /**
   * Sweeps sessions whose `last_seen_at` is older than the silence window AND
   * whose `auto_approve` is currently anything other than `never`. Returns the
   * list of session ids that were downgraded.
   */
  sweepAndDowngrade(): ReadonlyArray<string> {
    const cutoff = this.now() - this.silenceWindowMs;
    const candidates = this.db
      .prepare(
        `SELECT id FROM sessions
         WHERE revoked_at IS NULL
           AND auto_approve != 'never'
           AND (last_seen_at IS NULL OR last_seen_at < ?)`,
      )
      .all(cutoff) as ReadonlyArray<{ id: string }>;
    for (const row of candidates) {
      this.sessions.downgradeAutoApprove(row.id, "never");
    }
    return candidates.map((r) => r.id);
  }
}
