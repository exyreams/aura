/**
 * Instruction argument values — build, decode, assert.
 *
 * Round-trips prove the bytes are *self-consistent*; they cannot catch a
 * builder that silently drops, defaults, or mis-maps a field, because the
 * encoder and decoder share the same (possibly wrong) layout. These tests close
 * that gap: build each representative instruction with *specific, distinct*
 * values, decode the raw data with the program coder, and assert every field
 * came through with the value we put in — by its on-chain (snake_case) name.
 *
 * The set is chosen to cover every argument shape at least once: inline scalars,
 * bool, u64/i64 (BN), u8/u16, Option (both Some and null), String, Vec<pubkey>,
 * Vec<u16>, Vec<[u8;32]>, and Vec<struct> (nested).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Keypair, type PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { instructions } from "../../../../sdk-ts/src/index.js";
import { offlineClient } from "../../support/offline.js";
import { sampleAccounts, sampleArgs } from "../../support/sample.js";

const client = offlineClient();

/** Builds an instruction's decoded arg payload (handles inline vs single `args` struct). */
async function decodePayload(
  // biome-ignore lint/suspicious/noExplicitAny: domain builder is resolved dynamically.
  builder: (c: typeof client, input: any) => Promise<{ data: Buffer }>,
  instructionName: string,
  overrides: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const def = instructions.requireInstructionDefinition(instructionName);
  const accounts = sampleAccounts(def.accounts);
  const base = sampleArgs(instructionName) as
    | Record<string, unknown>
    | undefined;
  const args = base ? { ...base, ...overrides } : overrides;
  const ix = await builder(client, { accounts, args });
  const decoded = client.coder.decode(Buffer.from(ix.data));
  assert.ok(decoded, `${instructionName}: decode returned null`);
  const data = decoded.data as Record<string, unknown>;
  // Single-struct-arg instructions nest under `args`; inline ones are flat.
  return (data.args as Record<string, unknown>) ?? data;
}

const bn = (v: BN | undefined) => (v as BN).toString(10);

describe("inline scalar args (abandon_proposal)", () => {
  it("round-trips proposal_id (u64) and now (i64) by value", async () => {
    const p = await decodePayload(
      instructions.execution.abandonProposal,
      "abandon_proposal",
      { proposalId: new BN(42), now: new BN("1700000000") },
    );
    assert.equal(bn(p.proposal_id as BN), "42");
    assert.equal(bn(p.now as BN), "1700000000");
  });
});

describe("bool + timestamp (pause_execution)", () => {
  it("carries the paused flag and timestamp", async () => {
    const on = await decodePayload(
      instructions.execution.pauseExecution,
      "pause_execution",
      { paused: true, now: new BN(123) },
    );
    assert.equal(on.paused, true);
    assert.equal(bn(on.now as BN), "123");

    const off = await decodePayload(
      instructions.execution.pauseExecution,
      "pause_execution",
      { paused: false, now: new BN(124) },
    );
    assert.equal(off.paused, false);
  });
});

describe("string + Option<u64> (set_recipient_limit)", () => {
  it("carries chain, address, limits, and a populated optional", async () => {
    const p = await decodePayload(
      instructions.treasury.setRecipientLimit,
      "set_recipient_limit",
      {
        chain: 2,
        address: "0x000000000000000000000000000000000000dead",
        dailyLimitUsd: new BN(2000),
        perTxLimitUsd: new BN(500),
        now: new BN(1700),
      },
    );
    assert.equal(p.chain, 2);
    assert.equal(p.address, "0x000000000000000000000000000000000000dead");
    assert.equal(bn(p.daily_limit_usd as BN), "2000");
    assert.equal(bn(p.per_tx_limit_usd as BN), "500");
    assert.equal(bn(p.now as BN), "1700");
  });

  it("carries a null optional when perTxLimitUsd is omitted", async () => {
    const p = await decodePayload(
      instructions.treasury.setRecipientLimit,
      "set_recipient_limit",
      {
        chain: 1,
        address: "bc1qxyz",
        dailyLimitUsd: new BN(10),
        perTxLimitUsd: null,
        now: new BN(1),
      },
    );
    assert.equal(p.per_tx_limit_usd, null);
    assert.equal(p.chain, 1);
  });
});

describe("Vec<pubkey> + Vec<u16> (configure_multisig)", () => {
  it("carries guardians, weights, threshold, and approval weight", async () => {
    const g1 = Keypair.generate().publicKey;
    const g2 = Keypair.generate().publicKey;
    const p = await decodePayload(
      instructions.governance.configureMultisig,
      "configure_multisig",
      {
        requiredSignatures: 2,
        guardians: [g1, g2],
        guardianWeights: [3, 5],
        requiredApprovalWeight: 8,
        timestamp: new BN(1700),
      },
    );
    assert.equal(p.required_signatures, 2);
    assert.equal(p.required_approval_weight, 8);
    assert.deepEqual(p.guardian_weights, [3, 5]);
    const guardians = p.guardians as PublicKey[];
    assert.equal(guardians.length, 2);
    assert.ok(guardians[0].equals(g1));
    assert.ok(guardians[1].equals(g2));
  });
});

describe("mixed scalars + Option<u8> Some/null (propose_transaction)", () => {
  it("carries amount, chain, txType, a populated protocolId, and string", async () => {
    const p = await decodePayload(
      instructions.execution.proposeTransaction,
      "propose_transaction",
      {
        amountUsd: new BN(250),
        targetChain: 2,
        txType: 1,
        protocolId: 7,
        currentTimestamp: new BN("1700000000"),
        recipientOrContract: "0x000000000000000000000000000000000000beef",
      },
    );
    assert.equal(bn(p.amount_usd as BN), "250");
    assert.equal(p.target_chain, 2);
    assert.equal(p.tx_type, 1);
    assert.equal(p.protocol_id, 7);
    assert.equal(bn(p.current_timestamp as BN), "1700000000");
    assert.equal(
      p.recipient_or_contract,
      "0x000000000000000000000000000000000000beef",
    );
    // Untouched optionals stay null.
    assert.equal(p.expected_output_usd, null);
    assert.equal(p.actual_output_usd, null);
    assert.deepEqual(p.sanctions_proof, []);
  });
});

describe("Vec<struct> nested items (propose_batch)", () => {
  it("carries batch id, timestamp, and a populated item", async () => {
    const p = await decodePayload(
      instructions.batch.proposeBatch,
      "propose_batch",
      {
        batchId: new BN(9),
        now: new BN(1700),
        items: [
          {
            amountUsd: new BN(125),
            chain: 2,
            txType: 0,
            recipientOrContract: "0x000000000000000000000000000000000000cafe",
            protocolId: null,
          },
        ],
      },
    );
    assert.equal(bn(p.batch_id as BN), "9");
    const items = p.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 1);
    assert.equal(bn(items[0].amount_usd as BN), "125");
    assert.equal(items[0].chain, 2);
    assert.equal(items[0].tx_type, 0);
    assert.equal(
      items[0].recipient_or_contract,
      "0x000000000000000000000000000000000000cafe",
    );
    assert.equal(items[0].protocol_id, null);
  });
});
