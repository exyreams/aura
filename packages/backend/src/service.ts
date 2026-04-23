import BN from "bn.js";
import {
  AuraClient,
  type ProposeConfidentialTransactionArgs,
  type ProposeTransactionArgs,
  type TreasuryAccountRecord,
  validateAddress,
  validateAmountUsd,
} from "@aura/sdk-ts";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { loadConfig } from "./config.js";
import {
  encryptU64,
  encryptU64Batch,
  readU64Ciphertext,
  requestDwalletSign,
} from "./ika.js";
import {
  buildExecutePendingInstruction,
  buildMessageDigestHex,
  createEphemeralKeypair,
  deriveApprovedExecutionAccounts,
  ensureEncryptDeposit,
  markInstructionSigner,
  resolvePendingPolicyOutput,
  resolvePendingProposal,
  resolvePendingRequestAccount,
  resolveScalarGuardrails,
  sendInstructionsWithBudget,
  waitForCiphertextVerified,
  waitForDecryptionReady,
  waitForMessageApproval,
} from "./protocol.js";
import type { AgentJobConfig } from "./types.js";
import { loadKeypair } from "./wallet.js";

const config = loadConfig();
const backendKeypair = loadKeypair(config.keypairPath);

function buildConnection(rpcUrl?: string) {
  return new Connection(rpcUrl || config.defaultRpcUrl, "confirmed");
}

function buildProgramId(programId?: string) {
  return programId ? new PublicKey(programId) : config.defaultProgramId;
}

function buildClient(rpcUrl?: string, programId?: string) {
  const connection = buildConnection(rpcUrl);
  const resolvedProgramId = buildProgramId(programId);
  return {
    connection,
    programId: resolvedProgramId,
    client: new AuraClient({
      connection,
      programId: resolvedProgramId,
    }),
  };
}

function buildProposeArgs(input: {
  amountUsd: number;
  chain: number;
  txType: number;
  recipient: string;
  protocolId?: number;
  expectedOutputUsd?: number;
  actualOutputUsd?: number;
  quoteAgeSecs?: number;
  counterpartyRiskScore?: number;
}): ProposeTransactionArgs {
  validateAmountUsd(input.amountUsd);
  validateAddress(input.recipient);
  return {
    amountUsd: new BN(input.amountUsd),
    targetChain: input.chain,
    txType: input.txType,
    protocolId: input.protocolId ?? null,
    currentTimestamp: new BN(Math.floor(Date.now() / 1000)),
    expectedOutputUsd:
      input.expectedOutputUsd !== undefined ? new BN(input.expectedOutputUsd) : null,
    actualOutputUsd:
      input.actualOutputUsd !== undefined ? new BN(input.actualOutputUsd) : null,
    quoteAgeSecs:
      input.quoteAgeSecs !== undefined ? new BN(input.quoteAgeSecs) : null,
    counterpartyRiskScore: input.counterpartyRiskScore ?? null,
    recipientOrContract: input.recipient,
  };
}

function buildConfidentialArgs(input: {
  amountUsd: number;
  chain: number;
  txType: number;
  recipient: string;
  protocolId?: number;
  expectedOutputUsd?: number;
  actualOutputUsd?: number;
  quoteAgeSecs?: number;
  counterpartyRiskScore?: number;
}): ProposeConfidentialTransactionArgs {
  validateAmountUsd(input.amountUsd);
  validateAddress(input.recipient);
  return {
    amountUsd: new BN(input.amountUsd),
    targetChain: input.chain,
    txType: input.txType,
    protocolId: input.protocolId ?? null,
    currentTimestamp: new BN(Math.floor(Date.now() / 1000)),
    expectedOutputUsd:
      input.expectedOutputUsd !== undefined ? new BN(input.expectedOutputUsd) : null,
    actualOutputUsd:
      input.actualOutputUsd !== undefined ? new BN(input.actualOutputUsd) : null,
    quoteAgeSecs:
      input.quoteAgeSecs !== undefined ? new BN(input.quoteAgeSecs) : null,
    counterpartyRiskScore: input.counterpartyRiskScore ?? null,
    recipientOrContract: input.recipient,
  };
}

