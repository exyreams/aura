use std::collections::BTreeMap;

use aura_policy::{Chain, PolicyConfig, PolicyEvaluationContext, PolicyState, TransactionContext};

use crate::{
    audit::{AuditKind, AuditTrail},
    constants::MAX_PENDING_QUEUE_DEPTH,
    governance::EmergencyMultisig,
    state::safety_controls::{
        audit_lifecycle_label, check_circuit_breaker_auto_resume,
        ensure_valid_lifecycle_transition, register_circuit_breaker_violation, AgentLifecycleState,
        CircuitBreakerState, DeadMansSwitch, PendingAiRotation, PendingConfigChange,
    },
    state::{
        AgentReputation, AgentSwarm, ConfidentialGuardrails, DWalletCurve, DWalletReference,
        PendingTransaction, ProtocolDeployment, ProtocolFees, SignatureScheme,
    },
};

/// The root domain object for an agent treasury.
///
/// Owns all mutable state: registered dWallets, policy configuration and
/// counters, the single pending proposal slot, audit trail, reputation,
/// fees, optional multisig, and optional swarm. All instruction handlers
/// deserialize this from `TreasuryAccount`, mutate it, then serialize it back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentTreasury {
    /// Unique identifier for this agent, part of the treasury PDA seed.
    pub agent_id: String,
    /// Public key of the treasury owner (base-58).
    pub owner: String,
    /// Public key of the AI agent authorized to submit proposals (base-58).
    pub ai_authority: String,
    /// Unix timestamp when the treasury was created.
    pub creation_timestamp: i64,
    /// Program IDs and endpoints for the active deployment cluster.
    pub deployment: ProtocolDeployment,
    /// Registered dWallets keyed by chain. At most one per chain.
    pub dwallets: BTreeMap<Chain, DWalletReference>,
    /// Policy rules (limits, velocity, slippage, etc.).
    pub policy_config: PolicyConfig,
    /// Mutable spending counters (spent today, hourly bucket, velocity window).
    pub policy_state: PolicyState,
    /// FHE ciphertext account addresses for confidential policy evaluation.
    pub confidential_guardrails: Option<ConfidentialGuardrails>,
    /// The single in-flight proposal, if any.
    pub pending: Option<PendingTransaction>,
    /// Multi-slot pending proposal queue. `pending` mirrors the queue front
    /// for backward-compatible handlers and older clients.
    pub pending_queue: Vec<PendingTransaction>,
    /// Append-only log of all treasury actions (not persisted on-chain).
    pub audit_trail: AuditTrail,
    /// Total number of proposals that have been executed.
    pub total_transactions: u64,
    /// Monotonically increasing counter used to assign proposal IDs.
    pub next_proposal_id: u64,
    /// When `true`, `propose_transaction` and `execute_pending` are blocked.
    pub execution_paused: bool,
    /// Full lifecycle state for the agent treasury.
    pub agent_state: AgentLifecycleState,
    /// How long (in seconds) a pending transaction remains valid before expiring.
    pub pending_transaction_ttl_secs: i64,
    /// Policy/rule version applied to newly-created proposals.
    pub current_policy_version: u32,
    /// Pending AI authority rotation awaiting timelock expiry.
    pub pending_ai_rotation: Option<PendingAiRotation>,
    /// Pending dangerous config change awaiting timelock expiry.
    pub pending_config_change: Option<PendingConfigChange>,
    /// Auto-pause state tracking policy violations.
    pub circuit_breaker: CircuitBreakerState,
    /// Last timestamp when the owner signed an owner-only instruction.
    pub last_owner_activity_at: i64,
    /// Optional dead man's switch configuration.
    pub dead_mans_switch: Option<DeadMansSwitch>,
    /// High risk proposals at or above this score require guardian co-signing.
    pub high_risk_threshold: u8,
    /// Whether high-risk guardian co-signing is enforced.
    pub high_risk_require_guardian: bool,
    /// Last timestamp of a large transaction subject to cooldown.
    pub last_large_tx_at: Option<i64>,
    /// Amount of the last large transaction subject to cooldown.
    pub last_large_tx_amount_usd: u64,
    /// Parent treasury, if this treasury is a child agent.
    pub parent_treasury: Option<String>,
    /// Child treasury pubkeys spawned from this treasury.
    pub child_agents: Vec<String>,
    /// Optional total child spend budget.
    pub child_spend_budget_usd: Option<u64>,
    /// Whether recipient sanctions checks are required for proposals.
    pub sanctions_check_enabled: bool,
    /// Optional compliance oracle account pubkey.
    pub compliance_oracle: Option<String>,
    /// Emergency shutdown timestamp.
    pub shutdown_initiated_at: Option<i64>,
    /// Recovery pubkey used by emergency shutdown.
    pub shutdown_recovery_pubkey: Option<String>,
    /// Last periodic snapshot timestamp.
    pub last_snapshot_at: Option<i64>,
    /// Agent reputation counters used for limit scaling.
    pub reputation: AgentReputation,
    /// Protocol fee schedule applied to executed transactions.
    pub protocol_fees: ProtocolFees,
    /// Optional emergency multisig for guardian override proposals.
    pub multisig: Option<EmergencyMultisig>,
    /// Optional swarm shared-pool configuration.
    pub swarm: Option<AgentSwarm>,
    /// Preferred execution chain ("primary"), used when a proposal omits one.
    pub default_chain: Option<Chain>,
}

