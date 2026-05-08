/** Confidential execution and Encrypt instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `configure_confidential_guardrails`. */
export function configureConfidentialGuardrailsInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["configureConfidentialGuardrailsInstruction"]>
): ReturnType<AuraClient["configureConfidentialGuardrailsInstruction"]> {
  return client.configureConfidentialGuardrailsInstruction(...args);
}

/** Builds `propose_confidential_transaction`. */
export function proposeConfidentialTransactionInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["proposeConfidentialTransactionInstruction"]>
): ReturnType<AuraClient["proposeConfidentialTransactionInstruction"]> {
  return client.proposeConfidentialTransactionInstruction(...args);
}

/** Builds `request_policy_decryption`. */
export function requestPolicyDecryptionInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["requestPolicyDecryptionInstruction"]>
): ReturnType<AuraClient["requestPolicyDecryptionInstruction"]> {
  return client.requestPolicyDecryptionInstruction(...args);
}

/** Builds `confirm_policy_decryption`. */
export function confirmPolicyDecryptionInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["confirmPolicyDecryptionInstruction"]>
): ReturnType<AuraClient["confirmPolicyDecryptionInstruction"]> {
  return client.confirmPolicyDecryptionInstruction(...args);
}
