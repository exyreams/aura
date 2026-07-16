/**
 * Device-flow control-plane endpoints — OAuth device-authorization grant.
 *
 *   POST /control-plane/device/code               mint (device_code, user_code)   — unauth (CLI starts the flow)
 *   POST /control-plane/device/token              CLI polls; pending|authorized|denied|expired — unauth
 *   GET  /control-plane/device/by-code/:userCode  decode requested params for the dashboard — SIWS required
 *   POST /control-plane/device/:userCode/approve  dashboard approves (issues session + token) — SIWS required
 *   POST /control-plane/device/:userCode/deny     dashboard denies — SIWS required
 *
 * On approval the dashboard pins the SIWS-authed owner as the session owner —
 * the request body's `owner_pubkey` is ignored. The minted token is stashed in
 * an in-memory bridge keyed by `device_code` so the CLI's next poll receives
 * it once, then the bridge entry is erased.
 */

import type { FastifyInstance } from "fastify";

import type { ConduitDb } from "../core/control-plane/db.js";
import { DeviceCodesRepo } from "../core/control-plane/device-codes.js";
import {
  type AutoApproveMode,
  SessionsRepo,
} from "../core/control-plane/sessions.js";
import type { ToolScope } from "../core/types.js";
import { CONDUIT_PROTOCOL_VERSION } from "../version.js";
import { extractOwnerCookie, makeRequireOwner } from "./owner-auth.js";

export interface DeviceFlowOptions {
  readonly db: ConduitDb;
  readonly defaultExpiresInSecs?: number;
  readonly defaultIntervalSecs?: number;
  /** TTL of the one-time token handoff between approve and the CLI's next poll. */
  readonly tokenHandoffTtlMs?: number;
}

interface TokenHandoff {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: number;
}

