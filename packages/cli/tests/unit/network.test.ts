/** RPC endpoint classification. */

import assert from "node:assert/strict";
import test from "node:test";

import { classifyNetwork } from "../../src/core/network.js";

test("classifyNetwork detects mainnet and marks it production", () => {
  const net = classifyNetwork("https://api.mainnet-beta.solana.com");
  assert.equal(net.kind, "mainnet");
  assert.equal(net.label, "mainnet-beta");
  assert.equal(net.isProduction, true);
});

test("classifyNetwork detects devnet/testnet/localnet (non-production)", () => {
  assert.equal(classifyNetwork("https://api.devnet.solana.com").kind, "devnet");
  assert.equal(
    classifyNetwork("https://api.devnet.solana.com").isProduction,
    false,
  );
  assert.equal(
    classifyNetwork("https://api.testnet.solana.com").kind,
    "testnet",
  );
  assert.equal(classifyNetwork("http://127.0.0.1:8899").kind, "localnet");
  assert.equal(classifyNetwork("http://localhost:8899").kind, "localnet");
});

test("classifyNetwork falls back to custom for unknown endpoints", () => {
  const net = classifyNetwork("https://rpc.my-provider.example/abc");
  assert.equal(net.kind, "custom");
  assert.equal(net.isProduction, false);
});
