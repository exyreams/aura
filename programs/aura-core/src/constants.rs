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
/// PDA seed for the per-dWallet runtime account: `[seed, treasury, &[chain_code]]`.
pub const DWALLET_STATE_SEED: &[u8] = b"dwallet_state";
/// Maximum asset balances tracked per dWallet.
pub const MAX_ASSETS_PER_WALLET: usize = 16;
/// Maximum number of guardians in an emergency multisig.
pub const MAX_GUARDIANS: usize = 10;
/// Maximum byte length of a swarm ID string.
pub const MAX_SWARM_ID_LEN: usize = 64;
/// Maximum number of agents in a swarm.
pub const MAX_SWARM_MEMBERS: usize = 16;
/// Maximum byte length of a swarm member agent ID string.
pub const MAX_SWARM_MEMBER_LEN: usize = 64;

/// Current treasury account schema version after oracle and chain-binding fields.
pub const CURRENT_SCHEMA_VERSION: u8 = 5;
/// Maximum pending proposals stored in the multi-slot queue.
pub const MAX_PENDING_QUEUE_DEPTH: usize = 3;
/// Activity log PDA seed.
pub const ACTIVITY_LOG_SEED: &[u8] = b"activity_log";
/// Maximum number of on-chain activity records kept in the ring buffer.
pub const ACTIVITY_LOG_MAX_ENTRIES: usize = 128;
/// Shared swarm pool PDA seed.
pub const SWARM_POOL_SEED: &[u8] = b"swarm_pool";
/// Session key PDA seed.
pub const SESSION_KEY_SEED: &[u8] = b"session_key";
/// Address list PDA seed.
pub const ADDRESS_LIST_SEED: &[u8] = b"address_list";
/// Policy history PDA seed.
pub const POLICY_HISTORY_SEED: &[u8] = b"policy_history";
/// Protocol fee vault PDA seed.
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";
/// Chain profile PDA seed: `[seed, &[chain_code]]`.
pub const CHAIN_PROFILE_SEED: &[u8] = b"chain_profile";
/// Compliance oracle PDA seed.
pub const COMPLIANCE_ORACLE_SEED: &[u8] = b"compliance_oracle";
/// Health score PDA seed.
pub const HEALTH_SCORE_SEED: &[u8] = b"health_score";
/// Periodic snapshot PDA seed.
pub const SNAPSHOT_SEED: &[u8] = b"treasury_snapshot";
/// Policy check result PDA seed.
pub const POLICY_CHECK_SEED: &[u8] = b"policy_check";
/// Policy receipt PDA seed.
pub const POLICY_RECEIPT_SEED: &[u8] = b"policy_receipt";
/// Policy simulation result PDA seed.
pub const POLICY_SIMULATION_SEED: &[u8] = b"policy_simulation";
/// Budget envelope PDA seed.
pub const BUDGET_ENVELOPE_SEED: &[u8] = b"budget_envelope";
/// Cross-treasury exposure group PDA seed.
pub const EXPOSURE_GROUP_SEED: &[u8] = b"exposure_group";
/// Operator role PDA seed.
pub const OPERATOR_ROLE_SEED: &[u8] = b"operator_role";
/// External dependency liveness PDA seed.
pub const EXTERNAL_LIVENESS_SEED: &[u8] = b"external_liveness";
/// Policy attestation PDA seed.
pub const POLICY_ATTESTATION_SEED: &[u8] = b"policy_attestation";
/// Batch policy proposal PDA seed.
pub const BATCH_PROPOSAL_SEED: &[u8] = b"batch_proposal";
/// Invariant report PDA seed.
pub const INVARIANT_REPORT_SEED: &[u8] = b"invariant_report";
/// User-defined policy template PDA seed: `[seed, owner, template_id]`.
pub const POLICY_TEMPLATE_SEED: &[u8] = b"policy_template";
/// Maximum byte length of a policy template name.
pub const MAX_TEMPLATE_NAME_LEN: usize = 48;
/// Maximum byte length of a policy template description.
pub const MAX_TEMPLATE_DESC_LEN: usize = 160;
/// Scheduled intent PDA seed: `[seed, treasury, intent_id]`.
pub const SCHEDULED_INTENT_SEED: &[u8] = b"scheduled_intent";
/// Maximum recipients fanned out by one scheduled intent.
pub const MAX_SCHEDULE_RECIPIENTS: usize = 8;
/// Minimum recurrence interval for a scheduled intent (anti-spam floor).
pub const MIN_INTENT_INTERVAL_SECS: i64 = 60;
/// Maximum trigger conditions attached to a proposal or scheduled intent.
pub const MAX_CONDITIONS_PER_PROPOSAL: usize = 4;
/// Conditional (parked) proposal PDA seed: `[seed, treasury, proposal_id]`.
pub const CONDITIONAL_PROPOSAL_SEED: &[u8] = b"conditional_proposal";
/// Maximum scoped budget envelopes per treasury.
pub const MAX_BUDGET_ENVELOPES: usize = 8;
/// Maximum scoped pause entries persisted in policy config.
pub const MAX_SCOPED_PAUSE_ENTRIES: usize = 8;
/// Maximum batch items evaluated by one on-chain batch policy instruction.
pub const MAX_BATCH_ITEMS: usize = 8;
/// Maximum operator roles expected per operational surface.
pub const MAX_OPERATOR_ROLE_PERMISSIONS: usize = 6;
/// AI authority rotation delay.
pub const AI_ROTATION_TIMELOCK_SECS: i64 = 86_400;
/// Timelock applied to dangerous config changes.
pub const CONFIG_CHANGE_TIMELOCK_SECS: i64 = 48 * 3_600;
/// Guardian veto window for pending config changes.
pub const VETO_WINDOW_SECS: i64 = 24 * 3_600;
/// Default owner inactivity threshold for dead man's switch.
pub const DEFAULT_DEAD_MANS_SWITCH_THRESHOLD_SECS: i64 = 90 * 86_400;
/// Staleness threshold for dWallet balance oracle data.
pub const BALANCE_STALE_THRESHOLD_SECS: i64 = 3_600;
/// Minimum time between snapshots.
pub const SNAPSHOT_MIN_INTERVAL_SECS: i64 = 6 * 3_600;
