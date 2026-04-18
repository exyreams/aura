use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    cpi::{
        approve_message_via_cpi, build_message_approval_request, parse_runtime_pubkey,
        pending_signature_request_from_live, DWALLET_CPI_AUTHORITY_SEED,
    },
    execution::{deny_pending_transaction, expire_pending_transaction, mark_signature_requested},
    instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
    program_events::emit_execution_event,
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
    pub treasury: Account<'info, TreasuryAccount>,
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
    /// CHECK: DWalletCoordinator PDA on the dWallet program. Required for metadata-v2 approve_message flows.
    pub dwallet_coordinator: Option<UncheckedAccount<'info>>,
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
pub fn handler(ctx: Context<ExecutePending>, now: i64) -> Result<()> {
    let mut domain = Box::new(ctx.accounts.treasury.to_domain()?);
    expire_pending_transaction(domain.as_mut(), now).map_err(crate::map_treasury_error)?;
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
        let receipt =
            deny_pending_transaction(domain.as_mut(), now).map_err(crate::map_treasury_error)?;
        sync_treasury_account(&mut ctx.accounts.treasury, domain.as_ref(), now)?;
        emit_execution_event(ctx.accounts.treasury.key(), &receipt);
        return Ok(());
    }

    request_live_signature(&ctx, domain.as_mut(), now)?;
    sync_treasury_account(&mut ctx.accounts.treasury, domain.as_ref(), now)
}

#[inline(never)]
fn request_live_signature(
    ctx: &Context<ExecutePending>,
    domain: &mut crate::AgentTreasury,
    now: i64,
) -> Result<()> {
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

    let approval_request = build_message_approval_request(
        &pending,
        &dwallet_ref,
        &expected_dwallet_program,
        domain.deployment.dwallet_message_approval_layout,
    )
    .map_err(crate::map_treasury_error)?;
    if message_approval.key() != approval_request.message_approval_account {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if let Some(expected_coordinator) = approval_request.coordinator_account {
        let Some(dwallet_coordinator) = &ctx.accounts.dwallet_coordinator else {
            return err!(crate::AuraCoreError::InvalidExternalAccountData);
        };
        if dwallet_coordinator.key() != expected_coordinator {
            return err!(crate::AuraCoreError::InvalidExternalAccountData);
        }
    }

    let dwallet_coordinator_info = ctx
        .accounts
        .dwallet_coordinator
        .as_ref()
        .map(|account| account.to_account_info());
    approve_message_via_cpi(
        domain.deployment.dwallet_message_approval_layout,
        &dwallet_program.to_account_info(),
        dwallet_coordinator_info.as_ref(),
        &message_approval.to_account_info(),
        &dwallet.to_account_info(),
        &ctx.accounts.caller_program.to_account_info(),
        &cpi_authority.to_account_info(),
        &ctx.accounts.operator.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        cpi_authority_bump,
        approval_request.message_digest,
        approval_request.message_metadata_digest,
        authorized_user.to_bytes(),
        approval_request.signature_scheme,
        approval_request.message_approval_bump,
    )?;

    let signature_request =
        pending_signature_request_from_live(&approval_request, &expected_dwallet_account, now);
    mark_signature_requested(domain, signature_request, now).map_err(crate::map_treasury_error)?;
    Ok(())
}
