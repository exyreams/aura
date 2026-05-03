import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { loadConfig } from "./config.js";
import { ApiError } from "./errors.js";
import { toApiError } from "./errors.js";
import { createLogger } from "./logger.js";
import { MemoryRateLimiter } from "./rate-limit.js";
import {
  confirmPolicyDecryptionService,
  encryptScalarValues,
  ensureBackendEncryptDeposit,
  executePendingService,
  finalizeExecutionService,
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
} from "./service.js";
import type { ApiErrorResponse, ApiSuccessResponse } from "./types.js";
import {
  parseAgentJobConfig,
  parseConfirmDecryptionRequest,
  parseConfidentialProposalRequest,
  parseEncryptScalarRequest,
  parseEnsureDepositRequest,
  parseExecutePendingRequest,
  parseFinalizeExecutionRequest,
  parseProgramInstructionRequest,
  parsePublicProposalRequest,
  parseRequestDecryptionRequest,
  parseStopAgentRequest,
} from "./validation.js";

try { loadEnvFile(); } catch { /* no .env file in production */ }

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
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    "content-type, authorization, x-request-id",
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

function ensureAuthorized(request: IncomingMessage, requiresAuth: boolean) {
  if (!requiresAuth || !config.apiToken) {
    return;
  }

  const authorization = request.headers.authorization;
  if (authorization !== `Bearer ${config.apiToken}`) {
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Missing or invalid bearer token.",
    );
  }
}

function shouldApplyRateLimit(method: string, pathname: string) {
  if (method === "OPTIONS" || pathname === "/health") {
    return false;
  }
  return true;
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

    const requiresAuth = !(
      routeKey === "GET /health" ||
      routeKey === "GET /v1/service/info" ||
      routeKey === "GET /v1/features/catalog" ||
      routeKey === "GET /v1/instructions/catalog"
    );
    ensureAuthorized(request, requiresAuth);

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
        authEnabled: Boolean(config.apiToken),
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

    if (routeKey === "GET /v1/agent/status") {
      sendSuccess(response, 200, requestId, { jobs: listAgentJobs() });
      return;
    }

    ensureJsonRequest(request);
    const body = await readJson(request);

    if (routeKey === "POST /v1/confidential/encrypt-scalar") {
      sendSuccess(
        response,
        200,
        requestId,
        await encryptScalarValues(parseEncryptScalarRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/confidential/deposit/ensure") {
      sendSuccess(
        response,
        200,
        requestId,
        await ensureBackendEncryptDeposit(parseEnsureDepositRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/confidential/propose") {
      sendSuccess(
        response,
        200,
        requestId,
        await submitConfidentialProposal(parseConfidentialProposalRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/proposals/public") {
      sendSuccess(
        response,
        200,
        requestId,
        await submitPublicProposal(parsePublicProposalRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/instructions/build") {
      sendSuccess(
        response,
        200,
        requestId,
        await buildGenericProgramInstruction(parseProgramInstructionRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/instructions/send") {
      sendSuccess(
        response,
        200,
        requestId,
        await sendGenericProgramInstruction(parseProgramInstructionRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/confidential/request-decryption") {
      sendSuccess(
        response,
        200,
        requestId,
        await requestPolicyDecryptionService(parseRequestDecryptionRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/confidential/confirm-decryption") {
      sendSuccess(
        response,
        200,
        requestId,
        await confirmPolicyDecryptionService(parseConfirmDecryptionRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/execution/execute") {
      sendSuccess(
        response,
        200,
        requestId,
        await executePendingService(parseExecutePendingRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/execution/finalize") {
      sendSuccess(
        response,
        200,
        requestId,
        await finalizeExecutionService(parseFinalizeExecutionRequest(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/agent/start") {
      sendSuccess(
        response,
        200,
        requestId,
        await startAgentJob(parseAgentJobConfig(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/agent/run-once") {
      sendSuccess(
        response,
        200,
        requestId,
        await runAgentOnce(parseAgentJobConfig(body)),
      );
      return;
    }

    if (routeKey === "POST /v1/agent/stop") {
      sendSuccess(
        response,
        200,
        requestId,
        stopAgentJob(parseStopAgentRequest(body).treasury),
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
    backendPublicKey: getBackendInfo().publicKey,
    allowedOrigins: config.allowedOrigins,
    authEnabled: Boolean(config.apiToken),
  });
  if (!config.apiToken) {
    logger.warn("server.auth_disabled", {
      message:
        "AURA_API_TOKEN is not configured. Protected routes are reachable without bearer auth.",
    });
  }
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
