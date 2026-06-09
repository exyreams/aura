use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIDENTIAL_GUARDRAILS_SEED, TREASURY_SEED},
    ext_cpi::{
        decode_digest_hex, decrypt_confidential_policy_output, is_supported_policy_scalar_fhe_type,
        parse_decryption_request_account, verify_decryption_request_digest, DecryptionStatus,
        ENCRYPT_FHE_UINT64,
    },
    program_accounts::{violation_code, ConfidentialGuardrailsAccount, TreasuryAccount},
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
    /// Optional confidential guardrails sidecar used to verify request-time epoch.
    #[account(
        seeds = [CONFIDENTIAL_GUARDRAILS_SEED, treasury.key().as_ref()],
        bump = confidential_guardrails.bump,
        constraint = confidential_guardrails.treasury == treasury.key() @ crate::AuraCoreError::InvalidExternalAccountData
    )]
    pub confidential_guardrails: Option<Box<Account<'info, ConfidentialGuardrailsAccount>>>,
}

/// Verifies a completed Encrypt decryption request and applies the confidential
/// policy result to the pending transaction.
///
/// Checks expiry, validates the request account ownership and digest, reads
/// the decrypted violation code, then calls `confirm_pending_decryption` and
/// `apply_confidential_policy_result`. The operator must be the owner or AI
/// authority. Normal execution reveals only the small decision code; guardrail
/// ciphertexts remain encrypted.
pub fn handler(
    ctx: Context<ConfirmPolicyDecryption>,
    now: i64,
    current_epoch_id: u64,
) -> Result<()> {
    confirm_live_decryption(ctx, now, current_epoch_id)
}

#[inline(never)]
fn confirm_live_decryption(
    ctx: Context<ConfirmPolicyDecryption>,
    now: i64,
    current_epoch_id: u64,
) -> Result<()> {
    let request_key = ctx.accounts.request_account.key();
    let (
        expected_request_account,
        expected_ciphertext_account,
        expected_digest_hex,
        expected_fhe_type,
        has_policy_output,
        expected_guardrail_epoch_id,
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
            decrypt_request.guardrail_epoch_id,
        )
    };

    if let Some(expected_guardrail_epoch_id) = expected_guardrail_epoch_id {
        let guardrails = ctx
            .accounts
            .confidential_guardrails
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?;
        guardrails.assert_usable(current_epoch_id)?;
        require!(
            expected_guardrail_epoch_id == current_epoch_id,
            crate::AuraCoreError::GuardrailEpochMismatch
        );
    }

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
        let policy_output = match (has_policy_output, parsed.fhe_type) {
            (true, fhe_type) if is_supported_policy_scalar_fhe_type(fhe_type) => Some(
                decrypt_confidential_policy_output(&parsed).map_err(crate::map_treasury_error)?,
            ),
            (true, _) => return err!(crate::AuraCoreError::InvalidExternalAccountData),
            (false, _) => None,
        };
        (
            plaintext_sha256,
            policy_output.map(|output| output.violation_code),
            policy_output.and_then(|output| output.next_spent_today),
        )
    };

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
                5 => {
                    pending.decision.approved = false;
                    pending.decision.violation = violation_code(ViolationCode::WeeklyLimit);
                }
                _ => return err!(crate::AuraCoreError::InvalidExternalAccountData),
            }
        }
    }
    ctx.accounts.treasury.updated_at = now;

    Ok(())
}
