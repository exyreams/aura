use anchor_lang::prelude::*;

use crate::{
    audit::AuditKind,
    constants::{EXTERNAL_LIVENESS_SEED, TREASURY_SEED},
    instructions::sync_treasury_account,
    program_accounts::{
        role_permissions, ExternalLivenessAccount, OperatorRoleAccount, TreasuryAccount,
        EXTERNAL_LIVENESS_SPACE,
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitExternalLivenessArgs {
    pub max_staleness_secs: i64,
    pub now: i64,
}

#[derive(Accounts)]
pub struct InitExternalLiveness<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = owner,
        space = EXTERNAL_LIVENESS_SPACE,
        seeds = [EXTERNAL_LIVENESS_SEED, treasury.key().as_ref()],
        bump
    )]
    pub liveness: Box<Account<'info, ExternalLivenessAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_external_liveness(
    ctx: Context<InitExternalLiveness>,
    args: InitExternalLivenessArgs,
) -> Result<()> {
    let account = &mut ctx.accounts.liveness;
    account.bump = ctx.bumps.liveness;
    account.treasury = ctx.accounts.treasury.key();
    account.encrypt_last_verified_at = args.now;
    account.dwallet_last_verified_at = args.now;
    account.balance_oracle_last_verified_at = args.now;
    account.compliance_oracle_last_verified_at = args.now;
    account.max_staleness_secs = args.max_staleness_secs;
    account.updated_by = ctx.accounts.owner.key();
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigureLivenessGuardrailsArgs {
    pub require_encrypt_freshness: bool,
    pub require_dwallet_freshness: bool,
    pub require_balance_oracle_freshness: bool,
    pub require_compliance_oracle_freshness: bool,
    pub max_staleness_secs: i64,
    pub now: i64,
}

#[derive(Accounts)]
pub struct ConfigureLivenessGuardrails<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

pub fn configure_liveness_guardrails(
    ctx: Context<ConfigureLivenessGuardrails>,
    args: ConfigureLivenessGuardrailsArgs,
) -> Result<()> {
    require!(
        args.max_staleness_secs > 0,
        crate::AuraCoreError::InvalidExternalAccountData
    );
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.policy_config.liveness_config = aura_policy::LivenessConfig {
        require_encrypt_freshness: args.require_encrypt_freshness,
        require_dwallet_freshness: args.require_dwallet_freshness,
        require_balance_oracle_freshness: args.require_balance_oracle_freshness,
        require_compliance_oracle_freshness: args.require_compliance_oracle_freshness,
        max_staleness_secs: args.max_staleness_secs,
    };
    domain.current_policy_version = domain.current_policy_version.saturating_add(1);
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        "liveness guardrails configured",
        args.now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RefreshExternalLivenessArgs {
    pub dependency: u8,
    pub now: i64,
}

#[derive(Accounts)]
pub struct RefreshExternalLiveness<'info> {
    pub operator: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    pub operator_role: Option<Box<Account<'info, OperatorRoleAccount>>>,
    #[account(
        mut,
        seeds = [EXTERNAL_LIVENESS_SEED, treasury.key().as_ref()],
        bump = liveness.bump,
        constraint = liveness.treasury == treasury.key() @ crate::AuraCoreError::InvalidExternalAccountData
    )]
    pub liveness: Box<Account<'info, ExternalLivenessAccount>>,
}

pub fn refresh_external_liveness(
    ctx: Context<RefreshExternalLiveness>,
    args: RefreshExternalLivenessArgs,
) -> Result<()> {
    if ctx.accounts.operator.key() != ctx.accounts.treasury.owner {
        ctx.accounts
            .operator_role
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::OperatorRoleMissing))?
            .assert_permission(
                ctx.accounts.treasury.key(),
                ctx.accounts.operator.key(),
                role_permissions::REFRESH_LIVENESS,
                args.now,
            )?;
    }
    match args.dependency {
        1 => ctx.accounts.liveness.encrypt_last_verified_at = args.now,
        2 => ctx.accounts.liveness.dwallet_last_verified_at = args.now,
        3 => ctx.accounts.liveness.balance_oracle_last_verified_at = args.now,
        4 => ctx.accounts.liveness.compliance_oracle_last_verified_at = args.now,
        _ => return err!(crate::AuraCoreError::InvalidExternalAccountData),
    }
    ctx.accounts.liveness.updated_by = ctx.accounts.operator.key();
    Ok(())
}
