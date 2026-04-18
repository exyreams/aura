use aura_policy::{RuleOutcome, ViolationCode};

use crate::state::{ProposalStatus, SignatureScheme};

/// The outcome record produced after a proposal is executed or denied.
///
/// Returned by `finalize_signed_pending` and `deny_pending_transaction`,
/// then emitted as a program event via `emit_execution_event`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutionReceipt {
    /// The proposal ID this receipt corresponds to.
    pub proposal_id: u64,
    /// Deterministic digest of the proposal's key fields.
    pub proposal_digest: String,
    /// Name of the FHE policy graph used.
    pub policy_graph_name: String,
    /// Digest binding the policy decision to the on-chain state.
    pub policy_output_digest: String,
    /// Decryption request account ID, if a decryption was performed.
    pub decryption_request_id: Option<String>,
    /// Decryption request PDA account address.
    pub decryption_request_account: Option<String>,
    /// Ciphertext account that was decrypted.
    pub decryption_ciphertext_account: Option<String>,
    /// Final lifecycle stage of the proposal.
    pub final_status: ProposalStatus,
    /// Whether the policy engine approved the proposal.
    pub approved: bool,
    /// Violation code if denied; `None` if approved.
    pub violation: ViolationCode,
    /// Stable identifier for the `MessageApproval` account.
    pub message_approval_id: Option<String>,
    /// Address of the `MessageApproval` PDA account.
    pub message_approval_account: Option<String>,
    /// Hex-encoded Keccak-256 digest of the signed chain message.
    pub message_digest: Option<String>,
    /// Hex-encoded metadata digest used in MetadataV2 PDA derivation.
    pub message_metadata_digest: Option<String>,
    /// The canonical chain message string that was signed.
    pub signed_message: Option<String>,
    /// Hex-encoded raw signature bytes from the dWallet network.
    pub signature: Option<String>,
    /// Signature scheme used to produce the signature.
    pub signature_scheme: Option<SignatureScheme>,
    /// Protocol fee charged for this transaction, in USD.
    pub transaction_fee_usd: u64,
    /// The effective daily limit after reputation scaling.
    pub effective_daily_limit_usd: u64,
    /// Full policy rule evaluation trace.
    pub trace: Vec<RuleOutcome>,
}
