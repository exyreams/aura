use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    execution::{expire_pending_transaction, mark_pending_decryption_request},
    ext_cpi::{
        parse_ciphertext_account, request_decryption_via_cpi, ENCRYPT_CPI_AUTHORITY_SEED,
        ENCRYPT_EVENT_AUTHORITY_SEED, ENCRYPT_FHE_UINT64, ENCRYPT_FHE_VECTOR_U64,
    },
    instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
    state::PendingDecryptionRequest,
};

#[derive(Accounts)]
pub struct RequestPolicyDecryption<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == operator.key() || treasury.ai_authority == operator.key() @ crate::AuraCoreError::UnauthorizedExecutor
    )]
    pub treasury: Account<'info, TreasuryAccount>,
    /// CHECK: Decryption request PDA owned by the Encrypt program.
    #[account(mut)]
    pub request_account: UncheckedAccount<'info>,
    /// CHECK: Ciphertext account owned by the Encrypt program.
    pub ciphertext: UncheckedAccount<'info>,
    /// CHECK: Official Encrypt program account.
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt config account.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Encrypt deposit account.
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    /// CHECK: This program executable account.
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt CPI authority PDA derived from this program.
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: Encrypt network encryption key account.
    pub network_encryption_key: UncheckedAccount<'info>,
    /// CHECK: Encrypt event authority PDA.
    pub event_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Submits a `request_decryption` CPI to the Encrypt program for the pending
/// transaction's policy output ciphertext.
///
/// Validates expiry, all Encrypt account addresses, and the ciphertext FHE
/// type, then calls `request_decryption_via_cpi` and records the resulting
/// `PendingDecryptionRequest`. The Encrypt network decrypts asynchronously;
/// `confirm_policy_decryption` must be called once the plaintext is ready.
///
/// The operator must be the owner or AI authority.
pub fn handler(ctx: Context<RequestPolicyDecryption>, now: i64) -> Result<()> {
    let mut domain = Box::new(ctx.accounts.treasury.to_domain()?);
    expire_pending_transaction(domain.as_mut(), now).map_err(crate::map_treasury_error)?;
    request_live_decryption(&ctx, domain.as_mut(), now)?;
    sync_treasury_account(&mut ctx.accounts.treasury, domain.as_ref(), now)
}

#[inline(never)]
fn request_live_decryption(
    ctx: &Context<RequestPolicyDecryption>,
    domain: &mut crate::AgentTreasury,
    now: i64,
) -> Result<()> {
    let pending = domain
        .pending
        .clone()
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    if pending.decryption_request.is_some() {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    let expected_ciphertext_account = pending
        .policy_output_ciphertext_account
        .as_ref()
        .ok_or_else(|| error!(crate::AuraCoreError::PolicyGraphMismatch))?;
    let expected_fhe_type = pending
        .policy_output_fhe_type
        .ok_or_else(|| error!(crate::AuraCoreError::PolicyGraphMismatch))?;

    let expected_encrypt_program: Pubkey = domain
        .deployment
        .encrypt_program_id
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidDeployment))?;
    if ctx.accounts.encrypt_program.key() != expected_encrypt_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if *ctx.accounts.ciphertext.owner != expected_encrypt_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if ctx.accounts.ciphertext.key().to_string() != *expected_ciphertext_account {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    if ctx.accounts.caller_program.key() != crate::ID || !ctx.accounts.caller_program.executable {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let (expected_cpi_authority, cpi_authority_bump) =
        Pubkey::find_program_address(&[ENCRYPT_CPI_AUTHORITY_SEED], &crate::ID);
    if ctx.accounts.cpi_authority.key() != expected_cpi_authority {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let (expected_event_authority, _) =
        Pubkey::find_program_address(&[ENCRYPT_EVENT_AUTHORITY_SEED], &expected_encrypt_program);
    if ctx.accounts.event_authority.key() != expected_event_authority {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    let ciphertext_data = ctx.accounts.ciphertext.try_borrow_data()?;
    let ciphertext =
        parse_ciphertext_account(&ciphertext_data).map_err(crate::map_treasury_error)?;
    if ciphertext.fhe_type != expected_fhe_type {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if ciphertext.fhe_type != ENCRYPT_FHE_UINT64 && ciphertext.fhe_type != ENCRYPT_FHE_VECTOR_U64 {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if ciphertext.status != 1 {
        return err!(crate::AuraCoreError::PolicyOutputNotReady);
    }
    drop(ciphertext_data);

    let digest = request_decryption_via_cpi(
        &ctx.accounts.encrypt_program.to_account_info(),
        &ctx.accounts.config.to_account_info(),
        &ctx.accounts.deposit.to_account_info(),
        &ctx.accounts.request_account.to_account_info(),
        &ctx.accounts.caller_program.to_account_info(),
        &ctx.accounts.cpi_authority.to_account_info(),
        &ctx.accounts.ciphertext.to_account_info(),
        &ctx.accounts.operator.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.event_authority.to_account_info(),
        cpi_authority_bump,
    )?;

    mark_pending_decryption_request(
        domain,
        PendingDecryptionRequest {
            ciphertext_account: ctx.accounts.ciphertext.key().to_string(),
            request_account: ctx.accounts.request_account.key().to_string(),
            expected_digest: hex::encode(digest),
            requested_at: now,
            verified_at: None,
            plaintext_sha256: None,
        },
        now,
    )
    .map_err(crate::map_treasury_error)?;

    Ok(())
}
