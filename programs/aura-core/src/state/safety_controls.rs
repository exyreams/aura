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

/// The capability manifest for a secondary agent authority — a bounded,
/// declarative statement of *everything* the agent may do. Checked on every
/// agent action; anything not granted is denied.
///
/// Bitmap / `Option` sentinels mean "unrestricted" so existing agents keep
/// working: empty chain/tx-type lists, a `0` protocol/instruction bitmap, and
/// `None` recipient/asset/window all mean "no restriction on this dimension".
/// Tightening narrows a dimension; loosening widens it (timelocked).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AgentScope {
    /// Chain codes this agent may propose on; empty = all chains allowed.
    pub allowed_chains: Vec<u8>,
    /// Transaction-type codes this agent may propose; empty = all types.
    pub allowed_tx_types: Vec<u8>,
    /// Optional per-agent daily spend cap (tighter than the global policy wins).
    pub daily_limit_usd: Option<u64>,
    /// Allowed DeFi protocol bitmap (bit i = protocol id i); 0 = all protocols.
    pub allowed_protocols: u64,
    /// Allowed privileged-instruction bitmap; 0 = all instructions.
    pub allowed_instructions: u32,
    /// Optional per-agent per-transaction USD cap.
    pub per_tx_limit_usd: Option<u64>,
    /// Optional allow/deny address-list account this agent's recipients are
    /// checked against; `None` = no recipient restriction.
    pub recipient_list: Option<String>,
    /// Optional asset allow-list account; `None` = no asset restriction.
    pub allowed_assets: Option<String>,
    /// Optional `(start, end)` active window (unix secs); `None` = always active.
    pub active_window: Option<(i64, i64)>,
}

impl AgentScope {
    /// Returns `true` if `protocol_id` is permitted by the protocol bitmap.
    pub fn protocol_allowed(&self, protocol_id: Option<u8>) -> bool {
        if self.allowed_protocols == 0 {
            return true;
        }
        match protocol_id {
            Some(id) if id < 64 => self.allowed_protocols & (1u64 << id) != 0,
            // No protocol id supplied is fine; an out-of-range id is not.
            Some(_) => false,
            None => true,
        }
    }

    /// Returns `true` if `instruction_bit` is permitted by the instruction bitmap.
    pub fn instruction_allowed(&self, instruction_bit: u32) -> bool {
        self.allowed_instructions == 0 || self.allowed_instructions & instruction_bit != 0
    }

    /// Returns `true` if `now` is inside the agent's active window (if any).
    pub fn within_active_window(&self, now: i64) -> bool {
        match self.active_window {
            Some((start, end)) => now >= start && now <= end,
            None => true,
        }
    }

    /// Contract-enforced capability gate: validates a proposed action against
    /// every manifest dimension that can be checked from on-chain proposal data.
    /// `recipient_list` / `allowed_assets` are enforced via their address-list
    /// accounts on the evaluator path, not here.
    pub fn check_capability(
        &self,
        chain: u8,
        tx_type: u8,
        protocol_id: Option<u8>,
        amount_usd: u64,
        now: i64,
    ) -> Result<(), crate::TreasuryError> {
        use crate::TreasuryError::AgentCapabilityExceeded;
        if !self.allowed_chains.is_empty() && !self.allowed_chains.contains(&chain) {
            return Err(AgentCapabilityExceeded);
        }
        if !self.allowed_tx_types.is_empty() && !self.allowed_tx_types.contains(&tx_type) {
            return Err(AgentCapabilityExceeded);
        }
        if !self.protocol_allowed(protocol_id) {
            return Err(AgentCapabilityExceeded);
        }
        if !self.within_active_window(now) {
            return Err(AgentCapabilityExceeded);
        }
        if let Some(cap) = self.per_tx_limit_usd {
            if amount_usd > cap {
                return Err(AgentCapabilityExceeded);
            }
        }
        Ok(())
    }

    /// Returns `true` if `self` is no wider than `other` on every dimension —
    /// i.e. setting the manifest to `self` is a tightening (or no-op), which may
    /// be applied immediately. Widening any dimension is a loosening (timelocked).
    pub fn is_tighter_or_equal_to(&self, other: &AgentScope) -> bool {
        // A list constrains when non-empty; empty = unrestricted (widest).
        let list_tighter = |new: &[u8], old: &[u8]| -> bool {
            if old.is_empty() {
                true // old unrestricted: any new (incl. empty) is ≤
            } else if new.is_empty() {
                false // new unrestricted but old wasn't: widening
            } else {
                new.iter().all(|c| old.contains(c))
            }
        };
        let bitmap_tighter =
            |new: u64, old: u64| -> bool { old == 0 || (new != 0 && new & !old == 0) };
        let opt_cap_tighter = |new: Option<u64>, old: Option<u64>| -> bool {
            match (new, old) {
                (_, None) => true,        // old uncapped: any cap is ≤
                (None, Some(_)) => false, // removing a cap is widening
                (Some(n), Some(o)) => n <= o,
            }
        };
        list_tighter(&self.allowed_chains, &other.allowed_chains)
            && list_tighter(&self.allowed_tx_types, &other.allowed_tx_types)
            && bitmap_tighter(self.allowed_protocols, other.allowed_protocols)
            && bitmap_tighter(
                u64::from(self.allowed_instructions),
                u64::from(other.allowed_instructions),
            )
            && opt_cap_tighter(self.daily_limit_usd, other.daily_limit_usd)
            && opt_cap_tighter(self.per_tx_limit_usd, other.per_tx_limit_usd)
    }
}

/// On-chain telemetry for a single agent — its scorecard. Fed by the capability
/// gate and read by owners, the trust engine, and analytics.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AgentStats {
    /// Total actions attempted by this agent.
    pub actions_total: u64,
    /// Actions denied (capability or policy).
    pub denials: u64,
    /// Unix timestamp of the agent's most recent action.
    pub last_active_at: i64,
}

impl AgentStats {
    /// Denial rate in basis points (0 when no actions yet).
    pub fn denial_rate_bps(&self) -> u16 {
        if self.actions_total == 0 {
            return 0;
        }
        ((self.denials.saturating_mul(10_000)) / self.actions_total) as u16
    }
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
    /// On-chain action telemetry for this agent.
    pub stats: AgentStats,
    /// Unix timestamp before which a manifest *loosening* is not permitted.
    /// Set by `arm_capability_loosen`; tightening ignores it.
    pub loosen_unlock_at: i64,
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
