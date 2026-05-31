use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    instructions::{sync_treasury_account, wallet_transfers::release_transfer_reservation},
    program_accounts::{chain_code, DWalletAccount, TreasuryAccount},
};

#[derive(Accounts)]
pub struct CancelPending<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(mut)]
    pub dwallet_state: Option<Box<Account<'info, DWalletAccount>>>,
}

/// Cancels the pending transaction on the treasury.
///
/// Only the treasury owner may cancel. Emits a `ProposalCancelled` audit event.
pub fn handler(ctx: Context<CancelPending>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let pending = domain.active_pending().cloned();
    let cancelled = domain
        .cancel_pending(&ctx.accounts.owner.key().to_string(), now)
        .map_err(crate::map_treasury_error)?;

    if cancelled {
        if let Some(pending) =
            pending.filter(|pending| pending.transfer.requires_wallet_settlement())
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
    }

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
