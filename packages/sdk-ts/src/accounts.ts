/**
 * Typed account structs for every `aura-core` instruction group.
 *
 * Each interface maps directly to the `accountsStrict` call in the
 * corresponding `AuraClient` method. Fields are named in camelCase to match
 * the Anchor-generated client; the on-chain seeds and constraints are defined
 * in the program itself.
 */

import type { PublicKey } from "@solana/web3.js";

/** Optional Anchor account value. Pass `null` when the instruction path does not use it. */
export type OptionalAccount = PublicKey | null;

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

/** Optional policy-control accounts accepted by public proposal instructions. */
export interface OptionalPolicyControlAccounts {
  /** Optional session key authorization account. */
  sessionKeyAccount?: OptionalAccount;
  /** Optional shared swarm pool account. */
  swarmPool?: OptionalAccount;
  /** Optional address list account. */
  addressList?: OptionalAccount;
  /** Optional compliance oracle account. */
  complianceOracle?: OptionalAccount;
  /** Optional parent treasury account for child spend budgets. */
  parentTreasury?: OptionalAccount;
  /** Optional budget envelope account. */
  budgetEnvelope?: OptionalAccount;
  /** Optional exposure group account. */
  exposureGroup?: OptionalAccount;
}

/** Accounts for `propose_transaction`. */
export interface ProposeTransactionAccounts
  extends AiAuthorityTreasuryAccounts,
    OptionalPolicyControlAccounts {}

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
  /** Optional liveness record when policy requires fresh Encrypt evidence. */
  externalLiveness?: OptionalAccount;
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
  messageApproval?: OptionalAccount;
  /** The dWallet account that will co-sign the transaction. */
  dwallet?: OptionalAccount;
  /** The AURA program itself, passed as the CPI caller. */
  callerProgram: PublicKey;
  /** AURA's dWallet CPI authority PDA (`[b"__ika_cpi_authority"]`). */
  cpiAuthority?: OptionalAccount;
  /** Ika dWallet program ID. */
  dwalletProgram?: OptionalAccount;
  /** dWallet coordinator account. */
  dwalletCoordinator?: OptionalAccount;
  /** Optional liveness record when policy requires fresh dWallet evidence. */
  externalLiveness?: OptionalAccount;
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
  /** Optional swarm pool account updated after finalization. */
  swarmPool?: OptionalAccount;
  /** Optional budget envelope account updated after finalization. */
  budgetEnvelope?: OptionalAccount;
  /** Optional exposure group account updated after finalization. */
  exposureGroup?: OptionalAccount;
  /** Optional liveness record when policy requires fresh dWallet evidence. */
  externalLiveness?: OptionalAccount;
}

