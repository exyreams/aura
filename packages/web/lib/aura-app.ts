"use client";

import {
  AuraClient,
  type ConfigureMultisigArgs,
  type ConfigureSwarmArgs,
  type CreateTreasuryArgs,
  type ProposeTransactionArgs,
  type RegisterDwalletArgs,
  type TreasuryAccountRecord,
  validateAddress,
  validateAgentId,
  validateAmountUsd,
  validateDwalletId,
  validateGuardians,
  validateMultisigThreshold,
  validateSwarmMembers,
} from "@/lib/sdk";
import { EventParser } from "@coral-xyz/anchor";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  type Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";

export const TREASURY_OWNER_OFFSET = 9;

export const CHAINS = [
  { code: 0, label: "Bitcoin" },
  { code: 1, label: "Ethereum" },
  { code: 2, label: "Solana" },
  { code: 3, label: "Polygon" },
  { code: 4, label: "Arbitrum" },
  { code: 5, label: "Optimism" },
] as const;

export const TX_TYPES = [
  { code: 0, label: "Transfer" },
  { code: 1, label: "DeFi Swap" },
  { code: 2, label: "Lending Deposit" },
  { code: 3, label: "NFT Purchase" },
  { code: 4, label: "Contract Interaction" },
] as const;

export const PROPOSAL_STATUSES = [
  "Proposed",
  "Decryption Requested",
  "Awaiting Signature",
  "Executed",
  "Denied",
  "Cancelled",
  "Expired",
] as const;

export const VIOLATIONS = [
  "none",
  "per-tx limit",
  "daily limit",
  "bitcoin manual review",
  "time window",
  "velocity limit",
  "protocol not allowed",
  "slippage exceeded",
  "quote stale",
  "counterparty risk",
  "shared pool limit",
] as const;

export interface TreasuryEntry {
  publicKey: PublicKey;
  account: TreasuryAccountRecord;
}

export interface ParsedActivity {
  signature: string;
  treasury: string;
  proposalId?: string;
  kind: "proposal" | "audit";
  status?: number;
  approved?: boolean;
  violation?: number;
  detail?: string;
  timestamp?: number;
}

export function createAuraClient(
  connection: Connection,
  programId?: PublicKey,
) {
  return new AuraClient({ connection, programId });
}

export async function fetchOwnedTreasuries(
  connection: Connection,
  owner: PublicKey,
  programId?: PublicKey,
) {
  const client = createAuraClient(connection, programId);
  return (await client.program.account.treasuryAccount.all([
    {
      memcmp: {
        offset: TREASURY_OWNER_OFFSET,
        bytes: owner.toBase58(),
      },
    },
  ])) as TreasuryEntry[];
}

export async function fetchTreasury(
  connection: Connection,
  treasury: PublicKey,
  programId?: PublicKey,
) {
  const client = createAuraClient(connection, programId);
  const account = await client.getTreasuryAccount(treasury);
  return { publicKey: treasury, account } satisfies TreasuryEntry;
}

export async function fetchRecentActivity(
  connection: Connection,
  treasuries: PublicKey[],
  programId?: PublicKey,
  limit = 10,
) {
  if (treasuries.length === 0) {
    return [] as ParsedActivity[];
  }

  const client = createAuraClient(connection, programId);
  const parser = new EventParser(client.programId, client.program.coder);
  const signatureSet = new Set<string>();

  for (const treasury of treasuries) {
    const signatures = await connection.getSignaturesForAddress(treasury, {
      limit: 8,
    });
    for (const item of signatures) {
      signatureSet.add(item.signature);
    }
  }

  const signatures = Array.from(signatureSet).slice(0, 24);
  if (signatures.length === 0) {
    return [] as ParsedActivity[];
  }

  const transactions = await connection.getTransactions(signatures, {
    maxSupportedTransactionVersion: 0,
  });

  const events: ParsedActivity[] = [];
  for (const [index, tx] of transactions.entries()) {
    const logs = tx?.meta?.logMessages;
    if (!logs) {
      continue;
    }

    const parsed = Array.from(parser.parseLogs(logs));
    for (const event of parsed) {
      if (event.name === "proposalLifecycleEvent") {
        const data = event.data as {
          treasury: PublicKey;
          proposalId: BN;
          status: number;
          approved: boolean;
          violation: number;
        };
        events.push({
          signature: signatures[index],
          treasury: data.treasury.toBase58(),
          proposalId: data.proposalId.toString(),
          kind: "proposal",
          status: data.status,
          approved: data.approved,
          violation: data.violation,
          timestamp: tx.blockTime ?? undefined,
        });
      }
      if (event.name === "treasuryAuditEvent") {
        const data = event.data as {
          treasury: PublicKey;
          kind: string;
          detail: string;
          timestamp: BN;
        };
        events.push({
          signature: signatures[index],
          treasury: data.treasury.toBase58(),
          kind: "audit",
          detail: `${data.kind}: ${data.detail}`,
          timestamp: Number(data.timestamp.toString()),
        });
      }
    }
  }

  return events
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, limit);
}

