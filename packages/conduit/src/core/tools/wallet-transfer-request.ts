import {
  DWALLET_DEVNET_PROGRAM_ID,
  instructions,
  nativeSigningMessageDigest,
  pda,
  solanaCompiledMessageDigest,
  waitMessageApprovalSigned,
} from "@aura-protocol/sdk-ts";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import { z } from "zod";

import { ConduitError, type ConduitErrorCode } from "../errors.js";
import { PubkeyString, strictObject } from "../schemas.js";
import type { SigningService } from "../signing/types.js";
import type { SolanaContext } from "../solana.js";
import type { DeclaredInstruction, Tool, ToolContext } from "../types.js";

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

const SOLANA_CHAIN_CODE = 2;
const TRANSFER_TX_TYPE_CODE = 0;
const SOL_ASSET_ID = "sol";
const SOL_DECIMALS = 9;
const DWALLET_COORDINATOR_SEED = Buffer.from("dwallet_coordinator");

export type WalletTransferRequestInput = z.infer<typeof transferRequestInput>;
export type WalletTransferStatusInput = z.infer<typeof transferStatusInput>;

export interface WalletTransferRequestOutput {
  readonly requestId: string | null;
  readonly status: string;
  readonly nextAction: string;
  readonly dashboardUrl: string;
  readonly runtimeCanExecute: boolean;
  readonly note: string;
  readonly execution?: WalletTransferExecutionResult;
  readonly transfer?: unknown;
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
  } | null;
  readonly execution?: unknown;
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
  readonly solana?: SolanaContext;
  readonly signer?: SigningService;
  readonly fetchImpl?: typeof fetch;
}

interface ParsedExecutionIntent {
  readonly walletId: string;
  readonly treasuryPda: PublicKey;
  readonly dwalletSolanaKey: PublicKey;
  readonly dwalletAccount: PublicKey;
  readonly dwalletState: PublicKey;
  readonly dwalletProgramId: PublicKey;
  readonly publicKeyBytes: Uint8Array;
  readonly messageMetadataDigest: Uint8Array | undefined;
  readonly curve: number;
  readonly signatureScheme: number;
  readonly amountUsd: string;
  readonly confirmationsRequired: number;
  readonly signaturePath: string;
  readonly executionResultPath: string;
}

interface WalletTransferExecutionResult {
  readonly mode: "native_solana_dwallet_transfer";
  readonly proposalId: string;
  readonly proposalSignature: string;
  readonly executeSignature: string;
  readonly finalizeSignature: string;
  readonly transferSignature: string;
  readonly markSettlementSignature: string;
  readonly confirmSettlementSignature: string;
  readonly messageApprovalPda: string;
  readonly messageHashHex: string;
  readonly recentBlockhash: string;
  readonly dashboardRecorded: boolean;
  readonly dashboardRecordError?: string;
}

interface DashboardDWalletSignatureResponse {
  readonly signatureBase64?: unknown;
  readonly messageHashHex?: unknown;
  readonly messageApprovalPda?: unknown;
  readonly error?: unknown;
}

const declaredTransferInstructions: ReadonlyArray<DeclaredInstruction> = [
  { name: "propose_transaction", requiresSigner: ["ai_authority"] },
  { name: "execute_pending", requiresSigner: ["operator"] },
  { name: "finalize_execution", requiresSigner: ["operator"] },
  { name: "mark_settlement_broadcast", requiresSigner: ["operator"] },
  { name: "confirm_settlement", requiresSigner: ["operator"] },
];

export function createWalletTransferRequestTool(
  deps: WalletTransferToolDeps,
): Tool<typeof transferRequestInput, WalletTransferRequestOutput> {
  const controlPlaneBaseUrl = deps.controlPlaneBaseUrl.replace(/\/$/, "");
  const dashboardBaseUrl = deps.dashboardBaseUrl.replace(/\/$/, "");
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  return {
    name: "aura.wallet.transfer.request",
    description:
      "Requests a dWallet transfer through the AURA dashboard policy gate. If policy allows a native SOL transfer, Conduit submits the bound AURA proposal, obtains the dWallet signature, broadcasts the transfer, and settles it on-chain. Policy review cases are queued for the owner.",
    input: transferRequestInput,
    requiredScopes: ["wallet:transfer"],
    isWrite: true,
    triggersInbox: true,
    declaredInstructions: declaredTransferInstructions,
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

      const executionIntent = parseExecutionIntent(payload.execution);
      if (executionIntent !== null) {
        return executeNativeSolanaTransfer({
          parsed,
          ctx,
          intent: executionIntent,
          deps,
          dashboardBaseUrl,
          controlPlaneBaseUrl,
          fetchImpl,
        });
      }

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
        transfer: payload.transfer ?? null,
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
          "Conduit can poll this reviewed transfer request; execution does not run from the status endpoint.",
        transfer: payload.transfer ?? null,
      };
    },
  };
}

