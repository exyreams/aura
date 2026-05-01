import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, PublicKey } from "@solana/web3.js";

import {
  AURA_PROGRAM_ID,
  BATCH_PROPOSAL_SEED,
  BUDGET_ENVELOPE_SEED,
  DWALLET_SEED,
  EXTERNAL_LIVENESS_SEED,
  EXPOSURE_GROUP_SEED,
  INVARIANT_REPORT_SEED,
  MESSAGE_APPROVAL_SEED,
  OPERATOR_ROLE_SEED,
  POLICY_ATTESTATION_SEED,
  POLICY_RECEIPT_SEED,
  POLICY_SIMULATION_SEED,
  deriveBatchProposalAddress,
  deriveBudgetEnvelopeAddress,
  deriveDwalletCpiAuthorityAddress,
  deriveEncryptCpiAuthorityAddress,
  deriveEncryptEventAuthorityAddress,
  deriveExposureGroupAddress,
  deriveExternalLivenessAddress,
  deriveInvariantReportAddress,
  deriveMessageApprovalAddress,
  deriveOperatorRoleAddress,
  derivePolicyAttestationAddress,
  derivePolicyReceiptAddress,
  derivePolicySimulationAddress,
  deriveTreasuryAddress,
} from "../src/index.js";

// deriveTreasuryAddress

test("deriveTreasuryAddress is deterministic", () => {
  const owner = Keypair.generate().publicKey;
  const [a, aBump] = deriveTreasuryAddress(owner, "agent-1", AURA_PROGRAM_ID);
  const [b, bBump] = deriveTreasuryAddress(owner, "agent-1", AURA_PROGRAM_ID);
  assert.equal(a.toBase58(), b.toBase58());
  assert.equal(aBump, bBump);
});

test("deriveTreasuryAddress differs by owner", () => {
  const ownerA = Keypair.generate().publicKey;
  const ownerB = Keypair.generate().publicKey;
  const [a] = deriveTreasuryAddress(ownerA, "agent-1", AURA_PROGRAM_ID);
  const [b] = deriveTreasuryAddress(ownerB, "agent-1", AURA_PROGRAM_ID);
  assert.notEqual(a.toBase58(), b.toBase58());
});

test("deriveTreasuryAddress differs by agentId", () => {
  const owner = Keypair.generate().publicKey;
  const [a] = deriveTreasuryAddress(owner, "agent-1", AURA_PROGRAM_ID);
  const [b] = deriveTreasuryAddress(owner, "agent-2", AURA_PROGRAM_ID);
  assert.notEqual(a.toBase58(), b.toBase58());
});

test("deriveTreasuryAddress differs by programId", () => {
  const owner = Keypair.generate().publicKey;
  const altProgram = Keypair.generate().publicKey;
  const [a] = deriveTreasuryAddress(owner, "agent-1", AURA_PROGRAM_ID);
  const [b] = deriveTreasuryAddress(owner, "agent-1", altProgram);
  assert.notEqual(a.toBase58(), b.toBase58());
});

test("deriveTreasuryAddress uses AURA_PROGRAM_ID as default", () => {
  const owner = Keypair.generate().publicKey;
  const [withDefault] = deriveTreasuryAddress(owner, "agent-1");
  const [withExplicit] = deriveTreasuryAddress(owner, "agent-1", AURA_PROGRAM_ID);
  assert.equal(withDefault.toBase58(), withExplicit.toBase58());
});

test("deriveTreasuryAddress returns a valid on-curve PublicKey", () => {
  const owner = Keypair.generate().publicKey;
  const [pda] = deriveTreasuryAddress(owner, "my-agent", AURA_PROGRAM_ID);
  // PDAs are off-curve; PublicKey.isOnCurve should be false
  assert.equal(PublicKey.isOnCurve(pda.toBytes()), false);
});

test("deriveTreasuryAddress bump is in valid range", () => {
  const owner = Keypair.generate().publicKey;
  const [, bump] = deriveTreasuryAddress(owner, "agent-1", AURA_PROGRAM_ID);
  assert.ok(bump >= 0 && bump <= 255);
});

test("deriveTreasuryAddress handles unicode agentId", () => {
  const owner = Keypair.generate().publicKey;
  const [a] = deriveTreasuryAddress(owner, "agent-🤖", AURA_PROGRAM_ID);
  const [b] = deriveTreasuryAddress(owner, "agent-🤖", AURA_PROGRAM_ID);
  assert.equal(a.toBase58(), b.toBase58());
});

