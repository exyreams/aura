/**
 * PDA derivation helpers for the AURA program and its CPI targets.
 *
 * All seeds mirror the constants in `programs/aura-core/src/constants.rs`.
 * Each function returns `[address, bump]` — the same tuple shape as
 * `PublicKey.findProgramAddressSync` — so callers can destructure as needed.
 */

import { PublicKey } from "@solana/web3.js";

import {
  AURA_PROGRAM_ID,
  BATCH_PROPOSAL_SEED,
  BUDGET_ENVELOPE_SEED,
  DWALLET_CPI_AUTHORITY_SEED,
  DWALLET_SEED,
  ENCRYPT_CPI_AUTHORITY_SEED,
  ENCRYPT_EVENT_AUTHORITY_SEED,
  EXTERNAL_LIVENESS_SEED,
  EXPOSURE_GROUP_SEED,
  INVARIANT_REPORT_SEED,
  MESSAGE_APPROVAL_SEED,
  OPERATOR_ROLE_SEED,
  POLICY_ATTESTATION_SEED,
  POLICY_RECEIPT_SEED,
  POLICY_SIMULATION_SEED,
  TREASURY_SEED,
} from "./constants.js";

/**
 * Derives the treasury PDA for a given owner and agent ID.
 *
 * Seeds: `[b"treasury", owner, agentId]`
 *
 * @param owner     The treasury owner's public key.
 * @param agentId   The unique agent identifier string used at creation time.
 * @param programId Defaults to the deployed `AURA_PROGRAM_ID`.
 */
export function deriveTreasuryAddress(
  owner: PublicKey,
  agentId: string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TREASURY_SEED, owner.toBuffer(), Buffer.from(agentId, "utf8")],
    programId,
  );
}

/**
 * Derives AURA's dWallet CPI authority PDA.
 *
 * Seeds: `[b"__ika_cpi_authority"]`
 *
 * This PDA is passed as the `cpiAuthority` account in `execute_pending` so
 * the AURA program can sign the `approve_message` CPI to the dWallet program.
 *
 * @param programId Defaults to the deployed `AURA_PROGRAM_ID`.
 */
export function deriveDwalletCpiAuthorityAddress(
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([DWALLET_CPI_AUTHORITY_SEED], programId);
}

/**
 * Derives AURA's Encrypt CPI authority PDA.
 *
 * Seeds: `[b"__encrypt_cpi_authority"]`
 *
 * Passed as `cpiAuthority` in confidential proposal and decryption
 * instructions so the AURA program can sign Encrypt network CPIs.
 *
 * @param programId Defaults to the deployed `AURA_PROGRAM_ID`.
 */
export function deriveEncryptCpiAuthorityAddress(
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([ENCRYPT_CPI_AUTHORITY_SEED], programId);
}

/**
 * Derives the Encrypt program's event authority PDA.
 *
 * Seeds: `[b"__event_authority"]` — derived on the **Encrypt program**, not AURA.
 *
 * Required as `eventAuthority` in any instruction that emits Encrypt events
 * via CPI.
 *
 * @param encryptProgramId The Ika Encrypt program ID.
 */
export function deriveEncryptEventAuthorityAddress(
  encryptProgramId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([ENCRYPT_EVENT_AUTHORITY_SEED], encryptProgramId);
}

