/**
 * Domain-organized instruction builders.
 *
 * These helpers are thin, typed delegates over `AuraClient` so consumers can
 * either use the object-oriented client directly or import a protocol-domain
 * namespace without learning the large client file.
 */

export * as addressLists from "./address-lists.js";
export * as batch from "./batch.js";
export * as budget from "./budget.js";
export * as confidential from "./confidential.js";
export * as dwallet from "./dwallet.js";
export * as execution from "./execution.js";
export * as fees from "./fees.js";
export * as governance from "./governance.js";
export * as lifecycle from "./lifecycle.js";
export * as operational from "./operational.js";
export * as policy from "./policy.js";
export * as swarm from "./swarm.js";
export * as treasury from "./treasury.js";
