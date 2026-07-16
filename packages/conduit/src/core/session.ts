/**
 * Session resolution.
 *
 * `createDbSessionResolver` is the production resolver — it looks tokens up
 * in the control-plane SQLite DB by SHA-256 hash and returns the full Session.
 *
 * `createStubSessionResolver` is kept for unit tests that don't want a real DB.
 */

import { PublicKey } from "@solana/web3.js";
import { CONDUIT_PROTOCOL_VERSION } from "../version.js";
import type { ConduitDb } from "./control-plane/db.js";
import { SessionsRepo } from "./control-plane/sessions.js";
import { ConduitError } from "./errors.js";
import type { Session, ToolScope } from "./types.js";

export interface SessionResolver {
  /**
   * Resolves a session from whatever credential the transport collected.
   * Throws `ConduitError("unauthenticated")` if the credential is missing or
   * `ConduitError("forbidden")` if it does not resolve to an active session.
   */
  resolve(credential: string | undefined): Promise<Session>;
}

/**
 * DB-backed session resolver. Looks up the token hash in the sessions table,
 * validates expiry and revocation, and returns a typed Session.
 *
 * This is the resolver used by both `conduit http` (bearer-auth middleware)
 * and `conduit mcp` (stdio token lookup).
 */
export function createDbSessionResolver(db: ConduitDb): SessionResolver {
  const sessions = new SessionsRepo(db);
  return {
    async resolve(credential) {
      if (!credential || credential.trim().length === 0) {
        throw new ConduitError(
          "unauthenticated",
          "No Conduit token provided. Run `conduit agent login --account <name>` to get one.",
        );
      }
      const row = sessions.findByToken(credential);
      if (row === null) {
        throw new ConduitError(
          "unauthenticated",
          "Unknown or invalid Conduit token. It may have been revoked or the DB is on a different path.",
        );
      }
      if (row.revokedAt !== null) {
        throw new ConduitError(
          "forbidden",
          "This Conduit session has been revoked.",
        );
      }
      if (row.expiresAt < Date.now()) {
        throw new ConduitError(
          "forbidden",
          "This Conduit session has expired. Re-run `conduit agent login` to get a fresh token.",
        );
      }
      return {
        id: row.id,
        agentId: row.agentId,
        ownerPubkey: new PublicKey(row.ownerPubkey),
        treasuryPubkey: new PublicKey(row.treasuryPubkey),
        sessionPubkey: row.sessionPubkey
          ? new PublicKey(row.sessionPubkey)
          : null,
        scopes: row.scopes as ReadonlyArray<ToolScope>,
        protocolVersion: row.protocolVersion,
        metadata: row.metadata as Record<string, string>,
      };
    },
  };
}

// ── Test-only stub ────────────────────────────────────────────────────────────

export interface StubSessionConfig {
  readonly id?: string;
  readonly agentId: string;
  readonly ownerPubkey: string;
  readonly treasuryPubkey: string;
  readonly sessionPubkey?: string;
  readonly scopes?: ReadonlyArray<ToolScope>;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** For unit tests only — bypasses the DB entirely. */
export function createStubSessionResolver(
  config: StubSessionConfig,
): SessionResolver {
  const session: Session = {
    id: config.id ?? "stub",
    agentId: config.agentId,
    ownerPubkey: new PublicKey(config.ownerPubkey),
    treasuryPubkey: new PublicKey(config.treasuryPubkey),
    sessionPubkey: config.sessionPubkey
      ? new PublicKey(config.sessionPubkey)
      : null,
    scopes: Object.freeze([...(config.scopes ?? ["read"])]),
    protocolVersion: CONDUIT_PROTOCOL_VERSION,
    metadata: Object.freeze({ ...(config.metadata ?? {}) }),
  };
  return {
    async resolve(credential) {
      if (
        credential !== undefined &&
        credential.length > 0 &&
        !credential.startsWith("aurak_")
      ) {
        throw new ConduitError(
          "unauthenticated",
          "Token must start with 'aurak_'.",
        );
      }
      return session;
    },
  };
}
