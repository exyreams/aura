import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PublicKey } from "@solana/web3.js";

import { noopAuditLogger } from "../src/core/audit.js";
import { ConduitError } from "../src/core/errors.js";
import { createInMemoryIdempotencyStore } from "../src/core/idempotency.js";
import { createWalletCreateTool } from "../src/core/tools/wallet-create.js";
import type { Session, ToolContext } from "../src/core/types.js";

const VALID_PUBKEY = "11111111111111111111111111111111";

function makeSession(): Session {
  return {
    id: "ses_wallet",
    agentId: "agent-wallet",
    ownerPubkey: new PublicKey(VALID_PUBKEY),
    treasuryPubkey: new PublicKey(VALID_PUBKEY),
    sessionPubkey: null,
    scopes: ["read", "wallet:create"],
    protocolVersion: 1,
    metadata: {},
  };
}

function makeContext(credential = "aurak_live_test"): ToolContext {
  return {
    session: makeSession(),
    credential,
    audit: noopAuditLogger,
    idempotency: createInMemoryIdempotencyStore(),
    signal: new AbortController().signal,
    requestId: "req_wallet",
  };
}

test("wallet create tool records a pending dashboard wallet", async () => {
  const calls: Array<{
    url: string;
    body: unknown;
    authorization: string | null;
  }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      authorization:
        init?.headers instanceof Headers
          ? init.headers.get("authorization")
          : ((init?.headers as Record<string, string> | undefined)
              ?.authorization ?? null),
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : null,
    });

    return jsonResponse({
      wallet: {
        id: "wallet_123",
        status: "agent_created_pending",
        chain_id: 2,
        chain_address: VALID_PUBKEY,
        dwallet_id: "dwallet_123",
      },
      nextAction: "link_wallet_from_dashboard",
    });
  };
  const tool = createWalletCreateTool({
    controlPlaneBaseUrl: "http://localhost:3000/api/conduit/",
    dashboardBaseUrl: "http://localhost:3000/",
    fetchImpl: fetchImpl as typeof fetch,
  });

  const output = await tool.handler(
    tool.input.parse({
      chainAddress: VALID_PUBKEY,
      dwalletId: "dwallet_123",
      label: "Agent wallet",
    }),
    makeContext(),
  );

  assert.equal(output.walletId, "wallet_123");
  assert.equal(output.status, "agent_created_pending");
  assert.equal(output.nextAction, "link_wallet_from_dashboard");
  assert.equal(output.dashboardUrl, "http://localhost:3000/dashboard/wallets");
  assert.equal(
    calls[0]?.url,
    "http://localhost:3000/api/conduit/wallets/dwallets",
  );
  assert.equal(calls[0]?.authorization, "Bearer aurak_live_test");
  assert.deepEqual(calls[0]?.body, {
    chainId: 2,
    chainAddress: VALID_PUBKEY,
    dwalletId: "dwallet_123",
    label: "Agent wallet",
    metadata: {
      conduit_request_id: "req_wallet",
      conduit_session_id: "ses_wallet",
      conduit_agent_id: "agent-wallet",
    },
  });
});

test("wallet create tool requires the bearer credential", async () => {
  const tool = createWalletCreateTool({
    controlPlaneBaseUrl: "http://localhost:3000/api/conduit",
    dashboardBaseUrl: "http://localhost:3000",
  });

  await assert.rejects(
    () =>
      tool.handler(
        tool.input.parse({
          chainAddress: VALID_PUBKEY,
          dwalletId: "dwallet_123",
        }),
        makeContext(""),
      ),
    (error: unknown) =>
      error instanceof ConduitError && error.code === "unauthenticated",
  );
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
