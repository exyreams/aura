use anchor_lang::prelude::*;

use crate::{
    constants::{SCHEDULED_INTENT_SEED, TREASURY_SEED},
    execution::generate_proposal_digest,
    instructions::wallet_transfers::{
        release_transfer_reservation, settle_transfer_details,
        validate_chain_execution_binding_with_profile,
    },
    program_accounts::{
        chain_code, proposal_status_code, BudgetEnvelopeAccount, ChainProfileAccount,
        DWalletAccount, ExposureGroupAccount, PolicyStateRecord, ScheduledIntent, SwarmPoolAccount,
        TransferDetailsRecord, TreasuryAccount,
    },
    state::{ChainExecutionBinding, ProposalStatus},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfirmSettlementArgs {
    pub proposal_id: u64,
    pub target_tx_hash: [u8; 32],
    pub confirmations_observed: u16,
    pub reorged: bool,
    pub now: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MarkSettlementBroadcastArgs {
    pub proposal_id: u64,
    pub target_tx_hash: [u8; 32],
    pub now: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ResubmitProposalArgs {
    pub proposal_id: u64,
    pub evm_chain_id: Option<u64>,
    pub replay_nonce: Option<u64>,
    pub gas_limit: Option<u64>,
    pub max_fee_native: Option<u128>,
    pub calldata_hash: Option<[u8; 32]>,
    pub utxo_set_hash: Option<[u8; 32]>,
    pub sighash_type: Option<u32>,
    pub solana_recent_blockhash: Option<[u8; 32]>,
    pub solana_message_hash: Option<[u8; 32]>,
    pub confirmations_required: Option<u16>,
    pub now: i64,
}

#[derive(Accounts)]
pub struct ConfirmSettlement<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == operator.key() || treasury.ai_authority == operator.key() @ crate::AuraCoreError::UnauthorizedExecutor
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(mut)]
    pub swarm_pool: Option<Box<Account<'info, SwarmPoolAccount>>>,
    #[account(mut)]
    pub budget_envelope: Option<Box<Account<'info, BudgetEnvelopeAccount>>>,
    #[account(mut)]
    pub exposure_group: Option<Box<Account<'info, ExposureGroupAccount>>>,
    #[account(mut)]
    pub dwallet_state: Option<Box<Account<'info, DWalletAccount>>>,
    #[account(
        mut,
        seeds = [SCHEDULED_INTENT_SEED, treasury.key().as_ref(), &scheduled_intent.intent_id.to_le_bytes()],
        bump = scheduled_intent.bump,
        constraint = scheduled_intent.treasury == treasury.key() @ crate::AuraCoreError::InvalidExternalAccountData
    )]
    pub scheduled_intent: Option<Box<Account<'info, ScheduledIntent>>>,
}

#[derive(Accounts)]
pub struct MarkSettlementBroadcast<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == operator.key() || treasury.ai_authority == operator.key() @ crate::AuraCoreError::UnauthorizedExecutor
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

#[derive(Accounts)]
pub struct ResubmitProposal<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == operator.key() || treasury.ai_authority == operator.key() @ crate::AuraCoreError::UnauthorizedExecutor
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    pub chain_profile: Option<Box<Account<'info, ChainProfileAccount>>>,
}

#[derive(Accounts)]
pub struct AbandonProposal<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == operator.key() || treasury.ai_authority == operator.key() @ crate::AuraCoreError::UnauthorizedExecutor
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(mut)]
    pub dwallet_state: Option<Box<Account<'info, DWalletAccount>>>,
}

