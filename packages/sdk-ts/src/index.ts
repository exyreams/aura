/**
 * Public API surface for `@aura-protocol/sdk-ts`.
 */

export * as accounts from "./accounts/index.js";
export type { BNish } from "./bn.js";

// BN utilities
export { toBN } from "./bn.js";
export type { AuraClientOptions } from "./client.js";
export { AuraClient } from "./client.js";
export * as constants from "./constants.js";
// Root-level re-exports for commonly used SDK primitives.
export * from "./constants.js";
// dWallet two-phase execution helpers (hand-written, not generated)
export * as dwalletExecution from "./dwallet-execution.js";
export * from "./dwallet-execution.js";
export * as errors from "./errors/index.js";
export * from "./errors/index.js";
export * as events from "./events/index.js";
export * from "./events/index.js";
// Re-export raw IDL types for convenience if needed
export type { AuraCore } from "./generated/aura_core.js";
// Namespaces
export * as instructions from "./instructions/index.js";
export * as pda from "./pda.js";
export * from "./pda.js";
// Program-surface metadata (domains, instruction catalog).
export * as programSurface from "./program-surface.js";
export * from "./program-surface.js";
export * as validation from "./validation.js";
export * from "./validation.js";
