//! Shadow / canary policy trials.
//!
//! A canary stages a candidate policy configuration and scores it against live
//! proposal traffic without enforcing it (see `propose_transaction` for where
//! the shadow evaluation is folded in). Once enough divergence data is
//! collected, the candidate can be promoted into the enforced policy or
//! discarded. Promotion shares the same apply/snapshot path as a template
//! application, so the policy-history ring stays the source of truth.

use anchor_lang::prelude::*;
use aura_policy::validate_policy_config;

use crate::{
    audit::AuditKind,
    constants::{POLICY_CANARY_SEED, POLICY_HISTORY_SEED, TREASURY_SEED},
    instructions::sync_treasury_account,
    program_accounts::{
        snapshot_policy_config, PolicyCanaryAccount, PolicyConfigRecord, PolicyHistoryAccount,
        TreasuryAccount, POLICY_CANARY_SPACE,
    },
    AuraCoreError,
};

#[derive(Accounts)]
pub struct StartCanary<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = owner,
        space = POLICY_CANARY_SPACE,
        seeds = [POLICY_CANARY_SEED, treasury.key().as_ref()],
        bump
    )]
    pub policy_canary: Box<Account<'info, PolicyCanaryAccount>>,
    pub system_program: Program<'info, System>,
}

/// Stages a candidate policy and begins scoring it against live traffic. The
/// candidate is validated for coherence before the trial starts.
pub fn start_canary(
    ctx: Context<StartCanary>,
    candidate: PolicyConfigRecord,
    sample_cap: u32,
    now: i64,
) -> Result<()> {
    validate_policy_config(&candidate.to_domain())
        .map_err(|_| error!(AuraCoreError::InvalidTemplateConfig))?;
    let canary = &mut ctx.accounts.policy_canary;
    canary.bump = ctx.bumps.policy_canary;
    canary.treasury = ctx.accounts.treasury.key();
    canary.arm(candidate, sample_cap, now);
    Ok(())
}

#[derive(Accounts)]
pub struct PromoteCanary<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [POLICY_HISTORY_SEED, treasury.key().as_ref()],
        bump = policy_history.bump,
        constraint = policy_history.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub policy_history: Box<Account<'info, PolicyHistoryAccount>>,
    #[account(
        mut,
        close = owner,
        seeds = [POLICY_CANARY_SEED, treasury.key().as_ref()],
        bump = policy_canary.bump,
        constraint = policy_canary.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub policy_canary: Box<Account<'info, PolicyCanaryAccount>>,
}

/// Promotes the candidate into the enforced policy, records it as a new version
/// in the history ring, and closes the canary. Refuses to promote until the
/// sample floor has been met.
pub fn promote_canary(ctx: Context<PromoteCanary>, now: i64) -> Result<()> {
    require!(
        ctx.accounts.policy_canary.enabled,
        AuraCoreError::NoCandidatePolicy
    );
    require!(
        ctx.accounts.policy_canary.sample_floor_met(),
        AuraCoreError::CanarySampleFloorNotMet
    );

    let candidate_config = ctx.accounts.policy_canary.candidate.to_domain();
    validate_policy_config(&candidate_config)
        .map_err(|_| error!(AuraCoreError::InvalidTemplateConfig))?;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.policy_config = candidate_config;
    domain.current_policy_version = domain.current_policy_version.saturating_add(1);
    domain.last_owner_activity_at = now;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!(
            "canary candidate promoted after {} samples",
            ctx.accounts.policy_canary.samples
        ),
        now,
    );
    snapshot_policy_config(
        &mut ctx.accounts.policy_history,
        &domain.policy_config,
        ctx.accounts.owner.key(),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

#[derive(Accounts)]
pub struct DiscardCanary<'info> {
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
        seeds = [POLICY_CANARY_SEED, treasury.key().as_ref()],
        bump = policy_canary.bump,
        constraint = policy_canary.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub policy_canary: Box<Account<'info, PolicyCanaryAccount>>,
}

/// Drops the candidate and closes the canary, leaving the enforced policy
/// untouched.
pub fn discard_canary(ctx: Context<DiscardCanary>) -> Result<()> {
    require!(
        ctx.accounts.policy_canary.enabled,
        AuraCoreError::NoCandidatePolicy
    );
    Ok(())
}
