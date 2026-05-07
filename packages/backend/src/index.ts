import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import {
  clearSessionCookie,
  createAuthNonce,
  getAuthenticatedUser,
  loginWithWallet,
  requireAuthenticatedUser,
} from "./auth/index.js";
import {
  createAgentKeypair,
  deleteAgentKeypair,
  getAgentKeypairById,
  identityForAgent,
  listAgentKeypairs,
} from "./agents/index.js";
import { loadConfig } from "./config.js";
import { ApiError } from "./errors.js";
import { toApiError } from "./errors.js";
import { createLogger } from "./logger.js";
import { MemoryRateLimiter } from "./middleware/rate-limit.js";
import {
  confirmPolicyDecryptionService,
  createDwalletService,
  encryptScalarValues,
  encryptVectorValues,
  ensureBackendEncryptDeposit,
  executePendingService,
  finalizeExecutionService,
  getMessageApprovalStatusService,
  triggerIkaSignService,
  buildGenericProgramInstruction,
  getBackendInfo,
  getFeatureCatalog,
  getInstructionCatalog,
  listAgentJobs,
  requestPolicyDecryptionService,
  runAgentOnce,
  sendGenericProgramInstruction,
  startAgentJob,
  stopAgentJob,
  stopAllAgentJobs,
  submitConfidentialProposal,
  submitPublicProposal,
} from "./services/index.js";
import type { ApiErrorResponse, ApiSuccessResponse } from "./types.js";
import {
  parseAgentJobConfig,
  parseAuthLoginRequest,
  parseConfirmDecryptionRequest,
  parseConfidentialProposalRequest,
  parseCreateAgentRequest,
  parseCreateDwalletRequest,
  parseEncryptScalarRequest,
  parseEncryptVectorRequest,
  parseEnsureDepositRequest,
  parseExecutePendingRequest,
  parseFinalizeExecutionRequest,
  parseProgramInstructionRequest,
  parsePublicProposalRequest,
  parseRequestDecryptionRequest,
  parseStopAgentRequest,
} from "./middleware/validation.js";

const config = loadConfig();
const logger = createLogger(config).child({ service: "aura-backend" });
const rateLimiter = new MemoryRateLimiter(
  config.rateLimitWindowMs,
  config.rateLimitMaxRequests,
);

type ResponsePayload<T> = ApiSuccessResponse<T> | ApiErrorResponse;

function getMeta(requestId: string) {
  return {
    requestId,
    timestamp: new Date().toISOString(),
  };
}

function resolveClientIp(request: IncomingMessage) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || request.socket.remoteAddress || "unknown";
  }
  return request.socket.remoteAddress || "unknown";
}

function isOriginAllowed(origin: string | undefined) {
  if (!origin) {
    return true;
  }
  return config.allowedOrigins.includes(origin);
}

function applyCors(request: IncomingMessage, response: ServerResponse) {
  const originHeader =
    typeof request.headers.origin === "string" ? request.headers.origin : undefined;

  response.setHeader("vary", "Origin");
  response.setHeader("access-control-expose-headers", "x-request-id, retry-after");
  response.setHeader("access-control-allow-credentials", "true");
  response.setHeader("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    "content-type, x-request-id",
  );

  if (originHeader && isOriginAllowed(originHeader)) {
    response.setHeader("access-control-allow-origin", originHeader);
  }

  return originHeader;
}

function sendJson<T>(
  response: ServerResponse,
  statusCode: number,
  body: ResponsePayload<T>,
) {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function sendSuccess<T>(
  response: ServerResponse,
  statusCode: number,
  requestId: string,
  data: T,
) {
  response.setHeader("x-request-id", requestId);
  sendJson(response, statusCode, {
    ok: true,
    data,
    meta: getMeta(requestId),
  });
}

function sendDownloadJson(
  response: ServerResponse,
  requestId: string,
  filename: string,
  data: unknown,
) {
  response.statusCode = 200;
  response.setHeader("x-request-id", requestId);
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-disposition", `attachment; filename="${filename}"`);
  response.end(JSON.stringify(data, null, 2));
}

function sendError(
  response: ServerResponse,
  requestId: string,
  error: unknown,
) {
  const apiError = toApiError(error);
  response.setHeader("x-request-id", requestId);
  if (
    apiError.status === 429 &&
    apiError.details &&
    typeof apiError.details === "object" &&
    "retryAfterMs" in apiError.details &&
    typeof apiError.details.retryAfterMs === "number"
  ) {
    response.setHeader(
      "retry-after",
      Math.max(1, Math.ceil(apiError.details.retryAfterMs / 1000)).toString(),
    );
  }
  sendJson(response, apiError.status, {
    ok: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      details: apiError.details,
    },
    meta: getMeta(requestId),
  });
}