function u64Le(value: bigint | number | string, label: string): Buffer {
  const bigintValue =
    typeof value === "bigint"
      ? value
      : typeof value === "number"
        ? BigInt(value)
        : BigInt(value);
  if (bigintValue < 0n || bigintValue > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit in u64`);
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(bigintValue);
  return bytes;
}

function fixedBytes(value: Uint8Array, len: number, label: string): Buffer {
  if (value.length !== len) {
    throw new Error(`${label} must be ${len} bytes, got ${value.length}`);
  }
  return Buffer.from(value);
}

/** Derives the policy simulation result PDA. */
export function derivePolicySimulationAddress(
  treasury: PublicKey,
  simulationId: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_SIMULATION_SEED, treasury.toBuffer(), u64Le(simulationId, "simulationId")],
    programId,
  );
}

/** Derives the policy receipt PDA for a proposal. */
export function derivePolicyReceiptAddress(
  treasury: PublicKey,
  proposalId: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_RECEIPT_SEED, treasury.toBuffer(), u64Le(proposalId, "proposalId")],
    programId,
  );
}

/** Derives a budget envelope PDA. */
export function deriveBudgetEnvelopeAddress(
  treasury: PublicKey,
  envelopeId: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BUDGET_ENVELOPE_SEED, treasury.toBuffer(), u64Le(envelopeId, "envelopeId")],
    programId,
  );
}

/** Derives an exposure group PDA from authority and 16-byte group ID. */
export function deriveExposureGroupAddress(
  authority: PublicKey,
  groupId: Uint8Array,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXPOSURE_GROUP_SEED, authority.toBuffer(), fixedBytes(groupId, 16, "groupId")],
    programId,
  );
}

/** Derives the operator role PDA for one treasury/operator pair. */
export function deriveOperatorRoleAddress(
  treasury: PublicKey,
  operator: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [OPERATOR_ROLE_SEED, treasury.toBuffer(), operator.toBuffer()],
    programId,
  );
}

/** Derives the external liveness PDA for a treasury. */
export function deriveExternalLivenessAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTERNAL_LIVENESS_SEED, treasury.toBuffer()],
    programId,
  );
}

/** Derives the policy attestation PDA for one attester and policy version. */
export function derivePolicyAttestationAddress(
  treasury: PublicKey,
  attester: PublicKey,
  policyVersion: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      POLICY_ATTESTATION_SEED,
      treasury.toBuffer(),
      attester.toBuffer(),
      u64Le(policyVersion, "policyVersion"),
    ],
    programId,
  );
}

/** Derives the batch proposal PDA. */
export function deriveBatchProposalAddress(
  treasury: PublicKey,
  batchId: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BATCH_PROPOSAL_SEED, treasury.toBuffer(), u64Le(batchId, "batchId")],
    programId,
  );
}

/** Derives the invariant report PDA. */
export function deriveInvariantReportAddress(
  treasury: PublicKey,
  reportId: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [INVARIANT_REPORT_SEED, treasury.toBuffer(), u64Le(reportId, "reportId")],
    programId,
  );
}

function u16Le(value: number, label: string): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${label} must be a u16 integer`);
  }
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

/**
 * Derives the `MessageApproval` PDA on the dWallet program.
 *
 * Seeds:
 * `[b"dwallet", <curveCodeLe + publicKey chunks...>, b"message_approval",
 *   <signatureSchemeCodeLe>, messageDigest, optional messageMetadataDigest]`
 *
 * This mirrors `aura-core::find_message_approval_pda`, so SDK clients derive
 * the same approval account that `execute_pending` stores on-chain.
 *
 * @param dwalletProgramId  The Ika dWallet program ID.
 * @param curveCode         Ika dWallet curve code: 0 secp256k1, 1 secp256r1,
 *                          2 ed25519, 3 ristretto.
 * @param publicKey         Raw dWallet public key bytes.
 * @param signatureSchemeCode Ika signature scheme code used in approve_message.
 * @param messageDigest     The 32-byte Keccak-256 digest of the message to sign.
 *                          Throws if the digest is not exactly 32 bytes.
 * @param messageMetadataDigest Optional 32-byte metadata digest. All-zero or
 *                              omitted digest is excluded from PDA seeds.
 */
export function deriveMessageApprovalAddress(
  dwalletProgramId: PublicKey,
  curveCode: number,
  publicKey: Uint8Array,
  signatureSchemeCode: number,
  messageDigest: Uint8Array,
  messageMetadataDigest?: Uint8Array,
): [PublicKey, number] {
  if (publicKey.length === 0) {
    throw new Error("publicKey must not be empty");
  }
  if (messageDigest.length !== 32) {
    throw new Error(`messageDigest must be 32 bytes, got ${messageDigest.length}`);
  }
  if (messageMetadataDigest !== undefined && messageMetadataDigest.length !== 32) {
    throw new Error(
      `messageMetadataDigest must be 32 bytes, got ${messageMetadataDigest.length}`,
    );
  }

  const payload = Buffer.concat([u16Le(curveCode, "curveCode"), Buffer.from(publicKey)]);
  const publicKeySeeds: Buffer[] = [];
  for (let offset = 0; offset < payload.length; offset += 32) {
    publicKeySeeds.push(payload.subarray(offset, offset + 32));
  }

  const seeds: Buffer[] = [
    DWALLET_SEED,
    ...publicKeySeeds,
    MESSAGE_APPROVAL_SEED,
    u16Le(signatureSchemeCode, "signatureSchemeCode"),
    Buffer.from(messageDigest),
  ];
  if (messageMetadataDigest?.some((byte) => byte !== 0)) {
    seeds.push(Buffer.from(messageMetadataDigest));
  }

  return PublicKey.findProgramAddressSync(
    seeds,
    dwalletProgramId,
  );
}
