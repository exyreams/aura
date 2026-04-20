import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, PublicKey } from "@solana/web3.js";

import {
  AURA_PROGRAM_ID,
  deriveDwalletCpiAuthorityAddress,
  deriveEncryptCpiAuthorityAddress,
  deriveEncryptEventAuthorityAddress,
  deriveMessageApprovalAddress,
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

test("deriveMessageApprovalAddress is deterministic", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const dwalletAccount = Keypair.generate().publicKey;
  const digest = new Uint8Array(32).fill(0xab);
  const [a, bumpA] = deriveMessageApprovalAddress(dwalletProgram, dwalletAccount, digest);
  const [b, bumpB] = deriveMessageApprovalAddress(dwalletProgram, dwalletAccount, digest);
  assert.equal(a.toBase58(), b.toBase58());
  assert.equal(bumpA, bumpB);
});

test("deriveMessageApprovalAddress differs by dwalletAccount", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const digest = new Uint8Array(32).fill(0x01);
  const [a] = deriveMessageApprovalAddress(dwalletProgram, Keypair.generate().publicKey, digest);
  const [b] = deriveMessageApprovalAddress(dwalletProgram, Keypair.generate().publicKey, digest);
  assert.notEqual(a.toBase58(), b.toBase58());
});

test("deriveMessageApprovalAddress differs by digest", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const dwalletAccount = Keypair.generate().publicKey;
  const digestA = new Uint8Array(32).fill(0x01);
  const digestB = new Uint8Array(32).fill(0x02);
  const [a] = deriveMessageApprovalAddress(dwalletProgram, dwalletAccount, digestA);
  const [b] = deriveMessageApprovalAddress(dwalletProgram, dwalletAccount, digestB);
  assert.notEqual(a.toBase58(), b.toBase58());
});

test("deriveMessageApprovalAddress rejects non-32-byte digest", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const dwalletAccount = Keypair.generate().publicKey;
  assert.throws(
    () => deriveMessageApprovalAddress(dwalletProgram, dwalletAccount, new Uint8Array(16)),
    /32 bytes/,
  );
  assert.throws(
    () => deriveMessageApprovalAddress(dwalletProgram, dwalletAccount, new Uint8Array(0)),
    /32 bytes/,
  );
  assert.throws(
    () => deriveMessageApprovalAddress(dwalletProgram, dwalletAccount, new Uint8Array(33)),
    /32 bytes/,
  );
});

test("deriveMessageApprovalAddress returns off-curve PDA", () => {
  const dwalletProgram = Keypair.generate().publicKey;
  const dwalletAccount = Keypair.generate().publicKey;
  const digest = new Uint8Array(32).fill(0xff);
  const [pda] = deriveMessageApprovalAddress(dwalletProgram, dwalletAccount, digest);
  assert.equal(PublicKey.isOnCurve(pda.toBytes()), false);
});
