/**
 * Tool registry with two startup invariants enforced before any transport
 * binds:
 *
 *   1. No tool may declare an instruction that lists `owner` as a required
 *      signer. Owner-grade actions go through the dashboard sign-request
 *      proxy, not the agent surface.
 *
 *   2. A tool whose declared instructions require any signer must set
 *      `isWrite = true`; a tool with no instructions must set
 *      `isWrite = false` (or set `proxiesOwnerSignature = true`).
 *
 * A boot that violates either fails fast.
 */

import type { Tool } from "./types.js";

export class RegistryInvariantError extends Error {
  readonly tool: string;
  readonly reason: string;

  constructor(tool: string, reason: string) {
    super(`Conduit tool '${tool}' violates startup invariant: ${reason}`);
    this.name = "RegistryInvariantError";
    this.tool = tool;
    this.reason = reason;
  }
}

export interface ToolRegistry {
  get(name: string): Tool | undefined;
  list(): ReadonlyArray<Tool>;
  has(name: string): boolean;
}

export function createToolRegistry(tools: ReadonlyArray<Tool>): ToolRegistry {
  const byName = new Map<string, Tool>();
  for (const tool of tools) {
    if (byName.has(tool.name)) {
      throw new RegistryInvariantError(
        tool.name,
        "duplicate tool name in registry",
      );
    }
    assertNoOwnerSigner(tool);
    assertWriteLabelConsistency(tool);
    byName.set(tool.name, tool);
  }
  return {
    get(name) {
      return byName.get(name);
    },
    list() {
      return Array.from(byName.values());
    },
    has(name) {
      return byName.has(name);
    },
  };
}

function assertNoOwnerSigner(tool: Tool): void {
  for (const instruction of tool.declaredInstructions) {
    if (instruction.requiresSigner.includes("owner")) {
      throw new RegistryInvariantError(
        tool.name,
        `declared instruction '${instruction.name}' requires the treasury owner as Signer; ` +
          "owner-grade actions must use the dashboard sign-request proxy, not the agent surface",
      );
    }
  }
}

function assertWriteLabelConsistency(tool: Tool): void {
  const writesOnChain = tool.declaredInstructions.some(
    (instruction) => instruction.requiresSigner.length > 0,
  );
  if (writesOnChain && !tool.isWrite) {
    throw new RegistryInvariantError(
      tool.name,
      "declares signer-requiring instructions but isWrite=false",
    );
  }
  if (
    !writesOnChain &&
    tool.isWrite &&
    tool.proxiesOwnerSignature !== true &&
    tool.mutatesOffchainState !== true
  ) {
    throw new RegistryInvariantError(
      tool.name,
      "marked isWrite=true but declares no signer-requiring instructions and does not declare a dashboard/control-plane write path",
    );
  }
}
