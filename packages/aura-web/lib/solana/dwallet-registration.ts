"use client";

import {
  AuraClient,
  accounts,
  instructions,
  toBN,
  validateAddress,
  validateAgentId,
  validateAmountUsd,
  validateDwalletId,
} from "@aura-protocol/sdk-ts";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  type Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import type { Json, WalletRegistryRow } from "@/lib/supabase/types";

interface RegisterDWalletOnChainInput {
  connection: Connection;
  walletAdapter: WalletContextState;
  wallet: WalletRegistryRow;
  programId?: PublicKey;
}

interface ConfirmDWalletRegistrationInput {
  walletId: string;
  ownerAddress: string;
  signature: string;
}

export interface TreasuryLinkAgent {
  id: string;
  agentId: string;
  label: string;
  publicKey: string;
  treasuryPda: string | null;
}

interface CreateAgentTreasuryOnChainInput {
  connection: Connection;
  walletAdapter: WalletContextState;
  agent: TreasuryLinkAgent;
  programId?: PublicKey;
}

interface ConfirmAgentTreasuryLinkInput {
  agentSessionId: string;
  ownerAddress: string;
  treasuryPda: string;
  signature: string;
}

function metadataObject(metadata: Json): { [key: string]: Json | undefined } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
}

function metadataString(metadata: Json, key: string) {
  const value = metadataObject(metadata)[key];
  return typeof value === "string" ? value : null;
}

function metadataNestedString(metadata: Json, parent: string, key: string) {
  const value = metadataObject(metadata)[parent];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const nested = value[key];
  return typeof nested === "string" ? nested : null;
}

