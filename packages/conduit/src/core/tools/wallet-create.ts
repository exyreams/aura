import { z } from "zod";

import { ConduitError } from "../errors.js";
import { PubkeyString, strictObject } from "../schemas.js";
import type { Tool, ToolContext } from "../types.js";

const input = strictObject({
  chainId: z
    .number()
    .int()
    .min(0)
    .max(255)
    .default(2)
    .describe("AURA chain id. Defaults to Solana."),
  chainAddress: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .describe("Fundable address produced by the dWallet provider."),
  dwalletId: z.string().trim().min(1).max(180).describe("dWallet identifier."),
  label: z.string().trim().min(1).max(80).optional(),
  dwalletStatePda: PubkeyString.optional(),
  dwalletAccount: PubkeyString.optional(),
  authorizedUserPubkey: PubkeyString.optional(),
  messageMetadataDigest: z.string().trim().min(1).max(160).optional(),
  publicKeyHex: z
    .string()
    .trim()
    .regex(/^[0-9a-f]+$/iu, "must be hexadecimal")
    .refine((value) => value.length % 2 === 0, {
      message: "must have even length",
    })
    .optional(),
  providerSessionId: z.string().trim().min(1).max(180).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type WalletCreateInput = z.infer<typeof input>;

export interface WalletCreateOutput {
  readonly walletId: string;
  readonly status: string;
  readonly chainId: number;
  readonly chainAddress: string;
  readonly dwalletId: string;
  readonly dashboardUrl: string;
  readonly nextAction: "link_wallet_from_dashboard";
  readonly note: string;
}

interface DashboardWalletResponse {
  readonly wallet?: {
    readonly id?: unknown;
    readonly status?: unknown;
    readonly chain_id?: unknown;
    readonly chain_address?: unknown;
    readonly dwallet_id?: unknown;
  };
  readonly error?: unknown;
}

export interface WalletCreateDeps {
  readonly controlPlaneBaseUrl: string;
  readonly dashboardBaseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

export function createWalletCreateTool(
  deps: WalletCreateDeps,
): Tool<typeof input, WalletCreateOutput> {
  const controlPlaneBaseUrl = deps.controlPlaneBaseUrl.replace(/\/$/, "");
  const dashboardBaseUrl = deps.dashboardBaseUrl.replace(/\/$/, "");
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  return {
    name: "aura.wallet.create",
    description:
      "Records an agent-created dWallet candidate in the AURA dashboard. The wallet remains pending until the owner links it from the dashboard with their wallet.",
    input,
    requiredScopes: ["wallet:create"],
    isWrite: true,
    triggersInbox: false,
    declaredInstructions: [],
    async handler(
      parsed: WalletCreateInput,
      ctx: ToolContext,
    ): Promise<WalletCreateOutput> {
      if (!ctx.credential) {
        throw new ConduitError(
          "unauthenticated",
          "Wallet creation requires a web-issued Conduit bearer token.",
        );
      }

      const response = await fetchImpl(
        `${controlPlaneBaseUrl}/wallets/dwallets`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${ctx.credential}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ...parsed,
            metadata: {
              ...(parsed.metadata ?? {}),
              conduit_request_id: ctx.requestId,
              conduit_session_id: ctx.session.id,
              conduit_agent_id: ctx.session.agentId,
            },
          }),
        },
      ).catch((cause: unknown) => {
        throw new ConduitError(
          "upstream_unavailable",
          `Could not reach AURA dashboard: ${getErrorMessage(cause)}`,
        );
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as DashboardWalletResponse;

      if (!response.ok) {
        throw new ConduitError(
          response.status === 403 ? "forbidden" : "upstream_unavailable",
          dashboardErrorMessage(payload.error) ??
            `AURA dashboard rejected wallet creation (${response.status}).`,
        );
      }

      const wallet = payload.wallet;
      const walletId = requiredString(wallet?.id, "wallet.id");
      const status = requiredString(wallet?.status, "wallet.status");
      const chainId = requiredNumber(wallet?.chain_id, "wallet.chain_id");
      const chainAddress = requiredString(
        wallet?.chain_address,
        "wallet.chain_address",
      );
      const dwalletId = requiredString(wallet?.dwallet_id, "wallet.dwallet_id");

      return {
        walletId,
        status,
        chainId,
        chainAddress,
        dwalletId,
        dashboardUrl: `${dashboardBaseUrl}/dashboard/wallets`,
        nextAction: "link_wallet_from_dashboard",
        note: "Wallet metadata is saved. The owner must open the dashboard and link this wallet on-chain before agent execution can use it.",
      };
    },
  };
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ConduitError("invalid_input", `${label} missing from dashboard.`);
  }

  return value;
}

function requiredNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ConduitError("invalid_input", `${label} missing from dashboard.`);
  }

  return value;
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
