//! Program-wide constants for field length limits and collection caps.
//!
//! These values are referenced by both the Anchor `#[max_len]` attributes in
//! `program_accounts/` and by validation logic elsewhere. Keeping them here
//! avoids magic numbers scattered across the codebase.

/// PDA seed for treasury accounts: `[TREASURY_SEED, owner, agent_id]`.
pub const TREASURY_SEED: &[u8] = b"treasury";

/// Maximum byte length of an agent ID string.
pub const MAX_AGENT_ID_LEN: usize = 64;
/// Maximum byte length of a dWallet ID string.
pub const MAX_DWALLET_ID_LEN: usize = 64;
/// Maximum byte length of a chain address string (e.g. `0x…` EVM address).
pub const MAX_ADDRESS_LEN: usize = 128;
/// Maximum byte length of a policy graph name string.
pub const MAX_PENDING_GRAPH_NAME_LEN: usize = 64;
/// Maximum byte length of a hex-encoded 32-byte digest string (64 hex chars).
pub const MAX_DIGEST_HEX_LEN: usize = 64;
/// Maximum byte length of a recipient or contract address string.
pub const MAX_RECIPIENT_LEN: usize = 128;
/// Maximum number of rule outcomes stored in a policy decision trace.
pub const MAX_TRACE_ITEMS: usize = 16;
/// Maximum byte length of a rule name string in the trace.
pub const MAX_TRACE_RULE_NAME_LEN: usize = 32;
/// Maximum byte length of a rule detail string in the trace.
pub const MAX_TRACE_DETAIL_LEN: usize = 128;
/// Maximum number of dWallets that can be registered on one treasury (one per chain).
pub const MAX_DWALLETS: usize = 8;
/// Maximum number of guardians in an emergency multisig.
pub const MAX_GUARDIANS: usize = 10;
/// Maximum byte length of a swarm ID string.
pub const MAX_SWARM_ID_LEN: usize = 64;
/// Maximum number of agents in a swarm.
pub const MAX_SWARM_MEMBERS: usize = 16;
/// Maximum byte length of a swarm member agent ID string.
pub const MAX_SWARM_MEMBER_LEN: usize = 64;
