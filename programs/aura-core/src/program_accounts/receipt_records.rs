use super::*;

pub const POLICY_RECEIPT_SPACE: usize = 8 + 512;
pub const POLICY_SIMULATION_SPACE: usize = 8 + 512;
pub const INVARIANT_REPORT_SPACE: usize = 8 + 384;

#[account]
#[derive(InitSpace)]
pub struct PolicyReceiptAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub proposal_id: u64,
    pub policy_version: u32,
    pub decision: u8,
    pub primary_violation: u8,
    pub risk_score: u8,
    pub rule_outcome_bitmap: u128,
    pub required_approval_level: u8,
    pub satisfied_approval_level: u8,
    pub effective_limit_usd: u64,
    pub remaining_daily_usd: u64,
    pub evaluated_amount_usd: u64,
    pub aggregate_amount_usd: u64,
    pub batch_item_count: u8,
    pub created_at: i64,
    pub confidential_input_commitment: Option<[u8; 32]>,
    pub confidential_output_commitment: Option<[u8; 32]>,
    pub decrypt_request_hash: Option<[u8; 32]>,
    pub policy_attested: bool,
}

#[account]
#[derive(InitSpace)]
pub struct PolicySimulationResultAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub simulation_id: u64,
    pub checked_at: i64,
    pub approved: bool,
    pub violation_code: u8,
    pub risk_score: u8,
    pub effective_daily_limit_usd: u64,
    pub remaining_daily_budget_usd: u64,
    pub rule_outcome_bitmap: u128,
    pub required_approval_level: u8,
    pub amount_usd: u64,
    pub target_chain: u8,
    pub tx_type: u8,
}

#[account]
#[derive(InitSpace)]
pub struct InvariantReportAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub checked_at: i64,
    pub checked_at_slot: u64,
    pub passed_bitmap: u128,
    pub failed_bitmap: u128,
    pub warning_bitmap: u128,
    pub schema_version: u8,
    pub policy_version: u32,
}

impl InvariantReportAccount {
    pub fn mark(&mut self, bit: u8, passed: bool) {
        if passed {
            self.passed_bitmap |= 1u128 << bit;
            self.failed_bitmap &= !(1u128 << bit);
        } else {
            self.failed_bitmap |= 1u128 << bit;
            self.passed_bitmap &= !(1u128 << bit);
        }
    }

    pub fn warn(&mut self, bit: u8) {
        self.warning_bitmap |= 1u128 << bit;
    }
}
