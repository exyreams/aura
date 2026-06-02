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
    vault.fee_balance = 0;
    vault.fee_debt_usd = 0;
    vault.low_balance_mode = crate::program_accounts::low_balance_mode::BLOCK;
    vault.splits = Vec::new();
    Ok(())
}

#[derive(Accounts)]
pub struct CollectFees<'info> {
    #[account(mut, constraint = protocol_authority.key() == fee_vault.protocol_fee_recipient @ AuraCoreError::UnauthorizedOwner)]
    pub protocol_authority: Signer<'info>,
    #[account(mut, seeds = [FEE_VAULT_SEED, fee_vault.treasury.as_ref()], bump = fee_vault.bump)]
    pub fee_vault: Box<Account<'info, FeeVaultAccount>>,
    /// CHECK: validated against vault recipient (used only when no split table is set)
    #[account(mut, constraint = recipient.key() == fee_vault.protocol_fee_recipient)]
    pub recipient: UncheckedAccount<'info>,
}

/// Sweeps the accrued bucket to recipients. With no split table configured, the
/// full balance drains to `protocol_fee_recipient`. With a split table, each
/// recipient is paid its `share_bps` — the recipients are supplied, in split
/// order, as `remaining_accounts`.
pub fn collect_fees(ctx: Context<CollectFees>, now: i64) -> Result<()> {
    let accrued = ctx.accounts.fee_vault.accumulated_fees_lamports;
    require!(accrued > 0, AuraCoreError::NoPendingTransaction);
    let vault_lamports = ctx.accounts.fee_vault.to_account_info().lamports();
    require!(
        vault_lamports >= accrued,
        AuraCoreError::InvalidExternalAccountData
    );

    let splits = ctx.accounts.fee_vault.splits.clone();
    if splits.is_empty() {
        **ctx
            .accounts
            .fee_vault
            .to_account_info()
            .try_borrow_mut_lamports()? -= accrued;
        **ctx.accounts.recipient.try_borrow_mut_lamports()? += accrued;
    } else {
        require!(
            ctx.remaining_accounts.len() == splits.len(),
            AuraCoreError::FeeSplitsInvalid
        );
        let mut paid = 0u64;
        for (index, split) in splits.iter().enumerate() {
            let account = &ctx.remaining_accounts[index];
            require!(
                account.key() == split.recipient,
                AuraCoreError::FeeSplitsInvalid
            );
            // The last split takes the rounding remainder so the bucket fully drains.
            let share = if index == splits.len() - 1 {
                accrued.saturating_sub(paid)
            } else {
                accrued.saturating_mul(u64::from(split.share_bps)) / 10_000
            };
            **ctx
                .accounts
                .fee_vault
                .to_account_info()
                .try_borrow_mut_lamports()? -= share;
            **account.try_borrow_mut_lamports()? += share;
            paid = paid.saturating_add(share);
        }
    }

    ctx.accounts.fee_vault.accumulated_fees_lamports = 0;
    ctx.accounts.fee_vault.last_collection_at = now;
    ctx.accounts.fee_vault.fee_count = ctx.accounts.fee_vault.fee_count.saturating_add(1);
    Ok(())
}

#[derive(Accounts)]
pub struct ManageFeeVault<'info> {
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
        seeds = [FEE_VAULT_SEED, treasury.key().as_ref()],
        bump = fee_vault.bump,
        constraint = fee_vault.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub fee_vault: Box<Account<'info, FeeVaultAccount>>,
    pub system_program: Program<'info, System>,
}

/// Tops up the prepaid fee balance with a real lamport transfer into the vault.
pub fn deposit_fees(ctx: Context<ManageFeeVault>, amount: u64) -> Result<()> {
    require!(amount > 0, AuraCoreError::InsufficientFeeBalance);
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.fee_vault.to_account_info(),
            },
        ),
        amount,
    )?;
    ctx.accounts.fee_vault.fee_balance = ctx.accounts.fee_vault.fee_balance.saturating_add(amount);
    Ok(())
}

