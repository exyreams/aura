import { strict as assert } from "node:assert";
import { test } from "node:test";

import { z } from "zod";

import { noopAuditLogger } from "../src/core/audit.js";
import { openConduitDb } from "../src/core/control-plane/db.js";
import { SessionsRepo } from "../src/core/control-plane/sessions.js";
import { createInMemoryIdempotencyStore } from "../src/core/idempotency.js";
import { createToolRegistry } from "../src/core/registry.js";
import { strictObject } from "../src/core/schemas.js";
import type { Tool } from "../src/core/types.js";
import { createHttpServer } from "../src/http/server.js";

const VALID_PUBKEY = "11111111111111111111111111111111";

function createSessionToken(db: ReturnType<typeof openConduitDb>): string {
  return new SessionsRepo(db).create({
    agentId: "http-test-agent",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
    sessionPubkey: null,
    sessionSkWrapped: null,
    scopes: ["read"],
    autoApprove: "never",
    capsJson: "{}",
    metadata: {},
    protocolVersion: 1,
    expiresAt: Date.now() + 60_000,
  }).token;
}

function makeEchoTool(calls: { count: number }): Tool {
  return {
    name: "aura.test.echo",
    description: "Echoes a message for HTTP runtime tests.",
    input: strictObject({
      message: z.string(),
      count: z.number().int().default(1),
    }),
    requiredScopes: ["read"],
    isWrite: false,
    triggersInbox: false,
    declaredInstructions: [],
    async handler(parsed, ctx) {
      calls.count += 1;
      return {
        parsed,
        requestId: ctx.requestId,
        signalAborted: ctx.signal.aborted,
      };
    },
  };
}

async function setupServer(options: { maxBodyBytes?: number } = {}) {
  const db = openConduitDb({ inMemory: true });
  const calls = { count: 0 };
  const registry = createToolRegistry([makeEchoTool(calls)]);
  const fastify = await createHttpServer({
    db,
    deps: {
      registry,
      audit: noopAuditLogger,
      idempotency: createInMemoryIdempotencyStore(),
    },
    publicBaseUrl: "http://127.0.0.1:8788",
    corsOrigin: false,
    cookieSecret: "test-cookie-secret",
    maxBodyBytes: options.maxBodyBytes,
  });
  return { db, fastify, calls };
}

test("HTTP /v1 routes reject unauthenticated calls before dispatch", async () => {
  const { fastify, calls } = await setupServer();
  const res = await fastify.inject({
    method: "POST",
    url: "/v1/test/echo",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ message: "hello" }),
  });

  assert.equal(res.statusCode, 401);
  assert.equal(calls.count, 0);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(typeof res.headers["x-request-id"], "string");
  await fastify.close();
});

test("HTTP tool routes propagate request ids and authenticated sessions", async () => {
  const { db, fastify, calls } = await setupServer();
  const token = createSessionToken(db);
  const res = await fastify.inject({
    method: "POST",
    url: "/v1/test/echo",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-request-id": "req_http_runtime",
    },
    payload: JSON.stringify({ message: "hello" }),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(calls.count, 1);
  assert.equal(res.headers["x-request-id"], "req_http_runtime");
  const body = res.json() as {
    requestId: string;
    value: { parsed: { message: string; count: number }; requestId: string };
  };
  assert.equal(body.requestId, "req_http_runtime");
  assert.equal(body.value.requestId, "req_http_runtime");
  assert.deepEqual(body.value.parsed, { message: "hello", count: 1 });
  await fastify.close();
});

test("HTTP gateway returns structured payload_too_large errors", async () => {
  const { db, fastify } = await setupServer({ maxBodyBytes: 64 });
  const token = createSessionToken(db);
  const res = await fastify.inject({
    method: "POST",
    url: "/v1/test/echo",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ message: "x".repeat(256) }),
  });

  assert.equal(res.statusCode, 413);
  const body = res.json() as { error: { code: string }; requestId: string };
  assert.equal(body.error.code, "payload_too_large");
  assert.equal(typeof body.requestId, "string");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  await fastify.close();
});

test("OpenAPI exposes Zod input schemas for registered tools", async () => {
  const { fastify } = await setupServer();
  const res = await fastify.inject({
    method: "GET",
    url: "/openapi.json",
  });

  assert.equal(res.statusCode, 200);
  const spec = res.json() as {
    paths: Record<
      string,
      {
        post: {
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  properties?: Record<string, { type?: string }>;
                  required?: string[];
                };
              };
            };
          };
        };
      }
    >;
  };
  const schema =
    spec.paths["/v1/test/echo"]?.post.requestBody.content["application/json"]
      .schema;
  assert.equal(schema?.properties?.message?.type, "string");
  assert.equal(schema?.properties?.count?.type, "integer");
  assert.deepEqual(schema?.required, ["message"]);
  await fastify.close();
});
