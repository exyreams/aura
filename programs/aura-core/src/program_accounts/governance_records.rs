use super::*;

/// Serialized form of `AgentReputation`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct AgentReputationRecord {
    pub total_transactions: u64,
    pub successful_transactions: u64,
    pub failed_transactions: u64,
    pub total_volume_usd: u64,
}

impl AgentReputationRecord {
    pub fn from_domain(domain: &AgentReputation) -> Self {
        Self {
            total_transactions: domain.total_transactions,
            successful_transactions: domain.successful_transactions,
            failed_transactions: domain.failed_transactions,
            total_volume_usd: domain.total_volume_usd,
        }
    }

    pub fn to_domain(&self) -> AgentReputation {
        AgentReputation {
            total_transactions: self.total_transactions,
            successful_transactions: self.successful_transactions,
            failed_transactions: self.failed_transactions,
            total_volume_usd: self.total_volume_usd,
        }
    }
}

/// Serialized form of `ProtocolFees`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct ProtocolFeesRecord {
    pub treasury_creation_fee_usd: u64,
    pub transaction_fee_bps: u64,
    pub fhe_subsidy_bps: u64,
}

impl ProtocolFeesRecord {
    pub fn from_domain(domain: &ProtocolFees) -> Self {
        Self {
            treasury_creation_fee_usd: domain.treasury_creation_fee_usd,
            transaction_fee_bps: domain.transaction_fee_bps,
            fhe_subsidy_bps: domain.fhe_subsidy_bps,
        }
    }

    pub fn to_domain(&self) -> ProtocolFees {
        ProtocolFees {
            treasury_creation_fee_usd: self.treasury_creation_fee_usd,
            transaction_fee_bps: self.transaction_fee_bps,
            fhe_subsidy_bps: self.fhe_subsidy_bps,
        }
    }
}

/// Serialized form of `OverrideProposal`.
/// Guardian addresses are stored as `Pubkey` values rather than strings.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PendingOverrideRecord {
    pub proposal_id: u64,
    pub new_daily_limit_usd: u64,
    #[max_len(10)]
    pub signatures_collected: Vec<Pubkey>,
    pub expiration: i64,
}

impl PendingOverrideRecord {
    pub fn from_domain(domain: &OverrideProposal) -> Result<Self> {
        Ok(Self {
            proposal_id: domain.proposal_id,
            new_daily_limit_usd: domain.new_daily_limit_usd,
            signatures_collected: domain
                .signatures_collected
                .iter()
                .map(|guardian| parse_pubkey(guardian))
                .collect::<Result<Vec<_>>>()?,
            expiration: domain.expiration,
        })
    }

    pub fn to_domain(&self) -> OverrideProposal {
        OverrideProposal {
            proposal_id: self.proposal_id,
            new_daily_limit_usd: self.new_daily_limit_usd,
            signatures_collected: self
                .signatures_collected
                .iter()
                .map(ToString::to_string)
                .collect(),
            expiration: self.expiration,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PendingGuardianChangeRecord {
    pub action: u8,
    pub target_guardian: Pubkey,
    #[max_len(10)]
    pub signatures: Vec<Pubkey>,
    pub proposed_at: i64,
    pub expires_at: i64,
}

impl PendingGuardianChangeRecord {
    pub fn from_domain(domain: &PendingGuardianChange) -> Result<Self> {
        Ok(Self {
            action: guardian_change_action_code(domain.action),
            target_guardian: parse_pubkey(&domain.target_guardian)?,
            signatures: domain
                .signatures
                .iter()
                .map(|guardian| parse_pubkey(guardian))
                .collect::<Result<Vec<_>>>()?,
            proposed_at: domain.proposed_at,
            expires_at: domain.expires_at,
        })
    }

    pub fn to_domain(&self) -> Result<PendingGuardianChange> {
        Ok(PendingGuardianChange {
            action: guardian_change_action_from_code(self.action)?,
            target_guardian: self.target_guardian.to_string(),
            signatures: self.signatures.iter().map(ToString::to_string).collect(),
            proposed_at: self.proposed_at,
            expires_at: self.expires_at,
        })
    }
}

/// Serialized form of `EmergencyMultisig`.
/// Guardian addresses are stored as `Pubkey` values rather than strings.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct MultisigConfigRecord {
    pub required_signatures: u8,
    #[max_len(10)]
    pub guardians: Vec<Pubkey>,
    pub pending_override: Option<PendingOverrideRecord>,
    pub pending_guardian_change: Option<PendingGuardianChangeRecord>,
}

impl MultisigConfigRecord {
    pub fn from_domain(domain: &EmergencyMultisig) -> Result<Self> {
        Ok(Self {
            required_signatures: domain.required_signatures as u8,
            guardians: domain
                .guardians
                .iter()
                .map(|guardian| parse_pubkey(guardian))
                .collect::<Result<Vec<_>>>()?,
            pending_override: domain
                .pending_override
                .as_ref()
                .map(PendingOverrideRecord::from_domain)
                .transpose()?,
            pending_guardian_change: domain
                .pending_guardian_change
                .as_ref()
                .map(PendingGuardianChangeRecord::from_domain)
                .transpose()?,
        })
    }

    pub fn to_domain(&self) -> Result<EmergencyMultisig> {
        Ok(EmergencyMultisig {
            required_signatures: self.required_signatures as usize,
            guardians: self.guardians.iter().map(ToString::to_string).collect(),
            pending_override: self
                .pending_override
                .as_ref()
                .map(PendingOverrideRecord::to_domain),
            pending_guardian_change: self
                .pending_guardian_change
                .as_ref()
                .map(PendingGuardianChangeRecord::to_domain)
                .transpose()?,
        })
    }
}

/// Serialized form of `AgentSwarm`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct SwarmConfigRecord {
    #[max_len(64)]
    pub swarm_id: String,
    #[max_len(16, 64)]
    pub member_agents: Vec<String>,
    pub shared_pool_limit_usd: u64,
    pub total_swarm_spent_usd: u64,
}

impl SwarmConfigRecord {
    pub fn from_domain(domain: &AgentSwarm) -> Result<Self> {
        Ok(Self {
            swarm_id: domain.swarm_id.clone(),
            member_agents: domain.member_agents.clone(),
            shared_pool_limit_usd: domain.shared_pool_limit_usd,
            total_swarm_spent_usd: domain.total_swarm_spent_usd,
        })
    }

    pub fn to_domain(&self) -> Result<AgentSwarm> {
        Ok(AgentSwarm {
            swarm_id: self.swarm_id.clone(),
            member_agents: self.member_agents.clone(),
            shared_pool_limit_usd: self.shared_pool_limit_usd,
            total_swarm_spent_usd: self.total_swarm_spent_usd,
        })
    }
}
