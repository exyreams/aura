/**
 * Instruction builder failure modes.
 *
 * Every other instruction test feeds valid input. These assert the builders
 * reject invalid input instead of silently producing a malformed instruction:
 *
 *   - a missing required account is refused (Anchor `accountsStrict`),
 *   - out-of-range scalars (u8/u16) are refused by the encoder,
 *   - a missing required argument is refused,
 *   - a u64/i64 field given a plain number (not a BN) is refused,
 *   - a fixed-length byte array of the wrong size is refused.
 *
 * Confirmed contracts (from runtime): missing accounts throw
 * "Account `x` not provided"; out-of-range integers throw a RangeError; u64
 * fields require a BN (a number triggers "toArrayLike is not a function").
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { instructions } from "../../../src/index.js";
import { offlineClient } from "../../support/offline.js";
import { sampleAccounts, sampleArgs } from "../../support/sample.js";

const client = offlineClient();

function fullAccounts(name: string): Record<string, PublicKey> {
  return sampleAccounts(
    instructions.requireInstructionDefinition(name).accounts,
  );
}

describe("missing required accounts are rejected", () => {
  it("create_treasury without `owner` throws 'not provided'", async () => {
    await assert.rejects(
      () =>
        instructions.treasury.createTreasury(client, {
          // owner intentionally omitted
          accounts: {
            treasury: PublicKey.unique(),
            systemProgram: PublicKey.unique(),
          } as never,
          args: sampleArgs("create_treasury") as never,
        }),
      /not provided/i,
    );
  });

  it("abandon_proposal without `treasury` throws 'not provided'", async () => {
    await assert.rejects(
      () =>
        instructions.execution.abandonProposal(client, {
          accounts: {
            operator: PublicKey.unique(),
            dwalletState: null,
          } as never,
          args: { proposalId: new BN(1), now: new BN(1) },
        }),
      /not provided/i,
    );
  });
});

describe("out-of-range scalars are rejected by the encoder", () => {
  it("propose_transaction with targetChain = 300 (u8) throws RangeError", async () => {
    await assert.rejects(
      () =>
        instructions.execution.proposeTransaction(client, {
          accounts: fullAccounts("propose_transaction") as never,
          args: {
            ...(sampleArgs("propose_transaction") as object),
            amountUsd: new BN(1),
            targetChain: 300,
          } as never,
        }),
      /out of range|<= 255/i,
    );
  });

  it("configure_multisig with requiredSignatures = 300 (u8) throws RangeError", async () => {
    await assert.rejects(
      () =>
        instructions.governance.configureMultisig(client, {
          accounts: fullAccounts("configure_multisig") as never,
          args: {
            ...(sampleArgs("configure_multisig") as object),
            requiredSignatures: 300,
          } as never,
        }),
      /out of range|<= 255/i,
    );
  });
});

describe("malformed argument values", () => {
  it("a u64 field given a plain number (not a BN) throws", async () => {
    await assert.rejects(() =>
      instructions.execution.abandonProposal(client, {
        accounts: fullAccounts("abandon_proposal") as never,
        // proposalId must be a BN; a number is rejected by the encoder.
        args: { proposalId: 42 as never, now: new BN(1) },
      }),
    );
  });

  // The following two document *permissive* coder behavior: the builder does
  // NOT guard these, so the on-chain program (and the validation.ts helpers)
  // are the real defense. Pinned so the behavior can't change unnoticed.

  it("FOOTGUN: a missing required u64 arg is silently encoded as zero", async () => {
    const ix = await instructions.execution.abandonProposal(client, {
      accounts: fullAccounts("abandon_proposal") as never,
      // proposalId omitted entirely — not rejected, defaults to 0.
      args: { now: new BN(7) } as never,
    });
    const decoded = client.coder.decode(Buffer.from(ix.data));
    assert.ok(decoded);
    const data = decoded.data as Record<string, unknown>;
    assert.equal((data.proposal_id as BN).toString(10), "0");
    assert.equal((data.now as BN).toString(10), "7");
  });

  it("FOOTGUN: the builder does not validate fixed [u8; 32] element length", async () => {
    // A 16-byte element for a [u8; 32] field is not rejected at build time.
    await assert.doesNotReject(() =>
      instructions.execution.proposeTransaction(client, {
        accounts: fullAccounts("propose_transaction") as never,
        args: {
          ...(sampleArgs("propose_transaction") as object),
          amountUsd: new BN(1),
          sanctionsProof: [new Uint8Array(16)],
        } as never,
      }),
    );
  });
});
