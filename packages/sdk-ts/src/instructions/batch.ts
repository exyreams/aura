/** Batch simulation and proposal instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `propose_batch`. */
export function proposeBatchInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["proposeBatchInstruction"]>
): ReturnType<AuraClient["proposeBatchInstruction"]> {
  return client.proposeBatchInstruction(...args);
}
