/**
 * Public API surface for `@aura-protocol/conduit`.
 *
 * Re-exports the core module and the MCP transport so consumers can embed
 * Conduit programmatically (e.g. unit tests, custom transports) without
 * going through the CLI.
 */

export * from "./cli/index.js";
export * from "./core/control-plane/index.js";
export * from "./core/index.js";
export * from "./core/safety/index.js";
export * from "./core/signing/index.js";
export * from "./http/index.js";
export * from "./mcp/index.js";
export { CONDUIT_PROTOCOL_VERSION, CONDUIT_VERSION } from "./version.js";
