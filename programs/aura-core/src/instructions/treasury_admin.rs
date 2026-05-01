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
pub struct OwnerTreasury<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

pub fn propose_ai_rotation(
    ctx: Context<OwnerTreasury>,
    new_ai_authority: Pubkey,
    now: i64,
) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain
        .propose_ai_rotation(
            &ctx.accounts.owner.key().to_string(),
            new_ai_authority.to_string(),
            now,
        )
        .map_err(crate::map_treasury_error)?;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

pub fn execute_ai_rotation(ctx: Context<OwnerTreasury>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain
        .execute_ai_rotation(now)
        .map_err(crate::map_treasury_error)?;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

pub fn cancel_ai_rotation(ctx: Context<OwnerTreasury>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.pending_ai_rotation = None;
    domain.last_owner_activity_at = now;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

pub fn propose_config_change(
    ctx: Context<OwnerTreasury>,
    change_id: u64,
    new_policy_config: PolicyConfigRecord,
    now: i64,
) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.pending_config_change = Some(PendingConfigChange::policy_limits(
        change_id,
        now,
        ctx.accounts.owner.key().to_string(),
        new_policy_config.to_domain(),
    ));
    domain.last_owner_activity_at = now;
    domain.audit_trail.record(
        AuditKind::ConfigChangeProposed,
        format!("policy config change {change_id} proposed"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

pub fn execute_config_change(ctx: Context<OwnerTreasury>, change_id: u64, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let change = domain
        .pending_config_change
        .clone()
        .ok_or_else(|| error!(AuraCoreError::NoActiveOverride))?;
    require!(
        change.change_id == change_id,
        AuraCoreError::NoActiveOverride
    );
    require!(!change.vetoed, AuraCoreError::UnauthorizedGuardian);
    require!(
        now >= change.executable_after,
        AuraCoreError::TimelockNotElapsed
    );
    if change.kind == ConfigChangeKind::PolicyLimits {
        if let Some(policy) = change.new_policy_config {
            domain.policy_config = policy;
            domain.current_policy_version = domain.current_policy_version.saturating_add(1);
        }
    }
    domain.pending_config_change = None;
    domain.last_owner_activity_at = now;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!("config change {change_id} executed"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

#[derive(Accounts)]
pub struct VetoConfigChange<'info> {
    pub guardian: Signer<'info>,
    #[account(mut, seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

pub fn veto_config_change(ctx: Context<VetoConfigChange>, change_id: u64, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let guardian = ctx.accounts.guardian.key().to_string();
    require!(
        domain
            .multisig
            .as_ref()
            .is_some_and(|multisig| multisig.guardians.iter().any(|known| known == &guardian)),
        AuraCoreError::UnauthorizedGuardian
    );
    let change = domain
        .pending_config_change
        .as_mut()
        .ok_or_else(|| error!(AuraCoreError::NoActiveOverride))?;
    require!(
        change.change_id == change_id,
        AuraCoreError::NoActiveOverride
    );
    require!(
        now <= change.proposed_at + crate::constants::VETO_WINDOW_SECS,
        AuraCoreError::TimelockNotElapsed
    );
    change.vetoed = true;
    domain.audit_trail.record(
        AuditKind::ConfigChangeVetoed,
        format!("config change {change_id} vetoed by guardian {guardian}"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

#[derive(Accounts)]
pub struct TriggerDeadMansSwitch<'info> {
    #[account(mut, seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

pub fn trigger_dead_mans_switch(ctx: Context<TriggerDeadMansSwitch>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain
        .trigger_dead_mans_switch(now)
        .map_err(crate::map_treasury_error)?;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

pub fn transition_agent_state(
    ctx: Context<OwnerTreasury>,
    target_state: u8,
    now: i64,
) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let target = lifecycle_state_from_code(target_state)?;
    domain
        .transition_agent_state(target, now)
        .map_err(crate::map_treasury_error)?;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

pub fn propose_guardian_rotation(
    ctx: Context<VetoConfigChange>,
    action: u8,
    target_guardian: Pubkey,
    now: i64,
) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let guardian = ctx.accounts.guardian.key().to_string();
    let multisig = domain
        .multisig
        .as_mut()
        .ok_or_else(|| error!(AuraCoreError::NoActiveOverride))?;
    let action = match action {
        0 => GuardianChangeAction::Add,
        1 => GuardianChangeAction::Remove,
        _ => return err!(AuraCoreError::InvalidStateTransition),
    };
    multisig
        .propose_guardian_change(&guardian, action, target_guardian.to_string(), now)
        .map_err(crate::map_treasury_error)?;
    domain.audit_trail.record(
        AuditKind::ConfigChangeProposed,
        format!("guardian rotation proposed for {target_guardian}"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

pub fn execute_guardian_rotation(ctx: Context<VetoConfigChange>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let guardian = ctx.accounts.guardian.key().to_string();
    let multisig = domain
        .multisig
        .as_mut()
        .ok_or_else(|| error!(AuraCoreError::NoActiveOverride))?;
    multisig
        .collect_guardian_change_signature(&guardian)
        .map_err(crate::map_treasury_error)?;
    let action = multisig
        .execute_guardian_change(now)
        .map_err(crate::map_treasury_error)?;
    domain.audit_trail.record(
        match action {
            GuardianChangeAction::Add => AuditKind::GuardianAdded,
            GuardianChangeAction::Remove => AuditKind::GuardianRemoved,
        },
        "guardian rotation executed",
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

pub fn emergency_shutdown(
    ctx: Context<OwnerTreasury>,
    recovery_pubkey: Pubkey,
    now: i64,
) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain
        .emergency_shutdown(
            &ctx.accounts.owner.key().to_string(),
            recovery_pubkey.to_string(),
            now,
        )
        .map_err(crate::map_treasury_error)?;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
