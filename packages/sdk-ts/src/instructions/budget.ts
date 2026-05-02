/** Budget, exposure, approval, and liveness guardrail instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `configure_budget_envelope`. */
export function configureBudgetEnvelopeInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["configureBudgetEnvelopeInstruction"]>
): ReturnType<AuraClient["configureBudgetEnvelopeInstruction"]> {
  return client.configureBudgetEnvelopeInstruction(...args);
}

/** Builds `init_exposure_group`. */
export function initExposureGroupInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["initExposureGroupInstruction"]>
): ReturnType<AuraClient["initExposureGroupInstruction"]> {
  return client.initExposureGroupInstruction(...args);
}

/** Builds `join_exposure_group`. */
export function joinExposureGroupInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["joinExposureGroupInstruction"]>
): ReturnType<AuraClient["joinExposureGroupInstruction"]> {
  return client.joinExposureGroupInstruction(...args);
}

/** Builds `configure_approval_ladder`. */
export function configureApprovalLadderInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["configureApprovalLadderInstruction"]>
): ReturnType<AuraClient["configureApprovalLadderInstruction"]> {
  return client.configureApprovalLadderInstruction(...args);
}

/** Builds `configure_liveness_guardrails`. */
export function configureLivenessGuardrailsInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["configureLivenessGuardrailsInstruction"]>
): ReturnType<AuraClient["configureLivenessGuardrailsInstruction"]> {
  return client.configureLivenessGuardrailsInstruction(...args);
}
