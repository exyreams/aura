use anchor_lang::prelude::*;

use crate::{
    constants::{SCHEDULED_INTENT_SEED, TREASURY_SEED},
    ext_cpi::{
        parse_message_approval_account, verify_message_approval, DWALLET_CPI_AUTHORITY_SEED,
    },
    instructions::{
        external_liveness::{enforce_liveness_gate, LivenessGate},
        wallet_transfers::settle_transfer_details,
    },
    program_accounts::{
        BudgetEnvelopeAccount, DWalletAccount, ExposureGroupAccount, ExternalLivenessAccount,
        PolicyStateRecord, ScheduledIntent, SwarmPoolAccount, TreasuryAccount,
    },
    state::{TransferDetails, DWALLET_DEVNET_PROGRAM_ID},
};

#[derive(Accounts)]
pub struct FinalizeExecution<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == operator.key() || treasury.ai_authority == operator.key() @ crate::AuraCoreError::UnauthorizedExecutor
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    /// CHECK: Signed MessageApproval account owned by the dWallet program.
    pub message_approval: UncheckedAccount<'info>,
    #[account(mut)]
    pub swarm_pool: Option<Box<Account<'info, SwarmPoolAccount>>>,
    #[account(mut)]
    pub budget_envelope: Option<Box<Account<'info, BudgetEnvelopeAccount>>>,
    #[account(mut)]
    pub exposure_group: Option<Box<Account<'info, ExposureGroupAccount>>>,
    pub external_liveness: Option<Box<Account<'info, ExternalLivenessAccount>>>,
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

/// Finalizes an approved pending transaction by verifying the dWallet signature
/// and producing an execution receipt.
///
/// Checks expiry, parses the `MessageApproval` account, verifies the signature
/// against the stored `PendingSignatureRequest`, then calls
/// `finalize_signed_pending` to advance the policy state and clear the pending
/// slot. Emits `SignatureCommitted` and `ProposalExecuted` audit events, plus
/// an `ExecutionReceipt` program event.
///
/// The operator must be the owner or AI authority.
pub fn handler(ctx: Context<FinalizeExecution>, now: i64) -> Result<()> {
    require!(
        !dwallet_finalization_paused(&ctx.accounts.treasury, now),
        crate::AuraCoreError::ExecutionScopePaused
    );
    let liveness_softening = if ctx
        .accounts
        .treasury
        .policy_config
        .liveness_config
        .require_dwallet_freshness
    {
        enforce_liveness_gate(
            ctx.accounts.treasury.key(),
            &ctx.accounts.treasury.policy_config,
            &ctx.accounts.treasury.policy_state,
            ctx.accounts
                .external_liveness
                .as_deref()
                .map(|value| &**value),
            LivenessGate::DWallet,
            ctx.accounts
                .treasury
                .pending_queue
                .first()
                .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?
                .amount_usd,
            now,
        )?
    } else {
        false
    };
    if let Some(pool) = &ctx.accounts.swarm_pool {
        if let Some(swarm) = &ctx.accounts.treasury.swarm {
            require!(
                swarm.swarm_id == pool.swarm_id,
                crate::AuraCoreError::InvalidExternalAccountData
            );
        }
    }
    let (
        finalized_proposal_id,
        finalized_amount_usd,
        mut next_policy_state,
        transfer,
        target_chain,
    ) = verify_live_signature(&ctx, now)?;
    if liveness_softening {
        record_liveness_fail_open(
            &mut next_policy_state,
            finalized_amount_usd,
            now,
            ctx.accounts
                .treasury
                .policy_config
                .failure_modes
                .fail_open_window_secs,
        );
    }
    let treasury_key = ctx.accounts.treasury.key();
    if let Some(pool) = &mut ctx.accounts.swarm_pool {
        pool.record_spend(treasury_key, finalized_amount_usd, now);
    }
    if let Some(envelope) = &mut ctx.accounts.budget_envelope {
        require!(
            envelope.treasury == treasury_key,
            crate::AuraCoreError::InvalidExternalAccountData
        );
        envelope.record_spend(finalized_amount_usd, now);
    }
    if let Some(group) = &mut ctx.accounts.exposure_group {
        group.assert_member(treasury_key)?;
        group.assert_available(finalized_amount_usd, now)?;
        group.record_spend(finalized_amount_usd, now);
    }
    if let Some(intent) = &mut ctx.accounts.scheduled_intent {
        intent.settle_in_flight_run(finalized_proposal_id, finalized_amount_usd, now)?;
    }
    let settled_wallet_total = if transfer.requires_wallet_settlement() {
        let dwallet_state = ctx
            .accounts
            .dwallet_state
            .as_mut()
            .ok_or_else(|| error!(crate::AuraCoreError::DWalletNotConfigured))?;
        Some((
            target_chain,
            settle_transfer_details(
                dwallet_state,
                treasury_key,
                target_chain,
                finalized_amount_usd,
                &transfer,
                now,
            )?,
        ))
    } else {
        None
    };

    let treasury = &mut ctx.accounts.treasury;
    treasury.updated_at = now;
    treasury.policy_state = next_policy_state;
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
        .saturating_add(finalized_amount_usd);
    if let Some(cooldown) = &treasury.policy_config.cooldown_config {
        if finalized_amount_usd >= cooldown.threshold_usd {
            treasury.last_large_tx_at = Some(now);
            treasury.last_large_tx_amount_usd = finalized_amount_usd;
        }
    }
    if let Some(swarm) = treasury.swarm.as_mut() {
        swarm.total_swarm_spent_usd = swarm
            .total_swarm_spent_usd
            .saturating_add(finalized_amount_usd);
    }
    if let Some((chain, total_usd)) = settled_wallet_total {
        if let Some(dwallet) = treasury
            .dwallets
            .iter_mut()
            .find(|dwallet| dwallet.chain == chain)
        {
            dwallet.balance_usd = total_usd;
            dwallet.balance_updated_at = now;
        }
    }
    if !treasury.pending_queue.is_empty() {
        treasury.pending_queue.remove(0);
    }

    Ok(())
}

