//! Re-exports of the real program and policy types.

pub use aura_core::program_events::{
    ExecutionLifecycleEvent, ProposalLifecycleEvent, TreasuryAuditEvent,
};
pub use aura_core::{
    AgentReputation, AgentSwarm, AgentTreasury, ApplyPolicyPresetArgs, ApprovePendingExecutionArgs,
    AttestPolicyArgs, AuditEvent, AuditKind, BatchProposalItemArgs, CheckInvariantsArgs,
    ConfidentialGuardrails, ConfigureApprovalLadderArgs, ConfigureBudgetEnvelopeArgs,
    ConfigureLivenessGuardrailsArgs, ConfigureMultisigArgs, ConfigureSwarmArgs, CreateTreasuryArgs,
    DWalletCurve, DWalletReference, EmergencyMultisig, ExecutionReceipt, GrantOperatorRoleArgs,
    InitExposureGroupArgs, InitExternalLivenessArgs, OverrideProposal, PendingDecryptionRequest,
    PendingSignatureRequest, PendingTransaction, PolicyConfigRecord, PolicyStateRecord,
    ProposalStatus, ProposeBatchArgs, ProposeConfidentialTransactionArgs, ProposeTransactionArgs,
    ProtocolDeployment, ProtocolFees, ProtocolFeesRecord, RefreshExternalLivenessArgs,
    RegisterDwalletArgs, SetScopedPauseArgs, SignatureScheme, SimulatePolicyArgs,
    SwarmConfigRecord, TreasuryAccount, WritePolicyReceiptArgs,
};
pub use aura_policy::{
    AnomalyAction, AnomalyConfig, ApprovalLadder, ApprovalLevel, BatchPolicyDecision,
    BatchProposalItem, BudgetEnvelope, BudgetEnvelopeScope, BudgetEnvelopeSet, Chain,
    CooldownConfig, ExternalDependency, LivenessConfig, PauseScope, PolicyConfig, PolicyConfigDiff,
    PolicyDecision, PolicyDecisionReceiptFields, PolicyGraphSpec, PolicyPresetKind, PolicyState,
    RecipientLimit, ReputationPolicy, RiskFactor, RuleOutcome, ScopedPauseControls,
    ScopedPauseEntry, TransactionContext, TransactionType, TransactionTypeScope, ViolationCode,
};
