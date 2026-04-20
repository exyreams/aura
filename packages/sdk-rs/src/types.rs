//! Re-exports of the real program and policy types.

pub use aura_core::program_events::{
    ExecutionLifecycleEvent, ProposalLifecycleEvent, TreasuryAuditEvent,
};
pub use aura_core::{
    AgentReputation, AgentSwarm, AgentTreasury, AuditEvent, AuditKind, ConfidentialGuardrails,
    ConfigureMultisigArgs, ConfigureSwarmArgs, CreateTreasuryArgs, DWalletCurve, DWalletReference,
    EmergencyMultisig, ExecutionReceipt, OverrideProposal, PendingDecryptionRequest,
    PendingSignatureRequest, PendingTransaction, PolicyConfigRecord, PolicyStateRecord,
    ProposalStatus, ProposeConfidentialTransactionArgs, ProposeTransactionArgs, ProtocolDeployment,
    ProtocolFees, ProtocolFeesRecord, RegisterDwalletArgs, SignatureScheme, SwarmConfigRecord,
    TreasuryAccount,
};
pub use aura_policy::{
    Chain, PolicyConfig, PolicyDecision, PolicyState, ReputationPolicy, RuleOutcome,
    TransactionContext, TransactionType, ViolationCode,
};
