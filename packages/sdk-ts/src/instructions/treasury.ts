/** Treasury lifecycle instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `create_treasury`. */
export function createTreasuryInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["createTreasuryInstruction"]>
): ReturnType<AuraClient["createTreasuryInstruction"]> {
  return client.createTreasuryInstruction(...args);
}

/** Builds `pause_execution`. */
export function pauseExecutionInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["pauseExecutionInstruction"]>
): ReturnType<AuraClient["pauseExecutionInstruction"]> {
  return client.pauseExecutionInstruction(...args);
}

/** Builds `cancel_pending`. */
export function cancelPendingInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["cancelPendingInstruction"]>
): ReturnType<AuraClient["cancelPendingInstruction"]> {
  return client.cancelPendingInstruction(...args);
}
