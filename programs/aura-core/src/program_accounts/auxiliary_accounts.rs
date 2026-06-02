use super::*;

pub const ACTIVITY_LOG_SPACE: usize = 8 + (128 * 220);
// Capped at 64 entries (~9 KiB) so the account can be created in one
// instruction: Solana limits per-instruction account-data growth to 10 KiB,
// and `init` allocates via CPI. Must match `addresses` `#[max_len]` below.
pub const ADDRESS_LIST_SPACE: usize = 8 + (64 * 140);
pub const SESSION_KEY_SPACE: usize = 8 + 512;
pub const POLICY_HISTORY_SPACE: usize = 8 + (16 * 96);

#[account]
#[derive(InitSpace)]
pub struct ActivityLogAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub owner: Pubkey,
    pub total_events: u64,
    pub ring_head: u16,
    pub capacity: u16,
    #[max_len(128)]
    pub events: Vec<ActivityRecord>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct ActivityRecord {
    pub seq: u64,
    pub slot: u64,
    pub timestamp: i64,
    pub kind: u8,
    #[max_len(96)]
    pub detail: String,
    pub proposal_id: Option<u64>,
    pub amount_usd: Option<u64>,
    pub target_chain: Option<u8>,
    pub was_violation: bool,
    pub violation_code: u8,
    pub actor: Pubkey,
}

impl ActivityLogAccount {
    #[allow(clippy::too_many_arguments)]
    pub fn append(
        &mut self,
        event: &AuditEvent,
        slot: u64,
        proposal_id: Option<u64>,
        amount_usd: Option<u64>,
        target_chain: Option<u8>,
        actor: Pubkey,
        violation_code: u8,
    ) {
        let record = ActivityRecord {
            seq: self.total_events,
            slot,
            timestamp: event.timestamp,
            kind: audit_kind_code(&event.kind),
            detail: event.detail.chars().take(96).collect(),
            proposal_id,
            amount_usd,
            target_chain,
            was_violation: violation_code != 0,
            violation_code,
            actor,
        };

        let cap = usize::from(self.capacity.max(1));
        if self.events.len() < cap {
            self.events.push(record);
        } else {
            let idx = usize::from(self.ring_head) % cap;
            self.events[idx] = record;
            self.ring_head = self.ring_head.wrapping_add(1);
        }

        self.total_events = self.total_events.saturating_add(1);
    }
}

