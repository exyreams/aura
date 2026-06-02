//! Agent identity instructions.
//!
//! All agent and ownership state lives in `TrustIdentityAccount`.

use anchor_lang::prelude::*;

use crate::{
    audit::AuditKind,
    constants::{TREASURY_SEED, TRUST_IDENTITY_SEED},
    ext_cpi::{transfer_dwallet_via_cpi, DWALLET_CPI_AUTHORITY_SEED},
    instructions::sync_treasury_account,
    program_accounts::{
        chain_from_code, AgentAuthorityRecord, AgentScopeRecord, PendingOwnershipHandoverRecord,
        TreasuryAccount, TrustIdentityAccount,
    },
    state::PendingOwnershipHandover,
    AuraCoreError,
};

// ── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct AgentManage<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [TRUST_IDENTITY_SEED, treasury.key().as_ref()],
        bump = trust_identity.bump,
        constraint = trust_identity.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub trust_identity: Box<Account<'info, TrustIdentityAccount>>,
}

#[derive(Accounts)]
pub struct EmergencyRevokeAgent<'info> {
    pub caller: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = {
            let s = caller.key().to_string();
            treasury.owner == caller.key()
                || treasury.multisig.as_ref()
                    .map(|m| m.guardians.iter().any(|g| g.to_string() == s))
                    .unwrap_or(false)
        } @ AuraCoreError::UnauthorizedGuardian
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [TRUST_IDENTITY_SEED, treasury.key().as_ref()],
        bump = trust_identity.bump,
        constraint = trust_identity.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub trust_identity: Box<Account<'info, TrustIdentityAccount>>,
}

#[derive(Accounts)]
pub struct OwnershipHandover<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = {
            let s = caller.key().to_string();
            treasury.owner == caller.key()
                || treasury.multisig.as_ref()
                    .map(|m| m.guardians.iter().any(|g| g.to_string() == s))
                    .unwrap_or(false)
        } @ AuraCoreError::UnauthorizedHandover
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [TRUST_IDENTITY_SEED, treasury.key().as_ref()],
        bump = trust_identity.bump,
        constraint = trust_identity.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub trust_identity: Box<Account<'info, TrustIdentityAccount>>,
}

#[derive(Accounts)]
pub struct ExecuteOwnershipHandover<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = {
            let s = caller.key().to_string();
            treasury.owner == caller.key()
                || treasury.multisig.as_ref()
                    .map(|m| m.guardians.iter().any(|g| g.to_string() == s))
                    .unwrap_or(false)
        } @ AuraCoreError::UnauthorizedHandover
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [TRUST_IDENTITY_SEED, treasury.key().as_ref()],
        bump = trust_identity.bump,
        constraint = trust_identity.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub trust_identity: Box<Account<'info, TrustIdentityAccount>>,
    /// CHECK: dWallet account to transfer.
    #[account(mut)]
    pub dwallet: UncheckedAccount<'info>,
    /// CHECK: Aura caller-program account (this program).
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: CPI authority PDA of this program.
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: dWallet program.
    pub dwallet_program: UncheckedAccount<'info>,
}