export function getBackendInfo() {
  return {
    publicKey: backendKeypair.publicKey.toBase58(),
    defaultRpcUrl: config.defaultRpcUrl,
    defaultProgramId: config.defaultProgramId.toBase58(),
  };
}

export async function encryptScalarValues(input: {
  rpcUrl?: string;
  programId?: string;
  dailyLimit: number;
  perTxLimit: number;
  spentToday?: number;
  wait?: boolean;
}) {
  const { connection, programId } = buildClient(input.rpcUrl, input.programId);
  const [dailyLimitCiphertext, perTxLimitCiphertext, spentTodayCiphertext] =
    await encryptU64Batch(
      [input.dailyLimit, input.perTxLimit, input.spentToday ?? 0],
      programId,
    );
  if (input.wait) {
    await Promise.all([
      waitForCiphertextVerified(connection, dailyLimitCiphertext),
      waitForCiphertextVerified(connection, perTxLimitCiphertext),
      waitForCiphertextVerified(connection, spentTodayCiphertext),
    ]);
  }
  return {
    dailyLimitCiphertext: dailyLimitCiphertext.toBase58(),
    perTxLimitCiphertext: perTxLimitCiphertext.toBase58(),
    spentTodayCiphertext: spentTodayCiphertext.toBase58(),
  };
}

export async function ensureBackendEncryptDeposit(input: {
  rpcUrl?: string;
  programId?: string;
}) {
  const { connection, programId } = buildClient(input.rpcUrl, input.programId);
  const result = await ensureEncryptDeposit({
    connection,
    payer: backendKeypair,
    auraProgramId: programId,
  });
  return {
    created: result.created,
    signature: result.signature,
    accounts: {
      config: result.accounts.config.toBase58(),
      deposit: result.accounts.deposit.toBase58(),
      networkEncryptionKey: result.accounts.networkEncryptionKey.toBase58(),
      eventAuthority: result.accounts.eventAuthority.toBase58(),
      cpiAuthority: result.accounts.cpiAuthority.toBase58(),
      encryptProgram: result.accounts.encryptProgram.toBase58(),
    },
  };
}

export async function submitConfidentialProposal(input: {
  rpcUrl?: string;
  programId?: string;
  treasury: string;
  amountUsd: number;
  chain: number;
  txType: number;
  recipient: string;
  protocolId?: number;
  expectedOutputUsd?: number;
  actualOutputUsd?: number;
  quoteAgeSecs?: number;
  counterpartyRiskScore?: number;
  waitForOutput?: boolean;
}) {
  const { connection, programId, client } = buildClient(input.rpcUrl, input.programId);
  const treasury = new PublicKey(input.treasury);
  const account = await client.getTreasuryAccount(treasury);
  const guardrails = resolveScalarGuardrails(account);
  const args = buildConfidentialArgs(input);
  const depositResult = await ensureEncryptDeposit({
    connection,
    payer: backendKeypair,
    auraProgramId: programId,
  });
  const amountCiphertext = await encryptU64(input.amountUsd, programId);
  await waitForCiphertextVerified(connection, amountCiphertext);
  const policyOutputSigner = createEphemeralKeypair();
  const instruction = await client.proposeConfidentialTransactionInstruction(
    {
      aiAuthority: backendKeypair.publicKey,
      treasury,
      dailyLimitCiphertext: guardrails.dailyLimitCiphertext,
      perTxLimitCiphertext: guardrails.perTxLimitCiphertext,
      spentTodayCiphertext: guardrails.spentTodayCiphertext,
      amountCiphertext,
      policyOutputCiphertext: policyOutputSigner.publicKey,
      encryptProgram: depositResult.accounts.encryptProgram,
      config: depositResult.accounts.config,
      deposit: depositResult.accounts.deposit,
      callerProgram: programId,
      cpiAuthority: depositResult.accounts.cpiAuthority,
      networkEncryptionKey: depositResult.accounts.networkEncryptionKey,
      eventAuthority: depositResult.accounts.eventAuthority,
      systemProgram: SystemProgram.programId,
    },
    args,
  );
  markInstructionSigner(instruction, policyOutputSigner.publicKey);
  const signature = await sendInstructionsWithBudget({
    connection,
    payer: backendKeypair,
    instructions: [instruction],
    extraSigners: [policyOutputSigner],
  });
  if (input.waitForOutput) {
    await waitForCiphertextVerified(connection, policyOutputSigner.publicKey);
  }
  return {
    signature,
    amountCiphertext: amountCiphertext.toBase58(),
    policyOutputCiphertext: policyOutputSigner.publicKey.toBase58(),
    deposit: depositResult.accounts.deposit.toBase58(),
  };
}

