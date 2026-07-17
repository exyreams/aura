import { z } from "zod";

import { ConduitError, type ConduitErrorCode } from "../errors.js";
import { PubkeyString, strictObject } from "../schemas.js";
import type { Tool, ToolContext } from "../types.js";

const transferRequestInput = strictObject({
  walletId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .describe("Dashboard wallet_registry id to request a transfer from."),
  recipientAddress: PubkeyString.describe("Solana recipient address."),
  rawAmount: z
    .union([
      z
        .string()
        .trim()
        .regex(/^[0-9]+$/u),
      z.number().int().positive().transform(String),
    ])
    .describe("Raw token amount in smallest units, e.g. lamports for SOL."),
  decimals: z
    .number()
    .int()
    .min(0)
    .max(18)
    .default(9)
    .describe("Token decimals used to display the request amount."),
  amountUi: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe("Optional human-readable amount shown to the owner."),
  assetKind: z.enum(["native", "token"]).default("native"),
  assetSymbol: z.string().trim().min(1).max(24).default("SOL"),
  assetName: z.string().trim().min(1).max(80).optional(),
  tokenMint: PubkeyString.optional(),
  tokenProgram: PubkeyString.optional(),
  sourceTokenAccount: PubkeyString.optional(),
  note: z.string().trim().min(1).max(240).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if (value.assetKind !== "token") {
    return;
  }

  for (const key of [
    "tokenMint",
    "tokenProgram",
    "sourceTokenAccount",
  ] as const) {
    if (value[key] === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required for token transfers`,
      });
    }
  }
});

const transferStatusInput = strictObject({
  requestId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .describe(
      "Transfer sign request id returned by aura.wallet.transfer.request.",
    ),
});

export type WalletTransferRequestInput = z.infer<typeof transferRequestInput>;
export type WalletTransferStatusInput = z.infer<typeof transferStatusInput>;

export interface WalletTransferRequestOutput {
  readonly requestId: string;
  readonly status: string;
  readonly nextAction: string;
  readonly dashboardUrl: string;
  readonly runtimeCanExecute: false;
  readonly note: string;
}

export interface WalletTransferStatusOutput {
  readonly requestId: string;
  readonly status: string;
  readonly displayStatus: string;
  readonly nextAction: string;
  readonly dashboardUrl: string;
  readonly runtimeCanExecute: false;
  readonly note: string;
  readonly transfer: unknown;
}

interface DashboardTransferResponse {
  readonly signRequest?: {
    readonly id?: unknown;
    readonly status?: unknown;
  };
  readonly displayStatus?: unknown;
  readonly nextAction?: unknown;
  readonly dashboardUrl?: unknown;
  readonly runtimeCanExecute?: unknown;
  readonly note?: unknown;
  readonly transfer?: unknown;
  readonly error?: unknown;
}

export interface WalletTransferToolDeps {
  readonly controlPlaneBaseUrl: string;
  readonly dashboardBaseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

export function createWalletTransferRequestTool(
  deps: WalletTransferToolDeps,
): Tool<typeof transferRequestInput, WalletTransferRequestOutput> {
  const controlPlaneBaseUrl = deps.controlPlaneBaseUrl.replace(/\/$/, "");
  const dashboardBaseUrl = deps.dashboardBaseUrl.replace(/\/$/, "");
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  return {
    name: "aura.wallet.transfer.request",
    description:
      "Queues a dWallet transfer request for owner review in the AURA dashboard. This does not sign or submit an on-chain transaction.",
    input: transferRequestInput,
    requiredScopes: ["wallet:transfer"],
    isWrite: true,
    triggersInbox: true,
    declaredInstructions: [],
    proxiesOwnerSignature: true,
    async handler(
      parsed: WalletTransferRequestInput,
      ctx: ToolContext,
    ): Promise<WalletTransferRequestOutput> {
      const payload = await callDashboardTransferApi({
        method: "POST",
        path: "/wallets/transfer-requests",
        parsed,
        ctx,
        fetchImpl,
        controlPlaneBaseUrl,
      });

      const requestId = requiredString(
        payload.signRequest?.id,
        "signRequest.id",
      );
      const status = requiredString(
        payload.signRequest?.status,
        "signRequest.status",
      );

      return {
        requestId,
        status,
        nextAction:
          optionalString(payload.nextAction) ?? "owner_review_required",
        dashboardUrl:
          optionalString(payload.dashboardUrl) ??
          `${dashboardBaseUrl}/dashboard/wallets`,
        runtimeCanExecute: false,
        note:
          optionalString(payload.note) ??
          "The owner must approve this request in the dashboard before any execution path can continue.",
      };
    },
  };
}

export function createWalletTransferStatusTool(
  deps: WalletTransferToolDeps,
): Tool<typeof transferStatusInput, WalletTransferStatusOutput> {
  const controlPlaneBaseUrl = deps.controlPlaneBaseUrl.replace(/\/$/, "");
  const dashboardBaseUrl = deps.dashboardBaseUrl.replace(/\/$/, "");
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  return {
    name: "aura.wallet.transfer.status",
    description:
      "Polls an owner-reviewed dWallet transfer request status from the AURA dashboard. This tool never executes the transfer.",
    input: transferStatusInput,
    requiredScopes: ["wallet:transfer"],
    isWrite: false,
    triggersInbox: false,
    declaredInstructions: [],
    async handler(
      parsed: WalletTransferStatusInput,
      ctx: ToolContext,
    ): Promise<WalletTransferStatusOutput> {
      const payload = await callDashboardTransferApi({
        method: "GET",
        path: `/wallets/transfer-requests/${encodeURIComponent(parsed.requestId)}`,
        ctx,
        fetchImpl,
        controlPlaneBaseUrl,
      });

      const requestId = requiredString(
        payload.signRequest?.id,
        "signRequest.id",
      );
      const status = requiredString(
        payload.signRequest?.status,
        "signRequest.status",
      );
      const displayStatus = optionalString(payload.displayStatus) ?? status;

      return {
        requestId,
        status,
        displayStatus,
        nextAction: optionalString(payload.nextAction) ?? "none",
        dashboardUrl:
          optionalString(payload.dashboardUrl) ??
          `${dashboardBaseUrl}/dashboard/wallets`,
        runtimeCanExecute: false,
        note:
          optionalString(payload.note) ??
          "Conduit can poll this transfer request, but execution is disabled until the owner-controlled bridge is enabled.",
        transfer: payload.transfer ?? null,
      };
    },
  };
}

async function callDashboardTransferApi({
  method,
  path,
  parsed,
  ctx,
  fetchImpl,
  controlPlaneBaseUrl,
}: {
  method: "GET" | "POST";
  path: string;
  parsed?: WalletTransferRequestInput;
  ctx: ToolContext;
  fetchImpl: typeof fetch;
  controlPlaneBaseUrl: string;
}): Promise<DashboardTransferResponse> {
  if (!ctx.credential) {
    throw new ConduitError(
      "unauthenticated",
      "Wallet transfer requests require a web-issued Conduit bearer token.",
    );
  }

  const response = await fetchImpl(`${controlPlaneBaseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${ctx.credential}`,
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    ...(method === "POST"
      ? {
          body: JSON.stringify({
            ...parsed,
            metadata: {
              ...(parsed?.metadata ?? {}),
              conduit_request_id: ctx.requestId,
              conduit_session_id: ctx.session.id,
              conduit_agent_id: ctx.session.agentId,
            },
          }),
        }
      : {}),
    signal: ctx.signal,
  }).catch((cause: unknown) => {
    throw new ConduitError(
      "upstream_unavailable",
      `Could not reach AURA dashboard: ${getErrorMessage(cause)}`,
    );
  });

  const payload = (await response
    .json()
    .catch(() => ({}))) as DashboardTransferResponse;

  if (!response.ok) {
    throw new ConduitError(
      dashboardStatusToCode(response.status),
      dashboardErrorMessage(payload.error) ??
        `AURA dashboard rejected transfer request (${response.status}).`,
    );
  }

  return payload;
}

function dashboardStatusToCode(status: number): ConduitErrorCode {
  switch (status) {
    case 400:
      return "invalid_input";
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
    case 410:
      return "needs_human";
    default:
      return "upstream_unavailable";
  }
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ConduitError("invalid_input", `${label} missing from dashboard.`);
  }

  return value;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dashboardErrorMessage(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }

  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
