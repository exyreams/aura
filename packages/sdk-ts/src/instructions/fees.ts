/** Protocol fee vault instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `init_fee_vault`. */
export function initFeeVaultInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["initFeeVaultInstruction"]>
): ReturnType<AuraClient["initFeeVaultInstruction"]> {
  return client.initFeeVaultInstruction(...args);
}

/** Builds `collect_fees`. */
export function collectFeesInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["collectFeesInstruction"]>
): ReturnType<AuraClient["collectFeesInstruction"]> {
  return client.collectFeesInstruction(...args);
}

/** Builds `close_fee_vault`. */
export function closeFeeVaultInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["closeFeeVaultInstruction"]>
): ReturnType<AuraClient["closeFeeVaultInstruction"]> {
  return client.closeFeeVaultInstruction(...args);
}