#[account]
#[derive(InitSpace)]
pub struct SwarmPoolAccount {
    pub bump: u8,
    pub swarm_id_hash: [u8; 32],
    #[max_len(64)]
    pub swarm_id: String,
    pub creator: Pubkey,
    pub shared_pool_limit_usd: u64,
    pub total_spent_usd: u64,
    pub member_count: u8,
    pub created_at: i64,
    pub last_spend_at: i64,
    #[max_len(16)]
    pub member_spend: Vec<MemberSpendRecord>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct MemberSpendRecord {
    pub treasury: Pubkey,
    pub spent_usd: u64,
    pub last_spend_at: i64,
}

impl SwarmPoolAccount {
    pub fn record_spend(&mut self, treasury: Pubkey, amount_usd: u64, now: i64) {
        self.total_spent_usd = self.total_spent_usd.saturating_add(amount_usd);
        self.last_spend_at = now;
        if let Some(record) = self
            .member_spend
            .iter_mut()
            .find(|record| record.treasury == treasury)
        {
            record.spent_usd = record.spent_usd.saturating_add(amount_usd);
            record.last_spend_at = now;
            return;
        }
        if self.member_spend.len() < 16 {
            self.member_spend.push(MemberSpendRecord {
                treasury,
                spent_usd: amount_usd,
                last_spend_at: now,
            });
            self.member_count = self.member_spend.len() as u8;
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct SessionKeyAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub session_key: Pubkey,
    pub issued_by: Pubkey,
    pub issued_at: i64,
    pub expires_at: i64,
    pub revoked: bool,
    pub max_amount_usd_per_tx: Option<u64>,
    pub max_daily_spend_usd: Option<u64>,
    pub session_spent_today_usd: u64,
    pub session_last_reset: i64,
    #[max_len(8)]
    pub allowed_chains: Vec<u8>,
    #[max_len(8)]
    pub allowed_tx_types: Vec<u8>,
    pub max_proposal_count: Option<u32>,
    pub proposals_submitted: u32,
}

impl SessionKeyAccount {
    pub fn allows(&self, amount_usd: u64, chain: u8, tx_type: u8, now: i64) -> bool {
        if self.revoked || now >= self.expires_at {
            return false;
        }
        if self
            .max_amount_usd_per_tx
            .is_some_and(|limit| amount_usd > limit)
        {
            return false;
        }
        if !self.allowed_chains.is_empty() && !self.allowed_chains.contains(&chain) {
            return false;
        }
        if !self.allowed_tx_types.is_empty() && !self.allowed_tx_types.contains(&tx_type) {
            return false;
        }
        if self
            .max_proposal_count
            .is_some_and(|limit| self.proposals_submitted >= limit)
        {
            return false;
        }
        if self
            .max_daily_spend_usd
            .is_some_and(|limit| self.session_spent_today_usd.saturating_add(amount_usd) > limit)
        {
            return false;
        }
        true
    }
}

#[account]
#[derive(InitSpace)]
pub struct AddressListAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub mode: u8,
    pub chain: u8,
    pub entry_count: u16,
    pub updated_at: i64,
    #[max_len(64, 128)]
    pub addresses: Vec<String>,
}

#[account]
#[derive(InitSpace)]
pub struct PolicyHistoryAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub version_count: u32,
    pub ring_head: u8,
    #[max_len(16)]
    pub snapshots: Vec<PolicySnapshotRecord>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PolicySnapshotRecord {
    pub version: u32,
    pub effective_at: i64,
    pub changed_by: Pubkey,
    pub daily_limit_usd: u64,
    pub per_tx_limit_usd: u64,
    pub daytime_hourly_limit_usd: u64,
    pub nighttime_hourly_limit_usd: u64,
    pub velocity_limit_usd: u64,
    pub snapshot_digest: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct FeeVaultAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub protocol_fee_recipient: Pubkey,
    pub accumulated_fees_lamports: u64,
    pub total_fees_collected_usd: u64,
    pub last_collection_at: i64,
    pub fee_count: u64,
}

#[account]
#[derive(InitSpace)]
pub struct ComplianceOracleAccount {
    pub bump: u8,
    pub authority: Pubkey,
    pub sanctions_root: [u8; 32],
    pub last_updated_at: i64,
    pub update_count: u64,
}

#[account]
#[derive(InitSpace)]
pub struct PolicyCheckResult {
    pub bump: u8,
    pub caller: Pubkey,
    pub checked_at_slot: u64,
    pub approved: bool,
    pub violation_code: u8,
    pub risk_score: u8,
    pub effective_daily_limit_usd: u64,
    pub remaining_daily_budget_usd: u64,
}

#[account]
#[derive(InitSpace)]
pub struct HealthScoreAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub score: u8,
    pub last_updated_at: i64,
    pub last_updated_slot: u64,
    pub reputation_score: u8,
    pub policy_utilization_score: u8,
    pub violation_rate_score: u8,
    pub operational_score: u8,
    pub liquidity_score: u8,
    pub execution_paused: bool,
    pub circuit_breaker_active: bool,
    pub pending_queue_depth: u8,
    pub days_since_last_violation: u32,
}

#[account]
#[derive(InitSpace)]
pub struct SnapshotAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub snapshot_index: u32,
    pub taken_at: i64,
    pub taken_at_slot: u64,
    pub taken_by: Pubkey,
    pub total_transactions: u64,
    pub total_volume_usd: u64,
    pub spent_today_usd: u64,
    pub seven_day_volume_usd: u64,
    pub daily_limit_usd: u64,
    pub per_tx_limit_usd: u64,
    pub reputation_score: u8,
    pub health_score: u8,
    pub registered_dwallet_count: u8,
    pub pending_proposal_count: u8,
    pub schema_version: u8,
}

pub fn audit_kind_code(kind: &AuditKind) -> u8 {
    match kind {
        AuditKind::TreasuryCreated => 0,
        AuditKind::DWalletRegistered => 1,
        AuditKind::ConfidentialGuardrailsConfigured => 2,
        AuditKind::ProposalCreated => 3,
        AuditKind::ProposalCancelled => 4,
        AuditKind::ProposalExpired => 5,
        AuditKind::DecryptionRequested => 6,
        AuditKind::DecryptionVerified => 7,
        AuditKind::ProposalDenied => 8,
        AuditKind::SignatureRequested => 9,
        AuditKind::SignatureCommitted => 10,
        AuditKind::ProposalExecuted => 11,
        AuditKind::ExecutionPaused => 12,
        AuditKind::ExecutionResumed => 13,
        AuditKind::MultisigAttached => 14,
        AuditKind::SwarmAttached => 15,
        AuditKind::OverrideExecuted => 16,
        AuditKind::AiAuthorityRotationProposed => 17,
        AuditKind::AiAuthorityRotated => 18,
        AuditKind::ConfigChangeProposed => 19,
        AuditKind::ConfigChangeExecuted => 20,
        AuditKind::ConfigChangeVetoed => 21,
        AuditKind::CircuitBreakerTripped => 22,
        AuditKind::CircuitBreakerReset => 23,
        AuditKind::SessionKeyIssued => 24,
        AuditKind::SessionKeyRevoked => 25,
        AuditKind::DeadMansSwitchTriggered => 26,
        AuditKind::AgentStateTransitioned => 27,
        AuditKind::GuardianAdded => 28,
        AuditKind::GuardianRemoved => 29,
        AuditKind::EmergencyShutdown => 30,
        AuditKind::FeeCollected => 31,
        AuditKind::SnapshotTaken => 32,
        AuditKind::SwarmPoolJoined => 33,
        AuditKind::BalanceRefreshed => 34,
        AuditKind::CheckWarned => 35,
        AuditKind::CheckDegraded => 36,
        AuditKind::RecoveryDestinationSet => 37,
        AuditKind::BreakGlassRecovered => 38,
        AuditKind::CustodyTransferred => 39,
        AuditKind::TrustTierEscalated => 40,
        AuditKind::TrustTierDeescalated => 41,
        AuditKind::TrustLockdownEngaged => 42,
        AuditKind::TrustRestored => 43,
        AuditKind::AgentRegistered => 44,
        AuditKind::AgentRevoked => 45,
        AuditKind::OwnershipHandoverNominated => 46,
        AuditKind::OwnershipHandoverExecuted => 47,
    }
}

