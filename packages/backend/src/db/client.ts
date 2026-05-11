import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { loadConfig } from "../config.js";
import * as schema from "./schema.js";

const config = loadConfig();

mkdirSync(path.dirname(config.databasePath), { recursive: true });

const sqlite = new Database(config.databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

function migrate() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_keypairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      label TEXT NOT NULL,
      public_key TEXT NOT NULL,
      encrypted_secret_key TEXT NOT NULL,
      encryption_iv TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS agent_keypairs_user_agent_id_idx
      ON agent_keypairs(user_id, agent_id);
    CREATE UNIQUE INDEX IF NOT EXISTS agent_keypairs_public_key_idx
      ON agent_keypairs(public_key);

    CREATE TABLE IF NOT EXISTS treasuries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_keypair_id INTEGER NOT NULL REFERENCES agent_keypairs(id) ON DELETE CASCADE,
      treasury_address TEXT NOT NULL UNIQUE,
      agent_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS treasuries_agent_keypair_agent_id_idx
      ON treasuries(agent_keypair_id, agent_id);

    CREATE TABLE IF NOT EXISTS dkg_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_keypair_id INTEGER NOT NULL REFERENCES agent_keypairs(id) ON DELETE CASCADE,
      dwallet_address TEXT NOT NULL UNIQUE,
      session_identifier TEXT NOT NULL,
      attestation_data TEXT NOT NULL,
      network_signature TEXT NOT NULL,
      network_pubkey TEXT NOT NULL,
      epoch TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      treasury_id INTEGER NOT NULL REFERENCES treasuries(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'stopped',
      config_json TEXT NOT NULL,
      last_run_at INTEGER,
      last_error TEXT,
      last_result_json TEXT,
      history_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_nonces (
      nonce TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS auth_nonces_expires_at_idx
      ON auth_nonces(expires_at);

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      treasury_address TEXT NOT NULL,
      agent_keypair_id INTEGER REFERENCES agent_keypairs(id) ON DELETE SET NULL,
      wallet_address TEXT,
      kind TEXT NOT NULL,
      tx_signature TEXT NOT NULL,
      proposal_id TEXT,
      status INTEGER,
      approved INTEGER,
      violation INTEGER,
      meta_json TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS events_treasury_time_idx
      ON events(treasury_address, timestamp DESC);
    CREATE INDEX IF NOT EXISTS events_wallet_idx
      ON events(wallet_address);
    CREATE INDEX IF NOT EXISTS events_kind_idx
      ON events(kind);
  `);
}

migrate();

export function closeDatabase() {
  sqlite.close();
}
