import BN from "bn.js";
import bs58 from "bs58";
import { and, eq } from "drizzle-orm";
import {
  AURA_FEATURE_DOMAINS,
  AuraClient,
  type ProposeConfidentialTransactionArgs,
  type ProposeTransactionArgs,
  type TreasuryAccountRecord,
  validateAddress,
  validateAmountUsd,
} from "@aura-protocol/sdk-ts";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuthenticatedUser } from "../auth/index.js";
import {
  ensureTreasuryRecord,
  getDkgSession,
  getTreasuryRecordForAgent,
  storeDkgSession,
  withAgentSigner,
  type AgentSignerRecord,
} from "../agents/index.js";
import { loadConfig } from "../config.js";
import { db } from "../db/client.js";
import {
  agentJobs as agentJobRows,
  agentKeypairs as agentKeypairRows,
  treasuries as treasuryRows,
  type AgentJobRecord,
  type TreasuryRecord,
} from "../db/schema.js";
import {
  encryptU64,
  encryptU64Batch,
  encryptU64Vector,
  readU64Ciphertext,
  requestDwalletSign,
} from "../ika/client.js";
import {
  buildExecutePendingInstruction,
  buildMessageDigestHex,
  buildPendingMessage,
  createEphemeralKeypair,
  deriveApprovedExecutionAccounts,
  ensureEncryptDeposit,
  getActivePendingProposal,
  markInstructionSigner,
  provisionDwallet,
  resolvePendingPolicyOutput,
  resolvePendingProposal,
  resolvePendingRequestAccount,
  resolveScalarGuardrails,
  resolveVectorGuardrail,
  sendInstructionsWithBudget,
  waitForCiphertextVerified,
  waitForDecryptionReady,
  parseMessageApprovalState,
  waitForMessageApproval,
} from "../protocol/index.js";
import {
  buildProgramInstruction,
  getProgramInstructionCatalog,
} from "./program-instructions.js";
import { createLogger } from "../logger.js";
import type { AgentJobConfig } from "../types.js";

const config = loadConfig();
const serviceLogger = createLogger(config).child({ module: "service" });

export interface ServiceContext {
  user: AuthenticatedUser;
}

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

function requireAgentId(input: { agentId?: string }) {
  if (!input.agentId) {
    throw new Error("agentId is required for this backend operation.");
  }
  return input.agentId;
}

async function withRequestAgent<T>(
  context: ServiceContext,
  input: { agentId?: string },
  fn: (keypair: Keypair, agent: AgentSignerRecord) => Promise<T>,
) {
  return await withAgentSigner(context.user, requireAgentId(input), fn);
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
    sanctionsProof: [],
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
    defaultRpcUrl: config.defaultRpcUrl,
    defaultProgramId: config.defaultProgramId.toBase58(),
    auth: {
      mode: "siws-cookie",
      cookieName: config.cookieName,
      jwtExpirySecs: config.jwtExpirySecs,
    },
    persistence: {
      sqlite: true,
    },
    sdkSurface: {
      domains: AURA_FEATURE_DOMAINS.length,
      instructions: AURA_FEATURE_DOMAINS.reduce(
        (total, domain) => total + domain.instructions.length,
        0,
      ),
    },
  };
}

export function getFeatureCatalog() {
  return {
    domains: AURA_FEATURE_DOMAINS,
    totals: {
      domains: AURA_FEATURE_DOMAINS.length,
      instructions: AURA_FEATURE_DOMAINS.reduce(
        (total, domain) => total + domain.instructions.length,
        0,
      ),
    },
  };
}

export function getInstructionCatalog() {
  return getProgramInstructionCatalog();
}

export async function buildGenericProgramInstruction(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
  instruction: string;
  accounts: Record<string, unknown>;
  args: Record<string, unknown> | unknown[];
}) {
  const { client, programId } = buildClient(input.rpcUrl, input.programId);
  const agent = input.agentId
    ? await withAgentSigner(context.user, input.agentId, async (_keypair, record) => record)
    : undefined;
  return await buildProgramInstruction(
    client,
    {
      instruction: input.instruction,
      accounts: input.accounts,
      args: input.args,
      rpcUrl: input.rpcUrl,
      programId: input.programId,
    },
    { programId, defaultSigner: agent ? new PublicKey(agent.publicKey) : undefined },
  );
}

