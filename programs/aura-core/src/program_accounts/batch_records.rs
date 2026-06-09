//! Anchor account records for batch policy evaluation.
//!
//! Batch accounts store aggregate and per-item policy outcomes for multi-action
//! proposals without immediately mutating treasury spend state.

use super::*;

/// Allocated size for a `BatchProposalAccount`.
pub const BATCH_PROPOSAL_SPACE: usize = 8 + 1536;

/// Serialized transaction item inside a batch proposal.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct BatchProposalItemRecord {
    /// USD amount requested by this item.
    pub amount_usd: u64,
    /// Serialized `Chain` code.
    pub chain: u8,
    /// Serialized `TransactionType` code.
    pub tx_type: u8,
    /// Recipient address or contract identifier.
    #[max_len(128)]
    pub recipient_or_contract: String,
    /// Optional protocol identifier used by allowlist/risk checks.
    pub protocol_id: Option<u8>,
}

/// Persistent result of evaluating a batch proposal.
#[account]
#[derive(InitSpace)]
pub struct BatchProposalAccount {
    /// PDA bump for the batch account.
    pub bump: u8,
    /// Treasury this batch belongs to.
    pub treasury: Pubkey,
    /// Caller-provided batch identifier.
    pub batch_id: u64,
    /// Unix timestamp when the batch was evaluated.
    pub created_at: i64,
    /// Whether the aggregate batch passed policy.
    pub approved: bool,
    /// Primary aggregate violation code.
    pub violation_code: u8,
    /// Sum of item amounts in USD.
    pub aggregate_amount_usd: u64,
    /// Approval ladder level required for the batch.
    pub required_approval_level: u8,
    /// Number of evaluated items.
    pub item_count: u8,
    /// Per-item violation codes, aligned with `items`.
    #[max_len(8)]
    pub item_violations: Vec<u8>,
    /// Serialized batch items.
    #[max_len(8)]
    pub items: Vec<BatchProposalItemRecord>,
    /// Whether this proposal was evaluated through confidential vector FHE.
    pub confidential: bool,
    /// Whether confidential vector outputs have been reduced/decrypted into a final result.
    pub confidential_result_ready: bool,
    /// Public active item count inside fixed-width confidential vectors.
    pub confidential_item_count: u8,
    /// Encrypt ciphertext containing packed confidential item amounts.
    pub amount_vector_ciphertext: Option<Pubkey>,
    /// Encrypt ciphertext containing packed confidential per-item limits.
    pub per_item_limit_vector_ciphertext: Option<Pubkey>,
    /// Encrypt ciphertext receiving packed per-item violation flags.
    pub item_violation_vector_ciphertext: Option<Pubkey>,
}
