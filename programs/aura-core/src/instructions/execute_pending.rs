use anchor_lang::prelude::*;
use aura_policy::PauseScope;

use crate::{
    constants::TREASURY_SEED,
    execution::{deny_pending_transaction, enforce_pending_approval, expire_pending_transaction},
    ext_cpi::{
        approve_message_via_cpi, build_message_approval_request, parse_runtime_pubkey,
        pending_signature_request_from_live, DWALLET_CPI_AUTHORITY_SEED,
    },
    instructions::{
        external_liveness::{enforce_liveness_gate, LivenessGate},
        sync_treasury_account,
        wallet_transfers::release_transfer_reservation,
    },
    program_accounts::{
        chain_code, proposal_status_code, DWalletAccount, ExternalLivenessAccount,
        PendingSignatureRequestRecord, TreasuryAccount,
    },
    program_events::emit_execution_event,
    state::{ProposalStatus, SignatureScheme},
};

#[derive(Accounts)]
pub struct ExecutePending<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == operator.key() || treasury.ai_authority == operator.key() @ crate::AuraCoreError::UnauthorizedExecutor
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    /// CHECK: MessageApproval PDA on the dWallet program. Required when the pending proposal is approved.
    #[account(mut)]
    pub message_approval: Option<UncheckedAccount<'info>>,
    /// CHECK: dWallet account owned by the dWallet program. Required when the pending proposal is approved.
    pub dwallet: Option<UncheckedAccount<'info>>,
    /// CHECK: This program executable account, passed through to dWallet CPI.
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: CPI authority PDA derived from this program using `__ika_cpi_authority`.
    pub cpi_authority: Option<UncheckedAccount<'info>>,
    /// CHECK: Official dWallet program account.
    pub dwallet_program: Option<UncheckedAccount<'info>>,
    /// CHECK: DWalletCoordinator PDA on the dWallet program. Required for approve_message flows.
    pub dwallet_coordinator: Option<UncheckedAccount<'info>>,
    pub external_liveness: Option<Box<Account<'info, ExternalLivenessAccount>>>,
    #[account(mut)]
    pub dwallet_state: Option<Box<Account<'info, DWalletAccount>>>,
    pub system_program: Program<'info, System>,
}

/// Executes the pending transaction by submitting an `approve_message` CPI
/// to the dWallet program.
///
/// Checks expiry, then either denies the proposal (if the policy decision is
/// not approved) or calls `approve_message_via_cpi` and records the resulting
/// `PendingSignatureRequest`. The dWallet network signs asynchronously;
/// `finalize_execution` must be called once the signature is ready.
///
/// The operator must be the owner or AI authority. All dWallet-related
/// accounts are optional and validated only when the proposal is approved.
pub fn handler(mut ctx: Context<ExecutePending>, now: i64) -> Result<()> {
    let signature = {
        let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
        let pending_before_expiry = domain.active_pending().cloned();
        match expire_pending_transaction(domain.as_mut(), now) {
            Ok(()) => {}
            Err(crate::TreasuryError::PendingTransactionExpired) => {
                if let Some(pending) = pending_before_expiry
                    .filter(|pending| pending.transfer.requires_wallet_settlement())
                {
                    let dwallet_state = ctx
                        .accounts
                        .dwallet_state
                        .as_mut()
                        .ok_or_else(|| error!(crate::AuraCoreError::DWalletNotConfigured))?;
                    release_transfer_reservation(
                        dwallet_state,
                        ctx.accounts.treasury.key(),
                        chain_code(pending.target_chain),
                        pending.amount_usd,
                        &pending.transfer,
                    )?;
                }
                sync_treasury_account(&mut ctx.accounts.treasury, domain.as_ref(), now)?;
                return Ok(());
            }
            Err(error) => return Err(crate::map_treasury_error(error)),
        }
        let pending = domain
            .pending
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
        if pending.policy_output_ciphertext_account.is_some() {
            let decrypt_ready = pending
                .decryption_request
                .as_ref()
                .and_then(|request| request.plaintext_sha256.as_ref())
                .is_some();
            if !decrypt_ready {
                return err!(crate::AuraCoreError::PolicyOutputNotReady);
            }
        }

        let approved = domain
            .pending
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?
            .decision
            .approved;

        if !approved {
            let receipt = deny_pending_transaction(domain.as_mut(), now)
                .map_err(crate::map_treasury_error)?;
            sync_treasury_account(&mut ctx.accounts.treasury, domain.as_ref(), now)?;
            emit_execution_event(ctx.accounts.treasury.key(), &receipt);
            return Ok(());
        }
        require!(
            !domain
                .policy_config
                .scoped_pause
                .dependency_paused(PauseScope::DWalletFinalization, now),
            crate::AuraCoreError::ExecutionScopePaused
        );
        if domain
            .policy_config
            .liveness_config
            .require_dwallet_freshness
        {
            enforce_liveness_gate(
                ctx.accounts.treasury.key(),
                &ctx.accounts.treasury.policy_config,
                &ctx.accounts.treasury.policy_state,
                ctx.accounts
                    .external_liveness
                    .as_deref()
                    .map(|value| &**value),
                LivenessGate::DWallet,
                domain
                    .pending
                    .as_ref()
                    .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?
                    .amount_usd,
                now,
            )?;
        }
        enforce_pending_approval(
            domain
                .pending
                .as_ref()
                .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?,
            now,
        )
        .map_err(crate::map_treasury_error)?;

        prepare_live_signature(&mut ctx, domain.as_mut(), now)?
    };

    let message_approval = ctx
        .accounts
        .message_approval
        .as_ref()
        .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?;
    let dwallet = ctx
        .accounts
        .dwallet
        .as_ref()
        .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?;
    let cpi_authority = ctx
        .accounts
        .cpi_authority
        .as_ref()
        .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?;
    let dwallet_program = ctx
        .accounts
        .dwallet_program
        .as_ref()
        .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?;
    let dwallet_coordinator = ctx
        .accounts
        .dwallet_coordinator
        .as_ref()
        .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?;

    approve_message_via_cpi(
        &dwallet_program.to_account_info(),
        &dwallet_coordinator.to_account_info(),
        &message_approval.to_account_info(),
        &dwallet.to_account_info(),
        &ctx.accounts.caller_program.to_account_info(),
        &cpi_authority.to_account_info(),
        &ctx.accounts.operator.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        signature.cpi_authority_bump,
        signature.message_digest,
        signature.message_metadata_digest,
        signature.authorized_user,
        signature.signature_scheme,
        signature.message_approval_bump,
    )?;

    Ok(())
}

