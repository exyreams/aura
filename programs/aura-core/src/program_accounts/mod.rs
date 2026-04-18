/// On-chain account serialization layer for `aura-core`.
///
/// This module defines the Anchor `#[account]` struct (`TreasuryAccount`) and
/// a set of flat record types that mirror the domain objects in `state/`. The
/// domain objects use rich Rust types (enums, `String` keys, `BTreeMap`) that
/// cannot be stored directly in a Solana account; the record types replace
/// them with `u8` codes, fixed-length strings, and flat `Vec`s.
///
/// Every record type implements two conversion methods:
/// - `from_domain` — serializes a domain object into the record
/// - `to_domain`   — deserializes a record back into the domain object
///
/// Codec helpers at the bottom of the file (`chain_code`, `chain_from_code`,
/// etc.) handle the `u8` ↔ enum conversions used throughout.
use std::{collections::BTreeMap, str::FromStr};

use anchor_lang::prelude::*;
use aura_policy::{
    Chain, PolicyConfig, PolicyDecision, PolicyState, ReputationPolicy, RuleOutcome,
    TransactionType, ViolationCode,
};

use crate::{
    governance::{EmergencyMultisig, OverrideProposal},
    program_error::{map_treasury_error, AuraCoreError},
    state::{
        AgentReputation, AgentSwarm, AgentTreasury, ConfidentialGuardrails, DWalletCurve,
        DWalletReference, PendingDecryptionRequest, PendingSignatureRequest, PendingTransaction,
        ProposalStatus, ProtocolDeployment, ProtocolFees, SignatureScheme,
    },
};

/// Fixed treasury allocation kept under Solana's 10 KB CPI init/realloc ceiling.
///
/// Sized to accommodate a fully-populated treasury: 6 dWallets, a pending
/// proposal with decryption and signature requests, a multisig with up to 10
/// guardians, a swarm, and a 16-entry rule trace. Validated by the
/// `treasury_account_space_budget_covers_populated_state` test.
pub const TREASURY_ACCOUNT_SPACE: usize = 8 + (8 * 1024);

/// The on-chain Anchor account that persists all treasury state.
///
/// All fields are flat, Anchor-serializable types. Rich domain objects are
/// stored as record structs (e.g. `PolicyConfigRecord`) or `u8` codes.
/// Use `to_domain` to deserialize into an `AgentTreasury` for business logic,
/// and `apply_domain` / `from_domain` to serialize back after mutations.
#[account]
#[derive(InitSpace)]
pub struct TreasuryAccount {
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
    pub pending_transaction_ttl_secs: i64,
    pub policy_config: PolicyConfigRecord,
    pub policy_state: PolicyStateRecord,
    pub confidential_guardrails: Option<ConfidentialGuardrailsRecord>,
    pub reputation: AgentReputationRecord,
    pub fees: ProtocolFeesRecord,
    #[max_len(8)]
    pub dwallets: Vec<DWalletRecord>,
    pub pending: Option<PendingProposalRecord>,
    pub multisig: Option<MultisigConfigRecord>,
    pub swarm: Option<SwarmConfigRecord>,
}

impl TreasuryAccount {
    /// Serializes an `AgentTreasury` domain object into a new `TreasuryAccount`.
    /// `bump` is the PDA bump seed; `updated_at` is the current Unix timestamp.
    pub fn from_domain(bump: u8, domain: &AgentTreasury, updated_at: i64) -> Result<Self> {
        Ok(Self {
            bump,
            owner: parse_pubkey(&domain.owner)?,
            ai_authority: parse_pubkey(&domain.ai_authority)?,
            agent_id: domain.agent_id.clone(),
            created_at: domain.creation_timestamp,
            updated_at,
            next_proposal_id: domain.next_proposal_id,
            total_transactions: domain.total_transactions,
            execution_paused: domain.execution_paused,
            pending_transaction_ttl_secs: domain.pending_transaction_ttl_secs,
            policy_config: PolicyConfigRecord::from_domain(&domain.policy_config),
            policy_state: PolicyStateRecord::from_domain(&domain.policy_state),
            confidential_guardrails: domain
                .confidential_guardrails
                .as_ref()
                .map(ConfidentialGuardrailsRecord::from_domain),
            reputation: AgentReputationRecord::from_domain(&domain.reputation),
            fees: ProtocolFeesRecord::from_domain(&domain.protocol_fees),
            dwallets: domain
                .dwallets
                .values()
                .map(DWalletRecord::from_domain)
                .collect::<Result<Vec<_>>>()?,
            pending: domain
                .pending
                .as_ref()
                .map(PendingProposalRecord::from_domain)
                .transpose()?,
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
        })
    }