impl AgentTreasury {
    /// Creates a new treasury with default policy state, no dWallets, and a
    /// `TreasuryCreated` audit event. `pending_transaction_ttl_secs` defaults
    /// to 900 (15 minutes).
    pub fn new(
        agent_id: impl Into<String>,
        owner: impl Into<String>,
        ai_authority: impl Into<String>,
        creation_timestamp: i64,
        policy_config: PolicyConfig,
        deployment: ProtocolDeployment,
    ) -> Self {
        let mut audit_trail = AuditTrail::default();
        audit_trail.record(
            AuditKind::TreasuryCreated,
            "agent treasury initialized",
            creation_timestamp,
        );

        Self {
            agent_id: agent_id.into(),
            owner: owner.into(),
            ai_authority: ai_authority.into(),
            creation_timestamp,
            deployment,
            dwallets: BTreeMap::new(),
            policy_config,
            policy_state: PolicyState::default(),
            confidential_guardrails: None,
            pending: None,
            pending_queue: Vec::new(),
            audit_trail,
            total_transactions: 0,
            next_proposal_id: 1,
            execution_paused: false,
            agent_state: AgentLifecycleState::Provisioning,
            pending_transaction_ttl_secs: 900,
            current_policy_version: 1,
            pending_ai_rotation: None,
            pending_config_change: None,
            circuit_breaker: CircuitBreakerState::default(),
            last_owner_activity_at: creation_timestamp,
            dead_mans_switch: None,
            high_risk_threshold: 70,
            high_risk_require_guardian: false,
            last_large_tx_at: None,
            last_large_tx_amount_usd: 0,
            parent_treasury: None,
            child_agents: Vec::new(),
            child_spend_budget_usd: None,
            sanctions_check_enabled: false,
            compliance_oracle: None,
            shutdown_initiated_at: None,
            shutdown_recovery_pubkey: None,
            last_snapshot_at: None,
            reputation: AgentReputation::default(),
            protocol_fees: ProtocolFees::default(),
            multisig: None,
            swarm: None,
            default_chain: None,
        }
    }

    /// Sets (or clears) the preferred execution chain. Returns
    /// `DefaultChainNotRegistered` if `chain` has no registered dWallet.
    pub fn set_default_chain(
        &mut self,
        chain: Option<Chain>,
        now: i64,
    ) -> Result<(), crate::TreasuryError> {
        if let Some(chain) = chain {
            if !self.dwallets.contains_key(&chain) {
                return Err(crate::TreasuryError::DWalletNotConfigured(chain));
            }
        }
        self.default_chain = chain;
        self.audit_trail.record(
            AuditKind::ConfigChangeExecuted,
            "default execution chain updated",
            now,
        );
        Ok(())
    }

