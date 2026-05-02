/** Treasury address-list instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `init_address_list`. */
export function initAddressListInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["initAddressListInstruction"]>
): ReturnType<AuraClient["initAddressListInstruction"]> {
  return client.initAddressListInstruction(...args);
}

/** Builds `manage_address_list`. */
export function manageAddressListInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["manageAddressListInstruction"]>
): ReturnType<AuraClient["manageAddressListInstruction"]> {
  return client.manageAddressListInstruction(...args);
}

/** Builds `close_address_list`. */
export function closeAddressListInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["closeAddressListInstruction"]>
): ReturnType<AuraClient["closeAddressListInstruction"]> {
  return client.closeAddressListInstruction(...args);
}
