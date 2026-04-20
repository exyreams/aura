/**
 * Example: Create a treasury
 *
 * Shows both the high-level Aura facade and the low-level AuraClient.
 * Run against devnet with a funded keypair.
 */

import BN from "bn.js";
import { Connection, Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Aura, AuraClient } from "../../src/index.js";

const RPC_URL = process.env.AURA_RPC_URL ?? "https://api.devnet.solana.com";
const keypairPath = join(homedir(), ".config", "solana", "id.json");
const keypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(keypairPath, "utf8"))),
);

// High-level (recommended)

async function highLevel() {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair });

  // Minimal — only required fields
  const { treasury, signature } = await aura.treasury.create({
    agentId: "trading-agent-1",
    dailyLimitUsd: 10_000,
    perTxLimitUsd: 1_000,
  });

  console.log("treasury:", treasury.toBase58());
  console.log("tx:", signature);

  // Full options
  const { treasury: treasury2 } = await aura.treasury.create({
    agentId: "trading-agent-2",
    dailyLimitUsd: 50_000,
    perTxLimitUsd: 5_000,
    daytimeHourlyLimitUsd: 10_000,
    nighttimeHourlyLimitUsd: 2_000,
    velocityLimitUsd: 25_000,
    allowedProtocolBitmap: 0b00010111, // Uniswap, Aave, Compound, Curve
    maxSlippageBps: 50,                // 0.5%
    maxQuoteAgeSecs: 60,               // 1 minute
    maxCounterpartyRiskScore: 50,
    bitcoinManualReviewThresholdUsd: 10_000,
    pendingTransactionTtlSecs: 1800,   // 30 minutes
  });

  console.log("treasury2:", treasury2.toBase58());
}

// Low-level (full control)

async function lowLevel() {
  const connection = new Connection(RPC_URL, "confirmed");
  const client = new AuraClient({ connection });
  const now = Math.floor(Date.now() / 1000);

  const { treasury, signature } = await client.createTreasury(keypair, {
    agentId: "trading-agent-3",
    aiAuthority: keypair.publicKey,
    createdAt: new BN(now),
    pendingTransactionTtlSecs: new BN(900),
    policyConfig: {
      dailyLimitUsd: new BN(10_000),
      perTxLimitUsd: new BN(1_000),
      daytimeHourlyLimitUsd: new BN(2_500),
      nighttimeHourlyLimitUsd: new BN(500),
      velocityLimitUsd: new BN(5_000),
      allowedProtocolBitmap: new BN(31),
      maxSlippageBps: new BN(100),
      maxQuoteAgeSecs: new BN(300),
      maxCounterpartyRiskScore: 70,
      bitcoinManualReviewThresholdUsd: new BN(5_000),
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
  });

  console.log("treasury:", treasury.toBase58());
  console.log("tx:", signature);
}

// Build instruction only (no send)

async function buildOnly() {
  const connection = new Connection(RPC_URL, "confirmed");
  const client = new AuraClient({ connection });
  const now = Math.floor(Date.now() / 1000);

  const { treasury, instruction } = await client.createTreasuryInstruction({
    owner: keypair.publicKey,
    args: {
      agentId: "trading-agent-4",
      aiAuthority: keypair.publicKey,
      createdAt: new BN(now),
      pendingTransactionTtlSecs: new BN(900),
      policyConfig: {
        dailyLimitUsd: new BN(10_000),
        perTxLimitUsd: new BN(1_000),
        daytimeHourlyLimitUsd: new BN(2_500),
        nighttimeHourlyLimitUsd: new BN(500),
        velocityLimitUsd: new BN(5_000),
        allowedProtocolBitmap: new BN(31),
        maxSlippageBps: new BN(100),
        maxQuoteAgeSecs: new BN(300),
        maxCounterpartyRiskScore: 70,
        bitcoinManualReviewThresholdUsd: new BN(5_000),
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
    },
  });

  // Compose with other instructions before sending
  const sig = await client.sendInstructions(keypair, [instruction]);
  console.log("treasury:", treasury.toBase58(), "tx:", sig);
}

highLevel().catch(console.error);
