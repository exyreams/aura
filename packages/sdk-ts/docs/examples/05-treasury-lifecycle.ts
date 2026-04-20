/**
 * Example: Full treasury lifecycle
 *
 * Demonstrates the complete flow: create → register dWallet → propose →
 * inspect → pause → cancel → unpause.
 */

import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Aura, AuraErrorCode, isAuraError } from "../../src/index.js";

const RPC_URL = process.env.AURA_RPC_URL ?? "https://api.devnet.solana.com";
const keypair = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf8")),
  ),
);

async function main() {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair });

  // 1. Create treasury
  console.log("creating treasury...");
  const { treasury } = await aura.treasury.create({
    agentId: `agent-${Date.now()}`,
    dailyLimitUsd: 10_000,
    perTxLimitUsd: 1_000,
  });
  console.log("treasury:", treasury.toBase58());

  // 2. Register a dWallet for Ethereum
  console.log("registering dWallet...");
  await aura.dwallet.register({
    treasury,
    chain: 2,
    dwalletId: "dwallet-eth-demo",
    address: "0x000000000000000000000000000000000000dead",
    balanceUsd: 5_000,
  });

  // 3. Inspect state
  let account = await aura.treasury.get(treasury);
  console.log("dWallets registered:", account.dwallets.length);
  console.log("execution paused:", account.executionPaused);

  // 4. Propose a transaction
  console.log("proposing transaction...");
  await aura.treasury.propose({
    treasury,
    amountUsd: 250,
    chain: 2,
    recipient: "0x000000000000000000000000000000000000dead",
  });

  account = await aura.treasury.get(treasury);
  if (account.pending !== null) {
    console.log("pending proposal:", account.pending.amountUsd.toString(), "USD cents");
  }

  // 5. Cancel the pending transaction
  console.log("cancelling pending...");
  await aura.treasury.cancel({ treasury });

  account = await aura.treasury.get(treasury);
  console.log("pending after cancel:", account.pending);  // null

  // 6. Pause execution
  console.log("pausing treasury...");
  await aura.treasury.pause({ treasury, paused: true });

  account = await aura.treasury.get(treasury);
  console.log("paused:", account.executionPaused);  // true

  // 7. Attempt to propose while paused (will fail)
  try {
    await aura.treasury.propose({
      treasury,
      amountUsd: 100,
      chain: 2,
      recipient: "0x000000000000000000000000000000000000dead",
    });
  } catch (error) {
    if (isAuraError(error, AuraErrorCode.ExecutionPaused)) {
      console.log("correctly rejected: treasury is paused");
    }
  }

  // 8. Unpause
  console.log("unpausing treasury...");
  await aura.treasury.pause({ treasury, paused: false });

  account = await aura.treasury.get(treasury);
  console.log("paused:", account.executionPaused);  // false

  // 9. Configure governance
  console.log("configuring multisig...");
  const guardian1 = Keypair.generate().publicKey;
  const guardian2 = Keypair.generate().publicKey;
  await aura.governance.configureMultisig({
    treasury,
    requiredSignatures: 1,
    guardians: [guardian1, guardian2],
  });

  account = await aura.treasury.get(treasury);
  console.log("guardians:", account.multisig?.guardians.length);

  console.log("done.");
}

main().catch(console.error);
