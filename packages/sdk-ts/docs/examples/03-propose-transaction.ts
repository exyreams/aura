/**
 * Example: Propose a transaction
 *
 * Submits a public (non-encrypted) transaction proposal. The policy engine
 * evaluates all rules synchronously on-chain.
 */

import BN from "bn.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Aura, AuraClient, AuraErrorCode, isAuraError } from "../../src/index.js";

const RPC_URL = process.env.AURA_RPC_URL ?? "https://api.devnet.solana.com";
const keypair = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf8")),
  ),
);
const treasury = new PublicKey("YourTreasuryPDA...");

// High-level

async function highLevel() {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair });

  // Simple ETH transfer
  const sig = await aura.treasury.propose({
    treasury,
    amountUsd: 500,
    chain: 2,                              // Ethereum
    recipient: "0xdeadbeef...",
  });
  console.log("proposed:", sig);

  // DeFi swap with slippage check
  await aura.treasury.propose({
    treasury,
    amountUsd: 1_000,
    chain: 2,
    recipient: "0xUniswapRouter...",
    txType: 1,                             // Swap
    protocolId: 0,                         // Uniswap
    expectedOutputUsd: 990,               // expected $990 out
    actualOutputUsd: 985,                 // actual $985 out (0.5% slippage)
    quoteAgeSecs: 15,                     // quote is 15 seconds old
  });

  // Bitcoin transfer (triggers manual review if > threshold)
  await aura.treasury.propose({
    treasury,
    amountUsd: 3_000,
    chain: 1,                              // Bitcoin
    recipient: "bc1qdeadbeef...",
  });

  // With a separate AI authority keypair
  const aiKeypair = Keypair.generate();
  await aura.treasury.propose({
    treasury,
    amountUsd: 250,
    chain: 2,
    recipient: "0xdeadbeef...",
    aiAuthority: aiKeypair,
  });
}

// Low-level

async function lowLevel() {
  const connection = new Connection(RPC_URL, "confirmed");
  const client = new AuraClient({ connection });
  const now = Math.floor(Date.now() / 1000);

  await client.proposeTransaction(
    keypair,
    { aiAuthority: keypair.publicKey, treasury },
    {
      amountUsd: new BN(500),
      targetChain: 2,
      txType: 0,
      protocolId: null,
      currentTimestamp: new BN(now),
      expectedOutputUsd: null,
      actualOutputUsd: null,
      quoteAgeSecs: null,
      counterpartyRiskScore: null,
      recipientOrContract: "0xdeadbeef...",
    },
  );
}

// Error handling

async function withErrorHandling() {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair });

  try {
    await aura.treasury.propose({
      treasury,
      amountUsd: 5_000,
      chain: 2,
      recipient: "0xdeadbeef...",
    });
  } catch (error) {
    if (isAuraError(error, AuraErrorCode.ExecutionPaused)) {
      console.error("treasury is paused — unpause it first");
      await aura.treasury.pause({ treasury, paused: false });
    } else if (isAuraError(error, AuraErrorCode.PendingTransactionExists)) {
      console.error("cancel the existing pending transaction first");
      await aura.treasury.cancel({ treasury });
    } else if (isAuraError(error, AuraErrorCode.DWalletNotConfigured)) {
      console.error("register a dWallet for chain 2 first");
    } else {
      throw error;
    }
  }
}

// Check result after proposal

async function checkResult() {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair });

  await aura.treasury.propose({
    treasury,
    amountUsd: 500,
    chain: 2,
    recipient: "0xdeadbeef...",
  });

  const account = await aura.treasury.get(treasury);

  if (account.pending !== null) {
    console.log("proposal accepted:");
    console.log("  amount:", account.pending.amountUsd.toString(), "USD cents");
    console.log("  chain:", account.pending.targetChain);
    console.log("  status:", account.pending.status);
  } else {
    console.log("proposal was rejected by the policy engine");
  }
}

highLevel().catch(console.error);
