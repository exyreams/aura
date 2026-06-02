//! Agent capability manifest & tripwire configuration.
//!
//! The capability manifest is the agent's on-chain contract: a bounded,
//! declarative statement of everything it may do, checked on every action by
//! the gate in `propose_transaction`. Changes are asymmetric — the owner may
//! *tighten* a manifest immediately, but *loosening* it requires first arming a
//! timelock (`arm_capability_loosen`) so a compromised owner key cannot
//! instantly widen an agent's powers.
//!
//! `set_agent_tripwires` tunes the per-treasury behavior-signal weights that
//! feed the trust tier when the gate trips.

use anchor_lang::prelude::*;

use super::agent_identity::AgentManage;
use super::trust_envelope::TrustEnvelopeConfig;
use crate::{
    constants::AGENT_CAPABILITY_LOOSEN_TIMELOCK_SECS,
    program_accounts::{AgentActiveWindowRecord, AgentScopeRecord, AgentTripwireConfigRecord},
    AuraCoreError,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetAgentCapabilityArgs {
    pub key: Pubkey,
    pub allowed_chains: Vec<u8>,
    pub allowed_tx_types: Vec<u8>,
    pub daily_limit_usd: Option<u64>,
    pub allowed_protocols: u64,
    pub allowed_instructions: u32,
    pub per_tx_limit_usd: Option<u64>,
    pub recipient_list: Option<Pubkey>,
    pub allowed_assets: Option<Pubkey>,
    pub active_window_start: Option<i64>,
    pub active_window_end: Option<i64>,
    pub now: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetAgentTripwiresArgs {
    pub policy_denial_weight: u16,
    pub anomaly_weight: u16,
    pub fail_open_abuse_weight: u16,
    pub approval_miss_weight: u16,
    pub now: i64,
}

/// Replaces an agent's capability manifest. Tightening (or an equal manifest)
/// applies immediately; loosening requires a previously armed, elapsed timelock.
pub fn set_agent_capability(ctx: Context<AgentManage>, args: SetAgentCapabilityArgs) -> Result<()> {
    let active_window = match (args.active_window_start, args.active_window_end) {
        (Some(start), Some(end)) => {
            require!(end >= start, AuraCoreError::InvalidExternalAccountData);
            Some(AgentActiveWindowRecord { start, end })
        }
        (None, None) => None,
        _ => return err!(AuraCoreError::InvalidExternalAccountData),
    };
    let new_scope = AgentScopeRecord {
        allowed_chains: args.allowed_chains,
        allowed_tx_types: args.allowed_tx_types,
        daily_limit_usd: args.daily_limit_usd,
        allowed_protocols: args.allowed_protocols,
        allowed_instructions: args.allowed_instructions,
        per_tx_limit_usd: args.per_tx_limit_usd,
        recipient_list: args.recipient_list,
        allowed_assets: args.allowed_assets,
        active_window,
    };

    let ti = &mut ctx.accounts.trust_identity;
    let key_str = args.key.to_string();
    let agent = ti
        .agents
        .iter_mut()
        .find(|a| a.key.to_string() == key_str)
        .ok_or_else(|| error!(AuraCoreError::AgentNotFound))?;

    let tightening = new_scope
        .to_domain()
        .is_tighter_or_equal_to(&agent.scope.to_domain());
    if !tightening {
        // Loosening: a timelock must have been armed and elapsed.
        require!(
            agent.loosen_unlock_at != 0 && args.now >= agent.loosen_unlock_at,
            AuraCoreError::AgentManifestLoosenTimelock
        );
    }
    agent.scope = new_scope;
    agent.loosen_unlock_at = 0; // consume the armed window
    Ok(())
}

/// Arms the loosen timelock for an agent: a subsequent `set_agent_capability`
/// that widens the manifest becomes permitted once the timelock elapses.
pub fn arm_capability_loosen(ctx: Context<AgentManage>, key: Pubkey, now: i64) -> Result<()> {
    let ti = &mut ctx.accounts.trust_identity;
    let key_str = key.to_string();
    let agent = ti
        .agents
        .iter_mut()
        .find(|a| a.key.to_string() == key_str)
        .ok_or_else(|| error!(AuraCoreError::AgentNotFound))?;
    agent.loosen_unlock_at = now.saturating_add(AGENT_CAPABILITY_LOOSEN_TIMELOCK_SECS);
    Ok(())
}

/// Tunes the per-treasury behavior-signal weights (the tripwire engine).
pub fn set_agent_tripwires(
    ctx: Context<TrustEnvelopeConfig>,
    args: SetAgentTripwiresArgs,
) -> Result<()> {
    let config = AgentTripwireConfigRecord {
        policy_denial_weight: args.policy_denial_weight,
        anomaly_weight: args.anomaly_weight,
        fail_open_abuse_weight: args.fail_open_abuse_weight,
        approval_miss_weight: args.approval_miss_weight,
    };
    require!(config.is_valid(), AuraCoreError::InvalidAgentTripwires);
    ctx.accounts.trust_identity.tripwire_config = config;
    Ok(())
}
