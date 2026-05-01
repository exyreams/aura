//! Create policy-evaluated batch proposal records.
//!
//! Batch proposals let clients pre-check multiple actions as one aggregate
//! request while still preserving per-item violations and approval requirements.

use anchor_lang::prelude::*;
use aura_policy::{evaluate_batch_policy, BatchProposalItem};

use crate::{
    constants::{BATCH_PROPOSAL_SEED, MAX_BATCH_ITEMS, TREASURY_SEED},
    program_accounts::{
        chain_from_code, transaction_type_from_code, violation_code, BatchProposalAccount,
        BatchProposalItemRecord, TreasuryAccount, BATCH_PROPOSAL_SPACE,
    },
};

/// One transaction-like item inside a batch proposal.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BatchProposalItemArgs {
    /// USD amount evaluated for this item.
    pub amount_usd: u64,
    /// Target chain code.
    pub chain: u8,
    /// Transaction type code.
    pub tx_type: u8,
    /// Recipient address or contract identifier.
    pub recipient_or_contract: String,
    /// Optional protocol identifier for protocol-scoped policies.
    pub protocol_id: Option<u8>,
}

/// Instruction data for `propose_batch`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProposeBatchArgs {
    /// Caller-defined batch identifier used in the batch PDA seed.
    pub batch_id: u64,
    /// Unix timestamp used for policy evaluation and account creation.
    pub now: i64,
    /// Batch items to evaluate in order.
    pub items: Vec<BatchProposalItemArgs>,
}

#[derive(Accounts)]
#[instruction(args: ProposeBatchArgs)]
pub struct ProposeBatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = payer,
        space = BATCH_PROPOSAL_SPACE,
        seeds = [BATCH_PROPOSAL_SEED, treasury.key().as_ref(), &args.batch_id.to_le_bytes()],
        bump
    )]
    pub batch: Box<Account<'info, BatchProposalAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn propose_batch(ctx: Context<ProposeBatch>, args: ProposeBatchArgs) -> Result<()> {
    require!(!args.items.is_empty(), crate::AuraCoreError::EmptyBatch);
    require!(
        args.items.len() <= MAX_BATCH_ITEMS,
        crate::AuraCoreError::BatchTooLarge
    );
    let domain = ctx.accounts.treasury.to_domain_boxed()?;
    let items = args
        .items
        .iter()
        .map(|item| {
            Ok(BatchProposalItem {
                amount_usd: item.amount_usd,
                chain: chain_from_code(item.chain)?,
                tx_type: transaction_type_from_code(item.tx_type)?,
                recipient_or_contract: item.recipient_or_contract.clone(),
                protocol_id: item.protocol_id,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let decision = evaluate_batch_policy(
        &domain.policy_config,
        &domain.policy_state,
        &items,
        args.now,
    );

    let batch = &mut ctx.accounts.batch;
    batch.bump = ctx.bumps.batch;
    batch.treasury = ctx.accounts.treasury.key();
    batch.batch_id = args.batch_id;
    batch.created_at = args.now;
    batch.approved = decision.approved;
    batch.violation_code = violation_code(decision.violation);
    batch.aggregate_amount_usd = decision.aggregate_amount_usd;
    batch.required_approval_level = decision.required_approval_level.code();
    batch.item_count = decision.item_count as u8;
    batch.item_violations = decision
        .item_violations
        .iter()
        .copied()
        .map(violation_code)
        .collect();
    batch.items = args
        .items
        .into_iter()
        .map(|item| BatchProposalItemRecord {
            amount_usd: item.amount_usd,
            chain: item.chain,
            tx_type: item.tx_type,
            recipient_or_contract: item.recipient_or_contract,
            protocol_id: item.protocol_id,
        })
        .collect();
    Ok(())
}
