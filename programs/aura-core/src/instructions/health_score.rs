#![allow(unused_imports)]

use anchor_lang::prelude::*;
use aura_policy::{evaluate_transaction, PolicyEvaluationContext, TransactionContext};

use crate::{
    audit::AuditKind,
    constants::{
        ACTIVITY_LOG_SEED, ADDRESS_LIST_SEED, CURRENT_SCHEMA_VERSION, FEE_VAULT_SEED,
        HEALTH_SCORE_SEED, POLICY_CHECK_SEED, POLICY_HISTORY_SEED, SESSION_KEY_SEED,
        SNAPSHOT_MIN_INTERVAL_SECS, SNAPSHOT_SEED, SWARM_POOL_SEED, TREASURY_SEED,
    },
    instructions::sync_treasury_account,
    program_accounts::{
        chain_from_code, lifecycle_state_from_code, role_permissions, sha256_address,
        snapshot_policy_config, swarm_pool_seeds, transaction_type_from_code, update_health_score,
        verify_merkle_inclusion, ActivityLogAccount, AddressListAccount, ComplianceOracleAccount,
        FeeVaultAccount, HealthScoreAccount, OperatorRoleAccount, PolicyCheckResult,
        PolicyConfigRecord, PolicyHistoryAccount, SessionKeyAccount, SnapshotAccount,
        SwarmPoolAccount, TreasuryAccount, ACTIVITY_LOG_SPACE, ADDRESS_LIST_SPACE,
        POLICY_HISTORY_SPACE, SESSION_KEY_SPACE,
    },
    state::{ConfigChangeKind, GuardianChangeAction, PendingConfigChange},
    AuraCoreError,
};

#[derive(Accounts)]
pub struct UpdateHealthScore<'info> {
    pub operator: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    pub operator_role: Option<Box<Account<'info, OperatorRoleAccount>>>,
    #[account(mut, seeds = [HEALTH_SCORE_SEED, treasury.key().as_ref()], bump = health_score.bump)]
    pub health_score: Box<Account<'info, HealthScoreAccount>>,
}

#[derive(Accounts)]
pub struct InitHealthScore<'info> {
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
        space = 8 + HealthScoreAccount::INIT_SPACE,
        seeds = [HEALTH_SCORE_SEED, treasury.key().as_ref()],
        bump
    )]
    pub health_score: Box<Account<'info, HealthScoreAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_health_score(ctx: Context<InitHealthScore>, now: i64) -> Result<()> {
    let domain = ctx.accounts.treasury.to_domain_boxed()?;
    ctx.accounts.health_score.bump = ctx.bumps.health_score;
    update_health_score(
        &mut ctx.accounts.health_score,
        ctx.accounts.treasury.key(),
        &domain,
        now,
        Clock::get()?.slot,
    );
    Ok(())
}

pub fn refresh_health_score(ctx: Context<UpdateHealthScore>, now: i64) -> Result<()> {
    let domain = ctx.accounts.treasury.to_domain_boxed()?;
    if ctx.accounts.operator.key() != ctx.accounts.treasury.owner {
        ctx.accounts
            .operator_role
            .as_ref()
            .ok_or_else(|| error!(AuraCoreError::OperatorRoleMissing))?
            .assert_permission(
                ctx.accounts.treasury.key(),
                ctx.accounts.operator.key(),
                role_permissions::REFRESH_HEALTH,
                now,
            )?;
    }
    update_health_score(
        &mut ctx.accounts.health_score,
        ctx.accounts.treasury.key(),
        &domain,
        now,
        Clock::get()?.slot,
    );
    Ok(())
}

#[derive(Accounts)]
pub struct CloseHealthScore<'info> {
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
        seeds = [HEALTH_SCORE_SEED, treasury.key().as_ref()],
        bump = health_score.bump,
        constraint = health_score.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub health_score: Box<Account<'info, HealthScoreAccount>>,
}

pub fn close_health_score(_ctx: Context<CloseHealthScore>) -> Result<()> {
    Ok(())
}
