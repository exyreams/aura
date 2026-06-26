/**
 * Comprehensive tests for the client-side validation helpers.
 *
 * Each validator is exercised for: the happy path, the exact boundary it
 * guards, one step past the boundary (must throw), and the empty/zero edge.
 * Multi-byte UTF-8 is used to confirm the limits are byte-based, not
 * character-based — a subtle bug surface that matters for on-chain space.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Keypair, type PublicKey } from "@solana/web3.js";
import {
  MAX_ADDRESS_LEN,
  MAX_AGENT_ID_LEN,
  MAX_DWALLET_ID_LEN,
  MAX_GUARDIANS,
  MAX_SWARM_ID_LEN,
  MAX_SWARM_MEMBER_LEN,
  MAX_SWARM_MEMBERS,
  validateAddress,
  validateAgentId,
  validateAmountUsd,
  validateDwalletId,
  validateGuardians,
  validateMultisigThreshold,
  validateSwarmId,
  validateSwarmMembers,
} from "../../../src/validation.js";

function keys(n: number): PublicKey[] {
  return Array.from({ length: n }, () => Keypair.generate().publicKey);
}

/** A string whose UTF-8 byte length is exactly `bytes` using 1-byte chars. */
function asciiOfBytes(bytes: number): string {
  return "a".repeat(bytes);
}

describe("validateAgentId", () => {
  it("accepts a normal id", () => {
    assert.doesNotThrow(() => validateAgentId("agent-prod-1"));
  });

  it("accepts an id at exactly MAX_AGENT_ID_LEN bytes", () => {
    assert.doesNotThrow(() => validateAgentId(asciiOfBytes(MAX_AGENT_ID_LEN)));
  });

  it("throws on empty", () => {
    assert.throws(() => validateAgentId(""), /must not be empty/);
  });

  it("throws one byte over the limit", () => {
    assert.throws(
      () => validateAgentId(asciiOfBytes(MAX_AGENT_ID_LEN + 1)),
      /exceeds maximum length/,
    );
  });

  it("counts UTF-8 bytes, not characters (multi-byte emoji)", () => {
    // "😀" is 4 UTF-8 bytes; 16 of them = 64 bytes = exactly the limit.
    assert.doesNotThrow(() =>
      validateAgentId("😀".repeat(MAX_AGENT_ID_LEN / 4)),
    );
    // 17 emoji = 68 bytes > 64 → must throw even though it's only 17 chars.
    assert.throws(
      () => validateAgentId("😀".repeat(MAX_AGENT_ID_LEN / 4 + 1)),
      /exceeds maximum length/,
    );
  });
});

describe("validateDwalletId", () => {
  it("accepts a normal id and the exact limit", () => {
    assert.doesNotThrow(() => validateDwalletId("dwallet-eth-1"));
    assert.doesNotThrow(() =>
      validateDwalletId(asciiOfBytes(MAX_DWALLET_ID_LEN)),
    );
  });

  it("throws on empty and over-limit", () => {
    assert.throws(() => validateDwalletId(""), /must not be empty/);
    assert.throws(
      () => validateDwalletId(asciiOfBytes(MAX_DWALLET_ID_LEN + 1)),
      /exceeds maximum length/,
    );
  });
});

describe("validateAddress", () => {
  it("accepts a normal address and the exact limit", () => {
    assert.doesNotThrow(() =>
      validateAddress("0x000000000000000000000000000000000000dead"),
    );
    assert.doesNotThrow(() => validateAddress(asciiOfBytes(MAX_ADDRESS_LEN)));
  });

  it("throws on empty and over-limit", () => {
    assert.throws(() => validateAddress(""), /must not be empty/);
    assert.throws(
      () => validateAddress(asciiOfBytes(MAX_ADDRESS_LEN + 1)),
      /exceeds maximum length/,
    );
  });
});

