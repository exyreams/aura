/**
 * Input validation helpers for the AURA SDK.
 *
 * These functions mirror the validation logic in the Rust SDK and the
 * on-chain program. Use them to catch invalid inputs before submitting
 * transactions and wasting SOL on failed preflight checks.
 */

import type { PublicKey } from "@solana/web3.js";

/** Maximum byte length of an agent ID string. */
export const MAX_AGENT_ID_LEN = 64;

/** Maximum byte length of a dWallet ID string. */
export const MAX_DWALLET_ID_LEN = 64;

/** Maximum byte length of a blockchain address string. */
export const MAX_ADDRESS_LEN = 128;

/** Maximum number of guardians in an emergency multisig. */
export const MAX_GUARDIANS = 10;

/** Maximum number of members in an agent swarm. */
export const MAX_SWARM_MEMBERS = 16;

/** Maximum byte length of a swarm ID string. */
export const MAX_SWARM_ID_LEN = 64;

/** Maximum byte length of a swarm member agent ID string. */
export const MAX_SWARM_MEMBER_LEN = 64;

/**
 * Validates that an `agentId` is non-empty and within the maximum length.
 *
 * @throws if the agent ID is empty or exceeds `MAX_AGENT_ID_LEN` bytes.
 */
export function validateAgentId(agentId: string): void {
  if (agentId.length === 0) {
    throw new Error("agentId must not be empty");
  }
  const byteLength = Buffer.byteLength(agentId, "utf8");
  if (byteLength > MAX_AGENT_ID_LEN) {
    throw new Error(
      `agentId exceeds maximum length of ${MAX_AGENT_ID_LEN} bytes (got ${byteLength})`,
    );
  }
}

/**
 * Validates that a `dwalletId` is non-empty and within the maximum length.
 *
 * @throws if the dWallet ID is empty or exceeds `MAX_DWALLET_ID_LEN` bytes.
 */
export function validateDwalletId(dwalletId: string): void {
  if (dwalletId.length === 0) {
    throw new Error("dwalletId must not be empty");
  }
  const byteLength = Buffer.byteLength(dwalletId, "utf8");
  if (byteLength > MAX_DWALLET_ID_LEN) {
    throw new Error(
      `dwalletId exceeds maximum length of ${MAX_DWALLET_ID_LEN} bytes (got ${byteLength})`,
    );
  }
}

/**
 * Validates that a blockchain address string is non-empty and within the maximum length.
 *
 * @throws if the address is empty or exceeds `MAX_ADDRESS_LEN` bytes.
 */
export function validateAddress(address: string): void {
  if (address.length === 0) {
    throw new Error("address must not be empty");
  }
  const byteLength = Buffer.byteLength(address, "utf8");
  if (byteLength > MAX_ADDRESS_LEN) {
    throw new Error(
      `address exceeds maximum length of ${MAX_ADDRESS_LEN} bytes (got ${byteLength})`,
    );
  }
}

/**
 * Validates that a transaction amount is greater than zero.
 *
 * @throws if `amountUsd` is zero.
 */
export function validateAmountUsd(amountUsd: number | bigint): void {
  if (amountUsd <= 0) {
    throw new Error("amountUsd must be greater than zero");
  }
}

/**
 * Validates that a multisig threshold is valid for the given guardian count.
 *
 * @throws if `threshold` is zero or exceeds `guardianCount`.
 */
export function validateMultisigThreshold(
  threshold: number,
  guardianCount: number,
): void {
  if (threshold === 0) {
    throw new Error("multisig threshold must be greater than zero");
  }
  if (threshold > guardianCount) {
    throw new Error(
      `multisig threshold (${threshold}) must not exceed guardian count (${guardianCount})`,
    );
  }
}

/**
 * Validates that a guardian list is non-empty and within the maximum count.
 *
 * @throws if the list is empty or exceeds `MAX_GUARDIANS`.
 */
export function validateGuardians(guardians: readonly PublicKey[]): void {
  if (guardians.length === 0) {
    throw new Error("guardians list must not be empty");
  }
  if (guardians.length > MAX_GUARDIANS) {
    throw new Error(
      `guardians list exceeds maximum of ${MAX_GUARDIANS} (got ${guardians.length})`,
    );
  }
}

/**
 * Validates that a swarm ID is non-empty and within the maximum length.
 *
 * @throws if the swarm ID is empty or exceeds `MAX_SWARM_ID_LEN` bytes.
 */
export function validateSwarmId(swarmId: string): void {
  if (swarmId.length === 0) {
    throw new Error("swarmId must not be empty");
  }
  const byteLength = Buffer.byteLength(swarmId, "utf8");
  if (byteLength > MAX_SWARM_ID_LEN) {
    throw new Error(
      `swarmId exceeds maximum length of ${MAX_SWARM_ID_LEN} bytes (got ${byteLength})`,
    );
  }
}

/**
 * Validates that a swarm member list is non-empty, within the maximum count,
 * and that each member agent ID is within `MAX_SWARM_MEMBER_LEN` bytes.
 *
 * @throws if the list is empty, exceeds `MAX_SWARM_MEMBERS`, or any member ID
 *   exceeds the maximum length.
 */
export function validateSwarmMembers(members: readonly string[]): void {
  if (members.length === 0) {
    throw new Error("swarm members list must not be empty");
  }
  if (members.length > MAX_SWARM_MEMBERS) {
    throw new Error(
      `swarm members list exceeds maximum of ${MAX_SWARM_MEMBERS} (got ${members.length})`,
    );
  }
  for (const member of members) {
    const byteLength = Buffer.byteLength(member, "utf8");
    if (byteLength > MAX_SWARM_MEMBER_LEN) {
      throw new Error(
        `swarm member "${member}" exceeds maximum length of ${MAX_SWARM_MEMBER_LEN} bytes (got ${byteLength})`,
      );
    }
  }
}