function ensureJsonRequest(request: IncomingMessage) {
  const contentType = request.headers["content-type"];
  if (!contentType) {
    return;
  }

  const normalized = Array.isArray(contentType)
    ? contentType.join(",")
    : contentType;
  if (!normalized.toLowerCase().includes("application/json")) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Request body must use content-type application/json.",
    );
  }
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > config.bodyLimitBytes) {
      throw new ApiError(
        413,
        "BODY_TOO_LARGE",
        "Request body exceeded the configured limit.",
      );
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as unknown) : {};
}

function shouldApplyRateLimit(method: string, pathname: string) {
  if (method === "OPTIONS" || pathname === "/health") {
    return false;
  }
  return true;
}

function isPublicRoute(method: string, pathname: string) {
  return (
    (method === "GET" && pathname === "/health") ||
    (method === "GET" && pathname === "/v1/service/info") ||
    (method === "GET" && pathname === "/v1/features/catalog") ||
    (method === "GET" && pathname === "/v1/instructions/catalog") ||
    (method === "GET" && pathname === "/v1/auth/nonce") ||
    (method === "GET" && pathname === "/v1/auth/me") ||
    (method === "POST" && pathname === "/v1/auth/login") ||
    (method === "POST" && pathname === "/v1/auth/logout")
  );
}

