//! Anchor account records for receipts, simulations, and invariant reports.
//!
//! These PDAs make policy decisions and operational checks indexable without
//! replaying the full treasury domain state off-chain.

use super::*;

/// Allocated size for a `PolicyReceiptAccount`.
pub const POLICY_RECEIPT_SPACE: usize = 8 + 512;
/// Allocated size for a `PolicySimulationResultAccount`.
pub const POLICY_SIMULATION_SPACE: usize = 8 + 512;
/// Allocated size for an `InvariantReportAccount`.
pub const INVARIANT_REPORT_SPACE: usize = 8 + 384;

/// Explainable receipt for a proposal's policy decision.
#[account]
#[derive(InitSpace)]
pub struct PolicyReceiptAccount {
    /// PDA bump for the receipt account.
    pub bump: u8,
    /// Treasury this receipt belongs to.
    pub treasury: Pubkey,
    /// Proposal ID evaluated by the receipt.
    pub proposal_id: u64,
    /// Policy version used for evaluation.
    pub policy_version: u32,
    /// Serialized approve/deny decision.
    pub decision: u8,
    /// Primary serialized violation code.
    pub primary_violation: u8,
    /// Risk score from the policy engine.
    pub risk_score: u8,
    /// Bitmap of rule outcomes included in the explanation.
    pub rule_outcome_bitmap: u128,
    /// Approval level required by policy.
    pub required_approval_level: u8,
    /// Approval level already satisfied on the proposal.
    pub satisfied_approval_level: u8,
    /// Effective daily limit after reputation and policy modifiers.
    pub effective_limit_usd: u64,
    /// Remaining daily budget at evaluation time.
    pub remaining_daily_usd: u64,
    /// Proposal amount evaluated by policy.
    pub evaluated_amount_usd: u64,
    /// Aggregate amount for batch receipts; equal to proposal amount for single tx receipts.
    pub aggregate_amount_usd: u64,
    /// Number of batch items represented by the receipt.
    pub batch_item_count: u8,
    /// Unix timestamp when the receipt was written.
    pub created_at: i64,
    /// Optional commitment to confidential inputs.
    pub confidential_input_commitment: Option<[u8; 32]>,
    /// Optional commitment to confidential outputs.
    pub confidential_output_commitment: Option<[u8; 32]>,
    /// Optional hash tying a decryption result to this receipt.
    pub decrypt_request_hash: Option<[u8; 32]>,
    /// Whether a matching policy attestation was supplied.
    pub policy_attested: bool,
}

/// Stored result for a non-mutating policy simulation.
#[account]
#[derive(InitSpace)]
pub struct PolicySimulationResultAccount {
    /// PDA bump for the simulation result.
    pub bump: u8,
    /// Treasury this simulation belongs to.
    pub treasury: Pubkey,
    /// Caller-provided simulation identifier.
    pub simulation_id: u64,
    /// Unix timestamp used as evaluation time.
    pub checked_at: i64,
    /// Whether the simulated transaction would pass.
    pub approved: bool,
    /// Primary violation code, if denied.
    pub violation_code: u8,
    /// Risk score from simulation.
    pub risk_score: u8,
    /// Effective daily limit used by simulation.
    pub effective_daily_limit_usd: u64,
    /// Remaining daily budget after the hypothetical amount.
    pub remaining_daily_budget_usd: u64,
    /// Bitmap of rule outcomes in the simulation.
    pub rule_outcome_bitmap: u128,
    /// Approval ladder level required for the simulated action.
    pub required_approval_level: u8,
    /// Simulated transaction amount.
    pub amount_usd: u64,
    /// Serialized target chain.
    pub target_chain: u8,
    /// Serialized transaction type.
    pub tx_type: u8,
}

/// Result of checking treasury/account invariants.
#[account]
#[derive(InitSpace)]
pub struct InvariantReportAccount {
    /// PDA bump for the invariant report.
    pub bump: u8,
    /// Treasury this report belongs to.
    pub treasury: Pubkey,
    /// Unix timestamp when checks were run.
    pub checked_at: i64,
    /// Solana slot when checks were run.
    pub checked_at_slot: u64,
    /// Bitmap of invariant checks that passed.
    pub passed_bitmap: u128,
    /// Bitmap of invariant checks that failed.
    pub failed_bitmap: u128,
    /// Bitmap of non-fatal warning conditions.
    pub warning_bitmap: u128,
    /// Treasury schema version observed during the check.
    pub schema_version: u8,
    /// Treasury policy version observed during the check.
    pub policy_version: u32,
}

impl InvariantReportAccount {
    /// Marks an invariant bit as passed or failed.
    pub fn mark(&mut self, bit: u8, passed: bool) {
        if passed {
            self.passed_bitmap |= 1u128 << bit;
            self.failed_bitmap &= !(1u128 << bit);
        } else {
            self.failed_bitmap |= 1u128 << bit;
            self.passed_bitmap &= !(1u128 << bit);
        }
    }

    /// Marks a non-fatal warning bit.
    pub fn warn(&mut self, bit: u8) {
        self.warning_bitmap |= 1u128 << bit;
    }
}
