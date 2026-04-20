import { confirm, input, number, select } from "@inquirer/prompts";
import BN from "bn.js";
import {
  type ConfigureMultisigArgs,
  type ConfigureSwarmArgs,
  type CreateTreasuryArgs,
  type ProposeConfidentialTransactionArgs,
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
} from "../sdk.js";
import { PublicKey } from "@solana/web3.js";

import type { CliContext } from "../context.js";
import { listChainChoices, listTransactionTypeChoices, parseChain, parseTransactionType } from "../domain.js";

export interface TreasuryLookupOptions {
  treasury?: string;
  agentId?: string;
}

function requireWallet(ctx: CliContext) {
  if (!ctx.wallet) {
    throw new Error("This command requires a wallet. Configure one with 'aura config init' or pass --wallet.");
  }
  return ctx.wallet;
}

export async function promptString(
  current: string | undefined,
  message: string,
  options: {
    defaultValue?: string;
    validate?: (value: string) => void;
  } = {},
): Promise<string> {
  const initial = current?.trim();
  if (initial) {
    if (options.validate) {
      options.validate(initial);
    }
    return initial;
  }

  const value = await input({
    message,
    default: options.defaultValue,
    validate: (candidate) => {
      try {
        options.validate?.(candidate);
        return true;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });
  return value.trim();
}

export async function promptNumber(
  current: number | undefined,
  message: string,
  options: {
    defaultValue?: number;
    validate?: (value: number) => void;
  } = {},
): Promise<number> {
  if (current !== undefined && !Number.isNaN(current)) {
    options.validate?.(current);
    return current;
  }

  const value = await number({
    message,
    default: options.defaultValue,
    validate: (candidate) => {
      if (candidate === undefined || Number.isNaN(candidate)) {
        return "Enter a number";
      }
      try {
        options.validate?.(candidate);
        return true;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });

  if (value === undefined || Number.isNaN(value)) {
    throw new Error(`${message} is required`);
  }

  return value;
}

export async function promptChain(current: string | number | undefined, message: string): Promise<number> {
  if (current !== undefined) {
    return parseChain(current);
  }
  return await select({
    message,
    choices: listChainChoices(),
  });
}

export async function promptTransactionType(
  current: string | number | undefined,
  message: string,
): Promise<number> {
  if (current !== undefined) {
    return parseTransactionType(current);
  }
  return await select({
    message,
    choices: listTransactionTypeChoices(),
  });
}

export async function confirmOrSkip(skip: boolean, message: string): Promise<boolean> {
  if (skip) {
    return true;
  }
  return await confirm({ message, default: false });
}

export function parseCsv(inputValue: string | undefined): string[] {
  if (!inputValue) {
    return [];
  }
  return inputValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function resolveTreasuryAccount(
  ctx: CliContext,
  options: TreasuryLookupOptions,
): Promise<{ treasury: PublicKey; account: TreasuryAccountRecord; agentId: string }> {
  const wallet = requireWallet(ctx);

  if (options.treasury) {
    const treasury = new PublicKey(options.treasury);
    const account = await ctx.client.getTreasuryAccount(treasury);
    return { treasury, account, agentId: account.agentId };
  }

  const agentId = options.agentId ?? ctx.config.defaultAgentId;
  if (!agentId) {
    throw new Error("Pass --agent-id or --treasury, or set defaultAgentId in your CLI config.");
  }

  const result = await ctx.client.getTreasuryForOwner(wallet.publicKey, agentId);
  if (!result.account) {
    throw new Error(
      `No treasury found for owner ${wallet.publicKey.toBase58()} and agentId '${agentId}'.`,
    );
  }

  return {
    treasury: result.treasury,
    account: result.account,
    agentId,
  };
}

export function buildCreateTreasuryArgs(inputValue: {
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
  validateAgentId(inputValue.agentId);
  validateAmountUsd(inputValue.dailyLimitUsd);
  validateAmountUsd(inputValue.perTxLimitUsd);

  const now = Math.floor(Date.now() / 1000);
  return {
    agentId: inputValue.agentId,
    aiAuthority: inputValue.aiAuthority,
    createdAt: new BN(now),
    pendingTransactionTtlSecs: new BN(inputValue.pendingTransactionTtlSecs ?? 900),
    policyConfig: {
      dailyLimitUsd: new BN(inputValue.dailyLimitUsd),
      perTxLimitUsd: new BN(inputValue.perTxLimitUsd),
      daytimeHourlyLimitUsd: new BN(
        inputValue.daytimeHourlyLimitUsd ?? Math.floor(inputValue.dailyLimitUsd / 10),
      ),
      nighttimeHourlyLimitUsd: new BN(
        inputValue.nighttimeHourlyLimitUsd ?? Math.floor(inputValue.dailyLimitUsd / 20),
      ),
      velocityLimitUsd: new BN(
        inputValue.velocityLimitUsd ?? Math.floor(inputValue.dailyLimitUsd / 2),
      ),
      allowedProtocolBitmap: new BN(31),
      maxSlippageBps: new BN(inputValue.maxSlippageBps ?? 100),
      maxQuoteAgeSecs: new BN(inputValue.maxQuoteAgeSecs ?? 300),
      maxCounterpartyRiskScore: inputValue.maxCounterpartyRiskScore ?? 70,
      bitcoinManualReviewThresholdUsd: new BN(
        inputValue.bitcoinManualReviewThresholdUsd ?? 5000,
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

export function buildRegisterDwalletArgs(inputValue: {
  chain: number;
  dwalletId: string;
  address: string;
  balanceUsd: number;
  dwalletAccount?: PublicKey | null;
  authorizedUserPubkey?: PublicKey | null;
  messageMetadataDigest?: string | null;
  publicKeyHex?: string | null;
}): RegisterDwalletArgs {
  validateDwalletId(inputValue.dwalletId);
  validateAddress(inputValue.address);
  validateAmountUsd(inputValue.balanceUsd);

  return {
    chain: inputValue.chain,
    dwalletId: inputValue.dwalletId,
    address: inputValue.address,
    balanceUsd: new BN(inputValue.balanceUsd),
    dwalletAccount: inputValue.dwalletAccount ?? null,
    authorizedUserPubkey: inputValue.authorizedUserPubkey ?? null,
    messageMetadataDigest: inputValue.messageMetadataDigest ?? null,
    publicKeyHex: inputValue.publicKeyHex ?? null,
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  };
}

export function buildProposeTransactionArgs(inputValue: {
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
  validateAmountUsd(inputValue.amountUsd);
  validateAddress(inputValue.recipient);

  return {
    amountUsd: new BN(inputValue.amountUsd),
    targetChain: inputValue.chain,
    txType: inputValue.txType,
    protocolId: inputValue.protocolId ?? null,
    currentTimestamp: new BN(Math.floor(Date.now() / 1000)),
    expectedOutputUsd:
      inputValue.expectedOutputUsd !== undefined ? new BN(inputValue.expectedOutputUsd) : null,
    actualOutputUsd:
      inputValue.actualOutputUsd !== undefined ? new BN(inputValue.actualOutputUsd) : null,
    quoteAgeSecs:
      inputValue.quoteAgeSecs !== undefined ? new BN(inputValue.quoteAgeSecs) : null,
    counterpartyRiskScore: inputValue.counterpartyRiskScore ?? null,
    recipientOrContract: inputValue.recipient,
  };
}

export function buildProposeConfidentialArgs(inputValue: {
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
  validateAmountUsd(inputValue.amountUsd);
  validateAddress(inputValue.recipient);

  return {
    amountUsd: new BN(inputValue.amountUsd),
    targetChain: inputValue.chain,
    txType: inputValue.txType,
    protocolId: inputValue.protocolId ?? null,
    currentTimestamp: new BN(Math.floor(Date.now() / 1000)),
    expectedOutputUsd:
      inputValue.expectedOutputUsd !== undefined ? new BN(inputValue.expectedOutputUsd) : null,
    actualOutputUsd:
      inputValue.actualOutputUsd !== undefined ? new BN(inputValue.actualOutputUsd) : null,
    quoteAgeSecs:
      inputValue.quoteAgeSecs !== undefined ? new BN(inputValue.quoteAgeSecs) : null,
    counterpartyRiskScore: inputValue.counterpartyRiskScore ?? null,
    recipientOrContract: inputValue.recipient,
  };
}

export function buildConfigureMultisigArgs(inputValue: {
  requiredSignatures: number;
  guardians: PublicKey[];
}): ConfigureMultisigArgs {
  validateGuardians(inputValue.guardians);
  validateMultisigThreshold(inputValue.requiredSignatures, inputValue.guardians.length);

  return {
    requiredSignatures: inputValue.requiredSignatures,
    guardians: inputValue.guardians,
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  };
}

export function buildConfigureSwarmArgs(inputValue: {
  swarmId: string;
  memberAgents: string[];
  sharedPoolLimitUsd: number;
}): ConfigureSwarmArgs {
  validateAgentId(inputValue.swarmId);
  validateSwarmMembers(inputValue.memberAgents);
  validateAmountUsd(inputValue.sharedPoolLimitUsd);

  return {
    swarmId: inputValue.swarmId,
    memberAgents: inputValue.memberAgents,
    sharedPoolLimitUsd: new BN(inputValue.sharedPoolLimitUsd),
    timestamp: new BN(Math.floor(Date.now() / 1000)),
  };
}