const server = createServer(async (request, response) => {
  const startedAt = Date.now();
  const requestId =
    (typeof request.headers["x-request-id"] === "string" &&
      request.headers["x-request-id"].trim()) ||
    randomUUID();
  const routeLogger = logger.child({
    requestId,
    method: request.method,
    url: request.url,
    clientIp: resolveClientIp(request),
  });

  if (!request.url || !request.method) {
    sendError(response, requestId, new Error("Invalid request."));
    return;
  }

  const origin = applyCors(request, response);

  try {
    if (!isOriginAllowed(origin)) {
      throw new ApiError(403, "ORIGIN_NOT_ALLOWED", `Origin ${origin} is not allowed.`);
    }

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const pathname = url.pathname;
    const routeKey = `${request.method} ${pathname}`;

    routeLogger.info("request.received", { routeKey });

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (shouldApplyRateLimit(request.method, pathname)) {
      rateLimiter.check(`${resolveClientIp(request)}:${routeKey}`);
    }

    const requiresAuth = !isPublicRoute(request.method, pathname);
    const authUser = requiresAuth
      ? await requireAuthenticatedUser(request)
      : undefined;
    const serviceContext = authUser ? { user: authUser } : undefined;

    if (routeKey === "GET /health") {
      sendSuccess(response, 200, requestId, {
        status: "ok",
        service: "aura-backend",
      });
      return;
    }

    if (routeKey === "GET /v1/service/info") {
      sendSuccess(response, 200, requestId, {
        ...getBackendInfo(),
        allowedOrigins: config.allowedOrigins,
        authEnabled: true,
      });
      return;
    }

    if (routeKey === "GET /v1/features/catalog") {
      sendSuccess(response, 200, requestId, getFeatureCatalog());
      return;
    }

    if (routeKey === "GET /v1/instructions/catalog") {
      sendSuccess(response, 200, requestId, getInstructionCatalog());
      return;
    }

    if (routeKey === "GET /v1/auth/nonce") {
      sendSuccess(response, 200, requestId, createAuthNonce());
      return;
    }

    if (routeKey === "POST /v1/auth/logout") {
      response.setHeader("set-cookie", clearSessionCookie());
      sendSuccess(response, 200, requestId, { loggedOut: true });
      return;
    }

    if (routeKey === "GET /v1/auth/me") {
      const sessionUser = await getAuthenticatedUser(request);
      sendSuccess(response, 200, requestId, {
        wallet: sessionUser?.wallet ?? null,
      });
      return;
    }

    if (routeKey === "GET /v1/agents") {
      sendSuccess(response, 200, requestId, {
        agents: listAgentKeypairs(authUser!),
      });
      return;
    }

    const agentDownloadMatch = pathname.match(/^\/v1\/agents\/(\d+)\/download$/);
    if (request.method === "GET" && agentDownloadMatch?.[1]) {
      const agent = getAgentKeypairById(authUser!, Number(agentDownloadMatch[1]));
      sendDownloadJson(
        response,
        requestId,
        `${agent.agentId}.aura-agent.json`,
        identityForAgent(agent),
      );
      return;
    }

    const agentDeleteMatch = pathname.match(/^\/v1\/agents\/(\d+)$/);
    if (request.method === "DELETE" && agentDeleteMatch?.[1]) {
      sendSuccess(
        response,
        200,
        requestId,
        deleteAgentKeypair(authUser!, Number(agentDeleteMatch[1])),
      );
      return;
    }

    if (routeKey === "GET /v1/agent/status") {
      sendSuccess(response, 200, requestId, { jobs: listAgentJobs(serviceContext!) });
      return;
    }

    ensureJsonRequest(request);
    const body = await readJson(request);

    if (routeKey === "POST /v1/auth/login") {
      const result = await loginWithWallet(parseAuthLoginRequest(body));
      response.setHeader("set-cookie", result.cookie);
      sendSuccess(response, 200, requestId, result.data);
      return;
    }

    if (routeKey === "POST /v1/agents") {
      const result = createAgentKeypair(authUser!, parseCreateAgentRequest(body));
      // Fire-and-forget devnet airdrop so the agent can pay transaction fees
      if (config.defaultRpcUrl.includes("devnet")) {
        const { Connection, PublicKey: SolPublicKey, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
        const conn = new Connection(config.defaultRpcUrl, "confirmed");
        conn.requestAirdrop(new SolPublicKey(result.agent.publicKey), 0.1 * LAMPORTS_PER_SOL)
          .catch(() => { /* non-fatal — user can fund manually */ });
      }
      sendSuccess(response, 201, requestId, result);
      return;
    }

    if (routeKey === "POST /v1/confidential/encrypt-scalar") {
      sendSuccess(
        response,
        200,
        requestId,
        await encryptScalarValues(parseEncryptScalarRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/confidential/encrypt-vector") {
      sendSuccess(
        response,
        200,
        requestId,
        await encryptVectorValues(parseEncryptVectorRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/confidential/deposit/ensure") {
      sendSuccess(
        response,
        200,
        requestId,
        await ensureBackendEncryptDeposit(serviceContext!, parseEnsureDepositRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/confidential/propose") {
      sendSuccess(
        response,
        200,
        requestId,
        await submitConfidentialProposal(serviceContext!, parseConfidentialProposalRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/proposals/public") {
      sendSuccess(
        response,
        200,
        requestId,
        await submitPublicProposal(serviceContext!, parsePublicProposalRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/instructions/build") {
      sendSuccess(
        response,
        200,
        requestId,
        await buildGenericProgramInstruction(serviceContext!, parseProgramInstructionRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/instructions/send") {
      sendSuccess(
        response,
        200,
        requestId,
        await sendGenericProgramInstruction(serviceContext!, parseProgramInstructionRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/confidential/request-decryption") {
      sendSuccess(
        response,
        200,
        requestId,
        await requestPolicyDecryptionService(serviceContext!, parseRequestDecryptionRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/confidential/confirm-decryption") {
      sendSuccess(
        response,
        200,
        requestId,
        await confirmPolicyDecryptionService(serviceContext!, parseConfirmDecryptionRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/execution/execute") {
      sendSuccess(
        response,
        200,
        requestId,
        await executePendingService(serviceContext!, parseExecutePendingRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/dwallet/create") {
      sendSuccess(
        response,
        200,
        requestId,
        await createDwalletService(serviceContext!, parseCreateDwalletRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/execution/sign") {
      sendSuccess(
        response,
        200,
        requestId,
        await triggerIkaSignService(serviceContext!, {
          rpcUrl: body && typeof body === "object" ? (body as Record<string, unknown>)["rpcUrl"] as string | undefined : undefined,
          programId: body && typeof body === "object" ? (body as Record<string, unknown>)["programId"] as string | undefined : undefined,
          agentId: body && typeof body === "object" ? (body as Record<string, unknown>)["agentId"] as string | undefined : undefined,
          treasury: body && typeof body === "object" ? (body as Record<string, unknown>)["treasury"] as string : "",
          txSignature: body && typeof body === "object" ? (body as Record<string, unknown>)["txSignature"] as string : "",
        }),
      );
      return;
    }

    if (routeKey === "GET /v1/execution/status") {
      sendSuccess(
        response,
        200,
        requestId,
        await getMessageApprovalStatusService({
          rpcUrl: url.searchParams.get("rpcUrl") ?? undefined,
          messageApproval: url.searchParams.get("messageApproval") ?? "",
        }),
      );
      return;
    }

    if (routeKey === "POST /v1/execution/finalize") {
      sendSuccess(
        response,
        200,
        requestId,
        await finalizeExecutionService(serviceContext!, parseFinalizeExecutionRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/agent/start") {
      sendSuccess(
        response,
        200,
        requestId,
        await startAgentJob(serviceContext!, parseAgentJobConfig(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/agent/run-once") {
      sendSuccess(
        response,
        200,
        requestId,
        await runAgentOnce(serviceContext!, parseAgentJobConfig(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/agent/stop") {
      sendSuccess(
        response,
        200,
        requestId,
        await stopAgentJob(serviceContext!, parseStopAgentRequest(body)),
      );
      return;
    }

    throw new ApiError(404, "NOT_FOUND", `Route ${routeKey} was not found.`);
  } catch (error) {
    routeLogger.error("request.failed", { error });
    sendError(response, requestId, error);
  } finally {
    routeLogger.info("request.completed", {
      durationMs: Date.now() - startedAt,
      statusCode: response.statusCode,
    });
  }
});

server.listen(config.port, config.host, () => {
  logger.info("server.started", {
    host: config.host,
    port: config.port,
    allowedOrigins: config.allowedOrigins,
    authEnabled: true,
    authMode: "siws-cookie",
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info("server.shutting_down", { signal });
    stopAllAgentJobs();
    server.close(() => {
      logger.info("server.stopped", { signal });
      process.exit(0);
    });
  });
}
