use super::*;

/// Fixed treasury allocation kept at Solana's 10 KiB CPI init/realloc ceiling.
///
/// Sized to accommodate a fully-populated treasury: 6 dWallets, a pending
/// proposal with decryption and signature requests, a multisig with up to 10
/// guardians, a swarm, and a 16-entry rule trace. Validated by the
/// treasury_account_space_budget_covers_populated_state test.
pub const TREASURY_ACCOUNT_SPACE: usize = 10 * 1024;

/// The on-chain Anchor account that persists all treasury state.
///
/// All fields are flat, Anchor-serializable types. Rich domain objects are
/// stored as record structs or u8 codes. Use to_domain to deserialize into an
/// AgentTreasury for business logic,
/// and `apply_domain` / `from_domain` to serialize back after mutations.
#[account]
#[derive(InitSpace)]
pub struct TreasuryAccount {
    pub schema_version: u8,
    pub bump: u8,
    pub owner: Pubkey,
    pub ai_authority: Pubkey,
    #[max_len(64)]
    pub agent_id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub next_proposal_id: u64,
    pub total_transactions: u64,
    pub execution_paused: bool,
    pub agent_state: u8,
    pub pending_transaction_ttl_secs: i64,
    pub current_policy_version: u32,
    pub policy_config: PolicyConfigRecord,
    pub policy_state: PolicyStateRecord,
    pub confidential_guardrails: Option<ConfidentialGuardrailsRecord>,
    pub pending_ai_rotation: Option<PendingAiRotationRecord>,
    pub pending_config_change: Option<PendingConfigChangeRecord>,
    pub circuit_breaker: CircuitBreakerRecord,
    pub last_owner_activity_at: i64,
    pub dead_mans_switch: Option<DeadMansSwitchRecord>,
    pub high_risk_threshold: u8,
    pub high_risk_require_guardian: bool,
    pub last_large_tx_at: Option<i64>,
    pub last_large_tx_amount_usd: u64,
    #[max_len(64)]
    pub parent_treasury: Option<String>,
    #[max_len(16, 64)]
    pub child_agents: Vec<String>,
    pub child_spend_budget_usd: Option<u64>,
    pub sanctions_check_enabled: bool,
    pub compliance_oracle: Option<Pubkey>,
    pub shutdown_initiated_at: Option<i64>,
    pub shutdown_recovery_pubkey: Option<Pubkey>,
    pub last_snapshot_at: Option<i64>,
    pub reputation: AgentReputationRecord,
    pub fees: ProtocolFeesRecord,
    #[max_len(8)]
    pub dwallets: Vec<DWalletRecord>,
    #[max_len(3)]
    pub pending_queue: Vec<PendingProposalRecord>,
    pub multisig: Option<MultisigConfigRecord>,
    pub swarm: Option<SwarmConfigRecord>,
    /// Preferred execution chain ("primary"). Appended last so pre-v3 accounts
    /// read it back as `None` from the zero-padded allocation.
    pub default_chain: Option<u8>,
    /// Per-chain cold-wallet recovery destinations. Appended after default_chain
    /// so existing accounts deserialize this as an empty Vec.
    #[max_len(8)]
    pub recovery_destinations: Vec<RecoveryDestinationRecord>,
}