test("deriveTreasuryAddress handles empty agentId", () => {
  const owner = Keypair.generate().publicKey;
  const [a] = deriveTreasuryAddress(owner, "", AURA_PROGRAM_ID);
  const [b] = deriveTreasuryAddress(owner, "", AURA_PROGRAM_ID);
  assert.equal(a.toBase58(), b.toBase58());
});

// global CPI authorities

test("global CPI authorities are deterministic", () => {
  const [dwalletA, dwalletBumpA] = deriveDwalletCpiAuthorityAddress(AURA_PROGRAM_ID);
  const [dwalletB, dwalletBumpB] = deriveDwalletCpiAuthorityAddress(AURA_PROGRAM_ID);
  const [encryptA, encryptBumpA] = deriveEncryptCpiAuthorityAddress(AURA_PROGRAM_ID);
  const [encryptB, encryptBumpB] = deriveEncryptCpiAuthorityAddress(AURA_PROGRAM_ID);
  assert.equal(dwalletA.toBase58(), dwalletB.toBase58());
  assert.equal(dwalletBumpA, dwalletBumpB);
  assert.equal(encryptA.toBase58(), encryptB.toBase58());
  assert.equal(encryptBumpA, encryptBumpB);
});

test("dWallet and Encrypt CPI authorities are distinct", () => {
  const [dwallet] = deriveDwalletCpiAuthorityAddress(AURA_PROGRAM_ID);
  const [encrypt] = deriveEncryptCpiAuthorityAddress(AURA_PROGRAM_ID);
  assert.notEqual(dwallet.toBase58(), encrypt.toBase58());
});

test("CPI authorities differ by programId", () => {
  const altProgram = Keypair.generate().publicKey;
  const [a] = deriveDwalletCpiAuthorityAddress(AURA_PROGRAM_ID);
  const [b] = deriveDwalletCpiAuthorityAddress(altProgram);
  assert.notEqual(a.toBase58(), b.toBase58());
});

test("deriveDwalletCpiAuthorityAddress uses AURA_PROGRAM_ID as default", () => {
  const [withDefault] = deriveDwalletCpiAuthorityAddress();
  const [withExplicit] = deriveDwalletCpiAuthorityAddress(AURA_PROGRAM_ID);
  assert.equal(withDefault.toBase58(), withExplicit.toBase58());
});

test("deriveEncryptCpiAuthorityAddress uses AURA_PROGRAM_ID as default", () => {
  const [withDefault] = deriveEncryptCpiAuthorityAddress();
  const [withExplicit] = deriveEncryptCpiAuthorityAddress(AURA_PROGRAM_ID);
  assert.equal(withDefault.toBase58(), withExplicit.toBase58());
});

// deriveEncryptEventAuthorityAddress

test("deriveEncryptEventAuthorityAddress is deterministic", () => {
  const encryptProgram = Keypair.generate().publicKey;
  const [a, bumpA] = deriveEncryptEventAuthorityAddress(encryptProgram);
  const [b, bumpB] = deriveEncryptEventAuthorityAddress(encryptProgram);
  assert.equal(a.toBase58(), b.toBase58());
  assert.equal(bumpA, bumpB);
});

test("deriveEncryptEventAuthorityAddress differs by encryptProgramId", () => {
  const [a] = deriveEncryptEventAuthorityAddress(Keypair.generate().publicKey);
  const [b] = deriveEncryptEventAuthorityAddress(Keypair.generate().publicKey);
  assert.notEqual(a.toBase58(), b.toBase58());
});

// deriveMessageApprovalAddress

function u16Le(value: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

function u64Le(value: bigint | number): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}

function manualMessageApprovalAddress(
  dwalletProgram: PublicKey,
  curveCode: number,
  publicKey: Uint8Array,
  signatureSchemeCode: number,
  digest: Uint8Array,
  metadataDigest?: Uint8Array,
): [PublicKey, number] {
  const payload = Buffer.concat([u16Le(curveCode), Buffer.from(publicKey)]);
  const seeds: Buffer[] = [DWALLET_SEED];
  for (let offset = 0; offset < payload.length; offset += 32) {
    seeds.push(payload.subarray(offset, offset + 32));
  }
  seeds.push(MESSAGE_APPROVAL_SEED, u16Le(signatureSchemeCode), Buffer.from(digest));
  if (metadataDigest?.some((byte) => byte !== 0)) {
    seeds.push(Buffer.from(metadataDigest));
  }
  return PublicKey.findProgramAddressSync(seeds, dwalletProgram);
}