/** Accounts for `simulate_policy`. */
export interface SimulatePolicyAccounts {
  /** Payer funding the simulation result account. */
  payer: PublicKey;
  /** Treasury being simulated. */
  treasury: PublicKey;
  /** Optional operator role proving simulation permission. */
  operatorRole?: OptionalAccount;
  /** PDA that stores the simulation result. */
  simulationResult: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `write_policy_receipt`. */
export interface WritePolicyReceiptAccounts {
  /** Payer funding the receipt account. */
  payer: PublicKey;
  /** Treasury whose pending proposal is being snapshotted. */
  treasury: PublicKey;
  /** PDA that stores the immutable receipt. */
  receipt: PublicKey;
  /** Optional policy attestation to link with the receipt. */
  attestation?: OptionalAccount;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `configure_budget_envelope`. */
export interface ConfigureBudgetEnvelopeAccounts extends OwnerTreasuryAccounts {
  /** PDA for the scoped envelope record. */
  budgetEnvelope: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `init_exposure_group`. */
export interface InitExposureGroupAccounts {
  /** Authority that owns exposure group membership. */
  authority: PublicKey;
  /** PDA for the exposure group. */
  exposureGroup: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `join_exposure_group`. */
export interface JoinExposureGroupAccounts {
  /** Exposure group authority. */
  authority: PublicKey;
  /** Exposure group PDA. */
  exposureGroup: PublicKey;
  /** Treasury being added to the exposure group. */
  treasury: PublicKey;
}

/** Accounts for `approve_pending_execution`. */
export interface ApprovePendingExecutionAccounts {
  /** Owner or guardian satisfying the pending approval requirement. */
  approver: PublicKey;
  /** Treasury containing the pending proposal. */
  treasury: PublicKey;
}

/** Accounts for `set_scoped_pause`. */
export interface SetScopedPauseAccounts extends OperatorTreasuryAccounts {
  /** Optional role account when a non-owner operator manages scoped pauses. */
  operatorRole?: OptionalAccount;
}

/** Accounts for `grant_operator_role`. */
export interface GrantOperatorRoleAccounts extends OwnerTreasuryAccounts {
  /** Operator receiving permissions. */
  operator: PublicKey;
  /** PDA storing the role grant. */
  operatorRole: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `revoke_operator_role`. */
export interface RevokeOperatorRoleAccounts extends OwnerTreasuryAccounts {
  /** Role account being revoked. */
  operatorRole: PublicKey;
}

/** Accounts for `init_external_liveness`. */
export interface InitExternalLivenessAccounts extends OwnerTreasuryAccounts {
  /** PDA storing external dependency freshness. */
  liveness: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `refresh_external_liveness`. */
export interface RefreshExternalLivenessAccounts extends OperatorTreasuryAccounts {
  /** Optional role account when a delegated operator refreshes liveness. */
  operatorRole?: OptionalAccount;
  /** Liveness account to update. */
  liveness: PublicKey;
}

/** Accounts for `attest_policy`. */
export interface AttestPolicyAccounts {
  /** Payer funding the attestation account. */
  payer: PublicKey;
  /** Attester signing the policy hash. */
  attester: PublicKey;
  /** Treasury whose current policy is being attested. */
  treasury: PublicKey;
  /** PDA storing the attestation. */
  attestation: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `propose_batch`. */
export interface ProposeBatchAccounts {
  /** Payer funding the batch proposal account. */
  payer: PublicKey;
  /** Treasury used for batch simulation. */
  treasury: PublicKey;
  /** PDA storing the batch result. */
  batch: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `check_invariants`. */
export interface CheckInvariantsAccounts {
  /** Payer funding the invariant report account. */
  payer: PublicKey;
  /** Treasury being checked. */
  treasury: PublicKey;
  /** PDA storing the invariant report. */
  report: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `migrate_treasury`. */
export interface MigrateTreasuryAccounts {
  /** Treasury account being reallocated to the latest schema. */
  treasury: PublicKey;
  /** Payer funding the realloc if rent increases. */
  payer: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `issue_session_key`. */
export interface IssueSessionKeyAccounts {
  /** Treasury owner or AI authority issuing the session key. */
  authority: PublicKey;
  /** Treasury that owns the session key. */
  treasury: PublicKey;
  /** PDA storing the session key limits. */
  sessionKeyAccount: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `revoke_session_key`. */
export interface RevokeSessionKeyAccounts {
  /** Treasury owner or AI authority revoking the key. */
  authority: PublicKey;
  /** Treasury that owns the session key. */
  treasury: PublicKey;
  /** PDA storing the session key limits. */
  sessionKeyAccount: PublicKey;
}

/** Accounts for `close_session_key`. */
export interface CloseSessionKeyAccounts extends RevokeSessionKeyAccounts {}

/** Accounts for `trigger_dead_mans_switch`. */
export interface TriggerDeadMansSwitchAccounts {
  /** Treasury whose dead-man switch should be evaluated. */
  treasury: PublicKey;
}

/** Accounts for `check_policy_cpi`. */
export interface CheckPolicyCpiAccounts {
  /** Calling integration account. */
  caller: PublicKey;
  /** Treasury being checked. */
  treasury: PublicKey;
  /** Payer funding the policy check result account. */
  feePayer: PublicKey;
  /** PDA storing the result for the caller. */
  result: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `init_health_score`. */
export interface InitHealthScoreAccounts extends OwnerTreasuryAccounts {
  /** PDA storing computed treasury health. */
  healthScore: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `refresh_health_score`. */
export interface RefreshHealthScoreAccounts extends OperatorTreasuryAccounts {
  /** Optional role account when a delegated operator refreshes health. */
  operatorRole?: OptionalAccount;
  /** PDA storing computed treasury health. */
  healthScore: PublicKey;
}

/** Accounts for `close_health_score`. */
export interface CloseHealthScoreAccounts extends OwnerTreasuryAccounts {
  /** Health score PDA being closed. */
  healthScore: PublicKey;
}

/** Accounts for `take_snapshot`. */
export interface TakeSnapshotAccounts {
  /** Owner or delegated operator funding the snapshot. */
  payer: PublicKey;
  /** Treasury being snapshotted. */
  treasury: PublicKey;
  /** Optional role account when a delegated operator takes snapshots. */
  operatorRole?: OptionalAccount;
  /** Current health score account. */
  healthScore: PublicKey;
  /** PDA storing the snapshot record. */
  snapshot: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `init_policy_history` and `record_policy_snapshot`. */
export interface InitPolicyHistoryAccounts extends OwnerTreasuryAccounts {
  /** PDA storing the policy history ring buffer. */
  policyHistory: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `close_snapshot`. */
export interface CloseSnapshotAccounts extends OwnerTreasuryAccounts {
  /** Snapshot PDA being closed. */
  snapshot: PublicKey;
}

/** Accounts for `init_activity_log`. */
export interface InitActivityLogAccounts extends OwnerTreasuryAccounts {
  /** PDA storing the activity log ring buffer. */
  activityLog: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `close_activity_log`. */
export interface CloseActivityLogAccounts extends OwnerTreasuryAccounts {
  /** Activity log PDA being closed. */
  activityLog: PublicKey;
}

/** Accounts for `init_swarm_pool`. */
export interface InitSwarmPoolAccounts {
  /** Creator funding the shared swarm pool. */
  creator: PublicKey;
  /** PDA storing the shared swarm pool. */
  swarmPool: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `join_swarm`. */
export interface JoinSwarmAccounts extends OwnerTreasuryAccounts {
  /** Shared swarm pool account the treasury joins. */
  swarmPool: PublicKey;
}

/** Accounts for `init_fee_vault`. */
export interface InitFeeVaultAccounts extends OwnerTreasuryAccounts {
  /** PDA storing protocol fee accounting. */
  feeVault: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `collect_fees`. */
export interface CollectFeesAccounts {
  /** Protocol fee recipient authorized to collect. */
  protocolAuthority: PublicKey;
  /** Fee vault account being drained. */
  feeVault: PublicKey;
  /** Recipient lamport account. */
  recipient: PublicKey;
}

/** Accounts for `close_fee_vault`. */
export interface CloseFeeVaultAccounts extends OwnerTreasuryAccounts {
  /** Fee vault PDA being closed. */
  feeVault: PublicKey;
}

/** Accounts for `init_address_list`. */
export interface InitAddressListAccounts extends OwnerTreasuryAccounts {
  /** PDA storing allow or deny list entries. */
  addressList: PublicKey;
  /** System program. */
  systemProgram: PublicKey;
}

/** Accounts for `manage_address_list`. */
export interface ManageAddressListAccounts extends OperatorTreasuryAccounts {
  /** Optional role account when a delegated operator manages lists. */
  operatorRole?: OptionalAccount;
  /** Address list PDA being updated. */
  addressList: PublicKey;
}

/** Accounts for `close_address_list`. */
export interface CloseAddressListAccounts extends OwnerTreasuryAccounts {
  /** Address list PDA being closed. */
  addressList: PublicKey;
}

/** Accounts for `close_policy_history`. */
export interface ClosePolicyHistoryAccounts extends OwnerTreasuryAccounts {
  /** Policy history PDA being closed. */
  policyHistory: PublicKey;
}

/** Accounts for `refresh_dwallet_balance`. */
export interface RefreshDwalletBalanceAccounts {
  /** Treasury whose dWallet balance cache is refreshed. */
  treasury: PublicKey;
  /** Oracle account whose first 8 bytes hold the USD balance. */
  balanceOracle: PublicKey;
}
