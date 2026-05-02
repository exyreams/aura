/** Policy simulation, receipt, attestation, and history instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `simulate_policy`. */
export function simulatePolicyInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["simulatePolicyInstruction"]>
): ReturnType<AuraClient["simulatePolicyInstruction"]> {
  return client.simulatePolicyInstruction(...args);
}

/** Builds `write_policy_receipt`. */
export function writePolicyReceiptInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["writePolicyReceiptInstruction"]>
): ReturnType<AuraClient["writePolicyReceiptInstruction"]> {
  return client.writePolicyReceiptInstruction(...args);
}

/** Builds `apply_policy_preset`. */
export function applyPolicyPresetInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["applyPolicyPresetInstruction"]>
): ReturnType<AuraClient["applyPolicyPresetInstruction"]> {
  return client.applyPolicyPresetInstruction(...args);
}

/** Builds `attest_policy`. */
export function attestPolicyInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["attestPolicyInstruction"]>
): ReturnType<AuraClient["attestPolicyInstruction"]> {
  return client.attestPolicyInstruction(...args);
}

/** Builds `check_invariants`. */
export function checkInvariantsInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["checkInvariantsInstruction"]>
): ReturnType<AuraClient["checkInvariantsInstruction"]> {
  return client.checkInvariantsInstruction(...args);
}

/** Builds `check_policy_cpi`. */
export function checkPolicyCpiInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["checkPolicyCpiInstruction"]>
): ReturnType<AuraClient["checkPolicyCpiInstruction"]> {
  return client.checkPolicyCpiInstruction(...args);
}

/** Builds `init_policy_history`. */
export function initPolicyHistoryInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["initPolicyHistoryInstruction"]>
): ReturnType<AuraClient["initPolicyHistoryInstruction"]> {
  return client.initPolicyHistoryInstruction(...args);
}

/** Builds `record_policy_snapshot`. */
export function recordPolicySnapshotInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["recordPolicySnapshotInstruction"]>
): ReturnType<AuraClient["recordPolicySnapshotInstruction"]> {
  return client.recordPolicySnapshotInstruction(...args);
}

/** Builds `close_policy_history`. */
export function closePolicyHistoryInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["closePolicyHistoryInstruction"]>
): ReturnType<AuraClient["closePolicyHistoryInstruction"]> {
  return client.closePolicyHistoryInstruction(...args);
}
