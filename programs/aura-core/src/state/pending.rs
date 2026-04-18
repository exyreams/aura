use aura_policy::{Chain, PolicyDecision, TransactionType};

use crate::state::SignatureScheme;

/// Lifecycle stage of a pending proposal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProposalStatus {
    /// Submitted by the AI; policy decision recorded but not yet executed.
    Proposed,
    /// A decryption request has been submitted to the Encrypt network.
    DecryptionRequested,
    /// An `approve_message` CPI has been submitted; waiting for the dWallet signature.
    SignaturePending,
    /// The transaction was executed successfully.
    Executed,
    /// The policy engine denied the proposal.
    Denied,
    /// The treasury owner cancelled the proposal.
    Cancelled,
    /// The proposal's TTL elapsed before it could be executed.
    Expired,
}

/// Tracks an in-flight decryption request submitted to the Encrypt network.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingDecryptionRequest {
    /// The ciphertext account whose plaintext is being requested.
    pub ciphertext_account: String,
    /// The decryption request PDA account created by the Encrypt program.
    pub request_account: String,
    /// Hex-encoded digest of the ciphertext at submission time, used for tamper detection.
    pub expected_digest: String,
    /// Unix timestamp when the request was submitted.
    pub requested_at: i64,
    /// Unix timestamp when the plaintext was verified, if complete.
    pub verified_at: Option<i64>,
    /// SHA-256 digest of the decrypted plaintext bytes, set after verification.
    pub plaintext_sha256: Option<String>,
}

/// Tracks an in-flight `approve_message` request submitted to the dWallet network.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingSignatureRequest {
    /// The dWallet account that will produce the signature.
    pub dwallet_account: String,
    /// The `MessageApproval` PDA account created by the dWallet program.
    pub message_approval_account: String,
    /// Stable identifier for this approval, used in audit events.
    pub approval_id: String,
    /// Hex-encoded Keccak-256 digest of the chain message.
    pub message_digest: String,
    /// Hex-encoded metadata digest included in the MetadataV2 PDA derivation.
    pub message_metadata_digest: String,
    /// Signature scheme used by the dWallet.
    pub signature_scheme: SignatureScheme,
    /// Unix timestamp when the request was submitted.
    pub requested_at: i64,
}

/// The single in-flight proposal on an agent treasury.
///
/// At most one `PendingTransaction` exists at a time. It progresses through
/// `ProposalStatus` stages as the execution pipeline advances.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingTransaction {
    /// Monotonically increasing proposal identifier.
    pub proposal_id: u64,
    /// Deterministic digest of the proposal's key fields, included in the chain message.
    pub proposal_digest: String,
    /// Name of the FHE policy graph used to evaluate this proposal.
    pub policy_graph_name: String,
    /// Digest binding the off-chain policy decision to the on-chain state.
    pub policy_output_digest: String,
    /// Encrypt ciphertext account holding the encrypted violation code (confidential proposals only).
    pub policy_output_ciphertext_account: Option<String>,
    /// FHE type code of `policy_output_ciphertext_account` (`4` = u64, `35` = vector).
    pub policy_output_fhe_type: Option<u8>,
    /// Chain on which the transaction will be executed.
    pub target_chain: Chain,
    /// Category of the transaction.
    pub tx_type: TransactionType,
    /// Transaction amount in USD.
    pub amount_usd: u64,
    /// Destination address or contract on the target chain.
    pub recipient_or_contract: String,
    /// Optional DeFi protocol identifier for whitelist checks.
    pub protocol_id: Option<u8>,
    /// Unix timestamp when the proposal was submitted.
    pub submitted_at: i64,
    /// Unix timestamp after which the proposal expires.
    pub expires_at: i64,
    /// Unix timestamp of the most recent status update.
    pub last_updated_at: i64,
    /// Number of times `execute_pending` has been attempted.
    pub execution_attempts: u32,
    /// Current lifecycle stage.
    pub status: ProposalStatus,
    /// In-flight decryption request, if one has been submitted.
    pub decryption_request: Option<PendingDecryptionRequest>,
    /// In-flight signature request, if one has been submitted.
    pub signature_request: Option<PendingSignatureRequest>,
    /// The policy decision recorded at proposal time.
    pub decision: PolicyDecision,
}