impl TreasuryAccount {
    /// Serializes an `AgentTreasury` domain object into a new `TreasuryAccount`.
    /// `bump` is the PDA bump seed; `updated_at` is the current Unix timestamp.
    #[cfg(not(target_os = "solana"))]
    pub fn from_domain(bump: u8, domain: &AgentTreasury, updated_at: i64) -> Result<Self> {
        Ok(Self {
            schema_version: crate::constants::CURRENT_SCHEMA_VERSION,
            bump,
            owner: parse_pubkey(&domain.owner)?,
            ai_authority: parse_pubkey(&domain.ai_authority)?,
            agent_id: domain.agent_id.clone(),
            created_at: domain.creation_timestamp,
            updated_at,
            next_proposal_id: domain.next_proposal_id,
            total_transactions: domain.total_transactions,
            execution_paused: domain.execution_paused,
            agent_state: lifecycle_state_code(domain.agent_state),
            pending_transaction_ttl_secs: domain.pending_transaction_ttl_secs,
            current_policy_version: domain.current_policy_version,
            policy_config: PolicyConfigRecord::from_domain(&domain.policy_config),
            policy_state: PolicyStateRecord::from_domain(&domain.policy_state),
            confidential_guardrails: domain
                .confidential_guardrails
                .as_ref()
                .map(ConfidentialGuardrailsRecord::from_domain),
            pending_ai_rotation: domain
                .pending_ai_rotation
                .as_ref()
                .map(PendingAiRotationRecord::from_domain)
                .transpose()?,
            pending_config_change: domain
                .pending_config_change
                .as_ref()
                .map(PendingConfigChangeRecord::from_domain)
                .transpose()?,
            circuit_breaker: CircuitBreakerRecord::from_domain(&domain.circuit_breaker),
            last_owner_activity_at: domain.last_owner_activity_at,
            dead_mans_switch: domain
                .dead_mans_switch
                .as_ref()
                .map(DeadMansSwitchRecord::from_domain)
                .transpose()?,
            high_risk_threshold: domain.high_risk_threshold,
            high_risk_require_guardian: domain.high_risk_require_guardian,
            last_large_tx_at: domain.last_large_tx_at,
            last_large_tx_amount_usd: domain.last_large_tx_amount_usd,
            parent_treasury: domain.parent_treasury.clone(),
            child_agents: domain.child_agents.clone(),
            child_spend_budget_usd: domain.child_spend_budget_usd,
            sanctions_check_enabled: domain.sanctions_check_enabled,
            compliance_oracle: domain
                .compliance_oracle
                .as_deref()
                .map(parse_pubkey)
                .transpose()?,
            shutdown_initiated_at: domain.shutdown_initiated_at,
            shutdown_recovery_pubkey: domain
                .shutdown_recovery_pubkey
                .as_deref()
                .map(parse_pubkey)
                .transpose()?,
            last_snapshot_at: domain.last_snapshot_at,
            reputation: AgentReputationRecord::from_domain(&domain.reputation),
            fees: ProtocolFeesRecord::from_domain(&domain.protocol_fees),
            dwallets: domain
                .dwallets
                .values()
                .map(DWalletRecord::from_domain)
                .collect::<Result<Vec<_>>>()?,
            pending_queue: pending_records_from_domain(domain)?,
            multisig: domain
                .multisig
                .as_ref()
                .map(MultisigConfigRecord::from_domain)
                .transpose()?,
            swarm: domain
                .swarm
                .as_ref()
                .map(SwarmConfigRecord::from_domain)
                .transpose()?,
            default_chain: domain.default_chain.map(chain_code),
            recovery_destinations: domain
                .recovery_destinations
                .iter()
                .map(RecoveryDestinationRecord::from_domain)
                .collect(),
        })
    }

