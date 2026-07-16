/**
 * Minimal hand-built OpenAPI 3.1 description for the Conduit HTTP gateway.
 *
 * Per-tool schemas are derived from each Zod input via `zod-to-json-schema`
 * — but to keep the dep surface tight we serialise the tool's input directly
 * (Zod can emit JSON Schema natively via `_def`). For the launch surface the
 * static skeleton below is sufficient; tool param schemas are derived at
 * runtime in `routes.ts` and merged in.
 */

import type { ZodTypeAny } from "zod";

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
  // Zod 3.x exposes `_def` with a structural description; for the launch
  // surface we project the safe subset every tool actually uses (strict
  // objects of primitives + unions). Anything richer falls back to `any`.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const def = (schema as unknown as { _def: unknown })._def as {
      typeName?: string;
    };
    if (def.typeName === "ZodObject") {
      return projectObject(schema as unknown as ZodObjectLike);
    }
  } catch {
    /* fallthrough */
  }
  return { type: "object" };
}

interface ZodObjectLike {
  shape: Record<string, ZodTypeAny>;
}

function projectObject(schema: ZodObjectLike): unknown {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema.shape)) {
    properties[key] = projectField(value);
  }
  return { type: "object", properties, additionalProperties: false };
}

function projectField(schema: ZodTypeAny): unknown {
  const def = (schema as unknown as { _def: { typeName: string } })._def;
  switch (def.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodOptional":
      return projectField(
        (def as unknown as { innerType: ZodTypeAny }).innerType,
      );
    case "ZodNullable":
      return projectField(
        (def as unknown as { innerType: ZodTypeAny }).innerType,
      );
    case "ZodDefault":
      return projectField(
        (def as unknown as { innerType: ZodTypeAny }).innerType,
      );
    case "ZodUnion":
      return {
        oneOf: (
          (def as unknown as { options: ZodTypeAny[] }).options ?? []
        ).map(projectField),
      };
    case "ZodArray":
      return {
        type: "array",
        items: projectField((def as unknown as { type: ZodTypeAny }).type),
      };
    case "ZodObject":
      return projectObject(schema as unknown as ZodObjectLike);
    default:
      return {};
  }
}