/// Confirms target-chain settlement for a chain-bound dWallet proposal.
///
/// `finalize_execution` only proves the Ika dWallet signature exists for
/// chain-bound messages. This instruction is the separate relayer/oracle gate
/// that marks the transaction settled, releases/debits any dWallet reservation,
/// and advances policy counters.
pub fn handler(ctx: Context<ConfirmSettlement>, args: ConfirmSettlementArgs) -> Result<()> {
    require!(
        args.target_tx_hash != [0u8; 32],
        crate::AuraCoreError::InvalidExternalAccountData
    );
    require!(!args.reorged, crate::AuraCoreError::SettlementReorged);
    let pending = ctx
        .accounts
        .treasury
        .pending_queue
        .first()
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?
        .to_domain()?;
    require!(
        pending.proposal_id == args.proposal_id,
        crate::AuraCoreError::NoPendingTransaction
    );
    require!(
        pending.transfer.has_chain_binding(),
        crate::AuraCoreError::ChainReplayFieldsMissing
    );
    require!(
        matches!(
            pending.status,
            ProposalStatus::Signed | ProposalStatus::Broadcast
        ),
        crate::AuraCoreError::SettlementNotConfirmed
    );
    let required_confirmations = pending
        .transfer
        .execution_binding
        .confirmations_required
        .unwrap_or(1);
    require!(
        args.confirmations_observed >= required_confirmations,
        crate::AuraCoreError::SettlementNotConfirmed
    );

    let treasury_key = ctx.accounts.treasury.key();
    let settled_wallet_total = if pending.transfer.requires_wallet_settlement() {
        let dwallet_state = ctx
            .accounts
            .dwallet_state
            .as_mut()
            .ok_or_else(|| error!(crate::AuraCoreError::DWalletNotConfigured))?;
        Some((
            pending.target_chain,
            settle_transfer_details(
                dwallet_state,
                treasury_key,
                crate::program_accounts::chain_code(pending.target_chain),
                pending.amount_usd,
                &pending.transfer,
                args.now,
            )?,
        ))
    } else {
        None
    };

    if let Some(pool) = &mut ctx.accounts.swarm_pool {
        pool.record_spend(treasury_key, pending.amount_usd, args.now);
    }
    if let Some(envelope) = &mut ctx.accounts.budget_envelope {
        require!(
            envelope.treasury == treasury_key,
            crate::AuraCoreError::InvalidExternalAccountData
        );
        envelope.record_spend(pending.amount_usd, args.now);
    }
    if let Some(group) = &mut ctx.accounts.exposure_group {
        group.assert_member(treasury_key)?;
        group.assert_available(pending.amount_usd, args.now)?;
        group.record_spend(pending.amount_usd, args.now);
    }
    if let Some(intent) = &mut ctx.accounts.scheduled_intent {
        intent.settle_in_flight_run(pending.proposal_id, pending.amount_usd, args.now)?;
    }

    let treasury = &mut ctx.accounts.treasury;
    treasury.updated_at = args.now;
    treasury.policy_state = PolicyStateRecord::from_domain(&pending.decision.next_state);
    treasury.total_transactions = treasury.total_transactions.saturating_add(1);
    treasury.reputation.total_transactions =
        treasury.reputation.total_transactions.saturating_add(1);
    treasury.reputation.successful_transactions = treasury
        .reputation
        .successful_transactions
        .saturating_add(1);
    treasury.reputation.total_volume_usd = treasury
        .reputation
        .total_volume_usd
        .saturating_add(pending.amount_usd);
    if let Some(cooldown) = &treasury.policy_config.cooldown_config {
        if pending.amount_usd >= cooldown.threshold_usd {
            treasury.last_large_tx_at = Some(args.now);
            treasury.last_large_tx_amount_usd = pending.amount_usd;
        }
    }
    if let Some(swarm) = treasury.swarm.as_mut() {
        swarm.total_swarm_spent_usd = swarm
            .total_swarm_spent_usd
            .saturating_add(pending.amount_usd);
    }
    if let Some((chain, total_usd)) = settled_wallet_total {
        if let Some(dwallet) = treasury
            .dwallets
            .iter_mut()
            .find(|dwallet| dwallet.chain == crate::program_accounts::chain_code(chain))
        {
            dwallet.balance_usd = total_usd;
            dwallet.balance_updated_at = args.now;
        }
    }
    if let Some(record) = treasury.pending_queue.first_mut() {
        record.status = proposal_status_code(ProposalStatus::Settled);
        record.last_updated_at = args.now;
    }
    if !treasury.pending_queue.is_empty() {
        treasury.pending_queue.remove(0);
    }

    Ok(())
}

