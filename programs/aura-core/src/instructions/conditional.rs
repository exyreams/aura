//! Conditional / triggered proposals.
//!
//! `propose_conditional_transaction` submits a transaction that may only execute
//! once its trigger conditions hold. If they hold at submit time it is promoted
//! straight into the normal pending flow (running the full policy engine); if
//! not, it is **parked** in a `ConditionalProposal` PDA with status
//! `AwaitingCondition`. `try_trigger` (permissionless) re-checks a parked
//! proposal against the on-chain clock and promotes it when satisfied, or marks
//! it expired once its TTL elapses.

use anchor_lang::prelude::*;
use aura_policy::{evaluate_conditions, ConditionCombinator, ConditionContext, TransactionContext};

use crate::{
    constants::{CONDITIONAL_PROPOSAL_SEED, MAX_CONDITIONS_PER_PROPOSAL, TREASURY_SEED},
    instructions::sync_treasury_account,
    program_accounts::{
        chain_from_code, proposal_status_code, transaction_type_from_code, ConditionRecord,
        ConditionalProposal, TreasuryAccount, CONDITIONAL_PROPOSAL_SPACE,
    },
    state::ProposalStatus,
    AuraCoreError,
};

/// Instruction data for `propose_conditional_transaction`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConditionalProposalArgs {
    pub amount_usd: u64,
    pub target_chain: u8,
    pub tx_type: u8,
    pub protocol_id: Option<u8>,
    pub recipient_or_contract: String,
    pub ttl_secs: i64,
    pub conditions: Vec<ConditionRecord>,
    pub combinator: u8,
    /// AI-supplied submit time (this instruction is AI-gated, so trusted).
    pub now: i64,
}

fn validate_conditions(conditions: &[ConditionRecord]) -> Result<()> {
    require!(
        conditions.len() <= MAX_CONDITIONS_PER_PROPOSAL,
        AuraCoreError::TooManyConditions
    );
    for condition in conditions {
        // Price/oracle kinds (0,1,5) must bind a concrete feed so the value
        // cannot be forged by a caller-supplied account at trigger time.
        if matches!(condition.kind, 0 | 1 | 5) {
            require!(
                condition.feed.is_some(),
                AuraCoreError::InvalidExternalAccountData
            );
        }
    }
    Ok(())
}

/// Evaluates `conditions` against the (optional) bound feed account and `now`.
fn conditions_satisfied(
    conditions: &[ConditionRecord],
    combinator: u8,
    feed: Option<&UncheckedAccount>,
    now: i64,
) -> Result<bool> {
    if conditions.is_empty() {
        return Ok(true);
    }
    let feed_value = if let Some(feed) = feed {
        for condition in conditions {
            if let Some(expected) = condition.feed {
                require!(
                    expected == feed.key(),
                    AuraCoreError::InvalidExternalAccountData
                );
            }
        }
        let data = feed.try_borrow_data()?;
        require!(data.len() >= 8, AuraCoreError::InvalidExternalAccountData);
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&data[..8]);
        Some(u64::from_le_bytes(bytes))
    } else {
        None
    };
    let ctx = ConditionContext {
        now,
        available_usd: None,
        feed_price: feed_value,
        oracle_flag: feed_value.is_some_and(|value| value != 0),
    };
    let domain_conditions = conditions
        .iter()
        .map(ConditionRecord::to_domain)
        .collect::<Result<Vec<_>>>()?;
    Ok(evaluate_conditions(
        &ctx,
        &domain_conditions,
        ConditionCombinator::from_code(combinator),
    ))
}

fn build_tx(
    amount_usd: u64,
    target_chain: u8,
    tx_type: u8,
    protocol_id: Option<u8>,
    recipient: &str,
    now: i64,
) -> Result<TransactionContext> {
    Ok(TransactionContext {
        amount_usd,
        target_chain: chain_from_code(target_chain)?,
        tx_type: transaction_type_from_code(tx_type)?,
        protocol_id,
        current_timestamp: now,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
        recipient_or_contract: Some(recipient.to_string()),
    })
}

#[derive(Accounts)]
#[instruction(proposal_id: u64, args: ConditionalProposalArgs)]
pub struct ProposeConditionalTransaction<'info> {
    #[account(mut)]
    pub ai_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = ai_authority,
        space = CONDITIONAL_PROPOSAL_SPACE,
        seeds = [CONDITIONAL_PROPOSAL_SEED, treasury.key().as_ref(), &proposal_id.to_le_bytes()],
        bump
    )]
    pub conditional_proposal: Box<Account<'info, ConditionalProposal>>,
    /// CHECK: optional price/oracle feed bound to each condition's `feed`.
    pub condition_feed: Option<UncheckedAccount<'info>>,
    pub system_program: Program<'info, System>,
}