    /// Registers a dWallet for `chain` using the chain's default curve and
    /// signature scheme. Returns `DWalletAlreadyRegistered` if a dWallet for
    /// that chain already exists.
    pub fn register_dwallet(
        &mut self,
        chain: Chain,
        dwallet_id: impl Into<String>,
        address: impl Into<String>,
        balance_usd: u64,
        timestamp: i64,
    ) -> Result<(), crate::TreasuryError> {
        let (curve, signature_scheme) = DWalletReference::chain_defaults(chain);
        let cpi_authority_seed = "__ika_cpi_authority";
        let authority = format!(
            "pda:{}:{chain}:{cpi_authority_seed}",
            self.deployment.caller_program_id
        );

        self.register_dwallet_with_metadata(
            chain,
            dwallet_id,
            address,
            balance_usd,
            authority,
            cpi_authority_seed,
            curve,
            signature_scheme,
            timestamp,
        )
    }

    /// Registers a dWallet with explicit curve, signature scheme, authority,
    /// and CPI seed. Used by tests and advanced configurations.
    #[allow(clippy::too_many_arguments)]
    pub fn register_dwallet_with_metadata(
        &mut self,
        chain: Chain,
        dwallet_id: impl Into<String>,
        address: impl Into<String>,
        balance_usd: u64,
        authority: impl Into<String>,
        cpi_authority_seed: impl Into<String>,
        curve: DWalletCurve,
        signature_scheme: SignatureScheme,
        timestamp: i64,
    ) -> Result<(), crate::TreasuryError> {
        if self.dwallets.contains_key(&chain) {
            return Err(crate::TreasuryError::DWalletAlreadyRegistered(chain));
        }

        self.dwallets.insert(
            chain,
            DWalletReference {
                dwallet_id: dwallet_id.into(),
                chain,
                address: address.into(),
                balance_usd,
                balance_updated_at: timestamp,
                balance_oracle: None,
                authority: authority.into(),
                cpi_authority_seed: cpi_authority_seed.into(),
                dwallet_account: None,
                authorized_user_pubkey: None,
                message_metadata_digest: None,
                public_key_hex: None,
                curve,
                signature_scheme,
            },
        );

        self.audit_trail.record(
            AuditKind::DWalletRegistered,
            format!("registered {chain} custody with {curve}/{signature_scheme}"),
            timestamp,
        );

        if self.agent_state == AgentLifecycleState::Provisioning {
            self.agent_state = AgentLifecycleState::Active;
            self.audit_trail.record(
                AuditKind::AgentStateTransitioned,
                "agent activated after first dwallet registration",
                timestamp,
            );
        }

        Ok(())
    }

    /// Updates the live-signing runtime fields on an already-registered dWallet.
    ///
    /// Only fields that are `Some` are updated; `None` values leave the
    /// existing field unchanged. Returns `DWalletNotConfigured` if no dWallet
    /// is registered for `chain`.
    pub fn configure_dwallet_runtime(
        &mut self,
        chain: Chain,
        dwallet_account: Option<String>,
        authorized_user_pubkey: Option<String>,
        message_metadata_digest: Option<String>,
        public_key_hex: Option<String>,
        timestamp: i64,
    ) -> Result<(), crate::TreasuryError> {
        let entry = self
            .dwallets
            .get_mut(&chain)
            .ok_or(crate::TreasuryError::DWalletNotConfigured(chain))?;

        if let Some(dwallet_account) = dwallet_account {
            entry.dwallet_account = Some(dwallet_account);
        }
        if let Some(authorized_user_pubkey) = authorized_user_pubkey {
            entry.authorized_user_pubkey = Some(authorized_user_pubkey);
        }
        if let Some(message_metadata_digest) = message_metadata_digest {
            entry.message_metadata_digest = Some(message_metadata_digest);
        }
        if let Some(public_key_hex) = public_key_hex {
            entry.public_key_hex = Some(public_key_hex);
        }

        self.audit_trail.record(
            AuditKind::DWalletRegistered,
            format!("updated {chain} runtime metadata for live CPI"),
            timestamp,
        );

        Ok(())
    }

