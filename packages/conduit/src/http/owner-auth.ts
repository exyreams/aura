/**
 * SIWS-style owner authentication for the Conduit dashboard.
 *
 * Endpoints:
 *   GET  /control-plane/auth/nonce?wallet=<pubkey>   issue a one-time message to sign
 *   POST /control-plane/auth/login                    verify signature → set cookie
 *   GET  /control-plane/auth/me                       return authed owner pubkey or null
 *   POST /control-plane/auth/logout                   clear cookie
 *
 * Cookies are HMAC-signed (`@fastify/cookie` does the signing) so the server
 * can verify the owner pubkey was set by us and not forged client-side.
 */

import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import nacl from "tweetnacl";

const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_COOKIE = "aura_conduit_owner";
const SESSION_TTL_SECS = 24 * 60 * 60;

interface NonceRow {
  readonly nonce: string;
  readonly message: string;
  readonly expiresAt: number;
  readonly wallet: string;
}

export interface OwnerAuthOptions {
  /** Domain shown in the SIWS message body. Default: "AURA Conduit". */
  readonly domain?: string;
  /** Cookie scope. `true` = secure (HTTPS only). Set false for local dev. */
  readonly secureCookie?: boolean;
  readonly now?: () => number;
}

export async function registerOwnerAuthRoutes(
  fastify: FastifyInstance,
  options: OwnerAuthOptions = {},
): Promise<void> {
  const domain = options.domain ?? "AURA Conduit";
  const secure = options.secureCookie ?? false;
  const now = options.now ?? (() => Date.now());
  const nonces = new Map<string, NonceRow>();

  function gcNonces(): void {
    const cutoff = now();
    for (const [key, row] of nonces) {
      if (row.expiresAt < cutoff) nonces.delete(key);
    }
  }

  fastify.get<{ Querystring: { wallet?: string } }>(
    "/control-plane/auth/nonce",
    async (request, reply) => {
      const wallet = request.query.wallet?.trim();
      if (typeof wallet !== "string" || wallet.length === 0) {
        await reply.code(400).send({
          error: {
            code: "invalid_input",
            message: "wallet query param required",
          },
        });
        return;
      }
      try {
        new PublicKey(wallet);
      } catch {
        await reply.code(400).send({
          error: {
            code: "invalid_input",
            message: "wallet must be a base58 pubkey",
          },
        });
        return;
      }
      gcNonces();
      const nonce = randomBytes(16).toString("hex");
      const expiresAt = now() + NONCE_TTL_MS;
      const message =
        `${domain} wants you to sign in with your Solana account:\n` +
        `${wallet}\n\n` +
        `Sign this message to prove you own this wallet and authorize control-plane actions on AURA Conduit.\n\n` +
        `Nonce: ${nonce}\n` +
        `Issued At: ${new Date(now()).toISOString()}\n` +
        `Expires At: ${new Date(expiresAt).toISOString()}`;
      nonces.set(nonce, { nonce, message, expiresAt, wallet });
      await reply.code(200).send({ nonce, message, expiresAt });
    },
  );

  fastify.post("/control-plane/auth/login", async (request, reply) => {
    const body = (request.body ?? {}) as {
      wallet?: string;
      message?: string;
      signature?: string;
    };
    if (
      typeof body.wallet !== "string" ||
      typeof body.message !== "string" ||
      typeof body.signature !== "string"
    ) {
      await reply.code(400).send({
        error: {
          code: "invalid_input",
          message: "wallet, message, signature required",
        },
      });
      return;
    }
    gcNonces();
    const nonceMatch = body.message.match(/Nonce: ([0-9a-f]+)/);
    const nonce = nonceMatch?.[1];
    if (nonce === undefined) {
      await reply.code(400).send({
        error: { code: "invalid_input", message: "no nonce in message body" },
      });
      return;
    }
    const row = nonces.get(nonce);
    if (row === undefined) {
      await reply.code(400).send({
        error: { code: "invalid_input", message: "unknown or expired nonce" },
      });
      return;
    }
    if (row.wallet !== body.wallet) {
      await reply.code(400).send({
        error: {
          code: "invalid_input",
          message: "wallet does not match nonce",
        },
      });
      return;
    }
    if (row.message !== body.message) {
      await reply.code(400).send({
        error: {
          code: "invalid_input",
          message: "message body does not match issued nonce",
        },
      });
      return;
    }

    let pubkeyBytes: Uint8Array;
    let signatureBytes: Uint8Array;
    try {
      pubkeyBytes = new PublicKey(body.wallet).toBytes();
      signatureBytes = bs58.decode(body.signature);
    } catch {
      await reply.code(400).send({
        error: {
          code: "invalid_input",
          message: "malformed wallet or signature",
        },
      });
      return;
    }
    const messageBytes = new TextEncoder().encode(body.message);
    const ok = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      pubkeyBytes,
    );
    if (!ok) {
      await reply.code(401).send({
        error: {
          code: "unauthenticated",
          message: "signature did not verify",
        },
      });
      return;
    }
    nonces.delete(nonce);

    reply.setCookie(SESSION_COOKIE, body.wallet, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: SESSION_TTL_SECS,
      signed: true,
    });
    await reply.code(200).send({
      wallet: body.wallet,
      expiresAt: now() + SESSION_TTL_SECS * 1000,
    });
  });

  fastify.get("/control-plane/auth/me", async (request, reply) => {
    const wallet = extractOwnerCookie(request);
    if (wallet === null) {
      await reply.code(200).send({ wallet: null });
      return;
    }
    await reply.code(200).send({ wallet });
  });

  fastify.post("/control-plane/auth/logout", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    await reply.code(200).send({ ok: true });
  });
}

/**
 * Returns the SIWS-authed wallet pubkey from the signed session cookie, or
 * `null` when absent / invalid / unsigned.
 */
export function extractOwnerCookie(request: FastifyRequest): string | null {
  const cookies = (
    request as FastifyRequest & {
      cookies?: Record<string, string | undefined>;
    }
  ).cookies;
  if (cookies === undefined) return null;
  const raw = cookies[SESSION_COOKIE];
  if (raw === undefined) return null;
  const unsigned = (
    request as unknown as {
      unsignCookie: (v: string) => { valid: boolean; value: string | null };
    }
  ).unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;
  return unsigned.value;
}

/**
 * Fastify pre-handler that enforces SIWS auth and that the request targets the
 * owner pubkey in the authed session. Use on any `/control-plane/*` route
 * whose URL or body identifies a specific owner.
 *
 * Pass the owner pubkey via:
 *   - URL param :owner (e.g. `/control-plane/sessions/owner/:owner`)
 *   - URL param :userCode resolved to its device_code's requested owner
 *   - request body `owner_pubkey`
 */
export interface RequireOwnerOptions {
  /** Extract the target owner from the request. Return null to skip the match check. */
  readonly targetOwner?: (
    req: FastifyRequest,
  ) => string | null | Promise<string | null>;
}

export function makeRequireOwner(options: RequireOwnerOptions = {}) {
  return async function requireOwner(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authed = extractOwnerCookie(req);
    if (authed === null) {
      await reply.code(401).send({
        error: {
          code: "unauthenticated",
          message: "owner SIWS session required",
        },
      });
      return;
    }
    const target =
      options.targetOwner !== undefined ? await options.targetOwner(req) : null;
    if (target !== null && target !== authed) {
      await reply.code(403).send({
        error: {
          code: "forbidden",
          message: "authed owner does not match target",
          detail: { authed, target },
        },
      });
      return;
    }
    (req as FastifyRequest & { authedOwner?: string }).authedOwner = authed;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    authedOwner?: string;
  }
}
