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
}

export async function createHttpServer(
  options: HttpServerOptions,
): Promise<FastifyInstance> {
  const fastify = Fastify({
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
