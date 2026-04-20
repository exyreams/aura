/**
 * Example: AI trading agent integration
 *
 * Shows how an autonomous AI agent would use the AURA SDK to propose
 * transactions based on market analysis, with encrypted guardrails
 * enforcing spending limits without revealing them on-chain.
 */

import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Aura, AuraErrorCode, isAuraError } from "../../src/index.js";

const RPC_URL = process.env.AURA_RPC_URL ?? "https://api.devnet.solana.com";

// The AI agent's signing keypair — separate from the treasury owner
const agentKeypair = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf8")),
  ),
);

async function setupTreasury() {
  const ownerKeypair = agentKeypair; // in production, owner and AI authority are separate
  const aura = new Aura({ rpcUrl: RPC_URL, keypair: ownerKeypair });

  // Create treasury with conservative limits for a new agent
  const { treasury } = await aura.treasury.create({
    agentId: "trading-bot-v1",
    dailyLimitUsd: 10_000,
    perTxLimitUsd: 1_000,
    maxSlippageBps: 100,           // 1% max slippage
    allowedProtocolBitmap: 0b111,  // Uniswap + Aave + Compound only
    aiAuthority: agentKeypair.publicKey,
  });

  // Register Ethereum dWallet for trading
  await aura.dwallet.register({
    treasury,
    chain: 2,
    dwalletId: "dwallet-eth-trading",
    address: "0xAgentEthAddress...",
    balanceUsd: 10_000,
  });

  return treasury;
}

interface MarketSignal {
  action: "buy" | "sell" | "hold";
  asset: string;
  chain: number;
  amountUsd: number;
  recipient: string;
  protocolId?: number;
  expectedOutputUsd?: number;
}

async function analyzeMarket(): Promise<MarketSignal> {
  // In a real agent, this would call an LLM or trading model.
  return {
    action: "buy",
    asset: "ETH",
    chain: 2,
    amountUsd: 500,
    recipient: "0xUniswapRouter...",
    protocolId: 0,           // Uniswap
    expectedOutputUsd: 495,
  };
}

async function executeTradingCycle(treasury: import("@solana/web3.js").PublicKey) {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair: agentKeypair });

  const signal = await analyzeMarket();

  if (signal.action === "hold") {
    console.log("AI decision: hold — no trade");
    return;
  }

  console.log(`AI decision: ${signal.action} ${signal.asset} for $${signal.amountUsd}`);

  const account = await aura.treasury.get(treasury);

  if (account.executionPaused) {
    console.log("treasury is paused — skipping trade");
    return;
  }

  if (account.pending !== null) {
    console.log("pending transaction exists — waiting for resolution");
    return;
  }

  try {
    const sig = await aura.treasury.propose({
      treasury,
      amountUsd: signal.amountUsd,
      chain: signal.chain,
      recipient: signal.recipient,
      txType: 1,                          // Swap
      protocolId: signal.protocolId,
      expectedOutputUsd: signal.expectedOutputUsd,
    });

    console.log("proposal submitted:", sig);

    const updated = await aura.treasury.get(treasury);

    if (updated.pending !== null) {
      console.log("proposal accepted by policy engine");
      console.log("  amount:", updated.pending.amountUsd.toString(), "USD cents");
      console.log("  status:", updated.pending.status);
    } else {
      console.log("proposal rejected by policy engine");
    }
  } catch (error) {
    if (isAuraError(error, AuraErrorCode.ExecutionPaused)) {
      console.log("rejected: treasury paused");
    } else if (isAuraError(error, AuraErrorCode.PendingTransactionExists)) {
      console.log("rejected: pending transaction already exists");
    } else if (isAuraError(error, AuraErrorCode.DWalletNotConfigured)) {
      console.log("rejected: no dWallet registered for this chain");
    } else {
      console.error("unexpected error:", error);
    }
  }
}

async function main() {
  console.log("setting up treasury...");
  const treasury = await setupTreasury();
  console.log("treasury:", treasury.toBase58());

  console.log("\nrunning trading cycle...");
  await executeTradingCycle(treasury);
}

main().catch(console.error);
