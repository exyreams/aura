import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { PublicKey } from "@solana/web3.js";

import { loadConfig } from "../config.js";
import { db } from "../db/client.js";
import { authNonces, users, type UserRecord } from "../db/schema.js";
import { ApiError } from "../errors.js";
import { getJwtSecret, verifySolanaSignature } from "./security.js";

export interface AuthenticatedUser {
  id: number;
  wallet: string;
}

const NONCE_TTL_SECS = 300;

function nowSecs() {
  return Math.floor(Date.now() / 1000);
}

export function buildSiwsMessage(input: { nonce: string; expiresAt: number }) {
  return `Sign in to AURA\nNonce: ${input.nonce}\nExpires: ${input.expiresAt}`;
}

function extractNonce(message: string) {
  const match = message.match(/^Sign in to AURA\nNonce: ([^\n]+)\nExpires: (\d+)$/);
  if (!match?.[1] || !match?.[2]) {
    throw new ApiError(400, "INVALID_SIWS_MESSAGE", "SIWS message format is invalid.");
  }
  return {
    nonce: match[1],
    expiresAt: Number(match[2]),
  };
}

function parseCookies(header: string | string[] | undefined) {
  const raw = Array.isArray(header) ? header.join(";") : header;
  const cookies = new Map<string, string>();
  if (!raw) {
    return cookies;
  }
  for (const part of raw.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name && valueParts.length > 0) {
      cookies.set(name, decodeURIComponent(valueParts.join("=")));
    }
  }
  return cookies;
}

function sessionCookie(value: string, maxAgeSecs: number) {
  const config = loadConfig();
  // Cross-origin (Vercel → Railway): must use SameSite=None; Secure
  // Local HTTP: SameSite=Strict is fine (no cross-origin)
  const sameSite = config.cookieSecure ? "None" : "Strict";
  const parts = [
    `${config.cookieName}=${encodeURIComponent(value)}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
    "Path=/",
    `Max-Age=${maxAgeSecs}`,
  ];
  if (config.cookieSecure) {
    parts.push("Secure");
  }
  if (config.cookieDomain) {
    parts.push(`Domain=${config.cookieDomain}`);
  }
  return parts.join("; ");
}

export function clearSessionCookie() {
  return sessionCookie("", 0);
}

async function signSession(wallet: string) {
  const config = loadConfig();
  const now = nowSecs();
  const expiresAt = now + config.jwtExpirySecs;
  const secret = getJwtSecret();
  try {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(wallet)
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(secret);
    return { token, expiresAt };
  } finally {
    secret.fill(0);
  }
}

async function verifySession(token: string) {
  const secret = getJwtSecret();
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new ApiError(401, "UNAUTHORIZED", "Session subject is missing.");
    }
    return payload.sub;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(401, "UNAUTHORIZED", "Session is missing or invalid.");
  } finally {
    secret.fill(0);
  }
}

function upsertUser(wallet: string): UserRecord {
  const existing = db.select().from(users).where(eq(users.wallet, wallet)).get();
  if (existing) {
    return existing;
  }
  return db
    .insert(users)
    .values({ wallet, createdAt: nowSecs() })
    .returning()
    .get();
}

export function createAuthNonce() {
  const now = nowSecs();
  db.delete(authNonces)
    .where(or(lt(authNonces.expiresAt, now), isNotNull(authNonces.usedAt)))
    .run();

  const nonce = randomUUID();
  const expiresAt = now + NONCE_TTL_SECS;
  db.insert(authNonces).values({ nonce, expiresAt, usedAt: null }).run();
  return {
    nonce,
    expiresAt,
    message: buildSiwsMessage({ nonce, expiresAt }),
  };
}

export async function loginWithWallet(input: {
  walletAddress: string;
  message: string;
  signature: string;
}) {
  const wallet = new PublicKey(input.walletAddress).toBase58();
  const { nonce, expiresAt } = extractNonce(input.message);
  const nonceRecord = db
    .select()
    .from(authNonces)
    .where(eq(authNonces.nonce, nonce))
    .get();
  if (!nonceRecord || nonceRecord.usedAt !== null || nonceRecord.expiresAt < nowSecs()) {
    throw new ApiError(401, "INVALID_NONCE", "Nonce is expired, missing, or already used.");
  }
  if (nonceRecord.expiresAt !== expiresAt) {
    throw new ApiError(400, "INVALID_SIWS_MESSAGE", "SIWS expiration does not match nonce.");
  }
  if (input.message !== buildSiwsMessage({ nonce, expiresAt })) {
    throw new ApiError(400, "INVALID_SIWS_MESSAGE", "SIWS message does not match nonce.");
  }
  if (!verifySolanaSignature({ walletAddress: wallet, message: input.message, signature: input.signature })) {
    throw new ApiError(401, "INVALID_SIGNATURE", "Wallet signature is invalid.");
  }

  db.update(authNonces)
    .set({ usedAt: nowSecs() })
    .where(and(eq(authNonces.nonce, nonce), isNull(authNonces.usedAt)))
    .run();

  const user = upsertUser(wallet);
  const session = await signSession(wallet);
  return {
    cookie: sessionCookie(session.token, loadConfig().jwtExpirySecs),
    data: {
      wallet: user.wallet,
      expiresAt: session.expiresAt,
    },
  };
}

export async function getAuthenticatedUser(request: IncomingMessage): Promise<AuthenticatedUser | null> {
  const token = parseCookies(request.headers.cookie).get(loadConfig().cookieName);
  if (!token) {
    return null;
  }
  const wallet = await verifySession(token);
  const user = db.select().from(users).where(eq(users.wallet, wallet)).get();
  if (!user) {
    throw new ApiError(401, "UNAUTHORIZED", "Session user was not found.");
  }
  return {
    id: user.id,
    wallet: user.wallet,
  };
}

export async function requireAuthenticatedUser(request: IncomingMessage) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
  }
  return user;
}
