use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED, instructions::sync_treasury_account,
    program_accounts::TreasuryAccount, AgentSwarm, AuraCoreError,
};

/// Instruction data for `configure_swarm`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigureSwarmArgs {
    /// Unique identifier for this swarm.
    pub swarm_id: String,
    /// Agent IDs of all members sharing the pool limit.
    pub member_agents: Vec<String>,
    /// Maximum total USD that all swarm members may spend collectively.
    pub shared_pool_limit_usd: u64,
    /// Unix timestamp used for the audit event.
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct ConfigureSwarm<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Account<'info, TreasuryAccount>,
}

/// Attaches or replaces the swarm shared-pool configuration on the treasury.
///
/// Validates that `shared_pool_limit_usd > 0`. Only the treasury owner may
/// call this instruction. Emits a `SwarmAttached` audit event.
pub fn handler(ctx: Context<ConfigureSwarm>, args: ConfigureSwarmArgs) -> Result<()> {
    require!(
        args.shared_pool_limit_usd > 0,
        AuraCoreError::InvalidDeployment
    );

    let mut domain = ctx.accounts.treasury.to_domain()?;
    let swarm = AgentSwarm::new(
        args.swarm_id,
        args.member_agents,
        args.shared_pool_limit_usd,
    );
    domain.attach_swarm(swarm, args.timestamp);

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.timestamp)
}
