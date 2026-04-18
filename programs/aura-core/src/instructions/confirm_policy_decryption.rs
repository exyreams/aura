use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    execution::{
        apply_confidential_policy_result, confirm_pending_decryption, expire_pending_transaction,
    },
    ext_cpi::{
        decode_digest_hex, decrypt_u64, decrypt_u64_lane, parse_decryption_request_account,
        verify_decryption_request_digest, DecryptionStatus, ENCRYPT_FHE_UINT64,
        ENCRYPT_FHE_VECTOR_U64,
    },
    instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
};

#[derive(Accounts)]
pub struct ConfirmPolicyDecryption<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == operator.key() || treasury.ai_authority == operator.key() @ crate::AuraCoreError::UnauthorizedExecutor
    )]
    pub treasury: Account<'info, TreasuryAccount>,
    /// CHECK: Completed decryption request account owned by the Encrypt program.
    pub request_account: UncheckedAccount<'info>,
}

/// Verifies a completed Encrypt decryption request and applies the confidential
/// policy result to the pending transaction.
///
/// Checks expiry, validates the request account ownership and digest, reads
/// the decrypted violation code (and optionally `next_spent_today` for vector
/// FHE), then calls `confirm_pending_decryption` and
/// `apply_confidential_policy_result`. The operator must be the owner or AI
/// authority.
pub fn handler(ctx: Context<ConfirmPolicyDecryption>, now: i64) -> Result<()> {
    let mut domain = Box::new(ctx.accounts.treasury.to_domain()?);
    expire_pending_transaction(domain.as_mut(), now).map_err(crate::map_treasury_error)?;
    confirm_live_decryption(&ctx, domain.as_mut(), now)?;
    sync_treasury_account(&mut ctx.accounts.treasury, domain.as_ref(), now)
}

#[inline(never)]
fn confirm_live_decryption(
    ctx: &Context<ConfirmPolicyDecryption>,
    domain: &mut crate::AgentTreasury,
    now: i64,
) -> Result<()> {
    let pending = domain
        .pending
        .clone()
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    let decrypt_request = pending
        .decryption_request
        .clone()
        .ok_or_else(|| error!(crate::AuraCoreError::DecryptionNotReady))?;
    let expected_fhe_type = pending
        .policy_output_fhe_type
        .ok_or_else(|| error!(crate::AuraCoreError::PolicyGraphMismatch))?;

    if decrypt_request.request_account != ctx.accounts.request_account.key().to_string() {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let expected_encrypt_program: Pubkey = domain
        .deployment
        .encrypt_program_id
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidDeployment))?;
    if *ctx.accounts.request_account.owner != expected_encrypt_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let request_data = ctx.accounts.request_account.try_borrow_data()?;
    let parsed =
        parse_decryption_request_account(&request_data).map_err(crate::map_treasury_error)?;
    let expected_digest = decode_digest_hex(
        &decrypt_request.expected_digest,
        "stored decryption digest must be a 32-byte hex digest",
    )
    .map_err(crate::map_treasury_error)?;

    if !verify_decryption_request_digest(&parsed, &expected_digest) {
        return err!(crate::AuraCoreError::PolicyDigestMismatch);
    }

    if parsed.requester != crate::ID {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    if parsed.ciphertext.to_string() != decrypt_request.ciphertext_account {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if parsed.fhe_type != expected_fhe_type {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    if parsed.status() != DecryptionStatus::Ready {
        return err!(crate::AuraCoreError::DecryptionNotReady);
    }

    let plaintext_sha256 = parsed
        .plaintext_sha256()
        .ok_or_else(|| error!(crate::AuraCoreError::DecryptionNotReady))?;
    let (confidential_violation_code, decrypted_next_spent_today) = match (
        pending.policy_output_ciphertext_account.as_ref(),
        parsed.fhe_type,
    ) {
        (Some(_), ENCRYPT_FHE_UINT64) => (
            Some(decrypt_u64(&parsed).map_err(crate::map_treasury_error)?),
            None,
        ),
        (Some(_), ENCRYPT_FHE_VECTOR_U64) => (
            Some(decrypt_u64_lane(&parsed, 3).map_err(crate::map_treasury_error)?),
            Some(decrypt_u64_lane(&parsed, 2).map_err(crate::map_treasury_error)?),
        ),
        (Some(_), _) => return err!(crate::AuraCoreError::InvalidExternalAccountData),
        (None, _) => (None, None),
    };
    confirm_pending_decryption(
        domain,
        &ctx.accounts.request_account.key().to_string(),
        plaintext_sha256,
        now,
    )
    .map_err(crate::map_treasury_error)?;
    if let Some(violation_code) = confidential_violation_code {
        apply_confidential_policy_result(domain, violation_code, decrypted_next_spent_today, now)
            .map_err(crate::map_treasury_error)?;
    }

    Ok(())
}