async function executeNativeSolanaTransfer({
  parsed,
  ctx,
  intent,
  deps,
  dashboardBaseUrl,
  controlPlaneBaseUrl,
  fetchImpl,
}: {
  parsed: WalletTransferRequestInput;
  ctx: ToolContext;
  intent: ParsedExecutionIntent;
  deps: WalletTransferToolDeps;
  dashboardBaseUrl: string;
  controlPlaneBaseUrl: string;
  fetchImpl: typeof fetch;
}): Promise<WalletTransferRequestOutput> {
  if (!deps.solana || !deps.signer) {
    throw new ConduitError(
      "needs_human",
      "This Conduit runtime is not wired with a Solana signing service, so it cannot execute an allowed dWallet transfer.",
    );
  }

  if (parsed.assetKind !== "native") {
    throw new ConduitError(
      "needs_human",
      "Real execution currently supports native SOL transfers only.",
    );
  }

  if (parsed.decimals !== SOL_DECIMALS) {
    throw new ConduitError(
      "invalid_input",
      "Native SOL transfers must use 9 decimals.",
    );
  }

  if (intent.walletId !== parsed.walletId) {
    throw new ConduitError(
      "invalid_input",
      "Dashboard execution intent does not match the requested wallet.",
    );
  }

  const operator = await deps.signer.publicKeyFor(ctx.session.id);
  const recipient = new PublicKey(parsed.recipientAddress);
  const rawLamports = parsePositiveBigInt(parsed.rawAmount, "rawAmount");
  const latest = await deps.solana.connection.getLatestBlockhash("confirmed");
  const transferTx = new Transaction({
    feePayer: operator,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: intent.dwalletSolanaKey,
      toPubkey: recipient,
      lamports: rawLamports,
    }),
  );
  const compiledMessage = transferTx.compileMessage().serialize();
  const messageHash = solanaCompiledMessageDigest(compiledMessage);
  const messageHashHex = bytesToHex(messageHash);
  const recentBlockhashBytes = bytes32(
    new Uint8Array(bs58.decode(latest.blockhash)),
    "recent blockhash",
  );
  const sessionKeyAccount = await findSessionKeyAccount({
    solana: deps.solana,
    treasury: intent.treasuryPda,
    operator,
  });

  const proposalIx = await instructions.execution.proposeTransactionInstruction(
    deps.solana.client,
    {
      accounts: {
        aiAuthority: operator,
        treasury: intent.treasuryPda,
        sessionKeyAccount,
        swarmPool: null,
        addressList: null,
        complianceOracle: null,
        parentTreasury: null,
        budgetEnvelope: null,
        exposureGroup: null,
        dwalletState: intent.dwalletState,
        chainProfile: null,
        trustIdentity: null,
        policyCanary: null,
      },
      args: {
        amountUsd: new BN(intent.amountUsd),
        targetChain: SOLANA_CHAIN_CODE,
        txType: TRANSFER_TX_TYPE_CODE,
        protocolId: null,
        currentTimestamp: new BN(nowSeconds()),
        expectedOutputUsd: new BN(intent.amountUsd),
        actualOutputUsd: new BN(intent.amountUsd),
        quoteAgeSecs: new BN(30),
        counterpartyRiskScore: 10,
        recipientOrContract: recipient.toBase58(),
        sanctionsProof: [],
        assetId: SOL_ASSET_ID,
        nativeAmount: new BN(rawLamports.toString()),
        decimals: SOL_DECIMALS,
        gasNativeAmount: null,
        gasAssetId: null,
        evmChainId: null,
        replayNonce: null,
        gasLimit: null,
        maxFeeNative: null,
        nativeMessageHash: bytes32Array(messageHash, "nativeMessageHash"),
        calldataHash: null,
        utxoSetHash: null,
        sighashType: null,
        solanaRecentBlockhash: bytes32Array(
          recentBlockhashBytes,
          "solanaRecentBlockhash",
        ),
        solanaMessageHash: bytes32Array(messageHash, "solanaMessageHash"),
        confirmationsRequired: intent.confirmationsRequired,
      },
    },
  );

  const proposalTx = await sendSignedProgramTransaction({
    label: "propose_transaction",
    solana: deps.solana,
    signer: deps.signer,
    sessionId: ctx.session.id,
    feePayer: operator,
    instructions: [proposalIx],
  });

  const pending = await fetchMatchingPendingProposal({
    solana: deps.solana,
    treasury: intent.treasuryPda,
    recipient: recipient.toBase58(),
    amountUsd: intent.amountUsd,
    rawAmount: rawLamports.toString(),
    messageHash,
    recentBlockhashBytes,
  });
  const proposalId = requiredString(
    fieldValue(pending, "proposalId"),
    "pending.proposalId",
  );

  if (!pendingApproved(pending)) {
    throw new ConduitError(
      "policy_denied",
      "The on-chain AURA program denied this transfer proposal.",
      { proposalId },
    );
  }

  const [messageApprovalPda] = pda.deriveMessageApprovalAddress(
    intent.dwalletProgramId,
    intent.curve,
    intent.publicKeyBytes,
    intent.signatureScheme,
    messageHash,
    intent.messageMetadataDigest,
  );
  const [cpiAuthority] = pda.deriveDwalletCpiAuthorityAddress(
    deps.solana.programId,
  );
  const [dwalletCoordinator] = PublicKey.findProgramAddressSync(
    [DWALLET_COORDINATOR_SEED],
    intent.dwalletProgramId,
  );

  const executeIx = await instructions.execution.executePendingInstruction(
    deps.solana.client,
    {
      accounts: {
        operator,
        treasury: intent.treasuryPda,
        messageApproval: messageApprovalPda,
        dwallet: intent.dwalletAccount,
        callerProgram: deps.solana.programId,
        cpiAuthority,
        dwalletProgram: intent.dwalletProgramId,
        dwalletCoordinator,
        externalLiveness: null,
        dwalletState: intent.dwalletState,
        systemProgram: SystemProgram.programId,
      },
      args: { now: new BN(nowSeconds()) },
    },
  );
  const executeTx = await sendSignedProgramTransaction({
    label: "execute_pending",
    solana: deps.solana,
    signer: deps.signer,
    sessionId: ctx.session.id,
    feePayer: operator,
    instructions: [executeIx],
  });

  const signaturePayload = (await callDashboardTransferApi({
    method: "POST",
    path: intent.signaturePath,
    body: {
      walletId: parsed.walletId,
      proposalId,
      recipientAddress: recipient.toBase58(),
      rawAmount: rawLamports.toString(),
      amountUsd: intent.amountUsd,
      messageBytesBase64: Buffer.from(compiledMessage).toString("base64"),
      messageHashHex,
      solanaRecentBlockhash: latest.blockhash,
      approvalProofSignature: executeTx.signature,
      messageApprovalPda: messageApprovalPda.toBase58(),
    },
    ctx,
    fetchImpl,
    controlPlaneBaseUrl,
  })) as DashboardDWalletSignatureResponse;
  const dWalletSignature = parseDWalletSignatureResponse({
    payload: signaturePayload,
    messageHashHex,
    messageApprovalPda,
  });

  await waitMessageApprovalSigned(deps.solana.connection, messageApprovalPda);

  const finalizeIx = await instructions.execution.finalizeExecutionInstruction(
    deps.solana.client,
    {
      accounts: {
        operator,
        treasury: intent.treasuryPda,
        messageApproval: messageApprovalPda,
        swarmPool: null,
        budgetEnvelope: null,
        exposureGroup: null,
        externalLiveness: null,
        dwalletState: intent.dwalletState,
        scheduledIntent: null,
        feeVault: null,
        feeSchedule: null,
        protocolConfig: null,
      },
      args: { now: new BN(nowSeconds()) },
    },
  );
  const finalizeTx = await sendSignedProgramTransaction({
    label: "finalize_execution",
    solana: deps.solana,
    signer: deps.signer,
    sessionId: ctx.session.id,
    feePayer: operator,
    instructions: [finalizeIx],
  });

  const transferSignature = await sendOperatorPaidSolanaTransfer({
    solana: deps.solana,
    signer: deps.signer,
    sessionId: ctx.session.id,
    transaction: transferTx,
    dwalletSolanaKey: intent.dwalletSolanaKey,
    signature: dWalletSignature,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    expectedSolanaRecentBlockhash: recentBlockhashBytes,
    expectedSolanaMessageHash: messageHash,
  });

  const targetTxHash = bytes32Array(
    nativeSigningMessageDigest(new Uint8Array(bs58.decode(transferSignature))),
    "settlement hash",
  );
  const proposalIdBn = new BN(proposalId);
  const markIx =
    await instructions.execution.markSettlementBroadcastInstruction(
      deps.solana.client,
      {
        accounts: {
          operator,
          treasury: intent.treasuryPda,
        },
        args: {
          proposalId: proposalIdBn,
          targetTxHash,
          now: new BN(nowSeconds()),
        },
      },
    );
  const markTx = await sendSignedProgramTransaction({
    label: "mark_settlement_broadcast",
    solana: deps.solana,
    signer: deps.signer,
    sessionId: ctx.session.id,
    feePayer: operator,
    instructions: [markIx],
  });

  const confirmIx = await instructions.execution.confirmSettlementInstruction(
    deps.solana.client,
    {
      accounts: {
        operator,
        treasury: intent.treasuryPda,
        swarmPool: null,
        budgetEnvelope: null,
        exposureGroup: null,
        dwalletState: intent.dwalletState,
        scheduledIntent: null,
      },
      args: {
        proposalId: proposalIdBn,
        targetTxHash,
        confirmationsObserved: intent.confirmationsRequired,
        reorged: false,
        now: new BN(nowSeconds()),
      },
    },
  );
  const confirmTx = await sendSignedProgramTransaction({
    label: "confirm_settlement",
    solana: deps.solana,
    signer: deps.signer,
    sessionId: ctx.session.id,
    feePayer: operator,
    instructions: [confirmIx],
  });

  const dashboardRecord = await recordDashboardExecution({
    parsed,
    ctx,
    fetchImpl,
    controlPlaneBaseUrl,
    path: intent.executionResultPath,
    proposalId,
    recipient: recipient.toBase58(),
    rawAmount: rawLamports.toString(),
    messageHashHex,
    messageApprovalPda: messageApprovalPda.toBase58(),
    proposalSignature: proposalTx.signature,
    executeSignature: executeTx.signature,
    finalizeSignature: finalizeTx.signature,
    transferSignature,
    markSettlementSignature: markTx.signature,
    confirmSettlementSignature: confirmTx.signature,
  });

  const execution: WalletTransferExecutionResult = {
    mode: "native_solana_dwallet_transfer",
    proposalId,
    proposalSignature: proposalTx.signature,
    executeSignature: executeTx.signature,
    finalizeSignature: finalizeTx.signature,
    transferSignature,
    markSettlementSignature: markTx.signature,
    confirmSettlementSignature: confirmTx.signature,
    messageApprovalPda: messageApprovalPda.toBase58(),
    messageHashHex,
    recentBlockhash: latest.blockhash,
    dashboardRecorded: dashboardRecord.ok,
    ...(dashboardRecord.ok
      ? {}
      : { dashboardRecordError: dashboardRecord.error }),
  };

  return {
    requestId: null,
    status: "executed",
    nextAction: "complete",
    dashboardUrl: `${dashboardBaseUrl}/dashboard/wallets`,
    runtimeCanExecute: true,
    note: dashboardRecord.ok
      ? "Native SOL transfer executed from the dWallet and settled on-chain."
      : "Native SOL transfer executed and settled on-chain, but dashboard execution recording failed.",
    execution,
    transfer: {
      amountUi: parsed.amountUi ?? parsed.rawAmount,
      assetSymbol: parsed.assetSymbol,
      recipientAddress: recipient.toBase58(),
      rawAmount: rawLamports.toString(),
    },
  };
}