    /// Updates this account in-place from a mutated domain object.
    /// Preserves the existing `bump` seed.
    pub fn apply_domain(&mut self, domain: &AgentTreasury, updated_at: i64) -> Result<()> {
        *self = Self::from_domain(self.bump, domain, updated_at)?;
        Ok(())
    }

    /// Deserializes this account into an `AgentTreasury` domain object.
    ///
    /// The `audit_trail` is always empty after deserialization — audit events
    /// are emitted as program logs and are not stored in the account.
    /// The swarm's `shared_pool_limit_usd` is also synced into
    /// `policy_config.shared_pool_limit_usd` so the policy engine sees it.
    pub fn to_domain(&self) -> Result<AgentTreasury> {
        let deployment = ProtocolDeployment::devnet_pre_alpha(crate::ID.to_string())
            .map_err(map_treasury_error)?;

        let mut treasury = AgentTreasury {
            agent_id: self.agent_id.clone(),
            owner: self.owner.to_string(),
            ai_authority: self.ai_authority.to_string(),
            creation_timestamp: self.created_at,
            deployment,
            dwallets: self
                .dwallets
                .iter()
                .map(DWalletRecord::to_domain)
                .collect::<Result<Vec<_>>>()?
                .into_iter()
                .map(|entry| (entry.chain, entry))
                .collect::<BTreeMap<_, _>>(),
            policy_config: self.policy_config.to_domain(),
            policy_state: self.policy_state.to_domain(),
            confidential_guardrails: self
                .confidential_guardrails
                .as_ref()
                .map(ConfidentialGuardrailsRecord::to_domain),
            pending: self
                .pending
                .as_ref()
                .map(PendingProposalRecord::to_domain)
                .transpose()?,
            audit_trail: Default::default(),
            total_transactions: self.total_transactions,
            next_proposal_id: self.next_proposal_id,
            execution_paused: self.execution_paused,
            pending_transaction_ttl_secs: self.pending_transaction_ttl_secs,
            reputation: self.reputation.to_domain(),
            protocol_fees: self.fees.to_domain(),
            multisig: self
                .multisig
                .as_ref()
                .map(MultisigConfigRecord::to_domain)
                .transpose()?,
            swarm: self
                .swarm
                .as_ref()
                .map(SwarmConfigRecord::to_domain)
                .transpose()?,
        };

        if let Some(swarm) = &treasury.swarm {
            treasury.policy_config.shared_pool_limit_usd = Some(swarm.shared_pool_limit_usd);
        }

        Ok(treasury)
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
    pub guardrail_vector_ciphertext: Option<Pubkey>,
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
            guardrail_vector_ciphertext: domain
                .guardrail_vector_ciphertext
                .as_deref()
                .map(parse_pubkey)
                .transpose()
                .expect(
                    "stored confidential guardrail vector ciphertext must be a pubkey when present",
                ),
        }
    }

    pub fn to_domain(&self) -> ConfidentialGuardrails {
        ConfidentialGuardrails {
            daily_limit_ciphertext: self.daily_limit_ciphertext.map(|key| key.to_string()),
            per_tx_limit_ciphertext: self.per_tx_limit_ciphertext.map(|key| key.to_string()),
            spent_today_ciphertext: self.spent_today_ciphertext.map(|key| key.to_string()),
            guardrail_vector_ciphertext: self
                .guardrail_vector_ciphertext
                .map(|key| key.to_string()),
        }
    }
}

/// Serialized form of `DWalletReference`.
/// `chain`, `curve`, and `signature_scheme` are stored as `u8` codes;
/// see `chain_code`, `curve_code`, and `signature_scheme_code`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct DWalletRecord {
    pub chain: u8,
    #[max_len(64)]
    pub dwallet_id: String,
    #[max_len(128)]
    pub address: String,
    pub balance_usd: u64,
    pub dwallet_account: Option<Pubkey>,
    pub authorized_user_pubkey: Option<Pubkey>,
    #[max_len(64)]
    pub message_metadata_digest: Option<String>,
    #[max_len(130)]
    pub public_key_hex: Option<String>,
    pub curve: u8,
    pub signature_scheme: u8,
}

impl DWalletRecord {
    pub fn from_domain(domain: &DWalletReference) -> Result<Self> {
        Ok(Self {
            chain: chain_code(domain.chain),
            dwallet_id: domain.dwallet_id.clone(),
            address: domain.address.clone(),
            balance_usd: domain.balance_usd,
            dwallet_account: domain
                .dwallet_account
                .as_deref()
                .map(parse_pubkey)
                .transpose()?,
            authorized_user_pubkey: domain
                .authorized_user_pubkey
                .as_deref()
                .map(parse_pubkey)
                .transpose()?,
            message_metadata_digest: domain.message_metadata_digest.clone(),
            public_key_hex: domain.public_key_hex.clone(),
            curve: curve_code(domain.curve),
            signature_scheme: signature_scheme_code(domain.signature_scheme),
        })
    }

