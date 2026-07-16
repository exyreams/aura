/**
 * Bearer-token middleware for the HTTP gateway.
 *
 * Resolves `Authorization: Bearer aurak_...` against `SessionsRepo` by
 * SHA-256 hash. Invalid, revoked, or expired tokens are rejected with 401.
 */

import { PublicKey } from "@solana/web3.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionsRepo } from "../core/control-plane/sessions.js";
import { ConduitError } from "../core/errors.js";
import type { Session, ToolScope } from "../core/types.js";
import { CONDUIT_PROTOCOL_VERSION } from "../version.js";

export interface AuthContext {
  readonly session: Session;
  readonly rawToken: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export interface AuthMiddlewareOptions {
  readonly sessions: SessionsRepo;
}

export function createBearerAuth(options: AuthMiddlewareOptions) {
  return async function bearerAuth(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const header = req.headers.authorization;
    const token = parseBearerToken(header);
    if (token === null) {
      await sendError(
        reply,
        401,
        new ConduitError(
          "unauthenticated",
          "missing or malformed Bearer token",
        ),
      );
      return;
    }
    const row = options.sessions.findByToken(token);
    if (row !== null) {
      if (row.revokedAt !== null) {
        await sendError(
          reply,
          401,
          new ConduitError("unauthenticated", "session revoked"),
        );
        return;
      }
      if (row.expiresAt < Date.now()) {
        await sendError(
          reply,
          401,
          new ConduitError("unauthenticated", "session expired"),
        );
        return;
      }
      req.auth = {
        rawToken: token,
        session: toSession(row),
      };
      return;
    }
    await sendError(
      reply,
      401,
      new ConduitError("unauthenticated", "unknown token"),
    );
  };
}

function parseBearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/iu.exec(header.trim());
  if (match === null) {
    return null;
  }
  const token = match[1];
  if (token === undefined || token.length < 16 || token.length > 256) {
    return null;
  }
  return token;
}

function toSession(row: ReturnType<SessionsRepo["findByToken"]> & {}): Session {
  if (row === null) throw new Error("toSession called with null");
  return {
    id: row.id,
    agentId: row.agentId,
    ownerPubkey: new PublicKey(row.ownerPubkey),
    treasuryPubkey: new PublicKey(row.treasuryPubkey),
    sessionPubkey:
      row.sessionPubkey !== null ? new PublicKey(row.sessionPubkey) : null,
    scopes: row.scopes as ReadonlyArray<ToolScope>,
    protocolVersion: row.protocolVersion ?? CONDUIT_PROTOCOL_VERSION,
    metadata: row.metadata,
  };
}

async function sendError(
  reply: FastifyReply,
  status: number,
  err: ConduitError,
): Promise<void> {
  await reply.code(status).send({ error: err.toJSON() });
}