function parseExecutionIntent(value: unknown): ParsedExecutionIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.status !== "ready") {
    return null;
  }

  if (record.mode !== "native_solana_dwallet_transfer") {
    throw new ConduitError(
      "invalid_input",
      "Dashboard returned an unsupported transfer execution mode.",
    );
  }

  const wallet = objectField(record.wallet, "execution.wallet");
  const dwallet = objectField(record.dwallet, "execution.dwallet");
  const transfer = objectField(record.transfer, "execution.transfer");
  const aura = objectField(record.aura, "execution.aura");
  const endpoints = objectField(record.endpoints, "execution.endpoints");
  const walletId = requiredString(wallet.id, "execution.wallet.id");
  const treasuryPda = requiredPublicKey(
    wallet.treasury_pda,
    "execution.wallet.treasury_pda",
  );
  const dwalletSolanaKey = requiredPublicKey(
    wallet.chain_address,
    "execution.wallet.chain_address",
  );
  const dwalletAccount = requiredPublicKey(
    wallet.dwallet_id,
    "execution.wallet.dwallet_id",
  );
  const dwalletState = requiredPublicKey(
    wallet.dwallet_state_pda,
    "execution.wallet.dwallet_state_pda",
  );
  const amountUsd = requiredUnsignedString(
    aura.amount_usd,
    "execution.aura.amount_usd",
  );
  const confirmationsRequired = optionalPositiveInteger(
    aura.confirmations_required,
    1,
  );
  const assetId = requiredString(
    transfer.asset_id,
    "execution.transfer.asset_id",
  );
  const decimals = requiredInteger(
    transfer.decimals,
    "execution.transfer.decimals",
  );

  if (assetId !== SOL_ASSET_ID || decimals !== SOL_DECIMALS) {
    throw new ConduitError(
      "invalid_input",
      "Dashboard execution intent is not a native SOL transfer.",
    );
  }

  return {
    walletId,
    treasuryPda,
    dwalletSolanaKey,
    dwalletAccount,
    dwalletState,
    dwalletProgramId:
      optionalPublicKey(dwallet.dwalletProgramId) ?? DWALLET_DEVNET_PROGRAM_ID,
    publicKeyBytes: hexBytes(
      requiredHexString(dwallet.publicKeyHex, "execution.dwallet.publicKeyHex"),
      "execution.dwallet.publicKeyHex",
    ),
    messageMetadataDigest:
      dwallet.messageMetadataDigest === null ||
      dwallet.messageMetadataDigest === undefined
        ? undefined
        : bytes32(
            hexBytes(
              requiredHexString(
                dwallet.messageMetadataDigest,
                "execution.dwallet.messageMetadataDigest",
              ),
              "execution.dwallet.messageMetadataDigest",
            ),
            "execution.dwallet.messageMetadataDigest",
          ),
    curve: requiredInteger(dwallet.curve, "execution.dwallet.curve"),
    signatureScheme: requiredInteger(
      dwallet.signatureScheme,
      "execution.dwallet.signatureScheme",
    ),
    amountUsd,
    confirmationsRequired,
    signaturePath: normalizeDashboardPath(
      optionalString(endpoints.dwallet_signature) ??
        "/wallets/dwallet-signatures",
    ),
    executionResultPath: normalizeDashboardPath(
      optionalString(endpoints.execution_result) ??
        "/wallets/transfer-executions",
    ),
  };
}

