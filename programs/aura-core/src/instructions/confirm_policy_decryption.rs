use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    execution::{
        apply_confidential_policy_result, confirm_pending_decryption, expire_pending_transaction,
    },
    ext_cpi::{
        decode_digest_hex, decrypt_scalar_u64, decrypt_u64_lane,
        is_supported_policy_scalar_fhe_type, parse_decryption_request_account,
        verify_decryption_request_digest, DecryptionStatus, ENCRYPT_FHE_VECTOR_U64,
    },
    instructions::sync_treasury_pending_account,
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
    pub treasury: Box<Account<'info, TreasuryAccount>>,
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
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    expire_pending_transaction(domain.as_mut(), now).map_err(crate::map_treasury_error)?;
    confirm_live_decryption(&ctx, domain.as_mut(), now)?;
    sync_treasury_pending_account(&mut ctx.accounts.treasury, domain.as_ref(), now)
}

#[inline(never)]
fn confirm_live_decryption(
    ctx: &Context<ConfirmPolicyDecryption>,
    domain: &mut crate::AgentTreasury,
    now: i64,
) -> Result<()> {
    let request_key = ctx.accounts.request_account.key();
    let request_key_string = request_key.to_string();
    let (
        expected_request_account,
        expected_ciphertext_account,
        expected_digest_hex,
        expected_fhe_type,
        has_policy_output,
    ) = {
        let pending = domain
            .active_pending()
            .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
        let decrypt_request = pending
            .decryption_request
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::DecryptionNotReady))?;
        (
            decrypt_request.request_account.clone(),
            decrypt_request.ciphertext_account.clone(),
            decrypt_request.expected_digest.clone(),
            pending
                .policy_output_fhe_type
                .ok_or_else(|| error!(crate::AuraCoreError::PolicyGraphMismatch))?,
            pending.policy_output_ciphertext_account.is_some(),
        )
    };

    if expected_request_account != request_key_string {
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

    let (plaintext_sha256, confidential_violation_code, decrypted_next_spent_today) = {
        let request_data = ctx.accounts.request_account.try_borrow_data()?;
        let parsed =
            parse_decryption_request_account(&request_data).map_err(crate::map_treasury_error)?;
        let expected_digest = decode_digest_hex(
            &expected_digest_hex,
            "stored decryption digest must be a 32-byte hex digest",
        )
        .map_err(crate::map_treasury_error)?;

        if !verify_decryption_request_digest(&parsed, &expected_digest) {
            return err!(crate::AuraCoreError::PolicyDigestMismatch);
        }

        if parsed.requester != crate::ID {
            return err!(crate::AuraCoreError::InvalidExternalAccountData);
        }

        if parsed.ciphertext.to_string() != expected_ciphertext_account {
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
        let (confidential_violation_code, decrypted_next_spent_today) =
            match (has_policy_output, parsed.fhe_type) {
                (true, fhe_type) if is_supported_policy_scalar_fhe_type(fhe_type) => (
                    Some(decrypt_scalar_u64(&parsed).map_err(crate::map_treasury_error)?),
                    None,
                ),
                (true, ENCRYPT_FHE_VECTOR_U64) => (
                    Some(decrypt_u64_lane(&parsed, 3).map_err(crate::map_treasury_error)?),
                    Some(decrypt_u64_lane(&parsed, 2).map_err(crate::map_treasury_error)?),
                ),
                (true, _) => return err!(crate::AuraCoreError::InvalidExternalAccountData),
                (false, _) => (None, None),
            };
        (
            plaintext_sha256,
            confidential_violation_code,
            decrypted_next_spent_today,
        )
    };
    confirm_pending_decryption(domain, &request_key_string, plaintext_sha256, now)
        .map_err(crate::map_treasury_error)?;
    if let Some(violation_code) = confidential_violation_code {
        apply_confidential_policy_result(domain, violation_code, decrypted_next_spent_today, now)
            .map_err(crate::map_treasury_error)?;
    }

    Ok(())
}