pub fn mark_broadcast(
    ctx: Context<MarkSettlementBroadcast>,
    args: MarkSettlementBroadcastArgs,
) -> Result<()> {
    require!(
        args.target_tx_hash != [0u8; 32],
        crate::AuraCoreError::InvalidExternalAccountData
    );
    let record = ctx
        .accounts
        .treasury
        .pending_queue
        .first_mut()
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    let pending = record.to_domain()?;
    require!(
        pending.proposal_id == args.proposal_id,
        crate::AuraCoreError::NoPendingTransaction
    );
    require!(
        pending.transfer.has_chain_binding(),
        crate::AuraCoreError::ChainReplayFieldsMissing
    );
    require!(
        matches!(pending.status, ProposalStatus::Signed),
        crate::AuraCoreError::SettlementNotConfirmed
    );
    record.status = proposal_status_code(ProposalStatus::Broadcast);
    record.last_updated_at = args.now;
    ctx.accounts.treasury.updated_at = args.now;
    Ok(())
}

pub fn resubmit_proposal(ctx: Context<ResubmitProposal>, args: ResubmitProposalArgs) -> Result<()> {
    let record = ctx
        .accounts
        .treasury
        .pending_queue
        .first_mut()
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    let mut pending = record.to_domain()?;
    require!(
        pending.proposal_id == args.proposal_id,
        crate::AuraCoreError::NoPendingTransaction
    );
    require!(
        matches!(
            pending.status,
            ProposalStatus::Signed | ProposalStatus::Broadcast
        ),
        crate::AuraCoreError::SettlementNotConfirmed
    );
    pending.transfer.execution_binding = ChainExecutionBinding {
        evm_chain_id: args.evm_chain_id,
        replay_nonce: args.replay_nonce,
        gas_limit: args.gas_limit,
        max_fee_native: args.max_fee_native,
        calldata_hash: args.calldata_hash,
        utxo_set_hash: args.utxo_set_hash,
        sighash_type: args.sighash_type,
        solana_recent_blockhash: args.solana_recent_blockhash,
        solana_message_hash: args.solana_message_hash,
        confirmations_required: args.confirmations_required,
    };
    validate_chain_execution_binding_with_profile(
        pending.target_chain,
        &pending.transfer,
        ctx.accounts.chain_profile.as_deref().map(|value| &**value),
    )?;
    pending.proposal_digest = generate_proposal_digest(
        pending.proposal_id,
        pending.target_chain,
        pending.tx_type,
        &pending.recipient_or_contract,
        pending.amount_usd,
        pending.submitted_at,
        &pending.policy_output_digest,
        &pending.transfer,
    );
    pending.signature_request = None;
    pending.status = ProposalStatus::Proposed;
    pending.last_updated_at = args.now;
    pending.execution_attempts = pending.execution_attempts.saturating_add(1);
    record.proposal_digest = pending.proposal_digest;
    record.transfer = TransferDetailsRecord::from_domain(&pending.transfer);
    record.signature_request = None;
    record.status = proposal_status_code(ProposalStatus::Proposed);
    record.last_updated_at = args.now;
    record.execution_attempts = pending.execution_attempts;
    ctx.accounts.treasury.updated_at = args.now;
    Ok(())
}

pub fn abandon_proposal(ctx: Context<AbandonProposal>, proposal_id: u64, now: i64) -> Result<()> {
    let pending = ctx
        .accounts
        .treasury
        .pending_queue
        .first()
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?
        .to_domain()?;
    require!(
        pending.proposal_id == proposal_id,
        crate::AuraCoreError::NoPendingTransaction
    );
    require!(
        matches!(
            pending.status,
            ProposalStatus::Signed | ProposalStatus::Broadcast | ProposalStatus::Proposed
        ),
        crate::AuraCoreError::InvalidProposalStatus
    );
    let treasury_key = ctx.accounts.treasury.key();
    if pending.transfer.requires_wallet_settlement() {
        let dwallet_state = ctx
            .accounts
            .dwallet_state
            .as_mut()
            .ok_or_else(|| error!(crate::AuraCoreError::DWalletNotConfigured))?;
        release_transfer_reservation(
            dwallet_state,
            treasury_key,
            chain_code(pending.target_chain),
            pending.amount_usd,
            &pending.transfer,
        )?;
    }
    if let Some(record) = ctx.accounts.treasury.pending_queue.first_mut() {
        record.status = proposal_status_code(ProposalStatus::Cancelled);
        record.last_updated_at = now;
    }
    if !ctx.accounts.treasury.pending_queue.is_empty() {
        ctx.accounts.treasury.pending_queue.remove(0);
    }
    ctx.accounts.treasury.updated_at = now;
    Ok(())
}
