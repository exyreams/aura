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
import { ConduitError, isConduitError } from "./errors.js";
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

export interface RemoteSessionResolverOptions {
  readonly controlPlaneBaseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

interface RemoteSessionBody {
  readonly session?: {
    readonly id?: unknown;
    readonly agentId?: unknown;
    readonly ownerPubkey?: unknown;
    readonly treasuryPubkey?: unknown;
    readonly sessionPubkey?: unknown;
    readonly scopes?: unknown;
    readonly protocolVersion?: unknown;
    readonly metadata?: unknown;
  };
  readonly error?: unknown;
}

export function createRemoteSessionResolver(
  options: RemoteSessionResolverOptions,
): SessionResolver {
  const base = options.controlPlaneBaseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    async resolve(credential) {
      if (!credential || credential.trim().length === 0) {
        throw new ConduitError(
          "unauthenticated",
          "No Conduit token provided. Run `conduit agent login --account <name>` to get one.",
        );
      }

      let response: Response;
      try {
        response = await fetchImpl(`${base}/session`, {
          method: "GET",
          headers: { authorization: `Bearer ${credential}` },
        });
      } catch (cause) {
        throw new ConduitError(
          "upstream_unavailable",
          `Could not reach Conduit control plane: ${getErrorMessage(cause)}`,
        );
      }

      const body = (await response
        .json()
        .catch(() => ({}))) as RemoteSessionBody;

      if (!response.ok) {
        throw new ConduitError(
          response.status === 401 ? "unauthenticated" : "forbidden",
          remoteErrorMessage(body.error) ??
            `Control plane rejected session lookup (${response.status}).`,
        );
      }

      return parseRemoteSession(body.session);
    },
  };
}

export function createHybridSessionResolver(
  db: ConduitDb,
  options: RemoteSessionResolverOptions,
): SessionResolver {
  const local = createDbSessionResolver(db);
  const remote = createRemoteSessionResolver(options);

  return {
    async resolve(credential) {
      try {
        return await local.resolve(credential);
      } catch (cause) {
        if (!shouldTryRemote(cause)) {
          throw cause;
        }

        return remote.resolve(credential);
      }
    },
  };
}

function shouldTryRemote(error: unknown) {
  return (
    isConduitError(error) &&
    error.code === "unauthenticated" &&
    error.message.includes("Unknown or invalid")
  );
}

function parseRemoteSession(value: RemoteSessionBody["session"]): Session {
  if (!value || typeof value !== "object") {
    throw new ConduitError(
      "invalid_input",
      "Control plane returned no session.",
    );
  }

  const id = getRemoteString(value.id, "session.id");
  const agentId = getRemoteString(value.agentId, "session.agentId");
  const ownerPubkey = getRemotePubkey(value.ownerPubkey, "session.ownerPubkey");
  const treasuryPubkey = getRemotePubkey(
    value.treasuryPubkey,
    "session.treasuryPubkey",
  );
  const sessionPubkey =
    value.sessionPubkey === null || value.sessionPubkey === undefined
      ? null
      : getRemotePubkey(value.sessionPubkey, "session.sessionPubkey");
  const scopes = getRemoteScopes(value.scopes);
  const protocolVersion =
    typeof value.protocolVersion === "number" &&
    Number.isInteger(value.protocolVersion)
      ? value.protocolVersion
      : CONDUIT_PROTOCOL_VERSION;

  return {
    id,
    agentId,
    ownerPubkey,
    treasuryPubkey,
    sessionPubkey,
    scopes,
    protocolVersion,
    metadata: getRemoteMetadata(value.metadata),
  };
}

function getRemoteString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ConduitError("invalid_input", `${label} must be a string.`);
  }

  return value;
}

function getRemotePubkey(value: unknown, label: string) {
  try {
    return new PublicKey(getRemoteString(value, label));
  } catch {
    throw new ConduitError(
      "invalid_input",
      `${label} must be a valid Solana public key.`,
    );
  }
}

function getRemoteScopes(value: unknown): ReadonlyArray<ToolScope> {
  if (!Array.isArray(value)) {
    return ["read"];
  }

  return Object.freeze(
    Array.from(
      new Set(
        value.filter((scope): scope is ToolScope => typeof scope === "string"),
      ),
    ),
  );
}

function getRemoteMetadata(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.freeze({});
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        typeof item === "string" ? [[key, item]] : [],
      ),
    ),
  );
}

function remoteErrorMessage(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }

  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
