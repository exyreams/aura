/**
 * Minimal hand-built OpenAPI 3.1 description for the Conduit HTTP gateway.
 *
 * Per-tool request schemas are derived directly from each Zod input via Zod's
 * JSON Schema emitter, so the hosted HTTP contract follows the same strict
 * schemas used by MCP and the shared dispatch path.
 */

import { toJSONSchema, type ZodTypeAny } from "zod";

import type { ToolRegistry } from "../core/registry.js";
import { CONDUIT_VERSION } from "../version.js";

export interface OpenApiOptions {
  readonly registry: ToolRegistry;
  readonly baseUrl: string;
}

export function buildOpenApiSpec(
  options: OpenApiOptions,
): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const tool of options.registry.list()) {
    const path = `/v1/${tool.name.replace(/^aura\./, "").replace(/\./g, "/")}`;
    paths[path] = {
      post: {
        summary: tool.description,
        operationId: tool.name.replace(/\./g, "_"),
        tags: [tool.isWrite ? "writes" : "reads"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: zodToJsonSchema(tool.input),
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object" } } },
          },
          "400": { description: "invalid_input" },
          "401": { description: "unauthenticated" },
          "403": { description: "forbidden" },
          "404": { description: "not_found" },
          "429": { description: "rate_limited" },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "AURA Conduit",
      version: CONDUIT_VERSION,
      description:
        "Agent-facing HTTP surface for the AURA autonomous treasury program.",
    },
    servers: [{ url: options.baseUrl }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
    paths,
  };
}

function zodToJsonSchema(schema: ZodTypeAny): unknown {
  try {
    return toJSONSchema(schema, { io: "input" });
  } catch {
    return { type: "object" };
  }
}