function objectField(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConduitError("invalid_input", `${label} missing from dashboard.`);
  }

  return value as Record<string, unknown>;
}

function requiredPublicKey(value: unknown, label: string) {
  try {
    return new PublicKey(requiredString(value, label));
  } catch {
    throw new ConduitError(
      "invalid_input",
      `${label} must be a valid Solana public key.`,
    );
  }
}

function optionalPublicKey(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

function requiredUnsignedString(value: unknown, label: string) {
  const text =
    typeof value === "number" && Number.isInteger(value)
      ? String(value)
      : requiredString(value, label);

  if (!/^[0-9]+$/u.test(text)) {
    throw new ConduitError(
      "invalid_input",
      `${label} must be an unsigned integer string.`,
    );
  }

  return text;
}

function requiredInteger(value: unknown, label: string) {
  if (!Number.isInteger(value)) {
    throw new ConduitError("invalid_input", `${label} must be an integer.`);
  }

  return value as number;
}

function optionalPositiveInteger(value: unknown, fallback: number) {
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : fallback;
}

function requiredHexString(value: unknown, label: string) {
  const text = requiredString(value, label).toLowerCase();
  if (!/^[0-9a-f]+$/u.test(text) || text.length % 2 !== 0) {
    throw new ConduitError(
      "invalid_input",
      `${label} must be even-length hexadecimal.`,
    );
  }

  return text;
}

function hexBytes(value: string, label: string) {
  const bytes = Buffer.from(value, "hex");
  if (bytes.length === 0) {
    throw new ConduitError("invalid_input", `${label} must not be empty.`);
  }

  return new Uint8Array(bytes);
}

function normalizeDashboardPath(path: string) {
  if (!path.startsWith("/") || path.includes("://")) {
    throw new ConduitError(
      "invalid_input",
      "Dashboard execution endpoint must be a relative control-plane path.",
    );
  }

  return path;
}

function parsePositiveBigInt(value: string, label: string) {
  if (!/^[0-9]+$/u.test(value)) {
    throw new ConduitError("invalid_input", `${label} must be numeric.`);
  }

  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new ConduitError("invalid_input", `${label} must be positive.`);
  }

  return parsed;
}

