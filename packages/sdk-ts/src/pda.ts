/**
 * PDA derivation helpers for the AURA program and its CPI targets.
 *
 * All seeds mirror the constants in `programs/aura-core/src/constants.rs`.
 * Each function returns `[address, bump]` — the same tuple shape as
 * `PublicKey.findProgramAddressSync` — so callers can destructure as needed.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { PublicKey } from "@solana/web3.js";

import {
  ACTIVITY_LOG_SEED,
  ADDRESS_LIST_SEED,
  AURA_PROGRAM_ID,
  BATCH_PROPOSAL_SEED,
  BILLING_TEMPLATE_SEED,
  BUDGET_ENVELOPE_SEED,
  CHAIN_PROFILE_SEED,
  CONDITIONAL_PROPOSAL_SEED,
  CONFIDENTIAL_GUARDRAILS_SEED,
  DWALLET_CPI_AUTHORITY_SEED,
  DWALLET_SEED,
  DWALLET_STATE_SEED,
  ENCRYPT_CPI_AUTHORITY_SEED,
  ENCRYPT_EVENT_AUTHORITY_SEED,
  EXPOSURE_GROUP_SEED,
  EXTERNAL_LIVENESS_SEED,
  FEE_SCHEDULE_SEED,
  FEE_VAULT_SEED,
  HEALTH_SCORE_SEED,
  INVARIANT_REPORT_SEED,
  MESSAGE_APPROVAL_SEED,
  OPERATOR_ROLE_SEED,
  POLICY_ATTESTATION_SEED,
  POLICY_CANARY_SEED,
  POLICY_CHECK_SEED,
  POLICY_HISTORY_SEED,
  POLICY_RECEIPT_SEED,
  POLICY_SIMULATION_SEED,
  POLICY_TEMPLATE_SEED,
  PROTOCOL_CONFIG_SEED,
  SCHEDULED_INTENT_SEED,
  SESSION_KEY_SEED,
  SNAPSHOT_SEED,
  SWARM_POOL_SEED,
  TREASURY_ANALYTICS_SEED,
  TREASURY_SEED,
  TRUST_IDENTITY_SEED,
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
  return PublicKey.findProgramAddressSync(
    [DWALLET_CPI_AUTHORITY_SEED],
    programId,
  );
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
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_CPI_AUTHORITY_SEED],
    programId,
  );
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
  return PublicKey.findProgramAddressSync(
    [ENCRYPT_EVENT_AUTHORITY_SEED],
    encryptProgramId,
  );
}

function u64Le(value: bigint | number | string, label: string): Uint8Array {
  const bigintValue =
    typeof value === "bigint"
      ? value
      : typeof value === "number"
        ? BigInt(value)
        : BigInt(value);
  if (bigintValue < 0n || bigintValue > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit in u64`);
  }
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigUint64(
    0,
    bigintValue,
    true,
  );
  return bytes;
}

function fixedBytes(value: Uint8Array, len: number, label: string): Uint8Array {
  if (value.length !== len) {
    throw new Error(`${label} must be ${len} bytes, got ${value.length}`);
  }
  return Uint8Array.from(value);
}

function u32Le(value: number, label: string): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${label} must be a u32 integer`);
  }
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    0,
    value,
    true,
  );
  return bytes;
}

function u8Byte(value: number, label: string): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${label} must be a u8 integer`);
  }
  return Uint8Array.of(value);
}

/** Derives the policy simulation result PDA. */
export function derivePolicySimulationAddress(
  treasury: PublicKey,
  simulationId: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      POLICY_SIMULATION_SEED,
      treasury.toBuffer(),
      u64Le(simulationId, "simulationId"),
    ],
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
    [
      BUDGET_ENVELOPE_SEED,
      treasury.toBuffer(),
      u64Le(envelopeId, "envelopeId"),
    ],
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
    [
      EXPOSURE_GROUP_SEED,
      authority.toBuffer(),
      fixedBytes(groupId, 16, "groupId"),
    ],
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
  policyVersion: number,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      POLICY_ATTESTATION_SEED,
      treasury.toBuffer(),
      attester.toBuffer(),
      u32Le(policyVersion, "policyVersion"),
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