export async function requestPolicyDecryptionService(input: {
  rpcUrl?: string;
  programId?: string;
  treasury: string;
  ciphertext?: string;
  wait?: boolean;
}) {
  const { connection, programId, client } = buildClient(input.rpcUrl, input.programId);
  const treasury = new PublicKey(input.treasury);
  const account = await client.getTreasuryAccount(treasury);
  const ciphertext = input.ciphertext
    ? new PublicKey(input.ciphertext)
    : resolvePendingPolicyOutput(account);
  const requestSigner = createEphemeralKeypair();
  const depositResult = await ensureEncryptDeposit({
    connection,
    payer: backendKeypair,
    auraProgramId: programId,
  });
  const instruction = await client.requestPolicyDecryptionInstruction(
    {
      operator: backendKeypair.publicKey,
      treasury,
      requestAccount: requestSigner.publicKey,
      ciphertext,
      encryptProgram: depositResult.accounts.encryptProgram,
      config: depositResult.accounts.config,
      deposit: depositResult.accounts.deposit,
      callerProgram: programId,
      cpiAuthority: depositResult.accounts.cpiAuthority,
      networkEncryptionKey: depositResult.accounts.networkEncryptionKey,
      eventAuthority: depositResult.accounts.eventAuthority,
      systemProgram: SystemProgram.programId,
    },
    Math.floor(Date.now() / 1000),
  );
  markInstructionSigner(instruction, requestSigner.publicKey);
  const signature = await sendInstructionsWithBudget({
    connection,
    payer: backendKeypair,
    instructions: [instruction],
    extraSigners: [requestSigner],
  });
  if (input.wait) {
    await waitForDecryptionReady(connection, requestSigner.publicKey);
  }
  return {
    signature,
    requestAccount: requestSigner.publicKey.toBase58(),
    ciphertext: ciphertext.toBase58(),
  };
}

export async function confirmPolicyDecryptionService(input: {
  rpcUrl?: string;
  programId?: string;
  treasury: string;
  requestAccount?: string;
}) {
  const { client } = buildClient(input.rpcUrl, input.programId);
  const treasury = new PublicKey(input.treasury);
  const account = await client.getTreasuryAccount(treasury);
  const requestAccount = input.requestAccount
    ? new PublicKey(input.requestAccount)
    : resolvePendingRequestAccount(account);
  const signature = await client.confirmPolicyDecryption(
    backendKeypair,
    {
      operator: backendKeypair.publicKey,
      treasury,
      requestAccount,
    },
    Math.floor(Date.now() / 1000),
  );
  const refreshed = await client.getTreasuryAccount(treasury);
  let violationCode: string | null = null;
  try {
    violationCode = (
      await readU64Ciphertext(resolvePendingPolicyOutput(account), backendKeypair.publicKey)
    ).toString();
  } catch {
    violationCode = null;
  }
  return {
    signature,
    requestAccount: requestAccount.toBase58(),
    approved: refreshed.pending?.decision.approved ?? null,
    violation: refreshed.pending?.decision.violation ?? null,
    violationCode,
    pending: refreshed.pending,
  };
}