    /// Configures scalar FHE guardrails using three separate `u64` ciphertext
    /// accounts. Replaces any existing guardrails configuration.
    pub fn configure_confidential_guardrails(
        &mut self,
        daily_limit_ciphertext: impl Into<String>,
        per_tx_limit_ciphertext: impl Into<String>,
        spent_today_ciphertext: impl Into<String>,
        timestamp: i64,
    ) {
        self.confidential_guardrails = Some(ConfidentialGuardrails {
            daily_limit_ciphertext: Some(daily_limit_ciphertext.into()),
            per_tx_limit_ciphertext: Some(per_tx_limit_ciphertext.into()),
            spent_today_ciphertext: Some(spent_today_ciphertext.into()),
        });

        self.audit_trail.record(
            AuditKind::ConfidentialGuardrailsConfigured,
            "confidential guardrails configured",
            timestamp,
        );
    }

    /// Updates mutable treasury settings in place. Only `Some` fields change.
    ///
    /// `agent_id`/`owner` are part of the PDA seed and are intentionally not
    /// editable here. Records a `ConfigChangeExecuted` audit event.
    pub fn update_settings(
        &mut self,
        pending_transaction_ttl_secs: Option<i64>,
        high_risk_threshold: Option<u8>,
        high_risk_require_guardian: Option<bool>,
        sanctions_check_enabled: Option<bool>,
        now: i64,
    ) -> Result<(), crate::TreasuryError> {
        if let Some(ttl) = pending_transaction_ttl_secs {
            if ttl <= 0 {
                return Err(crate::TreasuryError::InvalidAccountData(
                    "pending transaction ttl must be positive".to_string(),
                ));
            }
            self.pending_transaction_ttl_secs = ttl;
        }
        if let Some(threshold) = high_risk_threshold {
            self.high_risk_threshold = threshold;
        }
        if let Some(require_guardian) = high_risk_require_guardian {
            self.high_risk_require_guardian = require_guardian;
        }
        if let Some(sanctions) = sanctions_check_enabled {
            self.sanctions_check_enabled = sanctions;
        }
        self.last_owner_activity_at = now;
        self.audit_trail.record(
            AuditKind::ConfigChangeExecuted,
            "treasury metadata updated",
            now,
        );
        Ok(())
    }

    /// Adds or updates a per-recipient exposure limit, keyed by `(chain, address)`.
    ///
    /// Returns an error for an invalid limit or when the recipient-limit set is
    /// full (capped to match the policy record's `#[max_len]`). Bumps the policy
    /// version and records an audit event.
    pub fn upsert_recipient_limit(
        &mut self,
        chain: Chain,
        address: String,
        daily_limit_usd: u64,
        per_tx_limit_usd: Option<u64>,
        now: i64,
    ) -> Result<(), crate::TreasuryError> {
        if daily_limit_usd == 0 || address.len() > 128 {
            return Err(crate::TreasuryError::InvalidAccountData(
                "invalid recipient limit".to_string(),
            ));
        }
        let limits = &mut self.policy_config.recipient_limits;
        if let Some(existing) = limits
            .iter_mut()
            .find(|limit| limit.chain == chain && limit.address == address)
        {
            existing.daily_limit_usd = daily_limit_usd;
            existing.per_tx_limit_usd = per_tx_limit_usd;
        } else {
            if limits.len() >= 16 {
                return Err(crate::TreasuryError::InvalidAccountData(
                    "recipient limit set is full".to_string(),
                ));
            }
            limits.push(aura_policy::RecipientLimit {
                chain,
                address,
                daily_limit_usd,
                per_tx_limit_usd,
            });
        }
        self.current_policy_version = self.current_policy_version.saturating_add(1);
        self.audit_trail
            .record(AuditKind::ConfigChangeExecuted, "recipient limit set", now);
        Ok(())
    }

    /// Removes a per-recipient exposure limit. Returns `true` if one was removed,
    /// `false` if no matching `(chain, address)` existed.
    pub fn remove_recipient_limit(&mut self, chain: Chain, address: &str, now: i64) -> bool {
        let limits = &mut self.policy_config.recipient_limits;
        let Some(position) = limits
            .iter()
            .position(|limit| limit.chain == chain && limit.address == address)
        else {
            return false;
        };
        limits.remove(position);
        self.current_policy_version = self.current_policy_version.saturating_add(1);
        self.audit_trail.record(
            AuditKind::ConfigChangeExecuted,
            "recipient limit removed",
            now,
        );
        true
    }

