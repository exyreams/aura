/** Agent swarm and shared-pool instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `configure_swarm`. */
export function configureSwarmInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["configureSwarmInstruction"]>
): ReturnType<AuraClient["configureSwarmInstruction"]> {
  return client.configureSwarmInstruction(...args);
}

/** Builds `init_swarm_pool`. */
export function initSwarmPoolInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["initSwarmPoolInstruction"]>
): ReturnType<AuraClient["initSwarmPoolInstruction"]> {
  return client.initSwarmPoolInstruction(...args);
}

/** Builds `join_swarm`. */
export function joinSwarmInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["joinSwarmInstruction"]>
): ReturnType<AuraClient["joinSwarmInstruction"]> {
  return client.joinSwarmInstruction(...args);
}
