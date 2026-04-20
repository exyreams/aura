/**
 * Typed account structs for every `aura-core` instruction group.
 *
 * Each interface maps directly to the `accountsStrict` call in the
 * corresponding `AuraClient` method. Fields are named in camelCase to match
 * the Anchor-generated client; the on-chain seeds and constraints are defined
 * in the program itself.
 */

import type { PublicKey } from "@solana/web3.js";

/** Accounts required by any instruction that the treasury owner signs. */
export interface OwnerTreasuryAccounts {
  /** The treasury owner — must be a signer. */
  owner: PublicKey;
  /** The treasury PDA derived from `[b"treasury", owner, agentId]`. */
  treasury: PublicKey;
}

/** Accounts required by any instruction that the AI authority signs. */
export interface AiAuthorityTreasuryAccounts {
  /** The AI agent authorized to submit proposals — must be a signer. */
  aiAuthority: PublicKey;
  /** The treasury PDA. */
  treasury: PublicKey;
}

/** Accounts required by guardian override instructions. */
export interface GuardianTreasuryAccounts {
  /** A registered guardian — must be a signer. */
  guardian: PublicKey;
  /** The treasury PDA. */
  treasury: PublicKey;
}

/** Accounts required by operator execution instructions. */
export interface OperatorTreasuryAccounts {
  /** The operator driving the execution lifecycle — must be a signer. */
  operator: PublicKey;
  /** The treasury PDA. */
  treasury: PublicKey;
}

/**
 * Accounts for `configure_confidential_guardrails`.
 *
 * Attaches three separate scalar `EUint64` ciphertext accounts to the
 * treasury: daily limit, per-transaction limit, and the running spent-today
 * counter.
 */
export interface ConfigureConfidentialGuardrailsAccounts extends OwnerTreasuryAccounts {
  /** Ciphertext account holding the encrypted daily spending limit. */
  dailyLimitCiphertext: PublicKey;
  /** Ciphertext account holding the encrypted per-transaction limit. */
  perTxLimitCiphertext: PublicKey;
  /** Ciphertext account holding the encrypted running spent-today counter. */
  spentTodayCiphertext: PublicKey;
}

/**
 * Accounts for `configure_confidential_vector_guardrails`.
 *
 * Attaches a single `EUint64Vector` ciphertext that encodes all three
 * guardrail values in one account instead of three separate scalars.
 */
export interface ConfigureConfidentialVectorGuardrailsAccounts
  extends OwnerTreasuryAccounts {
  /** Vector ciphertext encoding `[daily_limit, per_tx_limit, spent_today]`. */
  guardrailVectorCiphertext: PublicKey;
}

/**
 * Accounts for `propose_confidential_transaction` (scalar FHE path).
 *
 * Requires the three scalar guardrail ciphertexts plus the Ika Encrypt
 * program accounts needed to submit the FHE computation CPI.
 */
