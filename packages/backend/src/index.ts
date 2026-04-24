import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadEnvFile } from "node:process";
import { loadConfig } from "./config.js";
import {
  confirmPolicyDecryptionService,
  encryptScalarValues,
  ensureBackendEncryptDeposit,
  executePendingService,
  finalizeExecutionService,
  getBackendInfo,
  listAgentJobs,
  requestPolicyDecryptionService,
  runAgentOnce,
  startAgentJob,
  stopAgentJob,
  submitConfidentialProposal,
} from "./service.js";
import type { AgentJobConfig } from "./types.js";

loadEnvFile();

const config = loadConfig();

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-headers", "content-type, authorization");
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, error: unknown) {
  sendJson(response, 500, {
    error: error instanceof Error ? error.message : String(error),
  });
}

const server = createServer(async (request, response) => {
  if (!request.url || !request.method) {
    sendJson(response, 400, { error: "Invalid request" });
    return;
  }
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  try {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === "GET" && request.url === "/v1/service/info") {
      sendJson(response, 200, getBackendInfo());
      return;
    }
    if (request.method === "GET" && request.url === "/v1/agent/status") {
      sendJson(response, 200, { jobs: listAgentJobs() });
      return;
    }

    const body = await readJson(request);

    if (request.method === "POST" && request.url === "/v1/confidential/encrypt-scalar") {
      sendJson(
        response,
        200,
        await encryptScalarValues({
          rpcUrl: body.rpcUrl as string | undefined,
          programId: body.programId as string | undefined,
          dailyLimit: Number(body.dailyLimit),
          perTxLimit: Number(body.perTxLimit),
          spentToday: body.spentToday ? Number(body.spentToday) : 0,
          wait: body.wait === true,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/confidential/deposit/ensure") {
      sendJson(
        response,
        200,
        await ensureBackendEncryptDeposit({
          rpcUrl: body.rpcUrl as string | undefined,
          programId: body.programId as string | undefined,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/confidential/propose") {
      sendJson(
        response,
        200,
        await submitConfidentialProposal({
          rpcUrl: body.rpcUrl as string | undefined,
          programId: body.programId as string | undefined,
          treasury: String(body.treasury),
          amountUsd: Number(body.amountUsd),
          chain: Number(body.chain),
          txType: Number(body.txType),
          recipient: String(body.recipient),
          protocolId: body.protocolId ? Number(body.protocolId) : undefined,
          expectedOutputUsd: body.expectedOutputUsd
            ? Number(body.expectedOutputUsd)
            : undefined,
          actualOutputUsd: body.actualOutputUsd
            ? Number(body.actualOutputUsd)
            : undefined,
          quoteAgeSecs: body.quoteAgeSecs ? Number(body.quoteAgeSecs) : undefined,
          counterpartyRiskScore: body.counterpartyRiskScore
            ? Number(body.counterpartyRiskScore)
            : undefined,
          waitForOutput: body.waitForOutput === true,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/confidential/request-decryption") {
      sendJson(
        response,
        200,
        await requestPolicyDecryptionService({
          rpcUrl: body.rpcUrl as string | undefined,
          programId: body.programId as string | undefined,
          treasury: String(body.treasury),
          ciphertext: body.ciphertext as string | undefined,
          wait: body.wait === true,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/confidential/confirm-decryption") {
      sendJson(
        response,
        200,
        await confirmPolicyDecryptionService({
          rpcUrl: body.rpcUrl as string | undefined,
          programId: body.programId as string | undefined,
          treasury: String(body.treasury),
          requestAccount: body.requestAccount as string | undefined,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/execution/execute") {
      sendJson(
        response,
        200,
        await executePendingService({
          rpcUrl: body.rpcUrl as string | undefined,
          programId: body.programId as string | undefined,
          treasury: String(body.treasury),
          wait: body.wait === true,
          waitSigned: body.waitSigned === true,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/execution/finalize") {
      sendJson(
        response,
        200,
        await finalizeExecutionService({
          rpcUrl: body.rpcUrl as string | undefined,
          programId: body.programId as string | undefined,
          treasury: String(body.treasury),
          messageApproval: body.messageApproval as string | undefined,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/v1/agent/start") {
      sendJson(response, 200, await startAgentJob(body as unknown as AgentJobConfig));
      return;
    }

    if (request.method === "POST" && request.url === "/v1/agent/run-once") {
      sendJson(response, 200, await runAgentOnce(body as unknown as AgentJobConfig));
      return;
    }

    if (request.method === "POST" && request.url === "/v1/agent/stop") {
      sendJson(response, 200, stopAgentJob(String(body.treasury)));
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(config.port, config.host, () => {
  console.log(
    `AURA backend listening on http://${config.host}:${config.port} as ${getBackendInfo().publicKey}`,
  );
});