    /// Updates this account in-place from a mutated domain object.
    /// Preserves the existing `bump` seed.
    pub fn apply_domain(&mut self, domain: &AgentTreasury, updated_at: i64) -> Result<()> {
        self.schema_version = crate::constants::CURRENT_SCHEMA_VERSION;
        self.owner = parse_pubkey(&domain.owner)?;
        self.ai_authority = parse_pubkey(&domain.ai_authority)?;
        self.agent_id = domain.agent_id.clone();
        self.created_at = domain.creation_timestamp;
        self.updated_at = updated_at;
        self.next_proposal_id = domain.next_proposal_id;
        self.total_transactions = domain.total_transactions;
        self.execution_paused = domain.execution_paused;
        self.agent_state = lifecycle_state_code(domain.agent_state);
        self.pending_transaction_ttl_secs = domain.pending_transaction_ttl_secs;
        self.current_policy_version = domain.current_policy_version;
        self.policy_config = PolicyConfigRecord::from_domain(&domain.policy_config);
        self.policy_state = PolicyStateRecord::from_domain(&domain.policy_state);
        self.confidential_guardrails = domain
            .confidential_guardrails
            .as_ref()
            .map(ConfidentialGuardrailsRecord::from_domain);
        self.pending_ai_rotation = domain
            .pending_ai_rotation
            .as_ref()
            .map(PendingAiRotationRecord::from_domain)
            .transpose()?;
        self.pending_config_change = domain
            .pending_config_change
            .as_ref()
            .map(PendingConfigChangeRecord::from_domain)
            .transpose()?;
        self.circuit_breaker = CircuitBreakerRecord::from_domain(&domain.circuit_breaker);
        self.last_owner_activity_at = domain.last_owner_activity_at;
        self.dead_mans_switch = domain
            .dead_mans_switch
            .as_ref()
            .map(DeadMansSwitchRecord::from_domain)
            .transpose()?;
        self.high_risk_threshold = domain.high_risk_threshold;
        self.high_risk_require_guardian = domain.high_risk_require_guardian;
        self.last_large_tx_at = domain.last_large_tx_at;
        self.last_large_tx_amount_usd = domain.last_large_tx_amount_usd;
        self.parent_treasury = domain.parent_treasury.clone();
        self.child_agents = domain.child_agents.clone();
        self.child_spend_budget_usd = domain.child_spend_budget_usd;
        self.sanctions_check_enabled = domain.sanctions_check_enabled;
        self.compliance_oracle = domain
            .compliance_oracle
            .as_deref()
            .map(parse_pubkey)
            .transpose()?;
        self.shutdown_initiated_at = domain.shutdown_initiated_at;
        self.shutdown_recovery_pubkey = domain
            .shutdown_recovery_pubkey
            .as_deref()
            .map(parse_pubkey)
            .transpose()?;
        self.last_snapshot_at = domain.last_snapshot_at;
        self.reputation = AgentReputationRecord::from_domain(&domain.reputation);
        self.fees = ProtocolFeesRecord::from_domain(&domain.protocol_fees);
        self.dwallets = domain
            .dwallets
            .values()
            .map(DWalletRecord::from_domain)
            .collect::<Result<Vec<_>>>()?;
        self.pending_queue = pending_records_from_domain(domain)?;
        self.multisig = domain
            .multisig
            .as_ref()
            .map(MultisigConfigRecord::from_domain)
            .transpose()?;
        self.swarm = domain
            .swarm
            .as_ref()
            .map(SwarmConfigRecord::from_domain)
            .transpose()?;
        self.default_chain = domain.default_chain.map(chain_code);
        self.recovery_destinations = domain
            .recovery_destinations
            .iter()
            .map(RecoveryDestinationRecord::from_domain)
            .collect();
        Ok(())
    }

    /// Deserializes this account into an `AgentTreasury` domain object.
    ///
    /// The `audit_trail` is always empty after deserialization — audit events
    /// are emitted as program logs and are not stored in the account.
    /// The swarm's `shared_pool_limit_usd` is also synced into
    /// `policy_config.shared_pool_limit_usd` so the policy engine sees it.
    pub fn to_domain_boxed(&self) -> Result<Box<AgentTreasury>> {
        let deployment = ProtocolDeployment::devnet_pre_alpha(crate::ID.to_string())
            .map_err(map_treasury_error)?;

        let mut treasury = Box::new(AgentTreasury::new(
            self.agent_id.clone(),
            self.owner.to_string(),
            self.ai_authority.to_string(),
            self.created_at,
            self.policy_config.to_domain(),
            deployment,
        ));

        self.fill_domain_runtime(treasury.as_mut())?;
        self.fill_domain_controls(treasury.as_mut())?;
        self.fill_domain_relationships(treasury.as_mut())?;

        Ok(treasury)
    }