export interface ProposeConfidentialTransactionAccounts
  extends AiAuthorityTreasuryAccounts {
  /** Encrypted daily limit ciphertext account. */
  dailyLimitCiphertext: PublicKey;
  /** Encrypted per-transaction limit ciphertext account. */
  perTxLimitCiphertext: PublicKey;
  /** Encrypted spent-today counter ciphertext account. */
  spentTodayCiphertext: PublicKey;
  /** Freshly created ciphertext account for the encrypted transaction amount. */
  amountCiphertext: PublicKey;
  /** Output ciphertext account that will hold the encrypted policy decision. */
  policyOutputCiphertext: PublicKey;
  /** Ika Encrypt program ID. */
  encryptProgram: PublicKey;
  /** Encrypt program global config account. */
  config: PublicKey;
  /** Deposit account used to pay for FHE computation. */
  deposit: PublicKey;
  /** The AURA program itself, passed as the CPI caller. */
  callerProgram: PublicKey;
  /** AURA's Encrypt CPI authority PDA (`[b"__encrypt_cpi_authority"]`). */
  cpiAuthority: PublicKey;
  /** The Encrypt network's public encryption key account. */
  networkEncryptionKey: PublicKey;
  /** Encrypt program event authority PDA (`[b"__event_authority"]`). */
  eventAuthority: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/**
 * Accounts for `propose_confidential_vector_transaction` (vector FHE path).
 *
 * Uses a single `EUint64Vector` guardrail ciphertext instead of three
 * separate scalars. The output vector ciphertext is promoted to become the
 * new guardrail after each approved transaction, rotating the encrypted state
 * forward automatically.
 */
export interface ProposeConfidentialVectorTransactionAccounts
  extends AiAuthorityTreasuryAccounts {
  /** Vector ciphertext encoding the current guardrail state. */
  guardrailVectorCiphertext: PublicKey;
  /** Freshly created vector ciphertext for the encrypted transaction amount. */
  amountVectorCiphertext: PublicKey;
  /** Output vector ciphertext that will hold the policy result. */
  policyResultVectorCiphertext: PublicKey;
  /** Ika Encrypt program ID. */
  encryptProgram: PublicKey;
  /** Encrypt program global config account. */
  config: PublicKey;
  /** Deposit account used to pay for FHE computation. */
  deposit: PublicKey;
  /** The AURA program itself, passed as the CPI caller. */
  callerProgram: PublicKey;
  /** AURA's Encrypt CPI authority PDA. */
  cpiAuthority: PublicKey;
  /** The Encrypt network's public encryption key account. */
  networkEncryptionKey: PublicKey;
  /** Encrypt program event authority PDA. */
  eventAuthority: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/**
 * Accounts for `execute_pending`.
 *
 * Submits an `approve_message` CPI to the Ika dWallet program once the
 * policy engine has approved the pending proposal.
 */
export interface ExecutePendingAccounts extends OperatorTreasuryAccounts {
  /** The `MessageApproval` PDA derived on the dWallet program. */
  messageApproval: PublicKey;
  /** The dWallet account that will co-sign the transaction. */
  dwallet: PublicKey;
  /** The AURA program itself, passed as the CPI caller. */
  callerProgram: PublicKey;
  /** AURA's dWallet CPI authority PDA (`[b"__ika_cpi_authority"]`). */
  cpiAuthority: PublicKey;
  /** Ika dWallet program ID. */
  dwalletProgram: PublicKey;
  /** dWallet coordinator account. */
  dwalletCoordinator: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/**
 * Accounts for `request_policy_decryption`.
 *
 * Submits a decryption request to the Ika Encrypt network for the policy
 * output ciphertext produced during a confidential proposal.
 */
export interface RequestPolicyDecryptionAccounts extends OperatorTreasuryAccounts {
  /** Freshly created account that will track the decryption request. */
  requestAccount: PublicKey;
  /** The policy output ciphertext account to decrypt. */
  ciphertext: PublicKey;
  /** Ika Encrypt program ID. */
  encryptProgram: PublicKey;
  /** Encrypt program global config account. */
  config: PublicKey;
  /** Deposit account used to pay for decryption. */
  deposit: PublicKey;
  /** The AURA program itself, passed as the CPI caller. */
  callerProgram: PublicKey;
  /** AURA's Encrypt CPI authority PDA. */
  cpiAuthority: PublicKey;
  /** The Encrypt network's public encryption key account. */
  networkEncryptionKey: PublicKey;
  /** Encrypt program event authority PDA. */
  eventAuthority: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/**
 * Accounts for `confirm_policy_decryption`.
 *
 * Reads the decrypted violation code from the request account, applies the
 * policy decision to the pending proposal, and advances the proposal state.
 */
export interface ConfirmPolicyDecryptionAccounts extends OperatorTreasuryAccounts {
  /** The decryption request account populated by the Encrypt network. */
  requestAccount: PublicKey;
}

/**
 * Accounts for `finalize_execution`.
 *
 * Verifies the dWallet signature returned by the Ika network and closes the
 * proposal, advancing the treasury's total transaction counter.
 */
export interface FinalizeExecutionAccounts extends OperatorTreasuryAccounts {
  /** The `MessageApproval` PDA that holds the dWallet signature. */
  messageApproval: PublicKey;
}