// ── Args ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterAgentArgs {
    pub key: Pubkey,
    pub label: String,
    pub allowed_chains: Vec<u8>,
    pub allowed_tx_types: Vec<u8>,
    pub daily_limit_usd: Option<u64>,
    pub now: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct NominateSuccessorArgs {
    pub new_owner: Pubkey,
    pub now: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ExecuteHandoverArgs {
    pub chain: u8,
    pub finalize: bool,
    pub now: i64,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

pub fn register_agent(ctx: Context<AgentManage>, args: RegisterAgentArgs) -> Result<()> {
    require!(
        !args.label.is_empty() && args.label.len() <= 32,
        AuraCoreError::InvalidExternalAccountData
    );
    let ti = &mut ctx.accounts.trust_identity;
    require!(
        ti.agents.len() < crate::constants::MAX_AGENTS,
        AuraCoreError::TooManyAgents
    );
    let key_str = args.key.to_string();
    require!(
        !ti.agents.iter().any(|a| a.key.to_string() == key_str),
        AuraCoreError::AgentAlreadyRegistered
    );
    ti.agents.push(AgentAuthorityRecord {
        key: args.key,
        label: args.label.clone(),
        scope: AgentScopeRecord {
            allowed_chains: args.allowed_chains,
            allowed_tx_types: args.allowed_tx_types,
            daily_limit_usd: args.daily_limit_usd,
        },
        enabled: true,
        registered_at: args.now,
    });
    Ok(())
}

pub fn revoke_agent(ctx: Context<AgentManage>, key: Pubkey, _now: i64) -> Result<()> {
    let ti = &mut ctx.accounts.trust_identity;
    let key_str = key.to_string();
    let agent = ti
        .agents
        .iter_mut()
        .find(|a| a.key.to_string() == key_str)
        .ok_or_else(|| error!(AuraCoreError::AgentNotFound))?;
    agent.enabled = false;
    Ok(())
}

pub fn emergency_revoke_agent(
    ctx: Context<EmergencyRevokeAgent>,
    key: Pubkey,
    _now: i64,
) -> Result<()> {
    let ti = &mut ctx.accounts.trust_identity;
    let key_str = key.to_string();
    let agent = ti
        .agents
        .iter_mut()
        .find(|a| a.key.to_string() == key_str)
        .ok_or_else(|| error!(AuraCoreError::AgentNotFound))?;
    agent.enabled = false;
    Ok(())
}

pub fn nominate_successor_owner(
    ctx: Context<OwnershipHandover>,
    args: NominateSuccessorArgs,
) -> Result<()> {
    let ti = &mut ctx.accounts.trust_identity;
    let successor = args.new_owner.to_string();
    let handover = PendingOwnershipHandover::new(
        successor.clone(),
        args.now,
        ctx.accounts.caller.key().to_string(),
    );
    ti.pending_ownership_handover = Some(PendingOwnershipHandoverRecord::from_domain(&handover)?);
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.audit_trail.record(
        AuditKind::OwnershipHandoverNominated,
        format!("successor nominated: {successor}"),
        args.now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

pub fn execute_ownership_handover(
    ctx: Context<ExecuteOwnershipHandover>,
    args: ExecuteHandoverArgs,
) -> Result<()> {
    let chain = chain_from_code(args.chain)?;
    let ti = &mut ctx.accounts.trust_identity;
    let handover = ti
        .pending_ownership_handover
        .as_ref()
        .ok_or_else(|| error!(AuraCoreError::SuccessorNotNominated))?;
    require!(
        args.now >= handover.executable_after,
        AuraCoreError::OwnershipHandoverTimelockActive
    );

    let successor_key: Pubkey = handover
        .successor_owner
        .to_string()
        .parse()
        .map_err(|_| error!(AuraCoreError::InvalidExternalAccountData))?;
    let (successor_cpi_authority, _) = Pubkey::find_program_address(
        &[DWALLET_CPI_AUTHORITY_SEED, successor_key.as_ref()],
        &crate::ID,
    );

    let (cpi_authority_pda, cpi_bump) =
        Pubkey::find_program_address(&[DWALLET_CPI_AUTHORITY_SEED], &crate::ID);
    require!(
        ctx.accounts.cpi_authority.key() == cpi_authority_pda,
        AuraCoreError::InvalidExternalAccountData
    );

    transfer_dwallet_via_cpi(
        &ctx.accounts.dwallet_program,
        &ctx.accounts.dwallet,
        &ctx.accounts.caller_program,
        &ctx.accounts.cpi_authority,
        cpi_bump,
        &successor_cpi_authority,
    )?;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.audit_trail.record(
        AuditKind::OwnershipHandoverExecuted,
        format!("dWallet on {chain} transferred to {successor_cpi_authority}"),
        args.now,
    );
    if args.finalize {
        ti.pending_ownership_handover = None;
        domain.execution_paused = true;
        domain.agent_state = crate::state::AgentLifecycleState::Decommissioning;
        domain.audit_trail.record(
            AuditKind::AgentStateTransitioned,
            "treasury decommissioned after ownership handover".to_string(),
            args.now,
        );
    }
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

#[cfg(test)]
mod tests {
    use crate::{
        constants::OWNERSHIP_HANDOVER_TIMELOCK_SECS,
        program_accounts::{
            AgentAuthorityRecord, AgentScopeRecord, TrustConfigRecord, TrustIdentityAccount,
        },
        state::trust::{TrustConfig, TrustTier},
        state::PendingOwnershipHandover,
    };
    use anchor_lang::prelude::Pubkey;

    fn make_ti() -> TrustIdentityAccount {
        TrustIdentityAccount {
            bump: 0,
            treasury: Pubkey::default(),
            trust_tier: TrustTier::Trusted as u8,
            threat_score: 0,
            tier_entered_at: 0,
            last_clean_activity_at: 0,
            trust_config: TrustConfigRecord::from_domain(&TrustConfig::default()),
            agents: Vec::new(),
            pending_ownership_handover: None,
        }
    }

    fn agent(key: Pubkey, chains: Vec<u8>, tx_types: Vec<u8>) -> AgentAuthorityRecord {
        AgentAuthorityRecord {
            key,
            label: "test".to_string(),
            scope: AgentScopeRecord {
                allowed_chains: chains,
                allowed_tx_types: tx_types,
                daily_limit_usd: None,
            },
            enabled: true,
            registered_at: 0,
        }
    }

    const ETH: u8 = 1;
    const TRANSFER: u8 = 0;
    const AI_AUTH: &str = "22222222222222222222222222222222";

    #[test]
    fn back_compat_empty_agents() {
        let ti = make_ti();
        assert!(ti.is_authorized_agent(AI_AUTH, AI_AUTH, ETH, TRANSFER));
        assert!(!ti.is_authorized_agent(
            "33333333333333333333333333333333",
            AI_AUTH,
            ETH,
            TRANSFER
        ));
    }

    #[test]
    fn scoped_agent_allowed_chain() {
        let agent_key = Pubkey::new_unique();
        let mut ti = make_ti();
        ti.agents.push(agent(agent_key, vec![ETH], vec![]));
        assert!(ti.is_authorized_agent(&agent_key.to_string(), AI_AUTH, ETH, TRANSFER));
        assert!(!ti.is_authorized_agent(&agent_key.to_string(), AI_AUTH, 2, TRANSFER));
    }

    #[test]
    fn disabled_agent_rejected() {
        let agent_key = Pubkey::new_unique();
        let mut ti = make_ti();
        let mut a = agent(agent_key, vec![], vec![]);
        a.enabled = false;
        ti.agents.push(a);
        assert!(!ti.is_authorized_agent(&agent_key.to_string(), AI_AUTH, ETH, TRANSFER));
    }

    #[test]
    fn primary_ai_authority_always_passes() {
        let agent_key = Pubkey::new_unique();
        let mut ti = make_ti();
        ti.agents.push(agent(agent_key, vec![ETH], vec![]));
        assert!(ti.is_authorized_agent(AI_AUTH, AI_AUTH, 2, TRANSFER));
    }

    #[test]
    fn too_many_agents_rejects_at_8() {
        let mut ti = make_ti();
        for _ in 0..8 {
            ti.agents.push(agent(Pubkey::new_unique(), vec![], vec![]));
        }
        assert_eq!(ti.agents.len(), 8);
    }

    #[test]
    fn handover_timelock_set_correctly() {
        let handover = PendingOwnershipHandover::new(
            "55555555555555555555555555555555".to_string(),
            1_000,
            "11111111111111111111111111111111".to_string(),
        );
        assert_eq!(
            handover.executable_after,
            1_000 + OWNERSHIP_HANDOVER_TIMELOCK_SECS
        );
    }
}
