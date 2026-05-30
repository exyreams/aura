//! Grant and revoke scoped operator permissions.
//!
//! Operator role accounts allow non-owner keys to perform narrow maintenance
//! tasks such as simulations, liveness refreshes, and scoped pause updates.

use anchor_lang::prelude::*;

use crate::{
    constants::{OPERATOR_ROLE_SEED, TREASURY_SEED},
    program_accounts::{OperatorRoleAccount, TreasuryAccount, OPERATOR_ROLE_SPACE},
};

/// Instruction data for `grant_operator_role`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GrantOperatorRoleArgs {
    /// Bitmask of permissions from `role_permissions`.
    pub permission_mask: u64,
    /// Unix timestamp after which the role is inactive.
    pub expires_at: i64,
    /// Unix timestamp recorded as the grant time.
    pub now: i64,
}

#[derive(Accounts)]
#[instruction(args: GrantOperatorRoleArgs)]
pub struct GrantOperatorRole<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: operator receiving scoped permissions
    pub operator: UncheckedAccount<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = owner,
        space = OPERATOR_ROLE_SPACE,
        seeds = [OPERATOR_ROLE_SEED, treasury.key().as_ref(), operator.key().as_ref()],
        bump
    )]
    pub operator_role: Box<Account<'info, OperatorRoleAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn grant_operator_role(
    ctx: Context<GrantOperatorRole>,
    args: GrantOperatorRoleArgs,
) -> Result<()> {
    require!(
        args.expires_at > args.now,
        crate::AuraCoreError::OperatorRoleExpired
    );
    let role = &mut ctx.accounts.operator_role;
    role.bump = ctx.bumps.operator_role;
    role.treasury = ctx.accounts.treasury.key();
    role.operator = ctx.accounts.operator.key();
    role.permission_mask = args.permission_mask;
    role.expires_at = args.expires_at;
    role.revoked = false;
    role.granted_by = ctx.accounts.owner.key();
    role.granted_at = args.now;
    Ok(())
}

#[derive(Accounts)]
pub struct RevokeOperatorRole<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [OPERATOR_ROLE_SEED, treasury.key().as_ref(), operator_role.operator.as_ref()],
        bump = operator_role.bump,
        constraint = operator_role.treasury == treasury.key() @ crate::AuraCoreError::InvalidExternalAccountData
    )]
    pub operator_role: Box<Account<'info, OperatorRoleAccount>>,
}

pub fn revoke_operator_role(ctx: Context<RevokeOperatorRole>, _now: i64) -> Result<()> {
    ctx.accounts.operator_role.revoked = true;
    Ok(())
}

/// Instruction data for `update_operator_role`.
///
/// Each field is optional; `None` leaves the existing value unchanged
/// (idempotent-update convention). Updating in place replaces the
/// revoke-and-re-grant round trip.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateOperatorRoleArgs {
    /// New permission bitmask from `role_permissions`; `None` leaves it unchanged.
    pub permission_mask: Option<u64>,
    /// New expiry timestamp; `None` leaves it unchanged.
    pub expires_at: Option<i64>,
    /// Unix timestamp used to validate a new expiry.
    pub now: i64,
}

#[derive(Accounts)]
pub struct UpdateOperatorRole<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [OPERATOR_ROLE_SEED, treasury.key().as_ref(), operator_role.operator.as_ref()],
        bump = operator_role.bump,
        constraint = operator_role.treasury == treasury.key() @ crate::AuraCoreError::InvalidExternalAccountData
    )]
    pub operator_role: Box<Account<'info, OperatorRoleAccount>>,
}

/// Updates an existing operator role's permission mask and/or expiry in place.
///
/// Owner-gated. Refuses a revoked role and a non-future expiry. Only fields
/// supplied as `Some` are changed.
pub fn update_operator_role(
    ctx: Context<UpdateOperatorRole>,
    args: UpdateOperatorRoleArgs,
) -> Result<()> {
    let role = &mut ctx.accounts.operator_role;
    require!(!role.revoked, crate::AuraCoreError::OperatorRoleExpired);
    if let Some(permission_mask) = args.permission_mask {
        role.permission_mask = permission_mask;
    }
    if let Some(expires_at) = args.expires_at {
        require!(
            expires_at > args.now,
            crate::AuraCoreError::OperatorRoleExpired
        );
        role.expires_at = expires_at;
    }
    Ok(())
}
