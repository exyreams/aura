/// Domain model types for `aura-core`.
///
/// These are the rich Rust types used for all business logic. They are never
/// stored on-chain directly — `program_accounts/` serializes them into flat
/// Anchor-compatible record structs for on-chain storage.
///
/// Key types:
/// - `AgentTreasury`        — the root domain object; owns all treasury state
/// - `DWalletReference`     — a registered dWallet for one chain
/// - `PendingTransaction`   — the single in-flight proposal slot
/// - `ExecutionReceipt`     — the outcome record produced after execution or denial
/// - `ProtocolDeployment`   — program IDs and endpoints for the active cluster
/// - `ConfidentialGuardrails` — Encrypt ciphertext account addresses for FHE policy
/// - `AgentReputation`      — success/failure counters and score
/// - `AgentSwarm`           — shared-pool configuration for multi-agent groups
/// - `ProtocolFees`         — fee schedule applied to executed transactions
mod agent_treasury;
mod confidential;
mod deployment;
mod dwallet;
mod fees;
mod oracle;
mod pending;
mod receipt;
mod reputation;
mod safety_controls;
mod swarm;
pub mod trust;

pub use agent_treasury::AgentTreasury;
pub use confidential::ConfidentialGuardrails;
pub use deployment::{
    DeploymentCluster, ProtocolDeployment, DWALLET_DEVNET_GRPC_ENDPOINT, DWALLET_DEVNET_PROGRAM_ID,
    ENCRYPT_DEVNET_GRPC_ENDPOINT, ENCRYPT_DEVNET_PROGRAM_ID,
};
pub use dwallet::{
    AssetBalance, DWalletCurve, DWalletReference, DWalletState, DWalletStatus, SignatureScheme,
};
pub use fees::ProtocolFees;
pub use oracle::{OracleFeed, OracleProvider};
pub use pending::{
    ApprovalRecord, ChainExecutionBinding, PendingDecryptionRequest, PendingSignatureRequest,
    PendingTransaction, ProposalStatus, TransferDetails,
};
pub use receipt::ExecutionReceipt;
pub use reputation::AgentReputation;
pub use safety_controls::{
    AgentAuthority, AgentLifecycleState, AgentScope, AgentStats, CircuitBreakerConfig,
    CircuitBreakerState, ComplianceMetadata, ConfigChangeKind, DeadMansSwitch,
    GuardianChangeAction, PendingAiRotation, PendingConfigChange, PendingGuardianChange,
    PendingOwnershipHandover, RecoveryDestination, REG_FLAG_CROSS_BORDER, REG_FLAG_CTR_THRESHOLD,
    REG_FLAG_HIGH_RISK_COUNTERPARTY, REG_FLAG_REQUIRES_KYC,
};
pub use swarm::AgentSwarm;
pub use trust::{BehaviorSignalKind, TrustConfig, TrustTier};