describe("validateAmountUsd", () => {
  it("accepts a positive number", () => {
    assert.doesNotThrow(() => validateAmountUsd(1));
  });

  it("accepts a positive bigint", () => {
    assert.doesNotThrow(() => validateAmountUsd(1n));
  });

  it("throws on zero (number and bigint)", () => {
    assert.throws(() => validateAmountUsd(0), /greater than zero/);
    assert.throws(() => validateAmountUsd(0n), /greater than zero/);
  });

  it("throws on negative (number and bigint)", () => {
    assert.throws(() => validateAmountUsd(-1), /greater than zero/);
    assert.throws(() => validateAmountUsd(-1n), /greater than zero/);
  });
});

describe("validateMultisigThreshold", () => {
  it("accepts threshold equal to guardian count (N-of-N)", () => {
    assert.doesNotThrow(() => validateMultisigThreshold(3, 3));
  });

  it("accepts threshold below guardian count (M-of-N)", () => {
    assert.doesNotThrow(() => validateMultisigThreshold(2, 3));
  });

  it("throws on a zero threshold", () => {
    assert.throws(() => validateMultisigThreshold(0, 3), /greater than zero/);
  });

  it("throws when threshold exceeds guardian count", () => {
    assert.throws(() => validateMultisigThreshold(4, 3), /must not exceed/);
  });
});

describe("validateGuardians", () => {
  it("accepts a single guardian", () => {
    assert.doesNotThrow(() => validateGuardians(keys(1)));
  });

  it("accepts exactly MAX_GUARDIANS", () => {
    assert.doesNotThrow(() => validateGuardians(keys(MAX_GUARDIANS)));
  });

  it("throws on an empty list", () => {
    assert.throws(() => validateGuardians([]), /must not be empty/);
  });

  it("throws one past MAX_GUARDIANS", () => {
    assert.throws(
      () => validateGuardians(keys(MAX_GUARDIANS + 1)),
      /exceeds maximum/,
    );
  });
});

describe("validateSwarmId", () => {
  it("accepts a normal id and the exact limit", () => {
    assert.doesNotThrow(() => validateSwarmId("trading-swarm-1"));
    assert.doesNotThrow(() => validateSwarmId(asciiOfBytes(MAX_SWARM_ID_LEN)));
  });

  it("throws on empty and over-limit", () => {
    assert.throws(() => validateSwarmId(""), /must not be empty/);
    assert.throws(
      () => validateSwarmId(asciiOfBytes(MAX_SWARM_ID_LEN + 1)),
      /exceeds maximum length/,
    );
  });
});

describe("validateSwarmMembers", () => {
  it("accepts a single member and exactly MAX_SWARM_MEMBERS", () => {
    assert.doesNotThrow(() => validateSwarmMembers(["agent-1"]));
    assert.doesNotThrow(() =>
      validateSwarmMembers(
        Array.from({ length: MAX_SWARM_MEMBERS }, (_v, i) => `agent-${i}`),
      ),
    );
  });

  it("throws on an empty list", () => {
    assert.throws(() => validateSwarmMembers([]), /must not be empty/);
  });

  it("throws one past MAX_SWARM_MEMBERS", () => {
    assert.throws(
      () =>
        validateSwarmMembers(
          Array.from(
            { length: MAX_SWARM_MEMBERS + 1 },
            (_v, i) => `agent-${i}`,
          ),
        ),
      /exceeds maximum/,
    );
  });

  it("accepts a member id at exactly MAX_SWARM_MEMBER_LEN bytes", () => {
    assert.doesNotThrow(() =>
      validateSwarmMembers([asciiOfBytes(MAX_SWARM_MEMBER_LEN)]),
    );
  });

  it("throws when a single member id exceeds MAX_SWARM_MEMBER_LEN", () => {
    assert.throws(
      () =>
        validateSwarmMembers(["ok", asciiOfBytes(MAX_SWARM_MEMBER_LEN + 1)]),
      /exceeds maximum length/,
    );
  });
});
