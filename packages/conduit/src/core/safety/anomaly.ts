/**
 * Anomaly heuristics. Flag-but-don't-block — the dispatcher consults this on
 * writes; results route to the inbox even when caps allow auto-approve.
 *
 * Two deterministic rules:
 *   (a) novelty — destination unseen for this treasury within the window
 *   (b) amount — > Nσ above the trailing-window mean of recorded amounts
 *
 * Both versioned and logged with the proposal.
 */

import type { ConduitDb } from "../control-plane/db.js";

export interface AnomalyOptions {
  db: ConduitDb;
  noveltyWindowDays?: number;
  amountStdDevs?: number;
  now?: () => number;
}

export interface AnomalyResult {
  readonly noveltyFlagged: boolean;
  readonly amountFlagged: boolean;
  readonly heuristicsVersion: number;
}

const HEURISTICS_VERSION = 1;

export class AnomalyHeuristics {
  private readonly db: ConduitDb;
  private readonly noveltyWindowMs: number;
  private readonly amountStdDevs: number;
  private readonly now: () => number;

  constructor(options: AnomalyOptions) {
    this.db = options.db;
    this.noveltyWindowMs = (options.noveltyWindowDays ?? 30) * 86_400_000;
    this.amountStdDevs = options.amountStdDevs ?? 2;
    this.now = options.now ?? (() => Date.now());
  }

  observeDestination(treasuryPubkey: string, destination: string): void {
    const now = this.now();
    this.db
      .prepare(
        `INSERT INTO anomaly_destinations (treasury_pubkey, destination, first_seen, last_seen, sample_count)
         VALUES (?,?,?,?,1)
         ON CONFLICT(treasury_pubkey, destination) DO UPDATE
           SET last_seen=excluded.last_seen, sample_count=sample_count+1`,
      )
      .run(treasuryPubkey, destination, now, now);
  }

  evaluate(
    treasuryPubkey: string,
    destination: string,
    amountUsd: bigint,
  ): AnomalyResult {
    return {
      noveltyFlagged: this.isNovel(treasuryPubkey, destination),
      amountFlagged: this.isAmountOutlier(treasuryPubkey, amountUsd),
      heuristicsVersion: HEURISTICS_VERSION,
    };
  }

  private isNovel(treasuryPubkey: string, destination: string): boolean {
    const cutoff = this.now() - this.noveltyWindowMs;
    const row = this.db
      .prepare(
        `SELECT first_seen FROM anomaly_destinations
         WHERE treasury_pubkey=? AND destination=? AND first_seen >= ?`,
      )
      .get(treasuryPubkey, destination, cutoff) as
      | { first_seen: number }
      | undefined;
    return row === undefined;
  }

  private isAmountOutlier(treasuryPubkey: string, amountUsd: bigint): boolean {
    const cutoff = this.now() - this.noveltyWindowMs;
    const rows = this.db
      .prepare(
        `SELECT payload_json FROM proposals_cache
         WHERE treasury_pubkey=? AND created_at >= ?`,
      )
      .all(treasuryPubkey, cutoff) as ReadonlyArray<{ payload_json: string }>;
    if (rows.length < 5) return false;
    const amounts: number[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.payload_json) as { amountUsd?: number };
        if (typeof parsed.amountUsd === "number")
          amounts.push(parsed.amountUsd);
      } catch {
        // ignore malformed cache entries
      }
    }
    if (amounts.length < 5) return false;
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length;
    const stddev = Math.sqrt(variance);
    const threshold = mean + this.amountStdDevs * stddev;
    return Number(amountUsd) > threshold;
  }
}
