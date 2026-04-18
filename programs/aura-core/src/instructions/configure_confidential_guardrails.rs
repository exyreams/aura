use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    cpi::{parse_ciphertext_account, ENCRYPT_FHE_UINT64},
    instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
};

#[derive(Accounts)]
pub struct ConfigureConfidentialGuardrails<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Account<'info, TreasuryAccount>,
    /// CHECK: Encrypt-owned ciphertext account for the encrypted daily limit.
    pub daily_limit_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext account for the encrypted per-transaction limit.
    pub per_tx_limit_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext account for the encrypted spent-today counter.
    #[account(mut)]
    pub spent_today_ciphertext: UncheckedAccount<'info>,
}

/// Configures scalar FHE guardrails on the treasury using three separate
/// `u64` ciphertext accounts (daily limit, per-tx limit, spent-today counter).
///
/// All three ciphertext accounts must be owned by the Encrypt program,
/// have FHE type `ENCRYPT_FHE_UINT64`, and have status `1` (verified).
/// Only the treasury owner may call this instruction.
pub fn handler(ctx: Context<ConfigureConfidentialGuardrails>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain()?;
    let expected_encrypt_program: Pubkey = domain
        .deployment
        .encrypt_program_id
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidDeployment))?;

    validate_u64_ciphertext(
        &ctx.accounts.daily_limit_ciphertext,
        &expected_encrypt_program,
        true,
    )?;
    validate_u64_ciphertext(
        &ctx.accounts.per_tx_limit_ciphertext,
        &expected_encrypt_program,
        true,
    )?;
    validate_u64_ciphertext(
        &ctx.accounts.spent_today_ciphertext,
        &expected_encrypt_program,
        true,
    )?;

    domain.configure_confidential_guardrails(
        ctx.accounts.daily_limit_ciphertext.key().to_string(),
        ctx.accounts.per_tx_limit_ciphertext.key().to_string(),
        ctx.accounts.spent_today_ciphertext.key().to_string(),
        now,
    );

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

/// Validates that `account` is an Encrypt-owned `u64` ciphertext with the
/// expected FHE type. If `require_verified` is `true`, also checks that the
/// ciphertext status byte is `1` (network-verified).
fn validate_u64_ciphertext(
    account: &UncheckedAccount<'_>,
    expected_encrypt_program: &Pubkey,
    require_verified: bool,
) -> Result<()> {
    if *account.owner != *expected_encrypt_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let data = account.try_borrow_data()?;
    let parsed = parse_ciphertext_account(&data).map_err(crate::map_treasury_error)?;
    if parsed.fhe_type != ENCRYPT_FHE_UINT64 {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if require_verified && parsed.status != 1 {
        return err!(crate::AuraCoreError::PolicyOutputNotReady);
    }

    Ok(())
}
