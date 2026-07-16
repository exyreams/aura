/**
 * HTTP routes for the Conduit gateway.
 *
 * Mounts every tool in the registry as `POST /v1/<tool-path>` and serves the
 * OpenAPI spec at `/openapi.json`. Auth is enforced by the bearer middleware
 * mounted on the `/v1/*` prefix; control-plane endpoints (device flow,
 * sign-request proxy) are mounted under `/control-plane/*` in `server.ts`.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";

import { type DispatchDeps, dispatchTool } from "../core/dispatch.js";
import type { Session } from "../core/types.js";
import { buildOpenApiSpec } from "./openapi.js";

export interface ToolRouteOptions {
  readonly deps: DispatchDeps;
  readonly publicBaseUrl: string;
}

export async function registerToolRoutes(
  fastify: FastifyInstance,
  options: ToolRouteOptions,
): Promise<void> {
  const spec = buildOpenApiSpec({
    registry: options.deps.registry,
    baseUrl: `${options.publicBaseUrl.replace(/\/$/, "")}/v1`,
  });

  fastify.get("/openapi.json", async () => spec);

  for (const tool of options.deps.registry.list()) {
    const path = `/v1/${tool.name.replace(/^aura\./, "").replace(/\./g, "/")}`;
    fastify.post(path, async (request, reply) => {
      const session = (
        request as FastifyRequest & { auth?: { session: Session } }
      ).auth?.session;
      if (session === undefined) {
        await reply
          .code(401)
          .send({ error: { code: "unauthenticated", message: "no session" } });
        return;
      }
      const rawInput = (request.body ?? {}) as Record<string, unknown>;
      const idempotencyHeader = request.headers["idempotency-key"];
      const callerIdempotencyKey =
        typeof idempotencyHeader === "string" ? idempotencyHeader : undefined;
      const result = await dispatchTool(options.deps, {
        toolName: tool.name,
        rawInput,
        session,
        requestId: request.id,
        ...(callerIdempotencyKey !== undefined ? { callerIdempotencyKey } : {}),
      });
      if (result.ok) {
        await reply.code(200).send({
          tool: result.tool,
          requestId: result.requestId,
          idempotent: result.idempotent,
          value: result.value,
        });
        return;
      }
      const status = errorCodeToHttpStatus(result.error.code);
      await reply.code(status).send({
        tool: result.tool,
        requestId: result.requestId,
        error: result.error,
      });
    });
  }
}

function errorCodeToHttpStatus(code: string): number {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "invalid_input":
      return 400;
    case "rate_limited":
      return 429;
    case "policy_denied":
      return 422;
    case "needs_human":
      return 202;
    case "upstream_unavailable":
      return 502;
    default:
      return 500;
  }
}
