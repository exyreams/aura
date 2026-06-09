use super::*;

/// Serialized form of `PendingDecryptionRequest`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PendingDecryptionRequestRecord {
    #[max_len(64)]
    pub ciphertext_account: String,
    #[max_len(64)]
    pub request_account: String,
    pub guardrail_epoch_id: Option<u64>,
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
            guardrail_epoch_id: domain.guardrail_epoch_id,
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
            guardrail_epoch_id: self.guardrail_epoch_id,
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct ComplianceMetadataRecord {
    pub purpose_code: u8,
    pub is_cross_border: bool,
    pub requires_reporting: bool,
    pub regulatory_flags: u8,
    pub business_justification_hash: Option<[u8; 32]>,
}

impl ComplianceMetadataRecord {
    pub fn from_domain(domain: &ComplianceMetadata) -> Self {
        Self {
            purpose_code: domain.purpose_code,
            is_cross_border: domain.is_cross_border,
            requires_reporting: domain.requires_reporting,
            regulatory_flags: domain.regulatory_flags,
            business_justification_hash: domain.business_justification_hash,
        }
    }

    pub fn to_domain(&self) -> ComplianceMetadata {
        ComplianceMetadata {
            purpose_code: self.purpose_code,
            is_cross_border: self.is_cross_border,
            requires_reporting: self.requires_reporting,
            regulatory_flags: self.regulatory_flags,
            business_justification_hash: self.business_justification_hash,
        }
    }
}

/// Serialized form of optional chain-native transfer metadata.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct ChainExecutionBindingRecord {
    pub evm_chain_id: Option<u64>,
    pub replay_nonce: Option<u64>,
    pub gas_limit: Option<u64>,
    pub max_fee_native: Option<u128>,
    pub calldata_hash: Option<[u8; 32]>,
    pub utxo_set_hash: Option<[u8; 32]>,
    pub sighash_type: Option<u32>,
    pub solana_recent_blockhash: Option<[u8; 32]>,
    pub solana_message_hash: Option<[u8; 32]>,
    pub confirmations_required: Option<u16>,
}

impl ChainExecutionBindingRecord {
    pub fn from_domain(domain: &ChainExecutionBinding) -> Self {
        Self {
            evm_chain_id: domain.evm_chain_id,
            replay_nonce: domain.replay_nonce,
            gas_limit: domain.gas_limit,
            max_fee_native: domain.max_fee_native,
            calldata_hash: domain.calldata_hash,
            utxo_set_hash: domain.utxo_set_hash,
            sighash_type: domain.sighash_type,
            solana_recent_blockhash: domain.solana_recent_blockhash,
            solana_message_hash: domain.solana_message_hash,
            confirmations_required: domain.confirmations_required,
        }
    }

    pub fn to_domain(&self) -> ChainExecutionBinding {
        ChainExecutionBinding {
            evm_chain_id: self.evm_chain_id,
            replay_nonce: self.replay_nonce,
            gas_limit: self.gas_limit,
            max_fee_native: self.max_fee_native,
            calldata_hash: self.calldata_hash,
            utxo_set_hash: self.utxo_set_hash,
            sighash_type: self.sighash_type,
            solana_recent_blockhash: self.solana_recent_blockhash,
            solana_message_hash: self.solana_message_hash,
            confirmations_required: self.confirmations_required,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct TransferDetailsRecord {
    #[max_len(64)]
    pub asset_id: Option<String>,
    pub native_amount: Option<u128>,
    pub decimals: Option<u8>,
    pub gas_native_amount: Option<u128>,
    #[max_len(64)]
    pub gas_asset_id: Option<String>,
    pub execution_binding: ChainExecutionBindingRecord,
}

impl TransferDetailsRecord {
    pub fn from_domain(domain: &TransferDetails) -> Self {
        Self {
            asset_id: domain.asset_id.clone(),
            native_amount: domain.native_amount,
            decimals: domain.decimals,
            gas_native_amount: domain.gas_native_amount,
            gas_asset_id: domain.gas_asset_id.clone(),
            execution_binding: ChainExecutionBindingRecord::from_domain(&domain.execution_binding),
        }
    }

    pub fn to_domain(&self) -> TransferDetails {
        TransferDetails {
            asset_id: self.asset_id.clone(),
            native_amount: self.native_amount,
            decimals: self.decimals,
            gas_native_amount: self.gas_native_amount,
            gas_asset_id: self.gas_asset_id.clone(),
            execution_binding: self.execution_binding.to_domain(),
        }
    }
}

/// Serialized form of `ApprovalRecord`.
/// The approver is stored as a `Pubkey` rather than a string.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct ApprovalEntryRecord {
    pub approver: Pubkey,
    pub weight: u16,
    pub level: u8,
    pub at: i64,
}

impl ApprovalEntryRecord {
    pub fn from_domain(domain: &crate::state::ApprovalRecord) -> Result<Self> {
        Ok(Self {
            approver: parse_pubkey(&domain.approver)?,
            weight: domain.weight,
            level: domain.level,
            at: domain.at,
        })
    }

    pub fn to_domain(&self) -> crate::state::ApprovalRecord {
        crate::state::ApprovalRecord {
            approver: self.approver.to_string(),
            weight: self.weight,
            level: self.level,
            at: self.at,
        }
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
    pub transfer: TransferDetailsRecord,
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
    pub risk_score: u8,
    pub required_approval_level: u8,
    pub satisfied_approval_level: u8,
    #[max_len(10)]
    pub approvals: Vec<ApprovalEntryRecord>,
    pub earliest_execution_at: i64,
    pub requires_guardian_cosign: bool,
    pub policy_version: u32,
    pub compliance_metadata: Option<ComplianceMetadataRecord>,
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
            transfer: TransferDetailsRecord::from_domain(&domain.transfer),
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
            risk_score: domain.risk_score,
            required_approval_level: domain.required_approval_level,
            satisfied_approval_level: domain.satisfied_approval_level,
            approvals: domain
                .approvals
                .iter()
                .map(ApprovalEntryRecord::from_domain)
                .collect::<Result<Vec<_>>>()?,
            earliest_execution_at: domain.earliest_execution_at,
            requires_guardian_cosign: domain.requires_guardian_cosign,
            policy_version: domain.policy_version,
            compliance_metadata: domain
                .compliance_metadata
                .as_ref()
                .map(ComplianceMetadataRecord::from_domain),
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
            transfer: self.transfer.to_domain(),
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
            risk_score: self.risk_score,
            required_approval_level: self.required_approval_level,
            satisfied_approval_level: self.satisfied_approval_level,
            approvals: self
                .approvals
                .iter()
                .map(ApprovalEntryRecord::to_domain)
                .collect(),
            earliest_execution_at: self.earliest_execution_at,
            requires_guardian_cosign: self.requires_guardian_cosign,
            policy_version: self.policy_version,
            compliance_metadata: self
                .compliance_metadata
                .as_ref()
                .map(ComplianceMetadataRecord::to_domain),
        })
    }
}
