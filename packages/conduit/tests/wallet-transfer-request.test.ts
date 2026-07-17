import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PublicKey } from "@solana/web3.js";

import { noopAuditLogger } from "../src/core/audit.js";
import { ConduitError } from "../src/core/errors.js";
import { createInMemoryIdempotencyStore } from "../src/core/idempotency.js";
import {
  createWalletTransferRequestTool,
  createWalletTransferStatusTool,
} from "../src/core/tools/wallet-transfer-request.js";
import type { Session, ToolContext } from "../src/core/types.js";

const VALID_PUBKEY = "11111111111111111111111111111111";

function makeSession(): Session {
  return {
    id: "ses_transfer",
    agentId: "agent-transfer",
    ownerPubkey: new PublicKey(VALID_PUBKEY),
    treasuryPubkey: new PublicKey(VALID_PUBKEY),
    sessionPubkey: null,
    scopes: ["read", "wallet:transfer"],
    protocolVersion: 1,
    metadata: {},
  };
}

function makeContext(credential = "aurak_live_transfer"): ToolContext {
  return {
    session: makeSession(),
    credential,
    audit: noopAuditLogger,
    idempotency: createInMemoryIdempotencyStore(),
    signal: new AbortController().signal,
    requestId: "req_transfer",
  };
}

test("wallet transfer request tool queues owner review through dashboard", async () => {
  const calls: Array<{
    url: string;
    method: string | undefined;
    authorization: string | null;
    body: unknown;
  }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
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
      signRequest: { id: "sr_transfer_1", status: "pending" },
      nextAction: "owner_review_required",
      dashboardUrl: "http://localhost:3000/dashboard/wallets",
      runtimeCanExecute: false,
      note: "Owner approval required.",
    });
  };
  const tool = createWalletTransferRequestTool({
    controlPlaneBaseUrl: "http://localhost:3000/api/conduit/",
    dashboardBaseUrl: "http://localhost:3000/",
    fetchImpl: fetchImpl as typeof fetch,
  });

  const output = await tool.handler(
    tool.input.parse({
      walletId: "wallet_123",
      recipientAddress: VALID_PUBKEY,
      rawAmount: "1000000000",
      decimals: 9,
      amountUi: "1",
      assetKind: "native",
      assetSymbol: "SOL",
      note: "rebalance",
    }),
    makeContext(),
  );

  assert.equal(output.requestId, "sr_transfer_1");
  assert.equal(output.status, "pending");
  assert.equal(output.nextAction, "owner_review_required");
  assert.equal(output.runtimeCanExecute, false);
  assert.equal(
    calls[0]?.url,
    "http://localhost:3000/api/conduit/wallets/transfer-requests",
  );
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.authorization, "Bearer aurak_live_transfer");
  assert.deepEqual(calls[0]?.body, {
    walletId: "wallet_123",
    recipientAddress: VALID_PUBKEY,
    rawAmount: "1000000000",
    decimals: 9,
    amountUi: "1",
    assetKind: "native",
    assetSymbol: "SOL",
    note: "rebalance",
    metadata: {
      conduit_request_id: "req_transfer",
      conduit_session_id: "ses_transfer",
      conduit_agent_id: "agent-transfer",
    },
  });
});

test("wallet transfer status tool polls dashboard status without execution", async () => {
  const calls: Array<{ url: string; method: string | undefined }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method });

    return jsonResponse({
      signRequest: { id: "sr_transfer_1", status: "approved" },
      displayStatus: "approved",
      nextAction: "approved_execution_bridge_pending",
      dashboardUrl: "http://localhost:3000/dashboard/wallets",
      runtimeCanExecute: true,
      note: "Owner approval is recorded.",
      transfer: { amountUi: "1", assetSymbol: "SOL" },
    });
  };
  const tool = createWalletTransferStatusTool({
    controlPlaneBaseUrl: "http://localhost:3000/api/conduit",
    dashboardBaseUrl: "http://localhost:3000",
    fetchImpl: fetchImpl as typeof fetch,
  });

  const output = await tool.handler(
    tool.input.parse({ requestId: "sr_transfer_1" }),
    makeContext(),
  );

  assert.equal(output.requestId, "sr_transfer_1");
  assert.equal(output.status, "approved");
  assert.equal(output.displayStatus, "approved");
  assert.equal(output.nextAction, "approved_execution_bridge_pending");
  assert.equal(output.runtimeCanExecute, false);
  assert.deepEqual(output.transfer, { amountUi: "1", assetSymbol: "SOL" });
  assert.equal(
    calls[0]?.url,
    "http://localhost:3000/api/conduit/wallets/transfer-requests/sr_transfer_1",
  );
  assert.equal(calls[0]?.method, "GET");
});

test("wallet transfer request tool maps dashboard link-required conflicts to needs_human", async () => {
  const fetchImpl = async () =>
    jsonResponse(
      {
        error:
          "Link this dWallet from the dashboard before requesting transfers.",
      },
      409,
    );
  const tool = createWalletTransferRequestTool({
    controlPlaneBaseUrl: "http://localhost:3000/api/conduit",
    dashboardBaseUrl: "http://localhost:3000",
    fetchImpl: fetchImpl as typeof fetch,
  });

  await assert.rejects(
    () =>
      tool.handler(
        tool.input.parse({
          walletId: "wallet_123",
          recipientAddress: VALID_PUBKEY,
          rawAmount: "1",
          decimals: 9,
        }),
        makeContext(),
      ),
    (error: unknown) =>
      error instanceof ConduitError && error.code === "needs_human",
  );
});

test("wallet transfer request tool requires the bearer credential", async () => {
  const tool = createWalletTransferRequestTool({
    controlPlaneBaseUrl: "http://localhost:3000/api/conduit",
    dashboardBaseUrl: "http://localhost:3000",
  });

  await assert.rejects(
    () =>
      tool.handler(
        tool.input.parse({
          walletId: "wallet_123",
          recipientAddress: VALID_PUBKEY,
          rawAmount: "1",
          decimals: 9,
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