    /// Attaches or replaces the emergency multisig configuration.
    pub fn attach_multisig(&mut self, multisig: EmergencyMultisig, timestamp: i64) {
        self.multisig = Some(multisig);
        self.audit_trail.record(
            AuditKind::MultisigAttached,
            "guardian override controls attached",
            timestamp,
        );
    }

    /// Attaches or replaces the swarm shared-pool configuration.
    ///
    /// Automatically adds this treasury's `agent_id` to the swarm member list
    /// and syncs `shared_pool_limit_usd` into `policy_config` so the policy
    /// engine enforces the pool limit.
    pub fn attach_swarm(&mut self, mut swarm: AgentSwarm, timestamp: i64) {
        swarm.add_member(self.agent_id.clone());
        self.policy_config.shared_pool_limit_usd = Some(swarm.shared_pool_limit_usd);
        self.swarm = Some(swarm);
        self.audit_trail.record(
            AuditKind::SwarmAttached,
            "shared pool controls attached",
            timestamp,
        );
    }

    /// Applies the pending override proposal if the multisig has reached quorum
    /// and the proposal has not expired.
    ///
    /// Returns `true` if the override was applied, `false` if there is no
    /// multisig or the proposal is not yet ready.
    pub fn apply_ready_override(&mut self, now: i64) -> Result<bool, crate::TreasuryError> {
        let Some(multisig) = self.multisig.as_mut() else {
            return Ok(false);
        };

        if !multisig.ready(now) {
            return Ok(false);
        }

        if let Some(override_proposal) = multisig.pending_override.take() {
            self.policy_config.daily_limit_usd = override_proposal.new_daily_limit_usd;
            self.audit_trail.record(
                AuditKind::OverrideExecuted,
                format!(
                    "daily limit raised to {}",
                    override_proposal.new_daily_limit_usd
                ),
                now,
            );
            return Ok(true);
        }

        Ok(false)
    }

    /// Returns the daily limit after applying the current reputation multiplier.
    pub fn current_reputation_adjusted_daily_limit(&self) -> u64 {
        self.reputation
            .adjusted_limit(self.policy_config.daily_limit_usd)
    }

    /// Pauses or resumes execution. Returns `UnauthorizedOwner` if `owner`
    /// does not match `self.owner`.
    pub fn set_execution_paused(
        &mut self,
        owner: &str,
        paused: bool,
        now: i64,
    ) -> Result<(), crate::TreasuryError> {
        if owner != self.owner {
            return Err(crate::TreasuryError::UnauthorizedOwner);
        }

        self.execution_paused = paused;
        self.agent_state = if paused {
            AgentLifecycleState::Suspended
        } else {
            AgentLifecycleState::Active
        };
        self.last_owner_activity_at = now;
        self.audit_trail.record(
            if paused {
                AuditKind::ExecutionPaused
            } else {
                AuditKind::ExecutionResumed
            },
            if paused {
                "execution paused by owner"
            } else {
                "execution resumed by owner"
            },
            now,
        );
        Ok(())
    }

    /// Cancels and removes the pending transaction. Returns `UnauthorizedOwner`
    /// if `owner` does not match, or `false` if there is nothing pending.
    pub fn cancel_pending(&mut self, owner: &str, now: i64) -> Result<bool, crate::TreasuryError> {
        if owner != self.owner {
            return Err(crate::TreasuryError::UnauthorizedOwner);
        }

        let Some(pending) = self.pop_front_pending() else {
            return Ok(false);
        };

        self.audit_trail.record(
            AuditKind::ProposalCancelled,
            format!("proposal {} cancelled by owner", pending.proposal_id),
            now,
        );

        Ok(true)
    }

    pub fn pending_count(&self) -> usize {
        self.pending_queue
            .len()
            .max(usize::from(self.pending.is_some()))
    }

    pub fn sync_pending_front(&mut self) {
        if self.pending_queue.is_empty() {
            if let Some(pending) = self.pending.take() {
                self.pending_queue.push(pending);
            }
        }
        self.pending = self.pending_queue.first().cloned();
    }

    pub fn push_pending(
        &mut self,
        pending: PendingTransaction,
    ) -> Result<(), crate::TreasuryError> {
        self.sync_pending_front();
        if self.pending_queue.len() >= MAX_PENDING_QUEUE_DEPTH {
            return Err(crate::TreasuryError::PendingTransactionExists);
        }
        self.pending_queue.push(pending);
        self.sync_pending_front();
        Ok(())
    }

