import { and, eq } from "drizzle-orm";
import { Keypair } from "@solana/web3.js";

import type { AuthenticatedUser } from "../auth/index.js";
import { db } from "../db/client.js";
import {
  agentKeypairs,
  dkgSessions,
  treasuries,
  type AgentKeypairRecord,
  type TreasuryRecord,
} from "../db/schema.js";
import { ApiError } from "../errors.js";
import { decryptSecretKey, encryptSecretKey, zeroSecretKey } from "../auth/security.js";
import type { DKGAttestation } from "../ika/grpc.js";

export interface AgentIdentity {
  agentId: string;
  publicKey: string;
  label: string;
  createdAt: number;
}

export interface AgentSignerRecord {
  id: number;
  agentId: string;
  label: string;
  publicKey: string;
}

function nowSecs() {
  return Math.floor(Date.now() / 1000);
}

function normalizeAgentId(value: string) {
  const agentId = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(agentId)) {
    throw new ApiError(
      400,
      "INVALID_AGENT_ID",
      "agentId must be 1-64 characters and use letters, numbers, dashes, or underscores.",
    );
  }
  return agentId;
}

function publicAgent(record: AgentKeypairRecord) {
  return {
    id: record.id,
    agentId: record.agentId,
    label: record.label,
    publicKey: record.publicKey,
    createdAt: record.createdAt,
  };
}

export function createAgentKeypair(
  user: AuthenticatedUser,
  input: { agentId: string; label?: string },
) {
  const agentId = normalizeAgentId(input.agentId);
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const encrypted = encryptSecretKey(keypair.secretKey);
  zeroSecretKey(keypair.secretKey);
  try {
    const created = db
      .insert(agentKeypairs)
      .values({
        userId: user.id,
        agentId,
        label: input.label?.trim() || agentId,
        publicKey,
        encryptedSecretKey: encrypted.encryptedSecretKey,
        encryptionIv: encrypted.encryptionIv,
        createdAt: nowSecs(),
      })
      .returning()
      .get();
    return {
      agent: publicAgent(created),
      identity: identityForAgent(created),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new ApiError(409, "AGENT_EXISTS", `Agent '${agentId}' already exists.`);
    }
    throw error;
  }
}

export function listAgentKeypairs(user: AuthenticatedUser) {
  return db
    .select()
    .from(agentKeypairs)
    .where(eq(agentKeypairs.userId, user.id))
    .all()
    .map(publicAgent);
}

export function getAgentKeypairByAgentId(user: AuthenticatedUser, agentId: string) {
  const record = db
    .select()
    .from(agentKeypairs)
    .where(
      and(
        eq(agentKeypairs.userId, user.id),
        eq(agentKeypairs.agentId, normalizeAgentId(agentId)),
      ),
    )
    .get();
  if (!record) {
    throw new ApiError(404, "AGENT_NOT_FOUND", `Agent '${agentId}' was not found.`);
  }
  return record;
}

export function getAgentKeypairById(user: AuthenticatedUser, id: number) {
  const record = db
    .select()
    .from(agentKeypairs)
    .where(and(eq(agentKeypairs.userId, user.id), eq(agentKeypairs.id, id)))
    .get();
  if (!record) {
    throw new ApiError(404, "AGENT_NOT_FOUND", `Agent ${id} was not found.`);
  }
  return record;
}

export function deleteAgentKeypair(user: AuthenticatedUser, id: number) {
  getAgentKeypairById(user, id);
  db.delete(agentKeypairs)
    .where(and(eq(agentKeypairs.userId, user.id), eq(agentKeypairs.id, id)))
    .run();
  return { deleted: true, id };
}

export function identityForAgent(record: AgentKeypairRecord): AgentIdentity {
  return {
    agentId: record.agentId,
    publicKey: record.publicKey,
    label: record.label,
    createdAt: record.createdAt,
  };
}

