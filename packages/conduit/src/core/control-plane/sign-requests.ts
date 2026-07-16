/**
 * Sign-request queue — the owner-signing proxy.
 *
 * Any caller that needs an owner signature posts a `SignRequest`; the
 * dashboard relays it to the open browser tab over SSE; the user signs in
 * their wallet; the signed bytes come back.
 */

import { randomBytes } from "node:crypto";

import type { ConduitDb } from "./db.js";

export type SignRequestStatus =
  | "pending"
  | "signed"
  | "submitted"
  | "expired"
  | "cancelled";

export interface SignRequestRow {
  readonly id: string;
  readonly ownerPubkey: string;
  readonly instructionName: string;
  readonly unsignedTxB64: string;
  readonly decodedSummaryJson: string;
  readonly status: SignRequestStatus;
  readonly signedTxB64: string | null;
  readonly signature: string | null;
  readonly callerId: string;
  readonly callerSessionId: string | null;
  readonly nonce: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly completedAt: number | null;
}

export interface CreateSignRequestParams {
  ownerPubkey: string;
  instructionName: string;
  unsignedTxB64: string;
  decodedSummary: unknown;
  callerId: string;
  callerSessionId?: string | null;
  ttlSecs?: number;
}

export class SignRequestsRepo {
  constructor(private readonly db: ConduitDb) {}

  create(
    params: CreateSignRequestParams,
    now: number = Date.now(),
  ): SignRequestRow {
    const id = `sreq_${randomBytes(12).toString("hex")}`;
    const nonce = randomBytes(16).toString("base64url");
    const ttlSecs = params.ttlSecs ?? 120;
    const expiresAt = now + ttlSecs * 1000;
    const decoded = JSON.stringify(params.decodedSummary);
    this.db
      .prepare(
        `INSERT INTO sign_requests (
           id, owner_pubkey, instruction_name, unsigned_tx_b64, decoded_summary_json,
           status, caller_id, caller_session_id, nonce, created_at, expires_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        params.ownerPubkey,
        params.instructionName,
        params.unsignedTxB64,
        decoded,
        "pending",
        params.callerId,
        params.callerSessionId ?? null,
        nonce,
        now,
        expiresAt,
      );
    return this.requireById(id);
  }

  findById(id: string): SignRequestRow | null {
    const raw = this.db
      .prepare(`SELECT * FROM sign_requests WHERE id = ?`)
      .get(id) as RawSignRequestRow | undefined;
    return raw !== undefined ? mapRow(raw) : null;
  }

  listPendingForOwner(
    ownerPubkey: string,
    now: number = Date.now(),
  ): ReadonlyArray<SignRequestRow> {
    const rows = this.db
      .prepare(
        `SELECT * FROM sign_requests
         WHERE owner_pubkey = ? AND status = 'pending' AND expires_at > ?
         ORDER BY created_at ASC`,
      )
      .all(ownerPubkey, now) as ReadonlyArray<RawSignRequestRow>;
    return rows.map(mapRow);
  }

  markSigned(id: string, signedTxB64: string, now: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE sign_requests SET status='signed', signed_tx_b64=?, completed_at=? WHERE id=?`,
      )
      .run(signedTxB64, now, id);
  }

  markSubmitted(id: string, signature: string, now: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE sign_requests SET status='submitted', signature=?, completed_at=? WHERE id=?`,
      )
      .run(signature, now, id);
  }

  cancel(id: string, now: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE sign_requests SET status='cancelled', completed_at=? WHERE id=?`,
      )
      .run(now, id);
  }

  expireStale(now: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE sign_requests SET status='expired' WHERE status='pending' AND expires_at <= ?`,
      )
      .run(now);
  }

  private requireById(id: string): SignRequestRow {
    const row = this.findById(id);
    if (row === null)
      throw new Error(`sign request ${id} disappeared after insert`);
    return row;
  }
}

interface RawSignRequestRow {
  id: string;
  owner_pubkey: string;
  instruction_name: string;
  unsigned_tx_b64: string;
  decoded_summary_json: string;
  status: SignRequestStatus;
  signed_tx_b64: string | null;
  signature: string | null;
  caller_id: string;
  caller_session_id: string | null;
  nonce: string;
  created_at: number;
  expires_at: number;
  completed_at: number | null;
}

function mapRow(raw: RawSignRequestRow): SignRequestRow {
  return {
    id: raw.id,
    ownerPubkey: raw.owner_pubkey,
    instructionName: raw.instruction_name,
    unsignedTxB64: raw.unsigned_tx_b64,
    decodedSummaryJson: raw.decoded_summary_json,
    status: raw.status,
    signedTxB64: raw.signed_tx_b64,
    signature: raw.signature,
    callerId: raw.caller_id,
    callerSessionId: raw.caller_session_id,
    nonce: raw.nonce,
    createdAt: raw.created_at,
    expiresAt: raw.expires_at,
    completedAt: raw.completed_at,
  };
}