    pub fn active_pending(&self) -> Option<&PendingTransaction> {
        self.pending_queue.first().or(self.pending.as_ref())
    }

    pub fn active_pending_mut(&mut self) -> Option<&mut PendingTransaction> {
        self.sync_pending_front();
        self.pending_queue.first_mut()
    }

    pub fn replace_active_pending(&mut self, pending: PendingTransaction) {
        self.sync_pending_front();
        if let Some(front) = self.pending_queue.first_mut() {
            *front = pending;
        } else {
            self.pending_queue.push(pending);
        }
        self.sync_pending_front();
    }

    pub fn set_active_policy_output_fhe_type(
        &mut self,
        fhe_type: u8,
    ) -> Result<(), crate::TreasuryError> {
        let pending = self
            .active_pending_mut()
            .ok_or(crate::TreasuryError::NoPendingTransaction)?;
        pending.policy_output_fhe_type = Some(fhe_type);
        self.sync_pending_front();
        Ok(())
    }

    pub fn pop_front_pending(&mut self) -> Option<PendingTransaction> {
        self.sync_pending_front();
        let pending = if self.pending_queue.is_empty() {
            self.pending.take()
        } else {
            self.pending = None;
            Some(self.pending_queue.remove(0))
        };
        self.sync_pending_front();
        pending
    }

    pub fn remove_pending_by_id(&mut self, proposal_id: u64) -> Option<PendingTransaction> {
        self.sync_pending_front();
        let idx = self
            .pending_queue
            .iter()
            .position(|pending| pending.proposal_id == proposal_id)?;
        self.pending = None;
        let removed = self.pending_queue.remove(idx);
        self.sync_pending_front();
        Some(removed)
    }

    pub fn can_accept_proposal(&mut self, now: i64) -> Result<(), crate::TreasuryError> {
        if check_circuit_breaker_auto_resume(&mut self.execution_paused, &self.circuit_breaker, now)
        {
            self.agent_state = AgentLifecycleState::Active;
            self.audit_trail.record(
                AuditKind::ExecutionResumed,
                "circuit breaker auto-resumed after cooldown",
                now,
            );
        }

        if self.execution_paused || !self.agent_state.permits_new_proposals() {
            return Err(crate::TreasuryError::ExecutionPaused);
        }

        if self.pending_queue.len() >= MAX_PENDING_QUEUE_DEPTH {
            return Err(crate::TreasuryError::PendingTransactionExists);
        }

        Ok(())
    }

    pub fn record_policy_violation(&mut self, now: i64) {
        if register_circuit_breaker_violation(
            &mut self.circuit_breaker,
            &mut self.execution_paused,
            now,
        ) {
            self.agent_state = AgentLifecycleState::Suspended;
            self.audit_trail.record(
                AuditKind::CircuitBreakerTripped,
                format!(
                    "circuit breaker tripped after {} violations in {}s",
                    self.circuit_breaker.config.violation_threshold,
                    self.circuit_breaker.config.window_secs
                ),
                now,
            );
        }
    }

    pub fn transition_agent_state(
        &mut self,
        target: AgentLifecycleState,
        now: i64,
    ) -> Result<(), crate::TreasuryError> {
        ensure_valid_lifecycle_transition(self.agent_state, target, self.pending_count())?;
        self.agent_state = target;
        self.execution_paused = matches!(
            target,
            AgentLifecycleState::Suspended
                | AgentLifecycleState::Decommissioning
                | AgentLifecycleState::Decommissioned
        );
        self.audit_trail.record(
            AuditKind::AgentStateTransitioned,
            format!("agent state -> {}", audit_lifecycle_label(target)),
            now,
        );
        Ok(())
    }

    pub fn propose_ai_rotation(
        &mut self,
        owner: &str,
        new_ai_authority: String,
        now: i64,
    ) -> Result<(), crate::TreasuryError> {
        if owner != self.owner {
            return Err(crate::TreasuryError::UnauthorizedOwner);
        }

        self.pending_ai_rotation = Some(PendingAiRotation::new(
            new_ai_authority.clone(),
            now,
            owner.to_string(),
        ));
        self.last_owner_activity_at = now;
        self.audit_trail.record(
            AuditKind::AiAuthorityRotationProposed,
            format!("ai authority rotation to {new_ai_authority} proposed"),
            now,
        );
        Ok(())
    }

