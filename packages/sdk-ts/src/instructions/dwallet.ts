/** dWallet account and balance instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `register_dwallet`. */
export function registerDwalletInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["registerDwalletInstruction"]>
): ReturnType<AuraClient["registerDwalletInstruction"]> {
  return client.registerDwalletInstruction(...args);
}

/** Builds `refresh_dwallet_balance`. */
export function refreshDwalletBalanceInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["refreshDwalletBalanceInstruction"]>
): ReturnType<AuraClient["refreshDwalletBalanceInstruction"]> {
  return client.refreshDwalletBalanceInstruction(...args);
}