function optionalPublicKey(value: string | null, label: string) {
  if (!value) {
    return null;
  }

  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a valid Solana public key.`);
  }
}

export function getDWalletRegistrationBlocker(wallet: WalletRegistryRow) {
  if (wallet.status === "onchain_registered") {
    return "This dWallet is already registered on-chain.";
  }

  if (!wallet.treasury_pda) {
    return "This signer agent is not linked to an AURA treasury yet.";
  }

  if (!wallet.dwallet_id) {
    return "This wallet is missing a dWallet ID.";
  }

  return null;
}

export async function sendWalletInstructions(
  connection: Connection,
  walletAdapter: WalletContextState,
  instructionsList: Parameters<Transaction["add"]>,
) {
  if (!walletAdapter.publicKey) {
    throw new Error("Connect the owner wallet before linking this dWallet.");
  }

  if (!walletAdapter.sendTransaction) {
    throw new Error("The connected wallet cannot send Solana transactions.");
  }

  const transaction = new Transaction().add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
    ...instructionsList,
  );
  transaction.feePayer = walletAdapter.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  const simulation = await connection.simulateTransaction(transaction);

  if (simulation.value.err) {
    throw new Error(
      [
        `Preflight simulation failed: ${JSON.stringify(simulation.value.err)}`,
        ...(simulation.value.logs ?? []),
      ].join("\n"),
    );
  }

  const signature = await walletAdapter.sendTransaction(
    transaction,
    connection,
    { preflightCommitment: "confirmed" },
  );

  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  return signature;
}

function buildCreateTreasuryArgs(agent: TreasuryLinkAgent) {
  if (!agent.publicKey) {
    throw new Error(
      "This signer agent is missing its authority public key. Create a new signer agent or register the authority before binding a treasury.",
    );
  }

  validateAgentId(agent.agentId);
  validateAmountUsd(10_000);
  validateAmountUsd(2_500);

  return {
    agentId: agent.agentId,
    aiAuthority: new PublicKey(agent.publicKey),
    createdAt: toBN(Math.floor(Date.now() / 1000)),
    pendingTransactionTtlSecs: toBN(900),
    policyConfig: {
      dailyLimitUsd: toBN(10_000),
      perTxLimitUsd: toBN(2_500),
      daytimeHourlyLimitUsd: toBN(5_000),
      nighttimeHourlyLimitUsd: toBN(2_000),
      velocityLimitUsd: toBN(7_500),
      allowedProtocolBitmap: toBN(31),
      maxSlippageBps: toBN(100),
      maxQuoteAgeSecs: toBN(300),
      maxCounterpartyRiskScore: 70,
      bitcoinManualReviewThresholdUsd: toBN(5_000),
      sharedPoolLimitUsd: null,
      weeklyLimitUsd: null,
      monthlyLimitUsd: null,
      recipientLimits: [],
      cooldownConfig: null,
      anomalyConfig: null,
      reputationPolicy: {
        highScoreThreshold: toBN(80),
        mediumScoreThreshold: toBN(50),
        highMultiplierBps: toBN(15_000),
        lowMultiplierBps: toBN(7_000),
      },
      budgetEnvelopes: [],
      approvalLadder: null,
      scopedPauseEntries: [],
      livenessConfig: {
        requireEncryptFreshness: false,
        requireDwalletFreshness: false,
        requireBalanceOracleFreshness: false,
        requireComplianceOracleFreshness: false,
        maxStalenessSecs: toBN(300),
      },
      failureModes: {
        quoteFreshness: 0,
        counterpartyRisk: 0,
        slippage: 0,
        anomaly: 0,
        balanceOracleStale: 0,
        complianceOracle: 0,
        encryptLiveness: 0,
        dwalletLiveness: 0,
        maxFailOpenUsd: toBN(0),
        failOpenWindowSecs: toBN(0),
        failOpenBudgetUsd: toBN(0),
        failOpenMaxPerWindow: 0,
        staleFallbackLimitUsd: toBN(0),
      },
    },
    protocolFees: {
      treasuryCreationFeeUsd: toBN(100),
      transactionFeeBps: toBN(10),
      fheSubsidyBps: toBN(5_000),
    },
  };
}

export async function createAgentTreasuryOnChain({
  connection,
  walletAdapter,
  agent,
  programId,
}: CreateAgentTreasuryOnChainInput) {
  if (agent.treasuryPda) {
    return { treasuryPda: agent.treasuryPda, signature: null };
  }

  if (!walletAdapter.publicKey) {
    throw new Error("Connect the owner wallet before creating a treasury.");
  }

  const client = new AuraClient({ connection, programId });
  const prepared = accounts.createTreasuryInput({
    owner: walletAdapter.publicKey,
    args: buildCreateTreasuryArgs(agent),
    programId: client.programId,
  });
  const instruction = await instructions.treasury.createTreasury(
    client,
    prepared.input,
  );
  const signature = await sendWalletInstructions(connection, walletAdapter, [
    instruction,
  ]);

  return {
    treasuryPda: prepared.treasury.toBase58(),
    signature,
  };
}

export async function registerDWalletOnChain({
  connection,
  walletAdapter,
  wallet,
  programId,
}: RegisterDWalletOnChainInput) {
  const blocker = getDWalletRegistrationBlocker(wallet);
  if (blocker) {
    throw new Error(blocker);
  }

  if (!walletAdapter.publicKey) {
    throw new Error("Connect the owner wallet before linking this dWallet.");
  }

  const treasury = optionalPublicKey(wallet.treasury_pda, "AURA treasury");
  const dwalletAccount = optionalPublicKey(
    metadataNestedString(wallet.metadata, "dwallet", "dwallet_account") ??
      wallet.dwallet_state_pda,
    "dWallet account",
  );
  const authorizedUserPubkey = optionalPublicKey(
    metadataNestedString(wallet.metadata, "dwallet", "authorized_user_pubkey"),
    "Authorized user",
  );
  const messageMetadataDigest = metadataNestedString(
    wallet.metadata,
    "dwallet",
    "message_metadata_digest",
  );
  const publicKeyHex = metadataNestedString(
    wallet.metadata,
    "dwallet",
    "public_key_hex",
  );
  const dwalletId = wallet.dwallet_id ?? "";

  validateDwalletId(dwalletId);
  validateAddress(wallet.chain_address);

  if (!treasury) {
    throw new Error("This wallet is missing an AURA treasury PDA.");
  }

  const client = new AuraClient({ connection, programId });
  const instruction = await instructions.dwallet.registerDwallet(client, {
    accounts: {
      owner: walletAdapter.publicKey,
      treasury,
    },
    args: {
      chain: wallet.chain_id,
      dwalletId,
      address: wallet.chain_address,
      balanceUsd: toBN(0),
      dwalletAccount,
      authorizedUserPubkey,
      messageMetadataDigest,
      publicKeyHex,
      timestamp: toBN(Math.floor(Date.now() / 1000)),
    },
  });

  return sendWalletInstructions(connection, walletAdapter, [instruction]);
}

export async function confirmAgentTreasuryLink({
  agentSessionId,
  ownerAddress,
  treasuryPda,
  signature,
}: ConfirmAgentTreasuryLinkInput): Promise<TreasuryLinkAgent> {
  const response = await fetch(`/api/agents/${agentSessionId}/treasury`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerAddress, treasuryPda, signature }),
  });
  const payload = (await response.json()) as
    | {
        session: {
          id: string;
          agent_id: string;
          agent_label: string | null;
          treasury_pda: string | null;
          metadata: Json;
        };
      }
    | { error?: string };

  if (!response.ok || !("session" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Could not record AURA treasury binding.",
    );
  }

  const metadata = metadataObject(payload.session.metadata);
  const publicKey =
    typeof metadata.publicKey === "string"
      ? metadata.publicKey
      : typeof metadata.authority_public_key === "string"
        ? metadata.authority_public_key
        : "";

  return {
    id: payload.session.id,
    agentId: payload.session.agent_id,
    label: payload.session.agent_label ?? payload.session.agent_id,
    publicKey,
    treasuryPda: payload.session.treasury_pda,
  };
}

export async function confirmDWalletRegistration({
  walletId,
  ownerAddress,
  signature,
}: ConfirmDWalletRegistrationInput): Promise<WalletRegistryRow> {
  const response = await fetch(
    `/api/wallets/dwallets/${walletId}/registration`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerAddress, signature }),
    },
  );
  const payload = (await response.json()) as
    | { wallet: WalletRegistryRow }
    | { error?: string };

  if (!response.ok || !("wallet" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Could not record on-chain dWallet registration.",
    );
  }

  return payload.wallet;
}

export function registrationTxSignature(wallet: WalletRegistryRow) {
  return metadataString(wallet.metadata, "registration_tx_signature");
}
