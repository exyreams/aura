/**
 * Devnet: live Ika dWallet control (Tier C).
 *
 * Provisions (or loads) a persistent Ed25519 dWallet via the Ika gRPC DKG
 * service and reads the balances held at its Solana custody address. The
 * address is stable across runs (cached to a gitignored file), so tokens sent
 * to it show up on re-run.
 *
 * NOTE: this file only covers provisioning and balance visibility. The full
 * outbound path, including exact native message approval, Ika signing,
 * broadcast, and settlement, lives in transfer.devnet.test.ts.
 *
 * Skips when no devnet payer keypair is available. Fails loudly (not skips) if
 * the Ika endpoint is unreachable, so regressions in the gRPC path surface.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  connection,
  DEVNET_AVAILABLE,
  getPayer,
} from "../../support/devnet.js";
import {
  type Dwallet,
  getOrCreateDwallet,
  readBalances,
} from "../../support/ika/dwallet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";

let dwallet: Dwallet;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  dwallet = await getOrCreateDwallet(getPayer());
});

test("provisions or loads a persistent dWallet", { skip }, () => {
  assert.ok(dwallet.address instanceof PublicKey);
  assert.equal(dwallet.publicKey.length, 32);
  assert.equal(dwallet.sessionIdentifier.length, 32);
  console.log(`\n    dWallet custody address: ${dwallet.address.toBase58()}\n`);
});

test("reads all token balances at the dWallet address", { skip }, async () => {
  const balances = await readBalances(connection(), dwallet.address);

  console.log(`    SOL: ${balances.sol}`);
  for (const tok of balances.tokens) {
    console.log(
      `    token ${tok.mint}  ${tok.uiAmount} (raw ${tok.amount}, ${tok.decimals}dp)`,
    );
  }
  if (balances.tokens.length === 0) {
    console.log("    (no SPL tokens at this address)");
  }

  // Shape assertions, independent of whether the address is funded.
  assert.equal(typeof balances.lamports, "number");
  assert.ok(Array.isArray(balances.tokens));
  for (const tok of balances.tokens) {
    assert.ok(new PublicKey(tok.mint));
    assert.equal(typeof tok.amount, "string");
    assert.equal(typeof tok.decimals, "number");
  }
});

test("reuses the cached dWallet session on a second lookup", {
  skip,
}, async () => {
  const cached = await getOrCreateDwallet(getPayer());
  assert.equal(cached.address.toBase58(), dwallet.address.toBase58());
  assert.deepEqual(
    Array.from(cached.sessionIdentifier),
    Array.from(dwallet.sessionIdentifier),
  );
});