    pub fn to_domain(&self) -> Result<DWalletReference> {
        Ok(DWalletReference {
            dwallet_id: self.dwallet_id.clone(),
            chain: chain_from_code(self.chain)?,
            address: self.address.clone(),
            balance_usd: self.balance_usd,
            authority: crate::ID.to_string(),
            cpi_authority_seed: "__ika_cpi_authority".to_string(),
            dwallet_account: self.dwallet_account.map(|key| key.to_string()),
            authorized_user_pubkey: self.authorized_user_pubkey.map(|key| key.to_string()),
            message_metadata_digest: self.message_metadata_digest.clone(),
            public_key_hex: self.public_key_hex.clone(),
            curve: curve_from_code(self.curve)?,
            signature_scheme: signature_scheme_from_code(self.signature_scheme)?,
        })
    }
}

/// Serialized form of `PolicyConfig`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PolicyConfigRecord {
    pub daily_limit_usd: u64,
    pub per_tx_limit_usd: u64,
    pub daytime_hourly_limit_usd: u64,
    pub nighttime_hourly_limit_usd: u64,
    pub velocity_limit_usd: u64,
    pub allowed_protocol_bitmap: u64,
    pub max_slippage_bps: u64,
    pub max_quote_age_secs: Option<u64>,
    pub max_counterparty_risk_score: Option<u8>,
    pub bitcoin_manual_review_threshold_usd: u64,
    pub shared_pool_limit_usd: Option<u64>,
    pub reputation_policy: ReputationPolicyRecord,
}

impl PolicyConfigRecord {
    pub fn from_domain(domain: &PolicyConfig) -> Self {
        Self {
            daily_limit_usd: domain.daily_limit_usd,
            per_tx_limit_usd: domain.per_tx_limit_usd,
            daytime_hourly_limit_usd: domain.daytime_hourly_limit_usd,
            nighttime_hourly_limit_usd: domain.nighttime_hourly_limit_usd,
            velocity_limit_usd: domain.velocity_limit_usd,
            allowed_protocol_bitmap: domain.allowed_protocol_bitmap,
            max_slippage_bps: domain.max_slippage_bps,
            max_quote_age_secs: domain.max_quote_age_secs,
            max_counterparty_risk_score: domain.max_counterparty_risk_score,
            bitcoin_manual_review_threshold_usd: domain.bitcoin_manual_review_threshold_usd,
            shared_pool_limit_usd: domain.shared_pool_limit_usd,
            reputation_policy: ReputationPolicyRecord::from_domain(&domain.reputation_policy),
        }
    }

    pub fn to_domain(&self) -> PolicyConfig {
        PolicyConfig {
            daily_limit_usd: self.daily_limit_usd,
            per_tx_limit_usd: self.per_tx_limit_usd,
            daytime_hourly_limit_usd: self.daytime_hourly_limit_usd,
            nighttime_hourly_limit_usd: self.nighttime_hourly_limit_usd,
            velocity_limit_usd: self.velocity_limit_usd,
            allowed_protocol_bitmap: self.allowed_protocol_bitmap,
            max_slippage_bps: self.max_slippage_bps,
            max_quote_age_secs: self.max_quote_age_secs,
            max_counterparty_risk_score: self.max_counterparty_risk_score,
            bitcoin_manual_review_threshold_usd: self.bitcoin_manual_review_threshold_usd,
            shared_pool_limit_usd: self.shared_pool_limit_usd,
            reputation_policy: self.reputation_policy.to_domain(),
        }
    }
}

/// Serialized form of `ReputationPolicy`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct ReputationPolicyRecord {
    pub high_score_threshold: u64,
    pub medium_score_threshold: u64,
    pub high_multiplier_bps: u64,
    pub low_multiplier_bps: u64,
}

impl ReputationPolicyRecord {
    pub fn from_domain(domain: &ReputationPolicy) -> Self {
        Self {
            high_score_threshold: domain.high_score_threshold,
            medium_score_threshold: domain.medium_score_threshold,
            high_multiplier_bps: domain.high_multiplier_bps,
            low_multiplier_bps: domain.low_multiplier_bps,
        }
    }

    pub fn to_domain(&self) -> ReputationPolicy {
        ReputationPolicy {
            high_score_threshold: self.high_score_threshold,
            medium_score_threshold: self.medium_score_threshold,
            high_multiplier_bps: self.high_multiplier_bps,
            low_multiplier_bps: self.low_multiplier_bps,
        }
    }
}

/// Serialized form of `PolicyState` (mutable spending counters).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PolicyStateRecord {
    pub spent_today_usd: u64,
    pub last_reset_timestamp: i64,
    pub hourly_spent_usd: u64,
    pub hourly_bucket_started_at: i64,
    #[max_len(16)]
    pub recent_amounts: Vec<u64>,
}