export async function withAgentSigner<T>(
  user: AuthenticatedUser,
  agentId: string,
  fn: (keypair: Keypair, agent: AgentSignerRecord) => Promise<T>,
) {
  const record = getAgentKeypairByAgentId(user, agentId);
  const decrypted = decryptSecretKey(record);
  const secretKey = Uint8Array.from(decrypted);
  const keypair = Keypair.fromSecretKey(secretKey);
  try {
    return await fn(keypair, {
      id: record.id,
      agentId: record.agentId,
      label: record.label,
      publicKey: record.publicKey,
    });
  } finally {
    decrypted.fill(0);
    secretKey.fill(0);
    zeroSecretKey(keypair.secretKey);
  }
}

export function ensureTreasuryRecord(input: {
  agent: AgentSignerRecord | AgentKeypairRecord;
  treasuryAddress: string;
  agentId?: string;
}): TreasuryRecord {
  const now = nowSecs();
  const existing = db
    .select()
    .from(treasuries)
    .where(eq(treasuries.treasuryAddress, input.treasuryAddress))
    .get();
  if (existing) {
    if (existing.agentKeypairId !== input.agent.id) {
      throw new ApiError(403, "TREASURY_FORBIDDEN", "Treasury belongs to a different agent.");
    }
    return existing;
  }
  return db
    .insert(treasuries)
    .values({
      agentKeypairId: input.agent.id,
      treasuryAddress: input.treasuryAddress,
      agentId: input.agentId ?? input.agent.agentId,
      createdAt: now,
    })
    .returning()
    .get();
}

export function getTreasuryRecordForAgent(input: {
  agent: AgentSignerRecord | AgentKeypairRecord;
  treasuryAddress: string;
}) {
  const record = db
    .select()
    .from(treasuries)
    .where(
      and(
        eq(treasuries.agentKeypairId, input.agent.id),
        eq(treasuries.treasuryAddress, input.treasuryAddress),
      ),
    )
    .get();
  if (!record) {
    return ensureTreasuryRecord({
      agent: input.agent,
      treasuryAddress: input.treasuryAddress,
    });
  }
  return record;
}

function toHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
}

function fromHex(hex: string) {
  return new Uint8Array(Buffer.from(hex, "hex"));
}

export function storeDkgSession(input: {
  agent: AgentSignerRecord | AgentKeypairRecord;
  dwalletAddress: string;
  sessionIdentifier: Uint8Array;
  dkgAttestation: DKGAttestation;
}) {
  db.insert(dkgSessions)
    .values({
      agentKeypairId: input.agent.id,
      dwalletAddress: input.dwalletAddress,
      sessionIdentifier: toHex(input.sessionIdentifier),
      attestationData: toHex(input.dkgAttestation.attestationData),
      networkSignature: toHex(input.dkgAttestation.networkSignature),
      networkPubkey: toHex(input.dkgAttestation.networkPubkey),
      epoch: input.dkgAttestation.epoch.toString(),
      createdAt: nowSecs(),
    })
    .onConflictDoUpdate({
      target: dkgSessions.dwalletAddress,
      set: {
        agentKeypairId: input.agent.id,
        sessionIdentifier: toHex(input.sessionIdentifier),
        attestationData: toHex(input.dkgAttestation.attestationData),
        networkSignature: toHex(input.dkgAttestation.networkSignature),
        networkPubkey: toHex(input.dkgAttestation.networkPubkey),
        epoch: input.dkgAttestation.epoch.toString(),
      },
    })
    .run();
}

export function getDkgSession(input: {
  agent: AgentSignerRecord | AgentKeypairRecord;
  dwalletAddress: string;
}) {
  const record = db
    .select()
    .from(dkgSessions)
    .where(
      and(
        eq(dkgSessions.agentKeypairId, input.agent.id),
        eq(dkgSessions.dwalletAddress, input.dwalletAddress),
      ),
    )
    .get();
  if (!record) {
    return undefined;
  }
  return {
    sessionIdentifier: fromHex(record.sessionIdentifier),
    dkgAttestation: {
      attestationData: fromHex(record.attestationData),
      networkSignature: fromHex(record.networkSignature),
      networkPubkey: fromHex(record.networkPubkey),
      epoch: BigInt(record.epoch),
    } satisfies DKGAttestation,
  };
}
