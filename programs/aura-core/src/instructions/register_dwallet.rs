use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    instructions::sync_treasury_account,
    program_accounts::{chain_from_code, TreasuryAccount},
};

/// Instruction data for `register_dwallet`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterDwalletArgs {
    /// Numeric chain code identifying which chain this dWallet covers.
    pub chain: u8,
    /// Unique identifier for this dWallet within the Ika network.
    pub dwallet_id: String,
    /// Native address of the dWallet on the target chain (e.g. `0x…` for EVM).
    pub address: String,
    /// Current balance of the dWallet in USD, used for policy context.
    pub balance_usd: u64,
    /// On-chain Solana account address of the dWallet PDA (required for live signing).
    pub dwallet_account: Option<Pubkey>,
    /// Authorized user public key registered on the dWallet (required for live signing).
    pub authorized_user_pubkey: Option<Pubkey>,
    /// Hex-encoded metadata digest for MetadataV2 PDA derivation.
    pub message_metadata_digest: Option<String>,
    /// Hex-encoded raw public key bytes for MetadataV2 PDA derivation.
    pub public_key_hex: Option<String>,
    /// Unix timestamp used for the audit event.
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct RegisterDwallet<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Account<'info, TreasuryAccount>,
}

/// Registers a dWallet for a specific chain on the treasury, or updates its
/// runtime metadata if it is already registered.
///
/// If any of `dwallet_account`, `authorized_user_pubkey`, or
/// `message_metadata_digest` are provided, `configure_dwallet_runtime` is
/// also called to set the live-signing fields. Only the treasury owner may
/// call this instruction. Emits a `DWalletRegistered` audit event.
pub fn handler(ctx: Context<RegisterDwallet>, args: RegisterDwalletArgs) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain()?;
    let chain = chain_from_code(args.chain)?;
    domain
        .register_dwallet(
            chain,
            args.dwallet_id,
            args.address,
            args.balance_usd,
            args.timestamp,
        )
        .map_err(crate::map_treasury_error)?;

    if args.dwallet_account.is_some()
        || args.authorized_user_pubkey.is_some()
        || args.message_metadata_digest.is_some()
    {
        domain
            .configure_dwallet_runtime(
                chain,
                args.dwallet_account.map(|key| key.to_string()),
                args.authorized_user_pubkey.map(|key| key.to_string()),
                args.message_metadata_digest,
                args.public_key_hex,
                args.timestamp,
            )
            .map_err(crate::map_treasury_error)?;
    }

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.timestamp)
}
