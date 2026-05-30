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
pub struct InitFeeVault<'info> {
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
        space = 8 + FeeVaultAccount::INIT_SPACE,
        seeds = [FEE_VAULT_SEED, treasury.key().as_ref()],
        bump
    )]
    pub fee_vault: Box<Account<'info, FeeVaultAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_fee_vault(
    ctx: Context<InitFeeVault>,
    protocol_fee_recipient: Pubkey,
    now: i64,
) -> Result<()> {
    let vault = &mut ctx.accounts.fee_vault;
    vault.bump = ctx.bumps.fee_vault;
    vault.treasury = ctx.accounts.treasury.key();
    vault.protocol_fee_recipient = protocol_fee_recipient;
    vault.accumulated_fees_lamports = 0;
    vault.total_fees_collected_usd = 0;
    vault.last_collection_at = now;
    vault.fee_count = 0;
    Ok(())
}

#[derive(Accounts)]
pub struct CollectFees<'info> {
    #[account(mut, constraint = protocol_authority.key() == fee_vault.protocol_fee_recipient @ AuraCoreError::UnauthorizedOwner)]
    pub protocol_authority: Signer<'info>,
    #[account(mut, seeds = [FEE_VAULT_SEED, fee_vault.treasury.as_ref()], bump = fee_vault.bump)]
    pub fee_vault: Box<Account<'info, FeeVaultAccount>>,
    /// CHECK: validated against vault recipient
    #[account(mut, constraint = recipient.key() == fee_vault.protocol_fee_recipient)]
    pub recipient: UncheckedAccount<'info>,
}

pub fn collect_fees(ctx: Context<CollectFees>, now: i64) -> Result<()> {
    let amount = ctx.accounts.fee_vault.accumulated_fees_lamports;
    require!(amount > 0, AuraCoreError::NoPendingTransaction);
    let vault_lamports = ctx.accounts.fee_vault.to_account_info().lamports();
    require!(
        vault_lamports >= amount,
        AuraCoreError::InvalidExternalAccountData
    );
    **ctx
        .accounts
        .fee_vault
        .to_account_info()
        .try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.recipient.try_borrow_mut_lamports()? += amount;
    ctx.accounts.fee_vault.accumulated_fees_lamports = 0;
    ctx.accounts.fee_vault.last_collection_at = now;
    ctx.accounts.fee_vault.fee_count = ctx.accounts.fee_vault.fee_count.saturating_add(1);
    Ok(())
}

#[derive(Accounts)]
pub struct CloseFeeVault<'info> {
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
        seeds = [FEE_VAULT_SEED, treasury.key().as_ref()],
        bump = fee_vault.bump,
        constraint = fee_vault.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData,
        constraint = fee_vault.accumulated_fees_lamports == 0 @ AuraCoreError::NoPendingTransaction
    )]
    pub fee_vault: Box<Account<'info, FeeVaultAccount>>,
}

pub fn close_fee_vault(_ctx: Context<CloseFeeVault>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFeeRecipient<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [FEE_VAULT_SEED, treasury.key().as_ref()],
        bump = fee_vault.bump,
        constraint = fee_vault.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub fee_vault: Box<Account<'info, FeeVaultAccount>>,
}

/// Updates the protocol fee recipient on the fee vault. Owner-gated.
pub fn update_fee_recipient(ctx: Context<UpdateFeeRecipient>, new_recipient: Pubkey) -> Result<()> {
    ctx.accounts.fee_vault.protocol_fee_recipient = new_recipient;
    Ok(())
}
