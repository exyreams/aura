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

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitSwarmPoolArgs {
    pub swarm_id: String,
    pub shared_pool_limit_usd: u64,
    pub timestamp: i64,
}

#[derive(Accounts)]
#[instruction(args: InitSwarmPoolArgs)]
pub struct InitSwarmPool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + SwarmPoolAccount::INIT_SPACE,
        seeds = [SWARM_POOL_SEED, &swarm_pool_seeds(&args.swarm_id)],
        bump
    )]
    pub swarm_pool: Box<Account<'info, SwarmPoolAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_swarm_pool(ctx: Context<InitSwarmPool>, args: InitSwarmPoolArgs) -> Result<()> {
    let pool = &mut ctx.accounts.swarm_pool;
    pool.bump = ctx.bumps.swarm_pool;
    pool.swarm_id_hash = swarm_pool_seeds(&args.swarm_id);
    pool.swarm_id = args.swarm_id;
    pool.creator = ctx.accounts.creator.key();
    pool.shared_pool_limit_usd = args.shared_pool_limit_usd;
    pool.total_spent_usd = 0;
    pool.member_count = 0;
    pool.created_at = args.timestamp;
    pool.last_spend_at = args.timestamp;
    pool.member_spend = Vec::new();
    Ok(())
}

#[derive(Accounts)]
pub struct JoinSwarm<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(mut)]
    pub swarm_pool: Box<Account<'info, SwarmPoolAccount>>,
}

pub fn join_swarm(ctx: Context<JoinSwarm>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    require!(
        domain
            .swarm
            .as_ref()
            .is_some_and(|swarm| swarm.swarm_id == ctx.accounts.swarm_pool.swarm_id),
        AuraCoreError::InvalidExternalAccountData
    );
    let treasury_key = ctx.accounts.treasury.key();
    if !ctx
        .accounts
        .swarm_pool
        .member_spend
        .iter()
        .any(|record| record.treasury == treasury_key)
    {
        ctx.accounts
            .swarm_pool
            .member_spend
            .push(crate::program_accounts::MemberSpendRecord {
                treasury: treasury_key,
                spent_usd: 0,
                last_spend_at: now,
            });
        ctx.accounts.swarm_pool.member_count = ctx.accounts.swarm_pool.member_spend.len() as u8;
    }
    domain.audit_trail.record(
        AuditKind::SwarmPoolJoined,
        format!(
            "joined shared swarm pool {}",
            ctx.accounts.swarm_pool.swarm_id
        ),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
