use anchor_lang::prelude::*;
use aura_policy::{ApprovalLadder, ApprovalLevel};

use crate::{
    audit::AuditKind, constants::TREASURY_SEED, execution, instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigureApprovalLadderArgs {
    pub guardian_above_usd: u64,
    pub multisig_above_usd: u64,
    pub timelock_above_usd: u64,
    pub deny_above_usd: u64,
    pub risk_guardian_bps: u16,
    pub risk_multisig_bps: u16,
    pub risk_timelock_bps: u16,
    pub timelock_secs: i64,
    pub now: i64,
}

#[derive(Accounts)]
pub struct ConfigureApprovalLadder<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

pub fn configure_approval_ladder(
    ctx: Context<ConfigureApprovalLadder>,
    args: ConfigureApprovalLadderArgs,
) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    require!(
        args.guardian_above_usd <= args.multisig_above_usd
            && args.multisig_above_usd <= args.timelock_above_usd
            && args.timelock_above_usd <= args.deny_above_usd,
        crate::AuraCoreError::InvalidExternalAccountData
    );
    domain.policy_config.approval_ladder = Some(ApprovalLadder {
        guardian_above_usd: args.guardian_above_usd,
        multisig_above_usd: args.multisig_above_usd,
        timelock_above_usd: args.timelock_above_usd,
        deny_above_usd: args.deny_above_usd,
        risk_guardian_bps: args.risk_guardian_bps,
        risk_multisig_bps: args.risk_multisig_bps,
        risk_timelock_bps: args.risk_timelock_bps,
        timelock_secs: args.timelock_secs,
    });
    domain.current_policy_version = domain.current_policy_version.saturating_add(1);
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        "approval ladder configured",
        args.now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ApprovePendingExecutionArgs {
    pub proposal_id: u64,
    pub approval_level: u8,
    pub now: i64,
}

#[derive(Accounts)]
pub struct ApprovePendingExecution<'info> {
    pub approver: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

pub fn approve_pending_execution(
    ctx: Context<ApprovePendingExecution>,
    args: ApprovePendingExecutionArgs,
) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let level = ApprovalLevel::from_code(args.approval_level)
        .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?;
    execution::approve_pending_execution(
        domain.as_mut(),
        &ctx.accounts.approver.key().to_string(),
        args.proposal_id,
        level,
        args.now,
    )
    .map_err(crate::map_treasury_error)?;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}
