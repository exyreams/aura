/**
 * Sessions repo — issuance, lookup by token, revocation, heartbeat.
 *
 * Tokens are never stored in the clear. We hash the `aurak_...` string with
 * SHA-256 at issuance and look up by hash. The plaintext token only ever
 * lives on the device that owns it (OS keychain).
 */

import { createHash, randomBytes } from "node:crypto";
import type { ToolScope } from "../types.js";
import type { ConduitDb } from "./db.js";

export type AutoApproveMode =
  | "never"
  | "within_encrypted_limits"
  | { kind: "below_usd"; amountUsd: number };

export interface SessionRow {
  readonly id: string;
  readonly tokenHash: string;
  readonly agentId: string;
  readonly ownerPubkey: string;
  readonly treasuryPubkey: string;
  readonly sessionPubkey: string | null;
  readonly sessionSkWrapped: Buffer | null;
  readonly scopes: ReadonlyArray<ToolScope>;
  readonly autoApprove: AutoApproveMode;
  readonly capsJson: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly protocolVersion: number;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
  readonly lastSeenAt: number | null;
}

export interface CreateSessionParams {
  agentId: string;
  ownerPubkey: string;
  treasuryPubkey: string;
  sessionPubkey?: string | null;
  sessionSkWrapped?: Buffer | null;
  scopes: ReadonlyArray<ToolScope>;
  autoApprove: AutoApproveMode;
  capsJson: string;
  metadata: Record<string, string>;
  protocolVersion: number;
  expiresAt: number;
}

export interface CreatedSession {
  readonly id: string;
  readonly token: string;
  readonly row: SessionRow;
}

const TOKEN_PREFIX = "aurak_live_";

export class SessionsRepo {
  constructor(private readonly db: ConduitDb) {}

  create(
    params: CreateSessionParams,
    now: number = Date.now(),
  ): CreatedSession {
    const id = `ses_${randomBytes(12).toString("hex")}`;
    const tokenBody = randomBytes(24).toString("base64url");
    const token = `${TOKEN_PREFIX}${tokenBody}`;
    const tokenHash = hashToken(token);
    const autoApproveStr = serializeAutoApprove(params.autoApprove);
    const metadataJson = JSON.stringify(params.metadata);
    const scopesJson = JSON.stringify([...params.scopes]);

    this.db
      .prepare(
        `INSERT INTO sessions (
           id, token_hash, agent_id, owner_pubkey, treasury_pubkey,
           session_pubkey, session_sk_wrapped, scopes, auto_approve,
           caps_json, metadata_json, protocol_version, created_at, expires_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        tokenHash,
        params.agentId,
        params.ownerPubkey,
        params.treasuryPubkey,
        params.sessionPubkey ?? null,
        params.sessionSkWrapped ?? null,
        scopesJson,
        autoApproveStr,
        params.capsJson,
        metadataJson,
        params.protocolVersion,
        now,
        params.expiresAt,
      );

    const row = this.requireById(id);
    return { id, token, row };
  }

  findByToken(token: string): SessionRow | null {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    const row = this.db
      .prepare(`SELECT * FROM sessions WHERE token_hash = ?`)
      .get(hashToken(token)) as RawSessionRow | undefined;
    return row !== undefined ? mapRow(row) : null;
  }

  findById(id: string): SessionRow | null {
    const row = this.db
      .prepare(`SELECT * FROM sessions WHERE id = ?`)
      .get(id) as RawSessionRow | undefined;
    return row !== undefined ? mapRow(row) : null;
  }

  listForOwner(ownerPubkey: string): ReadonlyArray<SessionRow> {
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions WHERE owner_pubkey = ? ORDER BY created_at DESC`,
      )
      .all(ownerPubkey) as ReadonlyArray<RawSessionRow>;
    return rows.map(mapRow);
  }

  listActiveForTreasury(
    treasuryPubkey: string,
    now: number = Date.now(),
  ): ReadonlyArray<SessionRow> {
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions
         WHERE treasury_pubkey = ?
           AND revoked_at IS NULL
           AND expires_at > ?
         ORDER BY created_at DESC`,
      )
      .all(treasuryPubkey, now) as ReadonlyArray<RawSessionRow>;
    return rows.map(mapRow);
  }

  revoke(id: string, now: number = Date.now()): void {
    this.db
      .prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`)
      .run(now, id);
  }

  recordHeartbeat(id: string, now: number = Date.now()): void {
    this.db
      .prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`)
      .run(now, id);
  }

  updateSessionPubkey(
    id: string,
    pubkey: string,
    wrappedSk: Buffer | null,
  ): void {
    this.db
      .prepare(
        `UPDATE sessions SET session_pubkey = ?, session_sk_wrapped = ? WHERE id = ?`,
      )
      .run(pubkey, wrappedSk, id);
  }

  reissue(id: string): string {
    const tokenBody = randomBytes(24).toString("base64url");
    const token = `${TOKEN_PREFIX}${tokenBody}`;
    const tokenHash = hashToken(token);
    this.db
      .prepare(`UPDATE sessions SET token_hash = ? WHERE id = ?`)
      .run(tokenHash, id);
    return token;
  }

  downgradeAutoApprove(id: string, mode: AutoApproveMode): void {
    this.db
      .prepare(`UPDATE sessions SET auto_approve = ? WHERE id = ?`)
      .run(serializeAutoApprove(mode), id);
  }

  private requireById(id: string): SessionRow {
    const row = this.findById(id);
    if (row === null) throw new Error(`session ${id} disappeared after insert`);
    return row;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface RawSessionRow {
  id: string;
  token_hash: string;
  agent_id: string;
  owner_pubkey: string;
  treasury_pubkey: string;
  session_pubkey: string | null;
  session_sk_wrapped: Buffer | null;
  scopes: string;
  auto_approve: string;
  caps_json: string;
  metadata_json: string;
  protocol_version: number;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
  last_seen_at: number | null;
}

function mapRow(row: RawSessionRow): SessionRow {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    agentId: row.agent_id,
    ownerPubkey: row.owner_pubkey,
    treasuryPubkey: row.treasury_pubkey,
    sessionPubkey: row.session_pubkey,
    sessionSkWrapped: row.session_sk_wrapped,
    scopes: JSON.parse(row.scopes) as ReadonlyArray<ToolScope>,
    autoApprove: parseAutoApprove(row.auto_approve),
    capsJson: row.caps_json,
    metadata: JSON.parse(row.metadata_json) as Record<string, string>,
    protocolVersion: row.protocol_version,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastSeenAt: row.last_seen_at,
  };
}

function serializeAutoApprove(mode: AutoApproveMode): string {
  if (mode === "never" || mode === "within_encrypted_limits") return mode;
  return `below_usd:${mode.amountUsd}`;
}

function parseAutoApprove(raw: string): AutoApproveMode {
  if (raw === "never" || raw === "within_encrypted_limits") return raw;
  if (raw.startsWith("below_usd:")) {
    const amount = Number.parseInt(raw.slice("below_usd:".length), 10);
    return { kind: "below_usd", amountUsd: amount };
  }
  return "never";
}
