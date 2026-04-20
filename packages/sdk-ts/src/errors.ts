/**
 * Error types and utilities for the AURA SDK.
 *
 * All on-chain errors are defined in the Anchor IDL and accessible via the
 * generated types. This module re-exports them and provides utilities for
 * matching on specific error codes.
 */

import type { AuraCore } from "./generated/aura_core.js";

/**
 * All error types defined in the `aura-core` program.
 * Extracted from the IDL `errors` array.
 */
export type AuraError = AuraCore["errors"][number];

/**
 * Error codes for all `aura-core` program errors.
 * Anchor error codes start at 6000.
 */
export const AuraErrorCode = {
  UnauthorizedAi: 6000,
  UnauthorizedOwner: 6001,
  UnauthorizedGuardian: 6002,
  UnauthorizedExecutor: 6003,
  PendingTransactionExists: 6004,
  NoPendingTransaction: 6005,
  DWalletNotConfigured: 6006,
  DWalletAlreadyRegistered: 6007,
  PolicyGraphMismatch: 6008,
  PolicyDigestMismatch: 6009,
  DecryptionNotReady: 6010,
  MessageApprovalNotReady: 6011,
  SignatureVerificationFailed: 6012,
  InvalidDeployment: 6013,
  InvalidExternalAccountData: 6014,
  ConfidentialGuardrailsNotConfigured: 6015,
  PolicyOutputNotReady: 6016,
  ExecutionPaused: 6017,
  PendingTransactionExpired: 6018,
  NoActiveOverride: 6019,
  InvalidChain: 6020,
  InvalidTransactionType: 6021,
  InvalidCurve: 6022,
  InvalidSignatureScheme: 6023,
  InvalidViolationCode: 6024,
  InvalidProposalStatus: 6025,
  InvalidGuardianConfiguration: 6026,
} as const;

/**
 * Checks if an error is an Anchor program error with a specific code.
 *
 * @param error The error thrown by an RPC call.
 * @param code  The expected error code (use `AuraErrorCode.*`).
 * @returns `true` if the error matches the code.
 */
export function isAuraError(error: unknown, code: number): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const err = error as { code?: number };
  return err.code === code;
}

/**
 * Extracts the error code from an Anchor program error.
 *
 * @param error The error thrown by an RPC call.
 * @returns The error code, or `null` if not an Anchor error.
 */
export function getAuraErrorCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const err = error as { code?: number };
  return typeof err.code === "number" ? err.code : null;
}
