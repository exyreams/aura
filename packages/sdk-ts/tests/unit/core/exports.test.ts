/**
 * Public API surface.
 *
 * The package's value is its stable export surface — apps, the CLI, and Conduit
 * import named symbols and namespaces from the root. This test pins that
 * surface so an accidental removal or rename in `index.ts` (or a sub-module's
 * `index.ts`) fails loudly instead of breaking downstream packages at runtime.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as sdk from "../../../src/index.js";

describe("root re-exports — values", () => {
  const expectedValues: Array<[string, "function" | "object"]> = [
    // bn
    ["toBN", "function"],
    // client
    ["AuraClient", "function"],
    // constants (root re-export)
    ["AURA_PROGRAM_ID", "object"],
    ["AURA_IDL", "object"],
    ["TREASURY_SEED", "object"],
    // errors (root re-export)
    ["AuraErrorCode", "object"],
    ["AURA_ERROR_DEFINITIONS", "object"],
    ["getAuraErrorCode", "function"],
    ["parseAuraError", "function"],
    ["isAuraError", "function"],
    // events (root re-export)
    ["EventDiscriminator", "object"],
    ["matchesEventDiscriminator", "function"],
    ["parseAuraEvents", "function"],
    // pda (root re-export)
    ["deriveTreasuryAddress", "function"],
    ["deriveMessageApprovalAddress", "function"],
    ["hashSwarmId", "function"],
    // program-surface (root re-export)
    ["AURA_FEATURE_DOMAINS", "object"],
    ["getInstructionDomain", "function"],
    // validation (root re-export)
    ["validateAgentId", "function"],
    ["validateAmountUsd", "function"],
  ];

  for (const [name, kind] of expectedValues) {
    it(`exports ${name} as a ${kind}`, () => {
      assert.equal(
        typeof (sdk as Record<string, unknown>)[name],
        kind,
        `missing root export ${name}`,
      );
    });
  }
});

describe("root re-exports — namespaces", () => {
  const namespaces = [
    "accounts",
    "constants",
    "errors",
    "events",
    "instructions",
    "pda",
    "programSurface",
    "validation",
  ];

  for (const ns of namespaces) {
    it(`exposes the ${ns} namespace`, () => {
      assert.equal(
        typeof (sdk as Record<string, unknown>)[ns],
        "object",
        `missing namespace ${ns}`,
      );
    });
  }

  it("the instructions namespace carries all 13 domains", () => {
    const ix = sdk.instructions as unknown as Record<string, unknown>;
    for (const domain of [
      "treasury",
      "confidential",
      "execution",
      "governance",
      "dwallet",
      "policy",
      "budget",
      "operational",
      "lifecycle",
      "swarm",
      "fees",
      "addressLists",
      "batch",
    ]) {
      assert.equal(typeof ix[domain], "object", `instructions.${domain}`);
    }
  });
});

describe("namespace and root re-export identity", () => {
  it("root deriveTreasuryAddress is the same function as pda.deriveTreasuryAddress", () => {
    assert.equal(sdk.deriveTreasuryAddress, sdk.pda.deriveTreasuryAddress);
  });

  it("root AURA_PROGRAM_ID is the same object as constants.AURA_PROGRAM_ID", () => {
    assert.equal(sdk.AURA_PROGRAM_ID, sdk.constants.AURA_PROGRAM_ID);
  });

  it("root parseAuraError is the same function as errors.parseAuraError", () => {
    assert.equal(sdk.parseAuraError, sdk.errors.parseAuraError);
  });
});
