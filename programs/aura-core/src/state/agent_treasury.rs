use std::collections::BTreeMap;

use aura_policy::{Chain, PolicyConfig, PolicyEvaluationContext, PolicyState, TransactionContext};

use crate::{
    audit::{AuditKind, AuditTrail},
    governance::EmergencyMultisig,
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
    /// Append-only log of all treasury actions (not persisted on-chain).
    pub audit_trail: AuditTrail,
    /// Total number of proposals that have been executed.
    pub total_transactions: u64,
    /// Monotonically increasing counter used to assign proposal IDs.
    pub next_proposal_id: u64,
    /// When `true`, `propose_transaction` and `execute_pending` are blocked.
    pub execution_paused: bool,
    /// How long (in seconds) a pending transaction remains valid before expiring.
    pub pending_transaction_ttl_secs: i64,
    /// Agent reputation counters used for limit scaling.
    pub reputation: AgentReputation,
    /// Protocol fee schedule applied to executed transactions.
    pub protocol_fees: ProtocolFees,
    /// Optional emergency multisig for guardian override proposals.
    pub multisig: Option<EmergencyMultisig>,
    /// Optional swarm shared-pool configuration.
    pub swarm: Option<AgentSwarm>,
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
            audit_trail,
            total_transactions: 0,
            next_proposal_id: 1,
            execution_paused: false,
            pending_transaction_ttl_secs: 900,
            reputation: AgentReputation::default(),
            protocol_fees: ProtocolFees::default(),
            multisig: None,
            swarm: None,
        }
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
            guardrail_vector_ciphertext: None,
        });

        self.audit_trail.record(
            AuditKind::ConfidentialGuardrailsConfigured,
            "confidential guardrails configured",
            timestamp,
        );
    }

    /// Configures vector FHE guardrails using a single `EUint64Vector`
    /// ciphertext. Replaces any existing guardrails configuration.
    pub fn configure_confidential_vector_guardrails(
        &mut self,
        guardrail_vector_ciphertext: impl Into<String>,
        timestamp: i64,
    ) {
        self.confidential_guardrails = Some(ConfidentialGuardrails {
            daily_limit_ciphertext: None,
            per_tx_limit_ciphertext: None,
            spent_today_ciphertext: None,
            guardrail_vector_ciphertext: Some(guardrail_vector_ciphertext.into()),
        });

        self.audit_trail.record(
            AuditKind::ConfidentialGuardrailsConfigured,
            "confidential vector guardrails configured",
            timestamp,
        );
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

        let Some(pending) = self.pending.take() else {
            return Ok(false);
        };

        self.audit_trail.record(
            AuditKind::ProposalCancelled,
            format!("proposal {} cancelled by owner", pending.proposal_id),
            now,
        );

        Ok(true)
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
}
