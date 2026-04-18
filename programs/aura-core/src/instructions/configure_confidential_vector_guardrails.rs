use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    cpi::{parse_ciphertext_account, ENCRYPT_FHE_VECTOR_U64},
    instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
};

#[derive(Accounts)]
pub struct ConfigureConfidentialVectorGuardrails<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Account<'info, TreasuryAccount>,
    /// CHECK: Encrypt-owned ciphertext account containing [daily_limit, per_tx_limit, spent_today] as an EUint64Vector.
    pub guardrail_vector_ciphertext: UncheckedAccount<'info>,
}

/// Configures vector FHE guardrails on the treasury using a single
/// `EUint64Vector` ciphertext that encodes `[daily_limit, per_tx_limit, spent_today]`.
///
/// The ciphertext account must be owned by the Encrypt program, have FHE type
/// `ENCRYPT_FHE_VECTOR_U64`, and have status `1` (verified).
/// Only the treasury owner may call this instruction.
pub fn handler(ctx: Context<ConfigureConfidentialVectorGuardrails>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain()?;
    let expected_encrypt_program: Pubkey = domain
        .deployment
        .encrypt_program_id
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidDeployment))?;

    validate_guardrail_vector(
        &ctx.accounts.guardrail_vector_ciphertext,
        &expected_encrypt_program,
    )?;

    domain.configure_confidential_vector_guardrails(
        ctx.accounts.guardrail_vector_ciphertext.key().to_string(),
        now,
    );

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

fn validate_guardrail_vector(
    account: &UncheckedAccount<'_>,
    expected_encrypt_program: &Pubkey,
) -> Result<()> {
    if *account.owner != *expected_encrypt_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let data = account.try_borrow_data()?;
    let parsed = parse_ciphertext_account(&data).map_err(crate::map_treasury_error)?;
    if parsed.fhe_type != ENCRYPT_FHE_VECTOR_U64 {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if parsed.status != 1 {
        return err!(crate::AuraCoreError::PolicyOutputNotReady);
    }

    Ok(())
}
