//! Program IDs, RPC defaults, and field limits mirrored from `aura-core`.

/// Default public Solana devnet RPC URL.
pub const DEVNET_RPC_URL: &str = "https://api.devnet.solana.com";

/// Seed prefix used to derive treasury PDAs.
pub const TREASURY_SEED: &[u8] = aura_core::constants::TREASURY_SEED;

/// Seed prefix used to derive the dWallet CPI authority PDA.
pub const DWALLET_CPI_AUTHORITY_SEED: &[u8] = aura_core::DWALLET_CPI_AUTHORITY_SEED;

/// Seed prefix used to derive the Encrypt CPI authority PDA.
pub const ENCRYPT_CPI_AUTHORITY_SEED: &[u8] = aura_core::ENCRYPT_CPI_AUTHORITY_SEED;

/// Seed prefix used to derive the Encrypt event authority PDA.
pub const ENCRYPT_EVENT_AUTHORITY_SEED: &[u8] = aura_core::ENCRYPT_EVENT_AUTHORITY_SEED;

/// Seed prefix used to derive dWallet message-approval PDAs.
pub const MESSAGE_APPROVAL_SEED: &[u8] = aura_core::MESSAGE_APPROVAL_SEED;

/// Seed prefix used by dWallet account derivation on the Ika dWallet program.
pub const DWALLET_SEED: &[u8] = b"dwallet";

/// Seed prefix used to derive policy receipt PDAs.
pub const POLICY_RECEIPT_SEED: &[u8] = aura_core::constants::POLICY_RECEIPT_SEED;

/// Seed prefix used to derive policy simulation result PDAs.
pub const POLICY_SIMULATION_SEED: &[u8] = aura_core::constants::POLICY_SIMULATION_SEED;

/// Seed prefix used to derive budget envelope PDAs.
pub const BUDGET_ENVELOPE_SEED: &[u8] = aura_core::constants::BUDGET_ENVELOPE_SEED;

/// Seed prefix used to derive exposure group PDAs.
pub const EXPOSURE_GROUP_SEED: &[u8] = aura_core::constants::EXPOSURE_GROUP_SEED;

/// Seed prefix used to derive operator role PDAs.
pub const OPERATOR_ROLE_SEED: &[u8] = aura_core::constants::OPERATOR_ROLE_SEED;

/// Seed prefix used to derive external liveness PDAs.
pub const EXTERNAL_LIVENESS_SEED: &[u8] = aura_core::constants::EXTERNAL_LIVENESS_SEED;

/// Seed prefix used to derive policy attestation PDAs.
pub const POLICY_ATTESTATION_SEED: &[u8] = aura_core::constants::POLICY_ATTESTATION_SEED;

/// Seed prefix used to derive batch proposal PDAs.
pub const BATCH_PROPOSAL_SEED: &[u8] = aura_core::constants::BATCH_PROPOSAL_SEED;

/// Seed prefix used to derive invariant report PDAs.
pub const INVARIANT_REPORT_SEED: &[u8] = aura_core::constants::INVARIANT_REPORT_SEED;

/// Maximum byte length of an agent ID string.
pub const MAX_AGENT_ID_LEN: usize = aura_core::constants::MAX_AGENT_ID_LEN;

/// Maximum byte length of a dWallet ID string.
pub const MAX_DWALLET_ID_LEN: usize = aura_core::constants::MAX_DWALLET_ID_LEN;

/// Maximum byte length of a chain address string.
pub const MAX_ADDRESS_LEN: usize = aura_core::constants::MAX_ADDRESS_LEN;

/// Maximum number of guardians in an emergency multisig.
pub const MAX_GUARDIANS: usize = aura_core::constants::MAX_GUARDIANS;

/// Maximum number of members in an agent swarm.
pub const MAX_SWARM_MEMBERS: usize = aura_core::constants::MAX_SWARM_MEMBERS;

/// Default pending proposal TTL in seconds.
pub const DEFAULT_PENDING_TTL_SECS: i64 = 900;