test("deriveMessageApprovalAddress is deterministic", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const publicKey = new Uint8Array(32).fill(0x44);
  const digest = new Uint8Array(32).fill(0xab);
  const [a, bumpA] = deriveMessageApprovalAddress(dwalletProgram, 2, publicKey, 5, digest);
  const [b, bumpB] = deriveMessageApprovalAddress(dwalletProgram, 2, publicKey, 5, digest);
  assert.equal(a.toBase58(), b.toBase58());
  assert.equal(bumpA, bumpB);
});

test("deriveMessageApprovalAddress matches canonical dWallet seed layout", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const publicKey = new Uint8Array(64).fill(0x44);
  const digest = new Uint8Array(32).fill(0xab);
  const metadataDigest = new Uint8Array(32).fill(0x55);

  const actual = deriveMessageApprovalAddress(
    dwalletProgram,
    2,
    publicKey,
    5,
    digest,
    metadataDigest,
  );
  const expected = manualMessageApprovalAddress(
    dwalletProgram,
    2,
    publicKey,
    5,
    digest,
    metadataDigest,
  );

  assert.equal(actual[0].toBase58(), expected[0].toBase58());
  assert.equal(actual[1], expected[1]);
});

test("deriveMessageApprovalAddress differs by publicKey", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const digest = new Uint8Array(32).fill(0x01);
  const [a] = deriveMessageApprovalAddress(
    dwalletProgram,
    2,
    new Uint8Array(32).fill(0x01),
    5,
    digest,
  );
  const [b] = deriveMessageApprovalAddress(
    dwalletProgram,
    2,
    new Uint8Array(32).fill(0x02),
    5,
    digest,
  );
  assert.notEqual(a.toBase58(), b.toBase58());
});

test("deriveMessageApprovalAddress differs by digest", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const publicKey = new Uint8Array(32).fill(0x44);
  const digestA = new Uint8Array(32).fill(0x01);
  const digestB = new Uint8Array(32).fill(0x02);
  const [a] = deriveMessageApprovalAddress(dwalletProgram, 2, publicKey, 5, digestA);
  const [b] = deriveMessageApprovalAddress(dwalletProgram, 2, publicKey, 5, digestB);
  assert.notEqual(a.toBase58(), b.toBase58());
});

test("deriveMessageApprovalAddress includes non-zero metadata digest only", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const publicKey = new Uint8Array(32).fill(0x44);
  const digest = new Uint8Array(32).fill(0x01);
  const omitted = deriveMessageApprovalAddress(dwalletProgram, 2, publicKey, 5, digest);
  const zero = deriveMessageApprovalAddress(
    dwalletProgram,
    2,
    publicKey,
    5,
    digest,
    new Uint8Array(32),
  );
  const metadata = deriveMessageApprovalAddress(
    dwalletProgram,
    2,
    publicKey,
    5,
    digest,
    new Uint8Array(32).fill(0x55),
  );

  assert.equal(omitted[0].toBase58(), zero[0].toBase58());
  assert.notEqual(omitted[0].toBase58(), metadata[0].toBase58());
});

test("deriveMessageApprovalAddress rejects non-32-byte digest", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const publicKey = new Uint8Array(32).fill(0x44);
  assert.throws(
    () => deriveMessageApprovalAddress(dwalletProgram, 2, publicKey, 5, new Uint8Array(16)),
    /32 bytes/,
  );
  assert.throws(
    () => deriveMessageApprovalAddress(dwalletProgram, 2, publicKey, 5, new Uint8Array(0)),
    /32 bytes/,
  );
  assert.throws(
    () => deriveMessageApprovalAddress(dwalletProgram, 2, publicKey, 5, new Uint8Array(33)),
    /32 bytes/,
  );
});

test("deriveMessageApprovalAddress rejects invalid seed fields", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const digest = new Uint8Array(32).fill(0x01);
  assert.throws(
    () => deriveMessageApprovalAddress(dwalletProgram, -1, new Uint8Array(32), 5, digest),
    /u16/,
  );
  assert.throws(
    () => deriveMessageApprovalAddress(dwalletProgram, 2, new Uint8Array(0), 5, digest),
    /publicKey/,
  );
  assert.throws(
    () =>
      deriveMessageApprovalAddress(
        dwalletProgram,
        2,
        new Uint8Array(32),
        5,
        digest,
        new Uint8Array(31),
      ),
    /32 bytes/,
  );
});

