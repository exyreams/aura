//! Confidential guardrail lifecycle on a sidecar PDA.
//!
//! Adds the create → update → rotate → disable → reset → close lifecycle that
//! the treasury-embedded guardrails never had, plus an Encrypt epoch marker so a
//! long-lived confidential treasury can rotate its ciphertexts instead of
//! silently breaking when the network key rotates. The treasury's original
//! three-pointer record stays as a back-compat fallback.

use anchor_lang::prelude::*;

use crate::{
    audit::AuditKind,
    constants::{CONFIDENTIAL_GUARDRAILS_SEED, TREASURY_SEED},
    instructions::{
        configure_confidential_guardrails::validate_u64_ciphertext, sync_treasury_account,
    },
    program_accounts::{
        ConfidentialGuardrailsAccount, TreasuryAccount, CONFIDENTIAL_GUARDRAILS_SPACE,
    },
    AuraCoreError,
};

/// Resolves the Encrypt program id and validates an optional ciphertext account,
/// returning its key when present.
fn validated_pointer(
    account: &Option<UncheckedAccount<'_>>,
    encrypt_program: &Pubkey,
) -> Result<Option<Pubkey>> {
    match account {
        Some(account) => {
            validate_u64_ciphertext(account, encrypt_program, true)?;
            Ok(Some(account.key()))
        }
        None => Ok(None),
    }
}

fn encrypt_program(treasury: &TreasuryAccount) -> Result<Pubkey> {
    treasury
        .to_domain_boxed()?
        .deployment
        .encrypt_program_id
        .parse()
        .map_err(|_| error!(AuraCoreError::InvalidDeployment))
}

fn record_audit(
    treasury: &mut Box<Account<TreasuryAccount>>,
    kind: AuditKind,
    detail: &str,
    now: i64,
) -> Result<()> {
    let mut domain = treasury.to_domain_boxed()?;
    domain.audit_trail.record(kind, detail.to_string(), now);
    domain.last_owner_activity_at = now;
    sync_treasury_account(treasury, &domain, now)
}

#[derive(Accounts)]
pub struct InitConfidentialGuardrails<'info> {
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
        space = CONFIDENTIAL_GUARDRAILS_SPACE,
        seeds = [CONFIDENTIAL_GUARDRAILS_SEED, treasury.key().as_ref()],
        bump
    )]
    pub guardrails: Box<Account<'info, ConfidentialGuardrailsAccount>>,
    /// CHECK: Encrypt-owned ciphertext for the encrypted daily limit.
    pub daily_limit_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext for the encrypted per-transaction limit.
    pub per_tx_limit_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext for the encrypted spent-today counter.
    pub spent_today_ciphertext: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Creates the sidecar and stores the initial core ciphertext pointers under
/// `epoch_id`, with the guardrails enabled.
pub fn init_confidential_guardrails(
    ctx: Context<InitConfidentialGuardrails>,
    epoch_id: u64,
    now: i64,
) -> Result<()> {
    let program = encrypt_program(&ctx.accounts.treasury)?;
    validate_u64_ciphertext(&ctx.accounts.daily_limit_ciphertext, &program, true)?;
    validate_u64_ciphertext(&ctx.accounts.per_tx_limit_ciphertext, &program, true)?;
    validate_u64_ciphertext(&ctx.accounts.spent_today_ciphertext, &program, true)?;

    let guardrails = &mut ctx.accounts.guardrails;
    guardrails.bump = ctx.bumps.guardrails;
    guardrails.treasury = ctx.accounts.treasury.key();
    guardrails.epoch_id = epoch_id;
    guardrails.enabled = true;
    guardrails.updated_at = now;
    guardrails.daily_limit_ciphertext = Some(ctx.accounts.daily_limit_ciphertext.key());
    guardrails.per_tx_limit_ciphertext = Some(ctx.accounts.per_tx_limit_ciphertext.key());
    guardrails.spent_today_ciphertext = Some(ctx.accounts.spent_today_ciphertext.key());
    Ok(())
}

#[derive(Accounts)]
pub struct ManageConfidentialGuardrails<'info> {
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
        seeds = [CONFIDENTIAL_GUARDRAILS_SEED, treasury.key().as_ref()],
        bump = guardrails.bump,
        constraint = guardrails.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub guardrails: Box<Account<'info, ConfidentialGuardrailsAccount>>,
    /// CHECK: optional Encrypt ciphertext (daily limit). Validated when present.
    pub daily_limit_ciphertext: Option<UncheckedAccount<'info>>,
    /// CHECK: optional Encrypt ciphertext (per-tx limit).
    pub per_tx_limit_ciphertext: Option<UncheckedAccount<'info>>,
    /// CHECK: optional Encrypt ciphertext (velocity limit).
    pub velocity_limit_ciphertext: Option<UncheckedAccount<'info>>,
    /// CHECK: optional Encrypt ciphertext (hourly limit).
    pub hourly_limit_ciphertext: Option<UncheckedAccount<'info>>,
    /// CHECK: optional Encrypt ciphertext (weekly limit).
    pub weekly_limit_ciphertext: Option<UncheckedAccount<'info>>,
    /// CHECK: optional Encrypt ciphertext (spent-today counter).
    pub spent_today_ciphertext: Option<UncheckedAccount<'info>>,
    /// CHECK: optional Encrypt ciphertext (hourly-spent counter).
    pub hourly_spent_ciphertext: Option<UncheckedAccount<'info>>,
    /// CHECK: optional Encrypt ciphertext (velocity-window counter).
    pub velocity_window_ciphertext: Option<UncheckedAccount<'info>>,
}

