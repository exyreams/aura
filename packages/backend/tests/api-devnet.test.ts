import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { AuraClient } from "@aura-protocol/sdk-ts";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const tsxBin = join(packageRoot, "node_modules", "tsx", "dist", "cli.mjs");
const rpcUrl =
  process.env["AURA_DEVNET_RPC_URL"] ??
  process.env["AURA_DEFAULT_RPC_URL"] ??
  process.env["SOLANA_RPC_URL"] ??
  "https://api.devnet.solana.com";
const walletPath =
  process.env["PAYER_KEYPAIR"] ??
  join(homedir(), ".config", "solana", "id.json");
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function loadPayer() {
  const secret = new Uint8Array(
    JSON.parse(readFileSync(walletPath, "utf8")) as number[],
  );
  return Keypair.fromSecretKey(secret);
}

function signSiwsMessage(keypair: Keypair, message: string) {
  const seed = Buffer.from(keypair.secretKey).subarray(0, 32);
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  return bs58.encode(sign(null, Buffer.from(message, "utf8"), privateKey));
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function createTreasuryArgs(agentId: string) {
  return {
    agentId,
    aiAuthority: "$backend",
    createdAt: now(),
    pendingTransactionTtlSecs: "900",
    policyConfig: {
      dailyLimitUsd: "10000",
      perTxLimitUsd: "1000",
      daytimeHourlyLimitUsd: "2500",
      nighttimeHourlyLimitUsd: "500",
      velocityLimitUsd: "5000",
      allowedProtocolBitmap: "31",
      maxSlippageBps: "100",
      maxQuoteAgeSecs: "300",
      maxCounterpartyRiskScore: 70,
      bitcoinManualReviewThresholdUsd: "5000",
      sharedPoolLimitUsd: null,
      weeklyLimitUsd: null,
      monthlyLimitUsd: null,
      recipientLimits: [],
      cooldownConfig: null,
      anomalyConfig: null,
      reputationPolicy: {
        highScoreThreshold: "80",
        mediumScoreThreshold: "50",
        highMultiplierBps: "15000",
        lowMultiplierBps: "7000",
      },
      budgetEnvelopes: [],
      approvalLadder: null,
      scopedPauseEntries: [],
      livenessConfig: {
        requireEncryptFreshness: false,
        requireDwalletFreshness: false,
        requireBalanceOracleFreshness: false,
        requireComplianceOracleFreshness: false,
        maxStalenessSecs: "300",
      },
    },
    protocolFees: {
      treasuryCreationFeeUsd: "100",
      transactionFeeBps: "10",
      fheSubsidyBps: "5000",
    },
  };
}

async function waitForHealth(baseUrl: string, serverLogs: () => string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Backend did not start in time.\n${serverLogs()}`);
}

async function request<T>(
  baseUrl: string,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  cookie?: string,
): Promise<{ data: T; setCookie?: string }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = JSON.parse(text) as {
    data?: T;
    error?: { message?: string };
  };
  assert.equal(
    response.ok,
    true,
    `${method} ${path} failed: ${JSON.stringify(json)}`,
  );
  return {
    data: (json.data ?? json) as T,
    setCookie: response.headers.get("set-cookie") ?? undefined,
  };
}

function startBackend(
  port: number,
  logs: string[],
  databasePath: string,
): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, [tsxBin, "src/index.ts"], {
    cwd: packageRoot,
    env: {
      ...process.env,
      AURA_BACKEND_HOST: "127.0.0.1",
      AURA_BACKEND_PORT: String(port),
      AURA_DATABASE_PATH: databasePath,
      AURA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      AURA_JWT_SECRET: randomBytes(32).toString("hex"),
      AURA_COOKIE_SECURE: "false",
      AURA_DEFAULT_RPC_URL: rpcUrl,
      NODE_NO_WARNINGS: "1",
    },
  });
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return child;
}

test("devnet backend HTTP API covers catalog, generic send, and public proposals", async () => {
  const payer = loadPayer();
  const connection = new Connection(rpcUrl, "confirmed");
  const balance = await connection.getBalance(payer.publicKey);
  assert.ok(
    balance > 0.5 * LAMPORTS_PER_SOL,
    `Payer ${payer.publicKey.toBase58()} needs devnet SOL for backend API tests.`,
  );

  const port = 9000 + Math.floor(Math.random() * 500);
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs: string[] = [];
  const tempDir = mkdtempSync(join(packageRoot, ".tmp-api-devnet-"));
  const server = startBackend(port, logs, join(tempDir, "aura.db"));
  const serverLogs = () => logs.join("");

  try {
    await waitForHealth(baseUrl, serverLogs);

    const suffix = Date.now().toString(36);
    const agentId = `api-rc-${suffix}`;
    const client = new AuraClient({ connection });

    const health = (await request<{ status: string }>(baseUrl, "GET", "/health")).data;
    assert.equal(health.status, "ok");

    const serviceInfo = (await request<{ auth: { mode: string } }>(
      baseUrl,
      "GET",
      "/v1/service/info",
    )).data;
    assert.equal(serviceInfo.auth.mode, "siws-cookie");

    const features = (await request<{
      totals: { domains: number; instructions: number };
    }>(baseUrl, "GET", "/v1/features/catalog")).data;
    assert.equal(features.totals.instructions, 67);

    const catalog = (await request<{
      totals: { domains: number; instructions: number };
    }>(baseUrl, "GET", "/v1/instructions/catalog")).data;
    assert.equal(catalog.totals.instructions, 67);

    const nonce = (await request<{ message: string }>(
      baseUrl,
      "GET",
      "/v1/auth/nonce",
    )).data;
    const login = await request<{ wallet: string }>(
      baseUrl,
      "POST",
      "/v1/auth/login",
      {
        walletAddress: payer.publicKey.toBase58(),
        message: nonce.message,
        signature: signSiwsMessage(payer, nonce.message),
      },
    );
    const cookie = login.setCookie?.split(";")[0];
    assert.ok(cookie, "login should set aura_session cookie");

    const createdAgent = (await request<{
      agent: { publicKey: string; agentId: string };
      identity: { publicKey: string };
    }>(
      baseUrl,
      "POST",
      "/v1/agents",
      { agentId, label: "API devnet agent" },
      cookie,
    )).data;
    assert.equal(createdAgent.agent.agentId, agentId);
    assert.equal(createdAgent.identity.publicKey, createdAgent.agent.publicKey);
    console.log(`  api.agent public key: ${createdAgent.agent.publicKey}`);

    const agentPublicKey = new PublicKey(createdAgent.agent.publicKey);
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: agentPublicKey,
        lamports: Math.floor(0.75 * LAMPORTS_PER_SOL),
      }),
    );
    const fundSignature = await sendAndConfirmTransaction(
      connection,
      fundTx,
      [payer],
      { commitment: "confirmed" },
    );
    console.log(`  api.agent_fund tx: ${fundSignature}`);

    const [treasury] = client.deriveTreasuryAddress(agentPublicKey, agentId);

    const create = (await request<{ signature: string }>(
      baseUrl,
      "POST",
      "/v1/instructions/send",
      {
        agentId,
        instruction: "create_treasury",
        accounts: { owner: "$backend", treasury: treasury.toBase58() },
        args: createTreasuryArgs(agentId),
        rpcUrl,
      },
      cookie,
    )).data;
    console.log(`  api.create_treasury tx: ${create.signature}`);
    console.log(`  treasury PDA:          ${treasury.toBase58()}`);

    const build = (await request<{ instruction: { accounts: unknown[] } }>(
      baseUrl,
      "POST",
      "/v1/instructions/build",
      {
        agentId,
        instruction: "transition_agent_state",
        accounts: { owner: "$backend", treasury: treasury.toBase58() },
        args: { targetState: 1, now: now() },
        rpcUrl,
      },
      cookie,
    )).data;
    assert.equal(build.instruction.accounts.length, 2);

    const activate = (await request<{ signature: string }>(
      baseUrl,
      "POST",
      "/v1/instructions/send",
      {
        agentId,
        instruction: "transition_agent_state",
        accounts: { owner: "$backend", treasury: treasury.toBase58() },
        args: { targetState: 1, now: now() },
        rpcUrl,
      },
      cookie,
    )).data;
    console.log(`  api.transition_agent_state tx: ${activate.signature}`);

    const pause = (await request<{ signature: string }>(
      baseUrl,
      "POST",
      "/v1/instructions/send",
      {
        agentId,
        instruction: "pause_execution",
        accounts: { owner: "$backend", treasury: treasury.toBase58() },
        args: { paused: true, now: now() },
        rpcUrl,
      },
      cookie,
    )).data;
    console.log(`  api.pause_execution tx: ${pause.signature}`);

    const unpause = (await request<{ signature: string }>(
      baseUrl,
      "POST",
      "/v1/instructions/send",
      {
        agentId,
        instruction: "pause_execution",
        accounts: { owner: "$backend", treasury: treasury.toBase58() },
        args: { paused: false, now: now() },
        rpcUrl,
      },
      cookie,
    )).data;
    console.log(`  api.unpause_execution tx: ${unpause.signature}`);

    const proposal = (await request<{ signature: string }>(
      baseUrl,
      "POST",
      "/v1/proposals/public",
      {
        agentId,
        treasury: treasury.toBase58(),
        amountUsd: 35,
        chain: 2,
        txType: 0,
        recipient: payer.publicKey.toBase58(),
        rpcUrl,
      },
      cookie,
    )).data;
    console.log(`  api.public_proposal tx: ${proposal.signature}`);

    const cancel = (await request<{ signature: string }>(
      baseUrl,
      "POST",
      "/v1/instructions/send",
      {
        agentId,
        instruction: "cancel_pending",
        accounts: { owner: "$backend", treasury: treasury.toBase58() },
        args: { now: now() },
        rpcUrl,
      },
      cookie,
    )).data;
    console.log(`  api.cancel_pending tx: ${cancel.signature}`);
  } finally {
    server.kill("SIGTERM");
    rmSync(tempDir, { recursive: true, force: true });
  }
});
