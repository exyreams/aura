/**
 * Periodic sweepers — runs background maintenance jobs.
 *
 * Without these, expired device codes never transition to `expired`,
 * heartbeat downgrades never fire, stale sign requests linger, and the
 * idempotency table grows unbounded. Each job is idempotent and cheap.
 */

import type { ConduitDb } from "./control-plane/db.js";
import { DeviceCodesRepo } from "./control-plane/device-codes.js";
import { SignRequestsRepo } from "./control-plane/sign-requests.js";
import { HeartbeatMonitor } from "./safety/heartbeat.js";

export interface SchedulerOptions {
  readonly db: ConduitDb;
  readonly intervals?: {
    /** Expire stale device codes / sign requests. Default 30s. */
    expirySweepMs?: number;
    /** Run heartbeat downgrade sweep. Default 6h. */
    heartbeatSweepMs?: number;
    /** Prune idempotency rows past TTL. Default 1h. */
    idempotencyPruneMs?: number;
  };
  readonly heartbeatSilenceWindowDays?: number;
  readonly idempotencyTtlMs?: number;
  /** Test seam. */
  readonly now?: () => number;
  /** Test seam — fired after every sweep so tests can synchronise. */
  readonly onSweep?: (job: string) => void;
}

export interface RunningScheduler {
  stop(): Promise<void>;
}

const DEFAULT_EXPIRY_SWEEP_MS = 30 * 1000;
const DEFAULT_HEARTBEAT_SWEEP_MS = 6 * 60 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_PRUNE_MS = 60 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function startScheduler(options: SchedulerOptions): RunningScheduler {
  const now = options.now ?? (() => Date.now());
  const codes = new DeviceCodesRepo(options.db);
  const signRequests = new SignRequestsRepo(options.db);
  const heartbeat = new HeartbeatMonitor({
    db: options.db,
    ...(options.heartbeatSilenceWindowDays !== undefined
      ? { silenceWindowDays: options.heartbeatSilenceWindowDays }
      : {}),
    now,
  });
  const idempotencyTtlMs =
    options.idempotencyTtlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;

  function pruneIdempotency(): void {
    const cutoff = now() - idempotencyTtlMs;
    options.db
      .prepare(`DELETE FROM idempotency WHERE created_at < ?`)
      .run(cutoff);
  }

  function runExpirySweep(): void {
    codes.expireStale(now());
    signRequests.expireStale(now());
    options.onSweep?.("expiry");
  }

  function runHeartbeatSweep(): void {
    heartbeat.sweepAndDowngrade();
    options.onSweep?.("heartbeat");
  }

  function runIdempotencyPrune(): void {
    pruneIdempotency();
    options.onSweep?.("idempotency");
  }

  const expiryTimer = setInterval(
    runExpirySweep,
    options.intervals?.expirySweepMs ?? DEFAULT_EXPIRY_SWEEP_MS,
  );
  const heartbeatTimer = setInterval(
    runHeartbeatSweep,
    options.intervals?.heartbeatSweepMs ?? DEFAULT_HEARTBEAT_SWEEP_MS,
  );
  const idempotencyTimer = setInterval(
    runIdempotencyPrune,
    options.intervals?.idempotencyPruneMs ?? DEFAULT_IDEMPOTENCY_PRUNE_MS,
  );

  // Don't keep the event loop alive purely on timers.
  expiryTimer.unref();
  heartbeatTimer.unref();
  idempotencyTimer.unref();

  // Run one immediate pass so a fresh boot doesn't wait for the first tick.
  queueMicrotask(runExpirySweep);

  return {
    async stop() {
      clearInterval(expiryTimer);
      clearInterval(heartbeatTimer);
      clearInterval(idempotencyTimer);
    },
  };
}
