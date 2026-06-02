#![allow(unused_imports)]

use anchor_lang::prelude::*;
use aura_policy::{
    diff_policy_config, evaluate_transaction, policy_config_hash, validate_policy_config,
    PolicyEvaluationContext, TransactionContext,
};

use crate::{
    audit::AuditKind,
    constants::{
        ACTIVITY_LOG_SEED, ADDRESS_LIST_SEED, CURRENT_SCHEMA_VERSION, FEE_VAULT_SEED,
        HEALTH_SCORE_SEED, POLICY_CHECK_SEED, POLICY_HISTORY_SEED,
        ROLLBACK_LOOSEN_RISK_THRESHOLD_BPS, SESSION_KEY_SEED, SNAPSHOT_MIN_INTERVAL_SECS,
        SNAPSHOT_SEED, SWARM_POOL_SEED, TREASURY_SEED,
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

#[derive(Accounts)]
pub struct RecordPolicySnapshot<'info> {
    pub owner: Signer<'info>,
    #[account(
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
}

/// Appends a snapshot of the active policy configuration to the history ring.
/// Runs against an already-initialized history account.
pub fn record_policy_snapshot(ctx: Context<RecordPolicySnapshot>, now: i64) -> Result<()> {
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

#[derive(Accounts)]
pub struct RollbackPolicy<'info> {
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
}

/// Restores a recorded policy version. The caller supplies the full
/// `candidate` configuration; it is accepted only if it hashes to the
/// fingerprint recorded for `target_version` in the history ring, so an
/// attacker cannot substitute a different configuration. A rollback that
/// tightens (or leaves unchanged) applies immediately and is recorded as a new
/// forward version; one that loosens policy is staged through the standard
/// config-change timelock so it cannot instantly widen the spending envelope.
pub fn rollback_policy(
    ctx: Context<RollbackPolicy>,
    target_version: u32,
    candidate: PolicyConfigRecord,
    now: i64,
) -> Result<()> {
    let snapshot = ctx
        .accounts
        .policy_history
        .snapshots
        .iter()
        .find(|snapshot| snapshot.version == target_version)
        .cloned()
        .ok_or_else(|| error!(AuraCoreError::UnknownPolicyVersion))?;

    let candidate_bytes =
        borsh::to_vec(&candidate).map_err(|_| error!(AuraCoreError::InvalidTemplateConfig))?;
    require!(
        policy_config_hash(&candidate_bytes) == snapshot.snapshot_digest,
        AuraCoreError::UnknownPolicyVersion
    );

    let candidate_config = candidate.to_domain();
    validate_policy_config(&candidate_config)
        .map_err(|_| error!(AuraCoreError::InvalidTemplateConfig))?;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let diff = diff_policy_config(&domain.policy_config, &candidate_config);

    if diff.risk_delta_bps > ROLLBACK_LOOSEN_RISK_THRESHOLD_BPS {
        domain.pending_config_change = Some(PendingConfigChange::policy_limits(
            u64::from(target_version),
            now,
            ctx.accounts.owner.key().to_string(),
            candidate_config,
        ));
        domain.last_owner_activity_at = now;
        domain.audit_trail.record(
            AuditKind::ConfigChangeProposed,
            format!(
                "rollback to policy version {target_version} queued (loosens policy, loosened={:#x})",
                diff.loosened_bitmap
            ),
            now,
        );
        return sync_treasury_account(&mut ctx.accounts.treasury, &domain, now);
    }

    let restored_from = domain.current_policy_version;
    domain.policy_config = candidate_config;
    domain.current_policy_version = domain.current_policy_version.saturating_add(1);
    domain.last_owner_activity_at = now;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!(
            "rolled_back_from v{restored_from} rolled_back_to snapshot v{target_version}, tightened={:#x}, loosened={:#x}",
            diff.tightened_bitmap, diff.loosened_bitmap
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
