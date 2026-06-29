use aura_policy::{Chain, PolicyDecision, TransactionType};

use crate::state::{ComplianceMetadata, SignatureScheme};

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
    /// Submitted with trigger conditions that are not yet met; parked until a
    /// `try_trigger` finds them satisfied (or the TTL expires).
    AwaitingCondition,
    /// Trigger conditions were satisfied and the request was promoted into the
    /// normal pending execution queue. It is not finalized yet.
    Triggered,
    /// The dWallet network has signed the chain-native transaction payload.
    Signed,
    /// A relayer has broadcast the signed transaction to the target chain.
    Broadcast,
    /// The target chain settlement has reached the required confirmation depth.
    Settled,
}

/// Optional chain-native replay-protection fields bound into the dWallet
/// message digest.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ChainExecutionBinding {
    pub evm_chain_id: Option<u64>,
    pub replay_nonce: Option<u64>,
    pub gas_limit: Option<u64>,
    pub max_fee_native: Option<u128>,
    /// Digest of the exact byte payload that Ika must approve for signing.
    ///
    /// For Solana this is `keccak256(compiled_transaction_message)`. For EVM
    /// and Bitcoin this is the Ika MessageApproval digest of the exact bytes
    /// passed to `requestSign`, after the caller has constructed the native
    /// transaction/sighash payload.
    pub native_message_hash: Option<[u8; 32]>,
    pub calldata_hash: Option<[u8; 32]>,
    pub utxo_set_hash: Option<[u8; 32]>,
    pub sighash_type: Option<u32>,
    pub solana_recent_blockhash: Option<[u8; 32]>,
    pub solana_message_hash: Option<[u8; 32]>,
    pub confirmations_required: Option<u16>,
}

impl ChainExecutionBinding {
    pub fn is_empty(&self) -> bool {
        self.evm_chain_id.is_none()
            && self.replay_nonce.is_none()
            && self.gas_limit.is_none()
            && self.max_fee_native.is_none()
            && self.native_message_hash.is_none()
            && self.calldata_hash.is_none()
            && self.utxo_set_hash.is_none()
            && self.sighash_type.is_none()
            && self.solana_recent_blockhash.is_none()
            && self.solana_message_hash.is_none()
            && self.confirmations_required.is_none()
    }
}

/// Optional chain-native transfer payload bound to a proposal.
///
/// Legacy proposals leave every field `None` and keep the historical USD-only
/// message format. When any field is set, the proposal digest and dWallet
/// message also bind the concrete asset/native amount/gas payload.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TransferDetails {
    pub asset_id: Option<String>,
    pub native_amount: Option<u128>,
    pub decimals: Option<u8>,
    pub gas_native_amount: Option<u128>,
    pub gas_asset_id: Option<String>,
    pub execution_binding: ChainExecutionBinding,
}

impl TransferDetails {
    pub fn is_legacy(&self) -> bool {
        !self.has_asset_payload() && self.execution_binding.is_empty()
    }

    pub fn has_asset_payload(&self) -> bool {
        self.asset_id.is_some()
            || self.native_amount.is_some()
            || self.decimals.is_some()
            || self.gas_native_amount.is_some()
            || self.gas_asset_id.is_some()
    }

    pub fn requires_wallet_settlement(&self) -> bool {
        self.has_asset_payload()
    }

    pub fn has_chain_binding(&self) -> bool {
        !self.execution_binding.is_empty()
    }
}

/// Tracks an in-flight decryption request submitted to the Encrypt network.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingDecryptionRequest {
    /// The ciphertext account whose plaintext is being requested.
    pub ciphertext_account: String,
    /// The decryption request PDA account created by the Encrypt program.
    pub request_account: String,
    /// Guardrail epoch bound at request time when the confidential sidecar is supplied.
    pub guardrail_epoch_id: Option<u64>,
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
    /// Hex-encoded metadata digest included in the message approval PDA derivation.
    pub message_metadata_digest: String,
    /// Signature scheme used by the dWallet.
    pub signature_scheme: SignatureScheme,
    /// Unix timestamp when the request was submitted.
    pub requested_at: i64,
}

/// A single distinct approval recorded against a pending proposal.
///
/// Multi-party authorization tallies these per proposal: a quorum is reached
/// when the count of distinct approvers meets `required_signatures` (plain
/// M-of-N) or the summed `weight` meets `required_approval_weight`
/// (weighted / role-based). `weight` is captured at approval time from the
/// guardian's entry in `EmergencyMultisig` so later weight changes don't
/// retroactively alter an already-collected tally.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovalRecord {
    /// Pubkey (base58) of the guardian or owner who approved.
    pub approver: String,
    /// Voting weight this approver contributed (1 for plain M-of-N).
    pub weight: u16,
    /// `ApprovalLevel` code this approval was supplied at.
    pub level: u8,
    /// Unix timestamp the approval was recorded.
    pub at: i64,
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
    /// FHE type code of `policy_output_ciphertext_account` (`4` = u64).
    pub policy_output_fhe_type: Option<u8>,
    /// Chain on which the transaction will be executed.
    pub target_chain: Chain,
    /// Category of the transaction.
    pub tx_type: TransactionType,
    /// Transaction amount in USD.
    pub amount_usd: u64,
    /// Optional chain-native asset/gas payload.
    pub transfer: TransferDetails,
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
    /// Composite risk score copied from `decision` for quick access.
    pub risk_score: u8,
    /// Approval ladder level required before the proposal can execute.
    pub required_approval_level: u8,
    /// Highest approval ladder level that has been satisfied.
    pub satisfied_approval_level: u8,
    /// Distinct approvals collected for this proposal (multi-party / M-of-N).
    pub approvals: Vec<ApprovalRecord>,
    /// Earliest Unix timestamp at which execution may proceed. Zero means immediate.
    pub earliest_execution_at: i64,
    /// Whether execution requires a guardian co-signature.
    pub requires_guardian_cosign: bool,
    /// Policy version used when this proposal was evaluated.
    pub policy_version: u32,
    /// Optional compliance metadata attached at proposal time.
    pub compliance_metadata: Option<ComplianceMetadata>,
}
