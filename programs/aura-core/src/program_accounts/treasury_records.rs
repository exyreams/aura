use super::*;
use crate::state::trust::TrustConfig;

// Trust envelope

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct TrustConfigRecord {
    pub watch_threshold: u16,
    pub restricted_threshold: u16,
    pub lockdown_threshold: u16,
    pub watch_multiplier_bps: u64,
    pub restricted_multiplier_bps: u64,
    pub decay_points_per_period: u16,
    pub decay_period_secs: i64,
}

impl TrustConfigRecord {
    pub fn from_domain(d: &TrustConfig) -> Self {
        Self {
            watch_threshold: d.watch_threshold,
            restricted_threshold: d.restricted_threshold,
            lockdown_threshold: d.lockdown_threshold,
            watch_multiplier_bps: d.watch_multiplier_bps,
            restricted_multiplier_bps: d.restricted_multiplier_bps,
            decay_points_per_period: d.decay_points_per_period,
            decay_period_secs: d.decay_period_secs,
        }
    }

    pub fn to_domain(&self) -> TrustConfig {
        TrustConfig {
            watch_threshold: self.watch_threshold,
            restricted_threshold: self.restricted_threshold,
            lockdown_threshold: self.lockdown_threshold,
            watch_multiplier_bps: self.watch_multiplier_bps,
            restricted_multiplier_bps: self.restricted_multiplier_bps,
            decay_points_per_period: self.decay_points_per_period,
            decay_period_secs: self.decay_period_secs,
        }
    }
}