/// Returns part of the prepaid balance to the owner. Cannot touch accrued fees.
pub fn withdraw_unused_fees(ctx: Context<ManageFeeVault>, amount: u64) -> Result<()> {
    require!(
        amount <= ctx.accounts.fee_vault.fee_balance,
        AuraCoreError::InsufficientFeeBalance
    );
    let vault_info = ctx.accounts.fee_vault.to_account_info();
    let accrued = ctx.accounts.fee_vault.accumulated_fees_lamports;
    // Preserve rent + the accrued bucket; only the prepaid surplus is withdrawable.
    let rent = Rent::get()?.minimum_balance(vault_info.data_len());
    require!(
        vault_info.lamports() >= rent.saturating_add(accrued).saturating_add(amount),
        AuraCoreError::InsufficientFeeBalance
    );
    **vault_info.try_borrow_mut_lamports()? -= amount;
    **ctx
        .accounts
        .owner
        .to_account_info()
        .try_borrow_mut_lamports()? += amount;
    ctx.accounts.fee_vault.fee_balance = ctx.accounts.fee_vault.fee_balance.saturating_sub(amount);
    Ok(())
}

/// Sets the recipient split table and the low-balance behavior.
pub fn set_fee_splits(
    ctx: Context<ManageFeeVault>,
    splits: Vec<crate::program_accounts::FeeSplitRecord>,
    low_balance_mode: u8,
) -> Result<()> {
    require!(
        splits.len() <= crate::constants::MAX_FEE_SPLITS,
        AuraCoreError::FeeSplitsInvalid
    );
    require!(low_balance_mode <= 2, AuraCoreError::FeeSplitsInvalid);
    if !splits.is_empty() {
        let total: u32 = splits.iter().map(|split| u32::from(split.share_bps)).sum();
        require!(total == 10_000, AuraCoreError::FeeSplitsInvalid);
        require!(
            splits
                .iter()
                .all(|split| split.recipient != Pubkey::default()),
            AuraCoreError::FeeSplitsInvalid
        );
    }
    ctx.accounts.fee_vault.splits = splits;
    ctx.accounts.fee_vault.low_balance_mode = low_balance_mode;
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
        constraint = fee_vault.accumulated_fees_lamports == 0 @ AuraCoreError::NoPendingTransaction,
        constraint = fee_vault.fee_debt_usd == 0 @ AuraCoreError::FeeDebtOutstanding
    )]
    pub fee_vault: Box<Account<'info, FeeVaultAccount>>,
}

/// Debits `fee` (in settlement units) from the prepaid balance into the accrued
/// bucket, applying the vault's low-balance policy when the balance is short.
/// Under `Block` an insufficient balance refuses execution; under `Degrade` the
/// shortfall is recorded as `fee_debt_usd`; under `Warn` accrual is skipped.
pub fn accrue_fee(vault: &mut FeeVaultAccount, fee: u64) -> Result<()> {
    use crate::program_accounts::low_balance_mode;
    if fee == 0 {
        return Ok(());
    }
    if vault.fee_balance >= fee {
        vault.fee_balance -= fee;
        vault.accumulated_fees_lamports = vault.accumulated_fees_lamports.saturating_add(fee);
        return Ok(());
    }
    match vault.low_balance_mode {
        low_balance_mode::BLOCK => err!(AuraCoreError::InsufficientFeeBalance),
        low_balance_mode::DEGRADE => {
            let covered = vault.fee_balance;
            vault.accumulated_fees_lamports =
                vault.accumulated_fees_lamports.saturating_add(covered);
            vault.fee_balance = 0;
            vault.fee_debt_usd = vault.fee_debt_usd.saturating_add(fee - covered);
            Ok(())
        }
        _ => Ok(()),
    }
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
