/**
 * Example: Governance — multisig and swarm configuration
 *
 * Shows how to configure emergency guardian multisig and agent swarms.
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
const treasury = new PublicKey("YourTreasuryPDA...");

// Multisig — high-level

async function configureMultisigHighLevel() {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair });

  const guardian1 = new PublicKey("Guardian1PubKey...");
  const guardian2 = new PublicKey("Guardian2PubKey...");
  const guardian3 = new PublicKey("Guardian3PubKey...");

  // 2-of-3 multisig
  await aura.governance.configureMultisig({
    treasury,
    requiredSignatures: 2,
    guardians: [guardian1, guardian2, guardian3],
  });

  console.log("multisig configured: 2-of-3");
}

// Multisig — low-level

async function configureMultisigLowLevel() {
  const connection = new Connection(RPC_URL, "confirmed");
  const client = new AuraClient({ connection });
  const now = Math.floor(Date.now() / 1000);

  const guardian1 = new PublicKey("Guardian1PubKey...");
  const guardian2 = new PublicKey("Guardian2PubKey...");

  await client.configureMultisig(
    keypair,
    { owner: keypair.publicKey, treasury },
    {
      requiredSignatures: 1,
      guardians: [guardian1, guardian2],
      timestamp: new BN(now),
    },
  );
}

// Emergency override flow

async function emergencyOverrideFlow() {
  const connection = new Connection(RPC_URL, "confirmed");
  const client = new AuraClient({ connection });
  const now = Math.floor(Date.now() / 1000);

  const guardian1 = Keypair.generate(); // would be real guardian keypairs
  const guardian2 = Keypair.generate();

  // Step 1: Guardian 1 proposes raising the daily limit to $20,000
  await client.proposeOverride(
    guardian1,
    { guardian: guardian1.publicKey, treasury },
    new BN(20_000),  // new daily limit
    now,
  );
  console.log("override proposed by guardian1");

  // Step 2: Guardian 2 co-signs (reaches quorum for 2-of-2)
  await client.collectOverrideSignature(
    guardian2,
    { guardian: guardian2.publicKey, treasury },
    now,
  );
  console.log("override co-signed by guardian2 — quorum reached");
}

// Swarm — high-level

async function configureSwarmHighLevel() {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair });

  // Three agents share a $50,000 collective pool
  await aura.governance.configureSwarm({
    treasury,
    swarmId: "trading-swarm-alpha",
    memberAgents: ["agent-1", "agent-2", "agent-3"],
    sharedPoolLimitUsd: 50_000,
  });

  console.log("swarm configured: 3 agents, $50,000 shared pool");
}

// Swarm — low-level

async function configureSwarmLowLevel() {
  const connection = new Connection(RPC_URL, "confirmed");
  const client = new AuraClient({ connection });
  const now = Math.floor(Date.now() / 1000);

  await client.configureSwarm(
    keypair,
    { owner: keypair.publicKey, treasury },
    {
      swarmId: "trading-swarm-beta",
      memberAgents: ["agent-4", "agent-5"],
      sharedPoolLimitUsd: new BN(25_000),
      timestamp: new BN(now),
    },
  );
}

// Verify governance state

async function verifyGovernanceState() {
  const aura = new Aura({ rpcUrl: RPC_URL, keypair });
  const account = await aura.treasury.get(treasury);

  if (account.multisig !== null) {
    console.log("multisig:");
    console.log("  required:", account.multisig.requiredSignatures);
    console.log("  guardians:", account.multisig.guardians.length);
    console.log(
      "  pending override:",
      account.multisig.pendingOverride !== null ? "yes" : "none",
    );
  }

  if (account.swarm !== null) {
    console.log("swarm:");
    console.log("  id:", account.swarm.swarmId);
    console.log("  members:", account.swarm.memberAgents.length);
    console.log("  pool limit:", account.swarm.sharedPoolLimitUsd.toString());
    console.log("  total spent:", account.swarm.totalSwarmSpentUsd.toString());
  }
}

configureMultisigHighLevel().catch(console.error);
