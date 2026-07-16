/**
 * Owner-signing proxy HTTP endpoints.
 *
 *   POST /control-plane/sign-requests                 caller posts unsigned tx     — unauth (caller-trusted)
 *   GET  /control-plane/sign-requests/pending/:owner  dashboard polls pending      — SIWS required, owner must match
 *   POST /control-plane/sign-requests/:id/fulfil      dashboard returns signed     — SIWS required, owner must match the request's owner
 *   POST /control-plane/sign-requests/:id/cancel      cancel                       — SIWS required, owner must match
 *   GET  /control-plane/sign-requests/:id/stream      caller SSE for status        — unauth (caller-trusted)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { ConduitDb } from "../core/control-plane/db.js";
import { SignRequestsRepo } from "../core/control-plane/sign-requests.js";
import { makeRequireOwner } from "./owner-auth.js";

export interface SignRequestRoutesOptions {
  readonly db: ConduitDb;
}

export async function registerSignRequestRoutes(
  fastify: FastifyInstance,
  options: SignRequestRoutesOptions,
): Promise<void> {
  const repo = new SignRequestsRepo(options.db);
  const listeners = new Map<string, Set<FastifyReply>>();

  function notify(
    signRequestId: string,
    event: string,
    payload: unknown,
  ): void {
    const set = listeners.get(signRequestId);
    if (set === undefined) return;
    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const reply of set) {
      try {
        reply.raw.write(data);
      } catch {
        /* drop on disconnect */
      }
    }
  }

  function ownerForSignRequest(req: FastifyRequest): string | null {
    const id = (req.params as { id?: string }).id;
    if (id === undefined) return null;
    const row = repo.findById(id);
    return row?.ownerPubkey ?? null;
  }

  fastify.post("/control-plane/sign-requests", async (request, reply) => {
    const body = (request.body ?? {}) as {
      owner_pubkey?: string;
      instruction_name?: string;
      unsigned_tx_b64?: string;
      decoded_summary?: unknown;
      caller_id?: string;
      caller_session_id?: string;
      ttl_secs?: number;
    };
    if (
      typeof body.owner_pubkey !== "string" ||
      typeof body.instruction_name !== "string" ||
      typeof body.unsigned_tx_b64 !== "string"
    ) {
      await reply.code(400).send({
        error: {
          code: "invalid_input",
          message: "owner_pubkey, instruction_name, unsigned_tx_b64 required",
        },
      });
      return;
    }
    const row = repo.create({
      ownerPubkey: body.owner_pubkey,
      instructionName: body.instruction_name,
      unsignedTxB64: body.unsigned_tx_b64,
      decodedSummary: body.decoded_summary ?? {},
      callerId: body.caller_id ?? "cli",
      callerSessionId: body.caller_session_id ?? null,
      ttlSecs: body.ttl_secs,
    });
    notify(row.id, "created", { sign_request_id: row.id });
    await reply.code(200).send({
      sign_request_id: row.id,
      nonce: row.nonce,
      expires_at: row.expiresAt,
    });
  });

  fastify.get<{ Params: { owner: string } }>(
    "/control-plane/sign-requests/pending/:owner",
    {
      preHandler: makeRequireOwner({
        targetOwner: (req) => (req.params as { owner: string }).owner,
      }),
    },
    async (request, reply) => {
      const pending = repo.listPendingForOwner(request.params.owner);
      await reply.code(200).send({ pending });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/control-plane/sign-requests/:id/fulfil",
    { preHandler: makeRequireOwner({ targetOwner: ownerForSignRequest }) },
    async (request, reply) => {
      const body = (request.body ?? {}) as {
        signed_tx_b64?: string;
        signature?: string;
      };
      if (typeof body.signed_tx_b64 !== "string") {
        await reply.code(400).send({
          error: { code: "invalid_input", message: "signed_tx_b64 required" },
        });
        return;
      }
      const row = repo.findById(request.params.id);
      if (row === null) {
        await reply
          .code(404)
          .send({ error: { code: "not_found", message: "unknown id" } });
        return;
      }
      if (row.status !== "pending") {
        await reply.code(409).send({
          error: { code: "forbidden", message: `status=${row.status}` },
        });
        return;
      }
      repo.markSigned(row.id, body.signed_tx_b64);
      if (typeof body.signature === "string" && body.signature.length > 0) {
        repo.markSubmitted(row.id, body.signature);
      }
      notify(row.id, "fulfilled", {
        sign_request_id: row.id,
        signature: body.signature ?? null,
      });
      await reply.code(200).send({ status: "signed" });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/control-plane/sign-requests/:id/cancel",
    { preHandler: makeRequireOwner({ targetOwner: ownerForSignRequest }) },
    async (request, reply) => {
      repo.cancel(request.params.id);
      notify(request.params.id, "cancelled", {
        sign_request_id: request.params.id,
      });
      await reply.code(200).send({ status: "cancelled" });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/control-plane/sign-requests/:id/stream",
    async (request, reply) => {
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const id = request.params.id;
      const set = listeners.get(id) ?? new Set();
      set.add(reply);
      listeners.set(id, set);
      const current = repo.findById(id);
      if (current !== null) {
        reply.raw.write(
          `event: snapshot\ndata: ${JSON.stringify(current)}\n\n`,
        );
      }
      request.raw.on("close", () => {
        set.delete(reply);
        if (set.size === 0) listeners.delete(id);
      });
    },
  );
}
