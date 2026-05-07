use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    ext_cpi::{
        decode_digest_hex, decrypt_scalar_u64, decrypt_u64_lane,
        is_supported_policy_scalar_fhe_type, parse_decryption_request_account,
        verify_decryption_request_digest, DecryptionStatus, ENCRYPT_FHE_UINT64,
        ENCRYPT_FHE_VECTOR_U64,
    },
    program_accounts::{violation_code, TreasuryAccount},
    state::ENCRYPT_DEVNET_PROGRAM_ID,
};
use aura_policy::ViolationCode;

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
/// authority. Vector outputs use lanes 3 and 4 as daily/per-transaction flags
/// so the graph can avoid heap-heavy lane extraction.
pub fn handler(ctx: Context<ConfirmPolicyDecryption>, now: i64) -> Result<()> {
    confirm_live_decryption(ctx, now)
}

#[inline(never)]
fn confirm_live_decryption(ctx: Context<ConfirmPolicyDecryption>, now: i64) -> Result<()> {
    let request_key = ctx.accounts.request_account.key();
    let (
        expected_request_account,
        expected_ciphertext_account,
        expected_digest_hex,
        expected_fhe_type,
        has_policy_output,
    ) = {
        let pending = ctx
            .accounts
            .treasury
            .pending_queue
            .first()
            .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
        if now > pending.expires_at {
            return err!(crate::AuraCoreError::PendingTransactionExpired);
        }
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

    let expected_request_account: Pubkey = expected_request_account
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidExternalAccountData))?;
    if expected_request_account != request_key {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    let expected_ciphertext_account: Pubkey = expected_ciphertext_account
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidExternalAccountData))?;

    let expected_encrypt_program: Pubkey = ENCRYPT_DEVNET_PROGRAM_ID
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

        if parsed.ciphertext != expected_ciphertext_account {
            return err!(crate::AuraCoreError::InvalidExternalAccountData);
        }
        let scalar_policy_output_matches = expected_fhe_type == ENCRYPT_FHE_UINT64
            && is_supported_policy_scalar_fhe_type(parsed.fhe_type);
        if parsed.fhe_type != expected_fhe_type && !scalar_policy_output_matches {
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
                (true, ENCRYPT_FHE_VECTOR_U64) => {
                    let daily_exceeded =
                        decrypt_u64_lane(&parsed, 3).map_err(crate::map_treasury_error)?;
                    let per_tx_exceeded =
                        decrypt_u64_lane(&parsed, 4).map_err(crate::map_treasury_error)?;
                    if daily_exceeded > 1 || per_tx_exceeded > 1 {
                        return err!(crate::AuraCoreError::InvalidExternalAccountData);
                    }
                    let violation_code = if per_tx_exceeded == 1 {
                        1
                    } else if daily_exceeded == 1 {
                        2
                    } else {
                        0
                    };
                    (
                        Some(violation_code),
                        Some(decrypt_u64_lane(&parsed, 2).map_err(crate::map_treasury_error)?),
                    )
                }
                (true, _) => return err!(crate::AuraCoreError::InvalidExternalAccountData),
                (false, _) => (None, None),
            };
        (
            plaintext_sha256,
            confidential_violation_code,
            decrypted_next_spent_today,
        )
    };

    let mut next_guardrail_vector_ciphertext = None;
    {
        let pending = ctx
            .accounts
            .treasury
            .pending_queue
            .get_mut(0)
            .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
        let decrypt_request = pending
            .decryption_request
            .as_mut()
            .ok_or_else(|| error!(crate::AuraCoreError::DecryptionNotReady))?;
        decrypt_request.verified_at = Some(now);
        decrypt_request.plaintext_sha256 = Some(plaintext_sha256);
        pending.last_updated_at = now;

        if let Some(violation_code_value) = confidential_violation_code {
            match violation_code_value {
                0 => {
                    pending.decision.approved = true;
                    pending.decision.violation = violation_code(ViolationCode::None);
                    let expected_next_spent_today = pending
                        .decision
                        .next_state
                        .spent_today_usd
                        .saturating_add(pending.amount_usd);
                    if let Some(decrypted_next_spent_today) = decrypted_next_spent_today {
                        if decrypted_next_spent_today != expected_next_spent_today {
                            return err!(crate::AuraCoreError::InvalidExternalAccountData);
                        }
                        pending.decision.next_state.spent_today_usd = decrypted_next_spent_today;
                    } else {
                        pending.decision.next_state.spent_today_usd = expected_next_spent_today;
                    }
                }
                1 => {
                    pending.decision.approved = false;
                    pending.decision.violation = violation_code(ViolationCode::PerTransactionLimit);
                }
                2 => {
                    pending.decision.approved = false;
                    pending.decision.violation = violation_code(ViolationCode::DailyLimit);
                }
                _ => return err!(crate::AuraCoreError::InvalidExternalAccountData),
            }
            if expected_fhe_type == ENCRYPT_FHE_VECTOR_U64 && violation_code_value == 0 {
                next_guardrail_vector_ciphertext = pending
                    .policy_output_ciphertext_account
                    .as_ref()
                    .map(|ciphertext| {
                        ciphertext
                            .parse()
                            .map_err(|_| error!(crate::AuraCoreError::InvalidExternalAccountData))
                    })
                    .transpose()?;
            }
        }
    }
    ctx.accounts.treasury.updated_at = now;
    if let Some(next_guardrail_vector_ciphertext) = next_guardrail_vector_ciphertext {
        if let Some(guardrails) = ctx.accounts.treasury.confidential_guardrails.as_mut() {
            guardrails.guardrail_vector_ciphertext = Some(next_guardrail_vector_ciphertext);
        }
    }

    Ok(())
}