    pub fn execute_ai_rotation(&mut self, now: i64) -> Result<(), crate::TreasuryError> {
        let rotation = self
            .pending_ai_rotation
            .clone()
            .ok_or(crate::TreasuryError::NoActiveOverride)?;
        if now < rotation.executable_after {
            return Err(crate::TreasuryError::TimelockNotElapsed);
        }

        let old_ai = std::mem::replace(&mut self.ai_authority, rotation.new_ai_authority.clone());
        self.pending_ai_rotation = None;
        self.audit_trail.record(
            AuditKind::AiAuthorityRotated,
            format!(
                "ai authority rotated from {} to {}",
                old_ai, rotation.new_ai_authority
            ),
            now,
        );
        Ok(())
    }

    pub fn trigger_dead_mans_switch(&mut self, now: i64) -> Result<(), crate::TreasuryError> {
        let switch = self
            .dead_mans_switch
            .as_mut()
            .ok_or(crate::TreasuryError::NoPendingTransaction)?;
        if !switch.enabled || switch.triggered {
            return Err(crate::TreasuryError::ExecutionPaused);
        }

        let inactivity = now.saturating_sub(self.last_owner_activity_at);
        if inactivity < switch.inactivity_threshold_secs {
            return Err(crate::TreasuryError::TimelockNotElapsed);
        }

        switch.triggered = true;
        switch.triggered_at = Some(now);
        self.execution_paused = true;
        self.agent_state = AgentLifecycleState::Suspended;
        self.audit_trail.record(
            AuditKind::DeadMansSwitchTriggered,
            format!(
                "dead man's switch triggered after {}s inactivity, recovery: {}",
                inactivity, switch.recovery_authority
            ),
            now,
        );
        Ok(())
    }

    pub fn emergency_shutdown(
        &mut self,
        caller: &str,
        recovery_pubkey: String,
        now: i64,
    ) -> Result<(), crate::TreasuryError> {
        let guardian_authorized = self
            .multisig
            .as_ref()
            .is_some_and(|multisig| multisig.guardians.iter().any(|guardian| guardian == caller));
        if caller != self.owner && !guardian_authorized {
            return Err(crate::TreasuryError::UnauthorizedOwner);
        }

        self.sync_pending_front();
        for pending in self.pending_queue.drain(..) {
            self.audit_trail.record(
                AuditKind::ProposalCancelled,
                format!(
                    "proposal {} cancelled by emergency shutdown",
                    pending.proposal_id
                ),
                now,
            );
        }
        self.pending = None;
        self.execution_paused = true;
        self.agent_state = AgentLifecycleState::Decommissioning;
        self.shutdown_initiated_at = Some(now);
        self.shutdown_recovery_pubkey = Some(recovery_pubkey.clone());
        self.audit_trail.record(
            AuditKind::EmergencyShutdown,
            format!("emergency shutdown initiated, recovery: {recovery_pubkey}"),
            now,
        );
        Ok(())
    }

    /// Builds a `PolicyEvaluationContext` for `transaction`, injecting the
    /// current reputation score and swarm pool spend so the policy engine can
    /// apply reputation scaling and shared-pool limit checks.
    pub fn policy_context(&self, transaction: TransactionContext) -> PolicyEvaluationContext {
        PolicyEvaluationContext {
            transaction,
            reputation_score: Some(self.reputation.score()),
            shared_spent_usd: self.swarm.as_ref().map(|swarm| swarm.total_swarm_spent_usd),
        }
    }

    pub fn policy_context_with_shared_spend(
        &self,
        transaction: TransactionContext,
        shared_spent_usd: Option<u64>,
    ) -> PolicyEvaluationContext {
        PolicyEvaluationContext {
            transaction,
            reputation_score: Some(self.reputation.score()),
            shared_spent_usd: shared_spent_usd
                .or_else(|| self.swarm.as_ref().map(|swarm| swarm.total_swarm_spent_usd)),
        }
    }
}