export async function registerDeviceFlowRoutes(
  fastify: FastifyInstance,
  options: DeviceFlowOptions,
): Promise<void> {
  const codes = new DeviceCodesRepo(options.db);
  const sessions = new SessionsRepo(options.db);
  const handoffs = new Map<string, TokenHandoff>();
  const tokenHandoffTtlMs = options.tokenHandoffTtlMs ?? 5 * 60 * 1000;

  function consumeHandoff(deviceCode: string): TokenHandoff | undefined {
    const entry = handoffs.get(deviceCode);
    if (entry === undefined) return undefined;
    handoffs.delete(deviceCode);
    if (entry.expiresAt < Date.now()) return undefined;
    return entry;
  }

  function gcHandoffs(): void {
    const now = Date.now();
    for (const [key, value] of handoffs) {
      if (value.expiresAt < now) handoffs.delete(key);
    }
  }

  fastify.post("/control-plane/device/code", async (request, reply) => {
    const body = (request.body ?? {}) as {
      client?: string;
      requested_scopes?: ReadonlyArray<ToolScope>;
      requested_caps?: Record<string, unknown>;
      requested_agent_id?: string;
      requested_treasury?: string;
    };
    if (typeof body.client !== "string" || body.client.length === 0) {
      await reply.code(400).send({
        error: { code: "invalid_input", message: "client is required" },
      });
      return;
    }
    const row = codes.create({
      requestedScopes: body.requested_scopes ?? ["read"],
      requestedCapsJson: JSON.stringify(body.requested_caps ?? {}),
      requestedAgentId: body.requested_agent_id ?? "agent",
      requestedTreasury: body.requested_treasury ?? null,
      client: body.client,
      expiresInSecs: options.defaultExpiresInSecs,
      intervalSecs: options.defaultIntervalSecs,
    });
    await reply.code(200).send({
      device_code: row.deviceCode,
      user_code: row.userCode,
      verify_url: "/agents/device",
      interval: row.intervalSecs,
      expires_in: Math.max(1, Math.floor((row.expiresAt - Date.now()) / 1000)),
    });
  });

  fastify.post("/control-plane/device/token", async (request, reply) => {
    const body = (request.body ?? {}) as { device_code?: string };
    if (typeof body.device_code !== "string") {
      await reply.code(400).send({
        error: { code: "invalid_input", message: "device_code required" },
      });
      return;
    }
    codes.expireStale();
    gcHandoffs();
    const row = codes.findByDeviceCode(body.device_code);
    if (row === null) {
      await reply
        .code(404)
        .send({ error: { code: "not_found", message: "unknown device_code" } });
      return;
    }
    switch (row.status) {
      case "pending":
        await reply.code(202).send({ status: "pending" });
        return;
      case "denied":
        await reply.code(403).send({ status: "denied" });
        return;
      case "expired":
        await reply.code(410).send({ status: "expired" });
        return;
      case "authorized": {
        if (row.approvedSessionId === null) {
          await reply
            .code(500)
            .send({ status: "authorized", error: "missing session id" });
          return;
        }
        const handoff = consumeHandoff(body.device_code);
        if (handoff === undefined) {
          await reply.code(410).send({
            status: "authorized",
            error:
              "token already retrieved or handoff expired; restart the device flow",
          });
          return;
        }
        await reply.code(200).send({
          status: "authorized",
          session_id: handoff.sessionId,
          token: handoff.token,
        });
        return;
      }
    }
  });

  fastify.get<{ Params: { userCode: string } }>(
    "/control-plane/device/by-code/:userCode",
    { preHandler: makeRequireOwner() },
    async (request, reply) => {
      const row = codes.findByUserCode(request.params.userCode);
      if (row === null) {
        await reply
          .code(404)
          .send({ error: { code: "not_found", message: "unknown user_code" } });
        return;
      }
      await reply.code(200).send({
        user_code: row.userCode,
        status: row.status,
        client: row.client,
        requested_scopes: row.requestedScopes,
        requested_agent_id: row.requestedAgentId,
        requested_treasury: row.requestedTreasury,
        requested_caps: JSON.parse(row.requestedCapsJson),
        created_at: row.createdAt,
        expires_at: row.expiresAt,
      });
    },
  );

  fastify.post<{ Params: { userCode: string } }>(
    "/control-plane/device/:userCode/approve",
    { preHandler: makeRequireOwner() },
    async (request, reply) => {
      const authedOwner = extractOwnerCookie(request);
      if (authedOwner === null) {
        await reply.code(401).send({
          error: { code: "unauthenticated", message: "no owner cookie" },
        });
        return;
      }
      const body = (request.body ?? {}) as {
        treasury_pubkey?: string;
        session_pubkey?: string;
        scopes?: ReadonlyArray<ToolScope>;
        caps_json?: string;
        auto_approve?: AutoApproveMode | "never";
        expires_at?: number;
        metadata?: Record<string, string>;
      };
      const row = codes.findByUserCode(request.params.userCode);
      if (row === null) {
        await reply
          .code(404)
          .send({ error: { code: "not_found", message: "unknown user_code" } });
        return;
      }
      if (row.status !== "pending") {
        await reply.code(409).send({
          error: { code: "forbidden", message: `code is ${row.status}` },
        });
        return;
      }
      if (typeof body.treasury_pubkey !== "string") {
        await reply.code(400).send({
          error: { code: "invalid_input", message: "treasury_pubkey required" },
        });
        return;
      }
      const session = sessions.create({
        agentId: row.requestedAgentId,
        ownerPubkey: authedOwner,
        treasuryPubkey: body.treasury_pubkey,
        sessionPubkey: body.session_pubkey ?? null,
        sessionSkWrapped: null,
        scopes: body.scopes ?? row.requestedScopes,
        autoApprove: body.auto_approve ?? "never",
        capsJson: body.caps_json ?? row.requestedCapsJson,
        metadata: body.metadata ?? {},
        protocolVersion: CONDUIT_PROTOCOL_VERSION,
        expiresAt: body.expires_at ?? Date.now() + 90 * 86_400_000,
      });
      codes.authorize(row.deviceCode, session.id);
      handoffs.set(row.deviceCode, {
        token: session.token,
        sessionId: session.id,
        expiresAt: Date.now() + tokenHandoffTtlMs,
      });
      await reply.code(200).send({
        session_id: session.id,
        owner_pubkey: authedOwner,
        treasury_pubkey: body.treasury_pubkey,
        agent_id: row.requestedAgentId,
      });
    },
  );

  fastify.post<{ Params: { userCode: string } }>(
    "/control-plane/device/:userCode/deny",
    { preHandler: makeRequireOwner() },
    async (request, reply) => {
      const row = codes.findByUserCode(request.params.userCode);
      if (row === null) {
        await reply
          .code(404)
          .send({ error: { code: "not_found", message: "unknown user_code" } });
        return;
      }
      codes.deny(row.deviceCode);
      await reply.code(200).send({ status: "denied" });
    },
  );
}
