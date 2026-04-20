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
  DWALLET_CPI_AUTHORITY_SEED,
  ENCRYPT_CPI_AUTHORITY_SEED,
  ENCRYPT_EVENT_AUTHORITY_SEED,
  MESSAGE_APPROVAL_SEED,
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

/**
 * Derives the `MessageApproval` PDA on the dWallet program.
 *
 * Seeds: `[b"message_approval", dwalletAccount, messageDigest]`
 *
 * This PDA is created by `execute_pending` and read by `finalize_execution`
 * to verify the dWallet co-signature.
 *
 * @param dwalletProgramId  The Ika dWallet program ID.
 * @param dwalletAccount    The dWallet account public key.
 * @param messageDigest     The 32-byte SHA-256 digest of the message to sign.
 *                          Throws if the digest is not exactly 32 bytes.
 */
export function deriveMessageApprovalAddress(
  dwalletProgramId: PublicKey,
  dwalletAccount: PublicKey,
  messageDigest: Uint8Array,
): [PublicKey, number] {
  if (messageDigest.length !== 32) {
    throw new Error(`messageDigest must be 32 bytes, got ${messageDigest.length}`);
  }
  return PublicKey.findProgramAddressSync(
    [MESSAGE_APPROVAL_SEED, dwalletAccount.toBuffer(), Buffer.from(messageDigest)],
    dwalletProgramId,
  );
}
