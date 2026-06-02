use aura_policy::{Chain, PolicyConfig};

use crate::{
    constants::{AI_ROTATION_TIMELOCK_SECS, CONFIG_CHANGE_TIMELOCK_SECS},
    errors::TreasuryError,
};

pub const REG_FLAG_CTR_THRESHOLD: u8 = 0b0000_0001;
pub const REG_FLAG_CROSS_BORDER: u8 = 0b0000_0010;
pub const REG_FLAG_HIGH_RISK_COUNTERPARTY: u8 = 0b0000_0100;
pub const REG_FLAG_REQUIRES_KYC: u8 = 0b0000_1000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingAiRotation {
    pub new_ai_authority: String,
    pub proposed_at: i64,
    pub executable_after: i64,
    pub proposed_by: String,
}

impl PendingAiRotation {
    pub fn new(new_ai_authority: String, proposed_at: i64, proposed_by: String) -> Self {
        Self {
            new_ai_authority,
            proposed_at,
            executable_after: proposed_at + AI_ROTATION_TIMELOCK_SECS,
            proposed_by,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigChangeKind {
    PolicyLimits,
    MultisigGuardians,
    ConfidentialGuardrails,
    SwarmConfiguration,
    VetoAuthority,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingConfigChange {
    pub change_id: u64,
    pub kind: ConfigChangeKind,
    pub proposed_at: i64,
    pub executable_after: i64,
    pub proposed_by: String,
    pub vetoed: bool,
    pub new_policy_config: Option<PolicyConfig>,
    pub new_multisig_guardians: Vec<String>,
    pub new_multisig_required_sigs: Option<u8>,
}

impl PendingConfigChange {
    pub fn policy_limits(
        change_id: u64,
        proposed_at: i64,
        proposed_by: String,
        new_policy_config: PolicyConfig,
    ) -> Self {
        Self {
            change_id,
            kind: ConfigChangeKind::PolicyLimits,
            proposed_at,
            executable_after: proposed_at + CONFIG_CHANGE_TIMELOCK_SECS,
            proposed_by,
            vetoed: false,
            new_policy_config: Some(new_policy_config),
            new_multisig_guardians: Vec::new(),
            new_multisig_required_sigs: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CircuitBreakerConfig {
    pub enabled: bool,
    pub violation_threshold: u32,
    pub window_secs: i64,
    pub auto_resume_after_secs: Option<i64>,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            violation_threshold: 5,
            window_secs: 300,
            auto_resume_after_secs: Some(3_600),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct CircuitBreakerState {
    pub violation_count_window: u32,
    pub window_started_at: i64,
    pub total_trips: u32,
    pub last_trip_at: Option<i64>,
    pub config: CircuitBreakerConfig,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeadMansSwitch {
    pub enabled: bool,
    pub inactivity_threshold_secs: i64,
    pub triggered: bool,
    pub triggered_at: Option<i64>,
    pub recovery_authority: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AgentLifecycleState {
    #[default]
    Provisioning,
    Active,
    Suspended,
    Decommissioning,
    Decommissioned,
}

impl AgentLifecycleState {
    pub fn permits_new_proposals(self) -> bool {
        self == Self::Active
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GuardianChangeAction {
    Add,
    Remove,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingGuardianChange {
    pub action: GuardianChangeAction,
    pub target_guardian: String,
    pub signatures: Vec<String>,
    pub proposed_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComplianceMetadata {
    pub purpose_code: u8,
    pub is_cross_border: bool,
    pub requires_reporting: bool,
    pub regulatory_flags: u8,
    pub business_justification_hash: Option<[u8; 32]>,
}

impl ComplianceMetadata {
    pub fn from_policy_flags(purpose_code: u8, regulatory_flags: u8) -> Self {
        Self {
            purpose_code,
            is_cross_border: regulatory_flags & REG_FLAG_CROSS_BORDER != 0,
            requires_reporting: regulatory_flags & REG_FLAG_CTR_THRESHOLD != 0,
            regulatory_flags,
            business_justification_hash: None,
        }
    }
}

pub fn check_circuit_breaker_auto_resume(
    execution_paused: &mut bool,
    breaker: &CircuitBreakerState,
    now: i64,
) -> bool {
    if !*execution_paused {
        return false;
    }

    let (Some(last_trip_at), Some(auto_resume_after_secs)) =
        (breaker.last_trip_at, breaker.config.auto_resume_after_secs)
    else {
        return false;
    };

    if now >= last_trip_at + auto_resume_after_secs {
        *execution_paused = false;
        return true;
    }

    false
}

pub fn register_circuit_breaker_violation(
    breaker: &mut CircuitBreakerState,
    execution_paused: &mut bool,
    now: i64,
) -> bool {
    if !breaker.config.enabled {
        return false;
    }

    if breaker.window_started_at == 0
        || now.saturating_sub(breaker.window_started_at) > breaker.config.window_secs
    {
        breaker.violation_count_window = 0;
        breaker.window_started_at = now;
    }

    breaker.violation_count_window = breaker.violation_count_window.saturating_add(1);
    if breaker.violation_count_window < breaker.config.violation_threshold {
        return false;
    }

    *execution_paused = true;
    breaker.total_trips = breaker.total_trips.saturating_add(1);
    breaker.last_trip_at = Some(now);
    breaker.violation_count_window = 0;
    true
}

pub fn ensure_valid_lifecycle_transition(
    current: AgentLifecycleState,
    target: AgentLifecycleState,
    pending_count: usize,
) -> Result<(), TreasuryError> {
    let valid = matches!(
        (current, target),
        (
            AgentLifecycleState::Provisioning,
            AgentLifecycleState::Active
        ) | (AgentLifecycleState::Active, AgentLifecycleState::Suspended)
            | (AgentLifecycleState::Suspended, AgentLifecycleState::Active)
            | (
                AgentLifecycleState::Decommissioning,
                AgentLifecycleState::Decommissioned
            )
    ) || (current == AgentLifecycleState::Active
        && target == AgentLifecycleState::Decommissioning
        && pending_count == 0);

    if valid {
        Ok(())
    } else {
        Err(TreasuryError::InvalidStateTransition)
    }
}

pub fn audit_lifecycle_label(state: AgentLifecycleState) -> &'static str {
    match state {
        AgentLifecycleState::Provisioning => "provisioning",
        AgentLifecycleState::Active => "active",
        AgentLifecycleState::Suspended => "suspended",
        AgentLifecycleState::Decommissioning => "decommissioning",
        AgentLifecycleState::Decommissioned => "decommissioned",
    }
}

// Agent identity

/// Allowed-scope constraints for a secondary agent authority.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AgentScope {
    /// Chain codes this agent may propose on; empty = all chains allowed.
    pub allowed_chains: Vec<u8>,
    /// Transaction-type codes this agent may propose; empty = all types.
    pub allowed_tx_types: Vec<u8>,
    /// Optional per-agent daily spend cap (tighter than the global policy wins).
    pub daily_limit_usd: Option<u64>,
}

/// A scoped, enableable authority that can submit proposals on behalf of a
/// treasury alongside (or instead of) the primary `ai_authority`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentAuthority {
    /// Pubkey of the agent, stored as a string.
    pub key: String,
    /// Human-readable label (max 32 chars).
    pub label: String,
    pub scope: AgentScope,
    pub enabled: bool,
    pub registered_at: i64,
}

/// Timelocked pending handover of treasury control to a new owner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingOwnershipHandover {
    pub successor_owner: String,
    pub proposed_at: i64,
    pub executable_after: i64,
    pub proposed_by: String,
}

impl PendingOwnershipHandover {
    pub fn new(successor_owner: String, proposed_at: i64, proposed_by: String) -> Self {
        Self {
            successor_owner,
            proposed_at,
            executable_after: proposed_at + crate::constants::OWNERSHIP_HANDOVER_TIMELOCK_SECS,
            proposed_by,
        }
    }
}

/// A pre-registered cold-wallet address on a specific chain used as the sole
/// permitted destination when `break_glass_recover` sweeps funds out.
///
/// `locked_until` prevents an attacker who steals the owner key from
/// immediately redirecting break-glass recovery to themselves: a new
/// registration is locked for `RECOVERY_DESTINATION_TIMELOCK_SECS` before it
/// can be changed again.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecoveryDestination {
    pub chain: Chain,
    pub address: String,
    pub registered_at: i64,
    /// The earliest timestamp at which this entry may be overwritten.
    pub locked_until: i64,
}