impl PolicyStateRecord {
    pub fn from_domain(domain: &PolicyState) -> Self {
        Self {
            spent_today_usd: domain.spent_today_usd,
            last_reset_timestamp: domain.last_reset_timestamp,
            hourly_spent_usd: domain.hourly_spent_usd,
            hourly_bucket_started_at: domain.hourly_bucket_started_at,
            recent_amounts: domain.recent_amounts.clone(),
        }
    }

    pub fn to_domain(&self) -> PolicyState {
        PolicyState {
            spent_today_usd: self.spent_today_usd,
            last_reset_timestamp: self.last_reset_timestamp,
            hourly_spent_usd: self.hourly_spent_usd,
            hourly_bucket_started_at: self.hourly_bucket_started_at,
            recent_amounts: self.recent_amounts.clone(),
        }
    }
}

/// Serialized form of a single `RuleOutcome` in the policy trace.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct RuleTraceRecord {
    #[max_len(32)]
    pub rule_name: String,
    pub passed: bool,
    #[max_len(128)]
    pub detail: String,
}

impl RuleTraceRecord {
    pub fn from_domain(domain: &RuleOutcome) -> Self {
        Self {
            rule_name: domain.rule_name.to_string(),
            passed: domain.passed,
            detail: domain.detail.clone(),
        }
    }

    pub fn to_domain(&self) -> RuleOutcome {
        if self.passed {
            RuleOutcome::passed(leak_rule_name(&self.rule_name), self.detail.clone())
        } else {
            RuleOutcome::failed(leak_rule_name(&self.rule_name), self.detail.clone())
        }
    }
}

/// Serialized form of `PolicyDecision`.
/// `violation` is stored as a `u8` code; see `violation_code`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PolicyDecisionRecord {
    pub approved: bool,
    pub violation: u8,
    pub effective_daily_limit_usd: u64,
    pub next_state: PolicyStateRecord,
    #[max_len(16)]
    pub trace: Vec<RuleTraceRecord>,
}

impl PolicyDecisionRecord {
    pub fn from_domain(domain: &PolicyDecision) -> Result<Self> {
        Ok(Self {
            approved: domain.approved,
            violation: violation_code(domain.violation),
            effective_daily_limit_usd: domain.effective_daily_limit_usd,
            next_state: PolicyStateRecord::from_domain(&domain.next_state),
            trace: domain
                .trace
                .iter()
                .map(RuleTraceRecord::from_domain)
                .collect(),
        })
    }

    pub fn to_domain(&self) -> Result<PolicyDecision> {
        Ok(PolicyDecision {
            approved: self.approved,
            violation: violation_from_code(self.violation)?,
            next_state: self.next_state.to_domain(),
            effective_daily_limit_usd: self.effective_daily_limit_usd,
            trace: self.trace.iter().map(RuleTraceRecord::to_domain).collect(),
        })
    }
}

/// Serialized form of `PendingDecryptionRequest`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PendingDecryptionRequestRecord {
    #[max_len(64)]
    pub ciphertext_account: String,
    #[max_len(64)]
    pub request_account: String,
    #[max_len(64)]
    pub expected_digest: String,
    pub requested_at: i64,
    pub verified_at: Option<i64>,
    #[max_len(64)]
    pub plaintext_sha256: Option<String>,
}

impl PendingDecryptionRequestRecord {
    pub fn from_domain(domain: &PendingDecryptionRequest) -> Self {
        Self {
            ciphertext_account: domain.ciphertext_account.clone(),
            request_account: domain.request_account.clone(),
            expected_digest: domain.expected_digest.clone(),
            requested_at: domain.requested_at,
            verified_at: domain.verified_at,
            plaintext_sha256: domain.plaintext_sha256.clone(),
        }
    }

    pub fn to_domain(&self) -> PendingDecryptionRequest {
        PendingDecryptionRequest {
            ciphertext_account: self.ciphertext_account.clone(),
            request_account: self.request_account.clone(),
            expected_digest: self.expected_digest.clone(),
            requested_at: self.requested_at,
            verified_at: self.verified_at,
            plaintext_sha256: self.plaintext_sha256.clone(),
        }
    }
}

/// Serialized form of `PendingSignatureRequest`.
/// `signature_scheme` is stored as a `u8` code; see `signature_scheme_code`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PendingSignatureRequestRecord {
    #[max_len(64)]
    pub dwallet_account: String,
    #[max_len(64)]
    pub message_approval_account: String,
    #[max_len(64)]
    pub approval_id: String,
    #[max_len(64)]
    pub message_digest: String,
    #[max_len(64)]
    pub message_metadata_digest: String,
    pub signature_scheme: u8,
    pub requested_at: i64,
}