async function findSessionKeyAccount({
  solana,
  treasury,
  operator,
}: {
  solana: SolanaContext;
  treasury: PublicKey;
  operator: PublicKey;
}) {
  const [sessionKeyAccount] = pda.deriveSessionKeyAddress(
    treasury,
    operator,
    solana.programId,
  );
  const account = await solana.connection
    .getAccountInfo(sessionKeyAccount, "confirmed")
    .catch(() => null);
  return account ? sessionKeyAccount : null;
}

async function sendSignedProgramTransaction({
  label,
  solana,
  signer,
  sessionId,
  feePayer,
  instructions: txInstructions,
}: {
  label: string;
  solana: SolanaContext;
  signer: SigningService;
  sessionId: string;
  feePayer: PublicKey;
  instructions: TransactionInstruction[];
}) {
  const { blockhash, lastValidBlockHeight } =
    await solana.connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer,
    blockhash,
    lastValidBlockHeight,
  }).add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...txInstructions,
  );

  const simulation = await solana.connection.simulateTransaction(tx);
  if (simulation.value.err !== null) {
    throw new ConduitError(
      "policy_denied",
      `RPC simulation rejected ${label}: ${JSON.stringify(simulation.value.err)}`,
      { logs: simulation.value.logs ?? [] },
    );
  }

  await signer.sign({ sessionId, transaction: tx });
  const signature = await solana.connection.sendRawTransaction(tx.serialize(), {
    preflightCommitment: "confirmed",
  });
  const confirmation = await solana.connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (confirmation.value.err !== null) {
    throw new ConduitError(
      "upstream_unavailable",
      `${label} failed confirmation: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  return { signature, slot: confirmation.context.slot };
}

async function fetchMatchingPendingProposal({
  solana,
  treasury,
  recipient,
  amountUsd,
  rawAmount,
  messageHash,
  recentBlockhashBytes,
}: {
  solana: SolanaContext;
  treasury: PublicKey;
  recipient: string;
  amountUsd: string;
  rawAmount: string;
  messageHash: Uint8Array;
  recentBlockhashBytes: Uint8Array;
}) {
  const treasuryAccount =
    await solana.client.program.account.treasuryAccount.fetch(treasury);
  const queue = Array.isArray(
    (treasuryAccount as { pendingQueue?: unknown }).pendingQueue,
  )
    ? (treasuryAccount as { pendingQueue: unknown[] }).pendingQueue
    : [];
  const pending = queue.find((entry) =>
    pendingRecordMatches({
      pending: entry,
      recipient,
      amountUsd,
      rawAmount,
      messageHash,
      recentBlockhashBytes,
    }),
  );

  if (!pending) {
    throw new ConduitError(
      "upstream_unavailable",
      "The on-chain AURA proposal was submitted but no matching pending record was found.",
    );
  }

  return pending;
}

function pendingRecordMatches({
  pending,
  recipient,
  amountUsd,
  rawAmount,
  messageHash,
  recentBlockhashBytes,
}: {
  pending: unknown;
  recipient: string;
  amountUsd: string;
  rawAmount: string;
  messageHash: Uint8Array;
  recentBlockhashBytes: Uint8Array;
}) {
  const pendingRecord = objectRecord(pending);
  const transfer = objectRecord(pendingRecord.transfer);
  const binding = objectRecord(transfer.executionBinding);
  const nativeMessageHash = optionalBytes32(binding.nativeMessageHash);
  const solanaMessageHash = optionalBytes32(binding.solanaMessageHash);
  const solanaRecentBlockhash = optionalBytes32(binding.solanaRecentBlockhash);

  return (
    fieldValue(pendingRecord, "targetChain") === String(SOLANA_CHAIN_CODE) &&
    fieldValue(pendingRecord, "txType") === String(TRANSFER_TX_TYPE_CODE) &&
    fieldValue(pendingRecord, "recipientOrContract") === recipient &&
    fieldValue(pendingRecord, "amountUsd") === amountUsd &&
    fieldValue(transfer, "assetId") === SOL_ASSET_ID &&
    fieldValue(transfer, "nativeAmount") === rawAmount &&
    fieldValue(transfer, "decimals") === String(SOL_DECIMALS) &&
    nativeMessageHash !== null &&
    solanaMessageHash !== null &&
    solanaRecentBlockhash !== null &&
    equalBytes(nativeMessageHash, messageHash) &&
    equalBytes(solanaMessageHash, messageHash) &&
    equalBytes(solanaRecentBlockhash, recentBlockhashBytes)
  );
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function fieldValue(value: unknown, key: string) {
  const record = objectRecord(value);
  const field = record[key];
  return field !== null && field !== undefined ? field.toString() : null;
}

function pendingApproved(value: unknown) {
  return objectRecord(objectRecord(value).decision).approved === true;
}

function optionalBytes32(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Uint8Array) {
    return value.length === 32 ? new Uint8Array(value) : null;
  }

  if (Array.isArray(value)) {
    const bytes = value.filter(
      (entry): entry is number =>
        typeof entry === "number" &&
        Number.isInteger(entry) &&
        entry >= 0 &&
        entry <= 255,
    );
    return bytes.length === 32 ? new Uint8Array(bytes) : null;
  }

  return null;
}

function bytes32(value: Uint8Array, label: string) {
  if (value.length !== 32) {
    throw new ConduitError(
      "invalid_input",
      `${label} must be 32 bytes, got ${value.length}.`,
    );
  }

  return value;
}

function bytes32Array(value: Uint8Array, label: string) {
  return Array.from(bytes32(value, label));
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function bytesToHex(value: Uint8Array) {
  return Buffer.from(value).toString("hex");
}

function parseDWalletSignatureResponse({
  payload,
  messageHashHex,
  messageApprovalPda,
}: {
  payload: DashboardDWalletSignatureResponse;
  messageHashHex: string;
  messageApprovalPda: PublicKey;
}) {
  if (optionalString(payload.messageHashHex) !== messageHashHex) {
    throw new ConduitError(
      "upstream_unavailable",
      "Dashboard returned a dWallet signature for a different message hash.",
    );
  }

  if (
    optionalString(payload.messageApprovalPda) !== messageApprovalPda.toBase58()
  ) {
    throw new ConduitError(
      "upstream_unavailable",
      "Dashboard returned a dWallet signature for a different MessageApproval PDA.",
    );
  }

  const signatureBase64 = requiredString(
    payload.signatureBase64,
    "signatureBase64",
  );
  const signature = new Uint8Array(Buffer.from(signatureBase64, "base64"));
  if (signature.length !== 64) {
    throw new ConduitError(
      "upstream_unavailable",
      `Dashboard returned a ${signature.length}-byte dWallet signature; expected 64 bytes.`,
    );
  }

  return signature;
}

async function sendOperatorPaidSolanaTransfer({
  solana,
  signer,
  sessionId,
  transaction,
  dwalletSolanaKey,
  signature,
  lastValidBlockHeight,
  expectedSolanaRecentBlockhash,
  expectedSolanaMessageHash,
}: {
  solana: SolanaContext;
  signer: SigningService;
  sessionId: string;
  transaction: Transaction;
  dwalletSolanaKey: PublicKey;
  signature: Uint8Array;
  lastValidBlockHeight: number;
  expectedSolanaRecentBlockhash: Uint8Array;
  expectedSolanaMessageHash: Uint8Array;
}) {
  if (transaction.feePayer?.equals(dwalletSolanaKey)) {
    throw new ConduitError(
      "invalid_input",
      "Operator-paid dWallet transfers must not use the dWallet as fee payer.",
    );
  }
  if (!transaction.recentBlockhash) {
    throw new ConduitError(
      "invalid_input",
      "Transfer transaction must have a recent blockhash.",
    );
  }
  if (
    !equalBytes(
      bytes32(
        new Uint8Array(bs58.decode(transaction.recentBlockhash)),
        "transaction recent blockhash",
      ),
      expectedSolanaRecentBlockhash,
    )
  ) {
    throw new ConduitError(
      "invalid_input",
      "Transfer transaction recent blockhash does not match proposal binding.",
    );
  }

  const actualMessageHash = solanaCompiledMessageDigest(
    transaction.compileMessage().serialize(),
  );
  if (!equalBytes(actualMessageHash, expectedSolanaMessageHash)) {
    throw new ConduitError(
      "invalid_input",
      "Transfer transaction message hash does not match proposal binding.",
    );
  }

  if (signature.length !== 64) {
    throw new ConduitError(
      "upstream_unavailable",
      `dWallet returned ${signature.length}-byte signature; expected 64 bytes.`,
    );
  }

  await signer.sign({ sessionId, transaction });
  transaction.addSignature(dwalletSolanaKey, Buffer.from(signature));
  if (!transaction.verifySignatures()) {
    throw new ConduitError(
      "upstream_unavailable",
      "Signed dWallet transfer failed local signature verification.",
    );
  }

  const simulation = await solana.connection.simulateTransaction(transaction);
  if (simulation.value.err !== null) {
    throw new ConduitError(
      "upstream_unavailable",
      `RPC simulation rejected the signed dWallet transfer: ${JSON.stringify(simulation.value.err)}`,
      { logs: simulation.value.logs ?? [] },
    );
  }

  const txSignature = await solana.connection.sendRawTransaction(
    transaction.serialize(),
    { preflightCommitment: "confirmed" },
  );
  const confirmation = await solana.connection.confirmTransaction(
    {
      signature: txSignature,
      blockhash: transaction.recentBlockhash,
      lastValidBlockHeight,
    },
    "confirmed",
  );
  if (confirmation.value.err !== null) {
    throw new ConduitError(
      "upstream_unavailable",
      `dWallet transfer failed confirmation: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  return txSignature;
}

async function recordDashboardExecution({
  parsed,
  ctx,
  fetchImpl,
  controlPlaneBaseUrl,
  path,
  proposalId,
  recipient,
  rawAmount,
  messageHashHex,
  messageApprovalPda,
  proposalSignature,
  executeSignature,
  finalizeSignature,
  transferSignature,
  markSettlementSignature,
  confirmSettlementSignature,
}: {
  parsed: WalletTransferRequestInput;
  ctx: ToolContext;
  fetchImpl: typeof fetch;
  controlPlaneBaseUrl: string;
  path: string;
  proposalId: string;
  recipient: string;
  rawAmount: string;
  messageHashHex: string;
  messageApprovalPda: string;
  proposalSignature: string;
  executeSignature: string;
  finalizeSignature: string;
  transferSignature: string;
  markSettlementSignature: string;
  confirmSettlementSignature: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await callDashboardTransferApi({
      method: "POST",
      path,
      body: {
        walletId: parsed.walletId,
        proposalId,
        recipientAddress: recipient,
        rawAmount,
        amountUi: parsed.amountUi ?? null,
        assetSymbol: parsed.assetSymbol,
        messageHashHex,
        messageApprovalPda,
        proposalSignature,
        executeSignature,
        finalizeSignature,
        transferSignature,
        markSettlementSignature,
        confirmSettlementSignature,
        metadata: {
          conduit_request_id: ctx.requestId,
          conduit_session_id: ctx.session.id,
          conduit_agent_id: ctx.session.agentId,
        },
      },
      ctx,
      fetchImpl,
      controlPlaneBaseUrl,
    });
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: getErrorMessage(cause) };
  }
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function callDashboardTransferApi({
  method,
  path,
  parsed,
  body,
  ctx,
  fetchImpl,
  controlPlaneBaseUrl,
}: {
  method: "GET" | "POST";
  path: string;
  parsed?: WalletTransferRequestInput;
  body?: unknown;
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
          body: JSON.stringify(
            body ?? {
              ...parsed,
              metadata: {
                ...(parsed?.metadata ?? {}),
                conduit_request_id: ctx.requestId,
                conduit_session_id: ctx.session.id,
                conduit_agent_id: ctx.session.agentId,
              },
            },
          ),
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
    case 422:
      return "policy_denied";
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
