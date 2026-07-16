/**
 * Device-code repo for the OAuth device-authorization flow.
 *
 * Lifecycle: pending → authorized | denied | expired.
 * Issuance produces a high-entropy `device_code` (CLI polls with this) and a
 * short human-typeable `user_code` (user enters in the dashboard).
 */

import { randomBytes } from "node:crypto";
import type { ToolScope } from "../types.js";
import type { ConduitDb } from "./db.js";

export type DeviceCodeStatus = "pending" | "authorized" | "denied" | "expired";

export interface DeviceCodeRow {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly requestedScopes: ReadonlyArray<ToolScope>;
  readonly requestedCapsJson: string;
  readonly requestedAgentId: string;
  readonly requestedTreasury: string | null;
  readonly client: string;
  readonly status: DeviceCodeStatus;
  readonly approvedSessionId: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly intervalSecs: number;
}

export interface CreateDeviceCodeParams {
  requestedScopes: ReadonlyArray<ToolScope>;
  requestedCapsJson: string;
  requestedAgentId: string;
  requestedTreasury?: string | null;
  client: string;
  expiresInSecs?: number;
  intervalSecs?: number;
}

export class DeviceCodesRepo {
  constructor(private readonly db: ConduitDb) {}

  create(
    params: CreateDeviceCodeParams,
    now: number = Date.now(),
  ): DeviceCodeRow {
    const deviceCode = `dev_${randomBytes(24).toString("base64url")}`;
    const userCode = generateUserCode();
    const expiresInSecs = params.expiresInSecs ?? 600;
    const intervalSecs = params.intervalSecs ?? 5;
    const row: DeviceCodeRow = {
      deviceCode,
      userCode,
      requestedScopes: params.requestedScopes,
      requestedCapsJson: params.requestedCapsJson,
      requestedAgentId: params.requestedAgentId,
      requestedTreasury: params.requestedTreasury ?? null,
      client: params.client,
      status: "pending",
      approvedSessionId: null,
      createdAt: now,
      expiresAt: now + expiresInSecs * 1000,
      intervalSecs,
    };
    this.db
      .prepare(
        `INSERT INTO device_codes (
           device_code, user_code, requested_scopes, requested_caps_json,
           requested_agent_id, requested_treasury, client, status,
           created_at, expires_at, interval_secs
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        deviceCode,
        userCode,
        JSON.stringify([...params.requestedScopes]),
        params.requestedCapsJson,
        params.requestedAgentId,
        params.requestedTreasury ?? null,
        params.client,
        "pending",
        now,
        row.expiresAt,
        intervalSecs,
      );
    return row;
  }

  findByDeviceCode(deviceCode: string): DeviceCodeRow | null {
    const raw = this.db
      .prepare(`SELECT * FROM device_codes WHERE device_code = ?`)
      .get(deviceCode) as RawDeviceCodeRow | undefined;
    return raw !== undefined ? mapRow(raw) : null;
  }

  findByUserCode(userCode: string): DeviceCodeRow | null {
    const raw = this.db
      .prepare(`SELECT * FROM device_codes WHERE user_code = ?`)
      .get(userCode.toUpperCase()) as RawDeviceCodeRow | undefined;
    return raw !== undefined ? mapRow(raw) : null;
  }

  authorize(deviceCode: string, sessionId: string): void {
    this.db
      .prepare(
        `UPDATE device_codes SET status='authorized', approved_session_id=? WHERE device_code=?`,
      )
      .run(sessionId, deviceCode);
  }

  deny(deviceCode: string): void {
    this.db
      .prepare(`UPDATE device_codes SET status='denied' WHERE device_code=?`)
      .run(deviceCode);
  }

  expireStale(now: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE device_codes SET status='expired' WHERE status='pending' AND expires_at <= ?`,
      )
      .run(now);
  }
}

/** `BRDX-4Q7P` style: 8 alphanumerics in two groups of four. */
function generateUserCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // skips look-alikes
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[(bytes[i] ?? 0) % alphabet.length];
    if (i === 3) out += "-";
  }
  return out;
}

interface RawDeviceCodeRow {
  device_code: string;
  user_code: string;
  requested_scopes: string;
  requested_caps_json: string;
  requested_agent_id: string;
  requested_treasury: string | null;
  client: string;
  status: DeviceCodeStatus;
  approved_session_id: string | null;
  created_at: number;
  expires_at: number;
  interval_secs: number;
}

function mapRow(raw: RawDeviceCodeRow): DeviceCodeRow {
  return {
    deviceCode: raw.device_code,
    userCode: raw.user_code,
    requestedScopes: JSON.parse(
      raw.requested_scopes,
    ) as ReadonlyArray<ToolScope>,
    requestedCapsJson: raw.requested_caps_json,
    requestedAgentId: raw.requested_agent_id,
    requestedTreasury: raw.requested_treasury,
    client: raw.client,
    status: raw.status,
    approvedSessionId: raw.approved_session_id,
    createdAt: raw.created_at,
    expiresAt: raw.expires_at,
    intervalSecs: raw.interval_secs,
  };
}