    #[inline(never)]
    fn fill_domain_runtime(&self, treasury: &mut AgentTreasury) -> Result<()> {
        treasury.dwallets = self
            .dwallets
            .iter()
            .map(DWalletRecord::to_domain)
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .map(|entry| (entry.chain, entry))
            .collect::<BTreeMap<_, _>>();
        treasury.policy_state = self.policy_state.to_domain();
        treasury.confidential_guardrails = self
            .confidential_guardrails
            .as_ref()
            .map(ConfidentialGuardrailsRecord::to_domain);
        treasury.pending_queue = self
            .pending_queue
            .iter()
            .map(PendingProposalRecord::to_domain)
            .collect::<Result<Vec<_>>>()?;
        treasury.audit_trail = Default::default();
        treasury.total_transactions = self.total_transactions;
        treasury.next_proposal_id = self.next_proposal_id;
        treasury.execution_paused = self.execution_paused;
        treasury.pending_transaction_ttl_secs = self.pending_transaction_ttl_secs;
        treasury.current_policy_version = self.current_policy_version.max(1);
        treasury.reputation = self.reputation.to_domain();
        treasury.protocol_fees = self.fees.to_domain();
        Ok(())
    }

    #[inline(never)]
    fn fill_domain_controls(&self, treasury: &mut AgentTreasury) -> Result<()> {
        treasury.agent_state = lifecycle_state_from_code(self.agent_state)?;
        treasury.pending_ai_rotation = self
            .pending_ai_rotation
            .as_ref()
            .map(PendingAiRotationRecord::to_domain)
            .transpose()?;
        treasury.pending_config_change = self
            .pending_config_change
            .as_ref()
            .map(PendingConfigChangeRecord::to_domain)
            .transpose()?;
        treasury.circuit_breaker = self.circuit_breaker.to_domain();
        treasury.last_owner_activity_at = self.last_owner_activity_at;
        treasury.dead_mans_switch = self
            .dead_mans_switch
            .as_ref()
            .map(DeadMansSwitchRecord::to_domain)
            .transpose()?;
        treasury.high_risk_threshold = self.high_risk_threshold;
        treasury.high_risk_require_guardian = self.high_risk_require_guardian;
        treasury.last_large_tx_at = self.last_large_tx_at;
        treasury.last_large_tx_amount_usd = self.last_large_tx_amount_usd;
        treasury.sanctions_check_enabled = self.sanctions_check_enabled;
        Ok(())
    }

    #[inline(never)]
    fn fill_domain_relationships(&self, treasury: &mut AgentTreasury) -> Result<()> {
        treasury.parent_treasury = self.parent_treasury.clone();
        treasury.child_agents = self.child_agents.clone();
        treasury.child_spend_budget_usd = self.child_spend_budget_usd;
        treasury.compliance_oracle = self.compliance_oracle.map(|key| key.to_string());
        treasury.shutdown_initiated_at = self.shutdown_initiated_at;
        treasury.shutdown_recovery_pubkey =
            self.shutdown_recovery_pubkey.map(|key| key.to_string());
        treasury.last_snapshot_at = self.last_snapshot_at;
        treasury.multisig = self
            .multisig
            .as_ref()
            .map(MultisigConfigRecord::to_domain)
            .transpose()?;
        treasury.swarm = self
            .swarm
            .as_ref()
            .map(SwarmConfigRecord::to_domain)
            .transpose()?;
        treasury.default_chain = self.default_chain.map(chain_from_code).transpose()?;
        treasury.recovery_destinations = self
            .recovery_destinations
            .iter()
            .map(RecoveryDestinationRecord::to_domain)
            .collect::<Result<Vec<_>>>()?;
        if let Some(swarm) = &treasury.swarm {
            treasury.policy_config.shared_pool_limit_usd = Some(swarm.shared_pool_limit_usd);
        }
        treasury.sync_pending_front();
        Ok(())
    }

    pub fn to_domain(&self) -> Result<AgentTreasury> {
        self.to_domain_boxed().map(|treasury| *treasury)
    }
}

fn pending_records_from_domain(domain: &AgentTreasury) -> Result<Vec<PendingProposalRecord>> {
    if domain.pending_queue.is_empty() {
        return domain
            .pending
            .as_ref()
            .map(PendingProposalRecord::from_domain)
            .transpose()
            .map(|record| record.into_iter().collect());
    }

    domain
        .pending_queue
        .iter()
        .map(PendingProposalRecord::from_domain)
        .collect::<Result<Vec<_>>>()
}
