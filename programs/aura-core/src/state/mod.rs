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
mod pending;
mod receipt;
mod reputation;
mod swarm;

pub use agent_treasury::AgentTreasury;
pub use confidential::ConfidentialGuardrails;
pub use deployment::{
    DWalletMessageApprovalLayout, DeploymentCluster, ProtocolDeployment,
    DWALLET_DEVNET_GRPC_ENDPOINT, DWALLET_DEVNET_PROGRAM_ID, ENCRYPT_DEVNET_GRPC_ENDPOINT,
    ENCRYPT_DEVNET_PROGRAM_ID,
};
pub use dwallet::{DWalletCurve, DWalletReference, SignatureScheme};
pub use fees::ProtocolFees;
pub use pending::{
    PendingDecryptionRequest, PendingSignatureRequest, PendingTransaction, ProposalStatus,
};
pub use receipt::ExecutionReceipt;
pub use reputation::AgentReputation;
pub use swarm::AgentSwarm;