impl PendingSignatureRequestRecord {
    pub fn from_domain(domain: &PendingSignatureRequest) -> Self {
        Self {
            dwallet_account: domain.dwallet_account.clone(),
            message_approval_account: domain.message_approval_account.clone(),
            approval_id: domain.approval_id.clone(),
            message_digest: domain.message_digest.clone(),
            message_metadata_digest: domain.message_metadata_digest.clone(),
            signature_scheme: signature_scheme_code(domain.signature_scheme),
            requested_at: domain.requested_at,
        }
    }

    pub fn to_domain(&self) -> Result<PendingSignatureRequest> {
        Ok(PendingSignatureRequest {
            dwallet_account: self.dwallet_account.clone(),
            message_approval_account: self.message_approval_account.clone(),
            approval_id: self.approval_id.clone(),
            message_digest: self.message_digest.clone(),
            message_metadata_digest: self.message_metadata_digest.clone(),
            signature_scheme: signature_scheme_from_code(self.signature_scheme)?,
            requested_at: self.requested_at,
        })
    }
}

/// Serialized form of `PendingTransaction`.
/// `target_chain`, `tx_type`, and `status` are stored as `u8` codes.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PendingProposalRecord {
    pub proposal_id: u64,
    #[max_len(64)]
    pub proposal_digest: String,
    #[max_len(64)]
    pub policy_graph_name: String,
    #[max_len(64)]
    pub policy_output_digest: String,
    #[max_len(64)]
    pub policy_output_ciphertext_account: Option<String>,
    pub policy_output_fhe_type: Option<u8>,
    pub target_chain: u8,
    pub tx_type: u8,
    pub amount_usd: u64,
    #[max_len(128)]
    pub recipient_or_contract: String,
    pub protocol_id: Option<u8>,
    pub submitted_at: i64,
    pub expires_at: i64,
    pub last_updated_at: i64,
    pub execution_attempts: u32,
    pub status: u8,
    pub decryption_request: Option<PendingDecryptionRequestRecord>,
    pub signature_request: Option<PendingSignatureRequestRecord>,
    pub decision: PolicyDecisionRecord,
}

impl PendingProposalRecord {
    pub fn from_domain(domain: &PendingTransaction) -> Result<Self> {
        Ok(Self {
            proposal_id: domain.proposal_id,
            proposal_digest: domain.proposal_digest.clone(),
            policy_graph_name: domain.policy_graph_name.clone(),
            policy_output_digest: domain.policy_output_digest.clone(),
            policy_output_ciphertext_account: domain.policy_output_ciphertext_account.clone(),
            policy_output_fhe_type: domain.policy_output_fhe_type,
            target_chain: chain_code(domain.target_chain),
            tx_type: transaction_type_code(domain.tx_type),
            amount_usd: domain.amount_usd,
            recipient_or_contract: domain.recipient_or_contract.clone(),
            protocol_id: domain.protocol_id,
            submitted_at: domain.submitted_at,
            expires_at: domain.expires_at,
            last_updated_at: domain.last_updated_at,
            execution_attempts: domain.execution_attempts,
            status: proposal_status_code(domain.status),
            decryption_request: domain
                .decryption_request
                .as_ref()
                .map(PendingDecryptionRequestRecord::from_domain),
            signature_request: domain
                .signature_request
                .as_ref()
                .map(PendingSignatureRequestRecord::from_domain),
            decision: PolicyDecisionRecord::from_domain(&domain.decision)?,
        })
    }

    pub fn to_domain(&self) -> Result<PendingTransaction> {
        Ok(PendingTransaction {
            proposal_id: self.proposal_id,
            proposal_digest: self.proposal_digest.clone(),
            policy_graph_name: self.policy_graph_name.clone(),
            policy_output_digest: self.policy_output_digest.clone(),
            policy_output_ciphertext_account: self.policy_output_ciphertext_account.clone(),
            policy_output_fhe_type: self.policy_output_fhe_type,
            target_chain: chain_from_code(self.target_chain)?,
            tx_type: transaction_type_from_code(self.tx_type)?,
            amount_usd: self.amount_usd,
            recipient_or_contract: self.recipient_or_contract.clone(),
            protocol_id: self.protocol_id,
            submitted_at: self.submitted_at,
            expires_at: self.expires_at,
            last_updated_at: self.last_updated_at,
            execution_attempts: self.execution_attempts,
            status: proposal_status_from_code(self.status)?,
            decryption_request: self
                .decryption_request
                .as_ref()
                .map(PendingDecryptionRequestRecord::to_domain),
            signature_request: self
                .signature_request
                .as_ref()
                .map(PendingSignatureRequestRecord::to_domain)
                .transpose()?,
            decision: self.decision.to_domain()?,
        })
    }
}

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

/// Serialized form of `EmergencyMultisig`.
/// Guardian addresses are stored as `Pubkey` values rather than strings.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct MultisigConfigRecord {
    pub required_signatures: u8,
    #[max_len(10)]
    pub guardians: Vec<Pubkey>,
    pub pending_override: Option<PendingOverrideRecord>,
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