export async function sendGenericProgramInstruction(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
  instruction: string;
  accounts: Record<string, unknown>;
  args: Record<string, unknown> | unknown[];
  computeUnitLimit?: number;
}) {
  return await withRequestAgent(context, input, async (agentKeypair, agent) => {
    const { connection, client, programId } = buildClient(input.rpcUrl, input.programId);
    const built = await buildProgramInstruction(
      client,
      {
        instruction: input.instruction,
        accounts: input.accounts,
        args: input.args,
        rpcUrl: input.rpcUrl,
        programId: input.programId,
      },
      { programId, defaultSigner: agentKeypair.publicKey },
    );
    const agentSigner = agentKeypair.publicKey.toBase58();
    const unsupportedSigners = built.requiredSigners.filter(
      (signer) => signer !== agentSigner,
    );
    if (unsupportedSigners.length > 0) {
      throw new Error(
        `Agent ${agent.agentId} can only send instructions signed by ${agentSigner}; missing signer(s): ${unsupportedSigners.join(", ")}`,
      );
    }
    const signature = await sendInstructionsWithBudget({
      connection,
      payer: agentKeypair,
      instructions: [
        new TransactionInstruction({
          programId: new PublicKey(built.instruction.programId),
          keys: built.instruction.accounts.map((account) => ({
            pubkey: new PublicKey(account.pubkey),
            isSigner: account.isSigner,
            isWritable: account.isWritable,
          })),
          data: Buffer.from(built.instruction.dataBase64, "base64"),
        }),
      ],
      computeUnitLimit: input.computeUnitLimit,
    });
    if (input.instruction === "create_treasury") {
      const treasury = built.normalizedAccounts["treasury"];
      if (treasury instanceof PublicKey) {
        ensureTreasuryRecord({
          agent,
          treasuryAddress: treasury.toBase58(),
          agentId: agent.agentId,
        });
      } else if (typeof treasury === "string") {
        ensureTreasuryRecord({
          agent,
          treasuryAddress: treasury,
          agentId: agent.agentId,
        });
      }
    }
    return { ...built, signature };
  });
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

export async function encryptVectorValues(input: {
  rpcUrl?: string;
  programId?: string;
  dailyLimit: number;
  perTxLimit: number;
  spentToday?: number;
  wait?: boolean;
}) {
  const { connection, programId } = buildClient(input.rpcUrl, input.programId);
  const guardrailVectorCiphertext = await encryptU64Vector(
    [input.dailyLimit, input.perTxLimit, input.spentToday ?? 0],
    programId,
  );
  if (input.wait) {
    await waitForCiphertextVerified(connection, guardrailVectorCiphertext);
  }
  return {
    guardrailVectorCiphertext: guardrailVectorCiphertext.toBase58(),
  };
}

export async function ensureBackendEncryptDeposit(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
}) {
  return await withRequestAgent(context, input, async (agentKeypair) => {
    const { connection, programId } = buildClient(input.rpcUrl, input.programId);
    const result = await ensureEncryptDeposit({
      connection,
      payer: agentKeypair,
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
  });
}

export async function submitConfidentialProposal(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
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
  return await withRequestAgent(context, input, async (agentKeypair, agent) => {
    const { connection, programId, client } = buildClient(input.rpcUrl, input.programId);
    const treasury = new PublicKey(input.treasury);
    ensureTreasuryRecord({ agent, treasuryAddress: treasury.toBase58() });
    const account = await client.getTreasuryAccount(treasury);
    const args = buildConfidentialArgs(input);
    const depositResult = await ensureEncryptDeposit({
      connection,
      payer: agentKeypair,
      auraProgramId: programId,
    });
    if (account.confidentialGuardrails?.guardrailVectorCiphertext) {
      // Vector FHE path — lower memory footprint, works within the 256 KB heap limit
      const guardrailVectorCiphertext = resolveVectorGuardrail(account);
      const amountVectorCiphertext = await encryptU64Vector([input.amountUsd], programId);
      await waitForCiphertextVerified(connection, amountVectorCiphertext);
      const policyResultSigner = createEphemeralKeypair();
      const vectorInstruction = await client.proposeConfidentialVectorTransactionInstruction(
        {
          aiAuthority: agentKeypair.publicKey,
          treasury,
          guardrailVectorCiphertext,
          amountVectorCiphertext,
          policyResultVectorCiphertext: policyResultSigner.publicKey,
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
      markInstructionSigner(vectorInstruction, policyResultSigner.publicKey);
      const vectorSignature = await sendInstructionsWithBudget({
        connection,
        payer: agentKeypair,
        instructions: [vectorInstruction],
        extraSigners: [policyResultSigner],
      });
      if (input.waitForOutput) {
        await waitForCiphertextVerified(connection, policyResultSigner.publicKey);
      }
      return {
        signature: vectorSignature,
        amountCiphertext: amountVectorCiphertext.toBase58(),
        policyOutputCiphertext: policyResultSigner.publicKey.toBase58(),
        deposit: depositResult.accounts.deposit.toBase58(),
      };
    }

    const guardrails = resolveScalarGuardrails(account);
    const amountCiphertext = await encryptU64(input.amountUsd, programId);
    await waitForCiphertextVerified(connection, amountCiphertext);
    const policyOutputSigner = createEphemeralKeypair();
    const instruction = await client.proposeConfidentialTransactionInstruction(
      {
        aiAuthority: agentKeypair.publicKey,
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
      payer: agentKeypair,
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
  });
}

export async function requestPolicyDecryptionService(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
  treasury: string;
  ciphertext?: string;
  wait?: boolean;
}) {
  return await withRequestAgent(context, input, async (agentKeypair, agent) => {
    const { connection, programId, client } = buildClient(input.rpcUrl, input.programId);
    const treasury = new PublicKey(input.treasury);
    ensureTreasuryRecord({ agent, treasuryAddress: treasury.toBase58() });
    const account = await client.getTreasuryAccount(treasury);
    const ciphertext = input.ciphertext
      ? new PublicKey(input.ciphertext)
      : resolvePendingPolicyOutput(account);
    const requestSigner = createEphemeralKeypair();
    const depositResult = await ensureEncryptDeposit({
      connection,
      payer: agentKeypair,
      auraProgramId: programId,
    });
    const instruction = await client.requestPolicyDecryptionInstruction(
      {
        operator: agentKeypair.publicKey,
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
      payer: agentKeypair,
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
  });
}

export async function confirmPolicyDecryptionService(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
  treasury: string;
  requestAccount?: string;
}) {
  return await withRequestAgent(context, input, async (agentKeypair, agent) => {
    const { client } = buildClient(input.rpcUrl, input.programId);
    const treasury = new PublicKey(input.treasury);
    ensureTreasuryRecord({ agent, treasuryAddress: treasury.toBase58() });
    const account = await client.getTreasuryAccount(treasury);
    const requestAccount = input.requestAccount
      ? new PublicKey(input.requestAccount)
      : resolvePendingRequestAccount(account);
    const signature = await client.confirmPolicyDecryption(
      agentKeypair,
      {
        operator: agentKeypair.publicKey,
        treasury,
        requestAccount,
      },
      Math.floor(Date.now() / 1000),
    );
    const refreshed = await client.getTreasuryAccount(treasury);
    const refreshedPending = getActivePendingProposal(refreshed);
    let violationCode: string | null = null;
    try {
      violationCode = (
        await readU64Ciphertext(resolvePendingPolicyOutput(account), agentKeypair.publicKey)
      ).toString();
    } catch {
      violationCode = null;
    }
    return {
      signature,
      requestAccount: requestAccount.toBase58(),
      approved: refreshedPending?.decision.approved ?? null,
      violation: refreshedPending?.decision.violation ?? null,
      violationCode,
      pending: refreshedPending,
    };
  });
}

export async function executePendingService(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
  treasury: string;
  wait?: boolean;
  waitSigned?: boolean;
}) {
  return await withRequestAgent(context, input, async (agentKeypair, agent) => {
    const { connection, programId, client } = buildClient(input.rpcUrl, input.programId);
    const treasury = new PublicKey(input.treasury);
    ensureTreasuryRecord({ agent, treasuryAddress: treasury.toBase58() });
    const account = await client.getTreasuryAccount(treasury);
    const pending = resolvePendingProposal(account);
    const approvedAccounts = pending.decision.approved
      ? deriveApprovedExecutionAccounts(account, { auraProgramId: programId })
      : undefined;
    const now = Math.floor(Date.now() / 1000);

    // Use the SDK's executePendingInstruction — it handles account layout,
    // serialization, and instruction name correctly via the Anchor program builder.
    const instruction = await client.executePendingInstruction(
      {
        operator: agentKeypair.publicKey,
        treasury,
        messageApproval: approvedAccounts?.messageApproval ?? null,
        dwalletCoordinator: approvedAccounts?.dwalletCoordinator ?? null,
        dwallet: approvedAccounts?.dwalletAccount ?? null,
        cpiAuthority: approvedAccounts?.cpiAuthority ?? null,
        dwalletProgram: approvedAccounts?.dwalletProgram ?? null,
        callerProgram: programId,
        externalLiveness: null,
        systemProgram: SystemProgram.programId,
      },
      now,
    );
    const signature = await sendInstructionsWithBudget({
      connection,
      payer: agentKeypair,
      instructions: [instruction],
    });
    if (pending.decision.approved && approvedAccounts) {
      // Always trigger the gRPC sign request — without this Ika never signs.
      // Fire-and-forget: wrapped in try/catch so a gRPC hiccup doesn't fail
      // the whole request. The client polls /v1/execution/status to know when
      // the signature lands.
      const triggerSign = async () => {
        await waitForMessageApproval(connection, approvedAccounts.messageApproval, "pending", {
          timeoutMs: 120_000,
        });
        const message = Buffer.from(
          buildPendingMessage(approvedAccounts.pending, approvedAccounts.dwallet),
          "utf8",
        );
        const dwalletKey = approvedAccounts.dwalletAccount.toBase58();
        const dkgSession = getDkgSession({ agent, dwalletAddress: dwalletKey });
        const signingSecret = Uint8Array.from(agentKeypair.secretKey);
        try {
          await requestDwalletSign(
            agentKeypair.publicKey,
            approvedAccounts.dwalletAccount,
            message,
            Buffer.from(bs58.decode(signature)),
            undefined, // grpcUrl — use default
            signingSecret,
            dkgSession?.sessionIdentifier,
            dkgSession?.dkgAttestation,
          );
        } finally {
          signingSecret.fill(0);
        }
      };

      if (input.waitSigned) {
        try {
          await triggerSign();
          await waitForMessageApproval(connection, approvedAccounts.messageApproval, "signed", {
            timeoutMs: 180_000,
          });
        } catch (err) {
          serviceLogger.warn("ika.sign.failed", { error: String(err) });
        }
      } else if (input.wait) {
        try {
          await triggerSign();
          await waitForMessageApproval(connection, approvedAccounts.messageApproval, "signed", {
            timeoutMs: 180_000,
          });
        } catch (err) {
          serviceLogger.warn("ika.sign.failed", { error: String(err) });
        }
      } else {
        // No waiting requested — fire sign in background and return immediately.
        triggerSign().catch((err) => serviceLogger.warn("ika.sign.failed", { error: String(err) }));
      }
    }
    const refreshed = await client.getTreasuryAccount(treasury);
    return {
      signature,
      approved: pending.decision.approved,
      messageApproval: approvedAccounts?.messageApproval.toBase58(),
      pending: getActivePendingProposal(refreshed),
    };
  });
}

export async function triggerIkaSignService(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
  treasury: string;
  txSignature: string;
}) {
  return await withRequestAgent(context, input, async (agentKeypair, agent) => {
    const { client } = buildClient(input.rpcUrl, input.programId);
    const treasury = new PublicKey(input.treasury);
    ensureTreasuryRecord({ agent, treasuryAddress: treasury.toBase58() });
    const account = await client.getTreasuryAccount(treasury);
    const pending = resolvePendingProposal(account);
    const approvedAccounts = pending.decision.approved
      ? deriveApprovedExecutionAccounts(account, { auraProgramId: buildProgramId(input.programId) })
      : undefined;
    if (!approvedAccounts) throw new Error("No approved pending proposal found.");
    const message = Buffer.from(
      buildPendingMessage(approvedAccounts.pending, approvedAccounts.dwallet),
      "utf8",
    );
    const dwalletKey = approvedAccounts.dwalletAccount.toBase58();
    const dkgSession = getDkgSession({ agent, dwalletAddress: dwalletKey });
    const signingSecret = Uint8Array.from(agentKeypair.secretKey);
    try {
      await requestDwalletSign(
        agentKeypair.publicKey,
        approvedAccounts.dwalletAccount,
        message,
        Buffer.from(bs58.decode(input.txSignature)),
        undefined, // grpcUrl — use default
        signingSecret,
        dkgSession?.sessionIdentifier,
        dkgSession?.dkgAttestation,
      );
    } finally {
      signingSecret.fill(0);
    }
    return { triggered: true, messageApproval: approvedAccounts.messageApproval.toBase58() };
  });
}

export async function finalizeExecutionService(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
  treasury: string;
  messageApproval?: string;
}) {
  return await withRequestAgent(context, input, async (agentKeypair, agent) => {
    const { client } = buildClient(input.rpcUrl, input.programId);
    const treasury = new PublicKey(input.treasury);
    ensureTreasuryRecord({ agent, treasuryAddress: treasury.toBase58() });
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
      agentKeypair,
      {
        operator: agentKeypair.publicKey,
        treasury,
        messageApproval,
      },
      Math.floor(Date.now() / 1000),
    );
    const refreshed = await client.getTreasuryAccount(treasury);
    return {
      signature,
      totalTransactions: refreshed.totalTransactions.toString(),
      pending: getActivePendingProposal(refreshed),
    };
  });
}

export async function getMessageApprovalStatusService(input: {
  rpcUrl?: string;
  messageApproval: string;
}) {
  if (!input.messageApproval) {
    return { messageApproval: "", state: "missing" as const };
  }
  const { connection } = buildClient(input.rpcUrl);
  const pubkey = new PublicKey(input.messageApproval);
  const accountInfo = await connection.getAccountInfo(pubkey);
  const state = accountInfo
    ? parseMessageApprovalState(accountInfo.data as Buffer)
    : "missing";
  return { messageApproval: input.messageApproval, state };
}

export async function createDwalletService(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
  ikaGrpcUrl?: string;
}) {
  return await withRequestAgent(context, input, async (agentKeypair, agent) => {
    const { connection, programId } = buildClient(input.rpcUrl, input.programId);
    const result = await provisionDwallet({
      connection,
      payer: agentKeypair,
      auraProgramId: programId,
      ikaGrpcUrl: input.ikaGrpcUrl,
    });
    storeDkgSession({
      agent,
      dwalletAddress: result.dwalletAccount.toBase58(),
      sessionIdentifier: result.sessionIdentifier,
      dkgAttestation: result.dkgAttestation,
    });
    return {
      dwalletId: result.dwalletId,
      dwalletAccount: result.dwalletAccount.toBase58(),
      authorizedUserPubkey: result.authorizedUserPubkey.toBase58(),
      publicKeyHex: result.publicKeyHex,
      address: result.address,
      transferSignature: result.transferSignature,
      chain: 2, // Solana
    };
  });
}

export async function submitPublicProposal(context: ServiceContext, input: {
  rpcUrl?: string;
  programId?: string;
  agentId?: string;
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
  return await withRequestAgent(context, input, async (agentKeypair, agent) => {
    const { connection, client } = buildClient(input.rpcUrl, input.programId);
    const treasury = new PublicKey(input.treasury);
    ensureTreasuryRecord({ agent, treasuryAddress: treasury.toBase58() });
    const instruction = await client.proposeTransactionInstruction(
      {
        aiAuthority: agentKeypair.publicKey,
        treasury,
      },
      buildProposeArgs(input),
    );
    const signature = await sendInstructionsWithBudget({
      connection,
      payer: agentKeypair,
      instructions: [instruction],
    });
    return { signature };
  });
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
            pending: Boolean(getActivePendingProposal(treasury)),
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
  id?: number;
  context: ServiceContext;
  agent: AgentSignerRecord;
  treasuryRecord?: TreasuryRecord;
  config: AgentJobConfig;
  timer?: NodeJS.Timeout;
  running: boolean;
  lastRunAt?: number;
  lastError?: string;
  lastResult?: unknown;
  history: unknown[];
}

const runtimeAgentJobs = new Map<number, AgentJobState>();

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

function parseJsonField(value: string | null | undefined, fallback: unknown) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function upsertAgentJobRecord(input: {
  treasury: TreasuryRecord;
  config: AgentJobConfig;
  status: "running" | "stopped";
}) {
  const now = unixNow();
  const existing = db
    .select()
    .from(agentJobRows)
    .where(eq(agentJobRows.treasuryId, input.treasury.id))
    .get();
  if (existing) {
    return db
      .update(agentJobRows)
      .set({
        status: input.status,
        configJson: JSON.stringify(input.config),
        lastError: null,
        updatedAt: now,
      })
      .where(eq(agentJobRows.id, existing.id))
      .returning()
      .get();
  }
  return db
    .insert(agentJobRows)
    .values({
      treasuryId: input.treasury.id,
      status: input.status,
      configJson: JSON.stringify(input.config),
      historyJson: "[]",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

function persistAgentJobRuntime(job: AgentJobState) {
  if (!job.id) {
    return;
  }
  db.update(agentJobRows)
    .set({
      status: job.running ? "running" : "stopped",
      configJson: JSON.stringify(job.config),
      lastRunAt: job.lastRunAt ?? null,
      lastError: job.lastError ?? null,
      lastResultJson: job.lastResult === undefined ? null : JSON.stringify(job.lastResult),
      historyJson: JSON.stringify(job.history),
      updatedAt: unixNow(),
    })
    .where(eq(agentJobRows.id, job.id))
    .run();
}

async function runAgentOnceInternal(job: AgentJobState) {
  serviceLogger.info("agent.run_started", {
    treasury: job.config.treasury,
    mode: job.config.mode,
    model: job.config.model,
  });
  const { client } = buildClient(job.config.rpcUrl, job.config.programId);
  const treasury = new PublicKey(job.config.treasury);
  const account = await client.getTreasuryAccount(treasury);
  const decision = await callModel(job.config, account);
  job.lastRunAt = unixNow();
  if (decision.action === "HOLD") {
    job.lastResult = decision;
    job.history.unshift({ timestamp: unixNow(), ...decision });
    job.history = job.history.slice(0, 20);
    serviceLogger.info("agent.run_completed", {
      treasury: job.config.treasury,
      action: "HOLD",
    });
    return decision;
  }
  const amountUsd = Math.min(job.config.maxTradeSizeUsd, decision.amountUsd);
  const result =
    job.config.mode === "confidential"
      ? await submitConfidentialProposal(job.context, {
        rpcUrl: job.config.rpcUrl,
        programId: job.config.programId,
        agentId: job.agent.agentId,
        treasury: job.config.treasury,
        amountUsd,
        chain: job.config.chain,
        txType: job.config.txType,
        recipient: job.config.recipient,
      })
      : await submitPublicProposal(job.context, {
        rpcUrl: job.config.rpcUrl,
        programId: job.config.programId,
        agentId: job.agent.agentId,
        treasury: job.config.treasury,
        amountUsd,
        chain: job.config.chain,
        txType: job.config.txType,
        recipient: job.config.recipient,
      });
  job.lastResult = { decision, result };
  job.history.unshift({ timestamp: unixNow(), decision, result });
  job.history = job.history.slice(0, 20);
  serviceLogger.info("agent.run_completed", {
    treasury: job.config.treasury,
    action: "PROPOSE",
    amountUsd,
  });
  return result;
}

export async function startAgentJob(context: ServiceContext, configInput: AgentJobConfig) {
  return await withRequestAgent(context, configInput, async (_agentKeypair, agent) => {
    const treasuryRecord = getTreasuryRecordForAgent({
      agent,
      treasuryAddress: configInput.treasury,
    });
    const configWithDefaults: AgentJobConfig = {
      ...configInput,
      agentId: agent.agentId,
      intervalMs: configInput.intervalMs ?? config.defaultAgentIntervalMs,
    };
    const record = upsertAgentJobRecord({
      treasury: treasuryRecord,
      config: configWithDefaults,
      status: "running",
    });
    const existing = runtimeAgentJobs.get(record.id);
    if (existing?.timer) {
      clearInterval(existing.timer);
    }
    const job: AgentJobState = {
      id: record.id,
      context,
      agent,
      treasuryRecord,
      config: configWithDefaults,
      running: true,
      history: [],
    };
    runtimeAgentJobs.set(record.id, job);
    serviceLogger.info("agent.started", {
      treasury: configInput.treasury,
      intervalMs: job.config.intervalMs,
      mode: configInput.mode,
      agentId: agent.agentId,
    });
    try {
      await runAgentOnceInternal(job);
      job.lastError = undefined;
    } catch (error) {
      job.lastError = error instanceof Error ? error.message : String(error);
      serviceLogger.error("agent.initial_run_failed", {
        treasury: configInput.treasury,
        error,
      });
    }
    persistAgentJobRuntime(job);
    job.timer = setInterval(async () => {
      try {
        await runAgentOnceInternal(job);
        job.lastError = undefined;
      } catch (error) {
        job.lastError = error instanceof Error ? error.message : String(error);
        serviceLogger.error("agent.interval_run_failed", {
          treasury: configInput.treasury,
          error,
        });
      } finally {
        persistAgentJobRuntime(job);
      }
    }, job.config.intervalMs);
    return serializeAgentJob(job);
  });
}

export async function runAgentOnce(context: ServiceContext, configInput: AgentJobConfig) {
  return await withRequestAgent(context, configInput, async (_agentKeypair, agent) => {
    const job: AgentJobState = {
      context,
      agent,
      config: {
        ...configInput,
        agentId: agent.agentId,
      },
      running: false,
      history: [],
    };
    try {
      const result = await runAgentOnceInternal(job);
      return { result, job: serializeAgentJob(job) };
    } catch (error) {
      job.lastError = error instanceof Error ? error.message : String(error);
      serviceLogger.error("agent.run_once_failed", {
        treasury: configInput.treasury,
        error,
      });
      throw error;
    }
  });
}

export async function stopAgentJob(context: ServiceContext, input: { agentId?: string; treasury: string }) {
  return await withRequestAgent(context, input, async (_agentKeypair, agent) => {
    const treasuryRecord = getTreasuryRecordForAgent({
      agent,
      treasuryAddress: input.treasury,
    });
    const record = db
      .select()
      .from(agentJobRows)
      .where(eq(agentJobRows.treasuryId, treasuryRecord.id))
      .get();
    if (!record) {
      return { stopped: false };
    }
    const runtime = runtimeAgentJobs.get(record.id);
    if (runtime?.timer) {
      clearInterval(runtime.timer);
    }
    runtimeAgentJobs.delete(record.id);
    db.update(agentJobRows)
      .set({ status: "stopped", updatedAt: unixNow() })
      .where(eq(agentJobRows.id, record.id))
      .run();
    serviceLogger.info("agent.stopped", { treasury: input.treasury, agentId: agent.agentId });
    return { stopped: true, treasury: input.treasury };
  });
}

export function listAgentJobs(context: ServiceContext) {
  const rows = db
    .select({
      job: agentJobRows,
      treasury: treasuryRows,
      agent: agentKeypairRows,
    })
    .from(agentJobRows)
    .innerJoin(treasuryRows, eq(agentJobRows.treasuryId, treasuryRows.id))
    .innerJoin(agentKeypairRows, eq(treasuryRows.agentKeypairId, agentKeypairRows.id))
    .where(eq(agentKeypairRows.userId, context.user.id))
    .all();
  return rows.map((row) => serializeAgentJobRecord(row.job, row.treasury, row.agent));
}

export function stopAllAgentJobs() {
  for (const [id, job] of runtimeAgentJobs.entries()) {
    if (job.timer) {
      clearInterval(job.timer);
    }
    job.running = false;
    persistAgentJobRuntime(job);
    serviceLogger.info("agent.stopped", { id, treasury: job.config.treasury, reason: "shutdown" });
  }
  runtimeAgentJobs.clear();
}

function serializeAgentJob(job: AgentJobState) {
  return {
    treasury: job.config.treasury,
    agentId: job.agent.agentId,
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

function serializeAgentJobRecord(
  job: AgentJobRecord,
  treasury: TreasuryRecord,
  agent: AgentSignerRecord,
) {
  const config = parseJsonField(job.configJson, {}) as Partial<AgentJobConfig>;
  return {
    id: job.id,
    treasury: treasury.treasuryAddress,
    agentId: agent.agentId,
    running: job.status === "running",
    intervalMs: config.intervalMs,
    lastRunAt: job.lastRunAt ?? undefined,
    lastError: job.lastError ?? undefined,
    lastResult: parseJsonField(job.lastResultJson, undefined),
    history: parseJsonField(job.historyJson, []),
    mode: config.mode,
    model: config.model,
  };
}
