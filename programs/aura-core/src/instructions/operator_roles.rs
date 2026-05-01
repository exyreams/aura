use anchor_lang::prelude::*;

use crate::{
    constants::{OPERATOR_ROLE_SEED, TREASURY_SEED},
    program_accounts::{OperatorRoleAccount, TreasuryAccount, OPERATOR_ROLE_SPACE},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GrantOperatorRoleArgs {
    pub permission_mask: u64,
    pub expires_at: i64,
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
