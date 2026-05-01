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
#[instruction(snapshot_index: u32)]
pub struct TakeSnapshot<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    pub operator_role: Option<Box<Account<'info, OperatorRoleAccount>>>,
    pub health_score: Box<Account<'info, HealthScoreAccount>>,
    #[account(init, payer = payer, space = 8 + SnapshotAccount::INIT_SPACE, seeds = [SNAPSHOT_SEED, treasury.key().as_ref(), &snapshot_index.to_le_bytes()], bump)]
    pub snapshot: Box<Account<'info, SnapshotAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn take_snapshot(ctx: Context<TakeSnapshot>, snapshot_index: u32, now: i64) -> Result<()> {
    let domain = ctx.accounts.treasury.to_domain_boxed()?;
    if ctx.accounts.payer.key() != ctx.accounts.treasury.owner {
        ctx.accounts
            .operator_role
            .as_ref()
            .ok_or_else(|| error!(AuraCoreError::OperatorRoleMissing))?
            .assert_permission(
                ctx.accounts.treasury.key(),
                ctx.accounts.payer.key(),
                role_permissions::TAKE_SNAPSHOTS,
                now,
            )?;
    }
    require!(
        domain
            .last_snapshot_at
            .is_none_or(|last| now.saturating_sub(last) >= SNAPSHOT_MIN_INTERVAL_SECS),
        AuraCoreError::TimelockNotElapsed
    );
    let snap = &mut ctx.accounts.snapshot;
    snap.bump = ctx.bumps.snapshot;
    snap.treasury = ctx.accounts.treasury.key();
    snap.snapshot_index = snapshot_index;
    snap.taken_at = now;
    snap.taken_at_slot = Clock::get()?.slot;
    snap.taken_by = ctx.accounts.payer.key();
    snap.total_transactions = domain.total_transactions;
    snap.total_volume_usd = domain.reputation.total_volume_usd;
    snap.spent_today_usd = domain.policy_state.spent_today_usd;
    snap.seven_day_volume_usd = domain.policy_state.seven_day_total();
    snap.daily_limit_usd = domain.policy_config.daily_limit_usd;
    snap.per_tx_limit_usd = domain.policy_config.per_tx_limit_usd;
    snap.reputation_score = domain.reputation.score() as u8;
    snap.health_score = ctx.accounts.health_score.score;
    snap.registered_dwallet_count = domain.dwallets.len() as u8;
    snap.pending_proposal_count = domain.pending_count() as u8;
    snap.schema_version = ctx.accounts.treasury.schema_version;
    ctx.accounts.treasury.last_snapshot_at = Some(now);
    Ok(())
}

#[derive(Accounts)]
pub struct CloseSnapshot<'info> {
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
        constraint = snapshot.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub snapshot: Box<Account<'info, SnapshotAccount>>,
}

pub fn close_snapshot(_ctx: Context<CloseSnapshot>) -> Result<()> {
    Ok(())
}
