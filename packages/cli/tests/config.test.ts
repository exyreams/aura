import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CONFIG,
  flattenResolvedConfig,
  resolveConfig,
} from "../src/config.js";

test("resolveConfig prefers flags over env and defaults", () => {
  const resolved = resolveConfig(
    {
      rpcUrl: "https://flag.example",
      walletPath: "/tmp/flag-wallet.json",
    },
    {
      AURA_RPC_URL: "https://env.example",
      AURA_WALLET_PATH: "/tmp/env-wallet.json",
    },
  );

  assert.equal(resolved.rpcUrl.value, "https://flag.example");
  assert.equal(resolved.rpcUrl.source, "flag");
  assert.equal(resolved.walletPath.value, "/tmp/flag-wallet.json");
  assert.equal(resolved.walletPath.source, "flag");
});

test("resolveConfig falls back to env then defaults", () => {
  const resolved = resolveConfig(
    {},
    {
      AURA_RPC_URL: "https://env.example",
      AURA_PROGRAM_ID: "Program1111111111111111111111111111111111111",
    },
  );

  assert.equal(resolved.rpcUrl.value, "https://env.example");
  assert.equal(resolved.rpcUrl.source, "env");
  assert.equal(resolved.programId.value, "Program1111111111111111111111111111111111111");
  assert.equal(resolved.programId.source, "env");
  assert.equal(resolved.cluster.value, DEFAULT_CONFIG.cluster);
  assert.equal(resolved.cluster.source, "default");
});

test("flattenResolvedConfig unwraps values", () => {
  const resolved = resolveConfig({ defaultAgentId: "agent-1" }, {});
  const flattened = flattenResolvedConfig(resolved);

  assert.equal(flattened.defaultAgentId, "agent-1");
  assert.equal(flattened.rpcUrl, resolved.rpcUrl.value);
});
