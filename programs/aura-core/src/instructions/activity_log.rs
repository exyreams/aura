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
pub struct InitActivityLog<'info> {
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
        space = ACTIVITY_LOG_SPACE,
        seeds = [ACTIVITY_LOG_SEED, treasury.key().as_ref()],
        bump
    )]
    pub activity_log: Box<Account<'info, ActivityLogAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_activity_log(ctx: Context<InitActivityLog>) -> Result<()> {
    let log = &mut ctx.accounts.activity_log;
    log.bump = ctx.bumps.activity_log;
    log.treasury = ctx.accounts.treasury.key();
    log.owner = ctx.accounts.owner.key();
    log.total_events = 0;
    log.ring_head = 0;
    log.capacity = 128;
    log.events = Vec::new();
    Ok(())
}

#[derive(Accounts)]
pub struct CloseActivityLog<'info> {
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
        seeds = [ACTIVITY_LOG_SEED, treasury.key().as_ref()],
        bump = activity_log.bump,
        constraint = activity_log.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub activity_log: Box<Account<'info, ActivityLogAccount>>,
}

pub fn close_activity_log(_ctx: Context<CloseActivityLog>) -> Result<()> {
    Ok(())
}