export async function executePendingService(input: {
  rpcUrl?: string;
  programId?: string;
  treasury: string;
  wait?: boolean;
  waitSigned?: boolean;
}) {
  const { connection, programId, client } = buildClient(input.rpcUrl, input.programId);
  const treasury = new PublicKey(input.treasury);
  const account = await client.getTreasuryAccount(treasury);
  const pending = resolvePendingProposal(account);
  const approvedAccounts = pending.decision.approved
    ? deriveApprovedExecutionAccounts(account, { auraProgramId: programId })
    : undefined;
  const instruction = buildExecutePendingInstruction({
    clientProgramId: programId,
    coder: client.coder,
    operator: backendKeypair.publicKey,
    treasury,
    now: Math.floor(Date.now() / 1000),
    approvedAccounts,
  });
  const signature = await sendInstructionsWithBudget({
    connection,
    payer: backendKeypair,
    instructions: [instruction],
  });
  if (pending.decision.approved && approvedAccounts && input.waitSigned) {
    await waitForMessageApproval(connection, approvedAccounts.messageApproval, "signed", {
      timeoutMs: 180_000,
    });
  } else if (pending.decision.approved && approvedAccounts && input.wait) {
    await waitForMessageApproval(connection, approvedAccounts.messageApproval, "pending", {
      timeoutMs: 120_000,
    });
    try {
      const messageDigest = Buffer.from(
        buildMessageDigestHex(approvedAccounts.pending, approvedAccounts.dwallet),
        "hex",
      );
      await requestDwalletSign(
        backendKeypair.publicKey,
        approvedAccounts.dwalletAccount,
        messageDigest,
        Buffer.alloc(64),
      );
      await waitForMessageApproval(connection, approvedAccounts.messageApproval, "signed", {
        timeoutMs: 180_000,
      });
    } catch {
      // Async network side-effect; on-chain polling remains the source of truth.
    }
  }
  const refreshed = await client.getTreasuryAccount(treasury);
  return {
    signature,
    approved: pending.decision.approved,
    messageApproval: approvedAccounts?.messageApproval.toBase58(),
    pending: refreshed.pending,
  };
}

export async function finalizeExecutionService(input: {
  rpcUrl?: string;
  programId?: string;
  treasury: string;
  messageApproval?: string;
}) {
  const { client } = buildClient(input.rpcUrl, input.programId);
  const treasury = new PublicKey(input.treasury);
  const account = await client.getTreasuryAccount(treasury);
  const pending = resolvePendingProposal(account);
  const messageApproval = input.messageApproval
    ? new PublicKey(input.messageApproval)
    : pending.signatureRequest?.messageApprovalAccount
      ? new PublicKey(pending.signatureRequest.messageApprovalAccount)
      : undefined;
  if (!messageApproval) {
    throw new Error("No message approval account is available for finalize_execution.");
  }
  const signature = await client.finalizeExecution(
    backendKeypair,
    {
      operator: backendKeypair.publicKey,
      treasury,
      messageApproval,
    },
    Math.floor(Date.now() / 1000),
  );
  const refreshed = await client.getTreasuryAccount(treasury);
  return {
    signature,
    totalTransactions: refreshed.totalTransactions.toString(),
    pending: refreshed.pending,
  };
}

export async function submitPublicProposal(input: {
  rpcUrl?: string;
  programId?: string;
  treasury: string;
  amountUsd: number;
  chain: number;
  txType: number;
  recipient: string;
  protocolId?: number;
  expectedOutputUsd?: number;
  actualOutputUsd?: number;
  quoteAgeSecs?: number;
  counterpartyRiskScore?: number;
}) {
  const { client } = buildClient(input.rpcUrl, input.programId);
  const signature = await client.proposeTransaction(
    backendKeypair,
    {
      aiAuthority: backendKeypair.publicKey,
      treasury: new PublicKey(input.treasury),
    },
    buildProposeArgs(input),
  );
  return { signature };
}