/// Maps a `Chain` variant to its `u8` storage code.
pub fn chain_code(chain: Chain) -> u8 {
    match chain {
        Chain::Bitcoin => 0,
        Chain::Ethereum => 1,
        Chain::Solana => 2,
        Chain::Polygon => 3,
        Chain::Arbitrum => 4,
        Chain::Optimism => 5,
    }
}

/// Maps a `TransactionType` variant to its `u8` storage code.
pub fn transaction_type_code(tx_type: TransactionType) -> u8 {
    match tx_type {
        TransactionType::Transfer => 0,
        TransactionType::DeFiSwap => 1,
        TransactionType::LendingDeposit => 2,
        TransactionType::NFTPurchase => 3,
        TransactionType::ContractInteraction => 4,
    }
}

/// Maps a `DWalletCurve` variant to its `u8` storage code.
pub fn curve_code(curve: DWalletCurve) -> u8 {
    match curve {
        DWalletCurve::Secp256k1 => 0,
        DWalletCurve::Secp256r1 => 1,
        DWalletCurve::Ed25519 => 2,
        DWalletCurve::Ristretto => 3,
    }
}

/// Maps a `SignatureScheme` variant to its `u8` storage code.
pub fn signature_scheme_code(scheme: SignatureScheme) -> u8 {
    match scheme {
        SignatureScheme::EcdsaKeccak256 => 0,
        SignatureScheme::EcdsaSha256 => 1,
        SignatureScheme::EcdsaDoubleSha256 => 2,
        SignatureScheme::TaprootSha256 => 3,
        SignatureScheme::EcdsaBlake2b256 => 4,
        SignatureScheme::EddsaSha512 => 5,
        SignatureScheme::SchnorrkelMerlin => 6,
    }
}

/// Maps a `ViolationCode` variant to its `u8` storage code.
pub fn violation_code(violation: ViolationCode) -> u8 {
    match violation {
        ViolationCode::None => 0,
        ViolationCode::PerTransactionLimit => 1,
        ViolationCode::DailyLimit => 2,
        ViolationCode::BitcoinManualReview => 3,
        ViolationCode::TimeWindowLimit => 4,
        ViolationCode::VelocityLimit => 5,
        ViolationCode::ProtocolNotAllowed => 6,
        ViolationCode::SlippageExceeded => 7,
        ViolationCode::QuoteStale => 8,
        ViolationCode::CounterpartyRisk => 9,
        ViolationCode::SharedPoolLimit => 10,
    }
}

/// Maps a `ProposalStatus` variant to its `u8` storage code.
pub fn proposal_status_code(status: ProposalStatus) -> u8 {
    match status {
        ProposalStatus::Proposed => 0,
        ProposalStatus::DecryptionRequested => 1,
        ProposalStatus::SignaturePending => 2,
        ProposalStatus::Executed => 3,
        ProposalStatus::Denied => 4,
        ProposalStatus::Cancelled => 5,
        ProposalStatus::Expired => 6,
    }
}

/// Decodes a `u8` storage code into a `Chain`. Returns `InvalidChain` for unknown codes.
pub fn chain_from_code(code: u8) -> Result<Chain> {
    match code {
        0 => Ok(Chain::Bitcoin),
        1 => Ok(Chain::Ethereum),
        2 => Ok(Chain::Solana),
        3 => Ok(Chain::Polygon),
        4 => Ok(Chain::Arbitrum),
        5 => Ok(Chain::Optimism),
        _ => err!(AuraCoreError::InvalidChain),
    }
}

/// Decodes a `u8` storage code into a `TransactionType`. Returns `InvalidTransactionType` for unknown codes.
pub fn transaction_type_from_code(code: u8) -> Result<TransactionType> {
    match code {
        0 => Ok(TransactionType::Transfer),
        1 => Ok(TransactionType::DeFiSwap),
        2 => Ok(TransactionType::LendingDeposit),
        3 => Ok(TransactionType::NFTPurchase),
        4 => Ok(TransactionType::ContractInteraction),
        _ => err!(AuraCoreError::InvalidTransactionType),
    }
}

/// Decodes a `u8` storage code into a `DWalletCurve`. Returns `InvalidCurve` for unknown codes.
fn curve_from_code(code: u8) -> Result<DWalletCurve> {
    match code {
        0 => Ok(DWalletCurve::Secp256k1),
        1 => Ok(DWalletCurve::Secp256r1),
        2 => Ok(DWalletCurve::Ed25519),
        3 => Ok(DWalletCurve::Ristretto),
        _ => err!(AuraCoreError::InvalidCurve),
    }
}