export async function sendWalletInstructions(
  connection: Connection,
  wallet: WalletContextState,
  instructions: TransactionInstruction[],
) {
  if (!wallet.publicKey) {
    throw new Error("Connect a wallet first.");
  }
  const tx = new Transaction().add(...instructions);
  tx.feePayer = wallet.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  const signature = await wallet.sendTransaction(tx, connection, {
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return signature;
}

export function formatChain(code: number) {
  return (
    CHAINS.find((item) => item.code === code)?.label ?? `Unknown (${code})`
  );
}

export function formatTxType(code: number) {
  return (
    TX_TYPES.find((item) => item.code === code)?.label ?? `Unknown (${code})`
  );
}

export function formatProposalStatus(code: number) {
  return PROPOSAL_STATUSES[code] ?? `Unknown (${code})`;
}

export function formatViolation(code: number) {
  return VIOLATIONS[code] ?? `Unknown (${code})`;
}

export function buildCreateTreasuryArgs(input: {
  agentId: string;
  aiAuthority: PublicKey;
  dailyLimitUsd: number;
  perTxLimitUsd: number;
  daytimeHourlyLimitUsd?: number;
  nighttimeHourlyLimitUsd?: number;
  velocityLimitUsd?: number;
  maxSlippageBps?: number;
  maxQuoteAgeSecs?: number;
  maxCounterpartyRiskScore?: number;
  bitcoinManualReviewThresholdUsd?: number;
  pendingTransactionTtlSecs?: number;
}): CreateTreasuryArgs {
  validateAgentId(input.agentId);
  validateAmountUsd(input.dailyLimitUsd);
  validateAmountUsd(input.perTxLimitUsd);

  return {
    agentId: input.agentId,
    aiAuthority: input.aiAuthority,
    createdAt: new BN(Math.floor(Date.now() / 1000)),
    pendingTransactionTtlSecs: new BN(input.pendingTransactionTtlSecs ?? 900),
    policyConfig: {
      dailyLimitUsd: new BN(input.dailyLimitUsd),
      perTxLimitUsd: new BN(input.perTxLimitUsd),
      daytimeHourlyLimitUsd: new BN(
        input.daytimeHourlyLimitUsd ?? Math.floor(input.dailyLimitUsd / 10),
      ),
      nighttimeHourlyLimitUsd: new BN(
        input.nighttimeHourlyLimitUsd ?? Math.floor(input.dailyLimitUsd / 20),
      ),
      velocityLimitUsd: new BN(
        input.velocityLimitUsd ?? Math.floor(input.dailyLimitUsd / 2),
      ),
      allowedProtocolBitmap: new BN(31),
      maxSlippageBps: new BN(input.maxSlippageBps ?? 100),
      maxQuoteAgeSecs: new BN(input.maxQuoteAgeSecs ?? 300),
      maxCounterpartyRiskScore: input.maxCounterpartyRiskScore ?? 70,
      bitcoinManualReviewThresholdUsd: new BN(
        input.bitcoinManualReviewThresholdUsd ?? 5_000,
      ),
      sharedPoolLimitUsd: null,
      reputationPolicy: {
        highScoreThreshold: new BN(80),
        mediumScoreThreshold: new BN(50),
        highMultiplierBps: new BN(15_000),
        lowMultiplierBps: new BN(7_000),
      },
    },
    protocolFees: {
      treasuryCreationFeeUsd: new BN(100),
      transactionFeeBps: new BN(10),
      fheSubsidyBps: new BN(5_000),
    },
  };
}

export function buildProposeTransactionArgs(input: {
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
      input.expectedOutputUsd !== undefined
        ? new BN(input.expectedOutputUsd)
        : null,
    actualOutputUsd:
      input.actualOutputUsd !== undefined
        ? new BN(input.actualOutputUsd)
        : null,
    quoteAgeSecs:
      input.quoteAgeSecs !== undefined ? new BN(input.quoteAgeSecs) : null,
    counterpartyRiskScore: input.counterpartyRiskScore ?? null,
    recipientOrContract: input.recipient,
  };
}

export function buildRegisterDwalletArgs(input: {
  chain: number;
  dwalletId: string;
  address: string;
  balanceUsd: number;
  dwalletAccount?: PublicKey | null;
  authorizedUserPubkey?: PublicKey | null;
  messageMetadataDigest?: string | null;
  publicKeyHex?: string | null;
}): RegisterDwalletArgs {
  validateDwalletId(input.dwalletId);
  validateAddress(input.address);
  validateAmountUsd(input.balanceUsd);

  return {
    chain: input.chain,
    dwalletId: input.dwalletId,
    address: input.address,
    balanceUsd: new BN(input.balanceUsd),
    dwalletAccount: input.dwalletAccount ?? null,
    authorizedUserPubkey: input.authorizedUserPubkey ?? null,
    messageMetadataDigest: input.messageMetadataDigest ?? null,
    publicKeyHex: input.publicKeyHex ?? null,
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  };
}

export function buildConfigureMultisigArgs(input: {
  requiredSignatures: number;
  guardians: PublicKey[];
}): ConfigureMultisigArgs {
  validateGuardians(input.guardians);
  validateMultisigThreshold(input.requiredSignatures, input.guardians.length);
  return {
    requiredSignatures: input.requiredSignatures,
    guardians: input.guardians,
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  };
}

export function buildConfigureSwarmArgs(input: {
  swarmId: string;
  memberAgents: string[];
  sharedPoolLimitUsd: number;
}): ConfigureSwarmArgs {
  validateAgentId(input.swarmId);
  validateSwarmMembers(input.memberAgents);
  validateAmountUsd(input.sharedPoolLimitUsd);
  return {
    swarmId: input.swarmId,
    memberAgents: input.memberAgents,
    sharedPoolLimitUsd: new BN(input.sharedPoolLimitUsd),
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  };
}

export function parsePublicKey(input: string) {
  return new PublicKey(input.trim());
}

export function bigNumberToNumber(
  value: BN | bigint | number | null | undefined,
) {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return Number(value.toString());
}