async function callModel(config: AgentJobConfig, treasury: TreasuryAccountRecord) {
  const endpoint = config.endpoint || "https://api.openai.com/v1/chat/completions";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            'You are an AURA treasury agent. Return strict JSON only: {"action":"HOLD"} or {"action":"PROPOSE","amountUsd":number,"reason":string}. Never exceed the provided max trade size.',
        },
        {
          role: "user",
          content: JSON.stringify({
            strategy: config.strategy,
            treasury: config.treasury,
            spentTodayUsd: treasury.policyState.spentTodayUsd.toString(),
            dailyLimitUsd: treasury.policyConfig.dailyLimitUsd.toString(),
            pending: Boolean(treasury.pending),
            executionPaused: treasury.executionPaused,
            maxTradeSizeUsd: config.maxTradeSizeUsd,
          }),
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Model request failed with ${response.status}`);
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Model returned no content");
  }
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  const parsed = JSON.parse(start >= 0 && end >= start ? content.slice(start, end + 1) : content) as
    | { action: "HOLD" }
    | { action: "PROPOSE"; amountUsd: number; reason?: string };
  return parsed;
}

interface AgentJobState {
  config: AgentJobConfig;
  timer?: NodeJS.Timeout;
  running: boolean;
  lastRunAt?: number;
  lastError?: string;
  lastResult?: unknown;
  history: unknown[];
}

const agentJobs = new Map<string, AgentJobState>();

async function runAgentOnceInternal(job: AgentJobState) {
  const { client } = buildClient(job.config.rpcUrl, job.config.programId);
  const treasury = new PublicKey(job.config.treasury);
  const account = await client.getTreasuryAccount(treasury);
  const decision = await callModel(job.config, account);
  job.lastRunAt = Date.now();
  if (decision.action === "HOLD") {
    job.lastResult = decision;
    job.history.unshift({ timestamp: Date.now(), ...decision });
    job.history = job.history.slice(0, 20);
    return decision;
  }
  const amountUsd = Math.min(job.config.maxTradeSizeUsd, decision.amountUsd);
  const result =
    job.config.mode === "confidential"
      ? await submitConfidentialProposal({
          rpcUrl: job.config.rpcUrl,
          programId: job.config.programId,
          treasury: job.config.treasury,
          amountUsd,
          chain: job.config.chain,
          txType: job.config.txType,
          recipient: job.config.recipient,
        })
      : await submitPublicProposal({
          rpcUrl: job.config.rpcUrl,
          programId: job.config.programId,
          treasury: job.config.treasury,
          amountUsd,
          chain: job.config.chain,
          txType: job.config.txType,
          recipient: job.config.recipient,
        });
  job.lastResult = { decision, result };
  job.history.unshift({ timestamp: Date.now(), decision, result });
  job.history = job.history.slice(0, 20);
  return result;
}

export async function startAgentJob(configInput: AgentJobConfig) {
  const job: AgentJobState = {
    config: {
      ...configInput,
      intervalMs: configInput.intervalMs ?? config.defaultAgentIntervalMs,
    },
    running: true,
    history: [],
  };
  const existing = agentJobs.get(configInput.treasury);
  if (existing?.timer) {
    clearInterval(existing.timer);
  }
  await runAgentOnceInternal(job);
  job.timer = setInterval(async () => {
    try {
      await runAgentOnceInternal(job);
      job.lastError = undefined;
    } catch (error) {
      job.lastError = error instanceof Error ? error.message : String(error);
    }
  }, job.config.intervalMs);
  agentJobs.set(configInput.treasury, job);
  return serializeAgentJob(job);
}

export async function runAgentOnce(configInput: AgentJobConfig) {
  const job: AgentJobState = {
    config: configInput,
    running: false,
    history: [],
  };
  const result = await runAgentOnceInternal(job);
  return { result, job: serializeAgentJob(job) };
}

export function stopAgentJob(treasury: string) {
  const job = agentJobs.get(treasury);
  if (!job) {
    return { stopped: false };
  }
  if (job.timer) {
    clearInterval(job.timer);
  }
  job.running = false;
  agentJobs.delete(treasury);
  return { stopped: true, treasury };
}

export function listAgentJobs() {
  return Array.from(agentJobs.values()).map(serializeAgentJob);
}

function serializeAgentJob(job: AgentJobState) {
  return {
    treasury: job.config.treasury,
    running: job.running,
    intervalMs: job.config.intervalMs,
    lastRunAt: job.lastRunAt,
    lastError: job.lastError,
    lastResult: job.lastResult,
    history: job.history,
    mode: job.config.mode,
    model: job.config.model,
  };
}