/// Re-points any subset of ciphertexts. Fields left absent are unchanged.
pub fn update_confidential_guardrails(
    mut ctx: Context<ManageConfidentialGuardrails>,
    now: i64,
) -> Result<()> {
    apply_pointer_updates(&mut ctx, now)?;
    record_audit(
        &mut ctx.accounts.treasury,
        AuditKind::ConfidentialGuardrailsUpdated,
        "confidential guardrail pointers updated",
        now,
    )
}

/// Swaps ciphertexts to a new Encrypt epoch. Any provided pointer is re-pointed
/// and the epoch marker is stamped so the propose path accepts the new epoch.
pub fn rotate_confidential_guardrails(
    mut ctx: Context<ManageConfidentialGuardrails>,
    new_epoch_id: u64,
    now: i64,
) -> Result<()> {
    apply_pointer_updates(&mut ctx, now)?;
    ctx.accounts.guardrails.epoch_id = new_epoch_id;
    ctx.accounts.guardrails.enabled = true;
    record_audit(
        &mut ctx.accounts.treasury,
        AuditKind::ConfidentialGuardrailsRotated,
        "confidential guardrails rotated to a new epoch",
        now,
    )
}

/// Re-points the encrypted counter ciphertexts to freshly-zeroed ones at a new
/// day/epoch (the clear counters already reset via `normalize_state`).
pub fn reset_confidential_counters(
    ctx: Context<ManageConfidentialGuardrails>,
    now: i64,
) -> Result<()> {
    let program = encrypt_program(&ctx.accounts.treasury)?;
    if let Some(key) = validated_pointer(&ctx.accounts.spent_today_ciphertext, &program)? {
        ctx.accounts.guardrails.spent_today_ciphertext = Some(key);
    }
    if let Some(key) = validated_pointer(&ctx.accounts.hourly_spent_ciphertext, &program)? {
        ctx.accounts.guardrails.hourly_spent_ciphertext = Some(key);
    }
    if let Some(key) = validated_pointer(&ctx.accounts.velocity_window_ciphertext, &program)? {
        ctx.accounts.guardrails.velocity_window_ciphertext = Some(key);
    }
    ctx.accounts.guardrails.updated_at = now;
    record_audit(
        &mut ctx.accounts.treasury,
        AuditKind::ConfidentialGuardrailsUpdated,
        "confidential counters reset",
        now,
    )
}

fn apply_pointer_updates(ctx: &mut Context<ManageConfidentialGuardrails>, now: i64) -> Result<()> {
    let program = encrypt_program(&ctx.accounts.treasury)?;
    macro_rules! set_if_present {
        ($field:ident) => {
            if let Some(key) = validated_pointer(&ctx.accounts.$field, &program)? {
                ctx.accounts.guardrails.$field = Some(key);
            }
        };
    }
    set_if_present!(daily_limit_ciphertext);
    set_if_present!(per_tx_limit_ciphertext);
    set_if_present!(velocity_limit_ciphertext);
    set_if_present!(hourly_limit_ciphertext);
    set_if_present!(weekly_limit_ciphertext);
    set_if_present!(spent_today_ciphertext);
    set_if_present!(hourly_spent_ciphertext);
    set_if_present!(velocity_window_ciphertext);
    ctx.accounts.guardrails.updated_at = now;
    Ok(())
}

#[derive(Accounts)]
pub struct DisableConfidentialGuardrails<'info> {
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
        seeds = [CONFIDENTIAL_GUARDRAILS_SEED, treasury.key().as_ref()],
        bump = guardrails.bump,
        constraint = guardrails.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub guardrails: Box<Account<'info, ConfidentialGuardrailsAccount>>,
}

/// Disables confidential evaluation (falls back to public policy) without
/// tearing down the sidecar.
pub fn disable_confidential_guardrails(
    ctx: Context<DisableConfidentialGuardrails>,
    now: i64,
) -> Result<()> {
    ctx.accounts.guardrails.enabled = false;
    ctx.accounts.guardrails.updated_at = now;
    record_audit(
        &mut ctx.accounts.treasury,
        AuditKind::ConfidentialGuardrailsCleared,
        "confidential guardrails disabled",
        now,
    )
}

#[derive(Accounts)]
pub struct CloseConfidentialGuardrails<'info> {
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
        seeds = [CONFIDENTIAL_GUARDRAILS_SEED, treasury.key().as_ref()],
        bump = guardrails.bump,
        constraint = guardrails.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub guardrails: Box<Account<'info, ConfidentialGuardrailsAccount>>,
}

pub fn close_confidential_guardrails(_ctx: Context<CloseConfidentialGuardrails>) -> Result<()> {
    Ok(())
}
