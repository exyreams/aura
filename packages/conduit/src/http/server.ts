/**
 * Conduit HTTP gateway — Fastify-based.
 *
 * Mounts:
 *   - `/v1/*`              tool routes, bearer-auth enforced
 *   - `/control-plane/*`   device-flow, sign-requests, sessions admin, owner SIWS
 *   - `/openapi.json`      OpenAPI 3.1 spec
 *   - `/healthz`           liveness
 *
 * Logger is configured to redact Authorization headers and bearer-token
 * patterns so a verbose log level can never leak credentials.
 */

import { randomBytes, randomUUID } from "node:crypto";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import type { ConduitDb } from "../core/control-plane/db.js";
import { SessionsRepo } from "../core/control-plane/sessions.js";
import type { DispatchDeps } from "../core/dispatch.js";
import { createBearerAuth } from "./auth.js";
import { registerDeviceFlowRoutes } from "./device-flow.js";
import { registerOwnerAuthRoutes } from "./owner-auth.js";
import { registerToolRoutes } from "./routes.js";
import { registerSessionsAdminRoutes } from "./sessions-admin.js";
import { registerSignRequestRoutes } from "./sign-requests.js";

export interface HttpServerOptions {
  readonly deps: DispatchDeps;
  readonly db: ConduitDb;
  readonly publicBaseUrl: string;
  readonly host?: string;
  readonly port?: number;
  /**
   * CORS allowlist. `true` = any origin (dev). Array of strings = exact-match
   * allowlist. Array of RegExp = pattern allowlist. `false` = disable CORS.
   * For credentialed requests (cookies), set this to a specific origin list.
   */
  readonly corsOrigin?: boolean | string | ReadonlyArray<string | RegExp>;
  /**
   * Secret used to HMAC-sign owner SIWS cookies. Generated per-process when
   * omitted — sessions don't survive restarts in that case. Provide a stable
   * secret in production via env.
   */
  readonly cookieSecret?: string;
  readonly secureCookie?: boolean;
  readonly maxBodyBytes?: number;
}

export async function createHttpServer(
  options: HttpServerOptions,
): Promise<FastifyInstance> {
  const fastify = Fastify({
    bodyLimit: options.maxBodyBytes ?? 128 * 1024,
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-aura-token']",
          "res.headers['set-cookie']",
          "*.token",
          "*.aurak_*",
        ],
        censor: "[redacted]",
      },
    },
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      if (
        typeof incoming === "string" &&
        incoming.length > 0 &&
        incoming.length <= 128
      ) {
        return incoming;
      }
      return randomUUID();
    },
  });

  await fastify.register(cookie, {
    secret: options.cookieSecret ?? randomBytes(32).toString("hex"),
  });

  fastify.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    if (
      request.url.startsWith("/v1/") ||
      request.url.startsWith("/control-plane/")
    ) {
      reply.header("cache-control", "no-store");
    }
    if (options.secureCookie === true) {
      reply.header(
        "strict-transport-security",
        "max-age=31536000; includeSubDomains",
      );
    }
  });

  fastify.setErrorHandler(async (error, request, reply) => {
    const status = errorStatusCode(error);
    const message =
      error instanceof Error ? error.message : "HTTP request failed";
    if (status >= 500) {
      request.log.error({ err: error }, "Unhandled HTTP error");
    }
    await reply.code(status).send({
      requestId: request.id,
      error: {
        code: errorCodeForStatus(status),
        message: status >= 500 ? "Internal server error" : message,
      },
    });
  });

  if (options.corsOrigin !== false) {
    await fastify.register(cors, {
      origin: (options.corsOrigin ?? true) as never,
      credentials: true,
    });
  }

  fastify.get("/healthz", async () => ({ ok: true }));

  const auth = createBearerAuth({
    sessions: new SessionsRepo(options.db),
  });
  fastify.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.url.startsWith("/v1/")) {
        await auth(request, reply);
        if (reply.sent) {
          return;
        }
      }
    },
  );

  await registerToolRoutes(fastify, {
    deps: options.deps,
    publicBaseUrl: options.publicBaseUrl,
  });
  await registerOwnerAuthRoutes(fastify, {
    secureCookie: options.secureCookie ?? false,
  });
  await registerDeviceFlowRoutes(fastify, { db: options.db });
  await registerSignRequestRoutes(fastify, { db: options.db });
  await registerSessionsAdminRoutes(fastify, { db: options.db });

  return fastify;
}

function errorStatusCode(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return 500;
}

function errorCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return "invalid_input";
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 413:
      return "payload_too_large";
    case 429:
      return "rate_limited";
    default:
      return "internal";
  }
}

export async function startHttpServer(
  options: HttpServerOptions,
): Promise<FastifyInstance> {
  const fastify = await createHttpServer(options);
  await fastify.listen({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 8788,
  });
  return fastify;
}