pub fn swarm_pool_seeds(swarm_id: &str) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    Sha256::digest(swarm_id.as_bytes()).into()
}

pub fn verify_merkle_inclusion(root: &[u8; 32], leaf: &[u8; 32], proof: &[[u8; 32]]) -> bool {
    use sha2::{Digest, Sha256};

    let mut current = *leaf;
    for sibling in proof {
        let mut hasher = Sha256::new();
        if current <= *sibling {
            hasher.update(current);
            hasher.update(sibling);
        } else {
            hasher.update(sibling);
            hasher.update(current);
        }
        current = hasher.finalize().into();
    }
    &current == root
}

pub fn sha256_address(address: &str) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    Sha256::digest(address.as_bytes()).into()
}

pub fn snapshot_policy_config(
    history: &mut PolicyHistoryAccount,
    config: &PolicyConfig,
    changed_by: Pubkey,
    now: i64,
) {
    use sha2::{Digest, Sha256};

    let digest_input = format!(
        "{}:{}:{}:{}:{}:{:?}:{:?}",
        config.daily_limit_usd,
        config.per_tx_limit_usd,
        config.daytime_hourly_limit_usd,
        config.nighttime_hourly_limit_usd,
        config.velocity_limit_usd,
        config.weekly_limit_usd,
        config.monthly_limit_usd
    );
    let snapshot = PolicySnapshotRecord {
        version: history.version_count.saturating_add(1),
        effective_at: now,
        changed_by,
        daily_limit_usd: config.daily_limit_usd,
        per_tx_limit_usd: config.per_tx_limit_usd,
        daytime_hourly_limit_usd: config.daytime_hourly_limit_usd,
        nighttime_hourly_limit_usd: config.nighttime_hourly_limit_usd,
        velocity_limit_usd: config.velocity_limit_usd,
        snapshot_digest: Sha256::digest(digest_input.as_bytes()).into(),
    };

    if history.snapshots.len() < 16 {
        history.snapshots.push(snapshot);
    } else {
        let idx = usize::from(history.ring_head) % 16;
        history.snapshots[idx] = snapshot;
        history.ring_head = history.ring_head.wrapping_add(1);
    }
    history.version_count = history.version_count.saturating_add(1);
}

pub fn update_health_score(
    health: &mut HealthScoreAccount,
    treasury: Pubkey,
    domain: &AgentTreasury,
    now: i64,
    slot: u64,
) {
    let reputation = (domain.reputation.score() as u16 * 25 / 100).min(25);
    let utilization_pct = if domain.policy_config.daily_limit_usd > 0 {
        domain.policy_state.spent_today_usd.saturating_mul(100)
            / domain.policy_config.daily_limit_usd
    } else {
        0
    };
    let utilization = (100u16.saturating_sub(utilization_pct.min(100) as u16)) * 25 / 100;
    let total = domain.reputation.total_transactions.max(1);
    let fail_rate = domain.reputation.failed_transactions.saturating_mul(100) / total;
    let violation = (100u16.saturating_sub(fail_rate.min(100) as u16)) * 25 / 100;
    let mut operational = 25u16;
    if domain.execution_paused {
        operational = operational.saturating_sub(15);
    }
    if domain.circuit_breaker.total_trips > 0 {
        operational = operational.saturating_sub(10);
    }
    let liquidity = domain
        .dwallets
        .values()
        .map(|dwallet| dwallet.balance_usd)
        .sum::<u64>()
        .saturating_mul(100)
        / domain.policy_config.daily_limit_usd.max(1);
    let liquidity_score = liquidity.min(100) as u8;

    health.treasury = treasury;
    health.reputation_score = reputation as u8;
    health.policy_utilization_score = utilization as u8;
    health.violation_rate_score = violation as u8;
    health.operational_score = operational as u8;
    health.liquidity_score = liquidity_score;
    health.score = (reputation + utilization + violation + operational).min(100) as u8;
    health.execution_paused = domain.execution_paused;
    health.circuit_breaker_active = domain
        .circuit_breaker
        .last_trip_at
        .is_some_and(|trip| now.saturating_sub(trip) < 3_600);
    health.pending_queue_depth = domain.pending_count() as u8;
    health.days_since_last_violation = 0;
    health.last_updated_at = now;
    health.last_updated_slot = slot;
}
