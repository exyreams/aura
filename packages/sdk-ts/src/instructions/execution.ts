/** Proposal execution instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `propose_transaction`. */
export function proposeTransactionInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["proposeTransactionInstruction"]>
): ReturnType<AuraClient["proposeTransactionInstruction"]> {
  return client.proposeTransactionInstruction(...args);
}

/** Builds `execute_pending`. */
export function executePendingInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["executePendingInstruction"]>
): ReturnType<AuraClient["executePendingInstruction"]> {
  return client.executePendingInstruction(...args);
}

/** Builds `finalize_execution`. */
export function finalizeExecutionInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["finalizeExecutionInstruction"]>
): ReturnType<AuraClient["finalizeExecutionInstruction"]> {
  return client.finalizeExecutionInstruction(...args);
}

/** Builds `approve_pending_execution`. */
export function approvePendingExecutionInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["approvePendingExecutionInstruction"]>
): ReturnType<AuraClient["approvePendingExecutionInstruction"]> {
  return client.approvePendingExecutionInstruction(...args);
}
