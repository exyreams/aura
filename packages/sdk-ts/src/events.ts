/**
 * On-chain event types for the AURA program.
 *
 * All events are defined in the Anchor IDL and emitted by the program after
 * state-mutating instructions. Consumers can subscribe to these events via
 * `connection.onLogs()` or parse them from transaction logs using the Anchor
 * `EventParser`.
 *
 * Note: Anchor's `IdlEvents` keys events in camelCase matching the IDL.
 */

import type { IdlEvents } from "@coral-xyz/anchor";
import type { AuraCore } from "./generated/aura_core.js";

/** All event types defined in the `aura-core` program, keyed by camelCase name. */
export type AuraEvents = IdlEvents<AuraCore>;

/**
 * Emitted once per audit event after every instruction that mutates treasury state.
 * Clients and indexers subscribe to this event to build an off-chain audit log.
 */
export type TreasuryAuditEvent = AuraEvents["treasuryAuditEvent"];

/**
 * Emitted after every proposal state change (propose, execute, deny, cancel, expire).
 * Allows clients to track proposal lifecycle without polling the account.
 */
export type ProposalLifecycleEvent = AuraEvents["proposalLifecycleEvent"];

/**
 * Emitted after `finalize_execution` completes.
 * Carries the full execution outcome including signature and decryption
 * account references for off-chain verification.
 */
export type ExecutionLifecycleEvent = AuraEvents["executionLifecycleEvent"];

/**
 * Event discriminators for filtering raw transaction logs.
 * These are the 8-byte prefixes Anchor uses to identify event types.
 */
export const EventDiscriminator = {
  treasuryAuditEvent: Buffer.from([209, 27, 57, 147, 169, 125, 166, 58]),
  proposalLifecycleEvent: Buffer.from([198, 23, 28, 210, 232, 47, 7, 199]),
  executionLifecycleEvent: Buffer.from([170, 155, 187, 106, 242, 102, 71, 103]),
} as const;

/**
 * Checks if raw event data starts with the given discriminator.
 *
 * @param data          The raw event data buffer.
 * @param discriminator The 8-byte event discriminator.
 */
export function matchesEventDiscriminator(
  data: Buffer,
  discriminator: Buffer,
): boolean {
  if (data.length < 8) {
    return false;
  }
  return data.subarray(0, 8).equals(discriminator);
}
