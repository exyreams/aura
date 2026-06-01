use super::*;

pub fn chain_code(chain: Chain) -> u8 {
    match chain {
        Chain::Bitcoin => 0,
        Chain::Ethereum => 1,
        Chain::Solana => 2,
        Chain::Polygon => 3,
        Chain::Arbitrum => 4,
        Chain::Optimism => 5,
        Chain::Custom(code) => code,
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
        ViolationCode::WeeklyLimit => 11,
        ViolationCode::MonthlyLimit => 12,
        ViolationCode::RecipientDailyLimit => 13,
        ViolationCode::RecipientPerTransactionLimit => 14,
        ViolationCode::AnomalyDetected => 15,
        ViolationCode::CooldownNotElapsed => 16,
        ViolationCode::BudgetEnvelopeDailyLimit => 17,
        ViolationCode::BudgetEnvelopeWeeklyLimit => 18,
        ViolationCode::ApprovalLadderDenied => 19,
        ViolationCode::ExecutionScopePaused => 20,
        ViolationCode::ExternalDependencyStale => 21,
        ViolationCode::PolicyAttestationMissing => 22,
        ViolationCode::EmptyBatch => 23,
        ViolationCode::BatchTooLarge => 24,
        ViolationCode::ExposureGroupLimitExceeded => 25,
        ViolationCode::PendingExecutionTimelockActive => 26,
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
        ProposalStatus::AwaitingCondition => 7,
        ProposalStatus::Triggered => 8,
        ProposalStatus::Signed => 9,
        ProposalStatus::Broadcast => 10,
        ProposalStatus::Settled => 11,
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
        6..=254 => Ok(Chain::Custom(code)),
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
pub(crate) fn curve_from_code(code: u8) -> Result<DWalletCurve> {
    match code {
        0 => Ok(DWalletCurve::Secp256k1),
        1 => Ok(DWalletCurve::Secp256r1),
        2 => Ok(DWalletCurve::Ed25519),
        3 => Ok(DWalletCurve::Ristretto),
        _ => err!(AuraCoreError::InvalidCurve),
    }
}

/// Decodes a `u8` storage code into a `SignatureScheme`. Returns `InvalidSignatureScheme` for unknown codes.
pub(crate) fn signature_scheme_from_code(code: u8) -> Result<SignatureScheme> {
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
pub(crate) fn violation_from_code(code: u8) -> Result<ViolationCode> {
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
        11 => Ok(ViolationCode::WeeklyLimit),
        12 => Ok(ViolationCode::MonthlyLimit),
        13 => Ok(ViolationCode::RecipientDailyLimit),
        14 => Ok(ViolationCode::RecipientPerTransactionLimit),
        15 => Ok(ViolationCode::AnomalyDetected),
        16 => Ok(ViolationCode::CooldownNotElapsed),
        17 => Ok(ViolationCode::BudgetEnvelopeDailyLimit),
        18 => Ok(ViolationCode::BudgetEnvelopeWeeklyLimit),
        19 => Ok(ViolationCode::ApprovalLadderDenied),
        20 => Ok(ViolationCode::ExecutionScopePaused),
        21 => Ok(ViolationCode::ExternalDependencyStale),
        22 => Ok(ViolationCode::PolicyAttestationMissing),
        23 => Ok(ViolationCode::EmptyBatch),
        24 => Ok(ViolationCode::BatchTooLarge),
        25 => Ok(ViolationCode::ExposureGroupLimitExceeded),
        26 => Ok(ViolationCode::PendingExecutionTimelockActive),
        _ => err!(AuraCoreError::InvalidViolationCode),
    }
}

pub fn lifecycle_state_code(state: AgentLifecycleState) -> u8 {
    match state {
        AgentLifecycleState::Provisioning => 0,
        AgentLifecycleState::Active => 1,
        AgentLifecycleState::Suspended => 2,
        AgentLifecycleState::Decommissioning => 3,
        AgentLifecycleState::Decommissioned => 4,
    }
}

pub fn lifecycle_state_from_code(code: u8) -> Result<AgentLifecycleState> {
    match code {
        0 => Ok(AgentLifecycleState::Provisioning),
        1 => Ok(AgentLifecycleState::Active),
        2 => Ok(AgentLifecycleState::Suspended),
        3 => Ok(AgentLifecycleState::Decommissioning),
        4 => Ok(AgentLifecycleState::Decommissioned),
        _ => err!(AuraCoreError::InvalidStateTransition),
    }
}

pub(crate) fn config_change_kind_code(kind: ConfigChangeKind) -> u8 {
    match kind {
        ConfigChangeKind::PolicyLimits => 0,
        ConfigChangeKind::MultisigGuardians => 1,
        ConfigChangeKind::ConfidentialGuardrails => 2,
        ConfigChangeKind::SwarmConfiguration => 3,
        ConfigChangeKind::VetoAuthority => 4,
    }
}

pub(crate) fn config_change_kind_from_code(code: u8) -> Result<ConfigChangeKind> {
    match code {
        0 => Ok(ConfigChangeKind::PolicyLimits),
        1 => Ok(ConfigChangeKind::MultisigGuardians),
        2 => Ok(ConfigChangeKind::ConfidentialGuardrails),
        3 => Ok(ConfigChangeKind::SwarmConfiguration),
        4 => Ok(ConfigChangeKind::VetoAuthority),
        _ => err!(AuraCoreError::InvalidStateTransition),
    }
}

pub(crate) fn guardian_change_action_code(action: GuardianChangeAction) -> u8 {
    match action {
        GuardianChangeAction::Add => 0,
        GuardianChangeAction::Remove => 1,
    }
}

pub(crate) fn guardian_change_action_from_code(code: u8) -> Result<GuardianChangeAction> {
    match code {
        0 => Ok(GuardianChangeAction::Add),
        1 => Ok(GuardianChangeAction::Remove),
        _ => err!(AuraCoreError::InvalidStateTransition),
    }
}

pub(crate) fn anomaly_action_code(action: AnomalyAction) -> u8 {
    match action {
        AnomalyAction::Deny => 0,
        AnomalyAction::FlagForReview => 1,
        AnomalyAction::RequireGuardianCosign => 2,
    }
}

pub(crate) fn anomaly_action_from_code(code: u8) -> Result<AnomalyAction> {
    match code {
        0 => Ok(AnomalyAction::Deny),
        1 => Ok(AnomalyAction::FlagForReview),
        2 => Ok(AnomalyAction::RequireGuardianCosign),
        _ => err!(AuraCoreError::InvalidStateTransition),
    }
}

/// Decodes a `u8` storage code into a `ProposalStatus`. Returns `InvalidProposalStatus` for unknown codes.
pub(crate) fn proposal_status_from_code(code: u8) -> Result<ProposalStatus> {
    match code {
        0 => Ok(ProposalStatus::Proposed),
        1 => Ok(ProposalStatus::DecryptionRequested),
        2 => Ok(ProposalStatus::SignaturePending),
        3 => Ok(ProposalStatus::Executed),
        4 => Ok(ProposalStatus::Denied),
        5 => Ok(ProposalStatus::Cancelled),
        6 => Ok(ProposalStatus::Expired),
        7 => Ok(ProposalStatus::AwaitingCondition),
        8 => Ok(ProposalStatus::Triggered),
        9 => Ok(ProposalStatus::Signed),
        10 => Ok(ProposalStatus::Broadcast),
        11 => Ok(ProposalStatus::Settled),
        _ => err!(AuraCoreError::InvalidProposalStatus),
    }
}

/// Parses a base-58 string into a `Pubkey`. Returns `InvalidDeployment` on failure.
pub(crate) fn parse_pubkey(value: &str) -> Result<Pubkey> {
    Pubkey::from_str(value).map_err(|_| error!(AuraCoreError::InvalidDeployment))
}

/// Leaks a rule name string into a `'static` reference.
///
/// `RuleOutcome` requires a `&'static str` for the rule name, but rule names
/// are stored as owned `String`s in the account. Leaking is acceptable here
/// because rule names are short, bounded in number, and only created during
/// account deserialization.
pub(crate) fn leak_rule_name(rule_name: &str) -> &'static str {
    Box::leak(rule_name.to_string().into_boxed_str())
}