pub fn propose_conditional_transaction(
    ctx: Context<ProposeConditionalTransaction>,
    proposal_id: u64,
    args: ConditionalProposalArgs,
) -> Result<()> {
    let ai_authority = ctx.accounts.ai_authority.key();
    let treasury_key = ctx.accounts.treasury.key();

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    require!(
        domain.ai_authority == ai_authority.to_string(),
        AuraCoreError::UnauthorizedAi
    );
    validate_conditions(&args.conditions)?;
    chain_from_code(args.target_chain)?;
    transaction_type_from_code(args.tx_type)?;
    require!(
        args.recipient_or_contract.len() <= 128 && args.ttl_secs > 0,
        AuraCoreError::InvalidExternalAccountData
    );

    let met = conditions_satisfied(
        &args.conditions,
        args.combinator,
        ctx.accounts.condition_feed.as_ref(),
        args.now,
    )?;

    {
        let proposal = &mut ctx.accounts.conditional_proposal;
        proposal.bump = ctx.bumps.conditional_proposal;
        proposal.treasury = treasury_key;
        proposal.proposal_id = proposal_id;
        proposal.ai_authority = ai_authority;
        proposal.amount_usd = args.amount_usd;
        proposal.target_chain = args.target_chain;
        proposal.tx_type = args.tx_type;
        proposal.protocol_id = args.protocol_id;
        proposal.recipient_or_contract = args.recipient_or_contract.clone();
        proposal.created_at = args.now;
        proposal.expires_at = args.now.saturating_add(args.ttl_secs);
        proposal.conditions = args.conditions.clone();
        proposal.combinator = args.combinator;
        proposal.status = proposal_status_code(if met {
            ProposalStatus::Triggered
        } else {
            ProposalStatus::AwaitingCondition
        });
        proposal.promoted_proposal_id = None;
    }

    if met {
        // Conditions already hold — promote straight into the pending flow.
        let tx = build_tx(
            args.amount_usd,
            args.target_chain,
            args.tx_type,
            args.protocol_id,
            &args.recipient_or_contract,
            args.now,
        )?;
        let promoted_proposal_id = crate::propose_transaction(
            &mut domain,
            &ai_authority.to_string(),
            tx,
            args.recipient_or_contract,
        )
        .map_err(crate::map_treasury_error)?;
        ctx.accounts.conditional_proposal.promoted_proposal_id = Some(promoted_proposal_id);
        sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct TryTrigger<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [CONDITIONAL_PROPOSAL_SEED, treasury.key().as_ref(), &conditional_proposal.proposal_id.to_le_bytes()],
        bump = conditional_proposal.bump,
        constraint = conditional_proposal.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub conditional_proposal: Box<Account<'info, ConditionalProposal>>,
    /// CHECK: optional price/oracle feed bound to each condition's `feed`.
    pub condition_feed: Option<UncheckedAccount<'info>>,
}

pub fn try_trigger(ctx: Context<TryTrigger>) -> Result<()> {
    // Permissionless → the on-chain clock is the only trusted time source.
    let now = Clock::get()?.unix_timestamp;

    let proposal = &ctx.accounts.conditional_proposal;
    require!(
        proposal.status == proposal_status_code(ProposalStatus::AwaitingCondition),
        AuraCoreError::InvalidProposalStatus
    );

    if now > proposal.expires_at {
        ctx.accounts.conditional_proposal.status = proposal_status_code(ProposalStatus::Expired);
        return Ok(());
    }

    let met = conditions_satisfied(
        &proposal.conditions,
        proposal.combinator,
        ctx.accounts.condition_feed.as_ref(),
        now,
    )?;
    require!(met, AuraCoreError::ConditionUnmet);

    // Capture what we need before re-borrowing the accounts mutably.
    let tx = build_tx(
        proposal.amount_usd,
        proposal.target_chain,
        proposal.tx_type,
        proposal.protocol_id,
        &proposal.recipient_or_contract,
        now,
    )?;
    let ai_authority = proposal.ai_authority.to_string();
    let recipient = proposal.recipient_or_contract.clone();

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let promoted_proposal_id =
        crate::propose_transaction(&mut domain, &ai_authority, tx, recipient)
            .map_err(crate::map_treasury_error)?;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)?;
    ctx.accounts.conditional_proposal.status = proposal_status_code(ProposalStatus::Triggered);
    ctx.accounts.conditional_proposal.promoted_proposal_id = Some(promoted_proposal_id);
    Ok(())
}

#[derive(Accounts)]
pub struct CloseConditionalProposal<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        close = owner,
        seeds = [CONDITIONAL_PROPOSAL_SEED, treasury.key().as_ref(), &conditional_proposal.proposal_id.to_le_bytes()],
        bump = conditional_proposal.bump,
        constraint = conditional_proposal.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub conditional_proposal: Box<Account<'info, ConditionalProposal>>,
}

pub fn close_conditional_proposal(_ctx: Context<CloseConditionalProposal>) -> Result<()> {
    Ok(())
}
