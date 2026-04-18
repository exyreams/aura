use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED,
    instructions::sync_treasury_account,
    program_accounts::{
        PolicyConfigRecord, ProtocolFeesRecord, TreasuryAccount, TREASURY_ACCOUNT_SPACE,
    },
    state::ProtocolDeployment,
    AgentTreasury,
};

/// Instruction data for `create_treasury`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTreasuryArgs {
    /// Unique identifier for this agent, used as part of the treasury PDA seed.
    pub agent_id: String,
    /// Public key of the AI agent that may submit proposals.
    pub ai_authority: Pubkey,
    /// Unix timestamp of treasury creation, used for the audit event.
    pub created_at: i64,
    /// How long (in seconds) a pending transaction remains valid before expiring.
    pub pending_transaction_ttl_secs: i64,
    /// Initial policy configuration (limits, velocity, reputation settings).
    pub policy_config: PolicyConfigRecord,
    /// Protocol fee schedule applied to executed transactions.
    pub protocol_fees: ProtocolFeesRecord,
}

#[derive(Accounts)]
#[instruction(args: CreateTreasuryArgs)]
pub struct CreateTreasury<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = TREASURY_ACCOUNT_SPACE,
        seeds = [TREASURY_SEED, owner.key().as_ref(), args.agent_id.as_bytes()],
        bump
    )]
    pub treasury: Account<'info, TreasuryAccount>,
    pub system_program: Program<'info, System>,
}

/// Initializes a new treasury PDA for the calling owner.
///
/// Allocates the `TreasuryAccount`, sets the devnet pre-alpha deployment
/// configuration, and records a `TreasuryCreated` audit event.
pub fn handler(ctx: Context<CreateTreasury>, args: CreateTreasuryArgs) -> Result<()> {
    let deployment = ProtocolDeployment::devnet_pre_alpha(crate::ID.to_string())
        .map_err(crate::map_treasury_error)?;
    let mut domain = AgentTreasury::new(
        args.agent_id,
        ctx.accounts.owner.key().to_string(),
        args.ai_authority.to_string(),
        args.created_at,
        args.policy_config.to_domain(),
        deployment,
    );
    domain.pending_transaction_ttl_secs = args.pending_transaction_ttl_secs;
    domain.protocol_fees = args.protocol_fees.to_domain();

    ctx.accounts.treasury.bump = ctx.bumps.treasury;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.created_at)
}
