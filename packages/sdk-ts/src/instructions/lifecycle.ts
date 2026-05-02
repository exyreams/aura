/** Agent lifecycle, migration, operator-role, and session-key instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `grant_operator_role`. */
export function grantOperatorRoleInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["grantOperatorRoleInstruction"]>
): ReturnType<AuraClient["grantOperatorRoleInstruction"]> {
  return client.grantOperatorRoleInstruction(...args);
}

/** Builds `revoke_operator_role`. */
export function revokeOperatorRoleInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["revokeOperatorRoleInstruction"]>
): ReturnType<AuraClient["revokeOperatorRoleInstruction"]> {
  return client.revokeOperatorRoleInstruction(...args);
}

/** Builds `transition_agent_state`. */
export function transitionAgentStateInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["transitionAgentStateInstruction"]>
): ReturnType<AuraClient["transitionAgentStateInstruction"]> {
  return client.transitionAgentStateInstruction(...args);
}

/** Builds `migrate_treasury`. */
export function migrateTreasuryInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["migrateTreasuryInstruction"]>
): ReturnType<AuraClient["migrateTreasuryInstruction"]> {
  return client.migrateTreasuryInstruction(...args);
}

/** Builds `issue_session_key`. */
export function issueSessionKeyInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["issueSessionKeyInstruction"]>
): ReturnType<AuraClient["issueSessionKeyInstruction"]> {
  return client.issueSessionKeyInstruction(...args);
}

/** Builds `revoke_session_key`. */
export function revokeSessionKeyInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["revokeSessionKeyInstruction"]>
): ReturnType<AuraClient["revokeSessionKeyInstruction"]> {
  return client.revokeSessionKeyInstruction(...args);
}

/** Builds `close_session_key`. */
export function closeSessionKeyInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["closeSessionKeyInstruction"]>
): ReturnType<AuraClient["closeSessionKeyInstruction"]> {
  return client.closeSessionKeyInstruction(...args);
}

/** Builds `trigger_dead_mans_switch`. */
export function triggerDeadMansSwitchInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["triggerDeadMansSwitchInstruction"]>
): ReturnType<AuraClient["triggerDeadMansSwitchInstruction"]> {
  return client.triggerDeadMansSwitchInstruction(...args);
}