function u16Le(value: number, label: string): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${label} must be a u16 integer`);
  }
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(
    0,
    value,
    true,
  );
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
    throw new Error(
      `messageDigest must be 32 bytes, got ${messageDigest.length}`,
    );
  }
  if (
    messageMetadataDigest !== undefined &&
    messageMetadataDigest.length !== 32
  ) {
    throw new Error(
      `messageMetadataDigest must be 32 bytes, got ${messageMetadataDigest.length}`,
    );
  }

  const payload = new Uint8Array(2 + publicKey.length);
  payload.set(u16Le(curveCode, "curveCode"), 0);
  payload.set(publicKey, 2);

  const publicKeySeeds: Uint8Array[] = [];
  for (let offset = 0; offset < payload.length; offset += 32) {
    publicKeySeeds.push(payload.subarray(offset, offset + 32));
  }

  const seeds: Uint8Array[] = [
    DWALLET_SEED,
    ...publicKeySeeds,
    MESSAGE_APPROVAL_SEED,
    u16Le(signatureSchemeCode, "signatureSchemeCode"),
    messageDigest,
  ];
  if (messageMetadataDigest?.some((byte) => byte !== 0)) {
    seeds.push(messageMetadataDigest);
  }

  return PublicKey.findProgramAddressSync(seeds, dwalletProgramId);
}

// ---------------------------------------------------------------------------
// Per-treasury sidecar PDAs — seeds: `[SEED, treasury]`
//
// Each treasury has at most one of these accounts. The on-chain constraints
// bind the sidecar to its parent treasury, so the address is fully determined
// by the treasury PDA.
// ---------------------------------------------------------------------------

/** Derives the activity-log PDA for a treasury. Seeds: `[b"activity_log", treasury]`. */
export function deriveActivityLogAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ACTIVITY_LOG_SEED, treasury.toBuffer()],
    programId,
  );
}

/** Derives the address-list PDA for a treasury. Seeds: `[b"address_list", treasury]`. */
export function deriveAddressListAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ADDRESS_LIST_SEED, treasury.toBuffer()],
    programId,
  );
}

/** Derives the confidential guardrails sidecar PDA. Seeds: `[b"confidential_guardrails", treasury]`. */
export function deriveConfidentialGuardrailsAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIDENTIAL_GUARDRAILS_SEED, treasury.toBuffer()],
    programId,
  );
}

/** Derives the fee-schedule sidecar PDA for a treasury. Seeds: `[b"fee_schedule", treasury]`. */
export function deriveFeeScheduleAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FEE_SCHEDULE_SEED, treasury.toBuffer()],
    programId,
  );
}

/** Derives the protocol-fee vault PDA for a treasury. Seeds: `[b"fee_vault", treasury]`. */
export function deriveFeeVaultAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FEE_VAULT_SEED, treasury.toBuffer()],
    programId,
  );
}

/** Derives the health-score PDA for a treasury. Seeds: `[b"health_score", treasury]`. */
export function deriveHealthScoreAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [HEALTH_SCORE_SEED, treasury.toBuffer()],
    programId,
  );
}

/** Derives the shadow/canary policy candidate PDA. Seeds: `[b"policy_canary", treasury]`. */
export function derivePolicyCanaryAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_CANARY_SEED, treasury.toBuffer()],
    programId,
  );
}

/** Derives the policy-history PDA for a treasury. Seeds: `[b"policy_history", treasury]`. */
export function derivePolicyHistoryAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_HISTORY_SEED, treasury.toBuffer()],
    programId,
  );
}

/** Derives the analytics + audit-commitment sidecar PDA. Seeds: `[b"treasury_analytics", treasury]`. */
export function deriveTreasuryAnalyticsAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TREASURY_ANALYTICS_SEED, treasury.toBuffer()],
    programId,
  );
}

/** Derives the trust + identity PDA for a treasury. Seeds: `[b"trust_identity", treasury]`. */
export function deriveTrustIdentityAddress(
  treasury: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TRUST_IDENTITY_SEED, treasury.toBuffer()],
    programId,
  );
}

// ---------------------------------------------------------------------------
// Per-treasury indexed PDAs — seeds: `[SEED, treasury, idLe]`
// ---------------------------------------------------------------------------

/** Derives a parked conditional proposal PDA. Seeds: `[b"conditional_proposal", treasury, proposalId(u64 le)]`. */
export function deriveConditionalProposalAddress(
  treasury: PublicKey,
  proposalId: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      CONDITIONAL_PROPOSAL_SEED,
      treasury.toBuffer(),
      u64Le(proposalId, "proposalId"),
    ],
    programId,
  );
}

/** Derives a scheduled intent PDA. Seeds: `[b"scheduled_intent", treasury, intentId(u64 le)]`. */
export function deriveScheduledIntentAddress(
  treasury: PublicKey,
  intentId: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SCHEDULED_INTENT_SEED, treasury.toBuffer(), u64Le(intentId, "intentId")],
    programId,
  );
}

/**
 * Derives a periodic snapshot PDA.
 *
 * Seeds: `[b"treasury_snapshot", treasury, snapshotIndex(u32 le)]`.
 *
 * Note: `snapshotIndex` is a `u32` on-chain (4-byte little-endian), unlike the
 * `u64` proposal/intent identifiers.
 */
export function deriveSnapshotAddress(
  treasury: PublicKey,
  snapshotIndex: number,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SNAPSHOT_SEED, treasury.toBuffer(), u32Le(snapshotIndex, "snapshotIndex")],
    programId,
  );
}

// ---------------------------------------------------------------------------
// Per-treasury keyed PDAs — seeds: `[SEED, treasury, pubkey]`
// ---------------------------------------------------------------------------

/** Derives a session-key PDA. Seeds: `[b"session_key", treasury, sessionKey]`. */
export function deriveSessionKeyAddress(
  treasury: PublicKey,
  sessionKey: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SESSION_KEY_SEED, treasury.toBuffer(), sessionKey.toBuffer()],
    programId,
  );
}

/** Derives a policy-check result PDA for one treasury/caller pair. Seeds: `[b"policy_check", treasury, caller]`. */
export function derivePolicyCheckAddress(
  treasury: PublicKey,
  caller: PublicKey,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_CHECK_SEED, treasury.toBuffer(), caller.toBuffer()],
    programId,
  );
}

// ---------------------------------------------------------------------------
// Owner-scoped template PDAs — seeds: `[SEED, owner, templateId(u64 le)]`
// ---------------------------------------------------------------------------

/** Derives a user-authored policy template PDA. Seeds: `[b"policy_template", owner, templateId(u64 le)]`. */
export function derivePolicyTemplateAddress(
  owner: PublicKey,
  templateId: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_TEMPLATE_SEED, owner.toBuffer(), u64Le(templateId, "templateId")],
    programId,
  );
}

/** Derives a user-authored billing template PDA. Seeds: `[b"billing_template", owner, templateId(u64 le)]`. */
export function deriveBillingTemplateAddress(
  owner: PublicKey,
  templateId: bigint | number | string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BILLING_TEMPLATE_SEED, owner.toBuffer(), u64Le(templateId, "templateId")],
    programId,
  );
}

// ---------------------------------------------------------------------------
// Chain / dWallet / singleton PDAs
// ---------------------------------------------------------------------------

/**
 * Derives a per-chain profile PDA.
 *
 * Seeds: `[b"chain_profile", [chainCode]]` — note there is **no treasury
 * component**; chain profiles are global per `chainCode`.
 *
 * @param chainCode Ika chain code (u8).
 */
export function deriveChainProfileAddress(
  chainCode: number,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CHAIN_PROFILE_SEED, u8Byte(chainCode, "chainCode")],
    programId,
  );
}

/**
 * Derives AURA's per-dWallet runtime state PDA.
 *
 * Seeds: `[b"dwallet_state", treasury, [chain]]`. One account per treasury per
 * chain code. This is AURA's own state account, distinct from the external
 * dWallet program's accounts derived by {@link deriveMessageApprovalAddress}.
 *
 * @param chain Chain code (u8) the dWallet is registered for.
 */
export function deriveDwalletStateAddress(
  treasury: PublicKey,
  chain: number,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DWALLET_STATE_SEED, treasury.toBuffer(), u8Byte(chain, "chain")],
    programId,
  );
}

/** Derives the global protocol-config singleton PDA. Seeds: `[b"protocol_config"]`. */
export function deriveProtocolConfigAddress(
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PROTOCOL_CONFIG_SEED], programId);
}

// ---------------------------------------------------------------------------
// Swarm pool PDA — seeds: `[SEED, sha256(swarmId)]`
// ---------------------------------------------------------------------------

/**
 * Computes the 32-byte swarm-pool id hash the program stores as
 * `swarm_pool.swarm_id_hash` — `sha256(swarmId)`. This mirrors the on-chain
 * `swarm_pool_seeds` helper.
 */
export function hashSwarmId(swarmId: string): Uint8Array {
  return sha256(Buffer.from(swarmId, "utf8"));
}

/**
 * Derives a shared swarm pool PDA.
 *
 * Seeds: `[b"swarm_pool", sha256(swarmId)]`.
 *
 * @param swarmId Either the raw swarm id string (hashed for you) or the
 *                precomputed 32-byte `swarm_id_hash`.
 */
export function deriveSwarmPoolAddress(
  swarmId: string | Uint8Array,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  const hash =
    typeof swarmId === "string"
      ? hashSwarmId(swarmId)
      : fixedBytes(swarmId, 32, "swarmIdHash");
  return PublicKey.findProgramAddressSync(
    [SWARM_POOL_SEED, Buffer.from(hash)],
    programId,
  );
}
