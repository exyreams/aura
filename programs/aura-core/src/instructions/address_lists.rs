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
pub struct InitAddressList<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump, constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(init, payer = owner, space = ADDRESS_LIST_SPACE, seeds = [ADDRESS_LIST_SEED, treasury.key().as_ref()], bump)]
    pub address_list: Box<Account<'info, AddressListAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_address_list(
    ctx: Context<InitAddressList>,
    mode: u8,
    chain: u8,
    now: i64,
) -> Result<()> {
    let list = &mut ctx.accounts.address_list;
    list.bump = ctx.bumps.address_list;
    list.treasury = ctx.accounts.treasury.key();
    list.mode = mode;
    list.chain = chain;
    list.entry_count = 0;
    list.updated_at = now;
    list.addresses = Vec::new();
    Ok(())
}

pub fn manage_address_list(
    ctx: Context<ManageAddressList>,
    mode: u8,
    chain: u8,
    addresses: Vec<String>,
    now: i64,
) -> Result<()> {
    if ctx.accounts.operator.key() != ctx.accounts.treasury.owner {
        ctx.accounts
            .operator_role
            .as_ref()
            .ok_or_else(|| error!(AuraCoreError::OperatorRoleMissing))?
            .assert_permission(
                ctx.accounts.treasury.key(),
                ctx.accounts.operator.key(),
                role_permissions::MANAGE_ADDRESS_LISTS,
                now,
            )?;
    }
    let list = &mut ctx.accounts.address_list;
    list.treasury = ctx.accounts.treasury.key();
    list.mode = mode;
    list.chain = chain;
    list.entry_count = addresses.len().min(64) as u16;
    list.updated_at = now;
    list.addresses = addresses.into_iter().take(64).collect();
    Ok(())
}

#[derive(Accounts)]
pub struct ManageAddressList<'info> {
    pub operator: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    pub operator_role: Option<Box<Account<'info, OperatorRoleAccount>>>,
    #[account(
        mut,
        seeds = [ADDRESS_LIST_SEED, treasury.key().as_ref()],
        bump = address_list.bump,
        constraint = address_list.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub address_list: Box<Account<'info, AddressListAccount>>,
}

#[derive(Accounts)]
pub struct CloseAddressList<'info> {
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
        seeds = [ADDRESS_LIST_SEED, treasury.key().as_ref()],
        bump = address_list.bump,
        constraint = address_list.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub address_list: Box<Account<'info, AddressListAccount>>,
}

pub fn close_address_list(_ctx: Context<CloseAddressList>) -> Result<()> {
    Ok(())
}

/// Asserts the caller is the owner or an operator with the manage permission.
fn assert_address_list_authority(ctx: &Context<ManageAddressList>, now: i64) -> Result<()> {
    if ctx.accounts.operator.key() != ctx.accounts.treasury.owner {
        ctx.accounts
            .operator_role
            .as_ref()
            .ok_or_else(|| error!(AuraCoreError::OperatorRoleMissing))?
            .assert_permission(
                ctx.accounts.treasury.key(),
                ctx.accounts.operator.key(),
                role_permissions::MANAGE_ADDRESS_LISTS,
                now,
            )?;
    }
    Ok(())
}

/// Adds or removes a single address without resending the whole list.
///
/// `add = true` inserts (idempotent; rejects when the list is full); `add =
/// false` removes (`AddressListEntryNotFound` if absent). Owner- or
/// operator-gated.
pub fn update_address_list_entry(
    ctx: Context<ManageAddressList>,
    address: String,
    add: bool,
    now: i64,
) -> Result<()> {
    assert_address_list_authority(&ctx, now)?;
    let list = &mut ctx.accounts.address_list;
    if add {
        if !list.addresses.iter().any(|entry| entry == &address) {
            require!(
                list.addresses.len() < 64,
                AuraCoreError::InvalidExternalAccountData
            );
            list.addresses.push(address);
        }
    } else {
        let before = list.addresses.len();
        list.addresses.retain(|entry| entry != &address);
        require!(
            list.addresses.len() < before,
            AuraCoreError::AddressListEntryNotFound
        );
    }
    list.entry_count = list.addresses.len() as u16;
    list.updated_at = now;
    Ok(())
}

/// Empties an address list in place. Owner- or operator-gated.
pub fn clear_address_list(ctx: Context<ManageAddressList>, now: i64) -> Result<()> {
    assert_address_list_authority(&ctx, now)?;
    let list = &mut ctx.accounts.address_list;
    list.addresses.clear();
    list.entry_count = 0;
    list.updated_at = now;
    Ok(())
}