// Agent identity

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct AgentScopeRecord {
    #[max_len(8)]
    pub allowed_chains: Vec<u8>,
    #[max_len(8)]
    pub allowed_tx_types: Vec<u8>,
    pub daily_limit_usd: Option<u64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct AgentAuthorityRecord {
    pub key: Pubkey,
    #[max_len(32)]
    pub label: String,
    pub scope: AgentScopeRecord,
    pub enabled: bool,
    pub registered_at: i64,
}

impl AgentAuthorityRecord {
    pub fn from_domain(d: &AgentAuthority) -> Result<Self> {
        Ok(Self {
            key: parse_pubkey(&d.key)?,
            label: d.label.clone(),
            scope: AgentScopeRecord {
                allowed_chains: d.scope.allowed_chains.clone(),
                allowed_tx_types: d.scope.allowed_tx_types.clone(),
                daily_limit_usd: d.scope.daily_limit_usd,
            },
            enabled: d.enabled,
            registered_at: d.registered_at,
        })
    }

    pub fn to_domain(&self) -> AgentAuthority {
        AgentAuthority {
            key: self.key.to_string(),
            label: self.label.clone(),
            scope: AgentScope {
                allowed_chains: self.scope.allowed_chains.clone(),
                allowed_tx_types: self.scope.allowed_tx_types.clone(),
                daily_limit_usd: self.scope.daily_limit_usd,
            },
            enabled: self.enabled,
            registered_at: self.registered_at,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PendingOwnershipHandoverRecord {
    pub successor_owner: Pubkey,
    pub proposed_at: i64,
    pub executable_after: i64,
    pub proposed_by: Pubkey,
}

impl PendingOwnershipHandoverRecord {
    pub fn from_domain(d: &PendingOwnershipHandover) -> Result<Self> {
        Ok(Self {
            successor_owner: parse_pubkey(&d.successor_owner)?,
            proposed_at: d.proposed_at,
            executable_after: d.executable_after,
            proposed_by: parse_pubkey(&d.proposed_by)?,
        })
    }

    pub fn to_domain(&self) -> PendingOwnershipHandover {
        PendingOwnershipHandover {
            successor_owner: self.successor_owner.to_string(),
            proposed_at: self.proposed_at,
            executable_after: self.executable_after,
            proposed_by: self.proposed_by.to_string(),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct RecoveryDestinationRecord {
    pub chain: u8,
    #[max_len(128)]
    pub address: String,
    pub registered_at: i64,
    pub locked_until: i64,
}

impl RecoveryDestinationRecord {
    pub fn from_domain(domain: &RecoveryDestination) -> Self {
        Self {
            chain: chain_code(domain.chain),
            address: domain.address.clone(),
            registered_at: domain.registered_at,
            locked_until: domain.locked_until,
        }
    }

    pub fn to_domain(&self) -> Result<RecoveryDestination> {
        Ok(RecoveryDestination {
            chain: chain_from_code(self.chain)?,
            address: self.address.clone(),
            registered_at: self.registered_at,
            locked_until: self.locked_until,
        })
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PendingAiRotationRecord {
    pub new_ai_authority: Pubkey,
    pub proposed_at: i64,
    pub executable_after: i64,
    pub proposed_by: Pubkey,
}

impl PendingAiRotationRecord {
    pub fn from_domain(domain: &PendingAiRotation) -> Result<Self> {
        Ok(Self {
            new_ai_authority: parse_pubkey(&domain.new_ai_authority)?,
            proposed_at: domain.proposed_at,
            executable_after: domain.executable_after,
            proposed_by: parse_pubkey(&domain.proposed_by)?,
        })
    }

    pub fn to_domain(&self) -> Result<PendingAiRotation> {
        Ok(PendingAiRotation {
            new_ai_authority: self.new_ai_authority.to_string(),
            proposed_at: self.proposed_at,
            executable_after: self.executable_after,
            proposed_by: self.proposed_by.to_string(),
        })
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PendingConfigChangeRecord {
    pub change_id: u64,
    pub kind: u8,
    pub proposed_at: i64,
    pub executable_after: i64,
    pub proposed_by: Pubkey,
    pub vetoed: bool,
    pub new_policy_config: Option<PolicyConfigRecord>,
    #[max_len(10)]
    pub new_multisig_guardians: Vec<Pubkey>,
    pub new_multisig_required_sigs: Option<u8>,
}

impl PendingConfigChangeRecord {
    pub fn from_domain(domain: &PendingConfigChange) -> Result<Self> {
        Ok(Self {
            change_id: domain.change_id,
            kind: config_change_kind_code(domain.kind),
            proposed_at: domain.proposed_at,
            executable_after: domain.executable_after,
            proposed_by: parse_pubkey(&domain.proposed_by)?,
            vetoed: domain.vetoed,
            new_policy_config: domain
                .new_policy_config
                .as_ref()
                .map(PolicyConfigRecord::from_domain),
            new_multisig_guardians: domain
                .new_multisig_guardians
                .iter()
                .map(|guardian| parse_pubkey(guardian))
                .collect::<Result<Vec<_>>>()?,
            new_multisig_required_sigs: domain.new_multisig_required_sigs,
        })
    }

    pub fn to_domain(&self) -> Result<PendingConfigChange> {
        Ok(PendingConfigChange {
            change_id: self.change_id,
            kind: config_change_kind_from_code(self.kind)?,
            proposed_at: self.proposed_at,
            executable_after: self.executable_after,
            proposed_by: self.proposed_by.to_string(),
            vetoed: self.vetoed,
            new_policy_config: self
                .new_policy_config
                .as_ref()
                .map(PolicyConfigRecord::to_domain),
            new_multisig_guardians: self
                .new_multisig_guardians
                .iter()
                .map(ToString::to_string)
                .collect(),
            new_multisig_required_sigs: self.new_multisig_required_sigs,
        })
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct CircuitBreakerConfigRecord {
    pub enabled: bool,
    pub violation_threshold: u32,
    pub window_secs: i64,
    pub auto_resume_after_secs: Option<i64>,
}

impl CircuitBreakerConfigRecord {
    pub fn from_domain(domain: &CircuitBreakerConfig) -> Self {
        Self {
            enabled: domain.enabled,
            violation_threshold: domain.violation_threshold,
            window_secs: domain.window_secs,
            auto_resume_after_secs: domain.auto_resume_after_secs,
        }
    }

    pub fn to_domain(&self) -> CircuitBreakerConfig {
        CircuitBreakerConfig {
            enabled: self.enabled,
            violation_threshold: self.violation_threshold,
            window_secs: self.window_secs,
            auto_resume_after_secs: self.auto_resume_after_secs,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct CircuitBreakerRecord {
    pub violation_count_window: u32,
    pub window_started_at: i64,
    pub total_trips: u32,
    pub last_trip_at: Option<i64>,
    pub config: CircuitBreakerConfigRecord,
}

impl CircuitBreakerRecord {
    pub fn from_domain(domain: &CircuitBreakerState) -> Self {
        Self {
            violation_count_window: domain.violation_count_window,
            window_started_at: domain.window_started_at,
            total_trips: domain.total_trips,
            last_trip_at: domain.last_trip_at,
            config: CircuitBreakerConfigRecord::from_domain(&domain.config),
        }
    }

    pub fn to_domain(&self) -> CircuitBreakerState {
        CircuitBreakerState {
            violation_count_window: self.violation_count_window,
            window_started_at: self.window_started_at,
            total_trips: self.total_trips,
            last_trip_at: self.last_trip_at,
            config: self.config.to_domain(),
        }
    }
}

impl Default for CircuitBreakerRecord {
    fn default() -> Self {
        Self::from_domain(&CircuitBreakerState::default())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct DeadMansSwitchRecord {
    pub enabled: bool,
    pub inactivity_threshold_secs: i64,
    pub triggered: bool,
    pub triggered_at: Option<i64>,
    pub recovery_authority: Pubkey,
}

impl DeadMansSwitchRecord {
    pub fn from_domain(domain: &DeadMansSwitch) -> Result<Self> {
        Ok(Self {
            enabled: domain.enabled,
            inactivity_threshold_secs: domain.inactivity_threshold_secs,
            triggered: domain.triggered,
            triggered_at: domain.triggered_at,
            recovery_authority: parse_pubkey(&domain.recovery_authority)?,
        })
    }

    pub fn to_domain(&self) -> Result<DeadMansSwitch> {
        Ok(DeadMansSwitch {
            enabled: self.enabled,
            inactivity_threshold_secs: self.inactivity_threshold_secs,
            triggered: self.triggered,
            triggered_at: self.triggered_at,
            recovery_authority: self.recovery_authority.to_string(),
        })
    }
}

/// Serialized form of `ConfidentialGuardrails`.
/// Ciphertext account addresses are stored as `Option<Pubkey>` rather than
/// `Option<String>` to save space and enable Anchor's `InitSpace` derivation.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct ConfidentialGuardrailsRecord {
    pub daily_limit_ciphertext: Option<Pubkey>,
    pub per_tx_limit_ciphertext: Option<Pubkey>,
    pub spent_today_ciphertext: Option<Pubkey>,
}

impl ConfidentialGuardrailsRecord {
    pub fn from_domain(domain: &ConfidentialGuardrails) -> Self {
        Self {
            daily_limit_ciphertext: domain
                .daily_limit_ciphertext
                .as_deref()
                .map(parse_pubkey)
                .transpose()
                .expect("stored confidential daily limit ciphertext must be a pubkey when present"),
            per_tx_limit_ciphertext: domain
                .per_tx_limit_ciphertext
                .as_deref()
                .map(parse_pubkey)
                .transpose()
                .expect("stored confidential per-tx ciphertext must be a pubkey when present"),
            spent_today_ciphertext: domain
                .spent_today_ciphertext
                .as_deref()
                .map(parse_pubkey)
                .transpose()
                .expect("stored confidential spent-today ciphertext must be a pubkey when present"),
        }
    }

    pub fn to_domain(&self) -> ConfidentialGuardrails {
        ConfidentialGuardrails {
            daily_limit_ciphertext: self.daily_limit_ciphertext.map(|key| key.to_string()),
            per_tx_limit_ciphertext: self.per_tx_limit_ciphertext.map(|key| key.to_string()),
            spent_today_ciphertext: self.spent_today_ciphertext.map(|key| key.to_string()),
        }
    }
}