test("deriveMessageApprovalAddress returns off-curve PDA", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const publicKey = new Uint8Array(32).fill(0x44);
  const digest = new Uint8Array(32).fill(0xff);
  const [pda] = deriveMessageApprovalAddress(dwalletProgram, 2, publicKey, 5, digest);
  assert.equal(PublicKey.isOnCurve(pda.toBytes()), false);
});

test("policy-control PDA helpers match canonical seeds", () => {
  const programId = Keypair.generate().publicKey;
  const treasury = Keypair.generate().publicKey;
  const authority = Keypair.generate().publicKey;
  const operator = Keypair.generate().publicKey;
  const attester = Keypair.generate().publicKey;
  const groupId = new Uint8Array(16).fill(0x33);

  const expectedSimulation = PublicKey.findProgramAddressSync(
    [POLICY_SIMULATION_SEED, treasury.toBuffer(), u64Le(7)],
    programId,
  );
  const expectedReceipt = PublicKey.findProgramAddressSync(
    [POLICY_RECEIPT_SEED, treasury.toBuffer(), u64Le(8)],
    programId,
  );
  const expectedEnvelope = PublicKey.findProgramAddressSync(
    [BUDGET_ENVELOPE_SEED, treasury.toBuffer(), u64Le(9)],
    programId,
  );
  const expectedExposure = PublicKey.findProgramAddressSync(
    [EXPOSURE_GROUP_SEED, authority.toBuffer(), Buffer.from(groupId)],
    programId,
  );
  const expectedRole = PublicKey.findProgramAddressSync(
    [OPERATOR_ROLE_SEED, treasury.toBuffer(), operator.toBuffer()],
    programId,
  );
  const expectedLiveness = PublicKey.findProgramAddressSync(
    [EXTERNAL_LIVENESS_SEED, treasury.toBuffer()],
    programId,
  );
  const expectedAttestation = PublicKey.findProgramAddressSync(
    [POLICY_ATTESTATION_SEED, treasury.toBuffer(), attester.toBuffer(), u64Le(10)],
    programId,
  );
  const expectedBatch = PublicKey.findProgramAddressSync(
    [BATCH_PROPOSAL_SEED, treasury.toBuffer(), u64Le(11)],
    programId,
  );
  const expectedReport = PublicKey.findProgramAddressSync(
    [INVARIANT_REPORT_SEED, treasury.toBuffer(), u64Le(12)],
    programId,
  );

  assert.equal(derivePolicySimulationAddress(treasury, 7, programId)[0].toBase58(), expectedSimulation[0].toBase58());
  assert.equal(derivePolicyReceiptAddress(treasury, 8, programId)[0].toBase58(), expectedReceipt[0].toBase58());
  assert.equal(deriveBudgetEnvelopeAddress(treasury, 9, programId)[0].toBase58(), expectedEnvelope[0].toBase58());
  assert.equal(deriveExposureGroupAddress(authority, groupId, programId)[0].toBase58(), expectedExposure[0].toBase58());
  assert.equal(deriveOperatorRoleAddress(treasury, operator, programId)[0].toBase58(), expectedRole[0].toBase58());
  assert.equal(deriveExternalLivenessAddress(treasury, programId)[0].toBase58(), expectedLiveness[0].toBase58());
  assert.equal(derivePolicyAttestationAddress(treasury, attester, 10, programId)[0].toBase58(), expectedAttestation[0].toBase58());
  assert.equal(deriveBatchProposalAddress(treasury, 11, programId)[0].toBase58(), expectedBatch[0].toBase58());
  assert.equal(deriveInvariantReportAddress(treasury, 12, programId)[0].toBase58(), expectedReport[0].toBase58());
});

test("policy-control PDA helpers validate fixed-width inputs", () => {
  const authority = Keypair.generate().publicKey;
  assert.throws(
    () => deriveExposureGroupAddress(authority, new Uint8Array(15)),
    /16 bytes/,
  );
  assert.throws(
    () => deriveBudgetEnvelopeAddress(Keypair.generate().publicKey, -1),
    /u64/,
  );
});
