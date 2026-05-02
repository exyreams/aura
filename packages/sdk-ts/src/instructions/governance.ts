/** Governance, guardian, and emergency-control instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `configure_multisig`. */
export function configureMultisigInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["configureMultisigInstruction"]>
): ReturnType<AuraClient["configureMultisigInstruction"]> {
  return client.configureMultisigInstruction(...args);
}

/** Builds `propose_override`. */
export function proposeOverrideInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["proposeOverrideInstruction"]>
): ReturnType<AuraClient["proposeOverrideInstruction"]> {
  return client.proposeOverrideInstruction(...args);
}

/** Builds `collect_override_signature`. */
export function collectOverrideSignatureInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["collectOverrideSignatureInstruction"]>
): ReturnType<AuraClient["collectOverrideSignatureInstruction"]> {
  return client.collectOverrideSignatureInstruction(...args);
}

/** Builds `propose_ai_rotation`. */
export function proposeAiRotationInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["proposeAiRotationInstruction"]>
): ReturnType<AuraClient["proposeAiRotationInstruction"]> {
  return client.proposeAiRotationInstruction(...args);
}

/** Builds `execute_ai_rotation`. */
export function executeAiRotationInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["executeAiRotationInstruction"]>
): ReturnType<AuraClient["executeAiRotationInstruction"]> {
  return client.executeAiRotationInstruction(...args);
}

/** Builds `cancel_ai_rotation`. */
export function cancelAiRotationInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["cancelAiRotationInstruction"]>
): ReturnType<AuraClient["cancelAiRotationInstruction"]> {
  return client.cancelAiRotationInstruction(...args);
}

/** Builds `propose_guardian_rotation`. */
export function proposeGuardianRotationInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["proposeGuardianRotationInstruction"]>
): ReturnType<AuraClient["proposeGuardianRotationInstruction"]> {
  return client.proposeGuardianRotationInstruction(...args);
}

/** Builds `execute_guardian_rotation`. */
export function executeGuardianRotationInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["executeGuardianRotationInstruction"]>
): ReturnType<AuraClient["executeGuardianRotationInstruction"]> {
  return client.executeGuardianRotationInstruction(...args);
}

/** Builds `propose_config_change`. */
export function proposeConfigChangeInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["proposeConfigChangeInstruction"]>
): ReturnType<AuraClient["proposeConfigChangeInstruction"]> {
  return client.proposeConfigChangeInstruction(...args);
}

/** Builds `execute_config_change`. */
export function executeConfigChangeInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["executeConfigChangeInstruction"]>
): ReturnType<AuraClient["executeConfigChangeInstruction"]> {
  return client.executeConfigChangeInstruction(...args);
}

/** Builds `veto_config_change`. */
export function vetoConfigChangeInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["vetoConfigChangeInstruction"]>
): ReturnType<AuraClient["vetoConfigChangeInstruction"]> {
  return client.vetoConfigChangeInstruction(...args);
}

/** Builds `emergency_shutdown`. */
export function emergencyShutdownInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["emergencyShutdownInstruction"]>
): ReturnType<AuraClient["emergencyShutdownInstruction"]> {
  return client.emergencyShutdownInstruction(...args);
}
