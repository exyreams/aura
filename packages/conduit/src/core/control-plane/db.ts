/**
 * Conduit control-plane SQLite store.
 *
 * Holds: sessions, device-codes, sign-requests, audit log, idempotency,
 * circuit-breaker state, rate-limit buckets, and a proposals cache. The chain
 * remains the canonical source for proposal state and SessionKeyAccount caps;
 * these tables exist to make the agent-facing surface low-latency, auditable,
 * and resilient to RPC outages.
 *
 * Default location: `~/.aura-conduit/conduit.db`. Override via env or option.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

export type ConduitDb = Database.Database;

export interface OpenDbOptions {
  /** Absolute path. Defaults to `~/.aura-conduit/conduit.db` or `CONDUIT_DB_PATH`. */
  path?: string;
  /** When true, opens in-memory. Used by tests. */
  inMemory?: boolean;
}

export function defaultDbPath(): string {
  const fromEnv = process.env.CONDUIT_DB_PATH;
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  return join(homedir(), ".aura-conduit", "conduit.db");
}

export function openConduitDb(options: OpenDbOptions = {}): ConduitDb {
  const path = options.inMemory
    ? ":memory:"
    : (options.path ?? defaultDbPath());
  if (!options.inMemory) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  runMigrations(db);
  return db;
}

function runMigrations(db: ConduitDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
  const current = (
    db
      .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_version")
      .get() as { v: number }
  ).v;
  if (current < 1) {
    db.exec(MIGRATION_V1);
    db.prepare(
      "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
    ).run(1, Date.now());
  }
}

const MIGRATION_V1 = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    agent_id TEXT NOT NULL,
    owner_pubkey TEXT NOT NULL,
    treasury_pubkey TEXT NOT NULL,
    session_pubkey TEXT,
    session_sk_wrapped BLOB,
    scopes TEXT NOT NULL,
    auto_approve TEXT NOT NULL,
    caps_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    protocol_version INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    last_seen_at INTEGER
  );
  CREATE INDEX sessions_token_hash ON sessions(token_hash);
  CREATE INDEX sessions_treasury ON sessions(treasury_pubkey);
  CREATE INDEX sessions_owner ON sessions(owner_pubkey);

  CREATE TABLE device_codes (
    device_code TEXT PRIMARY KEY,
    user_code TEXT NOT NULL UNIQUE,
    requested_scopes TEXT NOT NULL,
    requested_caps_json TEXT NOT NULL,
    requested_agent_id TEXT NOT NULL,
    requested_treasury TEXT,
    client TEXT NOT NULL,
    status TEXT NOT NULL,
    approved_session_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    interval_secs INTEGER NOT NULL
  );
  CREATE INDEX device_codes_user_code ON device_codes(user_code);
  CREATE INDEX device_codes_expires ON device_codes(expires_at);

  CREATE TABLE sign_requests (
    id TEXT PRIMARY KEY,
    owner_pubkey TEXT NOT NULL,
    instruction_name TEXT NOT NULL,
    unsigned_tx_b64 TEXT NOT NULL,
    decoded_summary_json TEXT NOT NULL,
    status TEXT NOT NULL,
    signed_tx_b64 TEXT,
    signature TEXT,
    caller_id TEXT NOT NULL,
    caller_session_id TEXT,
    nonce TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX sign_requests_owner ON sign_requests(owner_pubkey);
  CREATE INDEX sign_requests_status ON sign_requests(status);

  CREATE TABLE audit_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL,
    recorded_at INTEGER NOT NULL,
    session_id TEXT,
    tool TEXT NOT NULL,
    args_hash TEXT NOT NULL,
    outcome TEXT NOT NULL,
    error_code TEXT,
    signature TEXT,
    slot INTEGER,
    entry_json TEXT NOT NULL
  );
  CREATE INDEX audit_log_session ON audit_log(session_id);
  CREATE INDEX audit_log_recorded ON audit_log(recorded_at);

  CREATE TABLE idempotency (
    key TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    value_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idempotency_created ON idempotency(created_at);

  CREATE TABLE circuit_breaker (
    treasury_pubkey TEXT PRIMARY KEY,
    rejection_count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL,
    paused_until INTEGER,
    paused_reason TEXT
  );

  CREATE TABLE rate_limit_buckets (
    session_id TEXT NOT NULL,
    bucket TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (session_id, bucket)
  );

  CREATE TABLE proposals_cache (
    proposal_id TEXT PRIMARY KEY,
    treasury_pubkey TEXT NOT NULL,
    session_id TEXT,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX proposals_cache_treasury ON proposals_cache(treasury_pubkey);
  CREATE INDEX proposals_cache_session ON proposals_cache(session_id);

  CREATE TABLE anomaly_destinations (
    treasury_pubkey TEXT NOT NULL,
    destination TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    sample_count INTEGER NOT NULL,
    PRIMARY KEY (treasury_pubkey, destination)
  );
`;
