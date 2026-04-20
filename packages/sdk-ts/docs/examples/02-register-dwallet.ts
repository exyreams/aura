/**
 * Example: Register a dWallet
 *
 * Registers an Ika dWallet reference on an existing treasury.
 * The dWallet must already exist on the Ika network.
 */

import BN from "bn.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Aura, AuraClient } from "../../src/index.js";

const RPC_URL = process.env.AURA_RPC_URL ?? "https://api.devnet.solana.com";
const keypair = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf8")),
  ),
);

// Assume treasury was already created
const treasury = new PublicKey("YourTreasuryPDA...");

// High-level

async function highLevel() {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair });

  // Register an Ethereum dWallet
  await aura.dwallet.register({
    treasury,
    chain: 2,                              // Ethereum
    dwalletId: "dwallet-eth-abc123",       // from Ika network
    address: "0xdeadbeef...",              // native ETH address
    balanceUsd: 5_000,                     // $5,000 current balance
  });

  // Register a Bitcoin dWallet
  await aura.dwallet.register({
    treasury,
    chain: 1,                              // Bitcoin
    dwalletId: "dwallet-btc-xyz789",
    address: "bc1qdeadbeef...",
    balanceUsd: 20_000,
  });

  // Register a Solana dWallet
  await aura.dwallet.register({
    treasury,
    chain: 0,                              // Solana
    dwalletId: "dwallet-sol-def456",
    address: "SoLAddReSS...",
    balanceUsd: 1_000,
  });
}

// Low-level

async function lowLevel() {
  const connection = new Connection(RPC_URL, "confirmed");
  const client = new AuraClient({ connection });
  const now = Math.floor(Date.now() / 1000);

  // Basic registration (no live Ika signing)
  await client.registerDwallet(
    keypair,
    { owner: keypair.publicKey, treasury },
    {
      chain: 2,
      dwalletId: "dwallet-eth-abc123",
      address: "0xdeadbeef...",
      balanceUsd: new BN(5_000),
      dwalletAccount: null,
      authorizedUserPubkey: null,
      messageMetadataDigest: null,
      publicKeyHex: null,
      timestamp: new BN(now),
    },
  );

  // With live Ika signing metadata
  await client.registerDwallet(
    keypair,
    { owner: keypair.publicKey, treasury },
    {
      chain: 2,
      dwalletId: "dwallet-eth-live",
      address: "0xdeadbeef...",
      balanceUsd: new BN(5_000),
      // These fields enable live dWallet co-signing via Ika
      dwalletAccount: new PublicKey("IkaDWalletAccountPDA..."),
      authorizedUserPubkey: new PublicKey("AuthorizedUserPubkey..."),
      messageMetadataDigest: "abcdef1234567890...",  // hex-encoded
      publicKeyHex: "04deadbeef...",                  // uncompressed pubkey
      timestamp: new BN(now),
    },
  );
}

// Verify registration

async function verifyRegistration() {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair });

  const account = await aura.treasury.get(treasury);
  console.log("registered dWallets:", account.dwallets.length);

  for (const dw of account.dwallets) {
    console.log(`  chain=${dw.chain} id=${dw.dwalletId} address=${dw.address}`);
  }
}

highLevel().catch(console.error);