/// Decodes a `u8` storage code into a `SignatureScheme`. Returns `InvalidSignatureScheme` for unknown codes.
fn signature_scheme_from_code(code: u8) -> Result<SignatureScheme> {
    match code {
        0 => Ok(SignatureScheme::EcdsaKeccak256),
        1 => Ok(SignatureScheme::EcdsaSha256),
        2 => Ok(SignatureScheme::EcdsaDoubleSha256),
        3 => Ok(SignatureScheme::TaprootSha256),
        4 => Ok(SignatureScheme::EcdsaBlake2b256),
        5 => Ok(SignatureScheme::EddsaSha512),
        6 => Ok(SignatureScheme::SchnorrkelMerlin),
        _ => err!(AuraCoreError::InvalidSignatureScheme),
    }
}

/// Decodes a `u8` storage code into a `ViolationCode`. Returns `InvalidViolationCode` for unknown codes.
fn violation_from_code(code: u8) -> Result<ViolationCode> {
    match code {
        0 => Ok(ViolationCode::None),
        1 => Ok(ViolationCode::PerTransactionLimit),
        2 => Ok(ViolationCode::DailyLimit),
        3 => Ok(ViolationCode::BitcoinManualReview),
        4 => Ok(ViolationCode::TimeWindowLimit),
        5 => Ok(ViolationCode::VelocityLimit),
        6 => Ok(ViolationCode::ProtocolNotAllowed),
        7 => Ok(ViolationCode::SlippageExceeded),
        8 => Ok(ViolationCode::QuoteStale),
        9 => Ok(ViolationCode::CounterpartyRisk),
        10 => Ok(ViolationCode::SharedPoolLimit),
        _ => err!(AuraCoreError::InvalidViolationCode),
    }
}

/// Decodes a `u8` storage code into a `ProposalStatus`. Returns `InvalidProposalStatus` for unknown codes.
fn proposal_status_from_code(code: u8) -> Result<ProposalStatus> {
    match code {
        0 => Ok(ProposalStatus::Proposed),
        1 => Ok(ProposalStatus::DecryptionRequested),
        2 => Ok(ProposalStatus::SignaturePending),
        3 => Ok(ProposalStatus::Executed),
        4 => Ok(ProposalStatus::Denied),
        5 => Ok(ProposalStatus::Cancelled),
        6 => Ok(ProposalStatus::Expired),
        _ => err!(AuraCoreError::InvalidProposalStatus),
    }
}

/// Parses a base-58 string into a `Pubkey`. Returns `InvalidDeployment` on failure.
fn parse_pubkey(value: &str) -> Result<Pubkey> {
    Pubkey::from_str(value).map_err(|_| error!(AuraCoreError::InvalidDeployment))
}

