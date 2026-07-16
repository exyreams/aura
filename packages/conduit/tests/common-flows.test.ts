import { strict as assert } from "node:assert";
import { test } from "node:test";

import { AURA_PROGRAM_ID } from "@aura-protocol/sdk-ts";
import { PublicKey } from "@solana/web3.js";

import { noopAuditLogger } from "../src/core/audit.js";
import { openConduitDb } from "../src/core/control-plane/db.js";
import { SignRequestsRepo } from "../src/core/control-plane/sign-requests.js";
import { createInMemoryIdempotencyStore } from "../src/core/idempotency.js";
import type { SigningService } from "../src/core/signing/types.js";
import { createSolanaContext } from "../src/core/solana.js";
import { TocTouGuard } from "../src/core/toctou.js";
import {
  createExecutionPauseRequestTool,
  createRecipientLimitSetRequestTool,
  createSpendRequestTool,
} from "../src/core/tools/common-flows.js";
import type { Session, ToolContext } from "../src/core/types.js";

const VALID_PUBKEY = "11111111111111111111111111111111";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "ses_test",
    agentId: "agent",
    ownerPubkey: new PublicKey(VALID_PUBKEY),
    treasuryPubkey: new PublicKey(VALID_PUBKEY),
    sessionPubkey: null,
    scopes: ["read", "propose", "execute"],
    protocolVersion: 1,
    metadata: {},
    ...overrides,
  };
}

function makeContext(session = makeSession()): ToolContext {
  return {
    session,
    audit: noopAuditLogger,
    idempotency: createInMemoryIdempotencyStore(),
    signal: new AbortController().signal,
    requestId: "req_test",
  };
}

function makeSolana() {
  const solana = createSolanaContext({
    rpcUrl: "http://127.0.0.1:8899",
    programId: AURA_PROGRAM_ID,
  });
  (
    solana.connection as unknown as {
      getLatestBlockhash: () => Promise<{
        blockhash: string;
        lastValidBlockHeight: number;
      }>;
    }
  ).getLatestBlockhash = async () => ({
    blockhash: VALID_PUBKEY,
    lastValidBlockHeight: 123,
  });
  return solana;
}

const unusedSigner: SigningService = {
  async publicKeyFor() {
    throw new Error("not used");
  },
  async sign() {
    throw new Error("not used");
  },
};

test("friendly execution pause request queues owner-reviewed sign request", async () => {
  const db = openConduitDb({ inMemory: true });
  const tool = createExecutionPauseRequestTool({ db, solana: makeSolana() });
  const output = await tool.handler(
    tool.input.parse({ paused: true, reason: "incident response" }),
    makeContext(),
  );

  assert.equal(output.status, "queued_for_human");
  assert.equal(output.instruction, "pause_execution");
  assert.equal(output.safety.signerClass, "owner");
  assert.equal(output.safety.humanReview, "required");

  const row = new SignRequestsRepo(db).findById(output.signRequestId);
  assert.notEqual(row, null);
  assert.equal(row?.instructionName, "pause_execution");
  const summary = JSON.parse(row?.decodedSummaryJson ?? "{}") as {
    action?: string;
    safety?: { riskLevel?: string };
    reason?: string;
  };
  assert.equal(summary.action, "execution_pause_request");
  assert.equal(summary.safety?.riskLevel, "high");
  assert.equal(summary.reason, "incident response");
});

test("friendly recipient limit tool preserves normalized metadata", async () => {
  const db = openConduitDb({ inMemory: true });
  const tool = createRecipientLimitSetRequestTool({
    db,
    solana: makeSolana(),
  });
  const output = await tool.handler(
    tool.input.parse({
      chain: 1,
      address: "0xRecipient",
      dailyLimitUsd: "5000",
      perTxLimitUsd: "1000",
    }),
    makeContext(),
  );

  assert.equal(output.instruction, "set_recipient_limit");
  assert.equal(output.safety.humanReview, "required");
  const args = output.normalizedArgs[0] as Record<string, unknown>;
  assert.deepEqual(args, {
    chain: 1,
    address: "0xRecipient",
    dailyLimitUsd: "5000",
    perTxLimitUsd: "1000",
    now: args.now,
  });
});

test("friendly spend request delegates to proposal creation queue path", async () => {
  const db = openConduitDb({ inMemory: true });
  const tool = createSpendRequestTool({
    db,
    solana: makeSolana(),
    signer: unusedSigner,
    dashboardBaseUrl: "http://localhost:3000/dashboard",
    toctou: new TocTouGuard(),
  });

  const output = await tool.handler(
    tool.input.parse({
      amountUsd: "2500",
      chain: 1,
      recipient: "0xRecipient",
      reason: "rebalance",
    }),
    makeContext(),
  );

  assert.equal(output.status, "queued_for_human");
  assert.equal(output.signature, null);
  assert.match(output.dashboardUrl, /\/proposals\/prop_/u);

  const pending = new SignRequestsRepo(db).listPendingForOwner(VALID_PUBKEY);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.instructionName, "propose_transaction");
});
