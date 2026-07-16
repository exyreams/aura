/**
 * Owner-facing session admin endpoints + kill switch.
 *
 *   GET  /control-plane/sessions/owner/:owner   list sessions for an owner — SIWS required, owner must match
 *   POST /control-plane/sessions/:id/revoke     revoke one                — SIWS required, owner must match session's owner
 *   POST /control-plane/kill/:owner             bulk-revoke + sign-request — SIWS required, owner must match
 */

import type { FastifyInstance, FastifyRequest } from "fastify";

import type { ConduitDb } from "../core/control-plane/db.js";
import { SessionsRepo } from "../core/control-plane/sessions.js";
import { SignRequestsRepo } from "../core/control-plane/sign-requests.js";
import { extractOwnerCookie, makeRequireOwner } from "./owner-auth.js";

export interface SessionsAdminOptions {
  readonly db: ConduitDb;
}

export async function registerSessionsAdminRoutes(
  fastify: FastifyInstance,
  options: SessionsAdminOptions,
): Promise<void> {
  const sessions = new SessionsRepo(options.db);
  const signRequests = new SignRequestsRepo(options.db);

  function ownerForSessionParam(req: FastifyRequest): string | null {
    const id = (req.params as { id?: string }).id;
    if (id === undefined) return null;
    const row = sessions.findById(id);
    return row?.ownerPubkey ?? null;
  }

  fastify.get<{ Params: { owner: string } }>(
    "/control-plane/sessions/owner/:owner",
    {
      preHandler: makeRequireOwner({
        targetOwner: (req) => (req.params as { owner: string }).owner,
      }),
    },
    async (request, reply) => {
      const rows = sessions.listForOwner(request.params.owner);
      await reply.code(200).send({
        sessions: rows.map((s) => ({
          id: s.id,
          agent_id: s.agentId,
          treasury_pubkey: s.treasuryPubkey,
          session_pubkey: s.sessionPubkey,
          scopes: s.scopes,
          auto_approve: s.autoApprove,
          created_at: s.createdAt,
          expires_at: s.expiresAt,
          revoked_at: s.revokedAt,
          last_seen_at: s.lastSeenAt,
        })),
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/control-plane/sessions/:id/revoke",
    { preHandler: makeRequireOwner({ targetOwner: ownerForSessionParam }) },
    async (request, reply) => {
      sessions.revoke(request.params.id);
      await reply.code(200).send({ status: "revoked" });
    },
  );

  fastify.get<{
    Params: { owner: string };
    Querystring: { status?: string; limit?: string };
  }>(
    "/control-plane/proposals/owner/:owner",
    {
      preHandler: makeRequireOwner({
        targetOwner: (req) => (req.params as { owner: string }).owner,
      }),
    },
    async (request, reply) => {
      const limit = Math.min(
        200,
        Math.max(1, Number.parseInt(request.query.limit ?? "50", 10) || 50),
      );
      const status = request.query.status;
      const treasuryPubkeys = sessions
        .listForOwner(request.params.owner)
        .map((s) => s.treasuryPubkey);
      if (treasuryPubkeys.length === 0) {
        await reply.code(200).send({ proposals: [] });
        return;
      }
      const placeholders = treasuryPubkeys.map(() => "?").join(",");
      const params: Array<string | number> = [...treasuryPubkeys];
      let where = `WHERE treasury_pubkey IN (${placeholders})`;
      if (typeof status === "string" && status.length > 0 && status !== "any") {
        where += ` AND status = ?`;
        params.push(status);
      }
      params.push(limit);
      const rows = options.db
        .prepare(
          `SELECT proposal_id, treasury_pubkey, session_id, status, payload_json,
                  created_at, updated_at
           FROM proposals_cache ${where}
           ORDER BY updated_at DESC LIMIT ?`,
        )
        .all(...params) as ReadonlyArray<{
        proposal_id: string;
        treasury_pubkey: string;
        session_id: string | null;
        status: string;
        payload_json: string;
        created_at: number;
        updated_at: number;
      }>;
      await reply.code(200).send({
        proposals: rows.map((row) => ({
          proposal_id: row.proposal_id,
          treasury_pubkey: row.treasury_pubkey,
          session_id: row.session_id,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,
          payload: JSON.parse(row.payload_json),
        })),
      });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/control-plane/proposals/by-id/:id",
    async (request, reply) => {
      const row = options.db
        .prepare(
          `SELECT proposal_id, treasury_pubkey, session_id, status, payload_json,
                  created_at, updated_at
           FROM proposals_cache WHERE proposal_id = ?`,
        )
        .get(request.params.id) as
        | {
            proposal_id: string;
            treasury_pubkey: string;
            session_id: string | null;
            status: string;
            payload_json: string;
            created_at: number;
            updated_at: number;
          }
        | undefined;
      if (row === undefined) {
        await reply
          .code(404)
          .send({ error: { code: "not_found", message: "unknown proposal" } });
        return;
      }
      const cookieOwner = extractOwnerCookie(request);
      if (cookieOwner === null) {
        await reply.code(401).send({
          error: {
            code: "unauthenticated",
            message: "owner SIWS session required",
          },
        });
        return;
      }
      const ownerHasTreasury = sessions
        .listForOwner(cookieOwner)
        .some((s) => s.treasuryPubkey === row.treasury_pubkey);
      if (!ownerHasTreasury) {
        await reply.code(403).send({
          error: {
            code: "forbidden",
            message: "proposal belongs to a treasury you don't own",
          },
        });
        return;
      }
      await reply.code(200).send({
        proposal_id: row.proposal_id,
        treasury_pubkey: row.treasury_pubkey,
        session_id: row.session_id,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        payload: JSON.parse(row.payload_json),
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/control-plane/sessions/:id/reissue",
    { preHandler: makeRequireOwner({ targetOwner: ownerForSessionParam }) },
    async (request, reply) => {
      const row = sessions.findById(request.params.id);
      if (row === null) {
        await reply
          .code(404)
          .send({ error: { code: "not_found", message: "session not found" } });
        return;
      }
      if (row.revokedAt !== null) {
        await reply
          .code(409)
          .send({ error: { code: "revoked", message: "session is revoked" } });
        return;
      }
      const token = sessions.reissue(request.params.id);
      await reply.code(200).send({ token });
    },
  );

  fastify.post<{ Params: { owner: string } }>(
    "/control-plane/kill/:owner",
    {
      preHandler: makeRequireOwner({
        targetOwner: (req) => (req.params as { owner: string }).owner,
      }),
    },
    async (request, reply) => {
      const ownerRows = sessions.listForOwner(request.params.owner);
      let revoked = 0;
      for (const row of ownerRows) {
        if (row.revokedAt === null) {
          sessions.revoke(row.id);
          revoked += 1;
        }
      }
      let onChainSr: string | undefined;
      if (revoked > 0) {
        const sr = signRequests.create({
          ownerPubkey: request.params.owner,
          instructionName: "revoke_all_session_keys",
          unsignedTxB64: "",
          decodedSummary: {
            action: "revoke_all_session_keys",
            owner: request.params.owner,
            count: revoked,
          },
          callerId: "kill-switch",
        });
        onChainSr = sr.id;
      }
      await reply.code(200).send({
        revoked_count: revoked,
        ...(onChainSr !== undefined
          ? { on_chain_sign_request_id: onChainSr }
          : {}),
      });
    },
  );
}
