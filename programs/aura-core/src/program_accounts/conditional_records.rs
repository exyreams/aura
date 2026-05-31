use super::*;

/// Fixed allocation for a [`ConditionalProposal`] account.
pub const CONDITIONAL_PROPOSAL_SPACE: usize = 8 + ConditionalProposal::INIT_SPACE;

/// A proposal parked off the treasury until its trigger conditions are met.
///
/// Held in its own PDA (`[CONDITIONAL_PROPOSAL_SEED, treasury, proposal_id]`) so
/// it never grows the size-capped treasury pending queue. When `try_trigger`
/// finds the conditions satisfied it **promotes** the stored transaction into
/// the normal pending/execution flow via the shared `propose_transaction` path,
/// which runs the full policy engine.
#[account]
#[derive(InitSpace)]
pub struct ConditionalProposal {
    pub bump: u8,
    pub treasury: Pubkey,
    pub proposal_id: u64,
    /// `proposal_status_code`: `AwaitingCondition` while parked, `Triggered`
    /// once promoted into normal pending execution, `Expired`/`Cancelled`
    /// otherwise.
    pub status: u8,
    /// Pending proposal id created when this conditional request is promoted.
    pub promoted_proposal_id: Option<u64>,
    /// AI authority that submitted this proposal (authorizes promotion).
    pub ai_authority: Pubkey,
    pub amount_usd: u64,
    pub target_chain: u8,
    pub tx_type: u8,
    pub protocol_id: Option<u8>,
    #[max_len(128)]
    pub recipient_or_contract: String,
    pub created_at: i64,
    pub expires_at: i64,
    #[max_len(4)]
    pub conditions: Vec<ConditionRecord>,
    pub combinator: u8,
}