#[inline(never)]
fn prepare_live_signature(
    ctx: &mut Context<ExecutePending>,
    domain: &mut crate::AgentTreasury,
    now: i64,
) -> Result<PreparedLiveSignature> {
    let pending = domain
        .pending
        .clone()
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    if pending.signature_request.is_some() {
        return err!(crate::AuraCoreError::MessageApprovalNotReady);
    }

    let Some(message_approval) = &ctx.accounts.message_approval else {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    };
    let Some(dwallet) = &ctx.accounts.dwallet else {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    };
    let Some(cpi_authority) = &ctx.accounts.cpi_authority else {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    };
    let Some(dwallet_program) = &ctx.accounts.dwallet_program else {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    };

    let expected_dwallet_program: Pubkey = domain
        .deployment
        .dwallet_program_id
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidDeployment))?;
    if dwallet_program.key() != expected_dwallet_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    if ctx.accounts.caller_program.key() != crate::ID || !ctx.accounts.caller_program.executable {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let (expected_cpi_authority, cpi_authority_bump) =
        Pubkey::find_program_address(&[DWALLET_CPI_AUTHORITY_SEED], &crate::ID);
    if cpi_authority.key() != expected_cpi_authority {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let dwallet_ref = domain
        .dwallets
        .get(&pending.target_chain)
        .cloned()
        .ok_or_else(|| error!(crate::AuraCoreError::DWalletNotConfigured))?;
    let expected_dwallet_account = parse_runtime_pubkey(
        dwallet_ref.dwallet_account.as_deref(),
        "dwallet runtime account must be configured",
    )
    .map_err(crate::map_treasury_error)?;
    if dwallet.key() != expected_dwallet_account {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let authorized_user = parse_runtime_pubkey(
        dwallet_ref.authorized_user_pubkey.as_deref(),
        "authorized user pubkey must be configured",
    )
    .map_err(crate::map_treasury_error)?;

    let approval_request =
        build_message_approval_request(&pending, &dwallet_ref, &expected_dwallet_program)
            .map_err(crate::map_treasury_error)?;
    if message_approval.key() != approval_request.message_approval_account {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    let Some(dwallet_coordinator) = &ctx.accounts.dwallet_coordinator else {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    };
    if dwallet_coordinator.key() != approval_request.coordinator_account {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let signature_request =
        pending_signature_request_from_live(&approval_request, &expected_dwallet_account, now);
    let pending_record = ctx
        .accounts
        .treasury
        .pending_queue
        .get_mut(0)
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    pending_record.status = proposal_status_code(ProposalStatus::SignaturePending);
    pending_record.last_updated_at = now;
    pending_record.signature_request = Some(PendingSignatureRequestRecord::from_domain(
        &signature_request,
    ));
    ctx.accounts.treasury.updated_at = now;

    Ok(PreparedLiveSignature {
        cpi_authority_bump,
        message_digest: approval_request.message_digest,
        message_metadata_digest: approval_request.message_metadata_digest,
        authorized_user: authorized_user.to_bytes(),
        signature_scheme: approval_request.signature_scheme,
        message_approval_bump: approval_request.message_approval_bump,
    })
}

struct PreparedLiveSignature {
    cpi_authority_bump: u8,
    message_digest: [u8; 32],
    message_metadata_digest: [u8; 32],
    authorized_user: [u8; 32],
    signature_scheme: SignatureScheme,
    message_approval_bump: u8,
}