/// Leaks a rule name string into a `'static` reference.
///
/// `RuleOutcome` requires a `&'static str` for the rule name, but rule names
/// are stored as owned `String`s in the account. Leaking is acceptable here
/// because rule names are short, bounded in number, and only created during
/// account deserialization.
fn leak_rule_name(rule_name: &str) -> &'static str {
    Box::leak(rule_name.to_string().into_boxed_str())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{audit::AuditKind, state::ProtocolDeployment};

    #[test]
    fn treasury_account_roundtrip_preserves_domain_state() {
        let deployment =
            ProtocolDeployment::devnet_pre_alpha("DKbak7cSattSzqLauaMTYUDFEJu4GTUKFVmjeM7uKNeP")
                .expect("deployment should validate");
        let mut treasury = AgentTreasury::new(
            "agent-01",
            Pubkey::new_unique().to_string(),
            Pubkey::new_unique().to_string(),
            100,
            PolicyConfig::default(),
            deployment,
        );
        treasury
            .register_dwallet(Chain::Ethereum, "dw-01", "0xAURA", 10_000, 100)
            .expect("register should succeed");
        treasury
            .audit_trail
            .record(AuditKind::ProposalCreated, "test", 101);

        let account = TreasuryAccount::from_domain(254, &treasury, 200).expect("serialize");
        let roundtrip = account.to_domain().expect("deserialize");

        assert_eq!(roundtrip.agent_id, treasury.agent_id);
        assert_eq!(roundtrip.owner, treasury.owner);
        assert_eq!(roundtrip.ai_authority, treasury.ai_authority);
        assert_eq!(roundtrip.dwallets.len(), 1);
        assert_eq!(roundtrip.next_proposal_id, treasury.next_proposal_id);
    }

    #[test]
    fn treasury_account_space_budget_covers_populated_state() {
        let deployment =
            ProtocolDeployment::devnet_pre_alpha("DKbak7cSattSzqLauaMTYUDFEJu4GTUKFVmjeM7uKNeP")
                .expect("deployment should validate");
        let mut treasury = AgentTreasury::new(
            "agent-space-budget",
            Pubkey::new_unique().to_string(),
            Pubkey::new_unique().to_string(),
            1_000,
            PolicyConfig {
                shared_pool_limit_usd: Some(500_000),
                ..PolicyConfig::default()
            },
            deployment,
        );

        for (index, chain) in [
            Chain::Bitcoin,
            Chain::Ethereum,
            Chain::Solana,
            Chain::Polygon,
            Chain::Arbitrum,
            Chain::Optimism,
        ]
        .into_iter()
        .enumerate()
        {
            treasury
                .register_dwallet(
                    chain,
                    format!("dw-{index}"),
                    Pubkey::new_unique().to_string(),
                    10_000 + index as u64,
                    1_000 + index as i64,
                )
                .expect("register should succeed");
            treasury
                .configure_dwallet_runtime(
                    chain,
                    Some(Pubkey::new_unique().to_string()),
                    Some(Pubkey::new_unique().to_string()),
                    Some(hex::encode([index as u8; 32])),
                    Some(hex::encode([0xAAu8; 32])),
                    1_010 + index as i64,
                )
                .expect("runtime update should succeed");
        }

        treasury.configure_confidential_guardrails(
            Pubkey::new_unique().to_string(),
            Pubkey::new_unique().to_string(),
            Pubkey::new_unique().to_string(),
            1_100,
        );

        treasury
            .register_dwallet(Chain::Solana, "duplicate", "ignored", 0, 0)
            .err();

        treasury.attach_swarm(
            AgentSwarm::new(
                "swarm-alpha",
                vec![
                    "agent-space-budget".to_string(),
                    "agent-secondary".to_string(),
                ],
                500_000,
            ),
            1_120,
        );
        if let Some(swarm) = treasury.swarm.as_mut() {
            swarm.total_swarm_spent_usd = 25_000;
        }

        treasury.attach_multisig(
            EmergencyMultisig {
                guardians: vec![
                    Pubkey::new_unique().to_string(),
                    Pubkey::new_unique().to_string(),
                    Pubkey::new_unique().to_string(),
                ],
                required_signatures: 2,
                pending_override: Some(OverrideProposal {
                    proposal_id: 77,
                    new_daily_limit_usd: 25_000,
                    signatures_collected: vec![Pubkey::new_unique().to_string()],
                    expiration: 1_500,
                }),
            },
            1_125,
        );

        treasury.pending = Some(PendingTransaction {
            proposal_id: 42,
            proposal_digest: hex::encode([0x11u8; 32]),
            policy_graph_name: "confidential_spend_guardrails".to_string(),
            policy_output_digest: hex::encode([0x22u8; 32]),
            policy_output_ciphertext_account: Some(Pubkey::new_unique().to_string()),
            policy_output_fhe_type: Some(crate::ENCRYPT_FHE_UINT64),
            target_chain: Chain::Solana,
            tx_type: TransactionType::Transfer,
            amount_usd: 250,
            recipient_or_contract: Pubkey::new_unique().to_string(),
            protocol_id: Some(1),
            submitted_at: 1_300,
            expires_at: 2_200,
            last_updated_at: 1_310,
            execution_attempts: 2,
            status: ProposalStatus::SignaturePending,
            decryption_request: Some(PendingDecryptionRequest {
                ciphertext_account: Pubkey::new_unique().to_string(),
                request_account: Pubkey::new_unique().to_string(),
                expected_digest: hex::encode([0x33u8; 32]),
                requested_at: 1_301,
                verified_at: Some(1_302),
                plaintext_sha256: Some(hex::encode([0x44u8; 32])),
            }),
            signature_request: Some(PendingSignatureRequest {
                approval_id: "approval-42".to_string(),
                dwallet_account: Pubkey::new_unique().to_string(),
                message_approval_account: Pubkey::new_unique().to_string(),
                message_digest: hex::encode([0x55u8; 32]),
                message_metadata_digest: hex::encode([0x66u8; 32]),
                signature_scheme: SignatureScheme::EddsaSha512,
                requested_at: 1_303,
            }),
            decision: PolicyDecision {
                approved: true,
                violation: ViolationCode::None,
                next_state: PolicyState::default(),
                effective_daily_limit_usd: 25_000,
                trace: vec![
                    RuleOutcome::passed("daily_limit", "within budget"),
                    RuleOutcome::passed("signature_ready", "message approval requested"),
                ],
            },
        });

        let account = TreasuryAccount::from_domain(7, &treasury, 1_400).expect("serialize");
        let mut buf = Vec::new();
        account.try_serialize(&mut buf).expect("anchor serialize");
        let serialized_len = buf.len();

        assert!(
            8 + serialized_len <= TREASURY_ACCOUNT_SPACE,
            "serialized treasury account exceeded fixed allocation: {} > {}",
            8 + serialized_len,
            TREASURY_ACCOUNT_SPACE
        );
    }
}
