use anchor_lang::prelude::*;

use crate::{
    constants::CHAIN_PROFILE_SEED,
    program_accounts::{
        fixed_asset_symbol, validate_chain_profile_fields, ChainProfileAccount, CHAIN_PROFILE_SPACE,
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ChainProfileArgs {
    pub chain_code: u8,
    pub enabled: bool,
    pub address_format: u8,
    pub replay_scheme: u8,
    pub finality_model: u8,
    pub curve: u8,
    pub signature_scheme: u8,
    pub native_gas_asset: String,
    pub evm_chain_id: Option<u64>,
    pub confirmations_required: u16,
    pub now: i64,
}

#[derive(Accounts)]
#[instruction(args: ChainProfileArgs)]
pub struct RegisterChainProfile<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = CHAIN_PROFILE_SPACE,
        seeds = [CHAIN_PROFILE_SEED, &[args.chain_code]],
        bump
    )]
    pub chain_profile: Box<Account<'info, ChainProfileAccount>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateChainProfile<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CHAIN_PROFILE_SEED, &[chain_profile.chain_code]],
        bump = chain_profile.bump,
        constraint = chain_profile.authority == authority.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub chain_profile: Box<Account<'info, ChainProfileAccount>>,
}

pub fn register_chain_profile(
    ctx: Context<RegisterChainProfile>,
    args: ChainProfileArgs,
) -> Result<()> {
    validate_chain_profile_args(&args)?;
    write_profile(
        &mut ctx.accounts.chain_profile,
        ctx.bumps.chain_profile,
        ctx.accounts.authority.key(),
        args,
        true,
    )
}

pub fn update_chain_profile(
    ctx: Context<UpdateChainProfile>,
    args: ChainProfileArgs,
) -> Result<()> {
    require!(
        args.chain_code == ctx.accounts.chain_profile.chain_code,
        crate::AuraCoreError::InvalidChain
    );
    validate_chain_profile_args(&args)?;
    let bump = ctx.accounts.chain_profile.bump;
    let authority = ctx.accounts.chain_profile.authority;
    write_profile(
        &mut ctx.accounts.chain_profile,
        bump,
        authority,
        args,
        false,
    )
}

fn validate_chain_profile_args(args: &ChainProfileArgs) -> Result<()> {
    require!(
        args.chain_code < u8::MAX,
        crate::AuraCoreError::InvalidChain
    );
    validate_chain_profile_fields(
        args.address_format,
        args.replay_scheme,
        args.finality_model,
        args.curve,
        args.signature_scheme,
        args.evm_chain_id,
        args.confirmations_required,
    )?;
    fixed_asset_symbol(&args.native_gas_asset)?;
    Ok(())
}

fn write_profile(
    profile: &mut ChainProfileAccount,
    bump: u8,
    authority: Pubkey,
    args: ChainProfileArgs,
    is_new: bool,
) -> Result<()> {
    profile.bump = bump;
    profile.authority = authority;
    profile.chain_code = args.chain_code;
    profile.enabled = args.enabled;
    profile.address_format = args.address_format;
    profile.replay_scheme = args.replay_scheme;
    profile.finality_model = args.finality_model;
    profile.curve = args.curve;
    profile.signature_scheme = args.signature_scheme;
    profile.native_gas_asset = fixed_asset_symbol(&args.native_gas_asset)?;
    profile.evm_chain_id = args.evm_chain_id;
    profile.confirmations_required = args.confirmations_required;
    if is_new {
        profile.registered_at = args.now;
    }
    profile.updated_at = args.now;
    Ok(())
}
