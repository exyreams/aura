use super::*;

pub const BATCH_PROPOSAL_SPACE: usize = 8 + 1024;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct BatchProposalItemRecord {
    pub amount_usd: u64,
    pub chain: u8,
    pub tx_type: u8,
    #[max_len(128)]
    pub recipient_or_contract: String,
    pub protocol_id: Option<u8>,
}

#[account]
#[derive(InitSpace)]
pub struct BatchProposalAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub batch_id: u64,
    pub created_at: i64,
    pub approved: bool,
    pub violation_code: u8,
    pub aggregate_amount_usd: u64,
    pub required_approval_level: u8,
    pub item_count: u8,
    #[max_len(8)]
    pub item_violations: Vec<u8>,
    #[max_len(8)]
    pub items: Vec<BatchProposalItemRecord>,
}
