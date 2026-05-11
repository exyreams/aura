import { ApiError } from "../errors.js";
import type { AgentJobConfig } from "../types.js";

type JsonRecord = Record<string, unknown>;

function ensureObject(value: unknown, label = "request body"): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_BODY", `${label} must be a JSON object.`);
  }
  return value as JsonRecord;
}

function optionalString(body: JsonRecord, key: string) {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_FIELD", `${key} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requiredString(body: JsonRecord, key: string) {
  const value = optionalString(body, key);
  if (!value) {
    throw new ApiError(400, "MISSING_FIELD", `${key} is required.`);
  }
  return value;
}

function requiredEnumString<T extends string>(
  body: JsonRecord,
  key: string,
  allowedValues: readonly T[],
) {
  const value = requiredString(body, key);
  if (!allowedValues.includes(value as T)) {
    throw new ApiError(
      400,
      "INVALID_FIELD",
      `${key} must be one of: ${allowedValues.join(", ")}.`,
    );
  }
  return value as T;
}

function optionalNumber(body: JsonRecord, key: string) {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "number" && typeof value !== "string") {
    throw new ApiError(400, "INVALID_FIELD", `${key} must be a number.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, "INVALID_FIELD", `${key} must be a finite number.`);
  }
  return parsed;
}

function requiredNumber(body: JsonRecord, key: string) {
  const value = optionalNumber(body, key);
  if (value === undefined) {
    throw new ApiError(400, "MISSING_FIELD", `${key} is required.`);
  }
  return value;
}

function optionalPositiveNumber(body: JsonRecord, key: string) {
  const value = optionalNumber(body, key);
  if (value === undefined) {
    return undefined;
  }
  if (value <= 0) {
    throw new ApiError(400, "INVALID_FIELD", `${key} must be greater than 0.`);
  }
  return value;
}

function requiredPositiveNumber(body: JsonRecord, key: string) {
  const value = requiredNumber(body, key);
  if (value <= 0) {
    throw new ApiError(400, "INVALID_FIELD", `${key} must be greater than 0.`);
  }
  return value;
}

function optionalBoolean(body: JsonRecord, key: string) {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ApiError(400, "INVALID_FIELD", `${key} must be a boolean.`);
  }
  return value;
}

function parseRpcBase(body: JsonRecord) {
  return {
    rpcUrl: optionalString(body, "rpcUrl"),
    programId: optionalString(body, "programId"),
  };
}

function parseAgentBase(body: JsonRecord) {
  return {
    ...parseRpcBase(body),
    agentId: requiredString(body, "agentId"),
  };
}

export function parseAuthLoginRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    walletAddress: requiredString(body, "walletAddress"),
    message: requiredString(body, "message"),
    signature: requiredString(body, "signature"),
  };
}

export function parseCreateAgentRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    agentId: requiredString(body, "agentId"),
    label: optionalString(body, "label"),
  };
}

export function parseEncryptScalarRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    ...parseRpcBase(body),
    dailyLimit: requiredNumber(body, "dailyLimit"),
    perTxLimit: requiredNumber(body, "perTxLimit"),
    spentToday: optionalNumber(body, "spentToday"),
    wait: optionalBoolean(body, "wait") === true,
  };
}

export function parseEnsureDepositRequest(input: unknown) {
  const body = ensureObject(input);
  return parseAgentBase(body);
}

export function parseConfidentialProposalRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    ...parseAgentBase(body),
    treasury: requiredString(body, "treasury"),
    amountUsd: requiredNumber(body, "amountUsd"),
    chain: requiredNumber(body, "chain"),
    txType: requiredNumber(body, "txType"),
    recipient: requiredString(body, "recipient"),
    protocolId: optionalNumber(body, "protocolId"),
    expectedOutputUsd: optionalNumber(body, "expectedOutputUsd"),
    actualOutputUsd: optionalNumber(body, "actualOutputUsd"),
    quoteAgeSecs: optionalNumber(body, "quoteAgeSecs"),
    counterpartyRiskScore: optionalNumber(body, "counterpartyRiskScore"),
    waitForOutput: optionalBoolean(body, "waitForOutput") === true,
  };
}

export function parsePublicProposalRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    ...parseAgentBase(body),
    treasury: requiredString(body, "treasury"),
    amountUsd: requiredNumber(body, "amountUsd"),
    chain: requiredNumber(body, "chain"),
    txType: requiredNumber(body, "txType"),
    recipient: requiredString(body, "recipient"),
    protocolId: optionalNumber(body, "protocolId"),
    expectedOutputUsd: optionalNumber(body, "expectedOutputUsd"),
    actualOutputUsd: optionalNumber(body, "actualOutputUsd"),
    quoteAgeSecs: optionalNumber(body, "quoteAgeSecs"),
    counterpartyRiskScore: optionalNumber(body, "counterpartyRiskScore"),
  };
}

export function parseRequestDecryptionRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    ...parseAgentBase(body),
    treasury: requiredString(body, "treasury"),
    ciphertext: optionalString(body, "ciphertext"),
    wait: optionalBoolean(body, "wait") === true,
  };
}

export function parseConfirmDecryptionRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    ...parseAgentBase(body),
    treasury: requiredString(body, "treasury"),
    requestAccount: optionalString(body, "requestAccount"),
  };
}

export function parseExecutePendingRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    ...parseAgentBase(body),
    treasury: requiredString(body, "treasury"),
    wait: optionalBoolean(body, "wait") === true,
    waitSigned: optionalBoolean(body, "waitSigned") === true,
  };
}

export function parseFinalizeExecutionRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    ...parseAgentBase(body),
    treasury: requiredString(body, "treasury"),
    messageApproval: optionalString(body, "messageApproval"),
  };
}

export function parseAgentJobConfig(input: unknown): AgentJobConfig {
  const body = ensureObject(input);
  return {
    ...parseAgentBase(body),
    treasury: requiredString(body, "treasury"),
    strategy: requiredString(body, "strategy"),
    mode: requiredEnumString(body, "mode", ["public", "confidential"] as const),
    model: requiredString(body, "model"),
    apiKey: requiredString(body, "apiKey"),
    endpoint: optionalString(body, "endpoint"),
    intervalMs: optionalPositiveNumber(body, "intervalMs"),
    maxTradeSizeUsd: requiredPositiveNumber(body, "maxTradeSizeUsd"),
    recipient: requiredString(body, "recipient"),
    txType: requiredNumber(body, "txType"),
    chain: requiredNumber(body, "chain"),
  };
}

export function parseStopAgentRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    agentId: requiredString(body, "agentId"),
    treasury: requiredString(body, "treasury"),
  };
}

export function parseCreateDwalletRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    ...parseAgentBase(body),
    ikaGrpcUrl: optionalString(body, "ikaGrpcUrl"),
  };
}

export function parseRegisterTreasuryRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    treasuryAddress: requiredString(body, "treasuryAddress"),
    agentId: requiredString(body, "agentId"),
    txSignature: requiredString(body, "txSignature"),
    ownerWallet: optionalString(body, "ownerWallet"),
    agentPublicKey: optionalString(body, "agentPublicKey"),
  };
}

export function parseRegisterGuardrailsRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    treasuryAddress: requiredString(body, "treasuryAddress"),
    txSignature: requiredString(body, "txSignature"),
    dailyLimitCiphertext: requiredString(body, "dailyLimitCiphertext"),
    perTxLimitCiphertext: requiredString(body, "perTxLimitCiphertext"),
    spentTodayCiphertext: requiredString(body, "spentTodayCiphertext"),
  };
}

export function parseRegisterEventRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    treasuryAddress: requiredString(body, "treasuryAddress"),
    txSignature: requiredString(body, "txSignature"),
    kind: requiredString(body, "kind"),
    walletAddress: optionalString(body, "walletAddress"),
    meta: body["meta"] && typeof body["meta"] === "object" && !Array.isArray(body["meta"])
      ? (body["meta"] as Record<string, unknown>)
      : undefined,
  };
}

export function parseRegisterDwalletRequest(input: unknown) {
  const body = ensureObject(input);
  return {
    treasuryAddress: requiredString(body, "treasuryAddress"),
    txSignature: requiredString(body, "txSignature"),
    dwalletId: requiredString(body, "dwalletId"),
    dwalletAccount: requiredString(body, "dwalletAccount"),
    chain: requiredNumber(body, "chain"),
    address: requiredString(body, "address"),
    balanceUsd: optionalNumber(body, "balanceUsd") ?? 0,
    publicKeyHex: optionalString(body, "publicKeyHex"),
  };
}

function optionalRecord(body: JsonRecord, key: string) {
  const value = body[key];
  if (value === undefined || value === null) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_FIELD", `${key} must be a JSON object.`);
  }
  return value as JsonRecord;
}

export function parseProgramInstructionRequest(input: unknown) {
  const body = ensureObject(input);
  const args = body["args"];
  if (
    args !== undefined &&
    args !== null &&
    typeof args !== "object" &&
    !Array.isArray(args)
  ) {
    throw new ApiError(400, "INVALID_FIELD", "args must be a JSON object or array.");
  }
  return {
    ...parseRpcBase(body),
    agentId: optionalString(body, "agentId"),
    instruction: requiredString(body, "instruction"),
    accounts: optionalRecord(body, "accounts"),
    args:
      args === undefined || args === null
        ? {}
        : (args as JsonRecord | unknown[]),
    computeUnitLimit: optionalNumber(body, "computeUnitLimit"),
  };
}
