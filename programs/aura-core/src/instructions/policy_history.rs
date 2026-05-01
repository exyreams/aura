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
        chain_from_code, lifecycle_state_from_code, sha256_address, snapshot_policy_config,
        swarm_pool_seeds, transaction_type_from_code, update_health_score, verify_merkle_inclusion,
        ActivityLogAccount, AddressListAccount, ComplianceOracleAccount, FeeVaultAccount,
        HealthScoreAccount, PolicyCheckResult, PolicyConfigRecord, PolicyHistoryAccount,
        SessionKeyAccount, SnapshotAccount, SwarmPoolAccount, TreasuryAccount, ACTIVITY_LOG_SPACE,
        ADDRESS_LIST_SPACE, POLICY_HISTORY_SPACE, SESSION_KEY_SPACE,
    },
    state::{ConfigChangeKind, GuardianChangeAction, PendingConfigChange},
    AuraCoreError,
};

#[derive(Accounts)]
pub struct InitPolicyHistory<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump, constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(init, payer = owner, space = POLICY_HISTORY_SPACE, seeds = [POLICY_HISTORY_SEED, treasury.key().as_ref()], bump)]
    pub policy_history: Box<Account<'info, PolicyHistoryAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_policy_history(ctx: Context<InitPolicyHistory>) -> Result<()> {
    ctx.accounts.policy_history.bump = ctx.bumps.policy_history;
    ctx.accounts.policy_history.treasury = ctx.accounts.treasury.key();
    ctx.accounts.policy_history.version_count = 0;
    ctx.accounts.policy_history.ring_head = 0;
    ctx.accounts.policy_history.snapshots = Vec::new();
    Ok(())
}

pub fn record_policy_snapshot(ctx: Context<InitPolicyHistory>, now: i64) -> Result<()> {
    let domain = ctx.accounts.treasury.to_domain_boxed()?;
    snapshot_policy_config(
        &mut ctx.accounts.policy_history,
        &domain.policy_config,
        ctx.accounts.owner.key(),
        now,
    );
    Ok(())
}

#[derive(Accounts)]
pub struct ClosePolicyHistory<'info> {
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
        seeds = [POLICY_HISTORY_SEED, treasury.key().as_ref()],
        bump = policy_history.bump,
        constraint = policy_history.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub policy_history: Box<Account<'info, PolicyHistoryAccount>>,
}

pub fn close_policy_history(_ctx: Context<ClosePolicyHistory>) -> Result<()> {
    Ok(())
}
