use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    execution::{build_chain_message, expire_pending_transaction, finalize_signed_pending},
    ext_cpi::{
        parse_message_approval_account, parse_runtime_pubkey, verify_message_approval,
        DWALLET_CPI_AUTHORITY_SEED,
    },
    instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
    program_events::emit_execution_event,
};

#[derive(Accounts)]
pub struct FinalizeExecution<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == operator.key() || treasury.ai_authority == operator.key() @ crate::AuraCoreError::UnauthorizedExecutor
    )]
    pub treasury: Account<'info, TreasuryAccount>,
    /// CHECK: Signed MessageApproval account owned by the dWallet program.
    pub message_approval: UncheckedAccount<'info>,
}

/// Finalizes an approved pending transaction by verifying the dWallet signature
/// and producing an execution receipt.
///
/// Checks expiry, parses the `MessageApproval` account, verifies the signature
/// against the stored `PendingSignatureRequest`, then calls
/// `finalize_signed_pending` to advance the policy state and clear the pending
/// slot. Emits `SignatureCommitted` and `ProposalExecuted` audit events, plus
/// an `ExecutionReceipt` program event.
///
/// The operator must be the owner or AI authority.
pub fn handler(ctx: Context<FinalizeExecution>, now: i64) -> Result<()> {
    let mut domain = Box::new(ctx.accounts.treasury.to_domain()?);
    expire_pending_transaction(domain.as_mut(), now).map_err(crate::map_treasury_error)?;
    let receipt = finalize_live_signature(&ctx, domain.as_mut(), now)?;
    sync_treasury_account(&mut ctx.accounts.treasury, domain.as_ref(), now)?;
    emit_execution_event(ctx.accounts.treasury.key(), &receipt);
    Ok(())
}

#[inline(never)]
fn finalize_live_signature(
    ctx: &Context<FinalizeExecution>,
    domain: &mut crate::AgentTreasury,
    now: i64,
) -> Result<crate::ExecutionReceipt> {
    let pending = domain
        .pending
        .clone()
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    let signature_request = pending
        .signature_request
        .clone()
        .ok_or_else(|| error!(crate::AuraCoreError::MessageApprovalNotReady))?;

    if signature_request.message_approval_account != ctx.accounts.message_approval.key().to_string()
    {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let expected_dwallet_program: Pubkey = domain
        .deployment
        .dwallet_program_id
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidDeployment))?;
    if *ctx.accounts.message_approval.owner != expected_dwallet_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let dwallet_ref = domain
        .dwallets
        .get(&pending.target_chain)
        .cloned()
        .ok_or_else(|| error!(crate::AuraCoreError::DWalletNotConfigured))?;
    let expected_user_pubkey = parse_runtime_pubkey(
        dwallet_ref.authorized_user_pubkey.as_deref(),
        "authorized user pubkey must be configured",
    )
    .map_err(crate::map_treasury_error)?;
    let message_approval_data = ctx.accounts.message_approval.try_borrow_data()?;
    let parsed = parse_message_approval_account(&message_approval_data)
        .map_err(crate::map_treasury_error)?;
    let (expected_cpi_authority, _) =
        Pubkey::find_program_address(&[DWALLET_CPI_AUTHORITY_SEED], &crate::ID);
    verify_message_approval(
        &ctx.accounts.message_approval.key(),
        &parsed,
        &signature_request,
        &expected_cpi_authority,
        &expected_user_pubkey,
    )
    .map_err(crate::map_treasury_error)?;
    let signed_message = build_chain_message(&pending, &dwallet_ref);
    let signature_hex = hex::encode(&parsed.signature);

    finalize_signed_pending(domain, signed_message, signature_hex, now)
        .map_err(crate::map_treasury_error)
}