#[inline(never)]
fn verify_live_signature(
    ctx: &Context<FinalizeExecution>,
    now: i64,
) -> Result<(
    u64,
    u64,
    crate::program_accounts::PolicyStateRecord,
    TransferDetails,
    u8,
)> {
    let pending = ctx
        .accounts
        .treasury
        .pending_queue
        .first()
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    if now > pending.expires_at {
        return err!(crate::AuraCoreError::PendingTransactionExpired);
    }
    if pending.earliest_execution_at > 0 && now < pending.earliest_execution_at {
        return err!(crate::AuraCoreError::PendingExecutionTimelockActive);
    }
    if pending.satisfied_approval_level < pending.required_approval_level {
        return err!(crate::AuraCoreError::ApprovalLevelNotSatisfied);
    }
    if let Some(request) = &pending.decryption_request {
        if request.verified_at.is_none() || request.plaintext_sha256.is_none() {
            return err!(crate::AuraCoreError::DecryptionNotReady);
        }
    }
    require!(
        pending.decision.approved,
        crate::AuraCoreError::InvalidExternalAccountData
    );
    let signature_request = pending
        .signature_request
        .as_ref()
        .ok_or_else(|| error!(crate::AuraCoreError::MessageApprovalNotReady))?;
    let signature_request = signature_request.to_domain()?;

    let expected_message_approval: Pubkey = signature_request
        .message_approval_account
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidExternalAccountData))?;
    if expected_message_approval != ctx.accounts.message_approval.key() {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let expected_dwallet_program: Pubkey = DWALLET_DEVNET_PROGRAM_ID
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidDeployment))?;
    if *ctx.accounts.message_approval.owner != expected_dwallet_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let dwallet_ref = ctx
        .accounts
        .treasury
        .dwallets
        .iter()
        .find(|dwallet| dwallet.chain == pending.target_chain)
        .ok_or_else(|| error!(crate::AuraCoreError::DWalletNotConfigured))?;
    let expected_user_pubkey = dwallet_ref
        .authorized_user_pubkey
        .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?;
    let message_approval_data = ctx.accounts.message_approval.try_borrow_data()?;
    let parsed = parse_message_approval_account(&message_approval_data)
        .map_err(crate::map_treasury_error)?;
    let (expected_cpi_authority, _) =
        Pubkey::find_program_address(&[DWALLET_CPI_AUTHORITY_SEED], &crate::ID);
    verify_message_approval(
        &ctx.accounts.message_approval.key(),
        &parsed,
        &signature_request,
        &expected_cpi_authority,
        &expected_user_pubkey,
    )
    .map_err(crate::map_treasury_error)?;

    Ok((
        pending.proposal_id,
        pending.amount_usd,
        pending.decision.next_state.clone(),
        pending.transfer.to_domain(),
        pending.target_chain,
    ))
}

fn record_liveness_fail_open(
    next_policy_state: &mut PolicyStateRecord,
    amount_usd: u64,
    now: i64,
    window_secs: i64,
) {
    let mut state = next_policy_state.to_domain();
    state.fail_open_window(now, window_secs);
    state.record_fail_open(amount_usd);
    *next_policy_state = PolicyStateRecord::from_domain(&state);
}

fn dwallet_finalization_paused(treasury: &TreasuryAccount, now: i64) -> bool {
    treasury
        .policy_config
        .scoped_pause_entries
        .iter()
        .any(|entry| {
            (entry.scope_kind == 0 || entry.scope_kind == 6)
                && entry
                    .expires_at
                    .map(|expires_at| now < expires_at)
                    .unwrap_or(true)
        })
}
